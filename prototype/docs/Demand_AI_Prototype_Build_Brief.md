# Demand AI: prototype build brief for Claude Code

Version 4, 18 November 2026. Read this file first. Then read `R1_feature_spec.md`, and use the CSV files as data.

## 1. What you are building

Demand AI automates the prospecting motion for a B2B sales team. It builds a list of accounts from the customer's own ICP, watches for buying signals, ranks accounts by fit times timing, decides the next best action (NBA) for each account or a next best campaign (NBC) for a group, runs outreach through the customer's own tools, reads replies, and learns from outcomes. The AI decides what it can. What it cannot decide goes to the sales rep who owns the account. The customer buys a booked meeting with the right account, not software.

**Your job now:** build a clickable prototype, a single web app that tells this story end to end on seeded data, so we can show it to leadership and prospects. It is a demo, not the production system. The production build (R1) runs separately on Zinger Studio. The prototype must obey the same product rules, so what people see is what we will ship.

## 2. Ground rules (read twice)

- **Anonymise every company name.** All accounts, contacts' employers, customers and rivals shown on screen are invented. Never use a real company name for a prospect, customer or rival. Use a `DEMO_ANONYMISE = true` flag in config and generate names from a fictional pool (for example "Northgate Terminals", "Halden Process Systems"). Data tools can be named as sources (for example Apollo, ZoomInfo) only on the Connectors and Admin screens.
- **Label what is not real.** Anything simulated shows a small "Demo data" tag. Anything cached shows "Cached data". Never imply live data.
- **British English.** No em dashes or long dashes in any text. Short, direct sentences.
- **Brand.** Purple `#7D52A2`, blue `#0094DA`, orange `#FF8820`. Poppins for headings, Inter for body. Clean, flat, no photos, no blur, no gradients. Logos are in `brand/` (`emplay_black.png` for light pages, `emplay_white.png` for dark, `emplay_mark.png`).
- **No backend needed.** Static front end with seeded JSON and in-browser logic. Scoring, decay, routing and the NBA or NBC rule must be computed in code from the seed, not hard-coded, so changing a seed value changes the result.
- **Do not build:** a CRM, a website chatbot, a campaign sender, lookalike accounts, inbound account candidates, or any writing to a CRM. Demand AI reads the CRM and never writes to it.

## 3. Who uses it

| Role | Owns | In the prototype |
| --- | --- | --- |
| Sales rep | Activity | Works the morning queue, decides escalations on their accounts, sends |
| Sales manager | Rates | Confirms every campaign (NBC) |
| Sales leader | Money | Reads the backtest and the weekly summary |
| Admin (RevOps) | Configuration | ICP, exclusions, Content Library, confidence bands, autonomy policy |

There is no reviewer role. Add a simple role switcher in the header so a presenter can move between these four views.

## 4. Product rules the screens must obey

1. **Flow.** Prospecting, Signals, Scoring, Segmentation, NBA or NBC, then execution and replies. Each stage receives everything from the stages before it.
2. **NBA or NBC rule.** After segmentation, a rule decides. If 10 or more accounts land in the same microsegment within a rolling 7 days, that segment is flagged for a campaign (NBC). Otherwise each account gets its own NBA. Make the threshold a setting.
3. **Five criteria.** The AI proceeds on its own with an account only when all hold: confidence is high; message verification passes; every protective check passes (exclusions, suppression, open deal, recent touch); identity tier is I1 or I2; the segment's autonomy policy allows it. Defaults: high confidence is 0.75 or more, medium 0.50 to 0.75, low under 0.50.
4. **What happens next.** All five met: the account shows "Ready to send" with a Send button (assisted mode, the default). Any criterion failed: an **approval card** naming the failed criterion. Low confidence: nurture. **An item that meets every criterion never gets an approval card.** Every NBC always goes to the sales manager and never starts without confirmation.
5. **Autonomy.** Per segment, assisted (the rep clicks send) or autopilot. Autopilot is off by default and can only be switched on in the admin screen after a "backtest passed" and "dry run passed" tick.
6. **Fail closed.** If a protective check cannot run, the action is held, not dropped, and the rep sees why. Add a "Simulate failure" panel in Admin with switches for CRM unreachable, exclusions unreadable, and a data source down, so a presenter can show this live.
7. **Escalations.** Every item that needs a person has an owner, a reason, a due time (3 days by default) and a default if nobody acts. An untouched approval card expires after 3 days and the account re-ranks.
8. **Tiers have three kinds, always named in full.** Signal tier 1, 2, 3. Account tier A, B, C. Identity tier I1 to I5.
9. **Everything cites its source.** Every signal links to a source and shows its evidence passage and date. Every claim in a draft maps to an approved claim or a cited passage.

