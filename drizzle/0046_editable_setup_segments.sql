CREATE TABLE "micro_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"name" "citext" NOT NULL,
	"theme" text NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"merged_into" uuid,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "micro_segments_origin_check" CHECK ("micro_segments"."origin" in ('ai', 'person')),
	CONSTRAINT "micro_segments_status_check" CHECK ("micro_segments"."status" in ('waiting', 'approved', 'retired'))
);
--> statement-breakpoint
ALTER TABLE "ai_calls" DROP CONSTRAINT "ai_calls_capability_check";--> statement-breakpoint
ALTER TABLE "config_changes" DROP CONSTRAINT "config_changes_kind_check";--> statement-breakpoint
ALTER TABLE "micro_segments" ADD CONSTRAINT "micro_segments_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_segments" ADD CONSTRAINT "micro_segments_merged_into_micro_segments_id_fk" FOREIGN KEY ("merged_into") REFERENCES "public"."micro_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_segments" ADD CONSTRAINT "micro_segments_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_segments" ADD CONSTRAINT "micro_segments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_segments" ADD CONSTRAINT "micro_segments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "micro_segments_bu_name_key" ON "micro_segments" USING btree ("business_unit_id","name");--> statement-breakpoint
CREATE INDEX "micro_segments_bu_status_idx" ON "micro_segments" USING btree ("business_unit_id","status");--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_capability_check" CHECK ("ai_calls"."capability" in ('classify', 'why_now', 'draft_message', 'draft_content', 'copilot', 'healthcheck', 'segment', 'next_action', 'read_guideline'));--> statement-breakpoint
ALTER TABLE "config_changes" ADD CONSTRAINT "config_changes_kind_check" CHECK ("config_changes"."kind" in ('validation', 'scoring', 'lock', 'actions'));