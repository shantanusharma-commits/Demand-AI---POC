-- Sign-in tables are global (a person signs in before choosing a business unit), so they have no row-level
-- security; the auth services are their only readers. Grants for the runtime role:
--   sessions:      create, read, refresh, revoke, and delete expired rows
--   email_tokens:  create, read, mark used (never deleted by the app; they go with the user)
--   rate_limits:   counters, and deletion of old windows
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO demandai_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON email_tokens TO demandai_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO demandai_app;
