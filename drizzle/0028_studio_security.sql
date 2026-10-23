-- Content studio (D-36), hand-written and reviewed. Pieces are shared in their business unit: everyone there with the
-- studio permission reads and edits them (the service checks the role), and nobody deletes one (a piece reps added to
-- messages is part of the record). The conversation that wrote a piece is append-only. Reps record which pieces they
-- added to an outreach message in recommendations.content, a decision-state column like the others.
ALTER TABLE studio_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY studio_items_business_unit ON studio_items
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON studio_items TO demandai_app;
--> statement-breakpoint
ALTER TABLE studio_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY studio_messages_business_unit ON studio_messages
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER studio_messages_append_only BEFORE UPDATE OR DELETE ON studio_messages FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER studio_messages_no_truncate BEFORE TRUNCATE ON studio_messages FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON studio_messages TO demandai_app;
--> statement-breakpoint
GRANT UPDATE (content) ON recommendations TO demandai_app;
