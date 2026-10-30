# Developing DemandAI

Setting up a machine, the local database, running, testing, debugging, and the rules that keep the repository healthy. The short version is in the [README](../README.md#running-it-locally); settings are in [CONFIGURATION.md](CONFIGURATION.md).

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 24.22.1 (`.nvmrc`); 22.18 or later works | The tests run TypeScript directly (`node --test`, type stripping). `nvm use` picks the right one |
| npm | the one that comes with Node 24 (11.x) | `npm ci` installs exactly `package-lock.json` |
| Docker Engine with Compose v2 | recent | The development and test PostgreSQL 16 containers, the image build, `deploy/check.sh`, gitleaks |
| PostgreSQL client tools (`psql`, `pg_dump`, `pg_restore`) | 16 | The backup/restore integration test and manual checks |
| Free ports | 3000 (dev server), 55432 (dev database), 55433 (test database), 3998/3999 (test servers), 3100 (Compose app) | |

The machine needs internet access for `npm ci` and for `npm run build` (fonts are fetched at build time).

## 2. First-time setup

```bash
git clone <repository URL> && cd Demand-AI---POC
nvm install && nvm use           # Node 24.22.1
npm ci                           # SheetJS installs from cdn.sheetjs.com, checked against the lockfile's hash
npm run setup:env                # writes .env.local: random role passwords, SESSION_SECRET, DEV_SEED_PASSWORD (prints nothing)
npm run db:up                    # PostgreSQL 16 container "demandai-db-1" on 127.0.0.1:55432 (volume demandai_pgdata)
npm run db:migrate               # 39 migrations: schema, row-level security, triggers, grants, functions
npm run db:seed                  # units pilot-bu and second-bu, seven fictional users, config v1
npm run dev                      # http://localhost:3000
```

Sign in as a seeded user (`admin@demandai.test`, `manager@demandai.test`, `rep1@demandai.test`, `viewer@demandai.test`, …) with the `DEV_SEED_PASSWORD` from `.env.local`, or create your own administrator, which prints a one-time link to set a password:

```bash
npm run user:create-admin -- --unit pilot-bu --email you@example.com --name "Your Name"
npm run user:create-admin -- --platform --email ops@example.com --name "Ops Person"   # platform administrator
```

**Prospecting › Use sample data** loads the fictional sample; `test-data/Lead_Research_Sample_Dataset.xlsx` is the full fictional 7,498-row file. Never upload real Client data to a development machine.

## 3. The database

### 3.1 How the app connects

| | Value | Source |
|---|---|---|
| Engine | PostgreSQL 16.15 (`postgres:16.15-bookworm`, pinned by digest) | `compose.yaml` |
| Container / volume | `demandai-db-1` / `demandai_pgdata` (Compose project `demandai`) | `compose.yaml` |
| Host and port | `127.0.0.1:55432` (loopback only; `DB_PORT` changes it) | `compose.dev.yaml` |
| Database / schemas | `demandai` / `public` (application), `drizzle` (migration journal) | `db/bootstrap-roles.sql`, `scripts/db/migrate.mjs` |
| Roles | `demandai_app` (the running app, `DATABASE_URL`), `demandai_owner` (migrations, seed, create-admin, `DATABASE_MIGRATION_URL`), `demandai_ops` (purge, export, `DATABASE_OPS_URL`), plus the container's `postgres` superuser | `.env.local` |
| TLS | off locally (`DATABASE_SSL_MODE=disable`); `verify-full` in production | `lib/server/db/pool.ts` |
| Code path | `getPool()` (one pool per process) → `createDb()` (Drizzle) → `withTenant()` / `withUser()` → services | `lib/server/db/` |

The roles are created by `db/init/10-roles.sh` on the volume's **first** start, from `DEMANDAI_*_PASSWORD` in the env file. The integration tests never touch this database: they use a separate in-memory cluster on 55433 (`npm run db:test:up`) and refuse port 5432.

The system PostgreSQL service some machines have on port 5432 is **not** used: the project keeps its own pinned PostgreSQL 16 in Docker so that development, CI and the Compose deployment run the same server, and so it never mixes with other projects' databases.

### 3.2 Checking the connection

```bash
pg_isready -h 127.0.0.1 -p 55432                       # the server answers
curl -s http://localhost:3000/api/ready                 # {"status":"ready","checks":{"database":"ok","migrations":"ok"}}: the app reached it with DATABASE_URL and the schema is current
```

From a shell, without printing the password (the URL is read from `.env.local`):

```bash
psql "$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" -X -c "select current_user, current_database(), inet_server_port(), (select count(*) from drizzle.__drizzle_migrations) as migrations"
# demandai_app | demandai | 5432 | 39   (5432 is the port inside the container)

psql "$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" -X -c "select count(*) from accounts"
# 0: as the app role without a tenant context, row-level security returns nothing. That is correct.
```

Look at data as the owner role (`DATABASE_MIGRATION_URL`), which isn't subject to row-level security. Never use the owner role from the app.

### 3.3 Using a different PostgreSQL (for example a system service on 5432)

Only do this if you need to; the Docker database is the supported set-up. On a cluster you administer:

1. **Create the roles and the database** as that cluster's superuser (passwords: letters, digits, `-`, `_`, at least 24 characters; `openssl rand -hex 32`):
   ```bash
   sudo -u postgres psql -v owner_pw=<owner> -v app_pw=<app> -v ops_pw=<ops> -v dbname=demandai -f db/bootstrap-roles.sql
   ```
   The role names `demandai_owner`, `demandai_app`, `demandai_ops` must not already exist with other passwords. The cluster's `pg_hba.conf` must allow password (`scram-sha-256`) logins from 127.0.0.1 (Ubuntu's default does).
