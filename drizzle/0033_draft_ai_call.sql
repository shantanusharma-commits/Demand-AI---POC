ALTER TABLE "drafts" ADD COLUMN "ai_call_id" uuid;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_ai_check" CHECK (("drafts"."ai_call_id" is null) or "drafts"."ai_assisted");