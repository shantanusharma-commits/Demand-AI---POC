CREATE TABLE "config_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "config_changes_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_unit_id" uuid NOT NULL,
	"config_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"changes" text[] NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "config_changes_kind_check" CHECK ("config_changes"."kind" in ('validation'))
);
--> statement-breakpoint
ALTER TABLE "config_changes" ADD CONSTRAINT "config_changes_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_changes" ADD CONSTRAINT "config_changes_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_changes" ADD CONSTRAINT "config_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "config_changes_bu_seq_idx" ON "config_changes" USING btree ("business_unit_id","seq");--> statement-breakpoint
CREATE INDEX "config_changes_version_idx" ON "config_changes" USING btree ("config_version_id");