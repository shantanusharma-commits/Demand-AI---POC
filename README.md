# DemandAI pilot

DemandAI helps an industrial automation supplier's sales team find, qualify and approach prospects: it checks a lead file (Prospecting), scores accounts on fit and recent signals (Account Scoring), groups the best into micro-segments with a next best action and a first message (Micro-segments & NBA), routes what the system could not decide to a person (For Review), and measures the pilot against its success criteria (Today, Analytics). Content library, Content studio, Copilot, Setup and Users and roles support those steps.

It is a Next.js server application with PostgreSQL: people sign in, work in business units, see what their role and ownership allow, and everything they do is kept on the server and audited. An optional AI gateway (Azure OpenAI or Amazon Bedrock) words some steps; every AI step has the rules as its fallback and is switched off until the Client agrees its results.

## Contents

- [Running it locally](#running-it-locally) · [Commands](#commands) · [Configuration](#configuration) · [Architecture](#architecture) · [Screens and roles](#screens-and-roles) · [Tests](#tests) · [Documentation](#documentation)

## Running it locally

Needs Node 24.22.1 (`.nvmrc`; Node 22.18 or later works), Docker with Compose, and nothing on ports 55432 and 55433.

```bash
nvm use                 # Node 24.22.1
npm ci                  # exactly what package-lock.json records (SheetJS comes from vendor/)
npm run setup:env       # writes .env.local with random local secrets (never committed)
npm run db:up           # PostgreSQL 16 for development on 127.0.0.1:55432
npm run db:migrate      # the schema, row-level security and grants
npm run db:seed         # two fictional business units and users (DEV_SEED_PASSWORD in .env.local)
npm run dev             # http://localhost:3000
```

There is no self sign-up. Sign in as a seeded user, or make an administrator with a one-time link:

```bash
npm run user:create-admin -- --unit pilot-bu --email you@example.com --name "Your Name"
```

The built-in sample (**Prospecting › Use sample data**) and `test-data/Lead_Research_Sample_Dataset.xlsx` are fictional.

## Commands

| Command | What it does |
|---|---|
| `npm run dev`, `npm run build`, `npm start` | Develop; production build (standalone output); serve it |
| `npm run lint`, `npm run typecheck` | ESLint (flat config); strict TypeScript for the app, then the tests |
| `npm test` | Unit, engine, answer-key, AI-contract and repository tests (`node --test`, no database) |
| `npm run test:legacy` | The original prototype engine's own tests |
| `npm run db:test:up`, then `npm run test:integration` | Integration tests on PostgreSQL 16 (127.0.0.1:55433): migrations, row-level security, append-only tables, jobs, services, backup and restore |
| `npm run build`, then `npm run test:http` | HTTP tests on the standalone server: route inventory, role × route matrix, CSRF, sign-in, uploads, headers, AI over HTTP with a stand-in |
| `npm run build`, then `npm run test:e2e` | Playwright on the production build: invites, the two-user flow, roles, accessibility (axe), performance at 7,500 and 20,000 rows |
| `npm run audit:gate`, `npm run deps:age`, `npm run check:bundle` | No high or critical advisory in production dependencies; no dependency younger than its minimum age (D-31); no secret value in the build output |
| `npm run db:migrate`, `db:seed`, `db:generate` | Apply migrations; seed development data; generate a migration from `lib/server/db/schema.ts` |
| `npm run user:create-admin` | The first administrator of a unit, or the platform administrator (`--platform`) |
| `npm run data:purge`, `npm run data:export` | The end-of-pilot purge (a dry run unless `--yes`) and the data export, as the ops role (D-20) |
| `AI_LIVE_SMOKE=1 npm run ai:evaluate`, `npm run test:ai-live` | The live AI evaluation and smoke test against the configured model (spend tokens; never in CI) |

## Configuration

Every setting is an environment variable, validated at start-up (`lib/server/env.ts`); a problem stops the server and names the variable, never its value. `.env.example` lists and explains every one. In development they come from `.env.local`; in a deployment from the platform (Compose env file, Kubernetes ConfigMap and Secrets from AWS Secrets Manager). The ones that matter first:

| Group | Variables |
|---|---|
| App | `APP_BASE_URL`, `LOG_LEVEL`, `TRUSTED_PROXY_HOPS` (the app must sit behind one proxy) |
| Database | `DATABASE_URL` (app role), `DATABASE_MIGRATION_URL` (owner role), `DATABASE_OPS_URL` (ops role), `DATABASE_SSL_MODE`, `DATABASE_SSL_CA_FILE` |
| Sessions | `SESSION_SECRET` |
| Email | `NOTIFICATION_DISABLED=1` until SMTP is set up: invite and reset links are shown to copy |
| AI (D-44) | `AI_PROVIDER` (`none` by default), `AZURE_OPENAI_*` (deployments `gpt-5.4` and `gpt-5.4-mini`, API `2025-04-01-preview`), `AI_SMALL_MODEL_FOR`, `AI_REASONING_EFFORT`, `AI_FEATURE_*` (each off unless set) |

## Architecture

```text
browser ──► proxy (Caddy / ALB, TLS) ──► Next.js standalone server (one image)
                                          ├─ pages: Server Components check the session and role, screens are React
                                          ├─ API: route handlers through withApi (session, role, permission, Origin,
                                          │        rate limits, zod input, audit, logging)
                                          ├─ services: business rules per screen, owner-scoped repositories
                                          ├─ engine: lib/engine + lib/demandai-engine.ts (the rules, shared and tested)
                                          ├─ job worker: uploads, scoring and builds as background jobs
                                          └─ AI gateway: lib/ai (Azure OpenAI or Bedrock; rules as fallback)
                                                 │
                                                 ▼
                                   PostgreSQL 16: row-level security per business unit and owner,
                                   append-only logs, three roles (owner, app, ops)
```

- **Business units (D-32).** One deployment, many units; every unit-owned row carries `business_unit_id`, and isolation holds twice: in the services and in PostgreSQL row-level security keyed on per-transaction settings (`withTenant()`).
- **Ownership (D-33).** Reps see the accounts and contacts whose owner email is theirs or an alias; managers and Admins see the unit; Viewers see aggregates.
- **Jobs.** Uploads (checked, parsed and stored), scoring runs and AI-written builds run as jobs claimed with `SKIP LOCKED`; their progress is on screen, and a job left by a stopped process is picked up again.
- **AI (D-5, D-35, D-44).** One server-only gateway with flags, a circuit breaker, a concurrency limit, retries, structured outputs, the capability's own checks and one repair; metadata (never prompts or replies) in `ai_calls`. Details in [docs/AI.md](docs/AI.md).
- **Security.** Invite-only password sign-in with lockout, HMAC-signed database sessions, a nonce CSP and security headers, CSRF by Origin, rate limits, CSV formula neutralisation, audit log; threat model in [docs/SECURITY.md](docs/SECURITY.md).

```text
app/            routes: pages (one per screen) and app/api/** route handlers
components/     AppShell, screens/ (one client component per screen), Copilot, Tabs, pickers
lib/engine/     the rules (prospects, NBA, review, routing, gates, corrections) used by the server and the screens
lib/server/     env, logger, db (schema, pool, tenant), auth, http (withApi), jobs, mail, uploads, services/
lib/ai/         the AI gateway, providers, capabilities (classify, why-now, draft, studio, Copilot), evaluation
drizzle/        SQL migrations (forward-only; schema, row-level security, triggers, grants)
db/             role bootstrap, the Compose init script, the checked backup script
scripts/        migrate, seed, create-admin, purge and export, AI evaluation and diagnostic, CI gates
tests/          unit (tests/*.test.ts), integration/, http/ ; e2e/ holds the Playwright specs
deploy/         Kubernetes (EKS) and EC2 Compose files; deploy/check.sh validates them
legacy/         the original HTML prototype, kept as the reference (not shipped)
test-data/      the fictional 7,498-row sample and its answer key
```

## Screens and roles

| Route | Screen | Admin | Sales manager | Sales rep | Viewer |
|---|---|---|---|---|---|
| `/today` | Today | ✓ | ✓ | ✓ (own items) | |
| `/prospecting` | Prospecting: upload, checks, corrections, saved lists | ✓ | ✓ | ✓ (own accounts) | |
| `/scoring` | Account Scoring, signal monitoring, routing | ✓ | ✓ | ✓ | |
| `/nba` | Micro-segments & NBA | ✓ | ✓ | ✓ | |
| `/review` | For Review: queue, approvals, decision log | ✓ | ✓ (team) | ✓ (own) | |
| `/content`, `/studio` | Content library, Content studio | ✓ | ✓ | ✓ | |
| `/analytics` | Analytics: the six success areas, G1 and G2, readout | ✓ | ✓ | ✓ (own results) | ✓ (aggregates) |
| `/setup`, `/users` | Setup (configuration, sign-offs, AI service), Users and roles | ✓ | ✓ | | |
| `/platform` | Business units (platform administrators) | | | | |

A screen a role can't open says so; the API refuses the same requests (`lib/auth/permissions.ts`).

## Tests

Every gap fix has a named test, and safety guards were checked by mutation (the test fails without the guard). CI (`.github/workflows/ci.yml`) runs every gate on every push: gitleaks, lint, typecheck, unit and answer key, legacy, build with dummy secrets and a scan of the output, the deployment files, audit, dependency age; integration and HTTP tests on PostgreSQL 16; and the end-to-end suite on the Compose stack built from the image. The answer-key test (`tests/answer-key.test.ts`) reads the fictional dataset's key and holds per-scenario floors and a tier snapshot that changes only on purpose.

## Documentation

| Document | Contents |
|---|---|
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Operating the pilot: incidents, failed uploads, reprocessing, users, AI, data |
| [docs/devops/](docs/devops/README.md) | Deploying on EC2 or EKS, RDS, releases and rollback, secrets, observability, Azure |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | The tables, who can read and write them, and how isolation works |
| [docs/AI.md](docs/AI.md) | The AI capabilities, what they send and keep, the evaluation and its results |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, controls, residual risks |
| [docs/adr/](docs/adr/) | Architecture decisions |
| [docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md) | What the pilot does not do, and what is still to agree |
