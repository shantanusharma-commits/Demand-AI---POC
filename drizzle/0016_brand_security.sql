-- Content library (G-009). Brand-pack versions are the record of what every draft was checked against, so they are
-- append-only (a restore adds a new version); the working draft is one row per business unit that the people who
-- maintain the pack overwrite; guideline documents are kept while a version names them (the purge comes in Phase 7).
-- Each business unit sees only its own.
ALTER TABLE brand_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY brand_versions_business_unit ON brand_versions
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER brand_versions_append_only BEFORE UPDATE OR DELETE ON brand_versions FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER brand_versions_no_truncate BEFORE TRUNCATE ON brand_versions FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON brand_versions TO demandai_app;
--> statement-breakpoint
ALTER TABLE brand_drafts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY brand_drafts_business_unit ON brand_drafts
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_drafts TO demandai_app;
--> statement-breakpoint
ALTER TABLE brand_documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY brand_documents_business_unit ON brand_documents
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
GRANT SELECT, INSERT ON brand_documents TO demandai_app;
