CREATE TABLE "studio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"topic" text NOT NULL,
	"segment" text NOT NULL,
	"tone" text NOT NULL,
	"length" text NOT NULL,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"blocks" jsonb NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"brand_version_no" integer NOT NULL,
	"rev" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "studio_items_type_check" CHECK ("studio_items"."type" in ('blog', 'whitepaper')),
	CONSTRAINT "studio_items_tone_check" CHECK ("studio_items"."tone" in ('Direct', 'Formal', 'Warm')),
	CONSTRAINT "studio_items_length_check" CHECK ("studio_items"."length" in ('Short', 'Medium', 'Long')),
	CONSTRAINT "studio_items_status_check" CHECK ("studio_items"."status" in ('Draft', 'Ready'))
);
--> statement-breakpoint
CREATE TABLE "studio_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "studio_messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_unit_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"who" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "studio_messages_who_check" CHECK ("studio_messages"."who" in ('me', 'ai'))
);
--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "content" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_items" ADD CONSTRAINT "studio_items_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_items" ADD CONSTRAINT "studio_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_items" ADD CONSTRAINT "studio_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_item_id_studio_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."studio_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_items_bu_time_idx" ON "studio_items" USING btree ("business_unit_id","updated_at");--> statement-breakpoint
CREATE INDEX "studio_messages_item_idx" ON "studio_messages" USING btree ("item_id","seq");--> statement-breakpoint
CREATE INDEX "studio_messages_bu_idx" ON "studio_messages" USING btree ("business_unit_id");