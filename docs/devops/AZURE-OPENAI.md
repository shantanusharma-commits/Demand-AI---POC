# The model service: what to provision and how to check it

DemandAI works without a model (every capability has its rules). To switch AI on, it needs an Azure OpenAI resource, or an API Management gateway in front of one, with two chat deployments (D-44), or Amazon Bedrock (D-35). What it sends, what it keeps and how it was evaluated is in [docs/AI.md](../AI.md).

## 1. The request (Azure OpenAI)

| Item | Value | Notes |
|---|---|---|
| Main deployment | `gpt-5.4` (model gpt-5.4-2026-03-05) | Why-now lines, first messages, Content studio, Copilot |
| Small deployment | `gpt-5.4-mini` (model gpt-5.4-mini-2026-03-17) | Industry classification (`AI_SMALL_MODEL_FOR`) |
| API version | `2025-04-01-preview` | The newest the pilot's API Management gateway serves; it does not expose the v1 API (`/openai/v1/…`). On a resource endpoint the same version works |
| Features used | Chat completions with `json_schema` structured outputs (strict), `reasoning_effort`, `max_completion_tokens` | No assistants, files, fine-tuning or embeddings |
| Throughput | One evaluation run on the sample is about 45,000 tokens in and 12,000 out, 60 calls in about 40 s at 4 calls at a time (`AI_MAX_CONCURRENCY`) per app instance | Ask for at least 50,000 tokens a minute per deployment for the pilot |
| Data handling | Region and data-residency choice; abuse-monitoring setting; confirmation that prompts and completions are not used for training | To record in docs/AI.md §1 before the pilot |
| Authentication | An API key in `api-key`, or an API Management subscription key in `Ocp-Apim-Subscription-Key` (`AZURE_OPENAI_AUTH_HEADER`) | Managed identity is a later change in `lib/ai/providers/azure-openai.ts` only |
| Network | Outbound HTTPS from the app to the endpoint | The EKS NetworkPolicy restricts ingress only |

Settings: `AI_PROVIDER=azure-openai`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` (secrets), `AZURE_OPENAI_DEPLOYMENT=gpt-5.4`, `AZURE_OPENAI_DEPLOYMENT_SMALL=gpt-5.4-mini`, `AZURE_OPENAI_API_VERSION=2025-04-01-preview`, `AI_TIMEOUT_MS=45000`, and the agreed prices (`AI_PRICE_*`).

## 2. The diagnostic

`scripts/ai/diagnose.mjs` calls each deployment the way the app does: a one-word answer and the model that served it, a strict structured-output reply, and reasoning effort `low`. It prints status codes, error codes and model names only, never the endpoint, the key or a reply.

```bash
node --env-file=<file with the AZURE_OPENAI_* settings> scripts/ai/diagnose.mjs
```

On the pilot's gateway, 24 Oct 2026:

```
API version 2025-04-01-preview, key sent as api-key
main deployment "gpt-5.4"
ok   answers (effort none)                        200    6358 ms gpt-5.4-2026-03-05 stop
ok   structured output (strict json_schema)       200    1119 ms gpt-5.4-2026-03-05
ok   reasoning effort low                         200    2047 ms gpt-5.4-2026-03-05 stop
small deployment "gpt-5.4-mini"
ok   answers (effort none)                        200    1394 ms gpt-5.4-mini-2026-03-17 stop
ok   structured output (strict json_schema)       200    1902 ms gpt-5.4-mini-2026-03-17
ok   reasoning effort low                         200    1473 ms gpt-5.4-mini-2026-03-17 stop
```

What failures mean: 404 on every call is a wrong deployment name, API version or path (a gateway may publish other paths); 401 or 403 is the key or its header; an occasional 400 "API operation not supported for token authentication … not supported for CheckAccess" is the pilot gateway refusing a call on one of its three backends (in bursts on 24 Oct 2026). The app retries it like a server error; report it to the gateway's owner.

Inside a deployed app, an Admin runs **Setup › AI service › Run a health check**: one tiny call to each model.

## 3. Switching a capability on

As docs/AI.md §5: configure, run the diagnostic and the health check, run the live evaluation (`AI_LIVE_SMOKE=1 npm run ai:evaluate`, from a developer machine with the same settings), agree the results with the Client, then set that capability's `AI_FEATURE_*` to `1` and restart. Watch the AI alarms ([OBSERVABILITY.md](OBSERVABILITY.md)) in the first week.

## 4. Amazon Bedrock instead

`AI_PROVIDER=bedrock`, `AWS_REGION`, `BEDROCK_MODEL_ID` (and `BEDROCK_MODEL_ID_SMALL`), with the app's IAM role allowed `bedrock:InvokeModel`/`bedrock:Converse` on those models; the app refuses static AWS keys. Bedrock has no structured outputs through Converse: replies are validated and repaired as with JSON mode. Run the evaluation before switching anything on; the results in docs/AI.md are for Azure OpenAI.
