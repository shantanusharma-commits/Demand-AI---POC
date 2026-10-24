// What the AI gateway and its model clients agree on (D-5, D-35, D-40, D-44). No SDK is imported here: the two providers
// (Azure OpenAI, Amazon Bedrock) and the tests' fake client (standing in for one of them) implement ModelClient, and
// only the gateway calls them.

/** Each thing DemandAI asks a model to do; each sits behind its own flag, with the rules as its fallback. */
export const CAPABILITIES = ['classify', 'why_now', 'draft_message', 'draft_content', 'copilot', 'healthcheck'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** The prompt template a call used. A new wording is a new version, recorded on every call (D-6). */
export type Template = { id: string; version: number };

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** How much a reasoning model (the GPT-5 family, D-44) thinks before it answers. Reasoning tokens are billed as output. */
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** A reply's JSON Schema in the strict form structured outputs need (lib/ai/schema.ts). */
export type StrictSchema = { name: string; schema: Record<string, unknown> };

export type ModelRequest = {
  system: string;
  messages: ChatTurn[];
  /** Ask for one JSON object (Azure's JSON mode; Bedrock relies on the instruction alone). */
  json: boolean;
  /** With `json`, the shape the reply must have, for a provider that enforces it (Azure's structured outputs); null or
   *  absent means JSON mode. The gateway validates the reply either way. */
  schema?: StrictSchema | null;
  /** The answer's length; a reasoning model is given room to reason on top. */
  maxTokens: number;
  /** Sent only where the model takes it (reasoning models take none, or only at effort "none"). */
  temperature: number;
  /** For a reasoning model; absent for one that doesn't reason. */
  reasoning?: ReasoningEffort;
  signal: AbortSignal;
};

/** "refusal": the model declined to answer (structured outputs report it apart from the content filter). */
export type FinishReason = 'stop' | 'length' | 'content_filter' | 'refusal' | 'other';

export type ModelResponse = {
  text: string;
  finish: FinishReason;
  promptTokens: number;
  completionTokens: number;
  /** Content-filter categories that fired, by name only (never the content). */
  filtered?: string[];
  /** The provider's own reference for the call, for a support ticket. */
  providerRequestId?: string;
  /** The model that answered, as the provider names it (a deployment can serve another version than expected). */
  model?: string;
};

export type ModelErrorKind = 'timeout' | 'rate_limited' | 'server' | 'content_filter' | 'auth' | 'bad_request' | 'network' | 'aborted';

/** A model call that failed, sorted into what the gateway does next. Messages never carry prompt or response text. */
export class ModelError extends Error {
  readonly kind: ModelErrorKind;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly filtered?: string[];
  constructor(kind: ModelErrorKind, message: string, extra: { status?: number; retryAfterMs?: number; filtered?: string[] } = {}) {
    super(message);
    this.name = 'ModelError';
    this.kind = kind;
    this.status = extra.status;
    this.retryAfterMs = extra.retryAfterMs;
    this.filtered = extra.filtered;
  }
}

export type ProviderName = 'azure-openai' | 'bedrock';

export interface ModelClient {
  readonly provider: ProviderName;
  /** The Azure deployment name or the Bedrock model ID. */
  readonly deployment: string;
  complete(req: ModelRequest): Promise<ModelResponse>;
}

/** Reads a retry-after header: seconds, or an HTTP date. Azure also sends retry-after-ms. */
export function retryAfterMs(get: (name: string) => string | null | undefined, now = Date.now()): number | undefined {
  const ms = Number(get('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const raw = get('retry-after');
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}
