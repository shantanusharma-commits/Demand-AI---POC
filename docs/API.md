# HTTP API

The browser screens are the only intended client: there is no public or partner API, no API keys and no versioning. Every route lives under `app/api/**/route.ts`. 129 routes go through `withApi()` (`lib/server/http/api.ts`); three more (`/api/health`, `/api/ready`, `/api/client-errors`) are deliberately outside it. The list below is the route inventory that `tests/http/auth-http.test.ts` holds the server to: a route added without updating that inventory fails the test, and every route is tried with every role.

## Conventions

| Topic | Rule |
|---|---|
| Authentication | The `demandai_session` cookie (HttpOnly, SameSite=Lax, `Secure` when `APP_BASE_URL` is https) holds an HMAC-signed session ID; the session and the user are re-read from PostgreSQL on every request. No bearer tokens |
| Auth modes | `public`: no session. `user`: any signed-in person. `unit`: signed in with an active business unit, and the role must hold the route's permission. `platform`: the platform administrator |
| Permissions | One table for the server and the screens: `lib/auth/permissions.ts` (`ACTIONS`). *Workers* = Admin, Sales manager, Sales rep; *managers* = Admin, Sales manager |
| Scoping | Every `unit` route runs inside `withTenant()`: rows are limited to the active unit, and for Sales reps to the accounts they own (owner email or alias), by the services and again by row-level security |
| CSRF | `POST`, `PUT`, `PATCH`, `DELETE` must carry an `Origin` equal to `APP_BASE_URL`'s (in production), else 403 |
| Bodies | JSON, validated with zod, 64 KB unless the route allows more. Uploads are `multipart/form-data` (`kind`, `file`), up to `UPLOAD_MAX_BYTES` |
| Paging | Long lists are keyset-paged: `?after=<cursor>&limit=<1–500>&q=<search>`, plus each route's filters; unknown parameters are ignored |
| Errors | `{ "error": "<plain words for the person>", "code": "<code>", "requestId": "…", "fields"?: {…} }` with 400, 401, 403, 404, 409, 413, 429 or 500. No stack traces or stored values |
| Request ID | `x-request-id` on every response (taken from the request when it is 8–64 safe characters); quote it to support; it is on every log line |
| Caching | `cache-control: no-store` on every API response |
| Rate limits | Per person, in PostgreSQL (hold across restarts and instances): uploads and rechecks 60, corrections 60, scoring runs 30, NBA builds 20, Content studio writing 60, Copilot 120, AI health checks 10, each per 10 minutes. Sign-in: 30 per address and 10 per email per 15 minutes; reset requests 10 per address and 3 per email per hour; link redemption 30 per address per 15 minutes. 429 with `Retry-After` |
| Jobs | Uploads, rechecks, corrections and scoring runs answer `201` with the new record and its job ID; an NBA build answers `201` with the build, or `202` with a job ID when AI drafting is on. Poll `GET /api/jobs/:id` for the job's stages and result |
| Downloads | CSV (UTF-8 with BOM, formula cells neutralised), Markdown and Word (`.docx`) are generated on the server; the browser builds only the empty upload templates |

