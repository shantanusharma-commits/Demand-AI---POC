# Content library test for a new market

Tests the Content library end to end on the market set up in `../setup-from-scratch` (water treatment): claims, voice and tone, banned openers, negative keywords, competitors, length rules, plays, versions, and the brand and claim checks in Content studio and For Review. Everything is invented. Score date **16 Nov 2026**, all AI off.

| File | What it is |
|---|---|
| `Content_Test_Answer_key.xlsx` | 1 How to run · 2 What to enter · 3 Test cases CN-01 to CN-25 · 4 Expected result for every item after every change · 5 Full draft text · 6 Words to type and what the check should show · 7 Watch for |
| Prospects and signals | Use `../setup-from-scratch/Setup_Test_1_Prospects.xlsx` and `Setup_Test_2_Signals.xlsx`, after the Setup BASE |

Order: C0 (starting library) → C1 to C7 build on each other → C8 to C15 each start from C7 and are undone by restoring the C7 version.

The guideline-upload tests (rules read from .md, .txt, Word, PDF, PowerPoint) are in `../content-library-pack` (CL-01 to CL-11).

Every expected result comes from the latest app code's own engine (commit 65d6489), run with the same library:

```bash
python3 scripts/content_spec.py <setup spec.json> spec.json     # setup spec from ../setup-from-scratch/scripts/make_setup_pack.py
node --experimental-strip-types scripts/run_content.mts <app checkout> spec.json > out.json
python3 scripts/build_content_key.py spec.json out.json .
```
