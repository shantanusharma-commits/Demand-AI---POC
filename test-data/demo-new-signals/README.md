# New signals demo set (round 2)

A fresh list of 14 net-new accounts, none of them from the first cold-outbound set, so nothing is set aside as already engaged. This time the Admin sets the segments up in advance, so nothing needs approval for them.

| File | Use |
|---|---|
| `New_Signals_3_Answer_key.xlsx` | Sheets 1 to 3: the segments, signal types and actions the Admin adds in Setup first. Then the steps, the expected result per account, the task text, the signal rows and an engine check (43 checks, all PASS) |
| `New_Signals_1_Prospects.xlsx` | Prospecting: 14 accounts, 15 contacts |
| `New_Signals_2_Signals.xlsx` | Account Scoring (score date **9 Nov 2026**): 15 signal rows |

Expected:
- **Three segments form, each with its own first action:** New plants 3, Expanding teams 3, Talking about ageing systems 3. All 9 go ahead on their own.
- **One signal nobody set up:** "Contractor awarded" has 2 accounts and no segment, so both wait in For Review as "Segment too small". This is the AI and sales manager path.
- **Noise set aside:** a 150-day-old signal, a food company below the fit floor, an opted-out contact, and a signal for a company not in the list.

Every released item is a task for the owner, not an email, because a claim can't yet be tagged to a new segment (see the "For Shrihari" sheet). Results come from the latest POC engine (`scripts/run_new_signals.mts`). All names are invented.
