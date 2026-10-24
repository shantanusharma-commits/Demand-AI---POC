# Gap status: G-001 to G-065

The audit's gaps (16 Oct 2026) and where each stands at the end of the remediation (24 Oct 2026, branch `remediation/poc-hardening`). **Fixed** means a test or a rehearsal proves it; **provisional** means built on a value the Client is to confirm; **Deferred** is by the user's written decision. Severity: C critical, H high, M medium, L low. Test files are under `tests/` unless they start with `e2e/`.

| Gap | Sev | Gap | Status | Evidence | Main files |
|---|---|---|---|---|---|
| G-001 | C | No sign-in; the role is a browser setting | Fixed | integration/auth.test.ts; http/auth-http.test.ts (route inventory, role × route matrix); e2e/setup.spec.ts, e2e/02-roles.spec.ts | lib/server/auth/, proxy.ts, lib/auth/permissions.ts, components/AppShell.tsx |
| G-002 | C | Setup in memory; no signal switches, reasons or audit | Fixed | integration/setup.test.ts | services/setup.ts, SetupScreen.tsx |
| G-003 | C | Users and roles a fixed demo list | Fixed | integration/auth.test.ts; http/auth-http.test.ts (invite, last Admin); e2e/setup.spec.ts | services/users.ts, UsersScreen.tsx |
| G-004 | C | Lists above ~4,000 contacts can't be saved | Fixed | integration/prospecting.test.ts (full sample, 20,000 rows); e2e/01-two-users.spec.ts; e2e/04-performance.spec.ts | services/uploads.ts, services/lists.ts, lib/server/jobs/ |
| G-005 | C | Hand-off ignores consent and unconfirmed opt-out | Fixed | rules.test.ts (one test per suppression reason); answer-key.test.ts (no non-contactable person handed off) | lib/demandai-engine.ts (`canContact`), services/handoffs.ts |
| G-006 | C | NBA a fixed mock with false messages | Fixed | integration/nba.test.ts; e2e/01-two-users.spec.ts | services/nba.ts, lib/engine/nba.ts, NbaScreen.tsx |
| G-007 | C | Channel choice ignores an unconfirmed opt-out | Fixed | legacy-port.test.ts; answer-key ceiling `recommendationsNotContactable: 0`; review release guard | lib/engine/nba.ts (`allowedChannels`), services/review.ts |
| G-008 | C | For Review shows fictional exceptions; nothing saved | Fixed | integration/review.test.ts; review.test.ts; e2e/01-two-users.spec.ts (two users) | services/review.ts, lib/engine/review.ts, ReviewScreen.tsx |
| G-009 | C | Content library in memory; drafts don't read it | Fixed | integration/brand.test.ts; content.test.ts | services/brand.ts, lib/content/brand.ts, ContentScreen.tsx |
| G-010 | C | Today static with invented numbers | Fixed | integration/today.test.ts; gates.test.ts; screens.test.ts (no bare numbers) | services/today.ts, lib/engine/gates.ts, TodayScreen.tsx |
| G-011 | C | Analytics with fixed G1/G2; false export | Fixed | integration/analytics.test.ts; e2e/01-two-users.spec.ts (G1, G2 from the server) | services/analytics.ts, AnalyticsScreen.tsx |
| G-012 | C | No server-side persistence | Fixed | e2e/01-two-users.spec.ts (a fresh browser finds the list); the integration suite | lib/server/db/, every service |
| G-013 | H | Copilot only in the legacy runtime | Fixed | copilot.test.ts; integration/copilot.test.ts; http/ai-http.test.ts | lib/ai/copilot.ts, services/copilot.ts, components/Copilot.tsx |
| G-014 | H | No owner scoping | Fixed | integration/owner-scoping.test.ts (database and service layers, each alone); http rep IDOR tests; e2e/02-roles.spec.ts | drizzle RLS policies, lib/server/db/tenant.ts |
| G-015 | H | Prospecting lacks % clean, check panes, row edits, corrections, report | Fixed | prospecting.test.ts; corrections.test.ts; integration/corrections.test.ts | services/corrections.ts, lib/engine/corrections.ts, ProspectingScreen.tsx |
| G-016 | H | Country not normalised | Fixed | rules.test.ts; answer key FMT-COUNTRY 49/49 | lib/demandai-engine.ts |
| G-017 | H | Account attributes from the first row | Fixed | rules.test.ts; answer key | lib/demandai-engine.ts |
| G-018 | H | Unreadable "managed separately" fails open | Fixed | rules.test.ts (D-17); answer key ICP-MANAGED 46/46 | lib/demandai-engine.ts |
| G-019 | H | Email validation gaps | Fixed | rules.test.ts; answer key EM-* 100% | lib/demandai-engine.ts |
| G-020 | H | Persona rules miss the core persona | Fixed, provisional (D-15) | answer key (all 438 Instrument Engineers Primary) | lib/demandai-engine.ts (persona v1) |
| G-021 | H | Industry gaps; AI classifier not connected | Fixed, provisional (D-15; AI off until agreed) | rules and answer key; ai-classify.test.ts; ai-evaluation.test.ts; live runs (docs/AI.md §4: 642/643, 0 core) | lib/ai/classify.ts, services/industry-ai.ts |
| G-022 | H | Screens freeze at volume | Fixed | integration volume test; e2e/04-performance.spec.ts (first rows < 0.3 s, keystroke < 50 ms at 20,000 rows) | lib/client/use-paged.ts, list APIs |
| G-023 | H | Scoring lacks legacy features; outdated hand-off key | Fixed | integration/scoring.test.ts; scoring.test.ts | services/scoring.ts, services/signal-monitoring.ts, ScoringScreen.tsx |
| G-024 | H | Excel dates a day early in Asian time zones | Fixed | uploads.test.ts (dates read under UTC, Asia/Kolkata, Asia/Singapore) | lib/server/uploads/parse.ts, lib/engine/sheets.ts |
| G-025 | H | Scoring AI steps are rules | Fixed within D-5 (why-now; 4.4 and 4.7 stay rules) | ai-why-now.test.ts; live runs 144/144 | lib/ai/why-now.ts, services/why-now-ai.ts |
| G-026 | H | NBA AI steps are rules | Fixed within D-5 (drafting; 5.5 and 5.17 stay rules) | ai-draft.test.ts; live runs 40/40 | lib/ai/draft.ts, services/nba-ai.ts |
| G-027 | H | Content studio only in legacy | Fixed (in scope by D-36) | studio.test.ts; integration/studio.test.ts; ai-studio.test.ts | lib/content/studio.ts, services/studio.ts, StudioScreen.tsx |
| G-028 | H | SheetJS advisories; CDN scripts without integrity | Fixed | `npm run audit:gate` (production 0); vendor/xlsx-0.20.3.tgz with checksum; nonce CSP | vendor/, package.json |
| G-029 | H | Personal data in browser storage | Fixed | screens.test.ts (storage holds three UI preferences); e2e/01-two-users.spec.ts; purge and export (ADR 0004) | every screen; migration 0037 |
| G-030 | H | reference_content/ not ignored; no .dockerignore | Fixed | repo-hygiene.test.ts | .gitignore, .dockerignore |
| G-031 | H | Hosting and platform not recorded | Fixed | docs/adr/0001-platform-and-hosting.md; deploy/ validated (deploy/check.sh) | docs/devops/, deploy/ |
| G-032 | H | npm test fails; runtime not pinned | Fixed | CI on Node 24.22.1; `npm test` | .nvmrc, package.json |
| G-033 | H | Tests cover only the engine; no CI | Fixed | .github/workflows/ci.yml (every plan §9 gate: checks, integration, e2e on the Compose stack) | .github/workflows/, e2e/ |
| G-034 | M | Admin can't open For Review | Fixed | http/auth-http.test.ts (role × route matrix) | lib/auth/permissions.ts |
| G-035 | M | Accessibility: keyboard and contrast | Fixed | e2e/03-accessibility.spec.ts (axe on every route and data state; keyboard-only upload) | app/globals.css, components/Tabs.tsx, screens |
| G-036 | M | Setup edits don't reach scoring | Fixed (D-13) | integration/setup.test.ts; integration/scoring.test.ts (settings stamped per run) | services/setup.ts, services/scoring.ts |
| G-037 | M | A merged duplicate skips the remaining checks | Fixed | rules.test.ts (both row orders, N-01) | lib/demandai-engine.ts |
| G-038 | M | Accounts grouped by name, not domain | Fixed | rules.test.ts; answer key (1,401 accounts for 1,400) | lib/demandai-engine.ts |
| G-039 | M | LinkedIn country sub-domains | Fixed | rules.test.ts | lib/demandai-engine.ts |
| G-040 | M | No column mapping | Fixed | integration/mappings.test.ts | services/mappings.ts, ProspectingScreen.tsx |
| G-041 | M | Near-duplicates not detected | Fixed (flagged, never merged) | rules.test.ts; answer key DUP-FUZZY 70/70 | lib/demandai-engine.ts |
| G-042 | M | Account-type and consent variants | Fixed, provisional (D-14) | rules.test.ts; answer key FMT-CONSENT 60/60 | lib/demandai-engine.ts (synonyms v1) |
| G-043 | M | Fixed 4.6-second checks animation | Fixed (real job progress) | integration/prospecting.test.ts; e2e flows | lib/server/jobs/, ProspectingScreen.tsx |
| G-044 | M | Signals matched by company name only | Fixed | rules.test.ts (domain, name variants, initials) | lib/demandai-engine.ts |
| G-045 | M | Signal-type synonyms rejected | Fixed, provisional (D-14) | rules.test.ts | lib/demandai-engine.ts |
| G-046 | M | Score scale differs from the spec | Fixed, provisional (D-9: kept and labelled) | scoring screen; ADR 0006 | ScoringScreen.tsx |
| G-047 | M | Repeat weighting and timing modifiers | **Deferred: user decision D-43** | ADR 0007 | — |
| G-048 | M | Ranks people; the spec ranks accounts | Fixed, provisional (D-12: account tier beside) | scoring screen; ADR 0006 | ScoringScreen.tsx |
| G-049 | M | Hand-off IDs can collide | Fixed (UUID per prospect) | integration/prospecting.test.ts (117 distinct) | services/handoffs.ts |
| G-050 | M | Signal template contact column | Fixed (D-16) | rules.test.ts | lib/demandai-engine.ts |
| G-051 | M | Drafts without approved proof go out | Fixed (D-10: a task for the owner) | legacy-port.test.ts (:262, :375) | lib/engine/nba.ts |
| G-052 | M | CSV formula injection | Fixed | csv-export.test.ts (`CsvText` by construction; no other text/csv) | lib/demandai-engine.ts (`toCSV`), lib/server/http/download.ts |
| G-053 | M | Two diverging engines | Fixed | legacy-port.test.ts (every legacy test ported); answer key as the oracle | lib/engine/, lib/demandai-engine.ts |
| G-054 | M | No security headers or CSP; third-party fonts | Fixed | csp.test.ts; http/headers-http.test.ts | proxy.ts, lib/security/csp.ts, next.config.ts |
| G-055 | M | Orphan gitlink | Fixed | repo-hygiene.test.ts | — |
| G-056 | M | No deployment files, health check, logging, monitoring or backups | Fixed | integration/health.test.ts; seed-backup.test.ts (restore); rollback rehearsal (docs/devops/REDEPLOY.md §5) | lib/server/health.ts, logger.ts, db/backup.sh, deploy/, docs/devops/ |
| G-057 | M | Answer key not an automated test | Fixed | answer-key.test.ts | tests/helpers/answer-key.ts |
| G-058 | M | Agentic orchestration missing | **Deferred: user decision D-42** | ADR 0008 | — |
| G-059 | L | CSV encoding, delimiter, size | Fixed | uploads.test.ts; http/uploads-http.test.ts | lib/server/uploads/ |
| G-060 | L | Opt-out conflicts between duplicates not flagged | Fixed | rules.test.ts | lib/demandai-engine.ts |
| G-061 | L | Invalid "Score as of" becomes today | Fixed (refused with a reason, never replaced) | integration/prospecting.test.ts (a future as-of date refused) | ScoringScreen.tsx, services/scoring.ts |
| G-062 | L | Reject code R3 not offered | Fixed (D-18) | review.test.ts | lib/engine/review.ts |
| G-063 | L | Dead controls and demo leftovers | Fixed | browser pass (Phase 5d); screens.test.ts | screens |
| G-064 | L | The Client's real name in a tracked script | Fixed in the files (still in git history: D-23 option a) | repo-hygiene.test.ts | test-data/generate_lead_dataset.py |
| G-065 | L | Repository hygiene and documentation | Fixed | README.md, docs/ | — |

**Totals:** 63 fixed (6 of them on provisional values the Client is to confirm: G-020, G-021, G-042, G-045, G-046, G-048), 2 deferred by the user's decision (G-047, G-058), none pending a decision.
