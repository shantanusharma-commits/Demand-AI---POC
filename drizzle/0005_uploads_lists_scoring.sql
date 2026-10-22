CREATE TABLE "account_scores" (
	"run_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"owner_email" text,
	"tier" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "account_scores_pkey" PRIMARY KEY("run_id","account_id"),
	CONSTRAINT "account_scores_owner_lower_check" CHECK ("account_scores"."owner_email" is null or "account_scores"."owner_email" = lower("account_scores"."owner_email"))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"engine_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_email" text,
	"excluded" boolean NOT NULL,
	"needs_review" boolean NOT NULL,
	"search" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "accounts_owner_lower_check" CHECK ("accounts"."owner_email" is null or "accounts"."owner_email" = lower("accounts"."owner_email"))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"status_group" text NOT NULL,
	"owner_email" text,
	"search" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "contacts_status_group_check" CHECK ("contacts"."status_group" in ('in', 'nc', 'out')),
	CONSTRAINT "contacts_owner_lower_check" CHECK ("contacts"."owner_email" is null or "contacts"."owner_email" = lower("contacts"."owner_email"))
);
--> statement-breakpoint
CREATE TABLE "handoff_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"handoff_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"owner_email" text,
	"position" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "handoff_items_owner_lower_check" CHECK ("handoff_items"."owner_email" is null or "handoff_items"."owner_email" = lower("handoff_items"."owner_email"))
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"selection" text NOT NULL,
	"item_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "handoffs_selection_check" CHECK ("handoffs"."selection" in ('default', 'selected'))
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"list_id" uuid,
	"run_id" uuid,
	"seq" integer NOT NULL,
	"row_no" integer,
	"attach_row_no" integer,
	"owner_email" text,
	"check_key" text NOT NULL,
	"severity" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "issues_parent_check" CHECK (num_nonnulls("issues"."list_id", "issues"."run_id") = 1),
	CONSTRAINT "issues_severity_check" CHECK ("issues"."severity" in ('stop', 'flag', 'info')),
	CONSTRAINT "issues_owner_lower_check" CHECK ("issues"."owner_email" is null or "issues"."owner_email" = lower("issues"."owner_email"))
);
--> statement-breakpoint
CREATE TABLE "lead_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"parent_list_id" uuid,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sandbox" boolean DEFAULT false NOT NULL,
	"source_file" text NOT NULL,
	"sheet_name" text NOT NULL,
	"config_version_id" uuid,
	"engine_version" text NOT NULL,
	"stats" jsonb NOT NULL,
	"checks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"saved_at" timestamp with time zone,
	CONSTRAINT "lead_lists_status_check" CHECK ("lead_lists"."status" in ('draft', 'saved'))
);
--> statement-breakpoint
CREATE TABLE "prospect_scores" (
	"run_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"owner_email" text,
	"rank_no" integer NOT NULL,
	"tier" text NOT NULL,
	"score" double precision,
	"fit" double precision,
	"timing" double precision,
	"sendable" boolean NOT NULL,
	"search" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "prospect_scores_pkey" PRIMARY KEY("run_id","contact_id"),
	CONSTRAINT "prospect_scores_tier_check" CHECK ("prospect_scores"."tier" in ('A', 'B', 'C', 'Watch list', 'Below fit floor', 'Excluded')),
	CONSTRAINT "prospect_scores_owner_lower_check" CHECK ("prospect_scores"."owner_email" is null or "prospect_scores"."owner_email" = lower("prospect_scores"."owner_email"))
);
--> statement-breakpoint
CREATE TABLE "scoring_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"signal_upload_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"name" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sandbox" boolean DEFAULT false NOT NULL,
	"source_file" text NOT NULL,
	"sheet_name" text,
	"config_version_id" uuid,
	"engine_version" text NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"saved_at" timestamp with time zone,
	CONSTRAINT "scoring_runs_status_check" CHECK ("scoring_runs"."status" in ('draft', 'saved'))
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"row_no" integer NOT NULL,
	"account_id" uuid,
	"contact_id" uuid,
	"owner_email" text,
	"status" text NOT NULL,
	"search" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "signals_owner_lower_check" CHECK ("signals"."owner_email" is null or "signals"."owner_email" = lower("signals"."owner_email"))
);
--> statement-breakpoint
CREATE TABLE "upload_files" (
	"upload_id" uuid PRIMARY KEY NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"format" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"sandbox" boolean DEFAULT false NOT NULL,
	"sheet_name" text,
	"rows_read" integer,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "uploads_kind_check" CHECK ("uploads"."kind" in ('lead', 'signal')),
	CONSTRAINT "uploads_format_check" CHECK ("uploads"."format" in ('xlsx', 'xls', 'csv')),
	CONSTRAINT "uploads_size_check" CHECK ("uploads"."byte_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "account_scores" ADD CONSTRAINT "account_scores_run_id_scoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scoring_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_scores" ADD CONSTRAINT "account_scores_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_scores" ADD CONSTRAINT "account_scores_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_scores" ADD CONSTRAINT "account_scores_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_list_id_lead_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lead_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_list_id_lead_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lead_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_items" ADD CONSTRAINT "handoff_items_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_items" ADD CONSTRAINT "handoff_items_handoff_id_handoffs_id_fk" FOREIGN KEY ("handoff_id") REFERENCES "public"."handoffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_items" ADD CONSTRAINT "handoff_items_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_items" ADD CONSTRAINT "handoff_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_items" ADD CONSTRAINT "handoff_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_run_id_scoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scoring_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_list_id_lead_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lead_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_run_id_scoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scoring_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_parent_list_id_lead_lists_id_fk" FOREIGN KEY ("parent_list_id") REFERENCES "public"."lead_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_scores" ADD CONSTRAINT "prospect_scores_run_id_scoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scoring_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_scores" ADD CONSTRAINT "prospect_scores_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_scores" ADD CONSTRAINT "prospect_scores_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_scores" ADD CONSTRAINT "prospect_scores_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_scores" ADD CONSTRAINT "prospect_scores_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_runs" ADD CONSTRAINT "scoring_runs_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_runs" ADD CONSTRAINT "scoring_runs_list_id_lead_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lead_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_runs" ADD CONSTRAINT "scoring_runs_signal_upload_id_uploads_id_fk" FOREIGN KEY ("signal_upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_runs" ADD CONSTRAINT "scoring_runs_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_runs" ADD CONSTRAINT "scoring_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_runs" ADD CONSTRAINT "scoring_runs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_run_id_scoring_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scoring_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_files" ADD CONSTRAINT "upload_files_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_files" ADD CONSTRAINT "upload_files_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_files" ADD CONSTRAINT "upload_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_scores_account_idx" ON "account_scores" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_scores_bu_idx" ON "account_scores" USING btree ("business_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_list_engine_key" ON "accounts" USING btree ("list_id","engine_id");--> statement-breakpoint
CREATE INDEX "accounts_list_seq_idx" ON "accounts" USING btree ("list_id","seq");--> statement-breakpoint
CREATE INDEX "accounts_list_owner_idx" ON "accounts" USING btree ("list_id","owner_email");--> statement-breakpoint
CREATE INDEX "accounts_bu_idx" ON "accounts" USING btree ("business_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_list_row_key" ON "contacts" USING btree ("list_id","row_no");--> statement-breakpoint
CREATE INDEX "contacts_list_owner_idx" ON "contacts" USING btree ("list_id","owner_email");--> statement-breakpoint
CREATE INDEX "contacts_account_idx" ON "contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "contacts_bu_idx" ON "contacts" USING btree ("business_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "handoff_items_handoff_contact_key" ON "handoff_items" USING btree ("handoff_id","contact_id");--> statement-breakpoint
CREATE INDEX "handoff_items_handoff_position_idx" ON "handoff_items" USING btree ("handoff_id","position");--> statement-breakpoint
CREATE INDEX "handoff_items_contact_idx" ON "handoff_items" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "handoff_items_account_idx" ON "handoff_items" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "handoff_items_bu_idx" ON "handoff_items" USING btree ("business_unit_id");--> statement-breakpoint
CREATE INDEX "handoffs_run_idx" ON "handoffs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "handoffs_bu_time_idx" ON "handoffs" USING btree ("business_unit_id","created_at");--> statement-breakpoint
CREATE INDEX "issues_list_attach_idx" ON "issues" USING btree ("list_id","attach_row_no");--> statement-breakpoint
CREATE INDEX "issues_list_check_idx" ON "issues" USING btree ("list_id","check_key");--> statement-breakpoint
CREATE INDEX "issues_run_idx" ON "issues" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "issues_bu_idx" ON "issues" USING btree ("business_unit_id");--> statement-breakpoint
CREATE INDEX "lead_lists_bu_status_idx" ON "lead_lists" USING btree ("business_unit_id","status","created_at");--> statement-breakpoint
CREATE INDEX "lead_lists_upload_idx" ON "lead_lists" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "lead_lists_parent_idx" ON "lead_lists" USING btree ("parent_list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prospect_scores_run_rank_key" ON "prospect_scores" USING btree ("run_id","rank_no");--> statement-breakpoint
CREATE INDEX "prospect_scores_run_owner_idx" ON "prospect_scores" USING btree ("run_id","owner_email");--> statement-breakpoint
CREATE INDEX "prospect_scores_contact_idx" ON "prospect_scores" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "prospect_scores_account_idx" ON "prospect_scores" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "prospect_scores_bu_idx" ON "prospect_scores" USING btree ("business_unit_id");--> statement-breakpoint
CREATE INDEX "scoring_runs_bu_status_idx" ON "scoring_runs" USING btree ("business_unit_id","status","created_at");--> statement-breakpoint
CREATE INDEX "scoring_runs_list_idx" ON "scoring_runs" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "scoring_runs_upload_idx" ON "scoring_runs" USING btree ("signal_upload_id");--> statement-breakpoint
CREATE INDEX "signals_run_seq_idx" ON "signals" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "signals_run_contact_idx" ON "signals" USING btree ("run_id","contact_id");--> statement-breakpoint
CREATE INDEX "signals_account_idx" ON "signals" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "signals_contact_idx" ON "signals" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "signals_bu_idx" ON "signals" USING btree ("business_unit_id");--> statement-breakpoint
CREATE INDEX "upload_files_bu_idx" ON "upload_files" USING btree ("business_unit_id");--> statement-breakpoint
CREATE INDEX "uploads_bu_time_idx" ON "uploads" USING btree ("business_unit_id","created_at");