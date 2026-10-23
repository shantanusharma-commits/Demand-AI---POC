-- Lead routing (D-34): a unit's routing rules, and accounts moved between units (hand-written, reviewed).
--
-- Routing rules are configuration of their unit: everyone in it reads them, managers change them (the service checks
-- the role; every change is audited). A transfer is written by the unit the account leaves and read by both units; it
-- is the record of the move, so it is append-only.

ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY routing_rules_business_unit ON routing_rules
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON routing_rules TO demandai_app;
--> statement-breakpoint

ALTER TABLE account_transfers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY account_transfers_both_units ON account_transfers
  USING (business_unit_id = app_bu() OR to_business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
CREATE TRIGGER account_transfers_append_only BEFORE UPDATE OR DELETE ON account_transfers FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
CREATE TRIGGER account_transfers_no_truncate BEFORE TRUNCATE ON account_transfers FOR EACH STATEMENT EXECUTE FUNCTION forbid_update_delete();
--> statement-breakpoint
GRANT SELECT, INSERT ON account_transfers TO demandai_app;
