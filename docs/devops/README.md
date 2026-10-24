# DemandAI for DevOps

How DemandAI is built, shipped, deployed, watched and rolled back. Written for the team that runs it (D-37: AWS, EC2 with Docker Compose for development, EKS for production; Azure stays possible). The delivery team deploys nothing; everything here has been rehearsed locally (see [REDEPLOY.md](REDEPLOY.md) §5).

## What runs

| Piece | What it is | Where it comes from |
|---|---|---|
| App image | Next.js standalone server (UI, API, background job worker) plus the migration runner and the ops commands, Node 24 on Alpine, non-root (uid 10001), about 230 MB | `Dockerfile`; CI builds it on every change, `.github/workflows/release.yml` pushes tagged releases to GHCR |
| PostgreSQL 16 | Everything the app keeps, including uploaded files (D-7). Three roles: `demandai_owner` (migrations), `demandai_app` (the app, under row-level security), `demandai_ops` (purge and export) | RDS for PostgreSQL 16 in production ([RDS.md](RDS.md)); the `db` container for development |
| migrate | `node scripts/db/migrate.mjs`, forward-only, under an advisory lock; an older image's migrate finds nothing to do on a newer database | The same image |
| Reverse proxy | TLS and the only way in: Caddy on EC2, an ALB on EKS. The app trusts one proxy hop (`TRUSTED_PROXY_HOPS=1`) | `deploy/ec2/compose.proxy.yaml`, `deploy/k8s/base/ingress.yaml` |
| Model service | Optional: Azure OpenAI through an API Management gateway (gpt-5.4 and gpt-5.4-mini, D-44) or Amazon Bedrock. Every AI switch is off until the Client agrees the results | [AZURE-OPENAI.md](AZURE-OPENAI.md), [docs/AI.md](../AI.md) |

The app exposes `/api/health` (liveness: the process and its build version) and `/api/ready` (readiness: the database answers and has every migration this build expects; an older build accepts a newer database). Neither shows configuration.

## The documents

| Document | For |
|---|---|
| [DEPLOY-EC2.md](DEPLOY-EC2.md) | A single EC2 host with Docker Compose: the local database or RDS, Caddy for TLS, secrets from Secrets Manager at boot |
| [DEPLOY-EKS.md](DEPLOY-EKS.md) | EKS: kustomize manifests, External Secrets, ALB, the migrate Job, the purge CronJob |
| [RDS.md](RDS.md) | RDS for PostgreSQL 16: settings, the roles, TLS, backups and the restore drill |
| [REDEPLOY.md](REDEPLOY.md) | Releasing a new version and rolling back, on either target, and the rehearsal record |
| [SECRETS.md](SECRETS.md) | What is secret, where it lives, and how to rotate each one |
| [OBSERVABILITY.md](OBSERVABILITY.md) | Logs, the events worth counting, and the proposed alarms |
| [AZURE-OPENAI.md](AZURE-OPENAI.md) | The model service request, the diagnostic script, the switches |
| [AZURE-APPENDIX.md](AZURE-APPENDIX.md) | The same deployment on Azure (Options A and B) |
| [CHECKLIST.md](CHECKLIST.md) | The audit's POC deployment checklist, with the result for each line |
| [../adr/0001-platform-and-hosting.md](../adr/0001-platform-and-hosting.md) | Why this platform and hosting |

## The pipeline

```
change ──► CI (every push and pull request)                        release
           checks: gitleaks · lint · typecheck · unit + answer key    tag v1.2.3 on a green commit
                   · legacy · build with dummy secrets + scan          └► release.yml: image → GHCR, digest printed
                   · deployment files (kubeconform, compose config)
                   · audit · dependency age                         deploy (DevOps)
           integration: PostgreSQL 16 · migrations · RLS · backup     pin the digest → snapshot or backup → migrate
                   restore · build · HTTP tests                        → recreate → check the version → smoke test
           e2e: Docker build → Compose stack from env vars             → roll back to the previous digest on failure
                   → /api/ready 200 → Playwright (end-to-end,
                   accessibility, performance)
```

Making the three CI jobs (`checks`, `integration`, `e2e`) required for merging is a branch-protection setting for the repository's owner.
