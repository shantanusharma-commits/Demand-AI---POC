CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "ai_calls_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_unit_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"template_id" text NOT NULL,
	"template_version" integer NOT NULL,
	"provider" text NOT NULL,
	"deployment" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"attempts" integer NOT NULL,
	"outcome" text NOT NULL,
	"fallback_reason" text,
	"filter_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"est_cost_usd" double precision,
	"request_id" text,
	"provider_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "ai_calls_capability_check" CHECK ("ai_calls"."capability" in ('classify', 'why_now', 'draft_message', 'draft_content', 'copilot', 'healthcheck')),
	CONSTRAINT "ai_calls_outcome_check" CHECK ("ai_calls"."outcome" in ('ok', 'fallback', 'filtered', 'error')),
	CONSTRAINT "ai_calls_provider_check" CHECK ("ai_calls"."provider" in ('azure-openai', 'bedrock')),
	CONSTRAINT "ai_calls_reason_check" CHECK (("ai_calls"."outcome" = 'ok') = ("ai_calls"."fallback_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_bu_seq_idx" ON "ai_calls" USING btree ("business_unit_id","seq");--> statement-breakpoint
CREATE INDEX "ai_calls_bu_capability_idx" ON "ai_calls" USING btree ("business_unit_id","capability","created_at");