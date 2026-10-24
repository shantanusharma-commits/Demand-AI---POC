# Secrets and their rotation

Every secret lives in AWS Secrets Manager (D-37) and reaches the app as an environment variable: on EC2 through `deploy/ec2/sync-secrets.sh` at each start, on EKS through External Secrets. None is in the repository, the image (CI checks the build output for dummy secret values, `npm run check:bundle`) or the logs (the logger redacts them; the tests scan the logs). The app validates its settings at start-up and names a missing or wrong one without printing its value.

| Secret | What it protects | Who holds it | Rotate |
|---|---|---|---|
| `SESSION_SECRET` (48 random bytes) | Signs session cookies | The app | Yearly, or at once if exposed. Everyone is signed out |
| `DEMANDAI_APP_PASSWORD` (in `DATABASE_URL` on EKS) | `demandai_app`: the app's data access | The app | Yearly or on staff change |
| `DEMANDAI_OWNER_PASSWORD` (in `DATABASE_MIGRATION_URL`) | `demandai_owner`: schema and migrations | migrate, create-admin | Yearly |
| `DEMANDAI_OPS_PASSWORD` (in `DATABASE_OPS_URL`) | `demandai_ops`: purge and export | The purge CronJob, ops commands | Yearly |
| `POSTGRES_PASSWORD` | The local `db` container's superuser (development only) | The db and backup containers | When the host is rebuilt |
| `AZURE_OPENAI_API_KEY` | The model service (D-40, D-44) | The app | As the gateway's owner requires; two keys allow a switch without downtime |
| `NOTIFICATION_APP_PASSWORD` | The SMTP sender (D-29), once email is on | The app | As the mail provider requires |
| RDS master password | Emergencies only; DemandAI never uses it | DevOps | Managed by RDS in Secrets Manager |

## How to rotate

**The session secret.** Put a new value (`openssl rand -base64 48`) in the secret, then restart: EC2 `sudo systemctl restart demandai`; EKS `kubectl -n demandai annotate externalsecret demandai-app force-sync=$(date +%s) --overwrite` then `kubectl -n demandai rollout restart deploy/demandai-app`. Every session ends; people sign in again.

**A database role.** One role at a time, with no downtime:

1. Generate a URL-safe password (`openssl rand -hex 32`).
2. `ALTER ROLE demandai_app PASSWORD '<new>';` as the master user (RDS) or the superuser (local `db`).
3. Update the secret (EC2: `DEMANDAI_APP_PASSWORD`; EKS: the password inside `DATABASE_URL`).
4. Restart the app (as above). Connections already open keep working until they close; new ones use the new password.

Do the same for `demandai_owner` before the next migration and for `demandai_ops` before the next purge or export.

**The Azure OpenAI key.** Regenerate the key the app is *not* using, put it in the secret, restart the app, run **Setup › AI service › Run a health check**, then regenerate the other key. With an API Management gateway, the gateway's owner issues the subscription key; the header name is `AZURE_OPENAI_AUTH_HEADER`.

**If a secret leaks.** Rotate it at once as above; for the session secret that also signs everyone out. Check the audit log (sign-ins, admin changes) and the database's own logs for the exposure window. gitleaks in CI scans every commit for committed secrets.
