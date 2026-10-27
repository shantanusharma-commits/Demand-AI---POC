# Known limitations and open decisions

What the pilot build does not do, where it is provisional, and what is still to agree. Written for the Client's product owner and sponsor. Status on 24 Oct 2026.

## Out of scope for the pilot, by decision

| Limitation | Decision | What would change it |
|---|---|---|
| Nothing sends a message. Released messages and tasks are exported for the team to send from their own tools | Spec roadmap; bulk sending not allowed | A sending integration (email platform, LinkedIn) after the pilot |
| No agentic orchestration: people start each step (upload, score, hand off, build, decide) | D-42 ([ADR 0008](adr/0008-orchestration-deferred.md)) | The pilot's G2 evidence and the Client's agreement on what may run without a person |
| No frequency weighting or timing modifiers in scoring | D-43 ([ADR 0007](adr/0007-frequency-weighting-deferred.md)) | Validators rejecting scores in week 1; designed to drop in as configuration |
| Sign-in by invited email and password; no SSO and no second factor | D-3 ([ADR 0009](adr/0009-sign-in.md)) | The Client's security review requiring SSO or MFA (Entra ID, Phase 3b) |
| Prospects scored elsewhere can't be uploaded into Micro-segments & NBA; the built-in NBA scenario samples aren't offered | Session 6 choice | A request from the pilot team |

## Provisional until the Client confirms

| Item | Now | Needs |
|---|---|---|
| Persona dictionary, industry table and exclusions, synonyms | Versioned v1 from the audit ([ADR 0005](adr/0005-provisional-dictionaries.md)) | The Client's lists |
| Score scale and tiers | 0–100, tiers at 35 and 20, people ranked with the account tier beside ([ADR 0006](adr/0006-score-scale-and-tiers.md)) | Validators' acceptance (success area 2) |
| G1 baseline (38 minutes) and the G2 threshold (70%) | The guide's values | The sponsor's sign-off; the Client timing the baseline |
| Retention: 30 days after the sponsor's closing decision | Built and tested; the daily purge is a dry run | The period in the Client contract ([ADR 0004](adr/0004-retention-purge-export.md)) |
| Configuration per business unit | Each unit has its own configuration, brand pack, claims and routing rules (D-41) | Confirm, or say "shared across units" |
| Named validators per success area, and the sponsor | Verdicts are recorded by a signed-in Admin or Sales manager | The names |
| Autopilot for low-risk items | Built as the developer guide describes; the spec (6.4) says no bulk accept | The Client's choice between the two |

## AI

- **Every AI capability is switched off** until the Client agrees its results (docs/AI.md §4–5). With it off, the rules do the work, as in the prototype.
- The live evaluation used the fictional sample only. Classification met its targets (642 of 643 in-ICP accounts correct, none out-of-ICP called core); why-now lines and first messages passed every check. The checks can't judge how good the writing is: the reviewers should read a sample.
- gpt-5.4-mini passed the same checks for why-now lines and messages at a third of the cost; they stay on gpt-5.4 until the reviewers compare.
- The pilot's API Management gateway sometimes refuses a call from one of its backends (400 "…CheckAccess"); the app retries it. Its latency varies (1 to 30 s); the timeout is 45 s per attempt in the deployment files.
- Prices in the cost estimate are list prices from published price lists; set the Client's agreed prices.
- To record before switching on: the Azure resource's region, its abuse-monitoring setting, and confirmation that data isn't used for training.
- The Bedrock adapter is built and tested against a stand-in, never against a live Bedrock model.
- Copilot chats are kept for the person who had them until they delete them or the end-of-pilot purge removes them; they are not part of the data export. Free-text answers go to the model only when no rule answers.

## Product

- **Owner emails must match people.** Reps see only accounts whose `owner_email` is theirs or an alias. A list of owner emails that match nobody (planned in D-4) wasn't built; managers see every account and add aliases in Users and roles.
- **Content studio** writes plain text: no bold, italics or links inside a piece. One conversation per piece.
- **R3 "Wrong company or site"** sets the account aside and records a data flag in the audit log; there is no data-owner queue yet.
- **Weeks and timestamps** in Analytics and the readout are in UTC (ISO weeks); due dates in For Review use the person's browser time zone.
- **One readout per business unit**, created with its first sign-off.
- **Volume.** Up to 25 MB and 50,000 rows per file (configurable). Measured on a development machine: 20,000 rows checked in about 5 s and scored in about 3 s; first rows on screen under 0.3 s; the app used about 0.7 GB for that file. Larger files or many uploads at once would need more memory and, later, object storage and a queue ([ADR 0001](adr/0001-platform-and-hosting.md)).
- **Browsers.** Tested in Chromium (Chrome, Edge). Firefox and Safari aren't in the automated tests.
- **Accessibility.** Automated WCAG 2.1 AA checks (axe) pass on every screen, and an upload works by keyboard alone; clickable table rows and some filter pills are still easier with a mouse. Not audited by a person or with a screen reader.

## Operations

- **Not deployed.** The delivery team ships the image, the deployment files and the runbooks (docs/devops); DevOps deploys. Everything was rehearsed locally, including rollback between two releases and a restore; the EKS, ALB, External Secrets and RDS parts are validated but not run.
- **Email is off** until an SMTP sender is configured: invite and reset links are shown to copy.
- **One region, one database.** RDS Multi-AZ and its backups are the resilience; no cross-region failover.
- **The Client's name is in this repository's git history** (removed from the files on 22 Oct 2026; rewriting history was not chosen, D-23). Don't share the repository outside the team without that rewrite.
- **Commit `32f5569`** on its own doesn't build (a file deletion rode along by mistake; the next commit fixes it). Harmless unless someone builds that exact commit.