10. **Three different things, only one is an escalation.** A **send click** (Ready to send, all five criteria met) is not an approval and has no card. An **approval card** is an escalation: it appears only when a criterion fails or something needs a person. A **campaign confirmation** by the sales manager is always required before any NBC starts. Once confirmed, a campaign runs without further manager approval, but before each touch the protective checks and message verification run again, and a failure holds that touch and escalates it to the owning rep.
11. **Escalations.** The full list is in `escalations.csv` (16 types: failed criterion for medium confidence, verification, identity tier I3 or I5 and segment policy; a protective check that cannot run; no draft; no verified channel; a campaign; a touch that fails its re-check; a held record; an unmatched reply; unclear niche or persona; unknown ICP; setup decisions; backtest below the bar; enabling autopilot). Each has an owner, a reason, a due time and a default. Show them in the escalation queue with those four fields. Not escalations: Ready to send, excluded accounts, low-confidence accounts (nurture), and discarded signals.

## 5. Logic to implement in code

**Signal tiers.** Tier 1: 100 points, full weight for 3 days, then linear decay to zero by day 14. Tier 2: 60 points, full weight for 14 days, then linear decay to zero by day 60. Tier 3: 30 points, full weight for 60 days, then linear decay to zero by day 90. A date in the signal text overrides the window ("budget frozen to April" expires at the end of April). Multiply the points by a strength factor (strength 1 to 5 maps to 0.6 to 1.0, with 3 as the default).

**Entry gate.** A repeat of the same signal type for the same account within 30 days counts at 0.5 (second), 0.25 (third) and 0.1 (fifth onward). The same event from several sources is one signal.

**Qualification filter.** A signal counts only if it is observable (verifiable from a public source), predictive (a documented link to buying) and time-bound (a finite window). Discard otherwise and record which test failed. Show discarded signals in a debug view.

**Timing.** Sort live signals by decayed score, strongest first: `Timing = S1 + 0.5 x S2 + 0.25 x S3 + 0.125 x S4 ...` with no cap.

**Rank.** `Rank = Fit x Timing`. An account with no live signal ranks 0 and is not queued. Account tier by percentile of rank among accounts with rank above 0: A top 15%, B next 25%, C the rest.

**Worked example (must reproduce).** Fit 80. Three live signals after decay: 34.5, 6.25, 2.1. Timing = 34.5 + 0.5 x 6.25 + 0.25 x 2.1 = 38.15. Rank = 80 x 38.15 = 3,052. Fit 95 with no live signal ranks 0.

**Confidence.** Combine identity tier, number of independent sources, strength and evidence quality into 0 to 1, then apply the bands above. Show the factors on hover.

**LinkedIn engagement signals.** Comments, likes and shares are signals, judged by content in context. Seed each with the post text and the comment text, and a relevance judgement note. A like on an unrelated post is discarded at the qualification filter. A comment asking a question on a relevant post is strong. Proposed signal tiers: comment 2, share with comment 2, share 3, like 3.

