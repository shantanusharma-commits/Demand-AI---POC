# POC test sets

Twelve datasets and a list of 163 test cases (`POC_Test_Cases.xlsx`) for testing the POC module by module before 31 Oct 2026. Every company, person and domain is invented; the client is called "Client" and reps use `client-sample.com`. Each workbook has a **How to use** sheet and an **Answer key**.

Signal ages depend on the scoring date. Set **Score as of** to **2026-10-20** in Account Scoring and in Micro-segments & NBA, or the scores and tiers will differ from the answer key.

| Set | File | Size | Module | What it tests |
|---|---|---|---|---|
| TS1 | `TS1_End_to_end.xlsx` | 48 leads at 16 accounts, 17 signals, all clean | Prospecting → Scoring → Micro-segments & NBA → For Review → Today → Analytics | One list carried through every module. Expected: tiers A 4, B 8, C 2, watch list 1, below fit floor 1; segments Inquiry 3, Modernisation 3, Project 3, Engagement 4; one exception (Chao Phraya Refining) |
| TS2 | `TS2_Prospecting_edge_cases.xlsx` | 32 rows at 10 accounts | Prospecting | One data problem per row: bad emails, duplicates, opt-outs, consent, owners, numbers, domains, account types, region, managed separately, unmapped industry, details that differ between rows |
| TS3 | `TS3_Signal_edge_cases.xlsx` | 16 signal rows | Account Scoring (uses the TS1 list) | One signal rule per row: unknown company or person, missing, malformed or future dates, unknown type, newsletter, stale, duplicate, knock-out, auto-assigned person, mixed-case type, no detail |
| TS4 | `TS4_Microsegments_from_file.xlsx` | 12 prospects with signals | Micro-segments & NBA (file upload). **Optional** | Only for the NBA page's "Upload a CSV" route, for lists scored outside the POC. Micro-segments normally come from Scoring, which TS1 and TS6–TS10 cover. The route: scores from the file, scores worked out from signals, an out-of-range score, rejected signals, a segment that is too small to form |
| TS5 | `TS5_Brand_guideline.md` and `TS5_Brand_guideline_answer_key.xlsx` | 16 rules | Content library | Which rules are read from an uploaded guideline, and which lines are ignored |
| TS6 | `TS6_Segment_boundaries.xlsx` | 15 accounts, 18 signals | Scoring → Micro-segments & NBA | Which segments form: exactly 3 accounts, only 2, falling back to a next signal, a segment that would form only on second-best signals, Leadership and Service renewal. Expected: Inquiry 3, Service renewal 4, Leadership 3; 4 exceptions |
| TS7 | `TS7_Scoring_boundaries.xlsx` | 20 accounts, 23 signals | Account Scoring | Fit at 50 and 49, each part of the fit rubric, scores of exactly 35 and 20 and just under, decay at the edge of its window, stacking, knock-out, region |
| TS8 | `TS8_Contactability_and_channel.xlsx` | 10 accounts, 10 signals | Micro-segments & NBA, For Review | Email or LinkedIn, neither, no or unknown consent, opt-out not confirmed, an opted-out primary contact |
| TS9 | `TS9_For_Review_routing.xlsx` | 14 accounts, 14 signals | For Review, Today | One reason per item: deal size, low confidence, sensitive, unverifiable claim, brand rule, no way to reach them, segment too small, inquiry due the same day; 3 clean items that go ahead |
| TS10 | `TS10_Rep_ownership.xlsx` | 9 accounts | Roles (Sales rep vs Sales manager) | Rep A, Rep B, no owner, an owner who is not a user, an owner in capitals, an owner that is not an email |
| TS11 | `TS11_Score_date_answer_key.xlsx` | TS1 files on 5 dates | Account Scoring, Micro-segments | Signals fading over time: tiers and segments from 20 Oct 2026 to 20 Apr 2027 |
| TS12 | `TS12_Realistic_mixed_list.xlsx` | 60 accounts, 200 contacts, 67 signals | All modules | A realistic messy list for volume and robustness; the answer key gives counts per step |

The larger set in `../Lead_Research_Sample_Dataset.xlsx` (7,498 leads, 1,492 signals) stays the volume test.

## Why several chained sets

Micro-segments are built from the Scoring output, and Scoring needs the list saved in Prospecting. So TS6 to TS10 and TS12 each hold a lead sheet and a signal sheet for the same companies, and each runs Prospecting → Scoring → Micro-segments → For Review. Each set is designed around one part of the downstream rules, so a wrong segment, channel or review reason points at one rule.

## Known gaps the sets show

The engine was checked against what each account was designed to show. Three results differ, and they are marked as known gaps in the answer keys and in `POC_Test_Cases.xlsx`:

- **TS8 Hollis Refining:** opt-out left blank. Prospecting marks the contact not contactable, but Micro-segments still drafts an email to them.
- **TS8 Inglewood Refining and TS7 Rosewood Refining:** a contact who opted out still has their signal counted. The account is scored (B or A), but it gets no recommendation and never reaches For Review, so it drops out without a trace.

Also to confirm: the demo Sales rep is `rep.a@client-sample.com`, shown as Sofia Ahlgren, but the Users page lists her as `sofia.ahlgren@client.com`. Owner emails in a real file will not match a demo rep until the two are joined up.

## Why one end-to-end set and four small ones

The output of each module feeds the next, so TS1 is carried from Prospecting to Analytics. Account Scoring also needs a signal file that matches the same companies and people, so TS1 holds both a lead sheet and a signal sheet. The edge-case sets are kept separate and small: when a rule misbehaves, one row shows which rule it was. A dirty file carried end to end mixes problems from several stages.

## How the answer keys were made

`make_inputs.py` writes the rows, each designed to show one result. `run_engine.js` runs them through the POC's own rules (`legacy/demandai-engine.js`), and `build_poc_test_sets.py` writes the workbooks with the engine's results as the answer key. Every result was checked against what its row was designed to show before the files were written. To rebuild:

```bash
python3 make_inputs.py /tmp/ts_inputs.json
node run_engine.js /tmp/ts_inputs.json /tmp/ts_results.json
python3 build_poc_test_sets.py /tmp/ts_inputs.json /tmp/ts_results.json .
python3 make_scenarios.py /tmp/sc_inputs.json
node run_scenarios.js /tmp/sc_inputs.json /tmp/ts_inputs.json /tmp/sc_results.json   # reports any result that differs from its design
python3 build_scenarios.py /tmp/sc_inputs.json /tmp/sc_results.json /tmp/ts_inputs.json /tmp/ts_results.json .
```

One result to confirm with the business: TS2 row 33 gives the country as "SG". The rules match country names exactly, so the account is excluded as outside the pilot region. If "SG" should count as Singapore, log it as a gap.
