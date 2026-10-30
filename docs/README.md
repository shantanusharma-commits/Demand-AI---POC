# DemandAI developer wiki

The technical reference for developing, reviewing, operating and handing over DemandAI. What the product is and how to start it in five minutes is in the [repository README](../README.md); everything else starts here.

DemandAI is a pilot application for an industrial automation supplier's sales team (written "Client" throughout): it checks lead files, scores accounts on fit and recent signals, builds micro-segments with a next best action and a first message, routes what the system can't decide to a person, and measures the pilot against six success criteria. It is a Next.js 16 server application on Node 24 with PostgreSQL 16, optional AI (Azure OpenAI or Amazon Bedrock, off by default), shipped as one container image for AWS (EC2 with Docker Compose, or EKS).

## Start here

| You are | Read, in order |
|---|---|
| A developer joining the project | [DEVELOPMENT.md](DEVELOPMENT.md) (set-up, tests, rules) → [ARCHITECTURE.md](ARCHITECTURE.md) → [DATA_MODEL.md](DATA_MODEL.md) → [API.md](API.md) → [CONFIGURATION.md](CONFIGURATION.md) |
| A reviewer or auditor | [ARCHITECTURE.md](ARCHITECTURE.md) → [SECURITY.md](SECURITY.md) → [GAP-STATUS.md](GAP-STATUS.md) → [DECISIONS.md](DECISIONS.md) |
| DevOps | [devops/README.md](devops/README.md) → [CONFIGURATION.md](CONFIGURATION.md) → [RUNBOOK.md](RUNBOOK.md) |
| The Client's product owner or sponsor | [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) → [AI.md](AI.md) → [DECISIONS.md](DECISIONS.md) |
| Taking over the repository | [handover/NEXT-STEPS.md](handover/NEXT-STEPS.md) → [handover/REPOSITORY-AUDIT.md](handover/REPOSITORY-AUDIT.md) → [handover/ADO-MIGRATION.md](handover/ADO-MIGRATION.md) |

