# Repository and readiness audit, 25 Oct 2026

The state of the repository, the remediation branch and the development database on the delivery team's machine, established from git (log, reflog, remote refs), executed checks and read-only database queries. Each finding is marked **Verified** (seen in git output, a run or a query), **Inferred** (follows from verified facts), or **Open** (can't be settled from here). This is a dated snapshot: refresh it before relying on it later.

Nothing was committed, pushed, fetched into, reset or deleted for this audit. The remote was read with `git ls-remote` and a separate bare clone in a scratch folder.

## 1. Summary

| Area | Finding | Status |
|---|---|---|
| Working tree | Clean at the start of the audit: nothing staged, modified or untracked outside `.gitignore`. Since then only this audit's documentation is uncommitted (§7) | Verified |
| Branch | `remediation/poc-hardening`, 113 commits on top of `main` at `f64ea61`, 0 behind; never pushed | Verified |
| Quality gates on `a6b4cf0` | All pass (§4) | Verified |
| Reproducible from tracked files | A fresh clone installs and passes lint, typecheck and the unit and legacy tests | Verified |
| Secrets | gitleaks finds no leak in 197 commits; `.env.local` is ignored and readable by its owner only | Verified |
| Client's name | Not in any tracked text file on the branch; present in 20 of the branch's 206 commits' trees (17 inherited from `main`), and still at the tip of every remote branch, `main` included | Verified |
| Remote | `main` hasn't moved since the clone, so the branch merges as a fast-forward. Two remote branches moved after the clone; one (Hunter email verification) conflicts in 7 files and is built on the pre-remediation design (§5) | Verified |
| Database | The app is connected to the project's local PostgreSQL 16 container on 127.0.0.1:55432, schema current (39 migrations), queries succeed under row-level security (§3) | Verified |

## 2. Git state

### 2.1 Working tree, index and stash (Verified)

- At the start of the audit `git status` was clean on `remediation/poc-hardening` at `a6b4cf0`: nothing staged, no modified or untracked files outside the ignore rules. No stash, no tags, one worktree.
- Every change of the remediation is committed: 113 commits by one author (with the co-author trailer), 22 Oct 15:16 to 24 Oct 14:33 (+05:30).
- **Nothing is pushed.** No remote branch holds any of the 113 commits; GitHub Actions has never run them.

### 2.2 Branches and remotes (Verified)

| Ref | Points at | Notes |
|---|---|---|
| `remediation/poc-hardening` (local, current) | `a6b4cf0` | No upstream |
| `main` (local) | `f64ea61` | Tracks `origin/main`; equal to it |
| `Demand_ai_checks_16_oct` (local) | `f64ea61` | No upstream, never pushed, no commits of its own |
| `origin/main` | `f64ea61` | "Merge pull request #5 …" (15 Oct 2026) |
| `origin/claude/serene-hypatia-r8q0f6` | `f79df7f` locally, **`2581a3e` on GitHub** | 4 commits behind GitHub |
| `origin/claude/sample-dataset-test-cases-v7y249` | `8a188c1` | Already contained in `main` |
| GitHub only: `feature/hunter-email-verification-and-paged-prospecting` | `679c67f` | Not fetched into this clone |

The repository is 4.8 MB packed (`git count-objects`); there are no large-file or LFS concerns.

## 3. PostgreSQL connectivity

### 3.1 Configuration (Verified, from the files)

`.env.local` (git-ignored) gives the app `DATABASE_URL` as `demandai_app@127.0.0.1:55432/demandai` and the migration runner `DATABASE_MIGRATION_URL` as `demandai_owner@127.0.0.1:55432/demandai`, with `DATABASE_SSL_MODE=disable`. It has **no `DATABASE_OPS_URL`**: the purge and export commands then fall back to `DATABASE_URL`'s server with `demandai_ops` and `DEMANDAI_OPS_PASSWORD` (`scripts/data/ops-db.mjs`). The port is published by `compose.dev.yaml` on the loopback interface only.

### 3.2 What answers (Verified, by execution, read-only)

