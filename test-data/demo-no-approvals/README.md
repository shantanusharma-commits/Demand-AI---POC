# No-approvals demo set

19 net-new and existing-customer refinery accounts where nothing needs approval. It uses only built-in signal types, segments and actions, so there is nothing to add in Setup and nothing new for anyone to approve. Every account goes ahead on its own.

| File | Use |
|---|---|
| `No_Approvals_3_Answer_key.xlsx` | How to run, the expected result per account (ranked), the draft text, and an engine check (38 checks, all PASS) |
| `No_Approvals_1_Prospects.xlsx` | Prospecting: 19 accounts, 20 contacts |
| `No_Approvals_2_Signals.xlsx` | Account Scoring (score date **9 Nov 2026**): 22 signal rows, all qualified |

Expected: scores from 59.2 (Bluefin: quote request and webinar) down to 20.5; 10 tier A, 9 tier B; 19 handed off; all six segments form (Project 4, Inquiry 3, Modernisation 3, Service renewal 3, Engagement 3, Leadership 3); the For Review queue and Approvals are empty. 16 emails cite an approved claim; the 3 Leadership items are tasks for the owner. Results come from the latest POC engine (`scripts/run_no_approvals.mts`). All names are invented.

## Round B (`round-b/`)

The same design with different company and people names. Run `python3 scripts/make_no_approvals.py round-b <spec.json> B`. Files: `Prospect_Data.xlsx`, `Signal_Data.xlsx`, `Answer_Key.xlsx`. Top account: Alderbay Refining 59.2. 38 engine checks, all PASS.
