-- Changes to the success-gate settings (D-21) are part of the record of how the pilot was measured, so they are
-- append-only like the Setup sign-offs: no UPDATE, DELETE or TRUNCATE for the app role, and the trigger binds the
-- owner too. A business unit sees only its own (hand-written, reviewed).
ALTER TABLE config_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY config_changes_business_unit ON config_changes
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER config_changes_append_only BEFORE UPDATE OR DELETE ON config_changes FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER config_changes_no_truncate BEFORE TRUNCATE ON config_changes FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON config_changes TO demandai_app;
