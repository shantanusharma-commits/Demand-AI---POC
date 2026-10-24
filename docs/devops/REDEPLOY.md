# Releasing and rolling back

A release is an image digest. It goes out in the same order on both targets: check, back up, migrate, recreate, check the version, smoke test, and roll back to the previous digest if anything is wrong. Migrations are forward-only; an older image accepts a newer database (its migrate finds nothing to do, and its readiness check counts `applied >= expected`), so a rollback is just the previous image.

## 1. Pre-flight

- [ ] CI is green on the commit (`checks`, `integration`, `e2e`).
- [ ] The release is tagged (`git tag v1.1.0 && git push origin v1.1.0`) and `release.yml` printed its digest: `ghcr.io/<owner>/demandai-app:v1.1.0@sha256:…` (copy it to ECR if you use ECR: `docker buildx imagetools create -t <ecr repo>:v1.1.0 ghcr.io/<owner>/demandai-app@sha256:…`).
- [ ] Note the digest that is live now (`/api/health` gives the version; the deployment holds the digest): that is the rollback.
- [ ] Read the release's new migrations (`drizzle/` since the last tag). Each must keep the previous release working on the migrated database (add columns and tables; don't drop or rename in the same release). Every migration so far does.
- [ ] Look for work in flight. Background jobs (uploads, scoring, builds) are checkpointed by stage, and a job left running by a stopped process is picked up again; still, prefer a quiet moment:
  ```sql
  -- as demandai_owner
  SELECT kind, status, stage, created_at FROM jobs WHERE status IN ('queued', 'running') ORDER BY created_at;
  ```

## 2. EC2 (Docker Compose)

```bash
EXTRA="-f deploy/ec2/compose.rds.yaml"          # with RDS; empty with the local database
NEW=ghcr.io/<owner>/demandai-app:v1.1.0@sha256:<new digest>
# 1. Back up. Local database: the backup one-shot runs on every start (step 3). RDS: a snapshot (RDS.md §4).
# 2. Pull the new image and point the settings at it.
sudo docker pull "$NEW"
sudo sed -i "s#^DEMANDAI_IMAGE=.*#DEMANDAI_IMAGE=$NEW#" /etc/demandai/settings.env
# 3. Restart: secrets synced, backup (local database), migrate, then the app recreated on the new image.
sudo systemctl restart demandai.service
# 4. Check.
curl -fsS https://demandai.example.com/api/health    # "version":"v1.1.0"
curl -fsS https://demandai.example.com/api/ready     # 200
sudo docker compose -p demandai -f compose.yaml -f deploy/ec2/compose.proxy.yaml $EXTRA --env-file /etc/demandai/demandai.env logs migrate | tail -3
```

If `migrate` fails, Compose stops: the app keeps running the previous image (it is only recreated after a successful migrate). Read the migrate log, fix, or restore the backup.

**Roll back:** put the previous digest back in `settings.env` and restart; check `/api/health` shows the previous version.

## 3. EKS (Kubernetes)

```bash
# 1. RDS snapshot (RDS.md §4).
# 2. Set the new digest in deploy/k8s/overlays/pilot/kustomization.yaml (images: newTag and digest), commit it.
# 3. Apply: the old migrate Job must go first (a Job can't change in place).
kubectl -n demandai delete job demandai-migrate --ignore-not-found
kubectl apply -k deploy/k8s/overlays/pilot
kubectl -n demandai wait --for=condition=complete job/demandai-migrate --timeout=15m
kubectl -n demandai rollout status deploy/demandai-app --timeout=10m
# 4. Check.
curl -fsS https://demandai.pilot.example.com/api/health      # "version":"v1.1.0"
kubectl -n demandai logs job/demandai-migrate | tail -2
```

New pods are not Ready until the migrations their build expects are applied, and `maxUnavailable: 0` keeps the old pods serving meanwhile. If the migrate Job fails, the new pods never become Ready and the rollout stalls with the old pods still serving: `kubectl rollout undo`, then read the Job's log.

**Roll back:** `kubectl -n demandai rollout undo deploy/demandai-app` (or set the previous digest in the overlay and apply it), then check `/api/health`.

## 4. After any release

- Smoke test: sign in, open a saved list and a scoring run, open For Review; an Admin runs **Setup › AI service › Run a health check** if AI is on.
- Watch the error rate and readiness for 30 minutes ([OBSERVABILITY.md](OBSERVABILITY.md)).
- Record the release, the digest, the time and the result.

## 5. Rehearsal record (24 Oct 2026, local, Compose)

Two image tags of the same stack, hardened as shipped (read-only root filesystem, tmpfs for `/tmp` and Next's cache, no capabilities), with data made by the end-to-end flows:

| Step | What happened | Result |
|---|---|---|
| Previous release `448a85d` (38 migrations) | Stack up from an env file; platform admin made with `create-admin` from the image; the invite, two-user and roles end-to-end specs created units, people, a full-sample list, a scoring run, a build and decisions | 9/9 passed; fingerprint: 1 list, 1 saved run, 1 build, 16 queue items |
| Upgrade to `c695af3` (39 migrations) | `docker compose up -d` with the new image: a 6.6 MB backup, migration 0038 applied, the app recreated | Ready in 5 s; same fingerprint; existing sessions still signed in; roles spec 2/2 |
| Roll back to `448a85d` | The previous image again, no down-migration: its migrate said "up to date; 38 migration(s)" | Ready in 4 s; same fingerprint; roles spec 2/2; an upload and its job succeeded |
| Roll forward to `c695af3` | Migrate "up to date; 39" | An upload succeeded; then the accessibility and 7,500 / 20,000-row performance specs, 11/11, the app at about 695 MiB |
| Restore drill | A fresh 19 MB `pg_dump` restored with `pg_restore` into a scratch database | Identical counts: uploads 7, accounts 8,086, contacts 39,821, recommendations 28, decision_log 34, audit_log 36 |

Not rehearsed here (nothing is deployed by the delivery team): the EKS rollout itself, the ALB, External Secrets and RDS. The manifests are validated with kustomize and kubeconform in CI; the first deploy on EKS should repeat this table there.
