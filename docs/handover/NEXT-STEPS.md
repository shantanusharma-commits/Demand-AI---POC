# Next steps to a POC deployment and hand-over

The plan from 25 Oct 2026, built on the session-11 kick-off brief of 24 Oct (a local working document) and checked against the code, git and the development database ([REPOSITORY-AUDIT.md](REPOSITORY-AUDIT.md)). Update the status column as items close.

## 1. The kick-off brief against today

| Brief (24 Oct) | Today (25 Oct) | Still valid? |
|---|---|---|
| Branch `remediation/poc-hardening` at `a6b4cf0`, nothing pushed, tree clean | Same; this documentation is the only uncommitted change | Yes |
| Remediation complete: Phases 1–10 and 6b; G-001…G-065 (63 fixed, 6 provisional, 2 deferred) | No code changed since; [../GAP-STATUS.md](../GAP-STATUS.md) stands | Yes |
| Dev database at migration 0038 | 39 migrations applied; `/api/ready` 200 | Yes |
| `.env.local` on the live Azure gateway with every AI flag on (development only) | Same; the deployment files keep AI off | Yes |
| Expected gate results | Every gate re-run and matching (lint 0/0, unit 270 + 4, legacy 37, integration 162, build, HTTP 31, e2e 20/20, audit, deps age 497, deploy files, gitleaks) | Yes |
| Next: push and open a pull request; Gap Log update; Client inputs; DevOps' first EKS deploy | None started; all still need the user, the Client or DevOps | Yes, with the additions below |

