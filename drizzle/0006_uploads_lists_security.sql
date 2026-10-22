-- Uploads, lists, scoring and hand-offs: business-unit isolation and owner scoping (hand-written, reviewed).
--
-- Uploads, lists, scoring runs and hand-offs are shared within the business unit (D-33). The rows that hold or
-- describe people (accounts, contacts, issues, signals, scores, hand-off items) are also owner-scoped (G-014):
-- with app.scope = 'own' (Sales rep) only rows whose owner_email is the user's sign-in email or one of their
-- aliases are visible. Rows with no owner are visible to managers only, as the engine's message says
-- ("Only the sales manager sees this account"). Whole-file issues (no row) carry no personal data and are shown
-- to everyone who can see the list. The repositories filter the same way.

CREATE FUNCTION app_owns(owner text) RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT app_scope_all() OR (owner IS NOT NULL AND owner = ANY (app_owner_emails())) $$;
--> statement-breakpoint

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY uploads_business_unit ON uploads
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
ALTER TABLE upload_files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY upload_files_business_unit ON upload_files
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
ALTER TABLE lead_lists ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY lead_lists_business_unit ON lead_lists
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
ALTER TABLE scoring_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY scoring_runs_business_unit ON scoring_runs
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint
ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY handoffs_business_unit ON handoffs
  USING (business_unit_id = app_bu()) WITH CHECK (business_unit_id = app_bu());
--> statement-breakpoint

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY accounts_owner ON accounts
  USING (business_unit_id = app_bu() AND app_owns(owner_email)) WITH CHECK (business_unit_id = app_bu() AND app_owns(owner_email));
--> statement-breakpoint
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY contacts_owner ON contacts
  USING (business_unit_id = app_bu() AND app_owns(owner_email)) WITH CHECK (business_unit_id = app_bu() AND app_owns(owner_email));
--> statement-breakpoint
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY issues_owner ON issues
  USING (business_unit_id = app_bu() AND (app_owns(owner_email) OR (owner_email IS NULL AND row_no IS NULL)))
  WITH CHECK (business_unit_id = app_bu() AND (app_owns(owner_email) OR (owner_email IS NULL AND row_no IS NULL)));
--> statement-breakpoint
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY signals_owner ON signals
  USING (business_unit_id = app_bu() AND app_owns(owner_email)) WITH CHECK (business_unit_id = app_bu() AND app_owns(owner_email));
--> statement-breakpoint
ALTER TABLE account_scores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY account_scores_owner ON account_scores
  USING (business_unit_id = app_bu() AND app_owns(owner_email)) WITH CHECK (business_unit_id = app_bu() AND app_owns(owner_email));
--> statement-breakpoint
ALTER TABLE prospect_scores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY prospect_scores_owner ON prospect_scores
  USING (business_unit_id = app_bu() AND app_owns(owner_email)) WITH CHECK (business_unit_id = app_bu() AND app_owns(owner_email));
--> statement-breakpoint
ALTER TABLE handoff_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY handoff_items_owner ON handoff_items
  USING (business_unit_id = app_bu() AND app_owns(owner_email)) WITH CHECK (business_unit_id = app_bu() AND app_owns(owner_email));
--> statement-breakpoint

-- Grants for the runtime role. Lists and runs are renamed, saved and deleted by people; what the checks and
-- scoring derive is written once by a job and only ever deleted with its list or run (no UPDATE).
GRANT SELECT, INSERT, UPDATE, DELETE ON uploads, lead_lists, scoring_runs TO demandai_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON upload_files, accounts, contacts, issues, signals, account_scores, prospect_scores, handoffs, handoff_items TO demandai_app;
