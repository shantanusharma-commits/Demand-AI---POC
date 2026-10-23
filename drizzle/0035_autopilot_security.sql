-- Autopilot runs (G-013): the record of what Autopilot did for a person, kept as evidence. The app role may read and
-- add runs and mark one undone; nothing else in a run ever changes (column grants), and runs are never deleted
-- (no DELETE grant; the DELETE and TRUNCATE triggers bind the owner too). A business unit sees only its own (hand-written, reviewed).
ALTER TABLE autopilot_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY autopilot_runs_business_unit ON autopilot_runs
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER autopilot_runs_no_delete BEFORE DELETE ON autopilot_runs FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER autopilot_runs_no_truncate BEFORE TRUNCATE ON autopilot_runs FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON autopilot_runs TO demandai_app;
--> statement-breakpoint
GRANT UPDATE (undone_at, undone_by) ON autopilot_runs TO demandai_app;
