# Golden datasets v2 (remediation branch)

Three sets, each uploaded the normal way: `_1_Prospects.xlsx` in Prospecting, `_2_Signals.xlsx` in Scoring (score date **30 Oct 2026**), then the steps in the answer key.

| Set | Tests | Accounts |
|---|---|---|
| `Golden_A_Scoring` | Fit x timing, signal stacking and decay, tiers A/B/C, Watch list, stale and rejected signals, knock-out, fit floor, opt-out, consent held back, name-variant matching, unmatched company | 16 |
| `Golden_B_Segments_NBA` | All segments, the 3-account minimum (Leadership does not form), action, channel (LinkedIn-only), claim per segment, strongest signal and person win, tier C not handed off | 19 |
| `Golden_C_For_Review` | Exception queue (low confidence, deal size, unverifiable claim, segment too small), Approvals (sensitive, and sensitive with a second reason), rewritten once then released, unreachable held back at hand-off | 16 |

Each `_3_Answer_key.xlsx` has the steps, the expected result per account, the draft text, the file issues and an **Engine check** sheet: every design expectation compared with what the branch's engine did (all PASS).

Claims are for the starting brand pack. With extra claims in the live Content library (for example a claim that fits every segment), the claim on Inquiry and Leadership items can differ; Leadership items that are tasks here would become emails.

Rebuild: `python3 scripts/make_golden_v2.py . spec.json`, `node --experimental-strip-types scripts/run_golden_v2.mts <branch checkout> spec.json > results.json`, `python3 scripts/build_answer_keys.py . spec.json results.json`.
