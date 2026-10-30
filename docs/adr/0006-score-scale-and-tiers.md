# ADR 0006: Score scale and tiers

**Status:** Provisional, 21 Oct 2026 (D-9, D-12, D-13; G-046, G-048). The read-only rubric (D-13) was replaced on 30 Oct 2026 by an editable one with a lock (D-48): see the update below.

## Decision

- The score is 0–100 (the spec's rank ÷ 2) from fit × timing, with tiers at 35 (A) and 20 (B); below 20 with a live signal is C; a good fit with no live signal is the Watch list. The scale is labelled on screen and explained in the tier explainer.
- People are ranked ("prospect tier"), with the account's tier shown beside it.
- ~~The rubric, fit floor and personas are fixed and read-only for the pilot~~ (replaced by D-48, below); every list and run names its configuration version. Admins can switch signal types on or off (with a reason) and add types.

## Consequences

Stakeholders judge the scores in success area 2 (qualification accuracy); if they reject them in week 1, changing thresholds is a new configuration version, and frequency weighting is ready to design (ADR 0007).

## Update, 30 Oct 2026: an editable rubric with a lock (D-48)

The product owner asked for the scoring to be editable in Setup, so the pilot's team can tune it to what they see.

- **What an Admin edits:** the parts and their weights (which must add up to 100%), the level points, new parts that read a lead-file column with "value → points" rules, the fit floor, the tier cut-offs (35 and 20 to start), the size bands, the vertical levels and new verticals by keyword, the personas, the knock-outs and region, and each signal type's weight and half-life.
- **Before saving:** "Preview tier changes" shows how many accounts of the newest scored list would move tier.
- **Every save is a new configuration version,** with its changes in words and the reason. Settings apply where they act:
  - at Prospecting: personas, vertical words, region, and the managed and nobody-left knock-outs;
  - at Scoring: parts, weights, levels, bands, floor, tiers, the installed knock-out and signal weights.
  - Lists and runs already made keep their version, and Analytics splits G2 by version.
- **The lock for the measurement weeks** takes the place of "read-only":
  - *open*;
  - *locked*: a save is refused until someone unlocks it;
  - *open only with the sponsor's sign-off*: a save must name the sponsor who signed it off.

  Changing the lock is a configuration version too.

Consequence: the scale and the tiers above are the starting values, not fixed ones. A reading of G2 or the tiers always names the configuration version it was made with.
