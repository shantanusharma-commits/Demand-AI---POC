CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "corrections_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_unit_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"field" text NOT NULL,
	"from_value" text NOT NULL,
	"to_value" text NOT NULL,
	"severity" text NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"note" text NOT NULL,
	"contact_name" text NOT NULL,
	"company" text NOT NULL,
	"owner_email" text,
	"actor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "corrections_field_check" CHECK ("corrections"."field" in ('first_name', 'last_name', 'job_title', 'email', 'email_verified', 'linkedin_url', 'city', 'country', 'owner_email', 'employee_count', 'industry', 'opt_out', 'managed_separately', 'vertical', 'take_out')),
	CONSTRAINT "corrections_severity_check" CHECK ("corrections"."severity" in ('major', 'minor')),
	CONSTRAINT "corrections_row_check" CHECK ("corrections"."row_no" > 0),
	CONSTRAINT "corrections_owner_lower_check" CHECK ("corrections"."owner_email" is null or "corrections"."owner_email" = lower("corrections"."owner_email"))
);
--> statement-breakpoint
ALTER TABLE "lead_lists" DROP CONSTRAINT "lead_lists_status_check";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "raw" jsonb;--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN "replaced_by_list_id" uuid;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "corrections_seq_key" ON "corrections" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "corrections_upload_seq_idx" ON "corrections" USING btree ("upload_id","seq");--> statement-breakpoint
CREATE INDEX "corrections_bu_seq_idx" ON "corrections" USING btree ("business_unit_id","seq");--> statement-breakpoint
CREATE INDEX "corrections_list_idx" ON "corrections" USING btree ("list_id");--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_replaced_by_list_id_lead_lists_id_fk" FOREIGN KEY ("replaced_by_list_id") REFERENCES "public"."lead_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_lists_replaced_by_idx" ON "lead_lists" USING btree ("replaced_by_list_id");--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_status_check" CHECK ("lead_lists"."status" in ('draft', 'saved', 'replaced'));