**Identity tiers.** I1 Apollo first try. I2 ZoomInfo after Apollo missed, Lusha agrees. I3 ZoomInfo fallback, Lusha silent. I4 ZoomInfo fallback, Lusha disagrees (held, never shown as sendable). I5 Lusha only. Only I1 and I2 meet the identity criterion.

**NBC sequence.** Three touches: day 0 plain text referencing the shared trigger; day 3 to 5 a message that reinforces the angle and cites an existing asset or statistic from the Knowledge Hub; day 7 to 10 a direct ask referencing both. Each touch has its own message, channel and timing. Confirmed by a manager, then three scheduled tasks per account owner. A logged reply removes that account's pending touches. No answer in 3 days falls back to individual NBAs.

## 6. Screens to build

Build these as real, working screens on seeded data (this is R1).

1. **Morning queue (rep).** Rank order, Tier A and B. Each row: rank, account, account tier, why line, confidence, top three signals with source links, contact (name, persona, identity tier), channel, draft preview, status (Ready to send, Needs your decision, Nurture, Held with reason). Actions: Send, open account, why, skip.
2. **Account page.** Tier, rank, fit, timing, confidence, why line, score breakdown (fit criteria and stacked signals with decayed weights, drawn as a small bar chart), timeline from first touch to today, contacts and personas, holds and exclusions, next step.
3. **Approval card.** The failed criterion named at the top, the draft with an edit box, signals cited, due date and the default. Approve, edit, skip. Store the edit as a diff.
4. **Campaign card (manager).** Segment and shared trigger, the accounts and owners, the three touches, confirm or edit or decline, due date and default.
5. **Escalation queue.** Every item for the current role with owner, reason, due time, default.
6. **Admin.** ICP (path A: pasted ICP shown as criteria; path B: only the website entered, then a proposed ICP and a sample list appear, nothing searched until confirmed), exclusions with reason and date, Content Library (voice and tone, approved claims with source and review date, banned phrases, templates), confidence bands, campaign threshold, autonomy policy per segment, simulate failure switches, connector status, run log with cost.
7. **Backtest report.** 15 won, 15 lost, 15 random accounts with the tier each lands in and the three bars with pass or fail. Computed from the seed.
8. **Chat.** A single input with five working questions: what should I work on today; why is this account ranked here; show me this account's history; what needs my decision; what is this campaign. Answers are cards, matched by simple intent rules (no LLM needed).
9. **Slack and Teams push preview.** Two mock notification cards with a link into the app.

Build these as **labelled demo screens** (tag "Demo data", seeded, not driven by the rules above), because they ship in R2 or R3:
- Reply statuses (Hot, Further action, Not now, Wrong person, Disqualified, Opted out) and the "who replied" workflow.
- Funnel per 100 accounts and prioritised against the rest, and the rep, manager and leader scorecards.
- Generated assets (one-pager, deck) with citations.
- First-party signals (website visit, content download, email click) and fast lane.
- Learning ("what the system learned"), pattern cache, quota plan.
- Research agent: rival complaint themes matched to our proof.

Show a "Coming" tile for anything else in `feature_map.csv` that is not R1.

## 7. The seed data

Create `seed/` with JSON files. Industrial and energy, anonymised.

- **100 accounts** with niche (plant or process type), region, size, attributes for fit scoring. About 60 have at least one live signal. Spread ages so tiers and decay show.
- **About 250 contacts** across personas: buyer, technical lead, operations, procurement. Include identity tiers I1 to I5 in realistic proportions (mostly I1 and I2).
- **About 150 signals** drawn from `signals.csv`: market, company, competitor, personal, and LinkedIn engagement. Each has a source name and URL (use placeholder URLs), evidence passage, event date, strength, signal tier and persona. Include 15 that fail a filter test, for the debug view.
- **Exclusions:** 8 customers, 3 competitors, 2 paused segments, 1 do-not-contact.
- **Content Library:** 20 approved claims with source and review date, 12 banned phrases, a voice and tone guide, 5 case-study passages for citation.
- **45 backtest cases:** 15 won, 15 lost, 15 random with a known outcome. Seed them so the result lands near 12 of 15 won in Tier A or B and at most 3 of 15 lost, with a switch that degrades the rules so the failure state can be shown.