**New since the brief:** two remote branches moved after the clone (a teammate's Hunter email-verification feature, which conflicts and is built on the old design; and new test packs that merge cleanly); the decision IDs and the hand-over documentation existed only in local files (now in [../DECISIONS.md](../DECISIONS.md) and the wiki); the repository has no `.gitattributes`; CI has never run on a hosted runner; two settings are validated but unused.

## 2. Prioritised actions

**Critical** blocks a POC deployment on real data. **High** blocks a clean hand-over, or carries real risk if skipped. **Medium** should be done during the pilot. **Low** can wait. "Owner" is who has to act; the delivery team can do every item marked *team* once the user says go.

| ID | Priority | Task | Why | Files / modules | Depends on | Owner | Done when |
|---|---|---|---|---|---|---|---|
| C-1 | Critical | Commit this documentation, push `remediation/poc-hardening`, open the pull request into `main` | Nothing is on GitHub; CI has only run locally | `docs/`, `README.md` | The user's go-ahead | team + user | The three CI jobs (`checks`, `integration`, `e2e`) pass on GitHub's runners and the PR is merged (fast-forward) |
| C-2 | Critical | Make `checks`, `integration`, `e2e` required on `main` (or the ADO build policy, H-3) | Keeps the gates binding after the merge | repository settings | C-1 | repository owner | Branch protection shows the three as required |
| C-3 | Critical | DevOps stands up the pilot environment: AWS account and region, EKS (or the EC2 host), RDS for PostgreSQL 16, the registry, DNS and TLS, Secrets Manager entries | Nothing is deployed (D-37) | [../devops/CHECKLIST.md](../devops/CHECKLIST.md), `deploy/` | C-1 (a tagged image) | DevOps | `/api/ready` 200 on the pilot URL; the rollback rehearsal repeated there ([../devops/REDEPLOY.md](../devops/REDEPLOY.md) §5) |
| C-4 | Critical | The Client confirms that its prospects' personal data may be processed in that hosting region, and the retention period | Lead files hold names, titles, emails and LinkedIn addresses; the purge stays a dry run until the period is known (D-20) | [../adr/0004-retention-purge-export.md](../adr/0004-retention-purge-export.md), `RETENTION_DAYS_AFTER_READOUT` | — | Client | Written confirmation recorded; `--yes` added to the purge CronJob or timer when the period is set |
| C-5 | Critical (only if required) | The Client's security review: SSO or MFA required? | Sign-in is invite-only email and password (D-3); Entra ID would be Phase 3b | [../adr/0009-sign-in.md](../adr/0009-sign-in.md) | — | Client | Answer recorded; Phase 3b planned if yes |
| H-1 | High | Decide what happens to `feature/hunter-email-verification-and-paged-prospecting` | It conflicts in 7 files, stores data in JSON files without sign-in, and sends prospects' emails to Hunter.io | the branch; `lib/server/services/lists.ts`, `ProspectingScreen.tsx` if re-implemented | The feature's author; the Client's agreement to a new data processor | team + author + Client | Either closed, or re-specified on the server design (PostgreSQL with RLS, `withApi`, a switch that is off by default, audit) with the Client's approval |
| H-2 | High | Choose the history option for the hand-over repository (D-23) | 20 commits carry the Client's name; docs cite commit IDs | [ADO-MIGRATION.md](ADO-MIGRATION.md) §3 | Who owns the target repository | user | Option A, B or C recorded in [../DECISIONS.md](../DECISIONS.md) |
| H-3 | High | If the hand-over is to Azure DevOps: migrate, translate CI to Azure Pipelines, set branch policies | GitHub Actions doesn't run in ADO | [ADO-MIGRATION.md](ADO-MIGRATION.md), new `azure-pipelines.yml` | C-1, H-2, H-4 | team + ADO admin | The checklist in ADO-MIGRATION.md §7 is complete |
| H-4 | High | Add `.gitattributes` (`*.sh text eol=lf`; `*.xlsx *.tgz *.png *.pdf binary`) | A Windows clone would break every shell script the containers run | repository root | — | team | A Windows checkout (or `git ls-files --eol`) shows LF for every `.sh` |
| H-5 | High | Set the `CLIENT_NAME_PATTERN` CI secret (GitHub or ADO) | Without it CI skips the Client-name scan | CI settings; `tests/repo-hygiene.test.ts` | — | repository owner | The scan runs (not skipped) in CI |
| H-6 | High | Update the Gap Log workbook from [../GAP-STATUS.md](../GAP-STATUS.md) | The PM's tracker still shows the audit's state | the workbook (local, never committed) | The user's go-ahead; nobody has it open | team | Columns M, N, O filled for G-001…G-065 on a backed-up copy |
| H-7 | High | Confirm the product choices the remediation made (sessions 4–10, listed in the worklog), D-41 (per-unit configuration), D-17's reading, the Autopilot vs "no bulk accept" question | Built on the delivery team's defaults | [../KNOWN-LIMITATIONS.md](../KNOWN-LIMITATIONS.md), [../DECISIONS.md](../DECISIONS.md) | — | user + Client product owner | Each confirmed or turned into a change request |
| H-8 | High | Client inputs for the pilot's content: persona dictionary, industry table and exclusions, synonyms; named validators per success area and the sponsor; G1 baseline timing and G2 sign-off | Provisional v1 values today (ADR 0005, D-21, D-27) | `lib/engine/config.ts` (configuration v2), `tests/answer-key.test.ts` | — | Client | Configuration v2 saved with the answer key reviewed; names recorded |
| M-1 | Medium | Switch AI on, one capability at a time | Off by default; evaluated on the fictional sample only | `AI_FEATURE_*`, [../AI.md](../AI.md) §5 | Reviewers read a sample of drafts; the Azure region, abuse-monitoring setting and no-training terms recorded; agreed prices in `AI_PRICE_*`; `AI_TIMEOUT_MS` 45–60 s | Client + DevOps | Each switched capability has a signed-off evaluation in docs/AI.md |
| M-2 | Medium | Report the API Management gateway's intermittent 400 "…CheckAccess" to its owner | The app retries it, but it costs latency | — | — | user | Ticket raised with the gateway's owner |
| M-3 | Medium | Configure an SMTP sender | Invites and resets are copied by hand meanwhile | `NOTIFICATION_*` | A mailbox | Client / DevOps | An invite email arrives |
| M-4 | Medium | Bring in the new test packs from `claude/serene-hypatia-r8q0f6` (`test-data/poc-test-sets/`, `test-data/upload-test-pack/`) | Useful for the pilot team's acceptance tests | `test-data/` | Review that the files are fictional and Client-name free | team | Committed as one reviewed commit (not the branch) |
| M-5 | Medium | Decide on the prototype material (`docs/ui-map/`, `docs/replit-*.md`, `test reports/`) | Not referenced; noise for a new team | those paths | — | user | Archived, removed, or kept on purpose |
| M-6 | Medium | Run a person-led accessibility check and a Firefox/Safari pass | Automated axe checks only; Chromium only | `e2e/` | — | team | Findings fixed or listed in KNOWN-LIMITATIONS |
| L-1 | Low | Use `LOG_SLOW_QUERY_MS` for the slow-transaction threshold, and drop `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Validated settings that do nothing | `lib/server/env.ts`, `lib/server/db/tenant.ts`, `.env.example`, [../CONFIGURATION.md](../CONFIGURATION.md) | — | team | Changing the variable changes the threshold (with a test), or the variable is gone |
| L-2 | Low | Replace "plan §n" and "remediation prompt §n" references in comments with decision or gap IDs | They point at local-only documents | 58 references | — | team | `git grep "plan §"` returns only historical notes |
| L-3 | Low | Update `package.json`'s description (still "clickable prototype") | Cosmetic | `package.json` | — | team | |
| L-4 | Low | Test the Bedrock adapter against a live model, if Bedrock is ever chosen | Tested against a stand-in only | `lib/ai/providers/bedrock.ts` | Bedrock model access (DevOps) | DevOps + team | `npm run ai:evaluate` passes on Bedrock |
| L-5 | Low | Tidy the local clone: delete the empty `Demand_ai_checks_16_oct` branch; `git fetch` to refresh stale remote-tracking refs; remove the throwaway browser-check users from the development database | Housekeeping on the developer's machine only | — | The user's go-ahead | team | |

## 3. Blockers and what can wait

- **Blocks a POC deployment on real data:** C-1 (merged with CI green on a hosted runner), C-3 (an environment), C-4 (data-processing and retention confirmation), and C-5 only if the Client's security review requires SSO or MFA.
- **Blocks a clean hand-over:** H-2 and H-3 (if Azure DevOps), H-4, H-5, H-6, and committing this documentation (part of C-1).
- **Doesn't block either:** AI (off, with the rules doing the work), email (copy-link), the Hunter feature (out of the current scope), the dictionaries (v1 works and is versioned), and every Low item. The deferred features (orchestration D-42, frequency weighting D-43, sending messages, SSO unless required) stay out by decision.

## 4. Suggested order

1. The user approves committing the documentation and pushing (C-1); the PR runs CI on GitHub; fix anything a hosted runner shows; merge.
2. In parallel: H-4 and H-5 (minutes), H-1 conversation with the feature's author, H-2 decision.
3. DevOps: C-3 using the tagged image; the Client: C-4, C-5, H-8.
4. Hand-over: H-3 (if ADO), H-6, H-7; then M-items during the pilot.
