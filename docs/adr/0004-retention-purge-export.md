# ADR 0004: Retention, purge and export

**Status:** Accepted with a provisional period, 24 Oct 2026 (D-20; spec 1.6). The Client's contract sets the period.

## Decision

- **When.** A unit's data is due for deletion `RETENTION_DAYS_AFTER_READOUT` days (30 by default) after the latest sponsor decision that ends the pilot ("Stop" or "Go to production"); "Extend the pilot" never starts the clock.
- **What.** The uploads and everything made from them: files, lists, accounts, contacts, issues, corrections, signals, scores, hand-offs, builds, recommendations, drafts, decisions and spot-checks, and Copilot's saved chats about them (by date, every chat last used before it; added 27 Oct 2026 with saved chats, migration 0042). Kept: the audit log, AI call metadata, readouts and sign-offs, configuration, brand packs, Content studio pieces and users. A purge by date also drops cached AI industry answers.
- **How.** `purge_pilot_data()` and the export functions are `SECURITY DEFINER`, executable by the ops role only; the append-only triggers let only the ops role delete, inside the purge. `npm run data:purge` is a dry run unless `--yes`; on EKS the daily CronJob ships as a dry run.
- **Return.** `npm run data:export` writes the original files and every table's rows as JSON Lines with a manifest (counts and SHA-256), before the purge.

## Consequences

The evidence of what happened (audit, decisions as sign-offs, readouts) outlives the personal data. Changing the period is one setting; changing what is kept is a migration.