2. **Point the URLs at it** in `.env.local`:
   ```
   DATABASE_URL=postgresql://demandai_app:<app>@127.0.0.1:5432/demandai
   DATABASE_MIGRATION_URL=postgresql://demandai_owner:<owner>@127.0.0.1:5432/demandai
   DATABASE_OPS_URL=postgresql://demandai_ops:<ops>@127.0.0.1:5432/demandai
   DATABASE_SSL_MODE=disable          # or require, if the cluster has TLS
   ```
3. **Build the schema**: `npm run db:migrate`, then `npm run db:seed` (or `user:create-admin`).
4. **Or bring the Docker database's data across instead of step 3** (not rehearsed; the owner role can dump everything it owns): `pg_dump "<old DATABASE_MIGRATION_URL>" -Fc -f demandai.dump`, then `pg_restore -d "<new DATABASE_MIGRATION_URL>" --no-owner --role=demandai_owner demandai.dump` into the empty database from step 1 (notices that the `public` schema already exists are expected). The dump carries the migration journal and the grants; `npm run db:migrate` should then report nothing to apply. Keep the dump outside the repository and delete it afterwards: it holds whatever data the development database had.
5. **Restart** `npm run dev` (Next.js reads `.env.local` at start) and check `curl -s http://localhost:3000/api/ready` and the `psql` queries above against the new URL.

To go back, restore the previous URLs and restart.

### 3.4 Migrations

- Change `lib/server/db/schema.ts`, then `npm run db:generate` writes the SQL and `drizzle/meta/` snapshots; review them and commit both.
- Row-level security, triggers, grants and functions are written by hand: `npm run db:generate -- --custom --name=<what>`, then fill the file in. Every new unit-owned table needs `business_unit_id`, a policy, grants for `demandai_app`, and a test in `tests/integration/security.test.ts` style.
- `npm run db:migrate` applies new files under an advisory lock; a migration that changed after it was applied is an error, never re-run. Never edit an applied migration: add a new one.
- Keep releases rollback-safe: add columns and tables; drop or rename only in a later release, once no running image needs them ([devops/REDEPLOY.md](devops/REDEPLOY.md)).

### 3.5 Starting again

`npm run db:down` stops the container and keeps the data. To wipe the development database: `npm run db:down && docker volume rm demandai_pgdata`, then §2 from `db:up`. **That deletes every list, run and user in it.**

## 4. Running

