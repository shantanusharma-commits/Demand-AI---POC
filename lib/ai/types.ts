// What the AI gateway and its model clients agree on (D-5, D-35, D-40). No SDK is imported here: the two providers
// (Azure OpenAI, Amazon Bedrock) and the tests' fake client (standing in for one of them) implement ModelClient, and
// only the gateway calls them.

/** Each thing DemandAI asks a model to do; each sits behind its own flag, with the rules as its fallback. */
export const CAPABILITIES = ['classify', 'why_now', 'draft_message', 'draft_content', 'copilot', 'healthcheck'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** The prompt template a call used. A new wording is a new version, recorded on every call (D-6). */
export type Template = { id: string; version: number };

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type ModelRequest = {
  system: string;
  messages: ChatTurn[];
  /** Ask for one JSON object (Azure's JSON mode; Bedrock relies on the instruction alone). */
  json: boolean;
  maxTokens: number;
  temperature: number;
  signal: AbortSignal;
};

export type FinishReason = 'stop' | 'length' | 'content_filter' | 'other';

export type ModelResponse = {
  text: string;
  finish: FinishReason;
  promptTokens: number;
  completionTokens: number;
  /** Content-filter categories that fired, by name only (never the content). */
  filtered?: string[];
  /** The provider's own reference for the call, for a support ticket. */
  providerRequestId?: string;
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
