-- For Review (G-008): the weekly spot-check draws and when each person was last shown their queue (hand-written,
-- reviewed). A draw is evidence for the success gates, so it is append-only; reps see the draws of their own items
-- (G-014). A queue view belongs to the person it times, and nobody else reads or writes it.

ALTER TABLE spot_checks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY spot_checks_owner ON spot_checks
  USING (business_unit_id = app_bu() AND app_owns(owner_email)) WITH CHECK (business_unit_id = app_bu() AND app_owns(owner_email));
--> statement-breakpoint
CREATE TRIGGER spot_checks_append_only BEFORE UPDATE OR DELETE ON spot_checks FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER spot_checks_no_truncate BEFORE TRUNCATE ON spot_checks FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON spot_checks TO demandai_app;
--> statement-breakpoint

ALTER TABLE review_views ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY review_views_self ON review_views
  USING (business_unit_id = app_bu() AND user_id = app_user()) WITH CHECK (business_unit_id = app_bu() AND user_id = app_user());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON review_views TO demandai_app;
