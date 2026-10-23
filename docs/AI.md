# AI in DemandAI

What the AI does, what it is sent, what it is never allowed to do, how it falls back, and how it is evaluated. Written for the Client's reviewers, the DevOps team and whoever switches a capability on.

**Short version.** Five capabilities can use a language model. Each is off unless its switch is set, and each has the rules as its fallback: when a switch is off, the model is slow, failing or filtered, or an answer fails the checks, the rules answer and the screen says so. Only what each call *was* is kept (capability, template, timing, tokens, outcome), never what was asked or answered. A model never changes data: people decide.

## 1. Where calls go

All model calls go through one server-only module, `lib/ai/gateway.ts`. No other code imports a model SDK (a test enforces it).

| Setting | Meaning |
|---|---|
| `AI_PROVIDER` | `none` (default: rules only), `azure-openai` or `bedrock` |
| `AZURE_OPENAI_ENDPOINT` | The resource endpoint, or the API Management gateway in front of it. An endpoint whose path ends in `/openai` is used as the base URL as it is. https only (http is accepted for 127.0.0.1, for a local stand-in). |
| `AZURE_OPENAI_API_KEY` | The key. Never logged, never shown; the Setup panel shows only the header name. |
| `AZURE_OPENAI_AUTH_HEADER` | `api-key` (default) or `Ocp-Apim-Subscription-Key` for API Management front doors. The key is sent in that header only. |
| `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` | The chat deployment (`gpt-4o`, model 2024-05-13) and API version (`2024-06-01`, D-40). |
| `AWS_REGION`, `BEDROCK_MODEL_ID` | Bedrock through the Converse API (D-35). Credentials come from the IAM role the app runs under (EKS Pod Identity or IRSA, an EC2 instance profile); with `AI_PROVIDER=bedrock` the app refuses to start if `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` is set. |
| `AI_TIMEOUT_MS`, `AI_MAX_CONCURRENCY` | 30 s per attempt; at most 4 calls at once per process (a big job can't starve the screens). |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` | USD per million tokens for the cost estimate kept with each call (defaults 5 and 15, gpt-4o 2024-05-13 list prices; set the agreed price). |

API version 2024-06-01 with gpt-4o 2024-05-13 has no `json_schema` structured outputs, so JSON calls use JSON mode and the gateway validates every reply with zod.

**Hosting and training.** The Azure OpenAI resource (or the Bedrock region) is the Client's or the delivery team's choice; record its region here once it is known. Microsoft's data-privacy terms for Azure OpenAI, and AWS's for Bedrock, say prompts and completions are not used to train the models; confirm against the current terms and the resource's abuse-monitoring settings before the pilot.

## 2. What the gateway does on every call

1. The capability's switch and a configured provider, or nothing is sent and nothing is recorded.
2. A circuit breaker: after 5 failed calls in a row the rules answer for 60 s, then one trial call decides.
3. The per-process concurrency limit; a caller that can't get a slot before its deadline gets the rules ("busy").
4. A timeout per attempt, and up to 3 retries on 429 and 5xx with full-jitter backoff that honours `retry-after` (a wait longer than 20 s is not taken), all inside the caller's overall deadline. 400s and refused keys are not retried.
5. A content-filter result (on the prompt or the reply) is a known outcome: the rules answer, and only the category names are logged.
6. JSON is parsed and validated, then the capability's own checks run. One repair call quotes what was wrong; if that fails too, the rules answer and the reason is recorded.
7. One row in `ai_calls` and one log line (`event: ai.call`) per call: capability, template ID and version, provider and deployment, latency, tokens, attempts, outcome (`ok`, `fallback`, `filtered`, `error`), fallback reason, filter categories, cost estimate, our request ID and the provider's. No prompt, no reply (D-6).

## 3. The capabilities

Every prompt is in the code, with its template ID and version; a new wording is a new version, recorded on every call.

| Capability | Switch | Template | Where | What the model does | What it is sent | Checks, then fallback |
|---|---|---|---|---|---|---|
| Industry classification (spec 3.4) | `AI_FEATURE_CLASSIFY` | `classify.industry` v1 (`lib/ai/classify.ts`) | The lead job, for accounts the mapping table doesn't match | Picks one of Refining, Petrochemicals, Gas processing, Other, Out of ICP, with a confidence | The industry and site-process texts only, 25 per call; no company or person | Every item answered once, from the list. The table and the exclusions always decide first; a person's choice always wins; below high confidence the account stays in "needs review". Answers are kept per unit and text (`ai_verticals`) so rebuilds agree. Fallback: "Other, for review". |
| Why-now line (spec 4.14) | `AI_FEATURE_WHY_NOW` | `whynow.line` v1 (`lib/ai/why-now.ts`) | The scoring job, for tier A and B prospects with a live signal | One sentence on why to contact them now | Job title, persona, the three strongest signal rows (row, type, date, detail, source); 10 prospects per call | The line must cite rows it was given, and every name, number, date and quote in it must be in those rows; no exclamation marks. One repair, then each line stands or falls alone. Fallback: the rules' line (always kept underneath). |
| First messages (spec 5.12–5.14) | `AI_FEATURE_DRAFTING` | `draft.message` v1 (`lib/ai/draft.ts`) | The micro-segment build (a job when this is on) | Subject, opening, bridge and ask, and the proof by claim ID | The action, job title, persona, vertical, existing customer or not, the evidence signal, the brief, the approved unexpired claims for the case | The claim goes in word for word with its citation; greeting and sign-off come from the brand voice; `checkDraft` (banned words, competitors, tone, pricing, length, unsupported claims) and a grounding check. A sensitive term fails unless the rules' draft is sensitive too. One regeneration, then the rules' draft, with the reason in the decision log. Never for a task (no proof, D-10) or someone who can't be contacted. |
| Content studio writing (D-36) | `AI_FEATURE_CONTENT_STUDIO` | `content.piece` v1, `content.rewrite` v1 (`lib/ai/studio.ts`) | New pieces; chat requests the rules don't understand | Words each part of the layout; rewrites the parts asked about | The brief (topic, audience, type, length, tone, framework) and the text being changed | The layout, headings and proof are the writer's (approved claims word for word); `checkContent` and a numbers check (no statistic the brief doesn't give). A refusal (an unbacked claim) stays a refusal. One repair, then the rules' writer. |
| Copilot free text (G-013) | `AI_FEATURE_COPILOT` | `copilot.answer` v1 (`lib/ai/copilot.ts`) | Every working screen, for questions the rule answers don't cover | Answers in a few sentences from the screen's data | The screen's data as rows within row budgets (queue 60, approvals 40, recommendations 80, accounts 40, contacts 40, prospects 40), saying how many of how many were shown; people as tokens (P1, R1), also in the question and the last 8 turns; no emails or LinkedIn URLs | The answer must not claim to have changed, sent or approved anything, hold an email address or name someone not shown. One repair, then "I can't answer that from the data on this screen yet", with the reason. |

The health check (`POST /api/admin/ai/healthcheck`, Admin) makes one tiny call and reports ok, provider, deployment and latency.

### What people see

- **AI-assisted** with a confidence on every AI-made item: an account's vertical (the classifier's confidence), a why-now line (the strength of the strongest signal it cites), a first message (the draft's confidence from grounding, open flags and signal strength), a studio piece (High when every check passes and it cites an approved claim), a Copilot answer.
- How much the AI did and why the rest used the rules: on the Scoring run ("Why-now lines for tier A and B: N of M by AI"), the NBA build ("First messages: N of M by AI"), and the Setup panel (calls, outcomes, reasons, tokens and cost per capability, last 30 days).
- A person can always override: set an AI-chosen vertical, edit or reject an AI draft (an edited AI draft stays AI-assisted), rewrite a studio part.

### Copilot and Autopilot

Copilot answers the common questions from the rules, exactly and at once (what first, due today, groups by reason, runner-ups, track record, approvals, why an item is here, how to fix it, confidence, the account, the file's checks, tiers, unused rows, a prospect's score). Only other questions go to the model. Chats are not stored (retention is not approved): the browser keeps the conversation while the page is open.

A request to approve becomes an **Autopilot** plan the person confirms: it rates spot-checks that still pass every check and accepts exceptions whose only reason is below deal size. Sensitive content, unsupported claims, brand or rule checks, low confidence and anyone who can't be reached always stay with a person. Every item is checked again before it acts, logged under the person as "Accepted by Autopilot" with their instruction, never counted toward G2, and the run can be undone by the person who ran it. Spec 6.4 asks for no bulk accept; the developer guide keeps Autopilot for low-risk items, and the guide wins (remediation prompt §3.3). The Client should confirm.

## 4. Evaluation

**Method** (`lib/ai/evaluation.ts`, on the fictional sample in `test-data/`):

- Classification against the Account key's `true_vertical`, after the rules: the share of in-ICP accounts (Refining, Petrochemicals, Gas processing) with the right core vertical, target **≥ 95%** (to agree with the Client), and out-of-ICP accounts classified core, target **0**. Influencers (EPC, system integrators) should come out as Other.
- Why-now: how many tier A and B lines the model wrote that passed grounding, and how many fell back. Every line shown is grounded by construction; the measure is how often the model manages it.
- First messages: how many AI drafts passed every check, and how many fell back.

**Running it live:** put the Azure OpenAI (or Bedrock) settings in `.env.local`, then `AI_LIVE_SMOKE=1 npm run ai:evaluate`. It prints the table below for this file, and exits 2 if the classification target is missed. `AI_LIVE_SMOKE=1 npm run test:ai-live` runs the smoke test (one call per capability, fictional text). Neither runs in CI.

**In CI** (`tests/ai-evaluation.test.ts`): the scoring is proved with fake models: a classifier that knows the answers meets the target; one that calls everything Refining fails it, with 500+ out-of-ICP accounts called core. The contract, fallback, injection and personal-data tests are in `tests/ai-*.test.ts`, `tests/copilot.test.ts` and `tests/integration/{ai,copilot}.test.ts`.

### Results

No live run yet: the Azure OpenAI values are not in `.env.local` (a pending input). **Every capability stays switched off in production until its live evaluation is run, recorded here, and agreed.**

On the sample, with the rules only: 698 of 1,401 accounts need review (no table match). Of those, 697 are influencers or out of ICP by the key and 1 is in-ICP (Refining); the rules already put no out-of-ICP account in a core vertical. So the classifier's job on this data is mostly to say "Other" or "Out of ICP" with confidence, and never to call an out-of-ICP account core.

## 5. Switching a capability on

1. Configure the provider (section 1) and run the health check on Setup › AI service.
2. Run the live evaluation and the smoke test; record the results in section 4 with the date, the deployment and the template versions.
3. Agree the targets with the Client (classification: ≥ 95% in-ICP correct and no out-of-ICP core; why-now and drafts: the fallback share the reviewers accept).
4. Set its `AI_FEATURE_*` switch to 1 in the deployment's configuration and restart. Watch Setup › AI service for fallback reasons and cost in the first week; G2 measures how often people accept AI drafts.
5. A new prompt wording means a new template version and a new evaluation run.
