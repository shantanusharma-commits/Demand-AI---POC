# ADR 0001: Platform and hosting

**Status:** Accepted, 22 Oct 2026 (D-37, revising D-2 and D-30). **Deciders:** the delivery team's lead, for the Client; DevOps runs it.

## Context

The POC was a static Next.js prototype with browser storage. The pilot needs a server, a database, sign-in and background jobs, and DevOps must be able to run it on infrastructure they already know. The earlier plan (D-2) offered two Azure options: one VM with Docker Compose (Option A) and managed containers (Option B). The Client's DevOps team works on AWS.

## Decision

- **One container image** (Next.js standalone server, the job worker in the same process, the migration runner and the ops commands), Node 24 on Alpine, non-root, built by CI and pushed for tagged releases (GHCR; ECR by copy).
- **PostgreSQL 16** for everything, uploaded files included (D-7, D-28): RDS for PostgreSQL 16 in production, the `db` container for development. Three roles (owner, app, ops) and row-level security per business unit (D-32).
- **AWS** (D-37): an EC2 host with Docker Compose (Caddy for TLS) for development, EKS for production (ALB Ingress, External Secrets from AWS Secrets Manager, a migrate Job, the purge CronJob). The delivery team ships the files and runbooks and deploys nothing.
- **Configuration from environment variables only**, validated at start-up; secrets in AWS Secrets Manager.
- **Azure stays possible** with the same image and variables ([docs/devops/AZURE-APPENDIX.md](../devops/AZURE-APPENDIX.md)).

## Alternatives considered

- **Serverless (Vercel, Lambda).** Rejected: uploads of up to 25 MB checked in a background job, a long-lived job worker, and PostgreSQL row-level security per transaction fit a long-running container better; the Client's data should stay in their AWS account.
- **Azure Option A or B (D-2).** Kept as an appendix: DevOps works on AWS.
- **A queue service (SQS) and object storage (S3) for files.** Deferred: a small job table with `SKIP LOCKED` and files in PostgreSQL are enough at pilot volume (20,000 rows checked in about 5 s), keep one backup and one retention path, and avoid two more services. Revisit above about 50,000 rows a file or many concurrent uploads.
- **Separate worker deployment.** Deferred: every app instance runs the worker; jobs are claimed safely by any of them. `JOBS_WORKER=0` turns it off where a separate worker is wanted later.

## Consequences

- One artefact to build, scan, version and roll back; rollback is the previous digest, because migrations are forward-only and an older build accepts a newer database (rehearsed: [docs/devops/REDEPLOY.md](../devops/REDEPLOY.md) §5).
- The database is the single stateful part: its backups are the application's backups.
- DevOps owns the cluster add-ons (AWS Load Balancer Controller, External Secrets Operator, network policy enforcement), DNS, certificates, the registry and alarms.
- A move to Azure changes the infrastructure files, not the app.
