CREATE TABLE "ai_verticals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"industry_key" text NOT NULL,
	"template_version" integer NOT NULL,
	"vertical" text NOT NULL,
	"confidence" text NOT NULL,
	"reason" text NOT NULL,
	"ai_call_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "ai_verticals_confidence_check" CHECK ("ai_verticals"."confidence" in ('high', 'medium', 'low'))
);
--> statement-breakpoint
ALTER TABLE "ai_verticals" ADD CONSTRAINT "ai_verticals_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_verticals" ADD CONSTRAINT "ai_verticals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_verticals_bu_key_version_key" ON "ai_verticals" USING btree ("business_unit_id","industry_key","template_version");