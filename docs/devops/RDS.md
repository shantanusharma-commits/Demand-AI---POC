# RDS for PostgreSQL 16

The recommended production database (D-37). Everything DemandAI keeps is in it, including uploaded files (D-7), so its backups are the application's backups.

## 1. The instance

| Setting | Value | Why |
|---|---|---|
| Engine | PostgreSQL 16 (latest minor) | The version every test runs on (`postgres:16.15` pinned in Compose and CI) |
| Class | `db.t4g.medium` for the pilot; watch CPU and memory | A 20,000-row upload writes about 40,000 rows in batches |
| Storage | gp3, 50 GB, autoscaling on, encrypted with a KMS key | Encryption at rest (audit checklist) |
| Availability | Multi-AZ for production; single-AZ is acceptable for development | |
| Network | Private subnets only, no public access; the security group allows 5432 from the EC2 host or the EKS nodes only | |
| Backups | Automated, 14 days or more (point-in-time restore); copy snapshots to a second region if the Client requires it | |
| Parameter group | `rds.force_ssl=1`, `log_min_duration_statement=500`, `timezone=UTC`; `shared_preload_libraries` unchanged | TLS only; slow statements logged as in the Compose `db` service |
| Logs | Export `postgresql` logs to CloudWatch | [OBSERVABILITY.md](OBSERVABILITY.md) |
| Maintenance | A window outside the pilot's working hours; minor upgrades on | |

## 2. The roles, once

The master user runs `db/bootstrap-roles.sql` with three new passwords (URL-safe: `openssl rand -hex 32`). It creates `demandai_owner` (owns the schema, runs migrations), `demandai_app` (the app, under row-level security, data access only) and `demandai_ops` (the purge and export functions only), creates the database owned by `demandai_owner`, and closes it to `PUBLIC`:

```bash
psql "host=<endpoint> user=<master> dbname=postgres sslmode=verify-full sslrootcert=global-bundle.pem" \
  -v owner_pw="$OWNER_PW" -v app_pw="$APP_PW" -v ops_pw="$OPS_PW" -v dbname=demandai -f db/bootstrap-roles.sql
```

Put the three passwords in Secrets Manager straight away ([SECRETS.md](SECRETS.md)) and nowhere else. The master user is for this and for emergencies only; DemandAI never uses it. The first `migrate` (Compose service or Kubernetes Job) then creates the schema, the row-level security policies, the append-only triggers and the grants.

## 3. TLS

Every connection uses `DATABASE_SSL_MODE=verify-full` with the RDS CA bundle (`DATABASE_SSL_CA_FILE`), as the Compose RDS overlay and the Kubernetes ConfigMap set: the server's certificate and host name are checked. Download the bundle from `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`; replace it when AWS rotates its CAs.

## 4. Before each release

Take a manual snapshot, named after the release, before the migrations run ([REDEPLOY.md](REDEPLOY.md)):

```bash
aws rds create-db-snapshot --db-instance-identifier demandai-pilot --db-snapshot-identifier demandai-pre-v1-1-0
aws rds wait db-snapshot-available --db-snapshot-identifier demandai-pre-v1-1-0
```

Migrations are forward-only and none so far rewrites data; still, the snapshot is the way back from a migration that goes wrong.

## 5. The restore drill (do it before the pilot, then each quarter)

1. Restore the latest automated backup to a new instance (point in time, a few minutes ago), in the same private subnets.
2. Point a throwaway stack at it (the EC2 Compose with `RDS_HOST` set to the new endpoint, or a copy of the Kubernetes overlay in another namespace) with the same role passwords.
3. Check `/api/ready` is 200, sign in, open a list and a scoring run, and compare row counts with production for `uploads`, `contacts`, `accounts`, `recommendations`, `decision_log` and `audit_log`.
4. Record the date, the restore time and the counts; delete the instance.

The same drill was rehearsed locally on 24 Oct 2026 with the Compose `backup` dumps: a 19 MB dump restored into a scratch database with identical counts in every table checked ([REDEPLOY.md](REDEPLOY.md) §5).

## 6. Version upgrades

Minor versions: automatic in the maintenance window. A major version (17 and later) is a project: run the integration tests against it first (`postgres:17` in `compose.test.yaml`), snapshot, then upgrade.
