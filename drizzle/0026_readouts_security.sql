-- The pilot readout (D-27, D-38): the verdicts per success area and the sponsor's decision are the record of whether
-- the pilot succeeded, each tied to who recorded it, so both tables are append-only (no UPDATE, DELETE or TRUNCATE for
-- the app role; the trigger binds the owner too). A business unit sees only its own (hand-written, reviewed).
ALTER TABLE readouts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY readouts_business_unit ON readouts
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER readouts_append_only BEFORE UPDATE OR DELETE ON readouts FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER readouts_no_truncate BEFORE TRUNCATE ON readouts FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
ALTER TABLE readout_signoffs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY readout_signoffs_business_unit ON readout_signoffs
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER readout_signoffs_append_only BEFORE UPDATE OR DELETE ON readout_signoffs FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER readout_signoffs_no_truncate BEFORE TRUNCATE ON readout_signoffs FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON readouts, readout_signoffs TO demandai_app;
