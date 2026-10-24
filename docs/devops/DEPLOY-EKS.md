# Deploying on EKS (Kubernetes)

`deploy/k8s` is a kustomize base and a `pilot` overlay: the app Deployment, its migrate Job, a ClusterIP Service, an ALB Ingress, a PodDisruptionBudget, a NetworkPolicy, three ExternalSecrets, the purge CronJob and a ServiceAccount, in a namespace that enforces the restricted Pod Security Standard. CI builds the overlay with kustomize and validates it with kubeconform for Kubernetes 1.33 (`deploy/check.sh`). The database is RDS for PostgreSQL 16 ([RDS.md](RDS.md)).

## 1. What the cluster needs (DevOps)

| Add-on or resource | Why |
|---|---|
| EKS 1.31 or later (validated against 1.33) | The manifests use `timeZone` on the CronJob and `batch/v1`, `policy/v1`, `networking.k8s.io/v1` |
| AWS Load Balancer Controller | The Ingress (`ingressClassName: alb`): internet-facing ALB, pods as IP targets, TLS with an ACM certificate |
| External Secrets Operator, with a `ClusterSecretStore` named `aws-secrets-manager` | Syncs the three secrets from AWS Secrets Manager (`externalsecrets.yaml`, `external-secrets.io/v1`). The store reads through an IAM role (IRSA or Pod Identity) allowed `secretsmanager:GetSecretValue` on `demandai/pilot/*`. The Secrets Store CSI Driver with the AWS provider is an alternative; the pods only need the three Secrets to exist |
| Network policy enforcement (VPC CNI network policies, or Calico) | The NetworkPolicy lets only the VPC (the ALB) reach the app on port 3000. Without enforcement it is ignored: then rely on the security groups |
| An ACM certificate for the host, and a DNS record for the ALB | TLS |
| The image in ECR (or GHCR with an image pull secret) | The overlay pins it by digest |
| RDS for PostgreSQL 16, reachable from the nodes on 5432 | [RDS.md](RDS.md) |
| Amazon Bedrock only: an IAM role for the `demandai-app` ServiceAccount (Pod Identity association, or the IRSA annotation in the overlay) | `bedrock:InvokeModel` / `bedrock:Converse`; the app refuses static AWS keys |

## 2. Secrets and settings

Three Secrets Manager secrets (JSON objects, keys are variable names), so each workload holds only what it needs:

| Secret | Keys | Used by |
|---|---|---|
| `demandai/pilot/app` | `DATABASE_URL` (`postgresql://demandai_app:<pw>@<rds endpoint>:5432/demandai`), `SESSION_SECRET`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` (empty strings while AI is off) | the app |
| `demandai/pilot/migrate` | `DATABASE_MIGRATION_URL` (`demandai_owner`) | the migrate Job, create-admin |
| `demandai/pilot/ops` | `DATABASE_OPS_URL` (`demandai_ops`) | the purge CronJob, the export |

Every key must exist in its secret (an empty value is fine): External Secrets fails the whole sync if one is missing. Rotation: [SECRETS.md](SECRETS.md).

The settings that are not secret are in `deploy/k8s/base/configmap.yaml` (AI off, `AI_TIMEOUT_MS` 45000, API version `2025-04-01-preview`, one trusted proxy hop, `verify-full` TLS to RDS). Change them in the overlay with a patch, as it does for `APP_BASE_URL`.

The RDS CA bundle, as a ConfigMap the pods mount at `/etc/ssl/rds`:

```bash
curl -fsSo global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
kubectl -n demandai create configmap demandai-rds-ca --from-file=global-bundle.pem
```

## 3. Fill in the overlay

In `deploy/k8s/overlays/pilot/kustomization.yaml`, replace every `REPLACE`: the image repository, tag and digest, the host (in `APP_BASE_URL` and the Ingress), the ACM certificate ARN, and the VPC CIDR the ALB sends from. Then check what will be applied:

```bash
kubectl kustomize deploy/k8s/overlays/pilot | less
deploy/check.sh                     # the same validation CI runs
```

## 4. First deploy

```bash
kubectl apply -f deploy/k8s/overlays/pilot/namespace.yaml        # once; the overlay also includes it
kubectl -n demandai create configmap demandai-rds-ca --from-file=global-bundle.pem
kubectl apply -k deploy/k8s/overlays/pilot
kubectl -n demandai wait --for=condition=complete job/demandai-migrate --timeout=15m
kubectl -n demandai rollout status deploy/demandai-app --timeout=10m
curl -fsS https://demandai.pilot.example.com/api/ready
```

The app pods start alongside the migrate Job but take traffic only once `/api/ready` says every migration their build expects is applied, so the order looks after itself.

### The first administrator

There is no self sign-up. `deploy/k8s/jobs/create-admin.yaml` is a one-off Job with the owner role; fill in the release's image and the person, read the one-time link (72 hours) from its log, send it, and delete the Job:

```bash
IMAGE=<account>.dkr.ecr.<region>.amazonaws.com/demandai-app:v1.0.0@sha256:<digest>
sed -e "s#image: IMAGE#image: $IMAGE#" -e 's#"EMAIL"#"lead@company.com"#' -e 's#"NAME"#"Platform Lead"#' \
  deploy/k8s/jobs/create-admin.yaml | kubectl apply -f -
kubectl -n demandai logs -f job/demandai-create-admin
kubectl -n demandai delete job demandai-create-admin
```

They set a password from the link, create the business units in **Platform**, and invite each unit's Admin.

## 5. Releases and rollback

[REDEPLOY.md](REDEPLOY.md) §3. In short: snapshot RDS, delete the previous migrate Job, set the new digest, `kubectl apply -k`, wait for the Job and the rollout, check `/api/health` shows the new version. Roll back with `kubectl rollout undo deploy/demandai-app` (or the previous digest): migrations are forward-only and an older build accepts a newer database.

## 6. The purge CronJob

`demandai-purge-due` runs daily at 02:30 UTC as the ops role. As shipped it is a dry run (`--due`): it logs which business units are due and changes nothing. Once the Client has agreed the retention period (D-20; 30 days after the sponsor's closing decision by default), uncomment the patch in the overlay that adds `--yes`. A one-off run:

```bash
kubectl -n demandai create job purge-now --from=cronjob/demandai-purge-due
kubectl -n demandai logs -f job/purge-now
```

## 7. Notes

- **Replicas.** Two by default, spread across zones; each also runs the job worker (jobs are claimed with `SKIP LOCKED`, and a job left running by a pod that died is picked up again). Scale with `kubectl scale` or an HPA on CPU; the database pool is 10 connections per pod (`DATABASE_POOL_MAX`).
- **Resources.** Requests 250m CPU and 512 MiB, limit 1.5 GiB: a 20,000-row upload took about 695 MiB in the rehearsal. Watch it in the pilot.
- **Read-only root filesystem.** Only `/tmp` and `/app/.next/cache` are writable (emptyDirs). Rehearsed with Compose (`read_only: true`, same tmpfs): uploads, scoring, builds and the 20,000-row test all worked.
- **The ALB** keeps connections for 120 s (an upload's checks and an AI call fit), drops invalid headers, and checks `/api/health`. The pods' readiness is `/api/ready`.
