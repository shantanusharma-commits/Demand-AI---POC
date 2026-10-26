# Upload test pack

48 small Excel files (.xlsx), one use case each, to drag and drop into the POC as they are. Open **`Expected_Results.xlsx`** next to the POC: the "Files" sheet lists every file, how to run it and what you should see, and the other sheets give the expected result row by row. Every company, person and domain is invented.

Set **Score as of** to **2026-10-20** for every Scoring upload, unless the workbook gives another date.

## 1-Prospecting: drop on the Prospecting upload box

Each list has its own signal file, with the same name plus `_SIGNALS` (one signal for each person on that list), for carrying the list on into Account Scoring. P16, P19 and P20 load nothing, so they have none. `../Prospect_to_Signal_Map.xlsx` pairs every prospect list in all three packs with its signal file.

| File | Use case |
|---|---|
| P01 | A clean list: nothing flagged |
| P02 | Email problems: malformed, spaces, two @, capitals, verified written TRUE / yes / N / blank |
| P03 | LinkedIn problems: company page, not LinkedIn, URL forms; no email and no LinkedIn |
| P04 | Duplicates: same email in capitals, same LinkedIn in another form, same name with a different email, an email reused at another company |
| P05 | Consent bases and opt-out values; an account where everyone opted out |
| P06 | Pilot region: the six countries, lower case, extra spaces, "SG", Australia, blank |
| P07 | Managed separately and existing customer: Y, N, Yes, blank, invalid |
| P08 | Company size: commas, $, USD, "2.4bn", headcount only, nothing, "n/a" |
| P09 | Account types, blank, and one not on the list |
| P10 | Industry and site classification: core, adjacent, other, conflicting, site only |
| P11 | Job titles: which count as primary, secondary or no persona |
| P12 | Owner rep: Rep A, Rep B, capitals, blank, a name, a bad email |
| P13 | Company details that differ between rows of the same company |
| P14 | Required values blank or badly written; a row with no company name is not loaded |
| P15 | Columns missing from the file (owner, consent, opt-out) |
| P16 | No company_name column: file not processed |
| P17 | The template layout: title row, "First Name*" headers, hints row, extra columns |
| P18 | An Excel workbook with several sheets: must pick "Lead template" |
| P19 | Wrong file: a signal file dropped into Prospecting |
| P20 | Headers only |
| P21 | Columns in a different order |
| P22 | Commas, quotes and accents inside values |

## 2-Account-Scoring and 3-Signal-rules: one list, many signal files

Upload **`S00_prospect_list_for_scoring_and_signals.xlsx`** once (Account Scoring > New scoring > "Upload a prospect file"). Then, with that list chosen, drop each S or G file on box 2.

| File | Use case |
|---|---|
| S01 | A realistic mix: tiers A, B and C, the watch list, below the fit floor, excluded; also scored on two later dates |
| S02 | Tier cut-offs: scores of exactly 35 and 20, and just under each |
| S03 | The same signal for every account: score differences come only from fit |
| S04 | Several signals stacking: one person, two people, the same type on two dates |
| S05 | Knock-out: pilot product already installed |
| S06 | A signal file with no rows: everyone on the watch list |
| S07 | A signal from a person who opted out (known gap) |
| G01 | Every signal type, and Newsletter sign-up (rejected); also the Setup switch-off test |
| G02 | Matching the company: capitals, spaces, "Ltd", unknown, blank, excluded |
| G03 | Matching the person: email, capitals, LinkedIn, unknown (suggested new contact), blank (auto-assigned) |
| G04 | Event dates typed as text: wrong forms, blank, 30 February, future, the scoring date itself |
| G05 | Signal type spelling: lower case, capitals, misspelt, not on the list, "RFQ", blank |
| G06 | Duplicate signals and near-duplicates |
| G07 | How long each signal type counts: the last day and the first stale day, for all nine types |
| G08 | How weights fade from full to zero |
| G09 | Blank detail, source and product |
| G10 | A missing detail column, extra columns, columns in another order |
| G11 | No signal_type column: file not processed |
| G12 | Wrong file: a lead file dropped into the signal box |
| G13 | An Excel workbook with several sheets: must pick "Signal template" |
| G14 | Signals for excluded and below-floor accounts: "Not used" |

## 4-Micro-segments-and-Review: pairs for the modules that take no file

Micro-segments & NBA, For Review, Today and Analytics take no upload of their own: they work on what Scoring produces. Each file here has a "Lead template" and a "Signal template" sheet: upload it in Account Scoring as the prospect list, drop the same file as the signals, then send it on. The per-account answer keys are in `../poc-test-sets` (TS6, TS8, TS9, TS10).

| File | Use case |
|---|---|
| N01 | Which micro-segments form, fallbacks, exceptions |
| N02 | Channel choice and who cannot be reached |
| N03 | Each reason an item goes to For Review, and when it is due |
| N04 | Which role sees which item |

## Rebuilding

```bash
python3 scripts/make_pack.py . /tmp/pack.json /tmp/scenarios.json   # the last argument is optional (folder 4)
node scripts/run_pack.js . /tmp/pack.json /tmp/pack_results.json
python3 scripts/build_expected.py /tmp/pack.json /tmp/pack_results.json .
```

For folder 4, first write it with `python3 ../poc-test-sets/make_scenarios.py /tmp/scenarios.json`.
