-- Data lifecycle (D-20; plan §7 and §8 Operations; remediation prompt §6 Phase 7, §8 item 6): the end-of-pilot purge
-- and the export that returns the data first. Both are SECURITY DEFINER functions owned by the owner role, and only the
-- ops role may run them (scripts/data/purge.mjs, scripts/data/export.mjs). Hand-written, reviewed.
--
-- 1. Append-only tables open to the purge alone. Before, the trigger let the owner delete with app.allow_purge on. Any
--    role can set that setting, and a cascading delete runs as the table's owner, so the app role (which may delete
--    uploads) could have removed corrections through the uploads → corrections cascade. Now the session must also
--    have signed in as the ops role, which has no table privileges and reaches the data only through these functions.
CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('app.allow_purge', true), '') = 'on' AND pg_has_role(session_user, 'demandai_ops', 'MEMBER') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint

-- 2. What a purge or an export covers: one upload, or every upload created before a date (optionally in one business
--    unit), and everything made from those files: lists, scoring runs (also runs that used the file as their signal
--    file), hand-offs, micro-segment builds and their recommendations.
CREATE FUNCTION pilot_scope(p_upload uuid, p_before timestamptz, p_unit_code text)
RETURNS TABLE (kind text, id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE v_unit uuid;
BEGIN
  IF (p_upload IS NULL) = (p_before IS NULL) THEN
    RAISE EXCEPTION 'Name one upload or a date, not both' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_unit_code IS NOT NULL THEN
    SELECT b.id INTO v_unit FROM business_units b WHERE b.code = p_unit_code;
    IF v_unit IS NULL THEN RAISE EXCEPTION 'No business unit has the code %', p_unit_code USING ERRCODE = 'invalid_parameter_value'; END IF;
  END IF;
  RETURN QUERY
  WITH up AS (SELECT u.id FROM uploads u WHERE (u.id = p_upload OR u.created_at < p_before) AND (v_unit IS NULL OR u.business_unit_id = v_unit)),
       li AS (SELECT l.id FROM lead_lists l WHERE l.upload_id IN (SELECT up.id FROM up)),
       ru AS (SELECT r.id FROM scoring_runs r WHERE r.list_id IN (SELECT li.id FROM li) OR r.signal_upload_id IN (SELECT up.id FROM up)),
       ho AS (SELECT h.id FROM handoffs h WHERE h.run_id IN (SELECT ru.id FROM ru)),
       nb AS (SELECT n.id FROM nba_runs n WHERE n.handoff_id IN (SELECT ho.id FROM ho) OR n.scoring_run_id IN (SELECT ru.id FROM ru)),
       re AS (SELECT r.id FROM recommendations r WHERE r.nba_run_id IN (SELECT nb.id FROM nb))
  SELECT 'upload'::text, up.id FROM up
  UNION ALL SELECT 'list', li.id FROM li
  UNION ALL SELECT 'run', ru.id FROM ru
  UNION ALL SELECT 'handoff', ho.id FROM ho
  UNION ALL SELECT 'nba_run', nb.id FROM nb
  UNION ALL SELECT 'recommendation', re.id FROM re;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION pilot_scope(uuid, timestamptz, text) FROM PUBLIC;
--> statement-breakpoint

-- 3. The purge. A dry run (the default) counts what would go, table by table, and changes nothing; otherwise it removes
--    it all in the caller's transaction, refusing while a job still works on the data, and records one audit entry per
--    business unit (as System, role ops). The counts are taken before anything is deleted, so both report the same.
--    Kept: the audit log, AI call records, readouts and their sign-offs, configuration, brand packs, Content studio,
--    users. A date purge also drops the unit's cached AI industry answers (made from the files' industry texts).
CREATE FUNCTION purge_pilot_data(p_upload uuid DEFAULT NULL, p_before timestamptz DEFAULT NULL, p_dry_run boolean DEFAULT true, p_unit_code text DEFAULT NULL)
RETURNS TABLE (item text, rows bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_up uuid[]; v_li uuid[]; v_ru uuid[]; v_ho uuid[]; v_nb uuid[]; v_re uuid[]; v_dl uuid[]; v_ids text[]; v_re_text text[];
  v_unit uuid; v_counts jsonb; v_per_unit jsonb;
BEGIN
  SELECT coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'upload'), '{}'), coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'list'), '{}'),
         coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'run'), '{}'), coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'handoff'), '{}'),
         coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'nba_run'), '{}'), coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'recommendation'), '{}')
    INTO v_up, v_li, v_ru, v_ho, v_nb, v_re
    FROM pilot_scope(p_upload, p_before, p_unit_code) s;
  IF p_unit_code IS NOT NULL THEN SELECT b.id INTO v_unit FROM business_units b WHERE b.code = p_unit_code; END IF;
  v_ids := (v_up || v_li || v_ru || v_ho || v_nb)::text[];
  v_re_text := v_re::text[];
  -- The decision log of those items and builds, and the rows that point at them (a manager's check of a flagged row).
  SELECT coalesce(array_agg(d.id), '{}') INTO v_dl FROM decision_log d WHERE d.recommendation_id = ANY(v_re) OR d.nba_run_id = ANY(v_nb);
  SELECT v_dl || coalesce(array_agg(d.id), '{}') INTO v_dl FROM decision_log d WHERE d.linked_to = ANY(v_dl) AND NOT d.id = ANY(v_dl);

  v_counts := jsonb_build_object(
    'uploads', cardinality(v_up),
    'upload_files', (SELECT count(*) FROM upload_files f WHERE f.upload_id = ANY(v_up)),
    'lead_lists', cardinality(v_li),
    'accounts', (SELECT count(*) FROM accounts a WHERE a.list_id = ANY(v_li)),
    'contacts', (SELECT count(*) FROM contacts c WHERE c.list_id = ANY(v_li)),
    'issues', (SELECT count(*) FROM issues i WHERE i.list_id = ANY(v_li) OR i.run_id = ANY(v_ru)),
    'corrections', (SELECT count(*) FROM corrections c WHERE c.upload_id = ANY(v_up)),
    'scoring_runs', cardinality(v_ru),
    'signals', (SELECT count(*) FROM signals s WHERE s.run_id = ANY(v_ru)),
    'account_scores', (SELECT count(*) FROM account_scores s WHERE s.run_id = ANY(v_ru)),
    'prospect_scores', (SELECT count(*) FROM prospect_scores s WHERE s.run_id = ANY(v_ru)),
    'handoffs', cardinality(v_ho),
    'handoff_items', (SELECT count(*) FROM handoff_items h WHERE h.handoff_id = ANY(v_ho)),
    'nba_runs', cardinality(v_nb),
    'recommendations', cardinality(v_re),
    'drafts', (SELECT count(*) FROM drafts d WHERE d.recommendation_id = ANY(v_re)),
    'decision_log', cardinality(v_dl),
    'segment_pauses', (SELECT count(*) FROM segment_pauses p WHERE p.nba_run_id = ANY(v_nb)),
    'spot_checks', (SELECT count(*) FROM spot_checks s WHERE s.picked && v_re),
    'autopilot_runs', (SELECT count(*) FROM autopilot_runs a WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(a.items || a.skipped) e WHERE e->>'id' = ANY(v_re_text))),
    'account_transfers', (SELECT count(*) FROM account_transfers t WHERE t.from_list_id = ANY(v_li)),
    'jobs', (SELECT count(*) FROM jobs j WHERE j.payload->>'uploadId' = ANY(v_ids) OR j.payload->>'replaceListId' = ANY(v_ids) OR j.payload->>'runId' = ANY(v_ids)
      OR j.payload->>'handoffId' = ANY(v_ids) OR j.payload->>'scoringRunId' = ANY(v_ids) OR j.progress->'result'->>'listId' = ANY(v_ids) OR j.progress->'result'->>'nbaRunId' = ANY(v_ids)),
    'ai_verticals', CASE WHEN p_before IS NULL THEN 0 ELSE (SELECT count(*) FROM ai_verticals v WHERE v.created_at < p_before AND (v_unit IS NULL OR v.business_unit_id = v_unit)) END);

  IF NOT p_dry_run THEN
    IF EXISTS (SELECT 1 FROM jobs j WHERE j.status IN ('queued', 'running') AND (j.payload->>'uploadId' = ANY(v_ids) OR j.payload->>'replaceListId' = ANY(v_ids)
        OR j.payload->>'runId' = ANY(v_ids) OR j.payload->>'handoffId' = ANY(v_ids) OR j.payload->>'scoringRunId' = ANY(v_ids))) THEN
      RAISE EXCEPTION 'A job is still working on this data: try again when it has finished' USING ERRCODE = 'object_in_use';
    END IF;
    SELECT coalesce(jsonb_object_agg(x.bu, x.n), '{}') INTO v_per_unit
      FROM (SELECT u.business_unit_id AS bu, count(*) AS n FROM uploads u WHERE u.id = ANY(v_up) GROUP BY 1) x;
    PERFORM set_config('app.allow_purge', 'on', true);
    DELETE FROM decision_log d WHERE d.id = ANY(v_dl);
    DELETE FROM drafts d WHERE d.recommendation_id = ANY(v_re);
    DELETE FROM segment_pauses p WHERE p.nba_run_id = ANY(v_nb);
    DELETE FROM spot_checks s WHERE s.picked && v_re;
    DELETE FROM autopilot_runs a WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(a.items || a.skipped) e WHERE e->>'id' = ANY(v_re_text));
    DELETE FROM recommendations r WHERE r.id = ANY(v_re);
    DELETE FROM nba_runs n WHERE n.id = ANY(v_nb);
    DELETE FROM account_transfers t WHERE t.from_list_id = ANY(v_li);
    DELETE FROM jobs j WHERE j.payload->>'uploadId' = ANY(v_ids) OR j.payload->>'replaceListId' = ANY(v_ids) OR j.payload->>'runId' = ANY(v_ids)
      OR j.payload->>'handoffId' = ANY(v_ids) OR j.payload->>'scoringRunId' = ANY(v_ids) OR j.progress->'result'->>'listId' = ANY(v_ids) OR j.progress->'result'->>'nbaRunId' = ANY(v_ids);
    -- The rest goes by cascade: files, lists, accounts, contacts, issues, corrections, runs, signals, scores, hand-offs.
    DELETE FROM uploads u WHERE u.id = ANY(v_up);
    IF p_before IS NOT NULL THEN
      DELETE FROM ai_verticals v WHERE v.created_at < p_before AND (v_unit IS NULL OR v.business_unit_id = v_unit);
    END IF;
    PERFORM set_config('app.allow_purge', 'off', true);
    INSERT INTO audit_log (actor_user_id, actor_role, business_unit_id, action, target_type, target_id, details)
      SELECT '00000000-0000-0000-0000-000000000001', 'ops', e.key::uuid, 'data.purged', CASE WHEN p_upload IS NULL THEN NULL ELSE 'upload' END, p_upload::text,
             jsonb_build_object('before', p_before, 'unit', p_unit_code, 'uploads', e.value::int, 'removed', v_counts)
        FROM jsonb_each_text(v_per_unit) e;
  END IF;
  RETURN QUERY SELECT e.key, e.value::bigint FROM jsonb_each_text(v_counts) e ORDER BY e.key;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION purge_pilot_data(uuid, timestamptz, boolean, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION purge_pilot_data(uuid, timestamptz, boolean, text) TO demandai_ops;
--> statement-breakpoint

-- 4. When each unit's data is due to go: D-20's provisional rule is p_days (30) after the readout, read as the unit's
--    latest sponsor decision when it ends the pilot ("Stop" or "Go to production"). A unit whose sponsor chose to
--    extend the pilot, or has decided nothing yet, is not due.
CREATE FUNCTION pilot_retention(p_days integer DEFAULT 30)
RETURNS TABLE (unit_code text, unit_name text, decision text, decided_at timestamptz, purge_due_at timestamptz, uploads bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT b.code, b.name, r.verdict, r.at, CASE WHEN r.verdict IN ('Stop', 'Go to production') THEN r.at + make_interval(days => p_days) END,
         (SELECT count(*) FROM uploads u WHERE u.business_unit_id = b.id)
    FROM business_units b
    LEFT JOIN LATERAL (SELECT s.verdict, s.created_at AS at FROM readout_signoffs s WHERE s.business_unit_id = b.id AND s.kind = 'sponsor' ORDER BY s.seq DESC LIMIT 1) r ON true
   ORDER BY b.code
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION pilot_retention(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION pilot_retention(integer) TO demandai_ops;
--> statement-breakpoint

-- 5. The export, to return the data before it is purged: the uploaded files as they were received, and the rows made
--    from them as JSON. With a date it also returns the units' readouts, sign-offs, Content studio pieces and members
--    (name, email, role: never a password hash). Each export is recorded in the audit log, per unit, by the files call.
CREATE FUNCTION export_pilot_files(p_upload uuid DEFAULT NULL, p_before timestamptz DEFAULT NULL, p_unit_code text DEFAULT NULL)
RETURNS TABLE (upload_id uuid, unit_code text, kind text, file_name text, created_at timestamptz, sha256 text, bytes bytea)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE v_up uuid[];
BEGIN
  SELECT coalesce(array_agg(s.id), '{}') INTO v_up FROM pilot_scope(p_upload, p_before, p_unit_code) s WHERE s.kind = 'upload';
  INSERT INTO audit_log (actor_user_id, actor_role, business_unit_id, action, target_type, target_id, details)
    SELECT '00000000-0000-0000-0000-000000000001', 'ops', b.id, 'data.exported', CASE WHEN p_upload IS NULL THEN NULL ELSE 'upload' END, p_upload::text,
           jsonb_build_object('before', p_before, 'unit', p_unit_code, 'files', (SELECT count(*) FROM uploads u WHERE u.id = ANY(v_up) AND u.business_unit_id = b.id))
      FROM business_units b
     WHERE (p_unit_code IS NULL OR b.code = p_unit_code) AND (p_before IS NOT NULL OR EXISTS (SELECT 1 FROM uploads u WHERE u.id = ANY(v_up) AND u.business_unit_id = b.id));
  RETURN QUERY SELECT u.id, b.code, u.kind, u.file_name, u.created_at, u.sha256, f.bytes
    FROM uploads u JOIN business_units b ON b.id = u.business_unit_id LEFT JOIN upload_files f ON f.upload_id = u.id
   WHERE u.id = ANY(v_up) ORDER BY u.created_at, u.id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION export_pilot_files(uuid, timestamptz, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION export_pilot_files(uuid, timestamptz, text) TO demandai_ops;
--> statement-breakpoint
CREATE FUNCTION export_pilot_rows(p_table text, p_upload uuid DEFAULT NULL, p_before timestamptz DEFAULT NULL, p_unit_code text DEFAULT NULL)
RETURNS TABLE (unit_code text, data jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_up uuid[]; v_li uuid[]; v_ru uuid[]; v_ho uuid[]; v_nb uuid[]; v_re uuid[]; v_units uuid[]; q text;
BEGIN
  SELECT coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'upload'), '{}'), coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'list'), '{}'),
         coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'run'), '{}'), coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'handoff'), '{}'),
         coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'nba_run'), '{}'), coalesce(array_agg(s.id) FILTER (WHERE s.kind = 'recommendation'), '{}')
    INTO v_up, v_li, v_ru, v_ho, v_nb, v_re
    FROM pilot_scope(p_upload, p_before, p_unit_code) s;
  SELECT coalesce(array_agg(b.id), '{}') INTO v_units FROM business_units b WHERE p_before IS NOT NULL AND (p_unit_code IS NULL OR b.code = p_unit_code);
  q := CASE p_table
    WHEN 'uploads' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM uploads t WHERE t.id = ANY($1)'
    WHEN 'lead_lists' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM lead_lists t WHERE t.id = ANY($2)'
    WHEN 'accounts' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM accounts t WHERE t.list_id = ANY($2)'
    WHEN 'contacts' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM contacts t WHERE t.list_id = ANY($2)'
    WHEN 'corrections' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM corrections t WHERE t.upload_id = ANY($1)'
    WHEN 'issues' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM issues t WHERE t.list_id = ANY($2) OR t.run_id = ANY($3)'
    WHEN 'scoring_runs' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM scoring_runs t WHERE t.id = ANY($3)'
    WHEN 'signals' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM signals t WHERE t.run_id = ANY($3)'
    WHEN 'account_scores' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM account_scores t WHERE t.run_id = ANY($3)'
    WHEN 'prospect_scores' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM prospect_scores t WHERE t.run_id = ANY($3)'
    WHEN 'handoffs' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM handoffs t WHERE t.id = ANY($4)'
    WHEN 'handoff_items' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM handoff_items t WHERE t.handoff_id = ANY($4)'
    WHEN 'nba_runs' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM nba_runs t WHERE t.id = ANY($5)'
    WHEN 'recommendations' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM recommendations t WHERE t.id = ANY($6)'
    WHEN 'drafts' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM drafts t WHERE t.recommendation_id = ANY($6)'
    WHEN 'decision_log' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM decision_log t WHERE t.recommendation_id = ANY($6) OR t.nba_run_id = ANY($5)'
    WHEN 'readouts' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM readouts t WHERE t.business_unit_id = ANY($7) AND t.created_at < $8'
    WHEN 'readout_signoffs' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM readout_signoffs t WHERE t.business_unit_id = ANY($7) AND t.created_at < $8'
    WHEN 'studio_items' THEN 'SELECT t.business_unit_id, to_jsonb(t), t.created_at FROM studio_items t WHERE t.business_unit_id = ANY($7) AND t.created_at < $8'
    WHEN 'people' THEN 'SELECT m.business_unit_id, jsonb_build_object(''id'', u.id, ''email'', u.email, ''display_name'', u.display_name, ''role'', m.role, ''status'', u.status), m.created_at
      FROM business_unit_members m JOIN users u ON u.id = m.user_id WHERE m.business_unit_id = ANY($7)'
  END;
  IF q IS NULL THEN RAISE EXCEPTION 'Not a table the export returns: %', p_table USING ERRCODE = 'invalid_parameter_value'; END IF;
  RETURN QUERY EXECUTE 'SELECT b.code, x.data FROM (' || q || ') x(bu, data, at) JOIN business_units b ON b.id = x.bu ORDER BY b.code, x.at, x.data->>''id'''
    USING v_up, v_li, v_ru, v_ho, v_nb, v_re, v_units, p_before;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION export_pilot_rows(text, uuid, timestamptz, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION export_pilot_rows(text, uuid, timestamptz, text) TO demandai_ops;
