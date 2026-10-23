CREATE TABLE "decision_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "decision_log_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_unit_id" uuid NOT NULL,
	"nba_run_id" uuid NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"decision" text NOT NULL,
	"kind" text,
	"reason_code" text,
	"reason" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT '' NOT NULL,
	"segment" text DEFAULT '' NOT NULL,
	"contact_row" integer,
	"note" text DEFAULT '' NOT NULL,
	"draft_version" integer,
	"opened_at" timestamp with time zone,
	"seconds" integer,
	"queue_position" integer,
	"decisive" boolean DEFAULT false NOT NULL,
	"first_pass" boolean,
	"accepted" boolean,
	"flag" text,
	"linked_to" uuid,
	"cause" text,
	"compliance" boolean DEFAULT false NOT NULL,
	"intervention" boolean DEFAULT false NOT NULL,
	"owner_email" text,
	"edit_rating" text,
	"config_version_id" uuid,
	"brand_version_id" uuid,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "decision_log_kind_check" CHECK ("decision_log"."kind" is null or "decision_log"."kind" in ('exception', 'spot', 'alternative', 'intervention', 'system', 'manager_check')),
	CONSTRAINT "decision_log_reason_code_check" CHECK ("decision_log"."reason_code" is null or "decision_log"."reason_code" in ('R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12')),
	CONSTRAINT "decision_log_cause_check" CHECK ("decision_log"."cause" is null or "decision_log"."cause" in ('data', 'system', 'other', 'compliance')),
	CONSTRAINT "decision_log_edit_rating_check" CHECK ("decision_log"."edit_rating" is null or "decision_log"."edit_rating" in ('none', 'minor', 'major')),
	CONSTRAINT "decision_log_owner_lower_check" CHECK ("decision_log"."owner_email" is null or "decision_log"."owner_email" = lower("decision_log"."owner_email"))
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"channel" text NOT NULL,
	"action" text NOT NULL,
	"contact_row" integer,
	"draft" jsonb NOT NULL,
	"checks" jsonb NOT NULL,
	"confidence" jsonb NOT NULL,
	"reason" text NOT NULL,
	"ai_assisted" boolean DEFAULT false NOT NULL,
	"brand_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "drafts_channel_check" CHECK ("drafts"."channel" in ('Email', 'LinkedIn', 'Task')),
	CONSTRAINT "drafts_version_check" CHECK ("drafts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "nba_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"handoff_id" uuid NOT NULL,
	"scoring_run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"as_of" date NOT NULL,
	"config_version_id" uuid,
	"brand_version_id" uuid NOT NULL,
	"engine_version" text NOT NULL,
	"seed" text NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"engaged" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"nba_run_id" uuid NOT NULL,
	"handoff_item_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"engine_key" text NOT NULL,
	"position" integer NOT NULL,
	"segment" text,
	"action" text NOT NULL,
	"runner_up" jsonb,
	"rec" jsonb NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"owner_email" text,
	"status" text NOT NULL,
	"why" text,
	"released" text,
	"routed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_segment" text,
	"segment_at" timestamp with time zone,
	"use_runner_up" boolean DEFAULT false NOT NULL,
	"manual_action" text,
	"channel_pref" text,
	"variant" text,
	"contact_row" integer,
	"draft_version" integer DEFAULT 1 NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"edit_rating" text,
	"fixed" text[] DEFAULT '{}'::text[] NOT NULL,
	"alternative_used" boolean DEFAULT false NOT NULL,
	"alternative_of" text,
	"reject_code" text,
	"sent_back_note" text,
	"spot" text,
	"spot_week" text,
	"hold_why" text,
	"hold_note" text,
	"hold_at" timestamp with time zone,
	"hold_by" uuid,
	"outcome" text,
	"meeting" jsonb,
	"opened_at" timestamp with time zone,
	"opened_by" uuid,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "recommendations_status_check" CHECK ("recommendations"."status" in ('Waiting', 'Awaiting approval', 'Released', 'Closed', 'Set aside', 'Watch list')),
	CONSTRAINT "recommendations_why_check" CHECK ("recommendations"."why" is null or "recommendations"."why" in ('exception', 'sensitive', 'alternative', 'sent back', 'stepped in')),
	CONSTRAINT "recommendations_released_check" CHECK ("recommendations"."released" is null or "recommendations"."released" in ('auto', 'accepted', 'approved')),
	CONSTRAINT "recommendations_spot_check" CHECK ("recommendations"."spot" is null or "recommendations"."spot" in ('pending', 'accepted', 'rejected')),
	CONSTRAINT "recommendations_outcome_check" CHECK ("recommendations"."outcome" is null or "recommendations"."outcome" in ('Sent', 'Replied', 'Meeting booked', 'No response')),
	CONSTRAINT "recommendations_reject_code_check" CHECK ("recommendations"."reject_code" is null or "recommendations"."reject_code" in ('R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12')),
	CONSTRAINT "recommendations_edit_rating_check" CHECK ("recommendations"."edit_rating" is null or "recommendations"."edit_rating" in ('minor', 'major')),
	CONSTRAINT "recommendations_channel_check" CHECK ("recommendations"."channel_pref" is null or "recommendations"."channel_pref" in ('Email', 'LinkedIn')),
	CONSTRAINT "recommendations_owner_lower_check" CHECK ("recommendations"."owner_email" is null or "recommendations"."owner_email" = lower("recommendations"."owner_email"))
);
--> statement-breakpoint
CREATE TABLE "segment_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "segment_pauses_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_unit_id" uuid NOT NULL,
	"nba_run_id" uuid NOT NULL,
	"segment" text NOT NULL,
	"action" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "segment_pauses_action_check" CHECK ("segment_pauses"."action" in ('pause', 'resume'))
);
--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_nba_run_id_nba_runs_id_fk" FOREIGN KEY ("nba_run_id") REFERENCES "public"."nba_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_linked_to_decision_log_id_fk" FOREIGN KEY ("linked_to") REFERENCES "public"."decision_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_brand_version_id_brand_versions_id_fk" FOREIGN KEY ("brand_version_id") REFERENCES "public"."brand_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_brand_version_id_brand_versions_id_fk" FOREIGN KEY ("brand_version_id") REFERENCES "public"."brand_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nba_runs" ADD CONSTRAINT "nba_runs_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nba_runs" ADD CONSTRAINT "nba_runs_handoff_id_handoffs_id_fk" FOREIGN KEY ("handoff_id") REFERENCES "public"."handoffs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nba_runs" ADD CONSTRAINT "nba_runs_scoring_run_id_scoring_runs_id_fk" FOREIGN KEY ("scoring_run_id") REFERENCES "public"."scoring_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nba_runs" ADD CONSTRAINT "nba_runs_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nba_runs" ADD CONSTRAINT "nba_runs_brand_version_id_brand_versions_id_fk" FOREIGN KEY ("brand_version_id") REFERENCES "public"."brand_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nba_runs" ADD CONSTRAINT "nba_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nba_runs" ADD CONSTRAINT "nba_runs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_nba_run_id_nba_runs_id_fk" FOREIGN KEY ("nba_run_id") REFERENCES "public"."nba_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_handoff_item_id_handoff_items_id_fk" FOREIGN KEY ("handoff_item_id") REFERENCES "public"."handoff_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_hold_by_users_id_fk" FOREIGN KEY ("hold_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_pauses" ADD CONSTRAINT "segment_pauses_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_pauses" ADD CONSTRAINT "segment_pauses_nba_run_id_nba_runs_id_fk" FOREIGN KEY ("nba_run_id") REFERENCES "public"."nba_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_pauses" ADD CONSTRAINT "segment_pauses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "decision_log_seq_key" ON "decision_log" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "decision_log_bu_seq_idx" ON "decision_log" USING btree ("business_unit_id","seq");--> statement-breakpoint
CREATE INDEX "decision_log_recommendation_idx" ON "decision_log" USING btree ("recommendation_id","seq");--> statement-breakpoint
CREATE INDEX "decision_log_run_idx" ON "decision_log" USING btree ("nba_run_id");--> statement-breakpoint
CREATE INDEX "decision_log_actor_idx" ON "decision_log" USING btree ("business_unit_id","created_by");--> statement-breakpoint
CREATE INDEX "decision_log_linked_idx" ON "decision_log" USING btree ("linked_to");--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_recommendation_version_key" ON "drafts" USING btree ("recommendation_id","version");--> statement-breakpoint
CREATE INDEX "drafts_bu_idx" ON "drafts" USING btree ("business_unit_id");--> statement-breakpoint
CREATE INDEX "nba_runs_bu_time_idx" ON "nba_runs" USING btree ("business_unit_id","created_at");--> statement-breakpoint
CREATE INDEX "nba_runs_handoff_idx" ON "nba_runs" USING btree ("handoff_id");--> statement-breakpoint
CREATE INDEX "nba_runs_scoring_run_idx" ON "nba_runs" USING btree ("scoring_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_run_key" ON "recommendations" USING btree ("nba_run_id","engine_key");--> statement-breakpoint
CREATE INDEX "recommendations_run_position_idx" ON "recommendations" USING btree ("nba_run_id","position");--> statement-breakpoint
CREATE INDEX "recommendations_bu_status_idx" ON "recommendations" USING btree ("business_unit_id","status");--> statement-breakpoint
CREATE INDEX "recommendations_owner_idx" ON "recommendations" USING btree ("business_unit_id","owner_email");--> statement-breakpoint
CREATE INDEX "recommendations_handoff_item_idx" ON "recommendations" USING btree ("handoff_item_id");--> statement-breakpoint
CREATE INDEX "recommendations_account_idx" ON "recommendations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "recommendations_contact_idx" ON "recommendations" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "segment_pauses_run_seq_idx" ON "segment_pauses" USING btree ("nba_run_id","seq");--> statement-breakpoint
CREATE INDEX "segment_pauses_bu_idx" ON "segment_pauses" USING btree ("business_unit_id");