| Check | Result |
|---|---|
| `docker ps` | `demandai-db-1` (postgres 16.15-bookworm, healthy, up 2 days, `127.0.0.1:55432->5432`), volume `demandai_pgdata`; also `demandai-test-db-test-1` on 55433 (the disposable test cluster) |
| `pg_isready` 127.0.0.1:55432 | accepting connections |
| The running dev server (port 3000, `npm run dev` from this folder) | `GET /api/health` 200; `GET /api/ready` 200 `{"database":"ok","migrations":"ok"}`: the app itself reached the database with `DATABASE_URL` and found every migration |
| `psql` as the app role | `current_user demandai_app`, database `demandai`, schema `public`, PostgreSQL 16.15, no TLS (as configured); the role is not superuser and can't bypass RLS |
| Migration journal | 39 rows in `drizzle.__drizzle_migrations` (0000 to 0038), matching `drizzle/meta/_journal.json` |
| Row-level security | `select count(*) from accounts` as the app role without a tenant context returns 0 (fails closed, as designed); 40 of 47 tables have RLS |
| As the owner role (counts only) | 2 business units, 21 users (the seed's plus throwaway check accounts from browser testing), 18 uploads, 22 lists, 8,521 accounts, 42,029 contacts, 5 scoring runs, 5 builds, 29 succeeded jobs, 160 AI call records; 194 MB. All from the fictional sample data |

**Conclusion:** the application is connected to a local PostgreSQL instance and can read and write through its normal code paths: the project's own Docker container on port 55432.

### 3.3 The system PostgreSQL service (Verified that it exists; its contents are Open)

The machine also runs Ubuntu's PostgreSQL 16 cluster `main` on 127.0.0.1:5432. The app does **not** use it: nothing in the configuration points at port 5432, and the integration harness refuses that port by design. The cluster asks for a password the delivery team doesn't hold (no `~/.pgpass`), so whether it has a `demandai` database is unknown. If the application should run against that cluster instead, follow [../DEVELOPMENT.md](../DEVELOPMENT.md) §3.3 (create the three roles with `db/bootstrap-roles.sql` as its superuser, point the three URLs at port 5432, migrate, seed, restart, check `/api/ready`).

## 4. Quality gates on `a6b4cf0` (Verified, run on 25 Oct 2026, Node 24.22.1, npm 11.19.1)

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | pass |
| `npm test` | 270 pass, 4 skipped (live AI smoke tests), 0 fail |
| `npm run test:legacy` | 37 pass |
| `npm run test:integration` (test cluster on 55433) | 162 pass |
| `npm run build` | exit 0 |
| `npm run test:http` | 31 pass |
| `npx playwright test` | 20 passed (1.9 min) |
| `npm run audit:gate` | 0 high or critical in production dependencies; no dev advisories allowed |
| `npm run deps:age` | 547 locked versions, none too young; with `--base main` as CI runs it, 497 new since `main`, none too young |
| `npm run check:bundle` (after a build with CI's dummy secrets) | 9 secret values, 4,825 files: none found |
| `bash deploy/check.sh` | Kubernetes overlay 13/13 valid, create-admin Job valid, 3 Compose configurations valid |
| gitleaks v8.30.1 (whole history) | 197 commits, no leaks |
| Fresh `git clone` of the branch, `npm ci`, lint, typecheck, `npm test`, legacy | all pass (269 + 5 skipped: without `reference_content/` or the `CLIENT_NAME_PATTERN` secret the Client-name scan is skipped) |

These match the end-of-remediation results recorded on 24 Oct.

## 5. Branch history and the remediation branch

### 5.1 Where it came from (Verified from the local reflog)

| When (+05:30) | Reflog entry |
|---|---|
| 15 Oct 16:11 | `clone: from https://github.com/<owner>/Demand-AI---POC.git` at `f64ea61` |
| 16 Oct 20:18 | `checkout: moving from main to Demand_ai_checks_16_oct` (the branch created at `f64ea61`; by its name and date, the read-only audit of 16 Oct: Inferred) |
| 22 Oct 15:16 | `checkout: moving from Demand_ai_checks_16_oct to remediation/poc-hardening`; the branch's own reflog says `branch: Created from HEAD` at `f64ea61` |
| 22 Oct 15:16 → 24 Oct 14:33 | 113 commits |

So `remediation/poc-hardening` was created from the local branch `Demand_ai_checks_16_oct`, which had been created from `main`; all three pointed at the same commit, **`f64ea61`**, which is `origin/main` then and now. The base is therefore `main` at `f64ea61` for every practical purpose. The reflog is local to this clone: another clone can't show this history, and it expires (90 days by default).

### 5.2 What the branch changes (Verified, `git diff main..HEAD`)

512 files: 468 added, 37 modified, 7 deleted (+288,335 / −4,150 lines; 243,543 of the added lines are drizzle-kit's schema snapshots in `drizzle/meta/`).

| Area | Files | What |
|---|---|---|
| `app/` | 126 added, 11 modified | 115 API route files, the pages, error boundaries |
| `lib/` | 91 added, 5 modified, 3 deleted | Server (auth, db, jobs, uploads, services), AI gateway, engine modules |
| `drizzle/` | 79 added | 39 migrations and their snapshots |
| `tests/`, `e2e/` | 69 + 9 added, 2 modified | Unit, integration, HTTP and Playwright suites |
| `components/` | 12 added, 10 modified | Screens moved from browser storage to the API |
| `deploy/`, `db/`, `Dockerfile`, `compose*.yaml`, `.github/` | 22 + 3 + root files + 2 | Deployment for EC2 and EKS, role bootstrap, backups, CI and release workflows |
| `docs/` | 26 added | Runbook, data model, AI, security, ADRs, DevOps, gap status, limitations |
| Root | 13 added, 6 modified, 2 deleted | `.gitignore`, `.dockerignore`, `.env.example`, `.gitleaks.toml`, `.nvmrc`, `package.json`, lockfile; removed `.DS_Store` and the orphan `demand-ai-poc` gitlink |
| Deleted elsewhere | `lib/file-reader.ts`, `lib/nba/data.ts`, `lib/roles.ts`, `types/global.d.ts`, `.vscode/mcp.json` | Browser-only code replaced by the server, a personal editor file |

### 5.3 Compared with the source and the remote (Verified)

- **Against `main` / `origin/main`:** 113 ahead, 0 behind; `origin/main` on GitHub is still `f64ea61`. A pull request merges as a fast-forward with no conflicts.
- **`claude/serene-hypatia-r8q0f6`** gained 4 commits on GitHub (22 Oct) that add `test-data/poc-test-sets/` (TS1 to TS12 with answer keys and generator scripts) and `test-data/upload-test-pack/` (Prospecting, Scoring and signal-rule files). Only additions; a trial merge with the remediation branch is clean. Its tree still has the Client's name in `test-data/generate_lead_dataset.py` (the copy the remediation cleaned), so take the new files, not the branch.
- **`feature/hunter-email-verification-and-paged-prospecting`** (1 commit, 22 Oct, a team member) adds Hunter.io email verification and server-paged Prospecting: 35 files, 12 new API route files, a settings panel for the Hunter key. A trial merge conflicts in `.env.example` (add/add), `.gitignore`, `README.md`, `components/screens/ProspectingScreen.tsx`, `components/screens/SetupScreen.tsx`, `lib/demandai-engine.ts` and `types/demandai.ts`. More than the text conflicts, it is built on the pre-remediation design: it stores the Hunter key and verification results in JSON files under `.data/` (`DEMANDAI_DATA_DIR`), has no sign-in or roles on its routes, and reads uploads with the `lib/file-reader.ts` the remediation removed. It also sends prospects' email addresses to a third party (Hunter.io), which the Client's data protection terms would have to allow. **Inferred:** it can't be merged as it is; the feature would be re-implemented on the server design (PostgreSQL tables with RLS, `withApi` permissions, a feature switch that is off by default, audit entries), after the Client agrees to the data processor.
- **Missing commits:** none. Every commit on `main` is in the branch; no commit on the branch exists elsewhere.

## 6. Ignored files and repository hygiene

### 6.1 What `.gitignore` excludes (Verified, `git status --ignored`)

| Path | Size | What it is | Right to ignore? |
|---|---|---|---|
| `.env.local` (mode 600) | 2 KB | Local secrets: role passwords, `SESSION_SECRET`, the Azure gateway key | Yes. Never commit |
| `reference_content/` | 13 MB | The Client's confidential documents and specification (also in `.git/info/exclude` and `.dockerignore`) | Yes. Never commit or ship |
| `DEMANDAI_*.md` (15 files at the root) | ~500 KB | Local working documents: the audit report, the remediation plan and prompt, session kick-offs, the worklog | Yes; they hold the Client's context in detail. Their decisions are now in [../DECISIONS.md](../DECISIONS.md) |
| `e2e/.state/` | 32 KB | Playwright sessions (signed-in cookies) of the test stack | Yes |
| `test-results/`, `.playwright-mcp/` | 117 MB, 2.5 MB | Test output and browser-check screenshots (fictional data) | Yes |
| `.idea/`, `.vscode/` | small | IDE settings; `.vscode/mcp.json` is personal | Yes |
| `node_modules/`, `.next/`, `next-env.d.ts`, `*.tsbuildinfo` | 618 MB, 1.1 GB | Installed and built output; `next-env.d.ts` is regenerated by `next dev`/`next build` | Yes (a fresh clone typechecks without them) |

**Nothing needed is excluded unintentionally**: a fresh clone reproduces every gate that doesn't need Docker (§4), and the image builds from tracked files. The `.env*` pattern keeps `.env.example` through its negation.

### 6.2 Tracked files to review before a hand-over (Verified that they are tracked; the recommendation is Inferred)

| Path | What | Recommendation |
|---|---|---|
| `docs/ui-map/` (221 PNG, 2.1 MB) | Screenshots of the prototype's components for a planning sheet (13 Oct) | Not referenced anywhere; leave out of the hand-over repository or move under `docs/archive/` |
| `docs/replit-setup-brief.md`, `docs/replit-content-library-prompt.md`, `docs/replit-users-roles-prompt.md` | Briefs for rebuilding prototype screens in Replit (9–10 Oct) | Superseded by the server application; archive or leave out |
| `test reports/10-prospecting_test_report_20261005_150202.pdf` | QA report on the prototype's Prospecting page (5 Oct), folder name with a space | Archive with the prototype material, or keep as history |
| `legacy/` | The HTML prototype: the reference the screens were ported from, and the parity tests read it | Keep (D-1); never shipped |
| `AGENTS.md` | Written and re-added by `next dev` (Next.js agent notes) | Keep (removing it only brings it back) |
| `vendor/xlsx-0.20.3.tgz` (2.4 MB), `test-data/*.xlsx` | Vendored SheetJS (D-24); the fictional sample and its answer key | Keep: the install and the answer-key tests need them |
| `drizzle/meta/*.json` | drizzle-kit snapshots | Keep: `db:generate` needs them |

### 6.3 Missing pieces for reproduction and hand-over

| Item | Status | Why it matters |
|---|---|---|
| Dependency manifests, lockfile, `.nvmrc`, `.env.example`, Dockerfile, Compose files, migrations, seed, deployment manifests, tests, CI | Present (Verified) | |
| `.gitattributes` | **Missing** | A Windows clone with `core.autocrlf=true` would check out `*.sh` (`db/init/10-roles.sh`, `db/backup.sh`, `deploy/**/*.sh`, `e2e/compose.sh`) with CRLF, and the containers would fail to run them. Add `*.sh text eol=lf` and mark `*.xlsx`, `*.tgz`, `*.png`, `*.pdf` as binary |
| Azure Pipelines definition | Missing (CI is GitHub Actions, D-25) | Needed only if the repository moves to Azure DevOps ([ADO-MIGRATION.md](ADO-MIGRATION.md)) |
| Ownership or licence notice, `CODEOWNERS`, pull request template | Missing | Ask who owns the code at hand-over; optional otherwise |
| `CLIENT_NAME_PATTERN` CI secret | Not set (no CI has run) | Without it CI skips the Client-name scan |

## 7. What to commit, keep local, and review before pushing

| Files | Recommendation |
|---|---|
| This audit's documentation: `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/CONFIGURATION.md`, `docs/DEVELOPMENT.md`, `docs/API.md`, `docs/DECISIONS.md`, `docs/handover/*.md`, and the updates to `docs/DATA_MODEL.md` and `README.md` | **Review, then commit** (one commit, on this branch). `docs/handover/REPOSITORY-AUDIT.md` describes this machine on one day: commit it as a dated record, or keep it out of the hand-over repository |
| Everything ignored in §6.1 | **Keep local.** Never `git add -f` them |
| `docs/ui-map/`, `docs/replit-*.md`, `test reports/` | **Decide** before the hand-over (§6.2) |
| A `.gitattributes` | **Add** before anyone clones on Windows |
| The `claude/serene-hypatia-r8q0f6` test packs | **Review and bring in** the new `test-data/` files if the team wants them (a separate commit), without the branch's old generator |
| `feature/hunter-email-verification-and-paged-prospecting` | **Don't merge.** Agree with its author and the Client whether the feature is wanted; if so, re-implement it on the server design |

Before pushing: run the gates of §4 (or let CI do it on the pull request), the Client-name scan (`CLIENT_NAME_PATTERN` or `reference_content/` present), and gitleaks; check `git status` for staged deletions; decide D-23 (history) if the repository is going anywhere outside the team ([ADO-MIGRATION.md](ADO-MIGRATION.md) §3).
