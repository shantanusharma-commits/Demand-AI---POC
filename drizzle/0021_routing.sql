CREATE TABLE "account_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"to_business_unit_id" uuid NOT NULL,
	"account_key" text NOT NULL,
	"account_name" text NOT NULL,
	"from_list_id" uuid NOT NULL,
	"from_account_id" uuid NOT NULL,
	"rows" integer NOT NULL,
	"reason" text NOT NULL,
	"rule_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "account_transfers_other_unit_check" CHECK ("account_transfers"."to_business_unit_id" <> "account_transfers"."business_unit_id")
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"verticals" text[] DEFAULT '{}'::text[] NOT NULL,
	"tiers" text[] DEFAULT '{}'::text[] NOT NULL,
	"assign_owner" text,
	"target_business_unit_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "routing_rules_owner_lower_check" CHECK ("routing_rules"."assign_owner" is null or "routing_rules"."assign_owner" = lower("routing_rules"."assign_owner"))
);
--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_to_business_unit_id_business_units_id_fk" FOREIGN KEY ("to_business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_target_business_unit_id_business_units_id_fk" FOREIGN KEY ("target_business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_transfers_bu_key_idx" ON "account_transfers" USING btree ("business_unit_id","account_key");--> statement-breakpoint
CREATE INDEX "account_transfers_to_bu_idx" ON "account_transfers" USING btree ("to_business_unit_id");--> statement-breakpoint
CREATE INDEX "routing_rules_bu_position_idx" ON "routing_rules" USING btree ("business_unit_id","position");