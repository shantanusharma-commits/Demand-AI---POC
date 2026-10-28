ALTER TABLE "studio_items" ADD COLUMN "audience" text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- Hand-added (D-45): a piece written before keeps who it was for, in the words the studio showed for its micro-segment.
UPDATE "studio_items" SET "audience" = CASE "segment"
  WHEN 'Modernisation' THEN 'Sites planning a control system migration'
  WHEN 'Inquiry' THEN 'Accounts that asked us a question'
  WHEN 'Service renewal' THEN 'Customers with a renewal coming up'
  WHEN 'Project' THEN 'Teams starting a new project'
  WHEN 'Leadership' THEN 'Newly appointed plant leaders'
  WHEN 'Engagement' THEN 'Accounts reading our content'
  ELSE "segment" END;
