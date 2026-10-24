# Logs, metrics and alarms

The app writes one JSON object per line to standard output (pino, D-39): every line has `level`, `time`, `service: "demandai"`, `version` (the build), and where there is one, `requestId`, `userId` and `businessUnitId`. No personal data and no secrets (tests scan the logs for the sample's 7,500 people, emails, LinkedIn links, file names, prompts and keys). `LOG_LEVEL` sets the detail (`info` in production). The backup one-shot and the migrate one-shot write the same shape (`service: "demandai-backup"`, `"demandai-migrate"`).

## Getting the logs out

- **EKS:** Container Insights with Fluent Bit sends container output to CloudWatch Logs (`/aws/containerinsights/<cluster>/application`). The JSON is parsed, so the fields below can be queried.
- **EC2:** the `awslogs` driver per service in a host override (`logging: { driver: awslogs, options: { awslogs-group: /demandai/pilot, awslogs-region: …, tag: "{{.Name}}" } }`), or the CloudWatch agent reading Docker's JSON files. Without either, `docker compose logs`.
- **RDS:** export the `postgresql` log (slow statements over 500 ms, errors) to CloudWatch.
- **The proxy:** Caddy logs JSON to standard output; the ALB writes access logs to S3 if enabled.

## The events worth counting

| Event (`event`) | Fields | Meaning |
|---|---|---|
| `http.request` | `status`, `durationMs`, `method`; the route in `msg` | One per API request: error rate and latency |
| `request.error`, `api.error` | `err` (type and message, no data) | A request that failed on the server |
| `ready.database_down`, `ready.migrations_pending` | | The readiness check failed: database unreachable, or behind this build |
| `db.pool.error`, `db.client.error`, `db.transaction.slow` | | Database connection errors; a transaction over `LOG_SLOW_QUERY_MS` |
| `job.started`, `job.stage`, `job.succeeded`, `job.failed`, `job.recovered` | `kind`, stage timings and counts | Uploads, scoring and builds; a job picked up again after its process stopped |
| `upload.received`, `upload.refused` | sizes and row counts (no file names) | What came in and why some were refused |
| `ai.call` | `capability`, `templateId`, `deployment`, `model`, `reasoningEffort`, `latencyMs`, tokens, `outcome` (ok, fallback, filtered, error), `fallbackReason`, `estCostUsd` | One per model call (D-6); also kept in the `ai_calls` table and on **Setup › AI service** |
| `auth.sign_in.failed`, `auth.sign_in.locked`, `auth.sign_in.rate_limited` | | Possible password guessing |
| `client.error` | | An error in someone's browser, posted to the server |
| `config.invalid`, `config.warning` | variable names only | A setting the app refused or warns about at start |

## Proposed alarms

| Alarm | Source | Threshold (start here, tune in week 1) | Owner |
|---|---|---|---|
| App not ready | ALB unhealthy hosts (EKS) or an uptime check on `/api/ready` (EC2) | Any target unhealthy for 3 minutes | DevOps |
| Server errors | `http.request` with `status >= 500` | More than 2% of requests, or 10 in 5 minutes | DevOps, then the delivery team |
| Database errors | `db.pool.error` + `db.client.error`; RDS CPU, free storage, connections | Any in 5 minutes; CPU > 80% for 15 minutes; storage < 20% | DevOps |
| Jobs failing | `job.failed` | 3 in an hour | Delivery team |
| AI falling back | `ai.call` with `outcome != "ok"` | More than 20% of calls in an hour, or `fallbackReason = "circuit_open"` | Delivery team (and the gateway's owner for `rate_limited`, `server_error`, `auth`) |
| AI cost | Sum of `estCostUsd` per day | Above the agreed daily budget | Product owner |
| Sign-in attacks | `auth.sign_in.locked` + `auth.sign_in.rate_limited` | 10 in 15 minutes | DevOps |
| Backup | EC2: the `demandai-backup` unit failed, or the newest dump older than 26 hours or less than half the previous one's size; RDS: automated backup failure events | Any | DevOps |
| Certificate expiry | ACM (EKS) or a TLS check on the EC2 host name | Under 21 days left | DevOps |
| Disk (EC2) | CloudWatch agent | Root volume over 80% | DevOps |

A CloudWatch Logs metric filter for server errors, for example: `{ $.event = "http.request" && $.status >= 500 }`; for AI fallbacks: `{ $.event = "ai.call" && $.outcome != "ok" }`.
