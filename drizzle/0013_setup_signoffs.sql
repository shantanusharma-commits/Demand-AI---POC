CREATE TABLE "config_signoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "config_signoffs_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_unit_id" uuid NOT NULL,
	"config_version_id" uuid NOT NULL,
	"section" text NOT NULL,
	"action" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "config_signoffs_section_check" CHECK ("config_signoffs"."section" in ('scope', 'rubric', 'personas', 'signals', 'actions', 'brand', 'users')),
	CONSTRAINT "config_signoffs_action_check" CHECK ("config_signoffs"."action" in ('sign_off', 'reopen'))
);
--> statement-breakpoint
CREATE TABLE "signal_type_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "signal_type_changes_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_unit_id" uuid NOT NULL,
	"config_version_id" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"change" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"definition" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "signal_type_changes_change_check" CHECK ("signal_type_changes"."change" in ('off', 'on', 'added', 'removed'))
);
--> statement-breakpoint
ALTER TABLE "config_signoffs" ADD CONSTRAINT "config_signoffs_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_signoffs" ADD CONSTRAINT "config_signoffs_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_signoffs" ADD CONSTRAINT "config_signoffs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_type_changes" ADD CONSTRAINT "signal_type_changes_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_type_changes" ADD CONSTRAINT "signal_type_changes_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_type_changes" ADD CONSTRAINT "signal_type_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "config_signoffs_bu_seq_idx" ON "config_signoffs" USING btree ("business_unit_id","seq");--> statement-breakpoint
CREATE INDEX "config_signoffs_version_idx" ON "config_signoffs" USING btree ("config_version_id");--> statement-breakpoint
CREATE INDEX "signal_type_changes_bu_seq_idx" ON "signal_type_changes" USING btree ("business_unit_id","seq");--> statement-breakpoint
CREATE INDEX "signal_type_changes_version_idx" ON "signal_type_changes" USING btree ("config_version_id");