| Goal | Command |
|---|---|
| Develop with hot reload | `npm run dev` (http://localhost:3000) |
| Production build, as the image runs it | `npm run build`, then `node .next/standalone/server.js` with the env set explicitly (the standalone server doesn't read `.env.local`); copy `.next/static` and `public` beside it first |
| The whole Compose stack (db → backup → migrate → app) from the image | `docker build -t demandai-app:e2e .`, then `DEMANDAI_IMAGE=demandai-app:e2e e2e/compose.sh up` (its own Compose project `demandai-e2e`, fresh secrets, http://127.0.0.1:3100, a platform-admin link in `e2e/.state/platform-link`); `e2e/compose.sh down` removes it with its volumes. Don't run `docker compose up` for the whole stack with `.env.local`: it is the same project (`demandai`) as the development database and would replace that container |
| Turn AI on locally | `AI_PROVIDER=azure-openai` with the endpoint, key and deployments ([devops/AZURE-OPENAI.md](devops/AZURE-OPENAI.md)), and the `AI_FEATURE_*` flags you want. Every call spends tokens; use the fictional sample only |
| Check the AI endpoint from outside the app | `node --env-file=.env.local scripts/ai/diagnose.mjs` |

## 5. Testing

| Suite | Command | Needs | What it covers |
|---|---|---|---|
| Lint, types | `npm run lint`, `npm run typecheck` | — | ESLint flat config (React Compiler rules); strict TypeScript for the app, then the tests |
| Unit | `npm test` | — | Engine, rules, answer key, AI contracts against fakes, uploads, CSP, deployment files, repository hygiene (270 + 4 skipped on 25 Oct) |
| Legacy | `npm run test:legacy` | — | The prototype engine's own tests (37) |
| Integration | `npm run db:test:up`, then `npm run test:integration` | Docker | Migrations, row-level security (each layer alone), append-only tables, jobs, every service, purge, backup and restore (162). Each file gets a clone of a migrated template database |
| HTTP | `npm run build`, then `npm run test:http` | a build, the test cluster | The standalone server: route inventory, role × route matrix, CSRF, sign-in, uploads, headers, AI over HTTP with a stand-in (31) |
| End-to-end | `npm run build`, then `npx playwright test` | a build, the test cluster, Chromium (`npx playwright install --only-shell chromium`) | Starts `e2e/stack.ts` on 3998 with a fresh database: invites, two users, roles, axe on every screen, keyboard upload, 7,500 and 20,000-row performance (20) |
| Gates | `npm run audit:gate`, `npm run deps:age`, `bash deploy/check.sh` | network, Docker | Advisories, dependency age, Kubernetes and Compose files |
| Bundle secret scan | build with the dummy secrets from `.github/workflows/ci.yml`, then `npm run check:bundle` | that build | No secret value in the build output (refuses to run after a normal build) |
| Live AI | `AI_LIVE_SMOKE=1 npm run ai:evaluate`, `npm run test:ai-live` | a configured model | Spends tokens; never in CI |

One file: `node --conditions=react-server --test tests/rules.test.ts` (unit) or `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --conditions=react-server --test tests/integration/review.test.ts` (with the test cluster up). End-to-end specs run in file-name order and depend on each other (`setup.spec.ts` creates the people).

**The answer key** (`tests/answer-key.test.ts`) holds per-scenario floors and a tier snapshot over the fictional dataset. A rule change that moves results must raise the floors or update the snapshot in the same commit, and say why; a change to engine wording or rules bumps `ENGINE_VERSION` in `lib/engine/config.ts`.

## 6. Debugging

- **Logs** are JSON on stdout. Every line has `requestId`, `userId`, `businessUnitId` and an `event` (`http.request`, `api.error`, `job.failed`, `ai.call`, `db.transaction.slow`, `config.invalid`, …; [devops/OBSERVABILITY.md](devops/OBSERVABILITY.md)). Set `LOG_LEVEL=debug` for more. An error on screen shows a reference: it is the `requestId`; search the logs for it.
- **Jobs**: `GET /api/jobs/:id` shows the stage and error code; as the owner role, `select id, kind, status, stage, attempts, error_code from jobs order by created_at desc limit 20`.
- **Access problems**: a 403 names the missing permission; an empty list for a rep usually means their owner aliases don't match the file's `owner_email` ([RUNBOOK.md](RUNBOOK.md) §3).
- **Node inspector**: `NODE_OPTIONS=--inspect npm run dev`, then attach from the IDE or `chrome://inspect`.
- **Server Components and route handlers** run on the server: their `console` output and errors are in the terminal, not the browser console. Browser errors are posted to `/api/client-errors` and logged as `client.error`.

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm test` fails with syntax errors on TypeScript | Node older than 22.18 | `nvm use` |
| `npm run db:up` says a variable is missing | `.env.local` lacks the Compose variables | `npm run setup:env` (never overwrites; add missing lines by hand from `.env.example`) |
| `password authentication failed for user "demandai_app"` | The volume was created with other passwords (roles are made on first start only) | `ALTER ROLE demandai_app PASSWORD '…'` as `postgres` in the container, or wipe the volume (§3.5) |
| `/api/ready` → `migrations: pending` | New migrations in the code | `npm run db:migrate` |
| A change shows on the screens but an upload check, scoring run or micro-segment build still does it the old way | The job worker starts once with `npm run dev` (`instrumentation.ts`) and keeps the code it loaded; hot reload doesn't reach it | Restart `npm run dev` after changing code a job runs |
| The server exits with `config.invalid` | A variable fails validation | The log names it; [CONFIGURATION.md](CONFIGURATION.md) |
| `SESSION_SECRET is not configured` | Missing in `.env.local` | `npm run setup:env` or add 32+ random characters |
| Sign-in refused | Wrong password, or 5 failures locked it for 15 minutes | Wait, or send a reset link from Users and roles |
| Port already in use | Another dev server or database | Stop it, or set `PORT` / `DB_PORT` |
| `npm run build` printed the route table but the exit code is 1 | For example `SecurityFatalError` for an installed Next.js with a published advisory | Read the exit code, not the output; upgrade under the dependency rules (§8) |
| HTTP or e2e tests pass "too easily" after a failed build | They run whatever is in `.next/standalone` | Rebuild and check the exit code |
| A container refuses to start any program with `no-new-privileges` | A host issue seen with Docker 29.8 on kernel 7.0 with AppArmor | The Compose files leave that option out; add it on hosts where it works ([devops/DEPLOY-EC2.md](devops/DEPLOY-EC2.md)) |

## 8. Rules that keep the repository healthy

1. **Never commit** `.env*` other than `.env.example`, `reference_content/`, `DEMANDAI_*` working documents, real Client data, dumps or exports. The Client is written "Client" in code, data and docs; CI can enforce it with the `CLIENT_NAME_PATTERN` secret.
2. **`legacy/` is read-only**: it is the reference the screens were ported from and the parity tests compare with.
3. **Dependencies**: exact versions, at least 1 day old and preferably 7 (`npm install --save-exact --before=<date>`), no high or critical advisory in production dependencies ([ADR 0010](adr/0010-dependencies-and-supply-chain.md)). SheetJS comes from its official tarball, pinned by checksum (D-24).
4. **Every API route** goes through `withApi()` with a permission from `lib/auth/permissions.ts`, and is added to the inventory in `tests/http/auth-http.test.ts`.
5. **Every query** runs inside `withTenant()` or `withUser()`; new unit-owned tables get row-level security and a test.
6. **Never hold a database transaction during a model call**: read in one transaction, call the gateway with none open, write in a second.
7. **No personal data in logs, job payloads, audit details or model prompts** (names and emails become tokens or are left out).
8. **Each gap fix or rule change has a named test**; safety guards were checked by mutation (the test fails without the guard).
9. **Update the docs with the code**: a new variable → `.env.example`, `lib/server/env.ts`, [CONFIGURATION.md](CONFIGURATION.md) and the deployment files; a new table → [DATA_MODEL.md](DATA_MODEL.md); a new route → [API.md](API.md); a decision → [DECISIONS.md](DECISIONS.md) or an ADR.
