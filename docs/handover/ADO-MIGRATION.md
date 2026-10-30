# Moving the repository to Azure DevOps

A guide for handing the code over in an Azure DevOps (ADO) repository: what goes in, what stays out, whether to bring the history, what to set up in ADO, and the steps. Written 25 Oct 2026 against `a6b4cf0`; nothing here has been carried out. Facts about the repository come from [REPOSITORY-AUDIT.md](REPOSITORY-AUDIT.md).

**Still to decide before starting** (Open): the ADO organisation and project and who owns them (the Client, or the delivery team), who gets access, whether GitHub stays the working repository or is archived, and the history option in §3.

## 1. What the ADO repository must contain

Everything git tracks on the branch that is migrated (after the remediation is merged into `main`). It is complete for a clean set-up: a fresh clone installs and passes lint, typecheck and the unit tests (audit §4).

| Content | Paths | Notes |
|---|---|---|
| Application source | `app/`, `components/`, `lib/`, `types/`, `public/`, `proxy.ts`, `instrumentation.ts`, `next.config.ts` | |
| Dependency manifests | `package.json`, `package-lock.json`, `.nvmrc`, `vendor/xlsx-0.20.3.tgz` | SheetJS installs from the vendored tarball (D-24) |
| Configuration templates | `.env.example`, `drizzle.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.gitleaks.toml`, `security/audit-allowlist.json` | No real values anywhere |
| Database | `drizzle/` (39 migrations and `meta/`), `db/bootstrap-roles.sql`, `db/init/10-roles.sh`, `db/backup.sh`, `scripts/db/` | |
| Operations scripts | `scripts/` | |
| Tests and test data | `tests/`, `e2e/`, `playwright.config.ts`, `test-data/` (fictional sample, answer key, generators), `legacy/` (the parity tests and `test:legacy` run it) | |
| Build and deployment | `Dockerfile`, `.dockerignore`, `compose.yaml`, `compose.dev.yaml`, `compose.test.yaml`, `deploy/` (EC2 and EKS) | |
| CI | `.github/workflows/` (keep as reference) and the new `azure-pipelines.yml` (§5) | |
| Documentation | `README.md`, `AGENTS.md`, `docs/` | Start at [docs/README.md](../README.md) |

## 2. What must stay out

| Never | Why |
|---|---|
| `reference_content/` | The Client's confidential documents; also in `.gitignore`, `.git/info/exclude` and `.dockerignore` |
| `.env.local` and any `.env.*` other than `.env.example` | Secrets |
| `DEMANDAI_*.md` at the root | Local working documents of the remediation (their decisions are in [../DECISIONS.md](../DECISIONS.md)) |
| `e2e/.state/`, `test-results/`, `playwright-report/`, `.playwright-mcp/` | Test output and signed-in test sessions |
| `node_modules/`, `.next/`, `next-env.d.ts`, `*.tsbuildinfo`, `.idea/`, `.vscode/` | Generated or personal |
| Database dumps, exports, real lead files | Personal data of the Client's prospects |

Pushing from a clone (never copying a working folder) guarantees the ignored files can't travel: git only sends what is committed.

| Decide | Recommendation |
|---|---|
| `docs/ui-map/`, `docs/replit-*.md`, `test reports/` | Prototype-era material that nothing references: leave out of a fresh-history import (§3 option C), or delete in a commit before migrating |
| The remote branches `claude/*`, `feature/hunter-email-verification-and-paged-prospecting` | Don't migrate them as branches (audit §5.3). Bring in the new test packs as a reviewed commit if wanted |

## 3. History: bring it or not (D-23)

The history has 206 commits on the remediation branch (93 from `main`). Two facts decide the option: **20 of those commits contain the Client's name** in their files (a dataset generator and an old test, removed on 22 Oct 2026), and the documents cite some commit IDs (the rollback rehearsal in `docs/devops/REDEPLOY.md`, `32f5569` in `docs/KNOWN-LIMITATIONS.md`).

