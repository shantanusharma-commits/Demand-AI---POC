# Configuration reference

Every setting is an environment variable. Variables the server reads are validated once at start-up by `lib/server/env.ts`; an invalid value stops the process with a `config.invalid` log line that names the variable and never its value. A blank value counts as unset. `.env.example` is the annotated template, and the only env file that is tracked.

Checked against the code on 25 Oct 2026 (`lib/server/env.ts`, `compose*.yaml`, `deploy/`, `scripts/`, `tests/`, `e2e/`, `.github/workflows/`).

## 1. Where values come from

| Environment | Source | Who writes it |
|---|---|---|
| Local development (`npm run dev`, scripts) | `.env.local` at the repository root (git- and docker-ignored). Next.js loads it for `npm run dev`; the npm scripts pass it with `node --env-file-if-exists=.env.local` | `npm run setup:env` writes the random local secrets (never overwrites, prints nothing); you add the rest by hand |
| Local Compose stack, EC2 host | One env file given to `docker compose --env-file …`. `compose.yaml` maps it into each service and builds the database URLs from the role passwords | Locally: `.env.local` or a throwaway `.env.<name>`. On EC2: `deploy/ec2/sync-secrets.sh` writes `/etc/demandai/demandai.env` before every start, from `/etc/demandai/settings.env` (not secret) and one AWS Secrets Manager secret ([devops/DEPLOY-EC2.md](devops/DEPLOY-EC2.md)) |
| EKS | ConfigMap `demandai-config` (`deploy/k8s/base/configmap.yaml`, not secret) and three Secrets synced from AWS Secrets Manager by External Secrets (`demandai-app`, `demandai-migrate`, `demandai-ops`, `deploy/k8s/base/externalsecrets.yaml`) | DevOps ([devops/DEPLOY-EKS.md](devops/DEPLOY-EKS.md), [devops/SECRETS.md](devops/SECRETS.md)) |
| The image | `Dockerfile` sets `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `MIGRATIONS_DIR=/app/drizzle`, `NEXT_TELEMETRY_DISABLED=1` and `APP_BUILD_VERSION` (build argument) | The build |
| CI | Workflow `env:` blocks and dummy values in `.github/workflows/ci.yml`; the optional repository secret `CLIENT_NAME_PATTERN` | Repository owner |

No value is read from a file in the repository at runtime other than `drizzle/` (migrations) and an optional CA bundle path. The browser bundle holds no configuration: `npm run check:bundle` fails the build if a secret value reaches it.

## 2. Server settings (validated by `lib/server/env.ts`)

**Required** says when the server refuses to start without it. **Secret**: keep it out of tracked files, ConfigMaps and logs; on AWS it belongs in Secrets Manager.

### App

| Variable | Purpose | Format / values | Default | Required | Secret | Changing it |
|---|---|---|---|---|---|---|
| `NODE_ENV` | Run mode | `development`, `test`, `production` | `development` (the image sets `production`) | | | `production` makes `APP_BASE_URL`, `DATABASE_URL` and `SESSION_SECRET` required, defaults database TLS to `verify-full`, makes the CSRF check accept only `APP_BASE_URL`'s origin, and makes the seed refuse to run |
| `PORT` | Port the server listens on | 1–65535 | `3000` | | | The container port in `compose.yaml` and the Kubernetes Service expect 3000 |
| `HOSTNAME` | Address the standalone server binds (read by Next.js, not validated) | host or IP | `0.0.0.0` in the image | | | |
| `APP_BASE_URL` | The public URL people open | `http(s)://host[:port]` | `http://localhost:<PORT>` when unset outside production | In production | | Used for invite and reset links, the CSRF Origin check and the `Secure` cookie flag (on when it starts with `https://`). A wrong value refuses every state-changing request with 403 and breaks emailed links |
| `APP_BUILD_VERSION` | The release, shown by `/api/health` | text ≤ 100 | `dev` | | | Set by `docker build --build-arg`; a redeploy checks it to confirm the new code is live |
| `APP_THEME` | A client's look (D-50): the folder under `public/themes/` with `theme.json` (name, logos, favicon, accent colour) and `theme.css` (colour tokens) | folder name, `a-z`, `0-9`, `-`, ≤ 40 | none: the app's own look | | | The folders are kept out of Git (`.gitignore`: the repository is public and never names a client), so each host brings its own. A missing or unreadable folder is logged and the default look is shown. Emails and Word files take the theme's accent. Restart to apply |
| `LOG_LEVEL` | Log detail (pino) | `fatal` `error` `warn` `info` `debug` `trace` `silent` | `info` | | | `debug`/`trace` add per-transaction lines; still no personal data |
| `LOG_SLOW_QUERY_MS` | Meant as the slow-statement threshold | integer ms | `500` | | | **Validated but not read** (the slow-transaction threshold is fixed at 500 ms in `lib/server/db/tenant.ts`); see [ARCHITECTURE.md](ARCHITECTURE.md) §6 |
| `TRUSTED_PROXY_HOPS` | Reverse proxies that append to `X-Forwarded-For`; finds the client address for rate limits | 1–5 | `1` | | | Must match the real proxy chain, and the app must be reachable only through it ([SECURITY.md](SECURITY.md) S5) |
| `NEXT_TELEMETRY_DISABLED` | Next.js telemetry off (read by Next.js) | `1` | `1` in the image and CI | | | |

