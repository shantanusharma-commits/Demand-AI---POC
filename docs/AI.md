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
| `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` | The main chat deployment (`gpt-5.4`, serving `gpt-5.4-2026-03-05`) and the API version (`2025-04-01-preview`), D-44. The model that answers each call is recorded (`ai_calls.model`), because a deployment can serve another version than expected: D-40's `gpt-4o` served `gpt-4o-2024-08-06`, not 2024-05-13. |
| `AZURE_OPENAI_DEPLOYMENT_SMALL`, `AI_SMALL_MODEL_FOR` | The small model's deployment (`gpt-5.4-mini`, serving `gpt-5.4-mini-2026-03-17`) and the capabilities that use it (default `classify`). Without a small deployment every call goes to the main one. Each model has its own circuit breaker. |
| `AI_REASONING_EFFORT` | Reasoning effort per capability over each template's own (section 3), for tuning without a code change, e.g. `draft_message=low`. Every call records the effort it asked for. |
| `AWS_REGION`, `BEDROCK_MODEL_ID`, `BEDROCK_MODEL_ID_SMALL` | Bedrock through the Converse API (D-35); the small model ID plays the small deployment's part. Credentials come from the IAM role the app runs under (EKS Pod Identity or IRSA, an EC2 instance profile); with `AI_PROVIDER=bedrock` the app refuses to start if `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` is set. |
| `AI_TIMEOUT_MS`, `AI_MAX_CONCURRENCY` | 30 s per attempt; at most 4 calls at once per process (a big job can't starve the screens). |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`, `AI_PRICE_SMALL_INPUT_PER_MTOK`, `AI_PRICE_SMALL_OUTPUT_PER_MTOK` | USD per million tokens for the cost estimate kept with each call: defaults 2.50 / 15 (gpt-5.4) and 0.75 / 4.50 (gpt-5.4-mini), list prices as published by third-party price lists in Oct 2026. Set the Client's agreed Azure prices. Reasoning tokens are billed as output and counted in the estimate. |

**API version (D-44).** Microsoft's newest API is the v1 API (`/openai/v1/…`, no `api-version`, since August 2025), but the pilot's API Management gateway doesn't expose it (404), and dated versions after `2025-04-01-preview` (the last one Microsoft published) return 404 too. So the app uses `2025-04-01-preview` on the deployment path. With it, gpt-5.4 and gpt-5.4-mini take:

- `json_schema` structured outputs in strict mode: every JSON call sends its reply's schema, made from the capability's zod schema (`lib/ai/schema.ts`), so the model can't answer in another shape. Constraints strict mode doesn't take (lengths, counts, ranges) stay with zod, which still checks every reply; a schema strict mode can't express falls back to JSON mode.
- `reasoning_effort` (`none` … `xhigh`) and `max_completion_tokens`, with room added for the reasoning (it counts against the same limit). They refuse `max_tokens`, and refuse `temperature` unless the effort is `none`, so the app sends a temperature only then.

**Hosting and training.** The Azure OpenAI resource (or the Bedrock region) is the Client's or the delivery team's choice; record its region here once it is known (the API Management gateway used on 24 Oct 2026 doesn't report it). That gateway balances calls over three backends, allowed 4,500 requests and 450,000 tokens a minute for gpt-4o, and sends no request-ID header, so `providerRequestId` stays empty in `ai_calls` behind it. It sometimes answers 400 "API operation not supported for token authentication … not supported for CheckAccess" from one of its backends (on 24 Oct 2026: about one call in five during a burst, none in 120 calls at other times); the same call succeeds when repeated, so the app retries it like a server error. Worth raising with whoever runs the gateway (it looks like an access check failing on one backend). Microsoft's data-privacy terms for Azure OpenAI, and AWS's for Bedrock, say prompts and completions are not used to train the models; confirm against the current terms and the resource's abuse-monitoring settings before the pilot.

## 2. What the gateway does on every call

1. The capability's switch and a configured provider, or nothing is sent and nothing is recorded.
2. A circuit breaker: after 5 failed calls in a row the rules answer for 60 s, then one trial call decides.
3. The per-process concurrency limit; a caller that can't get a slot before its deadline gets the rules ("busy").
4. A timeout per attempt, and up to 3 retries on 429 and 5xx (and the gateway's CheckAccess 400, section 1) with full-jitter backoff that honours `retry-after` (a wait longer than 20 s is not taken), all inside the caller's overall deadline. Other 400s and refused keys are not retried.
5. A content-filter result (on the prompt or the reply) or a model's refusal is a known outcome: the rules answer, and only the category names are logged (`refusal` for a refusal).
6. JSON calls carry the reply's strict schema (section 1). Every reply is parsed and validated, then the capability's own checks run. One repair call quotes what was wrong (a reply cut off at the token limit also gets twice the room: under a strict schema the provider reports it as a 400); if that fails too, the rules answer and the reason is recorded.
7. One row in `ai_calls` and one log line (`event: ai.call`) per call: capability, template ID and version, provider and deployment, the model that answered, the reasoning effort, latency, tokens, attempts, outcome (`ok`, `fallback`, `filtered`, `error`), fallback reason, filter categories, cost estimate, our request ID and the provider's. No prompt, no reply (D-6).

## 3. The capabilities

Every prompt is in the code, with its template ID and version; a new wording is a new version, recorded on every call. Each template also sets its model and reasoning effort (D-44), chosen from the live runs in section 4:

| Capability | Model (default) | Reasoning effort |
|---|---|---|
| Industry classification | gpt-5.4-mini | `low` |
| Why-now line | gpt-5.4 | `none` |
| First messages | gpt-5.4 | `none` |
| Content studio writing | gpt-5.4 | `none` |
| Copilot free text | gpt-5.4 | `low` |
| Health check | each model in turn | `none` |

| Capability | Switch | Template | Where | What the model does | What it is sent | Checks, then fallback |
|---|---|---|---|---|---|---|
| Industry classification (spec 3.4) | `AI_FEATURE_CLASSIFY` | `classify.industry` v1 (`lib/ai/classify.ts`) | The lead job, for accounts the mapping table doesn't match | Picks one of Refining, Petrochemicals, Gas processing, Other, Out of ICP, with a confidence | The industry and site-process texts only, 25 per call; no company or person | Every item answered once, from the list. The table and the exclusions always decide first; a person's choice always wins; below high confidence the account stays in "needs review". Answers are kept per unit and text (`ai_verticals`) so rebuilds agree. Fallback: "Other, for review". |
| Why-now line (spec 4.14) | `AI_FEATURE_WHY_NOW` | `whynow.line` v1 (`lib/ai/why-now.ts`) | The scoring job, for tier A and B prospects with a live signal | One sentence on why to contact them now | Job title, persona, the three strongest signal rows (row, type, date, detail, source); 10 prospects per call | The line must cite rows it was given, and every name, number, date and quote in it must be in those rows; no exclamation marks. One repair, then each line stands or falls alone. Fallback: the rules' line (always kept underneath). |
| First messages (spec 5.12–5.14) | `AI_FEATURE_DRAFTING` | `draft.message` v2 (`lib/ai/draft.ts`) | The micro-segment build (a job when this is on) | Subject, opening, bridge and ask, and the proof by claim ID | The action, job title, persona, vertical, existing customer or not, the evidence signal, the brief, the approved unexpired claims for the case | The claim goes in word for word with its citation; greeting and sign-off come from the brand voice; `checkDraft` (banned words, competitors, tone, pricing, length, unsupported claims) and a grounding check. A sensitive term fails unless the rules' draft is sensitive too. One regeneration, then the rules' draft, with the reason in the decision log. Never for a task (no proof, D-10) or someone who can't be contacted. |
| Content studio writing (D-36) | `AI_FEATURE_CONTENT_STUDIO` | `content.piece` v1, `content.rewrite` v2 (`lib/ai/studio.ts`; v2 names every open part, null where it stays as it is, so structured outputs can enforce the reply) | New pieces; chat requests the rules don't understand | Words each part of the layout; rewrites the parts asked about | The brief (topic, audience, type, length, tone, framework) and the text being changed | The layout, headings and proof are the writer's (approved claims word for word); `checkContent` and a numbers check (no statistic the brief doesn't give). A refusal (an unbacked claim) stays a refusal. One repair, then the rules' writer. |
| Copilot free text (G-013) | `AI_FEATURE_COPILOT` | `copilot.answer` v2 (`lib/ai/copilot.ts`; v2 keeps two people of the same name apart and follows the saved chat and the prospect or item picked on the screen) | Every working screen, for questions the rule answers don't cover | Answers in a few sentences from the screen's data | The screen's data as rows within row budgets (queue 60, approvals 40, recommendations 80, accounts 40, contacts 40, prospects 40, rows held back by a finding 60), saying how many of how many were shown; people as tokens (P1, R1), one per person (two people called the same get two tokens and their rows), also in the question and the saved chat's last 8 turns; no emails or LinkedIn URLs | The answer must not claim to have changed, sent or approved anything, hold an email address or name someone not shown. One repair, then "I can't answer that from the data on this screen yet", with the reason. |

The health check (`POST /api/admin/ai/healthcheck`, Admin) makes one tiny call to each model and reports ok, provider, deployment and latency for each.

### What people see

- **AI-assisted** with a confidence on every AI-made item: an account's vertical (the classifier's confidence), a why-now line (the strength of the strongest signal it cites), a first message (the draft's confidence from grounding, open flags and signal strength), a studio piece (High when every check passes and it cites an approved claim), a Copilot answer.
- How much the AI did and why the rest used the rules: on the Scoring run ("Why-now lines for tier A and B: N of M by AI"), the NBA build ("First messages: N of M by AI"), and the Setup panel (calls, outcomes, reasons, tokens and cost per capability, last 30 days).
- A person can always override: set an AI-chosen vertical, edit or reject an AI draft (an edited AI draft stays AI-assisted), rewrite a studio part.

### Copilot and Autopilot

Copilot answers the common questions from the rules, exactly and at once (what first, due today, groups by reason, runner-ups, track record, approvals, why an item is here, how to fix it, confidence, the account, the file's checks, tiers, unused rows, a prospect's score). Only other questions go to the model. Each question and answer go into the person's saved chat about the record on the screen (`copilot_chats`, `copilot_messages`): private to them, carried on when they come back, listed under Saved chats, deletable, and removed by the end-of-pilot purge with the data they talk about (27 Oct 2026, the product owner's request; it replaces the earlier "chats are not kept"). A prospect (Scoring) or item (Micro-segments & NBA) picked on the screen is the chat's focus until another is picked or it is cleared; the chat stays the run's or the build's.

A request to approve becomes an **Autopilot** plan the person confirms: it rates spot-checks that still pass every check and accepts exceptions whose only reason is below deal size. Sensitive content, unsupported claims, brand or rule checks, low confidence and anyone who can't be reached always stay with a person. Every item is checked again before it acts, logged under the person as "Accepted by Autopilot" with their instruction, never counted toward G2, and the run can be undone by the person who ran it. Spec 6.4 asks for no bulk accept; the developer guide keeps Autopilot for low-risk items, and the guide wins (remediation prompt §3.3). The Client should confirm.

## 4. Evaluation

**Method** (`lib/ai/evaluation.ts`, on the fictional sample in `test-data/`):

- Classification against the Account key's `true_vertical`, after the rules: the share of in-ICP accounts (Refining, Petrochemicals, Gas processing) with the right core vertical, target **≥ 95%** (to agree with the Client), and out-of-ICP accounts classified core, target **0**. Influencers (EPC, system integrators) should come out as Other.
- Why-now: how many tier A and B lines the model wrote that passed grounding, and how many fell back. Every line shown is grounded by construction; the measure is how often the model manages it.
- First messages: how many AI drafts passed every check, and how many fell back.

**Running it live:** put the Azure OpenAI (or Bedrock) settings in `.env.local`, then `AI_LIVE_SMOKE=1 npm run ai:evaluate`. It prints the table below for this file, and exits 2 if the classification target is missed. `AI_LIVE_SMOKE=1 npm run test:ai-live` runs the smoke test (one call per capability, fictional text). Neither runs in CI.

**In CI** (`tests/ai-evaluation.test.ts`): the scoring is proved with fake models: a classifier that knows the answers meets the target; one that calls everything Refining fails it, with 500+ out-of-ICP accounts called core. The contract, fallback, injection and personal-data tests are in `tests/ai-*.test.ts`, `tests/copilot.test.ts` and `tests/integration/{ai,copilot}.test.ts`.

### Results

**Every capability stays switched off in production until its results are agreed with the Client (section 5, step 3).**

#### Live runs with gpt-5.4 and gpt-5.4-mini, 24 Oct 2026 (D-44)

Azure OpenAI through the same API Management gateway: deployments `gpt-5.4` (served `gpt-5.4-2026-03-05`) and `gpt-5.4-mini` (served `gpt-5.4-mini-2026-03-17`), API version `2025-04-01-preview`, structured outputs, `AI_MAX_CONCURRENCY` 4, `AI_TIMEOUT_MS` 30000. Templates `classify.industry` v1, `whynow.line` v1, `draft.message` v2. The sample in `test-data/`, as of 2026-09-30; the first 40 first messages that could be written with AI. Runs A to C tried the models and efforts; run D is the configuration the app now uses by default.

Smoke test (`npm run test:ai-live`): 4 of 4 passed (both models' health checks, classification, why-now, Copilot).

| Run | Classification | Why-now | First messages |
|---|---|---|---|
| A | mini, `low` | gpt-5.4, `low` | gpt-5.4, `low` |
| B | mini, `low` | gpt-5.4, `none` | gpt-5.4, `none` |
| C | mini, `none` | mini, `none` | mini, `none` |
| **D (default)** | mini, `low` | gpt-5.4, `none` | gpt-5.4, `none` |

| Measure | A | B | C | D | Target |
|---|---|---|---|---|---|
| In-ICP accounts with the right core vertical | 642 of 643 (99.8%) | 642 of 643 | 642 of 643 | 642 of 643 | ≥ 95% |
| Out-of-ICP accounts classified core | 0 | 0 | 0 | 0 | 0 |
| AI-classified accounts matching the key (Other for influencers) | 647 of 698 | 658 of 698 | 630 of 698 | 636 of 698 | report |
| Accounts needing review, before → after | 698 → 25 | 698 → 22 | 698 → 24 | 698 → 21 | report |
| Why-now lines worded (tier A and B) | 144 of 144 | 144 of 144 | 144 of 144 | 144 of 144 | report; every line shown is grounded |
| First messages written / passing / sensitive like the rules' draft | 40 / 32 / 8 | 40 / 32 / 8 | 40 / 32 / 8 | 40 / 32 / 8 | every AI draft passes, or carries only the rules' own sensitive flag |
| Why-now call latency, median / max | 12.6 / 22.3 s | 7.2 / 14.0 s | 5.8 / 10.5 s | 7.1 / 14.9 s | report |
| First-message latency, median / max | 15.3 / 29.7 s | 9.0 / 17.4 s | 7.5 / 15.1 s | 8.9 / 16.8 s | report |
| Tokens in / out (all calls) | 45,849 / 19,572 | 44,402 / 11,988 | 43,717 / 10,623 | 44,426 / 11,973 | report |
| Cost estimate (USD, list prices) | 0.37 | 0.25 | 0.08 | 0.25 | report |
| Wall time (4 calls at a time) | 60 s | 40 s | 35 s | 40 s | report |

Latencies include the wait for one of the 4 slots. What the runs showed:

- **Every configuration met every target**, with no fallback at all: no grounding failure, no check failure, no timeout (gpt-4o had up to 3 grounding failures in 144 why-now lines, a timed-out batch, and, before `draft.message` v2, 11 failed drafts).
- **Reasoning effort `low` bought nothing measurable for why-now and drafts** and made them slower: the slowest draft at `low` took 29.7 s against a 30 s timeout. They run at `none`. Classification stays at `low`: its matches with the key were a little higher (647 and 658 of 698 against 630), at the same speed.
- **gpt-5.4-mini passed every check for why-now and drafts too** (run C), faster and at a third of the cost. The checks can't judge how good the writing is, so the defaults keep the writing people read (why-now, first messages, studio, Copilot) on gpt-5.4, the main model (D-44); moving any of them to the small model is one setting (`AI_SMALL_MODEL_FOR`), best decided by the reviewers after reading both models' drafts.
- **Content studio** (a scripted check the same day, gpt-5.4): 6 pieces (blog and whitepaper, each length) and 4 rewrites at `none` and again at `low`, all passing every check (one piece in each set needed its repair). `none` took 2 to 7.5 s a call, `low` 3.5 to 15 s. Rewrites now answer every open part (`content.rewrite` v2).
- **The answers that differ from the key** are again all between Other and Out of ICP (neither is core) and change from run to run.

#### Live runs with gpt-4o, 24 Oct 2026 (before D-44)

Azure OpenAI through an API Management gateway (`.env.local`; the URL is not kept in the repository): deployment `gpt-4o`, served model `gpt-4o-2024-08-06`, API version `2024-06-01`, `AI_MAX_CONCURRENCY` 4, `AI_TIMEOUT_MS` 30000. Templates `classify.industry` v1 and `whynow.line` v1 in every run; `draft.message` v1 in run 1, v2 in runs 2 and 3. The sample in `test-data/`, as of 2026-09-30; the first 40 first messages that could be written with AI.

Smoke test (`npm run test:ai-live`): 4 of 4 passed (health check, classification, why-now, Copilot), about 1.5 s a call after a first call of 6.9 s.

| Measure | Run 1 | Run 2 | Run 3 | Target |
|---|---|---|---|---|
| In-ICP accounts with the right core vertical | 642 of 643 (99.8%) | 642 of 643 (99.8%) | 642 of 643 (99.8%) | ≥ 95% |
| Out-of-ICP accounts classified core | 0 | 0 | 0 | 0 |
| AI-classified accounts matching the key (Other for influencers) | 636 of 698 | 675 of 698 | 636 of 698 | report |
| Industry texts asked / answered | 99 / 99 | 99 / 99 | 99 / 99 | report |
| Accounts needing review, before → after | 698 → 11 | 698 → 5 | 698 → 8 | report |
| Why-now lines worded (tier A and B) | 131 of 144 (rules kept: grounding 3, timeout 10) | 141 of 144 (grounding 3) | 144 of 144 | report; every line shown is grounded |
| First messages written / passing every check / sensitive like the rules' draft | 28 of 40 / 23 / 5 (rules kept: checks failed 11, timeout 1) | 40 of 40 / 32 / 8 | 40 of 40 / 32 / 8 | every AI draft passes, or carries only the rules' own sensitive flag |
| Calls; tokens in / out | 59; 51,092 / 11,008 | 59; 47,289 / 11,518 | 59; 46,915 / 10,916 | report |
| Wall time (4 calls at a time) | 66 s | 35 s | 33 s | report |

What the runs showed, and what changed:

- **Classification met its target in every run.** The answers that differ from the key are all between Other and Out of ICP (neither is core), and they move from run to run: the in-ICP and out-of-ICP figures don't.
- **First messages (run 1): 11 of 40 fell back** because gpt-4o wrote headline-style subjects ("Control Systems Follow-Up") whose capitalised words failed grounding as names, and the regeneration changed the words but kept the capitals. `draft.message` v2 asks for subjects in sentence case, and a regeneration now says why capitalised words failed. Runs 2 and 3: none fell back. The grounding check itself is unchanged.
- **Run 1 counted 5 written drafts as not passing.** A repeat with the problems printed showed that each carried only the sensitive term the rules' draft for the same item also has; the gate lets those through to a person, as it would the rules' draft. The evaluation now counts them apart (the third figure).
- **Why-now:** one batch of 10 lines ran past the 30 s timeout in run 1 (not in runs 2 and 3); 3 lines in 144 fail grounding and keep the rules' line. With 4 calls at a time, a why-now or draft call took about 7.5 s from asking to answer (median, including the wait for a slot) and at most 15 s in runs 2 and 3.
- **Cost:** about 47,000 tokens in and 11,000 out a run: USD 0.40 at the defaults then (5 / 15, gpt-4o 2024-05-13 list prices), about 0.23 at gpt-4o 2024-08-06 list prices.
- **Content studio** (not in the evaluation; a scripted check the same day): 6 pieces (blog and whitepaper, each length) and 4 rewrites were written on the first attempt with every check passing (1.3 to 5 s a call). A rewrite's reply named parts by their internal IDs ("… to part 872e4c92"); replies now name the part ("the opening").
- **Copilot** has only the smoke test's call so far: watch its fallback reasons on Setup › AI service in the first week.

On the sample, with the rules only: 698 of 1,401 accounts need review (no table match). Of those, 697 are influencers or out of ICP by the key and 1 is in-ICP (Refining); the rules already put no out-of-ICP account in a core vertical. So the classifier's job on this data is mostly to say "Other" or "Out of ICP" with confidence, and never to call an out-of-ICP account core.

## 5. Switching a capability on

1. Configure the provider (section 1), including the small model and `AI_SMALL_MODEL_FOR` if one is used, and run the health check on Setup › AI service (it calls each model).
2. Run the live evaluation and the smoke test; record the results in section 4 with the date, the deployment and the template versions.
3. Agree the targets with the Client (classification: ≥ 95% in-ICP correct and no out-of-ICP core; why-now and drafts: the fallback share the reviewers accept).
4. Set its `AI_FEATURE_*` switch to 1 in the deployment's configuration and restart. Watch Setup › AI service for fallback reasons and cost in the first week; G2 measures how often people accept AI drafts.
5. A new prompt wording means a new template version and a new evaluation run.
