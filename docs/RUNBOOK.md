# Runbook: operating the DemandAI pilot

For whoever supports the pilot day to day. Deploying, releasing, rolling back, restoring the database and rotating secrets are in [docs/devops](devops/README.md); this covers what happens while it runs. Commands marked *(owner role)* use `DATABASE_MIGRATION_URL`; run them through the `migrate` service (Compose) or a Job (Kubernetes), never from a laptop against production.

## 1. Is it up?

```bash
curl -fsS https://<host>/api/health     # {"status":"ok","version":"<release>","uptimeSeconds":…}: the process runs this build
curl -fsS https://<host>/api/ready      # 200 {"status":"ready"}; 503 says which check failed
```

| `/api/ready` says | Meaning | Do |
|---|---|---|
| `database: "down"` | The app can't reach PostgreSQL (or it took over 2 s) | Check the database (RDS status, or `docker compose ps db`), the security group, the role password; logs: `ready.database_down`, `db.pool.error` |
| `migrations: "pending"` | The database is behind this build: the migrate step didn't run or failed | Read the migrate log; run it ([devops/REDEPLOY.md](devops/REDEPLOY.md)) |
| `database: "not-configured"` | `DATABASE_URL` is missing | Fix the configuration; the app also refuses to start without it in production |

A process that fails its start-up checks logs `config.invalid` with the variable's name and stops.

## 2. Uploads

People see what went wrong in the checks pop-up, worded for them. Behind it:

| They see | Why | Do |
|---|---|---|
| "The file is too large" / "too many rows" | Over `UPLOAD_MAX_BYTES` (25 MB) or `UPLOAD_MAX_ROWS` (50,000) | Split the file; raise the limit only with the Client's agreement (memory: about 0.7 GB at 20,000 rows) |
| A refusal for macros, passwords, a zip bomb or the wrong type | The upload checks (`upload.refused` in the logs, with the reason code) | Save as a plain .xlsx or .csv |
| "Couldn't read the file" | Encoding or a damaged workbook | Save again as CSV UTF-8, or .xlsx |
| Columns not recognised | Not the template's headers | **Prospecting › the mapping panel**: map the columns and **Re-check**; the mapping is saved for the next file |
| The job failed with "Something went wrong…" | An internal error; the job is retried automatically (backoff) until its attempts run out | Find `job.failed` in the logs for that time (job ID, stage, error code; no data); upload again; if it repeats, raise it with the delivery team with the job ID |

**Reprocessing a file.** A list is rebuilt from its upload whenever someone corrects a row (**Prospecting › Edit**, with a reason and a source) or re-checks it with a new column mapping: every correction of that upload is replayed, the new version keeps the list's name and selection, and the old one is kept only if runs were made on it. Scores are never changed in place: start a new scoring run (**Account Scoring › New scoring**), which names the configuration version it used.

**A job that seems stuck.** Each running job is shown with its stage. A job whose process stopped (a restart, a crash) is re-queued within about 5 minutes by the next worker (`job.recovered`), up to its attempt limit. To look *(owner role)*:

```sql
SELECT id, kind, status, stage, attempts, max_attempts, locked_at, error_code FROM jobs
WHERE status IN ('queued', 'running') OR (status = 'failed' AND finished_at > now() - interval '1 day') ORDER BY created_at DESC;
```

## 3. People and access

