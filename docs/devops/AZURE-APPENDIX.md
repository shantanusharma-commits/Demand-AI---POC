# Appendix: the same deployment on Azure

D-37 chose AWS; Azure stays possible (the earlier Options A and B, D-2). Nothing in the app is AWS-specific: it needs a container runtime, PostgreSQL 16, environment variables and a TLS front door. The Azure equivalents:

| Need | AWS (as documented) | Azure Option A: one VM | Azure Option B: managed containers |
|---|---|---|---|
| Runtime | EC2 + Compose, or EKS | A Linux VM with Docker Compose, the same files (`compose.yaml`, `deploy/ec2/compose.proxy.yaml`) | Azure Container Apps (or AKS with the same `deploy/k8s` manifests) |
| Database | RDS for PostgreSQL 16 | The `db` container, or Azure Database for PostgreSQL Flexible Server 16 | Azure Database for PostgreSQL Flexible Server 16 |
| Secrets | Secrets Manager; `sync-secrets.sh` or External Secrets | Key Vault: a boot-time sync like `sync-secrets.sh`, with `az keyvault secret show` and the VM's managed identity | Key Vault references in Container Apps secrets (managed identity); on AKS, External Secrets with the Azure Key Vault provider |
| TLS and the way in | Caddy on the host, or an ALB | Caddy on the VM (the same Caddyfile) | The Container Apps ingress (managed certificate), or Application Gateway |
| Image registry | GHCR or ECR | GHCR, or Azure Container Registry | ACR with the app's managed identity pulling |
| Logs | CloudWatch | Azure Monitor agent | Log Analytics (Container Apps sends standard output) |
| Model service | Azure OpenAI over the internet, or Bedrock | Azure OpenAI, optionally on a private endpoint in the VNet | Azure OpenAI on a private endpoint |

Notes for Azure:

- **Flexible Server.** Run `db/bootstrap-roles.sql` as the server's admin (it grants `demandai_owner` to the admin first, as on RDS). `DATABASE_SSL_MODE=verify-full` with the DigiCert and Microsoft root CAs in `DATABASE_SSL_CA_FILE`. `require_secure_transport=ON`.
- **Container Apps.** One app (`node server.js`, port 3000, min replicas 1, health probes `/api/health` and `/api/ready`), and a Container Apps job for `node scripts/db/migrate.mjs` run before each new revision, and a scheduled job for `node scripts/data/purge.mjs --due` (dry run until agreed). Set `TRUSTED_PROXY_HOPS` to the number of proxies in front (1 behind the Container Apps ingress alone). Where the platform has no read-only root filesystem setting, nothing breaks: the app writes only to `/tmp` and `/app/.next/cache`.
- **Secrets.** The same variable names; the app neither knows nor cares where they come from.
- **Everything else** (releases, rollback by digest, the alarms, the restore drill) is as in the AWS documents.
