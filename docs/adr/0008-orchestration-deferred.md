# ADR 0008: Agentic orchestration is not in the pilot

**Status:** Deferred by user decision D-42 (22 Oct 2026). Gap G-058.

## Context

The spec (1.1) describes agents that run the whole flow on their own: upload, score, hand off, build, release.

## Decision

People start each step: upload, score, hand off, build micro-segments, decide in For Review. The AI words and checks inside those steps, and Copilot's Autopilot can rate or accept only low-risk items a person asks it to, re-checked, logged under that person and undoable. Nothing sends a message: sending stays on the roadmap.

## Roadmap

Orchestration would chain the existing jobs (lead upload → scoring → hand-off → build) on a schedule or a new file, under a service identity with an audit trail, with the same checks and the For Review gate before anything leaves. It needs the Client's agreement on what may proceed without a person, and the pilot's G2 evidence first.
