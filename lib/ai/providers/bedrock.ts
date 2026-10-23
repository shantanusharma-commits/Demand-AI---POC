// Amazon Bedrock through the Converse API (D-35), so one adapter serves any chat model the account has access to.
// Credentials come from the IAM role the app runs under (EKS Pod Identity or IRSA, an EC2 instance profile) through
// the SDK's default chain; static keys are refused at start-up (lib/server/env.ts). Converse has no JSON mode, so a
// JSON call relies on the prompt's instruction and the gateway's validation. Only the gateway uses this module.
import 'server-only';
import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { ModelError, type ModelClient, type ModelRequest, type ModelResponse } from '../types.ts';

/** The one method the adapter needs, so tests can hand it a fake. */
export type ConverseSender = { send(command: ConverseCommand, options?: { abortSignal?: AbortSignal }): Promise<ConverseCommandOutput> };

export type BedrockConfig = { region: string; modelId: string; client?: ConverseSender };

export function createBedrockClient(cfg: BedrockConfig): ModelClient {
  // One attempt per send: the gateway retries.
  const client: ConverseSender = cfg.client ?? new BedrockRuntimeClient({ region: cfg.region, maxAttempts: 1 });
  return {
    provider: 'bedrock',
    deployment: cfg.modelId,
    async complete(req: ModelRequest): Promise<ModelResponse> {
      try {
        const out = await client.send(new ConverseCommand({
          modelId: cfg.modelId,
          system: [{ text: req.system }],
          messages: req.messages.map(m => ({ role: m.role, content: [{ text: m.content }] })),
          inferenceConfig: { maxTokens: req.maxTokens, temperature: req.temperature },
        }), { abortSignal: req.signal });
        const text = (out.output?.message?.content ?? []).map(b => ('text' in b && typeof b.text === 'string' ? b.text : '')).join('');
        const r = out.stopReason;
        const finish = r === 'end_turn' || r === 'stop_sequence' ? 'stop' : r === 'max_tokens' || r === 'model_context_window_exceeded' ? 'length'
          : r === 'content_filtered' || r === 'guardrail_intervened' ? 'content_filter' : 'other';
        return {
          text, finish, promptTokens: out.usage?.inputTokens ?? 0, completionTokens: out.usage?.outputTokens ?? 0,
          ...(finish === 'content_filter' ? { filtered: [r === 'guardrail_intervened' ? 'guardrail' : 'content_filtered'] } : {}),
          ...(out.$metadata?.requestId ? { providerRequestId: out.$metadata.requestId } : {}),
        };
      } catch (err) {
        throw toModelError(err);
      }
    },
  };
}

const RATE = new Set(['ThrottlingException', 'ModelNotReadyException', 'TooManyRequestsException']);
const SERVER = new Set(['InternalServerException', 'ServiceUnavailableException', 'ModelErrorException', 'ModelStreamErrorException']);
const AUTH = new Set(['AccessDeniedException', 'UnrecognizedClientException', 'ExpiredTokenException', 'CredentialsProviderError', 'InvalidSignatureException']);
const NETWORK = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EPIPE']);

/** Sorts an SDK error into what the gateway does next, by name and status only. */
export function toModelError(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const e = err as Error & { $metadata?: { httpStatusCode?: number }; code?: string };
  const status = e.$metadata?.httpStatusCode;
  if (e.name === 'AbortError') return new ModelError('aborted', 'The request was cancelled');
  if (e.name === 'ModelTimeoutException' || e.name === 'TimeoutError') return new ModelError('timeout', 'Bedrock did not answer in time', { status });
  if (RATE.has(e.name) || status === 429) return new ModelError('rate_limited', 'Bedrock throttled the request', { status });
  if (SERVER.has(e.name) || (status !== undefined && status >= 500)) return new ModelError('server', `Bedrock error (${e.name})`, { status });
  if (AUTH.has(e.name) || status === 401 || status === 403) return new ModelError('auth', `Bedrock refused the credentials (${e.name})`, { status });
  if (e.code && NETWORK.has(e.code)) return new ModelError('network', 'Could not reach Bedrock');
  if (status !== undefined && status >= 400) return new ModelError('bad_request', `Bedrock refused the request (${e.name})`, { status });
  return err;
}
