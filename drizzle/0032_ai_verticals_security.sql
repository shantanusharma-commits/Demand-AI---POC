-- The AI classifier's answers per industry text (Phase 6): kept so rebuilds agree; a new prompt version adds rows,
-- nothing is changed or removed by the app (no UPDATE, DELETE or TRUNCATE; the trigger binds the owner too). A business
-- unit sees only its own (hand-written, reviewed).
ALTER TABLE ai_verticals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_verticals_business_unit ON ai_verticals
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER ai_verticals_append_only BEFORE UPDATE OR DELETE ON ai_verticals FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER ai_verticals_no_truncate BEFORE TRUNCATE ON ai_verticals FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON ai_verticals TO demandai_app;
