CREATE TABLE "copilot_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"screen" text NOT NULL,
	"ref_key" text NOT NULL,
	"ref" jsonb NOT NULL,
	"list_id" uuid,
	"run_id" uuid,
	"nba_run_id" uuid,
	"item_id" uuid,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copilot_chats_screen_check" CHECK ("copilot_chats"."screen" in ('today', 'review', 'nba', 'prospecting', 'scoring'))
);
--> statement-breakpoint
CREATE TABLE "copilot_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "copilot_messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"business_unit_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"answer" jsonb,
	"focus" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "copilot_messages_role_check" CHECK ("copilot_messages"."role" in ('you', 'copilot')),
	CONSTRAINT "copilot_messages_answer_check" CHECK (("copilot_messages"."role" = 'copilot') = ("copilot_messages"."answer" is not null))
);
--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD CONSTRAINT "copilot_chats_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD CONSTRAINT "copilot_chats_list_id_lead_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lead_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD CONSTRAINT "copilot_chats_run_id_scoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scoring_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD CONSTRAINT "copilot_chats_nba_run_id_nba_runs_id_fk" FOREIGN KEY ("nba_run_id") REFERENCES "public"."nba_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD CONSTRAINT "copilot_chats_item_id_recommendations_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD CONSTRAINT "copilot_chats_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_chat_id_copilot_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."copilot_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "copilot_chats_owner_idx" ON "copilot_chats" USING btree ("business_unit_id","created_by","screen","updated_at");--> statement-breakpoint
CREATE INDEX "copilot_chats_ref_idx" ON "copilot_chats" USING btree ("created_by","ref_key","updated_at");--> statement-breakpoint
CREATE INDEX "copilot_chats_list_idx" ON "copilot_chats" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "copilot_chats_run_idx" ON "copilot_chats" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "copilot_chats_nba_run_idx" ON "copilot_chats" USING btree ("nba_run_id");--> statement-breakpoint
CREATE INDEX "copilot_chats_item_idx" ON "copilot_chats" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "copilot_messages_chat_idx" ON "copilot_messages" USING btree ("chat_id","seq");--> statement-breakpoint
CREATE INDEX "copilot_messages_bu_idx" ON "copilot_messages" USING btree ("business_unit_id");