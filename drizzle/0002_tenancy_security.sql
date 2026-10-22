-- Tenancy, append-only enforcement, the System user, grants and job functions (hand-written, reviewed).
--
-- Business-unit isolation (D-32): withTenant() in lib/server/db/tenant.ts sets these per transaction with
-- set_config(..., true), so they vanish at COMMIT or ROLLBACK and never leak between pooled requests:
--   app.user_id, app.business_unit_id, app.scope ('all' | 'own'), app.owner_emails (comma-separated),
--   app.platform_admin ('on' | 'off')
-- Missing or blank settings read as NULL/false, so a query without a tenant context sees no tenant rows.
-- These policies guard against application bugs (a forgotten filter); the repositories filter as well.

CREATE FUNCTION app_bu() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.business_unit_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_scope_all() RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT coalesce(current_setting('app.scope', true), '') = 'all' $$;
--> statement-breakpoint
CREATE FUNCTION app_owner_emails() RETURNS text[] LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT coalesce(string_to_array(lower(NULLIF(current_setting('app.owner_emails', true), '')), ','), '{}'::text[]) $$;
--> statement-breakpoint
CREATE FUNCTION app_platform_admin() RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT coalesce(current_setting('app.platform_admin', true), '') = 'on' $$;
--> statement-breakpoint

-- Append-only tables: no UPDATE, DELETE or TRUNCATE. The application role is not granted those privileges
-- either; this trigger is the second layer and also binds the owner. The only exception is the purge function
-- (Phase 7), which runs as the owner with app.allow_purge = 'on' and may DELETE (never UPDATE).
CREATE FUNCTION forbid_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'demandai_owner' AND coalesce(current_setting('app.allow_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER user_role_history_append_only BEFORE UPDATE OR DELETE ON user_role_history FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER user_role_history_no_truncate BEFORE TRUNCATE ON user_role_history FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint

-- The System user: created_by of imports and jobs. kind = 'system' cannot hold a password (users_system_has_no_password).
INSERT INTO users (id, email, display_name, kind, status, created_by, updated_by)
VALUES ('00000000-0000-0000-0000-000000000001', 'system@demandai.invalid', 'System', 'system', 'active',
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');
--> statement-breakpoint

-- Row-level security on business-unit data. Global tables (users, business_units, user_owner_aliases,
-- user_role_history) are scoped by the repositories instead: sign-in reads users before any unit is chosen.
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY jobs_business_unit ON jobs
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
ALTER TABLE config_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY config_versions_business_unit ON config_versions
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
-- Memberships: a unit's own members, a user's own memberships (to choose a unit after sign-in), or the platform admin.
ALTER TABLE business_unit_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY business_unit_members_read ON business_unit_members FOR SELECT
  USING (business_unit_id = app_bu() OR user_id = app_user() OR app_platform_admin());
--> statement-breakpoint
CREATE POLICY business_unit_members_insert ON business_unit_members FOR INSERT
  WITH CHECK (business_unit_id = app_bu() OR app_platform_admin());
--> statement-breakpoint
CREATE POLICY business_unit_members_update ON business_unit_members FOR UPDATE
  USING (business_unit_id = app_bu() OR app_platform_admin()) WITH CHECK (business_unit_id = app_bu() OR app_platform_admin());
--> statement-breakpoint
-- Audit: read your unit's entries (platform-level entries only as platform admin); write only as yourself.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_read ON audit_log FOR SELECT
  USING (business_unit_id = app_bu() OR (business_unit_id IS NULL AND app_platform_admin()));
--> statement-breakpoint
CREATE POLICY audit_log_insert ON audit_log FOR INSERT
  WITH CHECK (actor_user_id = app_user() AND (business_unit_id IS NULL OR business_unit_id = app_bu()));
--> statement-breakpoint

-- Grants for the runtime role: data access only, no DDL, and no DELETE anywhere users or history live.
GRANT SELECT, INSERT, UPDATE ON users, business_units, business_unit_members, jobs, config_versions TO demandai_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON user_owner_aliases TO demandai_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON user_role_history, audit_log TO demandai_app;
--> statement-breakpoint

-- Job queue. The worker claims across business units, which row-level security would hide from the app role,
-- so claiming and recovery run as the owner through these two functions; the job itself then runs inside the
-- job's own business-unit context.
CREATE FUNCTION claim_job(p_worker text, p_kinds text[] DEFAULT NULL) RETURNS SETOF jobs
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE jobs SET status = 'running', locked_at = now(), locked_by = p_worker, attempts = attempts + 1,
                  started_at = coalesce(started_at, now()), updated_at = now()
  WHERE id = (
    SELECT id FROM jobs
    WHERE status = 'queued' AND run_after <= now() AND (p_kinds IS NULL OR kind = ANY (p_kinds))
    ORDER BY run_after, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1)
  RETURNING *;
$$;
--> statement-breakpoint
-- Jobs left running by a process that died: back to the queue while attempts remain, otherwise failed.
CREATE FUNCTION recover_stale_jobs(p_older_than interval) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  UPDATE jobs SET
    status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
    error_code = CASE WHEN attempts < max_attempts THEN error_code ELSE 'abandoned' END,
    finished_at = CASE WHEN attempts < max_attempts THEN NULL ELSE now() END,
    locked_at = NULL, locked_by = NULL, updated_at = now()
  WHERE status = 'running' AND locked_at < now() - p_older_than;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION claim_job(text, text[]), recover_stale_jobs(interval) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_job(text, text[]), recover_stale_jobs(interval) TO demandai_app;
