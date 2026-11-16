# Boundary-value test set

18 invented accounts, in pairs either side of a point where a rule flips. Score date **16 Nov 2026**, default settings, all AI off.

| Pair | Boundary | Expected |
|---|---|---|
| BV01 / BV02 | Fit floor 50 | Fit 50 passes (tier B); fit 49 is below the floor |
| BV03 / BV04 | Tier A cut-off 35 | Inquiry 43 days old: 35.6, tier A; 44 days: 34.9, tier B |
| BV05 / BV06 | Tier B cut-off 20 | Webinar 70 days old: 20.0, tier B; 71 days: 19.8, tier C |
| BV07 / BV08 | Inquiry window 90 days | 89 days: counted; 90 days: rejected |
| BV09–BV10 / BV11–BV13 | Segment minimum 3 | 2 leadership accounts: "Segment too small"; 3 capital-project accounts: Project segment |
| BV14–BV18 | Consent and reach | Opted out: excluded. Opt-out blank, no consent basis, no usable channel: held back. Unverified email with LinkedIn: LinkedIn |

Files: `Boundary_1_Prospects.xlsx`, `Boundary_2_Signals.xlsx`, `Boundary_3_Answer_key.xlsx` (30 engine checks, all PASS against the latest app code). Rebuild: `scripts/make_boundary.py`, `scripts/run_pack.mts`, `scripts/build_boundary_key.py`.
