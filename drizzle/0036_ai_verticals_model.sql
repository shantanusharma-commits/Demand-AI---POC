DROP INDEX "ai_verticals_bu_key_version_key";--> statement-breakpoint
ALTER TABLE "ai_verticals" ADD COLUMN "model" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_verticals_bu_key_version_key" ON "ai_verticals" USING btree ("business_unit_id","industry_key","template_version","model");