# POC deployment checklist, with results

The checklist from the codebase audit (§13, 16 Oct 2026), line by line, with where each stands on 24 Oct 2026. **Done** means built and proved by a test or a rehearsal named here; **Deploy** means a setting or step for DevOps at deployment, documented; **Client** means an input or agreement still to come.

## Decision and scope

| Line | Status | Evidence |
|---|---|---|
| Platform, host and deliverable recorded; POC scope of AI, Content studio and Copilot agreed | Done; the AI results still to agree | [ADR 0001](../adr/0001-platform-and-hosting.md) (D-37); scope D-5, D-36, D-42 in the plan; AI switches off until the Client agrees docs/AI.md §4 |
| Product decisions recorded: score scale, no-proof behaviour, frequency and modifiers, person vs account tiers, roles mapping, signal-template version, synonym policy | Done | D-9, D-10, D-43, D-12, D-33, D-16, D-14 (plan §5 and the decision log); ADRs in docs/adr |

## Repository and packaging

| Line | Status | Evidence |
|---|---|---|
| `reference_content/`, `.idea/`, `.playwright-mcp/` ignored; `.dockerignore` present; `git add -A --dry-run` shows none | Done | `.gitignore`, `.dockerignore`; tests/repo-hygiene.test.ts |
| Orphan gitlink removed; `.DS_Store` untracked | Done | Phase 1; repo-hygiene test |
| Release built from a clean checkout of a tagged commit; artefact holds no reference material, test data or answer keys | Done | `.github/workflows/release.yml` builds from the tag; `.dockerignore` keeps out legacy/, tests/, e2e/, test-data/, docs/; the image was checked (no env file, no legacy, tests or Client name) |

## Configuration and secrets

| Line | Status | Evidence |
|---|---|---|
| Runtime pinned (Node ≥ 22.18) in `engines`, `.nvmrc`, CI and the image | Done | Node 24.22.1 in `.nvmrc`, CI (`node-version-file`), the Dockerfile's image by digest |
| Engine configuration versioned and confirmed with the Client | Done (versioned); Client (confirmation) | Configuration versions per business unit, named on every list and run; Setup sign-offs; the values are D-14..D-16 provisional |
| Secrets in the platform's secret store; none in the repository or image | Done; Deploy | AWS Secrets Manager ([SECRETS.md](SECRETS.md)); gitleaks over every commit; CI scans the build output for dummy secrets; the image holds no env file |
| `NEXT_TELEMETRY_DISABLED=1` in CI and production | Done | ci.yml `env`; the Dockerfile |

## Dependencies

| Line | Status | Evidence |
|---|---|---|
| `npm ci` from the lockfile; `npm audit` shows no high or critical (SheetJS upgraded) | Done | CI; `npm run audit:gate` (production 0, allowlist empty); SheetJS 0.20.3 vendored with its checksum |
| No runtime CDN scripts, or SRI on each; fonts self-hosted | Done | Nonce CSP with `strict-dynamic`, `next/font` (Phase 7); tests/csp.test.ts |

## Data and storage

| Line | Status | Evidence |
|---|---|---|
| Server-side storage with encryption at rest; nothing personal in the browser | Done; Deploy (encryption at rest) | PostgreSQL only; browser storage holds three UI preferences (tests/screens.test.ts; the e2e two-user spec checks a fresh browser); RDS storage encrypted with KMS ([RDS.md](RDS.md)) |
| Retention period and deletion procedure agreed and tested | Done (procedure); Client (the period) | Migration 0037, `npm run data:purge` and `data:export`, tests/integration/purge.test.ts; the daily CronJob is a dry run until agreed (D-20: 30 days after the closing decision, provisional) |
| Backups configured and a restore tested | Done (Compose); Deploy (RDS) | The `backup` one-shot before every start, checked; restore in tests/integration/seed-backup.test.ts and the rehearsal ([REDEPLOY.md](REDEPLOY.md) §5); RDS automated backups and the drill ([RDS.md](RDS.md) §5) |
| The full 7,498-row sample flows end to end; a 20,000-row file saves and scores | Done | e2e/01-two-users.spec.ts (the full sample through the screens); e2e/04-performance.spec.ts (7,500 and 20,000 rows checked, saved and scored: 20,000 rows checked in 5.4 s and scored in 2.9 s on the server) |

## Security and compliance

| Line | Status | Evidence |
|---|---|---|
| SSO enforced; every API route authorizes by role and owner or region | Done, with password sign-in instead of SSO (plan revision 2, D-3); SSO is Phase 3b if the Client requires it | Invite-only accounts, lockout and limits; the route inventory and role × route matrix (tests/http); owner scoping at database, service and HTTP level; e2e/02-roles.spec.ts |
| Demo role switcher absent from the client build | Done | Phase 3 |
| Suppression gate: zero non-contactable contacts in hand-offs or recommendations | Done | Answer-key ceiling `recommendationsNotContactable: 0`; G-005, G-007 tests |
| Security headers and `poweredByHeader: false` | Done | Phase 7; tests/http/headers-http.test.ts |
| CSV exports neutralise formulas | Done | `CsvText` (Phase 7); tests/csv-export.test.ts |
| LLM path approved, server-side, logged, with a data-processing agreement | Done (server-side, logged, off by default); Client (approval, DPA) | One gateway, metadata per call (`ai_calls`), docs/AI.md |
| Client security review pack | Done for the delivery team's part | docs/SECURITY.md (threat model, controls), docs/DATA_MODEL.md, docs/AI.md, the lockfile, the test evidence in CI |

## Startup and validation

| Line | Status | Evidence |
|---|---|---|
| Build and start commands documented; health check configured | Done | README; [DEPLOY-EC2.md](DEPLOY-EC2.md), [DEPLOY-EKS.md](DEPLOY-EKS.md); Docker `HEALTHCHECK`, Kubernetes probes on `/api/health` and `/api/ready` |
| Smoke test passes on the deployed URL | Deploy | Steps in [REDEPLOY.md](REDEPLOY.md) §4; the same flows pass on the Compose stack in CI (e2e job) |
| Answer-key regression and E2E suite green on the release commit | Done in CI | `checks` (answer key) and `e2e` jobs on every commit; tag only a green commit |
| UAT by the product owner with the sample and its answer key | Client | |
| No mock data or false messages anywhere | Done | Phase 5d clean-up; tests/screens.test.ts |

## Monitoring and support

| Line | Status | Evidence |
|---|---|---|
| Structured logs, error tracking and uptime alerts routed to a named owner | Done (logs, events, proposed alarms); Deploy (routing, owner) | [OBSERVABILITY.md](OBSERVABILITY.md) |
| Runbook: deploy, roll back, restore, rotate secrets, a failed upload, reprocessing a file | Done | [REDEPLOY.md](REDEPLOY.md), [RDS.md](RDS.md), [SECRETS.md](SECRETS.md), docs/RUNBOOK.md |
| Support contact and response times agreed | Client | |

## Rollback

| Line | Status | Evidence |
|---|---|---|
| Previous release kept deployable; rollback rehearsed; migrations reversible or backed up before release | Done | Forward-only migrations, an older image accepts a newer database; backup or snapshot before every release; rehearsed upgrade, rollback and roll-forward with data ([REDEPLOY.md](REDEPLOY.md) §5) |
