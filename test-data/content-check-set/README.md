# Content check set

Shows the Content library edits (newsletter claim, "Just checking in" in openers to avoid, email length 150, PPT guideline) in real drafts on the remediation branch.

| File | Upload where |
|---|---|
| `Content_Check_1_Prospects.xlsx` | Prospecting: 20 refining accounts, 38 contacts (2 LinkedIn-only) |
| `Content_Check_2_Signals.xlsx` | Scoring: 20 signals, 3 or 4 per micro-segment, all six segments |
| `Content_Check_3_Answer_key.xlsx` | Not uploaded: steps, the expected segment, action, claim and route per account, full draft text with and without the edits |

The expected results come from the branch's own engine (`scripts/run_content_check.mts`), not from hand calculation. All company, person and domain names are invented.

Rebuild: `python3 scripts/make_content_check.py . spec.json`, then run `run_content_check.mts <branch checkout> spec.json` (and again with `base`), then `build_answer_key.py`.