## Health and operations (outside `withApi`)

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/health` | public | Liveness: `{status, version, uptimeSeconds}`; no database call. The container health check |
| `GET /api/ready` | public | Readiness: 200 when the database answers within 2 s and has every migration the build expects, else 503 with which check failed |
| `POST /api/client-errors` | public, same-origin | Browser error boundaries report failures to the server log; size-capped, rate-limited per process, nothing stored |

## Routes

Columns: auth mode, then the permission (`unit` routes) and the rate limit where one applies.

### Sign-in and session

| Route | Auth | Permission | Limit |
|---|---|---|---|
| `POST /api/auth/login` | public | | sign-in limits |
| `POST /api/auth/logout` | user | | |
| `POST /api/auth/accept-invite` | public | | link limit |
| `POST /api/auth/forgot` | public | | reset limits |
| `POST /api/auth/reset` | public | | link limit |
| `GET /api/me` | user | | |
| `POST /api/session/business-unit` (switch the active unit) | user | | |

### Users and roles, platform

| Route | Auth | Permission |
|---|---|---|
| `GET /api/users`, `GET /api/users/:id/history` | unit | `users.view` |
| `POST /api/users` (invite), `PATCH /api/users/:id`, `POST /api/users/:id/deactivate`, `…/reactivate`, `…/resend-invite`, `…/reset-link`, `POST /api/users/:id/owner-aliases`, `DELETE /api/users/:id/owner-aliases/:aliasId` | unit | `users.manage` (granting Admin also needs `users.grantAdmin`, checked in the service) |
| `GET /api/platform/business-units`, `POST /api/platform/business-units`, `POST /api/platform/business-units/:id/admins` | platform | |

### Prospecting: uploads, lists, corrections, column mappings

| Route | Auth | Permission | Limit |
|---|---|---|---|
| `POST /api/uploads`, `POST /api/uploads/sample`, `POST /api/uploads/:id/recheck` | unit | `data.upload` | upload |
| `GET /api/jobs/:id` | unit | `lists.view` | |
| `GET /api/lists`, `GET /api/lists/:id`, `…/contacts`, `…/contacts/:row`, `…/accounts`, `…/issues`, `…/issues.csv`, `…/report.csv`, `…/corrections` | unit | `lists.view` | |
| `PATCH /api/lists/:id` (rename), `DELETE /api/lists/:id`, `POST /api/lists/:id/save` | unit | `lists.write` | |
| `POST /api/lists/:id/corrections` | unit | `lists.write` | correction |
| `GET /api/corrections` | unit | `lists.view` | |
| `GET /api/column-mappings` / `POST /api/column-mappings` | unit | `lists.view` / `lists.write` | |

### Account Scoring, signals, routing

| Route | Auth | Permission | Limit |
|---|---|---|---|
| `GET /api/scoring-runs`, `GET /api/scoring-runs/:id`, `…/prospects`, `…/prospects/:contactId`, `…/signals`, `…/routing` | unit | `lists.view` | |
| `POST /api/scoring-runs` (start a run) | unit | `scoring.run` | scoring |
| `PATCH /api/scoring-runs/:id`, `DELETE /api/scoring-runs/:id`, `POST /api/scoring-runs/:id/save` | unit | `scoring.run` | |
| `GET /api/signal-monitoring` | unit | `lists.view` | |
| `GET /api/routing-rules`, `GET /api/transfers` | unit | `lists.view` | |
| `POST /api/routing-rules`, `PATCH /api/routing-rules/:id`, `DELETE /api/routing-rules/:id`, `POST /api/routing-rules/:id/move` | unit | `routing.manage` | |
| `POST /api/accounts/:id/transfer` (to another unit; needs the manager role in both) | unit | `routing.transfer` | |

### Hand-off, micro-segments and NBA

| Route | Auth | Permission | Limit |
|---|---|---|---|
| `POST /api/handoffs` | unit | `handoff.create` | |
| `GET /api/handoffs/:id`, `GET /api/nba-runs`, `GET /api/nba-runs/:id`, `GET /api/nba-runs/:id/export.csv` (the build as a spreadsheet) | unit | `lists.view` | |
| `POST /api/nba-runs` (build; a job when AI drafting, segments or next action is on) | unit | `nba.run` | NBA build |
| `PATCH /api/nba-runs/:id` (rename) | unit | `nba.run` | |
| `POST /api/nba-runs/:id/segments/pause`, `…/resume` | unit | `segments.pause` | |
| `GET /api/segments` (every micro-segment, its theme, status and use) | unit | `setup.view` | |
| `POST /api/segments/:id` (approve, rename, merge, retire, restore a segment the AI or a person created) | unit | `review.approve` | |

### Recommendations, For Review, decision log, exports

| Route | Auth | Permission |
|---|---|---|
| `GET /api/recommendations/:id`, `POST /api/recommendations/:id/open` | unit | `lists.view` |
| `POST /api/recommendations/:id/accept`, `…/reject` (the sales manager also rejects in Approvals), `…/hold`, `…/unhold`, `…/action` (with an optional reason), `…/segment` (move it to another micro-segment, with a reason), `…/fixes`, `…/step-in`, `…/teach`, `…/outcome`, `…/content` | unit | `review.decide` |
| `POST /api/recommendations/:id/approve`, `…/send-back`, `…/reassign`, `POST /api/decision-log/:id/check` | unit | `review.approve` |
| `GET /api/review/queue`, `GET /api/decision-log` | unit | `review.decide` |
| `GET /api/exports/decision-log.csv`, `…/released-messages.csv`, `…/tasks.csv`, `…/outcome-log.csv`, `…/for-review.csv` (everything waiting for a person) | unit | `review.decide` |

### Today and Analytics

| Route | Auth | Permission |
|---|---|---|
| `GET /api/today` | unit | `today.view` |
| `GET /api/analytics/areas`, `…/gates`, `…/funnel`, `…/evidence`, `…/weekly`, `…/weekly.md`, `…/readout`, `…/readout.md`, `…/learning-loop`, `…/validation` | unit | `analytics.view` (a Viewer gets aggregates only) |
| `PATCH /api/analytics/validation` (gate settings) | unit | `validation.edit` |
| `POST /api/readout/signoffs` (verdicts per success area, the sponsor decision) | unit | `readout.signoff` |

### Setup, Content library, Content studio

| Route | Auth | Permission | Limit |
|---|---|---|---|
| `GET /api/config`, `GET /api/config/export` | unit | `setup.view` | |
| `POST /api/config/sections/:section/sign-off`, `…/reopen` | unit | `setup.signOff` | |
| `POST /api/config/signals`, `…/signals/switch`, `…/signals/remove` | unit | `setup.signals` | |
| `PUT /api/config/scoring` (the rubric, tiers, personas, knock-outs, signal weights: a new version), `POST /api/config/scoring/preview` (tier moves on the newest scored list, nothing saved), `PUT /api/config/actions` (the action library) | unit | `setup.signals` | |
| `POST /api/config/scoring/lock` (open, locked, or the sponsor's sign-off) | unit | `setup.signOff` | |
| `GET /api/brand`, `GET /api/brand/claims/usage`, `GET /api/brand/documents/:id` | unit | `content.view` | |
| `PUT /api/brand/draft`, `DELETE /api/brand/draft`, `POST /api/brand/publish`, `POST /api/brand/restore`, `POST /api/brand/documents`, `POST /api/brand/documents/:id/read` (suggestions from a guideline: the AI's, else the rules') | unit | `brand.manage` | |
| `GET /api/studio/items`, `GET /api/studio/items/:id`, `…/docx`, `…/md`, `PUT /api/studio/items/:id`, `POST /api/studio/items/:id/status` | unit | `studio.use` | |
| `POST /api/studio/items`, `POST /api/studio/items/:id/change` | unit | `studio.use` | studio |

### Copilot and AI administration

| Route | Auth | Permission | Limit |
|---|---|---|---|
| `POST /api/copilot` (the answer carries the saved chat's `chatId`; pass it back to carry on) | unit | `copilot.use` | Copilot |
| `GET /api/copilot/chats?screen=&key=`, `GET /api/copilot/chats/:id`, `DELETE /api/copilot/chats/:id` (the person's own saved chats) | unit | `copilot.use` | |
| `POST /api/copilot/autopilot`, `POST /api/copilot/autopilot/:id/undo` | unit | `review.decide` | |
| `GET /api/admin/ai` (calls, fallbacks, cost for 30 days; breaker state) | unit | `ai.admin` | |
| `POST /api/admin/ai/healthcheck` | unit | `ai.admin` | AI health check |

## Pages

The screens are Server Components that check the session and the role before any screen code or data is sent (`lib/server/auth/page.ts`): `/today`, `/prospecting`, `/scoring`, `/nba`, `/review`, `/content`, `/studio`, `/analytics`, `/setup`, `/users`, `/platform`, and the public `/login`, `/accept-invite`, `/forgot-password`, `/reset-password`. Which role opens which screen: [README.md](../README.md#screens-and-roles).

## Integrations

| Outbound | When | Settings |
|---|---|---|
| PostgreSQL 16 | Always | [CONFIGURATION.md](CONFIGURATION.md) §2 Database |
| Azure OpenAI (through the pilot's API Management gateway) or Amazon Bedrock | Only with `AI_PROVIDER` set and a capability's flag on | [AI.md](AI.md), [devops/AZURE-OPENAI.md](devops/AZURE-OPENAI.md) |
| SMTP (STARTTLS) | Invites and resets, once a sender is configured | `NOTIFICATION_*` |

There are no inbound webhooks, no CRM or email-platform integration, and nothing sends messages to prospects ([KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md)).