| Option | How | Keeps | Costs | Use when |
|---|---|---|---|---|
| **A. Full history** | Push `main` (and tags) as they are | Every commit and ID; `git blame`; the cited IDs stay valid | The Client's name stays in history | The ADO organisation belongs to the Client, or only the delivery team and the Client can read it |
| **B. Rewritten history** | `git filter-repo --replace-text` on a fresh mirror, then push | The commit sequence and authorship | Every commit ID changes (the cited IDs break; keep filter-repo's `commit-map`); anyone with the old clone must re-clone; GitHub keeps the old history unless rewritten there too | The repository goes beyond the team and the history matters |
| **C. Fresh start** | One import commit of the tree at a tagged commit | A clean repository with nothing from before | No history in ADO (it stays on GitHub); cited IDs point at GitHub | A clean hand-over is preferred to history |

**Recommendation:** A if the ADO organisation is the Client's own (its own name in its own repository is not a disclosure, and the history explains the code). C if the repository may be shared with anyone else, with GitHub kept read-only as the archive of the history. B only if history must travel *and* be clean. Record the choice as D-23's outcome.

## 4. What to set up in ADO

| Item | Setting |
|---|---|
| Project and repository | An empty Git repository (no README, no `.gitignore`, so the first push isn't refused); default branch `main` |
| Permissions | Readers and Contributors from the team; "Force push" denied on `main` for everyone; "Bypass policies" for nobody except a break-glass group |
| Branch policy on `main` | At least one reviewer (not the author); comment resolution; build validation with the CI pipeline (§5) required; squash or merge as the team prefers; no direct pushes |
| Pipelines | `azure-pipelines.yml` (CI on pull requests and pushes) and a release pipeline on version tags (§5). Microsoft-hosted `ubuntu-24.04` agents have Docker and Node; a self-hosted Linux agent works too |
| Pipeline variables | `CLIENT_NAME_PATTERN` as a **secret** variable (lets the Client-name scan run; if the variable is defined but empty, or not defined at all, read §5's note). No runtime secret is needed in CI: the build uses dummy values |
| Service connections | A Docker registry connection for releases: Azure Container Registry, or Amazon ECR (through the AWS Toolkit extension and an AWS service connection with push rights only to that repository), or GHCR. Name it in the release pipeline |
| Environments and approvals | Only if deployments are later run from ADO (today DevOps deploys by hand from the printed digest, [../devops/REDEPLOY.md](../devops/REDEPLOY.md)) |
| Secrets for running the app | Not in ADO: they stay in AWS Secrets Manager (EC2, EKS) or the platform's secret store ([../devops/SECRETS.md](../devops/SECRETS.md)). A variable group linked to Azure Key Vault is the ADO way if a pipeline ever needs one |
| Wiki (optional) | **Publish code as wiki** from the `docs/` folder of `main`, so the wiki is the repository's documents. Mermaid diagrams: the ADO wiki documents the `::: mermaid` block syntax; if the fenced ` ```mermaid ` blocks don't render there, convert them or read the diagrams in the file view |
| Retention, artefacts | Keep Playwright reports of failed runs 7 days, as in GitHub |

## 5. The pipelines

GitHub Actions (`.github/workflows/ci.yml`, `release.yml`) doesn't run in ADO. The draft below translates them step for step. It has **not been run**: test it on a branch before making it the required build.

```yaml
# azure-pipelines.yml (draft, untested): the CI of .github/workflows/ci.yml for Azure Pipelines.
trigger:
  branches: { include: [main] }
pr:
  branches: { include: [main] }

variables:
  NEXT_TELEMETRY_DISABLED: '1'
  NODE_VERSION: '24.22.1'          # keep in step with .nvmrc
  PG_IMAGE: postgres:16.15-bookworm@sha256:d81f7b51697014367236d07ec58b54153fc28f828b72bf247fe5c7487520bcb0

resources:
  containers:
    - container: pg16
      image: $(PG_IMAGE)
      ports: ['55433:5432']
      env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: demandai-test-only, POSTGRES_DB: postgres }

jobs:
  - job: checks
    pool: { vmImage: ubuntu-24.04 }
    timeoutInMinutes: 20
    steps:
      - checkout: self
        fetchDepth: 0                 # gitleaks reads every commit; the age check compares with main
      - task: NodeTool@0
        inputs: { versionSpec: $(NODE_VERSION) }
      - script: >
          docker run --rm -v "$(Build.SourcesDirectory):/repo"
          zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
          git /repo --config /repo/.gitleaks.toml --redact --no-banner --exit-code 1
        displayName: Secret scan of the whole history (gitleaks)
      - script: npm ci
        displayName: Install (exactly the lockfile)
      - script: npm run lint
      - script: npm run typecheck
      - script: npm test
        displayName: Unit, repository and answer-key tests
        env: { CLIENT_NAME_PATTERN: $(CLIENT_NAME_PATTERN) }
      - script: npm run test:legacy
      - script: npm run build && npm run check:bundle
        displayName: Build with dummy secrets, then scan the output for them
        env:
          SESSION_SECRET: ci-dummy-session-secret-0123456789abcdef
          AZURE_OPENAI_API_KEY: ci-dummy-azure-openai-key-0123456789
          NOTIFICATION_APP_PASSWORD: ci-dummy-smtp-app-password
          DATABASE_URL: postgresql://demandai_app:ci-dummy-app-db-password@127.0.0.1:1/demandai
          DATABASE_MIGRATION_URL: postgresql://demandai_owner:ci-dummy-owner-db-password@127.0.0.1:1/demandai
          DATABASE_OPS_URL: postgresql://demandai_ops:ci-dummy-ops-db-password@127.0.0.1:1/demandai
      - script: bash deploy/check.sh
        displayName: Deployment files are valid
      - script: npm run audit:gate
      - script: git fetch --no-tags origin main && node scripts/check-dependency-age.mjs --base origin/main
        displayName: Dependency age (D-31)

  - job: integration
    pool: { vmImage: ubuntu-24.04 }
    timeoutInMinutes: 20
    services: { pg: pg16 }
    variables:
      TEST_DATABASE_ADMIN_URL: postgresql://postgres:demandai-test-only@127.0.0.1:55433/postgres
      LOG_LEVEL: silent
    steps:
      - task: NodeTool@0
        inputs: { versionSpec: $(NODE_VERSION) }
      - script: npm ci
      - script: for i in $(seq 1 30); do pg_isready -h 127.0.0.1 -p 55433 && exit 0; sleep 2; done; exit 1
        displayName: Wait for PostgreSQL
      - script: psql --version && pg_dump --version && pg_restore --version
      - script: npm run test:integration
      - script: npm run build && npm run test:http

  - job: e2e
    pool: { vmImage: ubuntu-24.04 }
    timeoutInMinutes: 40
    steps:
      - task: NodeTool@0
        inputs: { versionSpec: $(NODE_VERSION) }
      - script: npm ci
      - script: docker build --build-arg APP_BUILD_VERSION="$(Build.SourceVersion)" -t demandai-app:e2e .
      - script: npx playwright install --with-deps --only-shell chromium
      - script: e2e/compose.sh up
        env: { DEMANDAI_IMAGE: demandai-app:e2e }
      - script: E2E_PLATFORM_LINK="$(cat e2e/.state/platform-link)" npx playwright test
        env: { E2E_BASE_URL: 'http://127.0.0.1:3100', CI: 'true' }
      - script: e2e/compose.sh logs
        condition: failed()
      - publish: playwright-report
        artifact: playwright-report
        condition: failed()
      - script: e2e/compose.sh down
        condition: always()
```

Notes on the translation:

- A secret variable reaches a script only through `env:`. If `CLIENT_NAME_PATTERN` isn't defined, Azure Pipelines leaves the literal text `$(CLIENT_NAME_PATTERN)` in place and the scan would run with a pattern that matches nothing: define the variable, or remove that `env:` line so the test reports itself as skipped.
- The GitHub job ran the age check against the pull request's base (`github.base_ref`); the draft compares with `main`, the only target of pull requests here.
- **Release:** a second pipeline with `trigger: { tags: { include: ['v*.*.*'] } }` and `pr: none` that runs `docker build --build-arg APP_BUILD_VERSION=$(Build.SourceBranchName) -t <registry>/demandai-app:<version> .`, the same two image checks as `release.yml` (no env file in the image; it reports its version), pushes with the registry service connection (`Docker@2` with `command: push`, or the ECR push task), and prints the digest for DevOps to pin.
- Update the documents that name GitHub once ADO is the home: `README.md` (CI), `docs/devops/README.md`, `DEPLOY-EC2.md`, `REDEPLOY.md` (`release.yml`, GHCR), `deploy/k8s/overlays/pilot/kustomization.yaml` (comment), [ADR 0010](../adr/0010-dependencies-and-supply-chain.md) and D-25 in [../DECISIONS.md](../DECISIONS.md).

## 6. Steps

Run them from a scratch folder, never from a working copy, with credentials from the Git Credential Manager or a personal access token kept in a credential helper (never in a URL that lands in shell history).

1. **Prepare on GitHub.** Push `remediation/poc-hardening`, let CI run, review and merge the pull request into `main` (fast-forward; [NEXT-STEPS.md](NEXT-STEPS.md) C-1). Commit the hand-over decisions first: `.gitattributes`, the archive decision for prototype material, this documentation. Tag the hand-over commit, for example `git tag -a v0.1.0-pilot -m "Pilot hand-over"`.
2. **Scan what will move.** In a fresh clone: gitleaks over the whole history (as in §5), the Client-name scan (`CLIENT_NAME_PATTERN=… npm test`, or the count-only scan over every commit for option A), and `git status --ignored` to confirm nothing else is there.
3. **Create the ADO repository** (empty) and copy its clone URL.
4. **Push.**
   - *Option A (full history):*
     ```bash
     git clone --bare https://github.com/<owner>/Demand-AI---POC.git demandai.git && cd demandai.git
     git push https://dev.azure.com/<org>/<project>/_git/<repo> refs/heads/main:refs/heads/main --follow-tags
     ```
     Push only the branches you want (a `--mirror` push would also send GitHub's `refs/pull/*`).
   - *Option C (fresh start):*
     ```bash
     git clone https://github.com/<owner>/Demand-AI---POC.git src && mkdir import && git -C src archive v0.1.0-pilot | tar -x -C import
     cd import && git init -b main && git add -A && git commit -m "DemandAI pilot, imported from v0.1.0-pilot ($(git -C ../src rev-parse --short v0.1.0-pilot))"
     git push https://dev.azure.com/<org>/<project>/_git/<repo> main
     ```
     `git archive` contains tracked files only; remove the prototype material in the import before committing if you decided to leave it out.
   - *Option B:* clone `--mirror`, run `git filter-repo --replace-text <file outside the repository>`, re-run the scans of step 2 on the result (0 hits in every commit), then push as option A.
5. **Verify.** `git ls-remote` on ADO shows the expected heads and tags with the same IDs as GitHub (options A and C's import commit); a fresh clone from ADO passes `npm ci`, lint, typecheck and `npm test`.
6. **Pipelines and policies.** Add `azure-pipelines.yml` on a branch, run it until the three jobs pass, then make it the required build validation on `main` (§4) and add the release pipeline.
7. **Switch people over.** `git remote set-url origin <ADO URL>` in every working copy; update the documents that name GitHub (§5); make the GitHub repository read-only (archive) or delete it, as its owner decides; tell everyone to stop pushing there.
8. **Record it.** The history option, the date, the ADO URL and the commit or tag migrated, in [../DECISIONS.md](../DECISIONS.md) (D-23, D-25).

## 7. Checklist

- [ ] ADO organisation, project, owner and access agreed
- [ ] History option chosen (A, B or C) and recorded
- [ ] Remediation merged into `main` on GitHub with CI green; hand-over commit tagged
- [ ] `.gitattributes` added (LF for shell scripts, binaries marked)
- [ ] Prototype material (`docs/ui-map/`, `docs/replit-*.md`, `test reports/`) kept or removed, by decision
- [ ] The Hunter branch's future agreed with its author; not migrated as is
- [ ] gitleaks and the Client-name scan clean on exactly what is pushed
- [ ] Nothing from §2 in the pushed tree (`git ls-files` on a fresh ADO clone)
- [ ] ADO repository created empty; branch policies and permissions set
- [ ] CI pipeline passes all three jobs on ADO; required on `main`
- [ ] Release pipeline pushes a tagged image to the chosen registry and prints its digest
- [ ] `CLIENT_NAME_PATTERN` secret variable set
- [ ] Documents updated from GitHub to ADO
- [ ] Developers' remotes switched; GitHub archived or kept read-only
