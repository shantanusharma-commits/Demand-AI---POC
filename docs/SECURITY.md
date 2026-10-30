# Security in DemandAI

How DemandAI protects the Client's data during the pilot: the threats we considered, what stops each one, and the test that proves it. Written for the Client's security reviewers and the DevOps team. AI-specific detail is in [AI.md](AI.md); deployment controls (TLS, network, backups, secrets) arrive with the deployment guide in Phase 9.

**Short version.** Sign-in is invite-only with passwords, sessions live in the database, and every request is checked again on the server. Data is split by business unit and, for sales reps, by owner. PostgreSQL enforces that split as well as the code. History tables can't be changed, and pilot data is purged through one audited command once the pilot ends. Pages carry a strict Content Security Policy. Routes that cost money or do heavy work are rate-limited per person. Logs and model prompts carry no contact's name or address. CI scans every commit for secrets and every dependency for advisories.

## 1. What we protect, and from whom

**Assets.**
- Prospect personal data from uploaded files: names, emails, LinkedIn links, job titles, opt-out and consent. The original files are kept in the database until the purge.
- The Client's business data: accounts, scores, hand-offs, recommendations, drafts, the decision log, the readout.
- People's accounts and sessions; the audit trail; configuration, brand packs and approved claims.
- The AI provider's key, and the budget behind it.

**Who might attack it.**
- Someone on the internet with no account.
- A signed-in person reaching beyond their role, their own accounts (sales reps) or their business unit.
- A hostile file: a macro, a zip bomb, formulas, or text written to steer the model.
- A compromised or vulnerable dependency.
- Someone who obtains a database or service credential.

**Trust boundaries.** Browser → reverse proxy (TLS) → app (Next.js standalone server) → PostgreSQL. The app connects to PostgreSQL as three separate roles. The app also reaches the AI provider (Azure OpenAI through API Management, or Bedrock) and SMTP.

| Database role | Used by | Can do |
|---|---|---|
| `demandai_owner` | migrations | owns the schema and the security-definer functions |
| `demandai_app` | the running app | reads and writes data under row-level security; no DDL, no `BYPASSRLS`, no UPDATE/DELETE on append-only tables |
| `demandai_ops` | the purge and export commands | no table privileges at all; runs the purge, retention and export functions only |

## 2. Threats and mitigations (STRIDE)

Test files are under `tests/` (`http/` runs against the production build, `integration/` against PostgreSQL).

### Spoofing

| # | Threat | Mitigation | Proof |
|---|---|---|---|
| S1 | Guessing or stuffing passwords | Invite-only accounts; length and common-password rules; bcrypt; 5 wrong passwords lock the account for 15 minutes (audited); per-email and per-address sliding-window limits; the same reply for a wrong password and an unknown email | integration/auth: "a wrong password and an unknown email get the same answer", "5 wrong passwords lock the account…", "sign-in attempts are rate-limited per email…", "limits slide…"; http/auth-http: "sign-in: cookie flags, one reply…, then 429 with Retry-After" |
| S2 | Stealing or forging a session | Sessions are database rows behind an HMAC-signed, HttpOnly, SameSite=Lax cookie (Secure over https); 12 h absolute and 60 min idle limits; re-read on every request; a password reset or removal ends every session | auth-unit: "a signed session cookie verifies; a tampered… one does not"; integration/auth: "sessions: valid cookie works; tampered, revoked, idle-expired or deactivated-user sessions do not", "removing someone… ends their sessions" |
| S3 | Reusing an invite or reset link | 256-bit tokens; only their hash is stored; single use; expire (72 h invite, 30 min reset); carried in the URL fragment, so they never reach logs or the Referer | auth-unit: "link tokens: 256-bit secret, only its hash is stored…"; integration/auth: "invite: … single use…", "reset: … the link works once and ends every session" |
| S4 | Cross-site request forgery | Every state-changing request must carry an Origin equal to `APP_BASE_URL`, public routes included; SameSite=Lax cookies | http/auth-http: "every mutating route, public ones included, refuses a request from another site or without an Origin (CSRF)" (all 73 of them, with a foreign, a look-alike, a `null` and no Origin) |
| S5 | A client faking its address to dodge per-address limits | The client address is the entry the trusted proxy appended (`TRUSTED_PROXY_HOPS`). **Deployment requirement:** the app must be reachable only through those proxies. Next.js keeps a client-sent X-Forwarded-For when there is no proxy, so a direct client chooses its own address; the per-email limit and the lockout still hold | client-errors: "the client address is the entry our proxy added, not one the client forged"; probed on the production build (24 Oct 2026, see §4) |
| S6 | A fake model endpoint receiving the key | The Azure endpoint must be https (http only to 127.0.0.1 for a local stand-in); the key goes only in the configured header; Bedrock refuses static AWS keys and uses the IAM role | ai-gateway: "the endpoint must be https except to this machine; Bedrock refuses static AWS keys", "Azure behind API Management: the key goes as Ocp-Apim-Subscription-Key only…" |