| Situation | Do |
|---|---|
| Someone can't sign in | Five wrong passwords in a row lock the account for 15 minutes (`auth.sign_in.locked`). An Admin can send a reset link: **Users and roles › the person › Send a password reset link** (shown to copy while email is off) |
| A new person | **Users and roles › + Invite user**: name, email, role, manager; reps get **owner addresses** (the `owner_email` values in lead files that are theirs) or they see no accounts |
| A rep sees nothing | Their owner addresses don't match the files' `owner_email`; add them as aliases (managers and Admins see every account, so they can check which owner addresses a list uses) |
| Someone leaves | **Deactivate** them: every session ends at their next request. The last Admin of a unit can't be removed or deactivated |
| A new business unit | A platform administrator: **Platform › Create**, then **Invite Admin** |
| Who did what | The audit log *(owner role)*: `SELECT occurred_at, action, actor_user_id, actor_role, target_type, target_id FROM audit_log WHERE business_unit_id = '<unit>' ORDER BY occurred_at DESC LIMIT 200;` Sign-ins, sign-outs, lockouts, invites, role changes, configuration and brand changes, exports, transfers and sign-offs are there |

## 4. AI

Every AI step falls back to its rules on its own when the model is slow, failing, filtered or its answer fails the checks; the screens say how many items the AI did. **Setup › AI service** shows each capability's calls, fallback reasons, tokens and cost for 30 days, whether a circuit breaker has opened, and runs a health check of each model.

| Situation | Do |
|---|---|
| Many fallbacks, reason "busy or slow" | The gateway is slow or rate-limiting: raise `AI_TIMEOUT_MS` (45–60 s for the pilot's gateway) or lower `AI_MAX_CONCURRENCY`; ask for more quota |
| "kept failing, so the rules took over" | The breaker opened after 5 failures in a row; it tries again after 60 s. Check the health check and the gateway |
| Refused credentials | The key or its header (`AZURE_OPENAI_AUTH_HEADER`); rotate as in [devops/SECRETS.md](devops/SECRETS.md) |
| Switch a capability off now | Set its `AI_FEATURE_*` to `0` and restart; nothing else changes |
| Check the endpoint from outside the app | `node scripts/ai/diagnose.mjs` with the AI settings ([devops/AZURE-OPENAI.md](devops/AZURE-OPENAI.md)) |

Prompts and replies are never stored; `ai_calls` keeps the metadata of each call (capability, template, model, effort, timing, tokens, outcome).

## 5. Data at the end of the pilot (D-20)

Data is kept until the retention period after the sponsor's closing decision (**Analytics › Pilot readout**: "Stop" or "Go to production"; 30 days by default, `RETENTION_DAYS_AFTER_READOUT`). As the ops role:

```bash
node scripts/data/export.mjs --out /exports/pilot-end --unit pilot-bu     # the original files and every table as JSON Lines, with a manifest
node scripts/data/purge.mjs --due                                          # a dry run: what is due
node scripts/data/purge.mjs --due --yes                                    # deletes it, in one transaction
node scripts/data/purge.mjs --upload <upload id> --yes                     # one upload and everything made from it
```

A purge keeps the audit log, AI call metadata, readouts and sign-offs, configuration, brand packs, Content studio pieces and users. On EKS the daily CronJob runs the dry run until `--yes` is added ([devops/DEPLOY-EKS.md](devops/DEPLOY-EKS.md) §6).

## 6. Incidents

1. **Assess.** What is affected (everyone, a unit, a person), since when (`/api/health` uptime, the logs), and whether data may have been exposed or changed.
2. **Stabilise.** Roll back a bad release ([devops/REDEPLOY.md](devops/REDEPLOY.md)); switch off an AI capability; deactivate a compromised account; rotate a leaked secret ([devops/SECRETS.md](devops/SECRETS.md)).
3. **Preserve evidence.** Copy the logs for the window and the relevant audit-log rows before they age out; take a database snapshot if data may have changed.
4. **If personal data may be involved**, tell the Client's data protection contact at once: the lead files hold names, job titles, emails and LinkedIn addresses of the Client's prospects. The audit log shows who exported lists (`list.exported`) and who signed in.
5. **Restore** if needed ([devops/RDS.md](devops/RDS.md) §5 for RDS; for the Compose database, `pg_restore` the newest checked dump from the `pg_backups` volume into a new database and point the app at it).
6. **Write it up**: timeline, cause, what changed, and the test or check that would have caught it.