### Database

| Variable | Purpose | Format / values | Default | Required | Secret | Changing it |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | The app's connection, as `demandai_app` (least privilege, under row-level security) | `postgres://` or `postgresql://` URL | none | In production; needed by every page and API call that reads data | Yes (password) | Without it `/api/ready` reports `not-configured` and the job worker doesn't start. `sslmode`-style query parameters are stripped: TLS comes from `DATABASE_SSL_MODE` only |
| `DATABASE_MIGRATION_URL` | The owner role `demandai_owner`: migrations, the seed, `create-admin` | URL | none | For `db:migrate`, `db:seed`, `user:create-admin` | Yes | Never given to the running app (on EKS only the migrate Job sees it) |
| `DATABASE_OPS_URL` | The ops role `demandai_ops`: `data:purge` and `data:export` only | URL | Locally, if unset: `DATABASE_URL`'s server with `demandai_ops` and `DEMANDAI_OPS_PASSWORD` | For the data commands | Yes | |
| `DATABASE_SSL_MODE` | TLS to PostgreSQL | `disable`, `require` (encrypted, unverified), `verify-full` | `verify-full` in production, `disable` otherwise (app and scripts alike) | | | `verify-full` needs the server's CA (`DATABASE_SSL_CA_FILE`, the RDS bundle on AWS) |
| `DATABASE_SSL_CA_FILE` | CA bundle for `verify-full` | file path | none (system CAs) | With `verify-full` on RDS | | EKS mounts the RDS bundle at `/etc/ssl/rds/global-bundle.pem` |
| `DATABASE_POOL_MAX` | Connections per app process | 1–100 | `10` | | | Multiply by replicas; keep under the server's `max_connections` minus the admin's |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `statement_timeout` for every app connection | ≥ 1000 | `30000` | | | Too low fails big list saves; idle transactions are also cut after 60 s (fixed) |

### Sessions

| Variable | Purpose | Format / values | Default | Required | Secret | Changing it |
|---|---|---|---|---|---|---|
| `SESSION_SECRET` | HMAC key that signs the session cookie and keys the pseudonymous rate-limit counters (IP and email are hashed with it) | ≥ 32 characters (`openssl rand -base64 48`) | none | In production; outside production any page or API that needs the app's services fails without it | Yes | Rotating it signs everyone out ([devops/SECRETS.md](devops/SECRETS.md)) |
| `SESSION_ABSOLUTE_HOURS` | Longest a session lives | 1–168 | `12` | | | Applies to new sign-ins |
| `SESSION_IDLE_MINUTES` | Idle time before a session ends | 5–1440 | `60` | | | |

### Email (invites, password resets)

