CREATE TABLE "brand_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "brand_documents_size_check" CHECK ("brand_documents"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "brand_drafts" (
	"business_unit_id" uuid PRIMARY KEY NOT NULL,
	"base_version_no" integer NOT NULL,
	"pack" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"pack" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sections" text[] DEFAULT '{}'::text[] NOT NULL,
	"changes" text[] DEFAULT '{}'::text[] NOT NULL,
	"restored_from" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_documents" ADD CONSTRAINT "brand_documents_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_documents" ADD CONSTRAINT "brand_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_drafts" ADD CONSTRAINT "brand_drafts_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_drafts" ADD CONSTRAINT "brand_drafts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_versions" ADD CONSTRAINT "brand_versions_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_versions" ADD CONSTRAINT "brand_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_documents_bu_idx" ON "brand_documents" USING btree ("business_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_versions_bu_version_key" ON "brand_versions" USING btree ("business_unit_id","version_no");