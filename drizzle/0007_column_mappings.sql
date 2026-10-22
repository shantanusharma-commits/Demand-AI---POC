CREATE TABLE "column_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "column_mappings_kind_check" CHECK ("column_mappings"."kind" in ('lead', 'signal'))
);
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN "file_columns" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN "mapping_id" uuid;--> statement-breakpoint
ALTER TABLE "column_mappings" ADD CONSTRAINT "column_mappings_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "column_mappings" ADD CONSTRAINT "column_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "column_mappings" ADD CONSTRAINT "column_mappings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "column_mappings_bu_kind_name_key" ON "column_mappings" USING btree ("business_unit_id","kind","name");--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_mapping_id_column_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."column_mappings"("id") ON DELETE set null ON UPDATE no action;