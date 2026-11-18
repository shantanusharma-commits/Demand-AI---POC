# Demand AI prototype

A clickable prototype that tells the Demand AI story end to end on seeded data, built from `docs/Demand_AI_Prototype_Build_Brief.md` (version 4) and `docs/R1_feature_spec.md`. It uses the same layout as the production mock (menu on the left, chat beside it, the work on the right) in the Emplay brand.

It is a demo, not the production system. Every company and person is invented (`DEMO_ANONYMISE` is on). Nothing is sent. Data tools are named only on the Connectors and Admin screens.

## Open it

Open `index.html` in Chrome or Edge. It works from disk: the seed is loaded as `seed/seed.js`. Fonts need an internet connection. Pick a role in the header (Rep, Manager, Leader, Admin). The demo clock sits next to it: "+1 day" and "+3 days" move time forward, and "Reset" starts again.

## What is real logic and what is demo data

Real logic, computed in the browser from the seed (change a seed value and the result changes):

| Rule | Where |
|---|---|
| Signal tiers, decay and expiry (tier 1: 100 points, full 3 days, zero by day 14; tier 2: 60, 14, 60; tier 3: 30, 60, 90). A date in the text overrides the window | `js/engine.js` `decayFactor`, `expiryOf` |
| Strength 1 to 5 maps to 0.6 to 1.0 (3 is the default) | `strengthFactor` |
| Entry gate: repeats within 30 days count 0.5, 0.25, 0.15, then 0.1; the same event from several sources is one signal | `repeatFactors`, `mergeEvents` |
| Qualification filter: observable, predictive, time-bound; discards keep the failed test | `qualify` |
| Timing = S1 + 0.5 S2 + 0.25 S3 …, no cap. Rank = Fit × Timing. Account tier A top 15%, B next 25% | `stack`, `rankOf`, `assignTiers` |
| Fit: weighted ICP match; a missing key attribute holds the account unranked | `fitScore` |
| Confidence from identity tier, independent sources, strength and evidence; bands 0.75 and 0.50 | `confidence` |
| Microsegment = niche × strongest trigger. 10 or more in a rolling 7 days raise a campaign flag (NBC) | `microsegment`, `nbcFlags` |
| The five criteria and the route: Ready to send, approval card, nurture, held | `evaluate` |
| Message verification: approved claims or cited signals only, banned phrases, figures need a source | `verifyDraft` |
| Edits stored as a diff | `wordDiff` |
| Backtest bars on 15 won, 15 lost, 15 random | `backtest` |

The worked example is reproduced in the tests: fit 80 with decayed signals 34.5, 6.25 and 2.1 gives timing 38.15 and rank 3,052.

`js/store.js` runs the pipeline on the seed plus what people do (sends, edits, opt-outs, confirmations, switches, the clock) and builds the escalations (16 types, each with owner, reason, due time and default). State is kept in this browser only.

Demo data (labelled on screen, seeded, not driven by the rules): replies in six statuses, the funnel per 100 and scorecards, generated assets, first-party signals and the fast lane, learning, the pattern cache and the quota plan, and the research agent. Everything else in the feature map that is not R1 is a Coming tile.

## Screens

| Role | Screens |
|---|---|
| Sales rep | Morning queue, Needs my decision, Campaign tasks, Accounts (account page with next step, why this rank, timeline, context graph, contacts, holds), approval cards, Signals (live, discarded, expired, registry) |
| Sales manager | Campaigns (campaign cards to confirm, edit or decline), Team queue, Needs my decision |
| Sales leader | Backtest report (with a switch that degrades the rules), Needs my decision |
| Admin | ICP (path A and path B, cold start), Exclusions, Content Library and Knowledge Hub, Thresholds, Autonomy policy, Simulate failure, Connectors, Run log and cost, Audit log |
| Everyone | Chat (five questions), demo-data screens, Coming tiles, Slack and Teams preview, Presenter path |

## The ten scenarios

All ten are on the Presenter path screen with a "Go" button, and are covered by an automated run:

1. Cold start, ICP shared: Admin, ICP, path A. Spend equals the accounts that passed the fit check.
2. Cold start, ICP unknown: Admin, ICP, path B. A proposed ICP and a sample; nothing searched until confirmed.
3. Signal to action: Harrowgate Refining is Ready to send; sending logs a row with its signals.
4. Failed criterion: Halden Process Systems (contact I3) gets an approval card naming identity tier; an edit is stored as a diff.
5. Exclusion: Brightwell Chemicals, a customer with strong signals, never reaches the queue.
6. Campaign: 11 LNG terminals share a compliance deadline inside 7 days. Confirm as the manager; send touch 1 as Sofia; advance 4 days: a contact at Ashby LNG opted out, so touch 2 is held and escalated. Logging a reply removes pending touches. Nine refineries with a hiring surge stay below the threshold.
7. Fail closed: Admin, Simulate failure, CRM unreachable. Nothing is routed and the rep sees why.
8. LinkedIn engagement: Kestrel Gas Processing. A question in a comment on a relevant post is strong; a like on an unrelated post is discarded.
9. Opt-out: Fenwick Refining. Add an opt-out on the contact; it leaves every queue.
10. Timeout: Caldbeck Petrochemicals has a medium-confidence card. "+3 days" expires it and the account re-ranks.

Other seeded cases: a recent touch (Whitlock), an open deal (Upwood), verification failure (Ravensworth), segment policy (Saltire Hydrogen), no draft (Thornbury Power), no verified channel (Ingleby Terminals), an I4 held record (Glenmoor), a name-only CRM match (Dunmore), an unclear niche (Oakhurst), a missing attribute (Pellworth), a champion move (Varney to Elsworth), a merged duplicate and a same-name pair (Harrowgate, Dunmore), a bounce, and "budget frozen to April".

## Files

- `index.html`, `css/app.css`, `brand/` (Emplay logos)
- `js/config.js`: every proposed default (tiers, decay, strength, gate, bands, campaign rule, due times, backtest bars, cost cap)
- `js/engine.js`: the pure rules; `js/store.js`: state and the pipeline; `js/ui.js`, `js/views2.js`, `js/chat.js`: screens
- `seed/`: generated JSON (one file per table) and `seed.js` (the same data for the browser)
- `tools/gen-seed.cjs`: the deterministic seed generator. Run `node prototype/tools/gen-seed.cjs`
- `tools/source/`: the CSVs from the brief pack (signals, escalations, connectors, feature map), read by the generator
- `tools/build-artifact.py`: writes a copy that can be published as a claude.ai artifact
- `tests/engine.test.cjs`: run `node --test prototype/tests/engine.test.cjs`
- `docs/`: the build brief and the R1 feature spec

## Assumptions (all in config)

- Drafts are pre-written in the seed (the brief's default). `llm.enabled` would switch to a language model.
- The fourth repeat of a signal type counts 0.15 (the brief gives 0.5, 0.25 and 0.1 from the fifth).
- Autonomy policy is set per niche. Open deals and name-only CRM matches hold the account rather than exclude it.
- The LinkedIn engagement source is not agreed; those signals are seeded and labelled.
