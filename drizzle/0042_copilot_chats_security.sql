-- Copilot's saved chats (G-013, the legacy panel's saved chats), hand-written and reviewed. A chat is private to the
-- person who had it: the app role reads, adds and deletes only their own, in their business unit, and may change only
-- a chat's title and last activity. A message goes only into one of the person's own chats, and never changes.
ALTER TABLE copilot_chats ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY copilot_chats_owner ON copilot_chats
  USING (business_unit_id = app_bu() AND created_by = app_user())
  WITH CHECK (business_unit_id = app_bu() AND created_by = app_user());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON copilot_chats TO demandai_app;
--> statement-breakpoint
GRANT UPDATE (title, updated_at) ON copilot_chats TO demandai_app;
--> statement-breakpoint
ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY copilot_messages_owner ON copilot_messages
  USING (business_unit_id = app_bu() AND created_by = app_user())
  WITH CHECK (business_unit_id = app_bu() AND created_by = app_user() AND EXISTS (SELECT 1 FROM copilot_chats c WHERE c.id = chat_id));
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON copilot_messages TO demandai_app;
--> statement-breakpoint

-- The end-of-pilot purge (0037) also removes the chats: those about a purged list, run, build or item (they would go by
-- cascade anyway; counting them here makes the dry run say so), and with a date, every chat in the unit last used
-- before it, the queue's included. The rest of the function is unchanged.
CREATE OR REPLACE FUNCTION purge_pilot_data(p_upload uuid DEFAULT NULL, p_before timestamptz DEFAULT NULL, p_dry_run boolean DEFAULT true, p_unit_code text DEFAULT NULL)
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
    'ai_verticals', CASE WHEN p_before IS NULL THEN 0 ELSE (SELECT count(*) FROM ai_verticals v WHERE v.created_at < p_before AND (v_unit IS NULL OR v.business_unit_id = v_unit)) END,
    'copilot_chats', (SELECT count(*) FROM copilot_chats c WHERE c.list_id = ANY(v_li) OR c.run_id = ANY(v_ru) OR c.nba_run_id = ANY(v_nb) OR c.item_id = ANY(v_re)
      OR (p_before IS NOT NULL AND c.updated_at < p_before AND (v_unit IS NULL OR c.business_unit_id = v_unit))));

  IF NOT p_dry_run THEN
    IF EXISTS (SELECT 1 FROM jobs j WHERE j.status IN ('queued', 'running') AND (j.payload->>'uploadId' = ANY(v_ids) OR j.payload->>'replaceListId' = ANY(v_ids)
        OR j.payload->>'runId' = ANY(v_ids) OR j.payload->>'handoffId' = ANY(v_ids) OR j.payload->>'scoringRunId' = ANY(v_ids))) THEN
      RAISE EXCEPTION 'A job is still working on this data: try again when it has finished' USING ERRCODE = 'object_in_use';
    END IF;
    SELECT coalesce(jsonb_object_agg(x.bu, x.n), '{}') INTO v_per_unit
      FROM (SELECT u.business_unit_id AS bu, count(*) AS n FROM uploads u WHERE u.id = ANY(v_up) GROUP BY 1) x;
    PERFORM set_config('app.allow_purge', 'on', true);
    -- Copilot's chats about these records (their messages go with them); with a date, the unit's older chats too.
    DELETE FROM copilot_chats c WHERE c.list_id = ANY(v_li) OR c.run_id = ANY(v_ru) OR c.nba_run_id = ANY(v_nb) OR c.item_id = ANY(v_re)
      OR (p_before IS NOT NULL AND c.updated_at < p_before AND (v_unit IS NULL OR c.business_unit_id = v_unit));
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