| Variable | Purpose | Format / values | Default | Required | Secret | Changing it |
|---|---|---|---|---|---|---|
| `NOTIFICATION_DISABLED` | `1` = never send; links are shown to the Admin to copy | `0` `1` `true` `false` | off in the code; `1` in `.env.example`, Compose and the ConfigMap | | | Turning it off without the SMTP settings logs a `config.warning` and still falls back to copy-link |
| `NOTIFICATION_EMAIL_FROM` | Sender address and SMTP user name | email | none | For sending | | |
| `NOTIFICATION_SENDER_NAME` | Sender display name | text ≤ 100 | `DemandAI` | | | |
| `NOTIFICATION_APP_PASSWORD` | SMTP password | text | none | For sending | Yes | |
| `NOTIFICATION_SMTP_HOST` | SMTP server (STARTTLS) | host | none | For sending | | |
| `NOTIFICATION_SMTP_PORT` | SMTP port | 1–65535 | `587` | | | |
| `SUPPORT_EMAIL` | Contact address shown in emails | email | none | | | |

### Uploads and jobs

| Variable | Purpose | Format / values | Default | Required | Secret | Changing it |
|---|---|---|---|---|---|---|
| `UPLOAD_MAX_BYTES` | Largest file accepted | ≥ 1024 bytes | `26214400` (25 MB, D-8) | | | Memory: about 0.7 GB at 20,000 rows; agree larger files with the Client |
| `UPLOAD_MAX_ROWS` | Most rows per file | ≥ 1 | `50000` | | | |
| `UPLOAD_TIME_LIMIT_MS` | Time budget of an upload or scoring job | ≥ 1000 ms | `60000` | | | An AI-written build gets at least 6 minutes regardless |
| `UPLOAD_MAX_UNZIPPED_BYTES` | Zip-bomb guard for `.xlsx` | ≥ 1 MiB | `209715200` (200 MiB) | | | |
| `JOBS_WORKER` | Run the background worker in this process | flag | on | | | `0` on a process that should only serve requests; at least one process must run a worker or uploads stay queued |
| `JOBS_POLL_MS` | How often an idle worker looks for jobs | 100–60000 | `1000` | | | A job queued in the same process starts at once anyway |

### AI (D-5, D-35, D-44; [AI.md](AI.md))