## Documents

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | High-level design, the modules, end-to-end flows with diagrams, what works, technical debt and failure points |
| [DATA_MODEL.md](DATA_MODEL.md) | PostgreSQL: roles, isolation, the 47 tables, relationships, which code reads and writes each, personal data, migrations |
| [API.md](API.md) | Every HTTP route with its auth mode, permission and rate limit; conventions; integrations |
| [CONFIGURATION.md](CONFIGURATION.md) | Every environment variable: purpose, format, default, required, secret, effect; per environment |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Set-up, the local database and how to connect to another one, running, testing, debugging, troubleshooting, repository rules |
| [DECISIONS.md](DECISIONS.md) | Decisions D-1 to D-44 and the other IDs the code cites |
| [adr/](adr/) | Architecture decision records 0001–0010: [hosting](adr/0001-platform-and-hosting.md), [business units](adr/0002-business-unit-tenancy.md), [AI and models](adr/0003-ai-provider-and-models.md), [retention](adr/0004-retention-purge-export.md), [dictionaries](adr/0005-provisional-dictionaries.md), [score scale](adr/0006-score-scale-and-tiers.md), [frequency weighting](adr/0007-frequency-weighting-deferred.md), [orchestration](adr/0008-orchestration-deferred.md), [sign-in](adr/0009-sign-in.md), [supply chain](adr/0010-dependencies-and-supply-chain.md) |
| [AI.md](AI.md) | Where AI calls go, what the gateway does, each capability, the evaluation and its results, switching on |
| [SECURITY.md](SECURITY.md) | Threat model (STRIDE), controls, residual risks |
| [RUNBOOK.md](RUNBOOK.md) | Operating the pilot: health, uploads, people, AI, end-of-pilot data, incidents |
| [devops/](devops/README.md) | [EC2](devops/DEPLOY-EC2.md), [EKS](devops/DEPLOY-EKS.md), [RDS](devops/RDS.md), [releases and rollback](devops/REDEPLOY.md), [secrets](devops/SECRETS.md), [observability](devops/OBSERVABILITY.md), [Azure OpenAI](devops/AZURE-OPENAI.md), [Azure appendix](devops/AZURE-APPENDIX.md), [checklist](devops/CHECKLIST.md) |
| [GAP-STATUS.md](GAP-STATUS.md) | The audit's 65 gaps and the evidence for each fix |
| [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) | Out of scope, provisional, still to agree |
| [handover/](handover/) | Dated hand-over material: [repository audit](handover/REPOSITORY-AUDIT.md), [Azure DevOps migration](handover/ADO-MIGRATION.md), [next steps](handover/NEXT-STEPS.md) |
| [../test-data/README.md](../test-data/README.md) | The fictional dataset and its answer key |
| Historical, not maintained | `replit-*.md` (briefs for rebuilding the prototype's screens, 9–10 Oct), `ui-map/` (prototype screenshots), `../test reports/` (a QA report on the prototype, 5 Oct). They describe the HTML prototype, not this application |

## Repository map

```text
app/                     Next.js App Router
  <screen>/page.tsx        one Server Component per screen: session and role check, then the screen
  api/**/route.ts          115 route files (129 routes in withApi, plus health, ready, client-errors)
  layout.tsx, error.tsx    fonts, global styles, error boundaries
components/
  screens/*Screen.tsx      one client component per screen (Prospecting, Scoring, NBA, Review, …)
  AppShell.tsx, Copilot.tsx, …   navigation, unit switcher, Copilot panel, shared widgets
lib/
  demandai-engine.ts       the lead and scoring rules (stages 1–8)
  engine/                  prospects, NBA (stage 9), review, routing, gates, corrections, configuration v1
  prospecting/, content/, copilot/   check panes and quality; brand pack and studio writer; Copilot rules
  auth/permissions.ts      roles, screens and actions: one table for the server and the screens
  ai/                      the AI gateway, providers (Azure OpenAI, Bedrock), capabilities, evaluation
  server/                  server-only: env, logger, boot, deps, health
    db/                      pool, schema (Drizzle), withTenant/withUser, audit
    http/                    withApi, errors, request helpers, schemas, downloads
    auth/                    sessions, tokens, passwords, rate limits, page guard
    jobs/                    queue, worker, handlers
    uploads/                 inspect, zip guard, parse (SheetJS)
    services/                business logic per screen domain
    mail/                    SMTP mailer and templates
  client/                  browser helpers: API client, paging, error reports
drizzle/                 39 forward-only SQL migrations + meta/ (journal, snapshots)
db/                      role bootstrap, Compose init script, backup script
scripts/                 migrate, seed, create-admin, purge/export, AI evaluate/diagnose, CI gates, env init
tests/                   unit (*.test.ts), integration/ (PostgreSQL), http/ (standalone server), helpers, fixtures
e2e/                     Playwright specs, the e2e stack and the Compose runner
deploy/                  k8s/ (EKS: kustomize base + pilot overlay, jobs), ec2/ (Compose overlays, Caddy, systemd), check.sh
legacy/                  the original HTML prototype and its engine tests: the reference, never shipped, never edited
test-data/               the fictional 7,498-row sample, its answer key, generators
security/                the audit allowlist (empty)
.github/workflows/       ci.yml (checks, integration, e2e), release.yml (image to GHCR)
Dockerfile, compose*.yaml, .env.example, .nvmrc, package.json, package-lock.json
```

## Glossary

| Term | Meaning |
|---|---|
| Business unit (BU) | A part of the Client with its own data, users, configuration and brand pack in one deployment (D-32) |
| Owner email, alias | The `owner_email` column of a lead file says which rep owns an account; a rep sees accounts whose owner email is their sign-in email or one of their aliases (D-33) |
| Fit, timing, score, tier | Fit: how well the account and person match the ideal profile. Timing: how strong and recent their signals are. Score 0–100 from fit × timing; tier A ≥ 35, B ≥ 20, C below that with a live signal, Watch list for a good fit without one (ADR 0006) |
| Signal | A dated event about an account or person (an inquiry, a project, a new leader, …) from a signal file |
| Hand-off | Moving contactable tier A and B prospects with a live signal from Scoring to Micro-segments & NBA |
| Micro-segment, NBA | A group of accounts with the same situation; the next best action recommended for each account |
| Recommendation, draft | The system's action for one account, and every version of its first message |
| Released, exception, sensitive | A recommendation that passed every check goes ahead on its own; one that failed a check waits in the rep's For Review queue; sensitive content waits for a sales manager |
| Spot-check | A weekly sample of released items a person rates |
| G1, G2 | The pilot's gates: person-minutes per released item against a baseline (G1), first-pass acceptance of the system's output (G2) (D-21) |
| Six success areas, readout | The pilot's success criteria (D-38); the readout records a verdict per area and the sponsor's decision |
| Configuration version | The engine's settings for a unit, versioned; every list, run and build names the version it used |
| Brand pack, claim | Voice, keywords, frameworks and approved proof points (claims, with owner and expiry) every draft is checked against |
| Copilot, Autopilot | Questions answered about the screen (rules first, AI when on); Autopilot does approved low-risk actions, logged and undoable |
| System user | The user (ID `00000000-…-0001`) jobs and the rules act as |
| Job | Background work (lead checks, scoring, AI-written builds) in the `jobs` table |
| `D-n`, `G-n`, `N-n`, ADR | A decision ([DECISIONS.md](DECISIONS.md)); an audit gap ([GAP-STATUS.md](GAP-STATUS.md)); a finding added in the remediation plan; an architecture decision record ([adr/](adr/)) |
| Legacy, prototype | The HTML demo in `legacy/` the application was ported from |

## Onboarding checklist

1. Get access to the repository and, if needed, to the development AI gateway (never use production keys locally).
2. Follow [DEVELOPMENT.md](DEVELOPMENT.md) §2; sign in as each seeded role and walk Prospecting → Scoring → NBA → For Review → Analytics with **Use sample data**.
3. Run `npm run lint`, `npm run typecheck`, `npm test`; then the integration, HTTP and end-to-end suites once (§5).
4. Read [ARCHITECTURE.md](ARCHITECTURE.md) §3–4 and [DATA_MODEL.md](DATA_MODEL.md) (roles and isolation), then the rules in [DEVELOPMENT.md](DEVELOPMENT.md) §8.
5. Read [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) and [handover/NEXT-STEPS.md](handover/NEXT-STEPS.md) for what is open.

## Keeping the documentation true

- The documents describe the code; when they disagree, the code wins and the document is fixed in the same pull request.
- What to update with which change: [DEVELOPMENT.md](DEVELOPMENT.md) §8 rule 9.
- `handover/` is dated: refresh `REPOSITORY-AUDIT.md` before each hand-over, and close items in `NEXT-STEPS.md` as they are done.
- Never write the Client's name, a host name or address of a real environment, or a secret into any document; use placeholders (`<owner>`, `<rds endpoint>`).
