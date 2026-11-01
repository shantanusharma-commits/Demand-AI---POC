# Round 2 datasets: realistic client-style lists

The first round (`../upload-test-pack`, `../poc-test-sets`) checks one rule per row. These sets look like real client files instead: many accounts, the usual gaps, and a business story each. Every company, person and domain is invented.

Each workbook holds both files: drop it in Prospecting (it reads **Lead template**), then drop the same file as the signal file in Account Scoring (it reads **Signal template**). Each one has a **How to use** sheet, **Answer key - summary** (what to see at each step) and **Answer key - accounts** (every account's fit, score, tier, segment, action and For Review reasons). **`Round2_Guide.xlsx`** lists the sets with columns for status, timings and gap IDs.

| Set | File | Size | What it is for |
|---|---|---|---|
| R1 | `R1_Smoke_test_small_clean.xlsx` | 12 accounts | A 10-minute check after every fix: clean data, all tier A, two segments, three exceptions |
| R2 | `R2_Pilot_list_week_1.xlsx` | 80 accounts, 271 rows, 140 signals | What the first real pilot file is likely to look like, with 5-10% gaps |
| R4 | `R4_Pilot_list_week_2.xlsx` | Same list, 162 signals | R2 a week later (as of 27 Oct): scores move, and accounts decided in R2 are set aside (engage-once) |
| R3 | `R3_Large_list_performance.xlsx` | 500 accounts, 1,797 rows, 673 signals | Performance: time each step |
| R5 | `R5_Installed_base_existing_customers.xlsx` | 30 accounts | Existing customers: end-of-support and renewal signals, several knock-outs |
| R6 | `R6_Net_new_marketing_engagement.xlsx` | 40 accounts | Net-new companies warmed up by marketing: weak signals, mostly B and C, one big Engagement segment |
| R7 | `R7_CRM_export_format.xlsx` | 25 accounts | A CRM export: title row, "First Name" headers, extra columns, Yes/No, revenue with commas, real Excel dates |

Suggested order: R1 after every fix, then R7, R2 and R4, R5 and R6, and R3 last.

## Rebuilding

```bash
python3 scripts/make_realistic.py . /tmp/spec.json
node scripts/run_realistic.js . /tmp/spec.json /tmp/results.json
python3 scripts/add_answer_keys.py . /tmp/spec.json /tmp/results.json
```