| Variable | Purpose | Format / values | Default | Required | Secret | Changing it |
|---|---|---|---|---|---|---|
| `AI_PROVIDER` | Which model service | `none`, `azure-openai`, `bedrock` | `none` | | | `none`: every capability uses its rules; a flag set with `none` logs a warning |
| `AI_FEATURE_CLASSIFY`, `AI_FEATURE_WHY_NOW`, `AI_FEATURE_DRAFTING`, `AI_FEATURE_COPILOT`, `AI_FEATURE_CONTENT_STUDIO`, `AI_FEATURE_SEGMENTS`, `AI_FEATURE_NEXT_ACTION`, `AI_FEATURE_GUIDELINE` | One switch per capability (the last three: micro-segments, the next best action, reading a guideline; 30 Oct 2026) | flag | off | | | Off until the Client agrees each capability's evaluation ([AI.md](AI.md) §5). `AI_FEATURE_DRAFTING`, `AI_FEATURE_SEGMENTS` or `AI_FEATURE_NEXT_ACTION` turns an NBA build into a background job. Restart to apply |
| `AI_TIMEOUT_MS` | Timeout per model attempt | ≥ 1000 ms | `30000` (`45000` in the deployment files) | | | The pilot's gateway takes 1–30 s; up to 3 retries per call |
| `AI_MAX_CONCURRENCY` | Model calls in flight per process | 1–64 | `4` | | | Lower it when the gateway rate-limits |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource or API Management gateway | `https://` URL (`http://` only for 127.0.0.1/localhost) | none | With `azure-openai` | Treated as secret in the deployment files | `/openai` is added unless the path already ends with it |
| `AZURE_OPENAI_API_KEY` | The key | text | none | With `azure-openai` | Yes | Rotation: [devops/SECRETS.md](devops/SECRETS.md) |
| `AZURE_OPENAI_DEPLOYMENT` | Main model deployment | name | none (`gpt-5.4` in `.env.example` and the ConfigMap) | With `azure-openai` | | |
| `AZURE_OPENAI_DEPLOYMENT_SMALL` | Small model deployment, for the capabilities in `AI_SMALL_MODEL_FOR` | name | none (`gpt-5.4-mini`) | | | Unset: everything goes to the main model |
| `AZURE_OPENAI_API_VERSION` | API version | dated version | `2025-04-01-preview` | | | Later dated versions 404 on the pilot's gateway (D-44) |
| `AZURE_OPENAI_AUTH_HEADER` | Header that carries the key | `api-key`, `Ocp-Apim-Subscription-Key` | `api-key` | | | Some API Management front doors need the second |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Embedding deployment | name | none | | | **Validated but not used**: no capability uses embeddings |
| `AWS_REGION`, `BEDROCK_MODEL_ID` | Amazon Bedrock region and model | region; model ID | none | With `bedrock` | | |
| `BEDROCK_MODEL_ID_SMALL` | Bedrock small model | model ID | none | | | |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Read only to refuse them | — | — | Must be **unset** with `bedrock` | — | Bedrock authenticates by the IAM role the app runs under |
| `AI_SMALL_MODEL_FOR` | Capabilities routed to the small model | comma list of `classify`, `why_now`, `draft_message`, `draft_content`, `copilot`, `segment`, `next_action`, `read_guideline` | `classify` | | | |
| `AI_REASONING_EFFORT` | Reasoning effort per capability, over each template's | `capability=effort,…` (efforts `none`…`xhigh`) | the templates' | | | `temperature` is sent only with effort `none` (GPT-5 rule) |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` | USD per million tokens, main model, for the cost estimate | 0–10000 | `2.5`, `15` | | | Estimates only; set the Client's agreed prices |
| `AI_PRICE_SMALL_INPUT_PER_MTOK`, `AI_PRICE_SMALL_OUTPUT_PER_MTOK` | The same, small model | 0–10000 | `0.75`, `4.5` | | | |
| `AI_LIVE_SMOKE` | Lets `npm run ai:evaluate` and `test:ai-live` call the real model | flag | off | | | Spends tokens; never in CI |

### Data lifecycle

| Variable | Purpose | Format / values | Default | Required | Secret | Changing it |
|---|---|---|---|---|---|---|
| `RETENTION_DAYS_AFTER_READOUT` | Days after the sponsor's closing decision when a unit's pilot data is due for purge (D-20, provisional) | ≥ 1 | `30` | | | Read by `data:purge` (as the ops role); set it from the Client contract |

## 3. Compose stack variables (`compose.yaml`, `compose.dev.yaml`)

Read by Docker Compose, not by the app. `${VAR:?}` makes Compose stop and name a missing one.

| Variable | Purpose | Default | Required | Secret |
|---|---|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | The `db` container's superuser and database name; also used by the `backup` service | none (`postgres`, —, `demandai` in `.env.example`) | Yes (with RDS, `sync-secrets.sh` writes placeholders for the first two) | Password |
| `DEMANDAI_OWNER_PASSWORD`, `DEMANDAI_APP_PASSWORD`, `DEMANDAI_OPS_PASSWORD` | The three role passwords. `db/init/10-roles.sh` creates the roles from them on the volume's **first** start; Compose builds `DATABASE_URL`, `DATABASE_MIGRATION_URL` and `DATABASE_OPS_URL` from them | none | Yes. At least 24 characters of letters, digits, `-`, `_` (they go into URLs) | Yes |
| `BACKUP_RETAIN` | Dumps kept by the `backup` service (runs before every migrate) | `20` | | |
| `APP_PORT` | Host port (loopback) for the app container | `3100` | | |
| `DB_PORT` | Host port (loopback) for the development database (`compose.dev.yaml` only) | `55432` | | |
| `DEMANDAI_IMAGE` | Image for `migrate` and `app` | `demandai-app:local` | On EC2 (pinned by digest) | |

Changing a role password in the env file after the first start does **not** change it in the database: run `ALTER ROLE … PASSWORD` too ([devops/SECRETS.md](devops/SECRETS.md)).

## 4. Deployment-only variables

| Variable | Where | Purpose |
|---|---|---|
| `DEMANDAI_HOST`, `ACME_EMAIL` | EC2: `deploy/ec2/compose.proxy.yaml`, `Caddyfile` | The DNS name Caddy serves and gets a certificate for; the ACME contact |
| `RDS_HOST` | EC2: `deploy/ec2/compose.rds.yaml` | The RDS endpoint; the migrate and app services connect to it over TLS instead of the local `db` |
| `DEMANDAI_SECRET_ID`, `AWS_REGION` | EC2: `/etc/demandai/sync.conf` | The Secrets Manager secret `sync-secrets.sh` reads (a JSON object of `NAME: value`) |
| `DEMANDAI_ETC` | EC2: `sync-secrets.sh` | Settings directory (default `/etc/demandai`) |
| `DEMANDAI_COMPOSE_EXTRA` | EC2: `demandai.service` | Extra `-f` files, for example `-f deploy/ec2/compose.rds.yaml` |
| Secrets Manager keys `demandai/pilot/app` (`DATABASE_URL`, `SESSION_SECRET`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`), `demandai/pilot/migrate` (`DATABASE_MIGRATION_URL`), `demandai/pilot/ops` (`DATABASE_OPS_URL`) | EKS: `externalsecrets.yaml` | Each workload gets only its own secret; the app never sees the owner or ops credentials |
| `NODE_IMAGE`, `APP_BUILD_VERSION` | `docker build --build-arg` | Base image (pinned by digest) and release name |
| `MIGRATIONS_DIR` | `scripts/db/migrate.mjs` | Migration folder (default `./drizzle`; `/app/drizzle` in the image) |

