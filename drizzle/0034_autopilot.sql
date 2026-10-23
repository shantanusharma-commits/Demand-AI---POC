CREATE TABLE "autopilot_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"instruction" text NOT NULL,
	"items" jsonb NOT NULL,
	"skipped" jsonb NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "autopilot_runs_kind_check" CHECK ("autopilot_runs"."kind" in ('spot', 'exception'))
);
--> statement-breakpoint
ALTER TABLE "decision_log" DROP CONSTRAINT "decision_log_kind_check";--> statement-breakpoint
ALTER TABLE "autopilot_runs" ADD CONSTRAINT "autopilot_runs_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_runs" ADD CONSTRAINT "autopilot_runs_undone_by_users_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_runs" ADD CONSTRAINT "autopilot_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autopilot_runs_bu_idx" ON "autopilot_runs" USING btree ("business_unit_id","created_at");--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_kind_check" CHECK ("decision_log"."kind" is null or "decision_log"."kind" in ('exception', 'spot', 'alternative', 'intervention', 'system', 'manager_check', 'autopilot'));