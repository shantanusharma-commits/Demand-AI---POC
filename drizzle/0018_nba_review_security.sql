-- Micro-segments, recommendations, drafts and the decision log (G-006, G-008): business-unit isolation, owner
-- scoping and append-only evidence (hand-written, reviewed).
--
-- Builds (nba_runs) are shared within the business unit, like scoring runs (D-33). A recommendation holds a person's
-- details, so it is owner-scoped by its current owner (G-014); its drafts are visible exactly when it is, and its
-- decision-log rows also to whoever made them or owned the item then. What the system produced is
-- immutable: the app role may update only the decision-state columns of a recommendation, and drafts, the decision
-- log and segment pauses are append-only (no UPDATE, DELETE or TRUNCATE; the trigger binds the owner too).

ALTER TABLE nba_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY nba_runs_business_unit ON nba_runs
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
GRANT SELECT, INSERT ON nba_runs TO demandai_app;
--> statement-breakpoint
GRANT UPDATE (name, updated_at, updated_by) ON nba_runs TO demandai_app;
--> statement-breakpoint

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY recommendations_owner ON recommendations
  USING (business_unit_id = app_bu() AND app_owns(owner_email)) WITH CHECK (business_unit_id = app_bu() AND app_owns(owner_email));
--> statement-breakpoint
GRANT SELECT, INSERT ON recommendations TO demandai_app;
--> statement-breakpoint
GRANT UPDATE (owner_email, status, why, released, routed_at, assigned_segment, segment_at, use_runner_up, manual_action, channel_pref, variant,
  contact_row, draft_version, edited, edit_rating, fixed, alternative_used, alternative_of, reject_code, sent_back_note, spot, spot_week,
  hold_why, hold_note, hold_at, hold_by, outcome, meeting, opened_at, opened_by, decided_at, decided_by, approved_by, updated_at, updated_by)
  ON recommendations TO demandai_app;
--> statement-breakpoint

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY drafts_recommendation ON drafts
  USING (business_unit_id = app_bu() AND EXISTS (SELECT 1 FROM recommendations r WHERE r.id = drafts.recommendation_id))
  WITH CHECK (business_unit_id = app_bu() AND EXISTS (SELECT 1 FROM recommendations r WHERE r.id = drafts.recommendation_id));
--> statement-breakpoint
CREATE TRIGGER drafts_append_only BEFORE UPDATE OR DELETE ON drafts FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER drafts_no_truncate BEFORE TRUNCATE ON drafts FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON drafts TO demandai_app;
--> statement-breakpoint

-- A row is visible with its recommendation, to the person who made it, and to whoever owned the item when it was
-- logged (a rep's own results). It is written by the person deciding, or by the System user for what the rules did on
-- that person's request (routing, regeneration, the weekly spot-check draw), and only about a recommendation the
-- writer can see.
ALTER TABLE decision_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY decision_log_visible ON decision_log
  USING (business_unit_id = app_bu() AND (created_by = app_user() OR app_owns(owner_email)
    OR EXISTS (SELECT 1 FROM recommendations r WHERE r.id = decision_log.recommendation_id)))
  WITH CHECK (business_unit_id = app_bu() AND created_by IN (app_user(), '00000000-0000-0000-0000-000000000001'::uuid)
    AND EXISTS (SELECT 1 FROM recommendations r WHERE r.id = decision_log.recommendation_id));
--> statement-breakpoint
CREATE TRIGGER decision_log_append_only BEFORE UPDATE OR DELETE ON decision_log FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER decision_log_no_truncate BEFORE TRUNCATE ON decision_log FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON decision_log TO demandai_app;
--> statement-breakpoint

ALTER TABLE segment_pauses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY segment_pauses_business_unit ON segment_pauses
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER segment_pauses_append_only BEFORE UPDATE OR DELETE ON segment_pauses FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER segment_pauses_no_truncate BEFORE TRUNCATE ON segment_pauses FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON segment_pauses TO demandai_app;
--> statement-breakpoint

-- 5.9 Engage-once: an account already released, or rejected as "already engaged", in an earlier build of this unit is
-- set aside in a new one. A rep sees only their own recommendations, so a build asks this for the whole unit; it
-- answers only for the account names it is given (lower-case), with the build's name and when it was engaged.
CREATE FUNCTION nba_engaged_accounts(p_names text[], p_before timestamptz) RETURNS TABLE (name text, run_name text, engaged_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT ON (lower(r.rec->'account'->>'name')) lower(r.rec->'account'->>'name'), n.name, coalesce(r.decided_at, n.created_at)
  FROM recommendations r JOIN nba_runs n ON n.id = r.nba_run_id
  WHERE r.business_unit_id = app_bu() AND n.business_unit_id = app_bu() AND n.created_at < p_before
    AND (r.status = 'Released' OR r.reject_code = 'R4')
    AND lower(r.rec->'account'->>'name') = ANY (p_names)
  ORDER BY lower(r.rec->'account'->>'name'), n.created_at;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION nba_engaged_accounts(text[], timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION nba_engaged_accounts(text[], timestamptz) TO demandai_app;
