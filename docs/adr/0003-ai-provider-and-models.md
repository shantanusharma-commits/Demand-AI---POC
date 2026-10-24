# ADR 0003: AI behind one gateway; gpt-5.4 and gpt-5.4-mini

**Status:** Accepted. D-5 and D-6 (21 Oct), D-35 and D-40 (22 Oct), revised by D-44 (24 Oct 2026).

## Context

The spec hands some steps to AI: industry classification, the why-now line, first messages, Content studio writing and a Copilot. The prototype called a model from the browser. The pilot needs AI that can be switched off, never decides on its own, never leaks personal data or keys, and can be moved between providers.

## Decision

- **One server-only gateway** (`lib/ai/gateway.ts`); nothing else imports a model SDK (a test enforces it). Per call: the capability's flag, a circuit breaker, a concurrency limit, a timeout, retries with backoff on 429 and 5xx, content filters and refusals as known outcomes, validation with zod and the capability's own checks (grounding, claims, brand), one repair, and the rules as the fallback.
- **Provider-neutral** (D-35): Azure OpenAI (the `openai` package) or Amazon Bedrock (Converse), by `AI_PROVIDER`. Bedrock authenticates by IAM role; static AWS keys are refused.
- **Models** (D-44): gpt-5.4 as the main model and gpt-5.4-mini for the capabilities routed to it (`AI_SMALL_MODEL_FOR`, classification by default), on API version `2025-04-01-preview`, the newest the pilot's API Management gateway serves (it doesn't expose the v1 API). Strict JSON-schema structured outputs, reasoning effort per template (`AI_REASONING_EFFORT` overrides), temperature only at effort `none`. This replaced D-40's gpt-4o with JSON mode.
- **Metadata only** (D-6): one `ai_calls` row and one log line per call, never a prompt or a reply; personal data minimised (no names or emails to the model; people are tokens to Copilot).
- **Off by default.** Every capability has its own switch, off in production until the Client agrees its evaluation (docs/AI.md §4–5).

## Alternatives

- The v1 Azure API: preferred by Microsoft, but not served by the pilot's gateway.
- Everything on gpt-5.4-mini: it passed every check at a third of the cost, but the checks can't judge writing quality; left to the reviewers (one setting).
- Storing prompts and replies for review: declined (D-6) until retention is agreed.

## Consequences

- A model outage or a bad answer degrades to the rules, visibly; never to a wrong action.
- Changing models or providers is configuration plus an evaluation run; every call records the model that answered.
