-- AI call metadata (D-6): the evidence of what the model was asked to do and how it went, so it is append-only (no
-- UPDATE, DELETE or TRUNCATE for the app role; the trigger binds the owner too). A business unit sees only its own
-- (hand-written, reviewed).
ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_calls_business_unit ON ai_calls
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER ai_calls_append_only BEFORE UPDATE OR DELETE ON ai_calls FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER ai_calls_no_truncate BEFORE TRUNCATE ON ai_calls FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON ai_calls TO demandai_app;
