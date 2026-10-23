// Azure OpenAI through the official `openai` package (D-40): a chat deployment behind an API Management gateway, API
// version 2024-06-01. That version and gpt-4o 2024-05-13 have no json_schema structured outputs, so JSON calls use
// JSON mode and the gateway validates the reply. Only the gateway uses this module (tests/ai-gateway.test.ts checks).
// The SDK's own retries are off: the gateway decides when to retry, and how long to wait.
import 'server-only';
import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError, AzureOpenAI } from 'openai';
import { ModelError, retryAfterMs, type ModelClient, type ModelRequest, type ModelResponse } from '../types.ts';

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
        const { data, request_id } = await client.chat.completions.create({
          model: cfg.deployment,
          messages: [{ role: 'system', content: req.system }, ...req.messages.map(m => ({ role: m.role, content: m.content }))],
          max_tokens: req.maxTokens, temperature: req.temperature,
          ...(req.json ? { response_format: { type: 'json_object' as const } } : {}),
        }, { signal: req.signal }).withResponse();
        const choice = data.choices[0];
        const finish = choice?.finish_reason === 'stop' ? 'stop' : choice?.finish_reason === 'length' ? 'length' : choice?.finish_reason === 'content_filter' ? 'content_filter' : 'other';
        // Azure adds content_filter_results to each choice (an extension the SDK's types don't name).
        const filtered = filteredOf((choice as unknown as { content_filter_results?: FilterResult })?.content_filter_results);
        return {
          text: choice?.message?.content ?? '', finish, promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0,
          ...(filtered.length ? { filtered } : {}), ...(request_id ? { providerRequestId: request_id } : {}),
        };
      } catch (err) {
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
  if (status === 429) return new ModelError('rate_limited', 'Azure OpenAI rate limit', { status, retryAfterMs: err.headers ? retryAfterMs(n => err.headers!.get(n)) : undefined });
  if (status === 401 || status === 403) return new ModelError('auth', 'Azure OpenAI refused the credentials', { status });
  if (status === 408) return new ModelError('timeout', 'Azure OpenAI timed out', { status });
  if (status >= 500) return new ModelError('server', `Azure OpenAI error ${status}`, { status, retryAfterMs: err.headers ? retryAfterMs(n => err.headers!.get(n)) : undefined });
  return new ModelError('bad_request', `Azure OpenAI refused the request (${status}${err.code ? ' ' + err.code : ''})`, { status });
}
