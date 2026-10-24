// Azure OpenAI through the official `openai` package (D-40, D-44): chat deployments behind an API Management gateway.
// The pilot runs gpt-5.4 and gpt-5.4-mini on API version 2025-04-01-preview, the newest the gateway serves (it doesn't
// expose the v1 API). Those models reason before they answer, so a request carries max_completion_tokens with room to
// reason, a reasoning_effort, and a temperature only at effort "none" (the models refuse it otherwise); JSON calls send
// the reply's strict JSON schema (structured outputs), and the gateway still validates every reply. A request without
// an effort is shaped for a model that doesn't reason. Only the gateway uses this module (tests/ai-gateway.test.ts checks).
// The SDK's own retries are off: the gateway decides when to retry, and how long to wait.
import 'server-only';
import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError, AzureOpenAI } from 'openai';
import { ModelError, retryAfterMs, type ModelClient, type ModelRequest, type ModelResponse, type ReasoningEffort } from '../types.ts';

export type AzureAuthHeader = 'api-key' | 'Ocp-Apim-Subscription-Key';

export type AzureConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  /** API Management front doors sometimes expect the key as Ocp-Apim-Subscription-Key instead of api-key. */
  authHeader: AzureAuthHeader;
  /** Tests pass a fetch that answers with recorded responses. */
  fetch?: typeof fetch;
};

/** An endpoint whose path already ends in /openai (or names a deployment) is used as the base URL as it is; otherwise
 *  the SDK adds /openai to it, as for a resource endpoint. */
export function azureBase(endpoint: string): { endpoint: string } | { baseURL: string } {
  const path = new URL(endpoint).pathname.replace(/\/+$/, '');
  return /\/openai$/.test(path) || path.split('/').includes('deployments') ? { baseURL: endpoint.replace(/\/+$/, '') } : { endpoint };
}

/** Sends the key under the configured header name, and only there. */
function keyHeaderFetch(base: typeof fetch, header: AzureAuthHeader): typeof fetch {
  if (header === 'api-key') return base;
  return (input, init) => {
    const headers = new Headers(init?.headers);
    const key = headers.get('api-key');
    headers.delete('api-key');
    if (key) headers.set(header, key);
    return base(input, { ...init, headers });
  };
}

/** Tokens added to max_completion_tokens for the model's reasoning, which counts against the same limit. */
export const REASONING_ROOM: Record<ReasoningEffort, number> = { none: 0, minimal: 256, low: 1024, medium: 4096, high: 8192, xhigh: 16384 };

/** The request body for one call. */
export function chatBody(deployment: string, req: ModelRequest) {
  const reasons = req.reasoning !== undefined && req.reasoning !== 'none';
  return {
    model: deployment,
    messages: [{ role: 'system' as const, content: req.system }, ...req.messages.map(m => ({ role: m.role, content: m.content }))],
    max_completion_tokens: req.maxTokens + (req.reasoning ? REASONING_ROOM[req.reasoning] : 0),
    ...(req.reasoning ? { reasoning_effort: req.reasoning } : {}),
    ...(reasons ? {} : { temperature: req.temperature }),
    ...(req.json && req.schema ? { response_format: { type: 'json_schema' as const, json_schema: { name: req.schema.name, strict: true, schema: req.schema.schema } } }
      : req.json ? { response_format: { type: 'json_object' as const } } : {}),
  };
}

// The pilot's API Management gateway sometimes answers 400 with this from one of its backends (24 Oct 2026: about one
// call in five during a burst, none in 120 at other times); the same request succeeds on the next attempt.
const GATEWAY_BACKEND_REFUSAL = /not supported for token authentication|not supported for CheckAccess/i;
// With a strict schema, a reply that runs out of room is refused as a 400 instead of ending with finish_reason length.
const OUT_OF_ROOM = /max_tokens or model output limit was reached/i;

