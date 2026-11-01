# Cold outbound demo set

Net-new prospects whose signals are behaviour, not engagement with our content: a team expanding, a new plant announced, a public LinkedIn comment. Shows the system capturing new kinds of signals and turning them into segments, next best actions and ready emails.

| File | Use |
|---|---|
| `Cold_Outbound_1_Prospects.xlsx` | Prospecting: 12 net-new accounts, 13 contacts |
| `Cold_Outbound_2_Signals.xlsx` | Account Scoring (score date **2 Nov 2026**): 13 behaviour signals |
| `Cold_Outbound_3_Answer_key.xlsx` | Sheet 1: the three signal types the Admin adds in Setup first. Then the steps, the expected result per account, the email text and an engine check (all PASS) |

Expected: Project 6 (new plants, growing teams) and Modernisation 3 (LinkedIn comments), all 9 released on their own; three accounts set aside as noise (stale comment, retail warehouse, opted-out contact). Results come from the remediation branch's engine (`scripts/run_cold_outbound.mts`) with the starting brand pack. All names are invented.

## New segments and new actions (no AI needed)

`Cold_Outbound_4_New_Segments_Kit.xlsx` walks through it: a small seed list (`Cold_Outbound_0_Seed_Prospects.xlsx` + `Cold_Outbound_0_Seed_Signals.xlsx`, three companies not in the main list) lands in For Review as "Segment too small", where you create the three segments; then you map the signals to them in Setup, add six actions, and build the main list. Expected (engine-checked): New plants 3, Expanding teams 3, Talking about ageing systems 3, each with its new first action. Each item is a task, not an email, until approved claims can be tagged to new segments (or AI drafting is on): see the kit's "For Shrihari" sheet.
