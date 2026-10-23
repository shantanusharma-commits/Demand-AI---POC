-- Setup records (G-002): sign-offs per section and signal-type changes are the audit trail of how the scoring was
-- configured, so they are append-only like the audit log: no UPDATE, DELETE or TRUNCATE for the app role, and the
-- trigger binds the owner too. A business unit sees only its own.
ALTER TABLE config_signoffs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY config_signoffs_business_unit ON config_signoffs
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER config_signoffs_append_only BEFORE UPDATE OR DELETE ON config_signoffs FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER config_signoffs_no_truncate BEFORE TRUNCATE ON config_signoffs FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
ALTER TABLE signal_type_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY signal_type_changes_business_unit ON signal_type_changes
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER signal_type_changes_append_only BEFORE UPDATE OR DELETE ON signal_type_changes FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER signal_type_changes_no_truncate BEFORE TRUNCATE ON signal_type_changes FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON config_signoffs, signal_type_changes TO demandai_app;
