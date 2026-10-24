# ADR 0007: Frequency weighting and timing modifiers are not in the pilot

**Status:** Deferred by user decision D-43 (22 Oct 2026), confirming D-11. Gap G-047.

## Context

The spec weights repeated signals of the same type and applies timing modifiers (for example a budget cycle or a turnaround window). The prototype implemented neither.

## Decision

Not built for the pilot. Scores use each signal type's weight and its decay with age, as the guide's tables give them, from the configuration version. The signal weights and windows already live in the versioned configuration (Setup shows them), not in code, so frequency weighting can be added as configuration keys and a rule in `lib/engine` without a schema change.

## When to revisit

If the validators reject the scores in pilot week 1 (success area 2), or the Client asks. The work: define the repeat weighting and modifiers with the Client, add them to the configuration with defaults that change nothing, extend the scoring rule and the answer key, and show them in the tier explainer.