type FilterResult = Record<string, { filtered?: boolean } | undefined>;
const filteredOf = (r: FilterResult | undefined | null): string[] =>
  r && typeof r === 'object' ? Object.entries(r).filter(([, v]) => v && typeof v === 'object' && v.filtered).map(([k]) => k) : [];

export function createAzureClient(cfg: AzureConfig): ModelClient {
  const client = new AzureOpenAI({
    ...azureBase(cfg.endpoint), apiKey: cfg.apiKey, apiVersion: cfg.apiVersion, deployment: cfg.deployment,
    maxRetries: 0, timeout: 120_000, fetch: keyHeaderFetch(cfg.fetch ?? fetch, cfg.authHeader),
  });
  return {
    provider: 'azure-openai',
    deployment: cfg.deployment,
    async complete(req: ModelRequest): Promise<ModelResponse> {
      try {
        const { data, request_id } = await client.chat.completions.create(chatBody(cfg.deployment, req), { signal: req.signal }).withResponse();
        const choice = data.choices[0];
        const refused = !!choice?.message?.refusal;
        const finish = refused ? 'refusal' : choice?.finish_reason === 'stop' ? 'stop' : choice?.finish_reason === 'length' ? 'length' : choice?.finish_reason === 'content_filter' ? 'content_filter' : 'other';
        // Azure adds content_filter_results to each choice (an extension the SDK's types don't name).
        const filtered = filteredOf((choice as unknown as { content_filter_results?: FilterResult })?.content_filter_results);
        return {
          text: refused ? '' : choice?.message?.content ?? '', finish, promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0,
          ...(filtered.length ? { filtered } : {}), ...(request_id ? { providerRequestId: request_id } : {}), ...(data.model ? { model: data.model } : {}),
        };
      } catch (err) {
        if (err instanceof APIError && err.status === 400 && OUT_OF_ROOM.test(err.message)) return { text: '', finish: 'length', promptTokens: 0, completionTokens: 0 };
        throw toModelError(err);
      }
    },
  };
}

/** Sorts an SDK error into what the gateway does next. Only names, codes and statuses: never the request or reply. */
export function toModelError(err: unknown): unknown {
  if (err instanceof APIUserAbortError) return new ModelError('aborted', 'The request was cancelled');
  if (err instanceof APIConnectionTimeoutError) return new ModelError('timeout', 'Azure OpenAI did not answer in time');
  if (err instanceof APIConnectionError) return new ModelError('network', 'Could not reach Azure OpenAI');
  if (!(err instanceof APIError)) return err;
  const status = err.status ?? 0;
  const body = (err.error ?? {}) as { code?: string; innererror?: { code?: string; content_filter_result?: FilterResult } };
  if (status === 400 && (err.code === 'content_filter' || body.code === 'content_filter' || body.innererror?.code === 'ResponsibleAIPolicyViolation')) {
    return new ModelError('content_filter', 'The prompt was filtered by the content policy', { status, filtered: filteredOf(body.innererror?.content_filter_result) });
  }
  if (status === 400 && GATEWAY_BACKEND_REFUSAL.test(`${body.code ?? ''} ${err.message}`)) return new ModelError('server', 'The API gateway refused the call for one of its backends', { status });
  if (status === 429) return new ModelError('rate_limited', 'Azure OpenAI rate limit', { status, retryAfterMs: err.headers ? retryAfterMs(n => err.headers!.get(n)) : undefined });
  if (status === 401 || status === 403) return new ModelError('auth', 'Azure OpenAI refused the credentials', { status });
  if (status === 408) return new ModelError('timeout', 'Azure OpenAI timed out', { status });
  if (status >= 500) return new ModelError('server', `Azure OpenAI error ${status}`, { status, retryAfterMs: err.headers ? retryAfterMs(n => err.headers!.get(n)) : undefined });
  return new ModelError('bad_request', `Azure OpenAI refused the request (${status}${err.code ? ' ' + err.code : ''})`, { status });
}
