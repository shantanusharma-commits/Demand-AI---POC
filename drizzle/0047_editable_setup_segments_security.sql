-- Micro-segments the AI or a person created (hand-written, reviewed). A business unit sees only its own; the app role
-- may read and add them, and change only what a sales manager decides: the name, theme, status, merge and who decided.
-- Nothing is deleted (no DELETE grant; retiring is a status). Person-made segments from before are copied in as
-- approved, with their creator, so the For Review choices and the Setup list read one table from now on.
ALTER TABLE micro_segments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY micro_segments_business_unit ON micro_segments
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER micro_segments_no_truncate BEFORE TRUNCATE ON micro_segments FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER micro_segments_no_delete BEFORE DELETE ON micro_segments FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON micro_segments TO demandai_app;
--> statement-breakpoint
GRANT UPDATE (name, theme, status, merged_into, decided_at, decided_by, updated_at, updated_by) ON micro_segments TO demandai_app;
--> statement-breakpoint
INSERT INTO micro_segments (business_unit_id, name, theme, why, origin, status, decided_at, decided_by, created_at, created_by, updated_at, updated_by)
  SELECT business_unit_id, name, theme, 'Created by a person in For Review', 'person', 'approved', created_at, created_by, created_at, created_by, created_at, created_by
  FROM custom_segments
  ON CONFLICT (business_unit_id, name) DO NOTHING;
--> statement-breakpoint
-- Renaming or merging a micro-segment moves its items: the segment an item was grouped into can now change.
GRANT UPDATE (segment) ON recommendations TO demandai_app;