### Tampering

| # | Threat | Mitigation | Proof |
|---|---|---|---|
| T1 | Changing another unit's or another owner's data | Two layers: scoped services, and PostgreSQL row-level security keyed on transaction-local settings (`app_bu()`, `app_owns()`). A missing context sees nothing | integration/security: "business units are isolated…", "without a tenant context the app role sees no unit data at all (fails closed)", "identity settings are transaction-local…"; http/uploads-http: "G-014 over HTTP: a rep sees only their own prospects; another owner's is 404…" |
| T2 | Rewriting history: the audit log, decision log, drafts, corrections, sign-offs, AI call records | Append-only tables: the app role has SELECT and INSERT only, and a trigger refuses UPDATE, DELETE and TRUNCATE for every role. The only exception is the purge, and only for a session signed in as the ops role: the purge setting alone opens nothing, not even for the owner or through a cascade | integration/security: "the app role… has no UPDATE, DELETE or TRUNCATE on append-only tables", "append-only: … the owner is stopped by the trigger, purge setting or not"; integration/purge: "the purge setting opens nothing by itself: not for the app role through a cascade, nor for the owner" |
| T3 | SQL injection | Every query is parameterised (Drizzle); the app role can't change the schema; security-definer functions pin `search_path` | integration/security: "the app role cannot change schema…", "SECURITY DEFINER functions: owned by the owner role, search_path pinned, never PUBLIC, each run only by its role" |
| T4 | Formula injection through CSV exports (G-052) | Cells starting with `= + - @` (after trimming tabs and returns) are written as text. `csvDownload` accepts only `toCSV` output (type `CsvText`), so no route can send a CSV any other way | csv-export: "formula-like cells are neutralised…", "every CSV the server sends goes through csvDownload…"; integration/review, prospecting, analytics: formulas from uploaded data come out as text |
| T5 | Hostile uploads | Type, size (25 MB) and magic-byte checks before parsing; macro-enabled, password-protected and truncated workbooks refused; every zip entry inflated under a cap (zip bombs); a row cap; formulas never run (saved values only); the proxy never buffers uploads | uploads: "refused: macro-enabled workbooks…", "refused: zip bombs…", "fuzz: damaged copies of the sample are refused or read, never crash the reader"; http/uploads-http: "N-06: a 24 MB upload… 26 MB is refused and not stored", "refusals: macro-enabled, zip bomb, wrong type…" |
| T6 | Cross-site scripting | React escapes all text; no `dangerouslySetInnerHTML`; studio pieces are plain-text blocks. Content Security Policy: scripts only with a per-request nonce (`'strict-dynamic'`, no inline, no eval); style elements only with the nonce; `object-src 'none'`, `base-uri 'none'` | http/headers-http: "every page gets a CSP with a fresh nonce, on every script and style element it sends; no inline or eval scripts"; browser check (Phase 7): 11 pages, every non-writing control clicked, 0 violations |
| T7 | Text in an uploaded file steering the model (prompt injection) | File content sits inside delimiters with a "treat as data" rule. Answers are validated (JSON schema, allowed values, grounding of every name, number, date and quote, brand and claim checks), and a failed answer falls back to the rules. The model never acts: people decide, Autopilot re-checks every item and never takes sensitive ones | ai-classify: "prompt injection in the industry text stays one line of data inside the delimiters"; ai-studio: "the request and the text are data inside delimiters"; ai-why-now: "grounding: every name, number, date and quote must be in the rows the line cites"; copilot: "a reject or send-back is refused; approvals are sensitive and never for Autopilot" |
| T8 | A compromised or vulnerable dependency | Exact versions in `package-lock.json` and `npm ci`; a CI gate allows no high or critical advisory in production dependencies (empty allow-list); no version younger than its policy age (D-31); GitHub Actions pinned by commit, images by digest; SheetJS from its official tarball, pinned by checksum | CI: `npm run audit:gate`, `npm run deps:age`; see §3.7 for SheetJS |

