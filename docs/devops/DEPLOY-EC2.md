# Deploying on an EC2 host (Docker Compose)

One host runs the Compose stack (`compose.yaml`): `db` → `backup` → `migrate` → `app`, plus Caddy for TLS (`deploy/ec2/compose.proxy.yaml`). With RDS, `deploy/ec2/compose.rds.yaml` leaves out the `db` and `backup` containers. The image is pulled, never built on the host. Secrets come from AWS Secrets Manager at every start (`deploy/ec2/sync-secrets.sh`).

D-37 names EC2 with Compose for development and EKS for production; the same files suit a small production host too, with RDS.

## 1. Before you start (checklist)

- [ ] An image digest from a release (`.github/workflows/release.yml` prints it), or a local build for development.
- [ ] A DNS name for the app pointing at the host's Elastic IP, and an email address for Let's Encrypt notices.
- [ ] The database: the local `db` container (development), or an RDS for PostgreSQL 16 instance set up as in [RDS.md](RDS.md).
- [ ] One Secrets Manager secret (§3) and an instance profile that can read it (§2).
- [ ] The Client's agreement before any `AI_FEATURE_*` switch is set to 1 ([docs/AI.md](../AI.md) §5).

## 2. The host

- Amazon Linux 2023 or Ubuntu 24.04, 2 vCPU and 4 GB or more (a 20,000-row upload takes about 0.7 GB in the app), 30 GB disk (Docker images, the local database and its backups).
- Docker Engine with the Compose plugin (v2.24 or later), the AWS CLI v2, `jq`, `git`.
- Security group: inbound 443/tcp and 443/udp (HTTPS, HTTP/3) and 80/tcp (Let's Encrypt and the redirect) from where users are; nothing else. Use Systems Manager Session Manager instead of SSH. The app listens on 127.0.0.1 only and the database has no published port.
- Instance profile (IAM role) with `secretsmanager:GetSecretValue` on the one secret (and `kms:Decrypt` on its key if it is customer-managed), plus `ecr:GetAuthorizationToken` and the ECR pull actions if the image is in ECR. With Amazon Bedrock (`AI_PROVIDER=bedrock`), add `bedrock:InvokeModel` and `bedrock:Converse` on the chosen models; the app refuses static AWS keys.

```bash
sudo git clone <repository> /opt/demandai       # only compose.yaml, db/ and deploy/ are used
sudo install -d -m 700 /etc/demandai
```

On a host where `no-new-privileges` works (try `docker run --rm --security-opt no-new-privileges:true alpine:3 true`), add `security_opt: ["no-new-privileges:true"]` to the `app` and `migrate` services in a host override. It was left out of `compose.yaml` because on one test host (Docker 29.8, kernel 7.0, AppArmor) it stopped every program in any image from starting.

## 3. Configuration

`/etc/demandai/sync.conf` (root only):

```bash
DEMANDAI_SECRET_ID=demandai/pilot/ec2
AWS_REGION=ap-southeast-1
# With RDS; leave empty for the local database container:
DEMANDAI_COMPOSE_EXTRA=-f deploy/ec2/compose.rds.yaml
```

`/etc/demandai/settings.env`: everything that is not secret (see `.env.example` for every setting):

```bash
DEMANDAI_IMAGE=ghcr.io/<owner>/demandai-app:v1.0.0@sha256:<digest>
APP_BASE_URL=https://demandai.example.com
DEMANDAI_HOST=demandai.example.com
ACME_EMAIL=ops@example.com
POSTGRES_DB=demandai
# Local database only (the db container's superuser):
POSTGRES_USER=postgres
# RDS only:
RDS_HOST=demandai.xxxxxxxx.ap-southeast-1.rds.amazonaws.com
NOTIFICATION_DISABLED=1
AI_PROVIDER=none
AI_TIMEOUT_MS=45000
RETENTION_DAYS_AFTER_READOUT=30
```

The Secrets Manager secret is one JSON object (keys are variable names; values must be on one line):

```json
{
  "SESSION_SECRET": "<openssl rand -base64 48>",
  "DEMANDAI_OWNER_PASSWORD": "<openssl rand -hex 32>",
  "DEMANDAI_APP_PASSWORD": "<openssl rand -hex 32>",
  "DEMANDAI_OPS_PASSWORD": "<openssl rand -hex 32>",
  "POSTGRES_PASSWORD": "<openssl rand -hex 32, local database only>",
  "AZURE_OPENAI_ENDPOINT": "",
  "AZURE_OPENAI_API_KEY": "",
  "NOTIFICATION_APP_PASSWORD": ""
}
```

The role passwords must be URL-safe (letters, digits, `-`, `_`; hex is safest): they go into connection URLs. With RDS they are the passwords given to `db/bootstrap-roles.sql` ([RDS.md](RDS.md) §2). `sync-secrets.sh` merges `settings.env` and the secret into `/etc/demandai/demandai.env` (mode 0600, replaced in one step, never printed), refuses to write if a required value is missing, and with RDS fills in the unused local superuser variables Compose still reads.

With RDS, put the RDS CA bundle at `/etc/demandai/rds-global-bundle.pem`:

```bash
sudo curl -fsSo /etc/demandai/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

## 4. Install and start

```bash
sudo cp /opt/demandai/deploy/ec2/demandai.service /etc/systemd/system/
# Local database only: the daily backup
sudo cp /opt/demandai/deploy/ec2/demandai-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo docker pull "$(sudo grep ^DEMANDAI_IMAGE= /etc/demandai/settings.env | cut -d= -f2-)"
sudo systemctl enable --now demandai.service
sudo systemctl enable --now demandai-backup.timer   # local database only
```

`demandai.service` runs `sync-secrets.sh`, then `docker compose up -d --no-build`: the `backup` one-shot (local database: a checked `pg_dump`, newest 20 kept), the `migrate` one-shot (a non-zero exit stops the deploy), then the app and Caddy. Caddy gets the certificate from Let's Encrypt on first start and renews it itself.

Check it (the Compose commands below use `EXTRA`: `-f deploy/ec2/compose.rds.yaml` with RDS, empty with the local database):

```bash
EXTRA="-f deploy/ec2/compose.rds.yaml"
curl -fsS https://demandai.example.com/api/health    # {"status":"ok","version":"v1.0.0",...}
curl -fsS https://demandai.example.com/api/ready     # {"status":"ready",...}
sudo docker compose -p demandai -f compose.yaml -f deploy/ec2/compose.proxy.yaml $EXTRA --env-file /etc/demandai/demandai.env ps
```

## 5. The first administrator

There is no self sign-up. Make the platform administrator with the image's own command, from the `migrate` service (it has the owner role's URL), and send them the printed one-time link (72 hours):

```bash
cd /opt/demandai && sudo docker compose -p demandai -f compose.yaml -f deploy/ec2/compose.proxy.yaml $EXTRA \
  --env-file /etc/demandai/demandai.env run --rm -T -e APP_BASE_URL="https://demandai.example.com" \
  migrate node scripts/users/create-admin.mjs --platform --email lead@company.com --name "Platform Lead"
```

They set a password from the link, create the business units in **Platform**, and invite each unit's Admin. With email off (`NOTIFICATION_DISABLED=1`), every invite shows its link to copy.

## 6. Day to day

- Redeploy and roll back: [REDEPLOY.md](REDEPLOY.md).
- Backups: local database: the `backup` one-shot before every start and `demandai-backup.timer` daily, on the `pg_backups` volume; copy them off the host (for example `aws s3 cp` from the volume) if the host itself may be lost. RDS: automated backups and a snapshot before each release ([RDS.md](RDS.md)).
- The data purge and export (D-20), as the ops role:
  ```bash
  … run --rm -T migrate node scripts/data/purge.mjs --due          # a dry run: what is due
  … run --rm -T migrate node scripts/data/purge.mjs --due --yes    # for real, once retention is agreed
  ```
- TLS: Caddy renews about 30 days before expiry; alert on certificate expiry anyway ([OBSERVABILITY.md](OBSERVABILITY.md)).
- Logs: `docker compose logs app`, or ship them with the `awslogs` driver ([OBSERVABILITY.md](OBSERVABILITY.md)).