**Ten scenarios that must be clickable (seed one account or group for each).**

1. Cold start, ICP shared: admin pastes an ICP, confirms, the list builds, enrichment spend equals the number of accounts that passed the fit check.
2. Cold start, ICP unknown: admin enters only a website, the AI proposes an ICP and a sample list, nothing is searched until the admin confirms.
3. Signal to action: a funding event for a target account, contact I1, all criteria met, shown as Ready to send; sending logs a send row with its signals.
4. Failed criterion: the same but the contact is I3, so an approval card names identity tier; editing stores a diff.
5. Exclusion: a customer account with strong signals never reaches the queue.
6. Campaign: 11 accounts in one microsegment within 7 days raise one campaign flag; the manager confirms; tasks appear for each owner; logging a reply on one account removes its pending touches; make one account's contact become excluded between touches so its next touch is held and escalated to the rep.
7. Fail closed: switch on "CRM unreachable"; nothing is routed and the rep sees the reason.
8. LinkedIn engagement: a question-comment on a relevant post becomes a strong signal with a relevance note; a like on an unrelated post is discarded.
9. Opt-out: the rep adds an opt-out and the contact disappears from every queue.
10. Timeout: an approval card left for 3 days (provide a "advance time by 3 days" control) expires and the account re-ranks.

## 8. Suggested build order

1. App shell, role switcher, brand, seed loader, config flags.
2. Scoring engine (decay, gate, filter, stacking, rank, tiers, confidence) with unit tests that reproduce the worked example.
3. Morning queue, account page, chat.
4. Criteria engine, approval cards, escalation queue, fail-closed switches.
5. NBC rule and campaign card.
6. Admin, backtest report.
7. Demo-data screens and Coming tiles.
8. Polish: the presenter's 12-step path below, loading states, empty states.

## 9. The presenter's path (12 steps)

1. Rep opens chat: "What should I work on today?" Ranked queue.
2. Opens one account: timeline with stacked, dated, cited signals.
3. Opens the context graph view: people, account, deals, signals and actions linked.
4. Asks "Why is this Tier A?" Fit and timing breakdown, which signals counted and which expired.
5. Opens the next best action: who, what, channel, why now, a draft, signals cited.
6. A criterion fails (identity tier): approval card, one edit, logged.
7. Sees a Ready to send item: sends, the send is logged with its cause.
8. Manager view: a campaign flag for 11 accounts; confirms the three touches.
9. Admin: simulate the CRM going down; nothing is sent, the reason is shown.
10. Demo data: replies sorted into six statuses, then the funnel per 100 and prioritised against the rest.
11. Demo data: "what the system learned".
12. Leader asks "How far are we from quota?" Demo data plan with named accounts.

## 10. Files in this pack

- `R1_feature_spec.md`: every R1 feature with why, input, output, rules, failure handling and acceptance.
- `feature_map.csv`: all 131 features across R1, R2 and R3, with a column saying how the prototype treats each.
- `escalations.csv`: every escalation with its owner, trigger, decision, due time and default.
- `signals.csv`: every signal with level, source or API, capture, signal tier and release.
- `connectors.csv`: every connector with access and fallback.
- `Demand_AI_Feature_Mapping.xlsx`: the same data in sheets, with pipeline, human in the loop, data model and the 38 concepts.
- `brand/`: logos.

## 11. Assumptions to confirm with the product owner

- Whether the prototype should call a language model for drafts, or use pre-written seeded drafts (default: pre-written, with a config flag for an API key).
- The source for LinkedIn engagement signals is not agreed; the prototype shows it as seeded data.
- Proposed defaults (decay shapes, strength factors, tier cut-offs, confidence bands, 3-day expiry) are starting values and are all in config.