### Repudiation

| # | Threat | Mitigation | Proof |
|---|---|---|---|
| R1 | "I didn't do that": admin changes, data access, sign-ins | `audit_log` (append-only), written in the same transaction as the change, as the acting person in their unit, with the request ID; §3.4 lists what is recorded. Decisions on recommendations have their own append-only decision log | integration/security: "audit entries can only be written as the acting user, in the acting unit"; integration/auth: lockout, sign-out and reset requests audited; integration/prospecting: list downloads audited; integration/purge: purge and export audited |
| R2 | Not knowing what the AI wrote | Every model call leaves one `ai_calls` row (capability, template and version, deployment, tokens, outcome, fallback reason; never the prompt or reply). AI-made items are labelled "AI-assisted" with a confidence | ai-gateway: "a valid JSON reply comes back typed, with one metadata record…"; integration/ai (ai_calls per unit, append-only) |

### Information disclosure

| # | Threat | Mitigation | Proof |
|---|---|---|---|
| I1 | Reading another unit's or owner's records (IDOR) | RLS plus scoped services; by-ID reads outside scope answer 404, so a record's existence isn't confirmed; Viewers get aggregates only | integration/security: "business units are isolated…"; integration/auth: "a unit cannot change or see people of another unit (IDOR)…"; http/auth-http: "role × route matrix…", "Analytics and Today: a Viewer reads aggregates without records…" |
| I2 | Personal data in application logs | pino redacts sensitive keys; email addresses are masked anywhere in messages and errors; no file names, row values, prompts or replies are logged; IDs only | http/auth-http: "logs: … no email addresses anywhere"; http/uploads-http: "logs: upload and scoring events are logged without file names or any contact's address"; http/ai-http: "Autopilot over HTTP, then the whole run's logs: no person's name, email or LinkedIn link, no file name, no prompt" (every one of the sample's 7,500 people checked) |
| I3 | Personal data left in the browser | All data lives on the server; browser storage holds three UI preferences only | screens: "browser storage keeps UI preferences only: three named keys…" |
| I4 | Personal data sent to the model | Minimised per capability (AI.md §3): classification sends industry texts only; drafting sends role, persona and signal, never a name or address; Copilot replaces every person with a token (P1, R1), one per person. Every capability is off unless switched on | ai-draft: "the prompt carries the action, the role, the signal…: no names, no contact details…"; copilot: "people become tokens before anything is sent…"; http/ai-http: "no email address is sent" |
| I5 | Secrets in the repository, bundles or logs | Secrets only in the environment (`.env*` ignored; production from AWS Secrets Manager, Phase 9); the AI key is never shown or logged; gitleaks scans every commit in CI | http/ai-http: "the Admin health check… never shows the key", "the key and prompts out of the logs"; repo-hygiene: "git ignores … .env files"; CI: gitleaks (§3.6) |
| I6 | Finding out who has an account | The same reply and the same work for unknown emails, at sign-in and on "forgot password" | integration/auth: "a wrong password and an unknown email get the same answer", "reset: same reply for unknown emails…" |
| I7 | Clickjacking, framing, sniffing, leaking URLs | `frame-ancestors 'none'` and `X-Frame-Options: DENY`; `nosniff`; `Referrer-Policy: same-origin`; HSTS; COOP and CORP same-origin; a Permissions-Policy that turns off camera, microphone, location and the rest; no `X-Powered-By` | http/headers-http: "every response carries the security headers and none says what it runs on…" |
| I8 | Keeping personal data longer than agreed | The purge (§3.3) removes uploaded files and everything made from them, by date, by upload, or by unit once its retention period after the readout has passed; the export returns the data first | integration/purge (7 tests) |
| I9 | Error details revealing internals | Errors come back as `{ error, code, requestId }` with no stack traces or SQL; the request ID links to the server log | http/auth-http: "without a session, every non-public route answers 401 with a JSON error and a request ID" |
| I10 | Fonts and scripts loaded from third parties | Fonts are self-hosted (`next/font`) and `connect-src`, `font-src` and `img-src` allow the app's own origin only | http/headers-http: "fonts must be self-hosted" |

### Denial of service

| # | Threat | Mitigation | Proof |
|---|---|---|---|
| D1 | Flooding sign-in, uploads or other expensive routes | Per-person sliding-window limits on every route that starts a heavy job or a model call (§3.2); per-address and per-email limits on sign-in and resets; 429 with Retry-After | http/auth-http: "route inventory… expected policy and rate limit", "a route that starts model calls refuses a person past its limit, with Retry-After…" |
| D2 | Huge or decompression-bomb files | Byte caps while reading the body; inflate caps per entry; row cap; job time limits | see T5 |
| D3 | Running up the AI bill | Every capability off unless switched on; per-person limits; at most 4 model calls at once per process; timeouts and a deadline per call; a circuit breaker; batching; the cost of every call recorded and shown on Setup › AI service | ai-gateway: "the per-process limit holds calls in flight…", "the circuit breaker opens after 5 failed calls…", "retries stop at the caller deadline" |
| D4 | Slow queries or stuck transactions | 30 s statement timeout, 60 s idle-in-transaction timeout, a bounded pool; no transaction is held during a model call | integration tests (jobs, recovery); worklog gotcha (session 8) |

### Elevation of privilege

| # | Threat | Mitigation | Proof |
|---|---|---|---|
| E1 | Doing what your role can't | One permission table (`lib/auth/permissions.ts`) checked by `withApi` for every route and again in services for manager-only actions; only an Admin grants Admin; the last Admin can't be removed or demoted; every route must declare its policy or the build's tests fail | http/auth-http: "route inventory…", "role × route matrix…"; integration/auth: "roles: only an Admin grants Admin; the last Admin cannot be demoted or removed" |
| E2 | Escalating inside the database | No superuser, CREATEROLE, CREATEDB or BYPASSRLS for any DemandAI role; security-definer functions are owned by the owner role, pin `search_path`, revoke PUBLIC, and are granted to exactly one role each | integration/security: "SECURITY DEFINER functions: …each run only by its role"; integration/purge: "only the ops role runs the purge, the retention report and the export; it reads no table itself" |
| E3 | A platform admin reading unit data | Platform admins manage business units; they see a unit's data only with a role in that unit | http/auth-http: "a platform admin without a unit role sees no unit data" |
| E4 | Autopilot acting beyond what the person approved | Low-risk items only, each re-checked before it acts, logged under the person, never counted toward G2, undoable by the person who ran it | copilot and integration/copilot tests; http/ai-http Autopilot run and undo |

## 3. Controls in detail

### 3.1 Headers and Content Security Policy

`proxy.ts` makes a 128-bit nonce for each request and sends the policy from `lib/security/csp.ts`. Next.js reads the nonce and puts it on its own scripts. Every page renders per request, so every page gets one; the root layout awaits `connection()`.

```
default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline';
style-src-elem 'self' 'nonce-…'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self';
connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none';
upgrade-insecure-requests   (when APP_BASE_URL is https)
```

Style **attributes** are allowed because the screens set hundreds of inline styles (plan §11 risk 5). Style **elements** need the nonce. `style-src` is the fallback for browsers that predate the `-elem`/`-attr` directives. Development adds `'unsafe-eval'` (React's dev tools) and nonce-less style elements (hot reload).

`next.config.ts` sends the rest on every response: HSTS (1 year, subdomains; browsers ignore it over plain http), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` (it keeps the Origin header that the CSRF check needs), `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`, and no `X-Powered-By`.

### 3.2 Request protection

- **Origin check** on every POST, PUT, PATCH and DELETE in `withApi`, before anything else, public routes included.
- **Sliding-window limits** stored in PostgreSQL, so they hold across restarts and instances. A window counts the current period plus the previous one weighted by their overlap, so a burst across a boundary gets no more than the limit through. A refused request still counts. Keys are keyed hashes, never an email or address. Old windows are pruned hourly.

| Limit | Per | Allowed |
|---|---|---|
| Sign-in | address / email | 30 / 10 per 15 min |
| Forgot password | address / email | 10 / 3 per hour |
| Invite and reset links | address | 30 per 15 min |
| Uploads (incl. the sample and rechecks) | person | 60 per 10 min |
| Corrections | person | 60 per 10 min |
| Scoring runs | person | 30 per 10 min |
| NBA builds | person | 20 per 10 min |
| Content studio writing (new pieces and changes) | person | 60 per 10 min |
| Copilot questions | person | 120 per 10 min |
| AI health check | person | 10 per 10 min |
| Client error reports | address (per process) | 30 per 5 min |

A route that starts heavy work or a model call must declare its limit: the route inventory test fails otherwise.

**Deployment requirement.** Set `TRUSTED_PROXY_HOPS` to the number of proxies that append to X-Forwarded-For (an ALB or Ingress: 1), and let no traffic reach the app except through them. The security group or NetworkPolicy should allow the app port from the proxy only (Phase 9).

### 3.3 Data lifecycle (D-20)

The retention period is provisional until the Client contract states it: 30 days after the readout (`RETENTION_DAYS_AFTER_READOUT`). The clock starts from a unit's latest sponsor decision when that decision ends the pilot ("Stop" or "Go to production"). Extending the pilot never starts it.

- `npm run data:purge -- --status` shows each unit's decision and due date.
- `--due` purges every unit that is due. `--before <date> [--unit <code>]` and `--upload <id>` purge by date or by file. Without `--yes`, every run is a dry run that counts what would go, table by table.
- The purge removes the uploaded files and everything made from them: lists, accounts, contacts, issues, corrections, scoring runs, signals, scores, hand-offs, micro-segment builds, recommendations, drafts, the decision log, pauses, spot-checks, Autopilot runs, transfers and jobs. A date purge also drops the unit's cached AI industry answers. It keeps the audit log, AI call records (metadata only), readouts and sign-offs, configuration, brand packs, Content studio pieces and users.
- It runs in one transaction, refuses while a job still works on the data, and writes one audit entry per unit.
- `npm run data:export -- --out <new folder> [--unit <code>] [--before <date> | --upload <id>]` returns the data first. It writes the files exactly as received (each checked against the SHA-256 taken at upload) and one JSON Lines file per table, plus a manifest. A date export also includes readouts, sign-offs, studio pieces and unit members (never a password hash). The folder holds personal data: keep it encrypted, hand it over by an agreed secure route, and delete it afterwards. Exports are audited.
- Both commands connect as `demandai_ops` (`DATABASE_OPS_URL`). That role can run only `purge_pilot_data`, `pilot_retention`, `export_pilot_files` and `export_pilot_rows`; they are SECURITY DEFINER functions in migration 0037. In Compose: `docker compose run --rm migrate node scripts/data/purge.mjs --status`.

### 3.4 Audit coverage

| Area | Recorded (`audit_log.action`) |
|---|---|
| Sign-in and accounts | `auth.sign_in`, `auth.sign_out`, `auth.locked`, `auth.invite_accepted`, `auth.reset_requested`, `auth.password_reset` |
| People and units | `user.invited`, `user.invite_resent`, `user.updated` (role changes; also `user_role_history`), `user.removed`, `user.restored`, `user.reset_link_issued`, `user.alias_added`, `user.alias_removed`, `business_unit.created`, `business_unit.admin_invited` |
| Data in | `upload.received`, `upload.rechecked`, `mapping.saved`, `list.saved`, `list.saved_selection`, `list.renamed`, `list.deleted`, `list.corrected`, `list.rebuilt` |
| Work | `scoring.started`, `scoring.saved`, `scoring.renamed`, `scoring.deleted`, `handoff.created`, `nba.built`, `nba.renamed`, `recommendation.reassigned`, `recommendation.data_flagged`, `account.transferred_out`, `account.transferred_in`, `autopilot.run`, `autopilot.undone`, `studio.created`, `studio.ready`, `studio.draft` |
| Configuration | `config.signal_added`, `config.signal_removed`, `config.signal_switched`, `config.validation_changed`, `config.signed_off`, `config.reopened`, `routing.rule_added`, `routing.rule_changed`, `routing.rule_moved`, `routing.rule_removed`, `brand.published`, `brand.restored`, `brand.draft_discarded`, `brand.document_added`, `readout.signed_off`, `ai.healthcheck` |
| Data out | `list.exported` (a check's issues, the validation report), `review.exported` (released messages, tasks, decision log), `analytics.exported` (outcome log), `config.exported`, `studio.exported`, `data.exported` (ops), `data.purged` (ops) |

Some things are recorded elsewhere or not at all, by design:

- Every decision on a recommendation is a row in the append-only decision log, and segment pauses have their own append-only table.
- Opening a single record and the aggregate downloads (weekly summary, readout) are not audited.
- Copilot questions and answers are kept in the asker's saved chats (`copilot_chats`, `copilot_messages`): row-level security limits them to the person and unit, the person may delete them, and the end-of-pilot purge removes them (with the record they are about, or by date). Each model call also leaves an `ai_calls` row.

### 3.5 Logs

pino writes JSON to stdout. Every line carries the request, user and business-unit IDs. Sensitive keys (`password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`, `email`, at any of the first two levels) are redacted, and email addresses are masked in messages and error text. Services log IDs and counts, never row values, file names, prompts or replies. Client-side errors posted to the server are masked the same way, with query strings dropped. How long logs are kept, and where, is set by the platform (Phase 9).

### 3.6 Secrets

- Secrets come only from the environment: locally from `.env.local` (git-ignored, generated with random values by `npm run setup:env`), in production from AWS Secrets Manager (Phase 9).
- The app never logs or shows them. The Setup panel names the AI auth header, never the key.
- Database passwords are per role; rotate them with `ALTER ROLE … PASSWORD` and update the secret.
- If a secret leaks, rotate it first (the provider key in Azure, the database role, `SESSION_SECRET`, which signs everyone out), then remove it from the code. Rewriting git history needs the repository owner's agreement.
- **Secret scanning:** CI runs gitleaks v8.30.1 (its own image, pinned by digest) over every commit, with values redacted. `.gitleaks.toml` keeps the default rules and allowlists one known false positive, with its reason (browser-storage key names in the legacy prototype). The history scanned clean on 24 Oct 2026; a scratch repository with planted keys was caught.

### 3.7 Dependencies and images

- `npm run audit:gate` (CI): no high or critical advisory in production dependencies. The allow-list (`security/audit-allowlist.json`) is empty.
- `npm run deps:age` (CI): no locked version younger than the policy age (D-31). New dependencies are installed with `--save-exact --before=<7 days ago>`.
- SheetJS stopped publishing to npm at 0.18.5, which has two high-severity advisories (GHSA-4r6h-8v6p-xvw6 prototype pollution, GHSA-5pgg-2g8v-p4x9 ReDoS). 0.20.3 fixes both and is the newest release on its CDN (checked 22 Oct 2026). `package.json` installs it from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (2,409,319 bytes, SHA-256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`, Apache-2.0), and `npm ci` refuses it unless it matches the integrity hash in `package-lock.json` (`sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`). Installs, CI agents and image builds therefore need to reach `cdn.sheetjs.com`. Until 30 Oct 2026 the tarball was committed under `vendor/`; Azure Repos refuses files over 1 MB (D-24).
- `npm audit` can't see SheetJS, so track its advisories by hand: check `https://git.sheetjs.com/sheetjs/sheetjs/issues` and the CDN for a newer release at least monthly and before every production deployment. To upgrade, check the new tarball's checksum, record it here, and run `npm install --save-exact xlsx@https://cdn.sheetjs.com/xlsx-<version>/xlsx-<version>.tgz`.
- Base images are pinned by digest: `node:24.22.1-alpine3.23` (Dockerfile), `postgres:16.15-bookworm` (Compose, CI). GitHub Actions are pinned by commit. The runtime image runs as uid 10001, with code owned by root and read-only.

### 3.8 AI

See [AI.md](AI.md) §1–3. In short:

- Prompt injection: file text is data inside delimiters; answers are validated, grounded and checked, and the rules answer when a check fails (T7).
- Data minimisation per capability, with people as tokens (I4).
- The key: https only, in one header, never shown or logged (S6, I5).
- Cost abuse: flags, limits, concurrency, breaker and timeouts (D3).
- The model never changes data (E4).

The provider's data-use and abuse-monitoring terms, and the resource's region, are to be confirmed before the pilot (AI.md §1).

## 4. Residual risks

1. **No second factor.** Password sign-in only. Mitigated by invite-only accounts, password rules, lockout, short sessions, and every session ending on a reset. If the Client's review requires MFA, Entra SSO is the fallback (D-3).
2. **The client address depends on the proxy set-up** (S5). On 24 Oct 2026 the production build, reached directly, took 35 sign-in attempts with made-up X-Forwarded-For values without a per-address refusal. Deploy behind the proxy only.
3. **Inline style attributes are allowed** by the CSP. A style-injection bug could restyle a page; scripts stay nonce-only.
4. **Uploaded files are not scanned for malware.** They are parsed, never run, and served back only through the ops export. Brand guideline documents are served as attachments with `nosniff`. Add scanning if the Client requires it.
5. **The retention rule is provisional** (D-20): 30 days after a sponsor decision that ends the pilot. The Client contract decides.
6. **The Client's name is in early git history** (D-23); the current tree is clean, and a CI test keeps it so when `CLIENT_NAME_PATTERN` is set.
7. **The legacy prototype** (`legacy/`, never in the image) keeps its known defects and must never be used with real data.
8. **One database and one app process per environment** in the pilot set-up. Availability, backups, restore and log retention are covered by the deployment guide (Phase 9).

## 5. Reporting a problem

Report a suspected vulnerability or leaked secret to the delivery team's security contact, not in a public issue. Include the request ID from the error message if there is one.

To trace an incident, use `audit_log`: filter by action and date, or by `request_id`, which matches the server logs. For an AI question, `ai_calls` (Setup › AI service) gives metadata per call.
