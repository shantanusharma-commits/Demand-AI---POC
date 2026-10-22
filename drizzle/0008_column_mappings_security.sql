-- Column mappings (G-040) belong to a business unit and are shared within it, like uploads and lists (D-33).
ALTER TABLE column_mappings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY column_mappings_business_unit ON column_mappings
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON column_mappings TO demandai_app;
