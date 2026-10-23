CREATE TABLE "readout_signoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "readout_signoffs_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_unit_id" uuid NOT NULL,
	"readout_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"verdict" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"actor_role" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"config_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "readout_signoffs_kind_check" CHECK ("readout_signoffs"."kind" in ('discovery', 'qualification', 'intent', 'routing', 'content', 'value', 'sponsor')),
	CONSTRAINT "readout_signoffs_verdict_check" CHECK (("readout_signoffs"."kind" = 'sponsor' and "readout_signoffs"."verdict" in ('Go to production', 'Extend the pilot', 'Stop')) or ("readout_signoffs"."kind" <> 'sponsor' and "readout_signoffs"."verdict" in ('Satisfied', 'Satisfied with concerns', 'Not satisfied')))
);
--> statement-breakpoint
CREATE TABLE "readouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"name" text DEFAULT 'Pilot readout' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "readout_signoffs" ADD CONSTRAINT "readout_signoffs_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readout_signoffs" ADD CONSTRAINT "readout_signoffs_readout_id_readouts_id_fk" FOREIGN KEY ("readout_id") REFERENCES "public"."readouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readout_signoffs" ADD CONSTRAINT "readout_signoffs_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readout_signoffs" ADD CONSTRAINT "readout_signoffs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readouts" ADD CONSTRAINT "readouts_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readouts" ADD CONSTRAINT "readouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "readout_signoffs_bu_seq_idx" ON "readout_signoffs" USING btree ("business_unit_id","seq");--> statement-breakpoint
CREATE INDEX "readout_signoffs_readout_idx" ON "readout_signoffs" USING btree ("readout_id","kind","seq");--> statement-breakpoint
CREATE INDEX "readouts_bu_time_idx" ON "readouts" USING btree ("business_unit_id","created_at");