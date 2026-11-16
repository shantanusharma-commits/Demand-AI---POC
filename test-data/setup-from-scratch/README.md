# Setup-from-scratch test pack

Tests that Setup works from scratch: ICP rubric (new verticals, buying roles, a new rubric part and weights), signal types, micro-segments and actions. It uses a market the default settings don't cover (water treatment and desalination), so the results only come right if Setup is done right. 15 invented accounts, 16 signals, score date **16 Nov 2026**.

1. Score the list **before** any set-up: only 3 accounts score (sheet 3 of the answer key).
2. Enter everything on **sheet 2** (`2 Enter in Setup`) and re-score: Open tenders 5, Compliance deadline 5, Modernisation 3 (sheet 4).
3. Run **S1 to S13** one at a time: sheet 5 lists exactly which accounts change for each, and how. Everything else must stay the same. Then put the setting back.
4. Manual tests (invalid values, roles, audit log): sheet 6.

Every expected result comes from the latest app code's engine, run with the same settings (`scripts/run_pack.mts`).