## 5. Development, test and CI variables

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `DEV_SEED_PASSWORD` | `npm run db:seed` | none (written by `setup:env`) | Password of the fictional seeded users; the seed refuses `NODE_ENV=production`. Secret locally; never reuse it |
| `TEST_DATABASE_ADMIN_URL` | `tests/integration/harness.ts` | `postgresql://postgres:demandai-test-only@127.0.0.1:55433/postgres` | The disposable test cluster; the harness refuses port 5432 |
| `TEST_DB_PORT`, `TEST_POSTGRES_PASSWORD` | `compose.test.yaml` | `55433`, `demandai-test-only` | The in-memory test cluster |
| `E2E_PORT`, `E2E_LOG_LEVEL`, `E2E_STATE` | `e2e/stack.ts`, `playwright.config.ts` | `3998`, `warn`, `e2e/.state` | The end-to-end stack Playwright starts (fresh database on 55433) |
| `E2E_BASE_URL`, `E2E_PLATFORM_LINK` | `playwright.config.ts`, `e2e/helpers.ts`, CI | none | Run the specs against an already running stack (the Compose stack in CI) |
| `E2E_COMPOSE_PORT` | `e2e/compose.sh` | `3100` | Port of the Compose stack the e2e job starts |
| `BACKUP_DIR` | `db/backup.sh` | `/backups` | Where dumps go |
| `CLIENT_NAME_PATTERN` | CI secret; `tests/repo-hygiene.test.ts` | none (test skipped) | Lets CI fail if the Client's name appears in tracked files |
| `CI` | `playwright.config.ts` | set by the CI platform | Forbids `test.only` and adds the CI reporters |

## 6. Minimum settings

**Local development** (what `npm run setup:env` plus `.env.example` give you): `NODE_ENV=development`, `APP_BASE_URL=http://localhost:3000`, `DATABASE_URL` and `DATABASE_MIGRATION_URL` on `127.0.0.1:55432`, `DATABASE_SSL_MODE=disable`, `SESSION_SECRET`, `NOTIFICATION_DISABLED=1`, `DEV_SEED_PASSWORD`, and the Compose variables of §3 for `npm run db:up`. AI stays `none` unless you add a provider.

**Production** (the server refuses to start without the first three): `APP_BASE_URL` (https), `DATABASE_URL`, `SESSION_SECRET`; then `DATABASE_SSL_MODE=verify-full` with `DATABASE_SSL_CA_FILE`, `TRUSTED_PROXY_HOPS` matching the proxy, `NOTIFICATION_*` or `NOTIFICATION_DISABLED=1`, `RETENTION_DAYS_AFTER_READOUT` from the contract, and the AI settings only once the Client has agreed them. The migrate step needs `DATABASE_MIGRATION_URL`; the purge and export need `DATABASE_OPS_URL`.

The local `.env.local` on the development machine (25 Oct 2026) also points at the pilot's Azure gateway with every AI flag on, so local browser checks make real model calls. That is a development choice only: every deployment file keeps `AI_PROVIDER=none` and every flag `0`.
