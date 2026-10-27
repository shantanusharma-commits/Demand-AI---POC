-- Micro-segments people create in For Review (hand-written, reviewed). A business unit sees only its own; the app role
-- may read and add them, and nothing in one ever changes or is deleted (no UPDATE or DELETE grant; the triggers bind
-- the owner too).
ALTER TABLE custom_segments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY custom_segments_business_unit ON custom_segments
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER custom_segments_append_only BEFORE UPDATE OR DELETE ON custom_segments FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER custom_segments_no_truncate BEFORE TRUNCATE ON custom_segments FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON custom_segments TO demandai_app;
--> statement-breakpoint

-- Approved (released) messages per micro-segment across the unit's builds: `formed` counts the items the system grouped
-- into it, `approved` every released item in it, assigned by a person or not. An item with no micro-segment may join
-- one of the system's with at least one approved message. A rep sees only their own recommendations, so this answers
-- for the whole unit, with counts only.
CREATE FUNCTION nba_segment_approvals() RETURNS TABLE (segment text, formed integer, approved integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(r.segment, r.assigned_segment), (count(*) FILTER (WHERE r.segment IS NOT NULL))::int, count(*)::int
  FROM recommendations r
  WHERE r.business_unit_id = app_bu() AND r.status = 'Released' AND coalesce(r.segment, r.assigned_segment) IS NOT NULL
  GROUP BY 1;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION nba_segment_approvals() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION nba_segment_approvals() TO demandai_app;
