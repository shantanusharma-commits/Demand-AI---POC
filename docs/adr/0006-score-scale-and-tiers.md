# ADR 0006: Score scale and tiers

**Status:** Provisional, 21 Oct 2026 (D-9, D-12, D-13; G-046, G-048).

## Decision

- The score is 0–100 (the spec's rank ÷ 2) from fit × timing, with tiers at 35 (A) and 20 (B); below 20 with a live signal is C; a good fit with no live signal is the Watch list. The scale is labelled on screen and explained in the tier explainer.
- People are ranked ("prospect tier"), with the account's tier shown beside it.
- The rubric, fit floor and personas are fixed and read-only for the pilot; every list and run names its configuration version. Admins can switch signal types on or off (with a reason) and add types.

## Consequences

Stakeholders judge the scores in success area 2 (qualification accuracy); if they reject them in week 1, changing thresholds is a new configuration version, and frequency weighting is ready to design (ADR 0007).
