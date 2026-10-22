# POC test sets

Five small datasets for testing the POC module by module before 31 Oct 2026. Every company, person and domain is invented; the client is called "Client" and reps use `client-sample.com`. Each workbook has a **How to use** sheet and an **Answer key**.

Signal ages depend on the scoring date. Set **Score as of** to **2026-10-20** in Account Scoring and in Micro-segments & NBA, or the scores and tiers will differ from the answer key.

| Set | File | Size | Module | What it tests |
|---|---|---|---|---|
| TS1 | `TS1_End_to_end.xlsx` | 48 leads at 16 accounts, 17 signals, all clean | Prospecting → Scoring → Micro-segments & NBA → For Review → Today → Analytics | One list carried through every module. Expected: tiers A 4, B 8, C 2, watch list 1, below fit floor 1; segments Inquiry 3, Modernisation 3, Project 3, Engagement 4; one exception (Chao Phraya Refining) |
| TS2 | `TS2_Prospecting_edge_cases.xlsx` | 32 rows at 10 accounts | Prospecting | One data problem per row: bad emails, duplicates, opt-outs, consent, owners, numbers, domains, account types, region, managed separately, unmapped industry, details that differ between rows |
| TS3 | `TS3_Signal_edge_cases.xlsx` | 16 signal rows | Account Scoring (uses the TS1 list) | One signal rule per row: unknown company or person, missing, malformed or future dates, unknown type, newsletter, stale, duplicate, knock-out, auto-assigned person, mixed-case type, no detail |
| TS4 | `TS4_Microsegments_from_file.xlsx` | 12 prospects with signals | Micro-segments & NBA (file upload) | The direct-upload route: scores from the file, scores worked out from signals, an out-of-range score, rejected signals, a segment that is too small to form |
| TS5 | `TS5_Brand_guideline.md` and `TS5_Brand_guideline_answer_key.xlsx` | 16 rules | Content library | Which rules are read from an uploaded guideline, and which lines are ignored |

The larger set in `../Lead_Research_Sample_Dataset.xlsx` (7,498 leads, 1,492 signals) stays the volume test.

## Why one end-to-end set and four small ones

The output of each module feeds the next, so TS1 is carried from Prospecting to Analytics. Account Scoring also needs a signal file that matches the same companies and people, so TS1 holds both a lead sheet and a signal sheet. The edge-case sets are kept separate and small: when a rule misbehaves, one row shows which rule it was. A dirty file carried end to end mixes problems from several stages.

## How the answer keys were made

`make_inputs.py` writes the rows, each designed to show one result. `run_engine.js` runs them through the POC's own rules (`legacy/demandai-engine.js`), and `build_poc_test_sets.py` writes the workbooks with the engine's results as the answer key. Every result was checked against what its row was designed to show before the files were written. To rebuild:

```bash
python3 make_inputs.py /tmp/ts_inputs.json
node run_engine.js /tmp/ts_inputs.json /tmp/ts_results.json
python3 build_poc_test_sets.py /tmp/ts_inputs.json /tmp/ts_results.json .
```

One result to confirm with the business: TS2 row 33 gives the country as "SG". The rules match country names exactly, so the account is excluded as outside the pilot region. If "SG" should count as Singapore, log it as a gap.
