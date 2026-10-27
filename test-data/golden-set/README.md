# Golden dataset: Micro-segments & NBA and For Review

`Golden_NBA_and_For_Review.xlsx` is one workbook (a **Lead template** and a **Signal template** sheet) with 26 accounts. Each account is designed for one outcome. It runs the default way: Prospecting, then Account Scoring ("Send tier A and B to NBA"), then Micro-segments, then For Review. Every NBA and For Review rule shows up at least once. Every company, person and domain is invented.

Score as of **2026-10-20**. Start from a clean browser.

| Sheet | What it gives |
|---|---|
| How to use | The steps and what is covered |
| Golden - expected totals | What each step should show, for the sales manager and for a rep |
| Golden - accounts | Every account: tier, score, segment, action, runner-up, contact, channel, subject, confidence, owner, route, For Review reasons, due, deal size, known gap |
| Golden - review queue | Every item that needs a person: where it sits, why, due, owner, how to clear it |
| Review script | 25 click-by-click steps with what you should see, and a status column |

What it covers: the tier A/B hand-off, five segments plus one that cannot form, an account joining a segment on its next signal, runner-ups, two people at one account, email, LinkedIn and no-channel drafts, net-new and existing customers, Rep A and Rep B, sensitive items going straight to Approvals, the automatic rewrite after a brand check, every queue reason and due time, spot-checks, fix-it actions, reject codes R1, R4, R7 and R8, a second rejection, hold, edits, the decision log and engage-once. Two known gaps (G25, G26) are marked in yellow.

The answer key comes from reading the file the way the POC does and running it through `legacy/demandai-engine.js` and the routing in `legacy/demandai-nba.js`. The run, the queues and the decisions in the review script were also clicked through in the prototype.

## Rebuilding

```bash
python3 scripts/make_golden.py . /tmp/golden_spec.json
node scripts/run_golden.js . /tmp/golden_spec.json /tmp/golden_results.json   # reports any result that differs from its design
python3 scripts/build_golden.py . /tmp/golden_spec.json /tmp/golden_results.json
```
