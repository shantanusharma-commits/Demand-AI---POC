CREATE TABLE "review_views" (
	"business_unit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_views_pkey" PRIMARY KEY("business_unit_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "spot_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_unit_id" uuid NOT NULL,
	"iso_week" text NOT NULL,
	"owner_email" text NOT NULL,
	"eligible" integer NOT NULL,
	"picked" uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "spot_checks_owner_lower_check" CHECK ("spot_checks"."owner_email" is null or "spot_checks"."owner_email" = lower("spot_checks"."owner_email"))
);
--> statement-breakpoint
ALTER TABLE "review_views" ADD CONSTRAINT "review_views_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_views" ADD CONSTRAINT "review_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_checks" ADD CONSTRAINT "spot_checks_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_checks" ADD CONSTRAINT "spot_checks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spot_checks_bu_week_owner_key" ON "spot_checks" USING btree ("business_unit_id","iso_week","owner_email");