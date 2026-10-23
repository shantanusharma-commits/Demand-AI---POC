// The one door to a language model (D-5, D-35, D-40; remediation prompt §7). Server-only. Every capability calls
// json() or text() here with its template; nothing else imports a model SDK (tests/ai-gateway.test.ts checks).
// Per call, in order:
//  1. the capability's flag and a configured provider, else the caller uses its rules (nothing is sent);
//  2. a circuit breaker: after repeated failures the rules take over for a cool-down, then one trial call;
//  3. a per-process concurrency limit, so a big job can't starve the screens;
//  4. a timeout per attempt (AI_TIMEOUT_MS, about 30 s), up to 3 retries on 429 and 5xx with jittered backoff that
//     honours retry-after, inside the caller's overall deadline;
//  5. a content-filter result is a known outcome: the rules take over, and only the category names are logged;
//  6. JSON replies are parsed and validated with zod, then the capability's own checks run (claims, grounding); one
//     repair call quotes what was wrong, and if that fails too the rules take over with the reason recorded;
//  7. one metadata record and one log line per call: capability, template and version, provider and deployment,
//     latency, tokens, outcome, fallback reason, cost estimate, request IDs. Never a prompt or a reply (D-6).
import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { ZodType } from 'zod';
import { logger as rootLogger } from '../server/logger.ts';
import { createAzureClient, type AzureConfig } from './providers/azure-openai.ts';
import { createBedrockClient, type BedrockConfig } from './providers/bedrock.ts';
import { ModelError, type Capability, type ChatTurn, type ModelClient, type ModelErrorKind, type ModelResponse, type ProviderName, type Template } from './types.ts';

export type Prompt = { system: string; messages: ChatTurn[]; maxTokens: number; temperature?: number };

/** Why a call didn't give a usable answer. The first two never reach a model and are not recorded. */
export type FallbackReason = 'disabled' | 'not_configured' | 'circuit_open' | 'busy' | 'timeout' | 'rate_limited' | 'server_error' | 'network' | 'auth'
  | 'bad_request' | 'content_filter' | 'invalid_json' | 'schema' | 'checks_failed' | 'grounding' | 'unusable' | 'aborted' | 'internal';
export type Outcome = 'ok' | 'fallback' | 'filtered' | 'error';

export type AiCallRecord = {
  id: string; capability: Capability; templateId: string; templateVersion: number; provider: ProviderName; deployment: string;
  latencyMs: number; promptTokens: number; completionTokens: number; attempts: number; outcome: Outcome; fallbackReason: FallbackReason | null;
  filterCategories: string[]; estCostUsd: number | null; requestId: string | null; providerRequestId: string | null; businessUnitId: string; userId: string;
};

/** Who the call is for (the metadata record is kept in their business unit), and how long it may take overall. */
export type CallContext = { businessUnitId: string; userId: string; requestId?: string | null; signal?: AbortSignal; deadlineMs?: number };

/** What a reply failed on, for the one repair call and, after it, the record. */
export type Problem = { reason: FallbackReason; problems: string[] };
export type AiResult<T> =
  | { ok: true; value: T; callId: string; provider: ProviderName; deployment: string; template: Template }
  | { ok: false; reason: FallbackReason; callId: string | null; problems?: string[] };

export type Prices = { inputPerMTok: number; outputPerMTok: number };

export type GatewayOptions = {
  client: ModelClient | null;
  flags: Partial<Record<Capability, boolean>>;
  timeoutMs: number;
  maxConcurrency: number;
  maxRetries?: number;
  breakerThreshold?: number;
  breakerCooldownMs?: number;
  /** A longer retry-after than this is not waited for: the rules take over. */
  maxRetryAfterMs?: number;
  prices?: Prices | null;
  record?: (call: AiCallRecord) => Promise<void> | void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  log?: Logger;
};

const REASON_OF: Record<ModelErrorKind, FallbackReason> = {
  timeout: 'timeout', rate_limited: 'rate_limited', server: 'server_error', network: 'network', auth: 'auth',
  bad_request: 'bad_request', content_filter: 'content_filter', aborted: 'aborted',
};
const ERRORS = new Set<FallbackReason>(['timeout', 'rate_limited', 'server_error', 'network', 'auth', 'bad_request', 'internal']);
// Failures that say the provider is unwell, so they count toward opening the breaker.
const UNWELL = new Set<FallbackReason>(['timeout', 'rate_limited', 'server_error', 'network', 'auth']);
const outcomeOf = (reason: FallbackReason | null): Outcome => (!reason ? 'ok' : reason === 'content_filter' ? 'filtered' : ERRORS.has(reason) ? 'error' : 'fallback');

/** Opens after `threshold` failed calls in a row; after the cool-down one trial call decides. */
export class Breaker {
  private failures = 0;
  private openedAt: number | null = null;
  private trial = false;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  constructor(threshold: number, cooldownMs: number) { this.threshold = threshold; this.cooldownMs = cooldownMs; }
  state(now: number): 'closed' | 'open' | 'half_open' {
    if (this.openedAt === null) return 'closed';
    return now - this.openedAt >= this.cooldownMs ? 'half_open' : 'open';
  }
  /** Whether a call may go ahead now; in half-open, only one at a time. */
  allow(now: number): boolean {
    const s = this.state(now);
    if (s === 'closed') return true;
    if (s === 'open' || this.trial) return false;
    this.trial = true;
    return true;
  }
  success(): void { this.failures = 0; this.openedAt = null; this.trial = false; }
  failure(now: number): void {
    this.failures++;
    if (this.trial || this.failures >= this.threshold) this.openedAt = now;
    this.trial = false;
  }
  /** A call that ended without saying anything about the provider (filtered, bad JSON, cancelled). */
  neutral(): void { if (this.trial) { this.trial = false; this.success(); } }
}

/** A per-process limit on calls in flight; a caller waits for a slot until its deadline. */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly max: number;
  constructor(max: number) { this.max = max; }
  get inFlight(): number { return this.active; }
  acquire(waitMs: number): Promise<boolean> {
    if (this.active < this.max) { this.active++; return Promise.resolve(true); }
    return new Promise(resolve => {
      const go = () => { clearTimeout(timer); resolve(true); };
      const timer = setTimeout(() => { const i = this.waiting.indexOf(go); if (i >= 0) this.waiting.splice(i, 1); resolve(false); }, Math.max(0, waitMs));
      this.waiting.push(go);
    });
  }
  release(): void {
    const next = this.waiting.shift();
    if (next) next(); else this.active--;
  }
}

/** The first JSON object in a reply (a model sometimes wraps it in a code fence or a sentence). */
export function parseJsonObject(text: string): { ok: true; value: unknown } | { ok: false; problem: string } {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1];
  if (!t.startsWith('{')) { const i = t.indexOf('{'), j = t.lastIndexOf('}'); if (i >= 0 && j > i) t = t.slice(i, j + 1); }
  try {
    const v: unknown = JSON.parse(t);
    return v && typeof v === 'object' && !Array.isArray(v) ? { ok: true, value: v } : { ok: false, problem: 'The reply is not a JSON object.' };
  } catch {
    return { ok: false, problem: 'The reply is not valid JSON.' };
  }
}

const zodProblems = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues.slice(0, 6).map(i => `${i.path.map(String).join('.') || 'the object'}: ${i.message}`);

type Parse<T> = (text: string, finish: ModelResponse['finish']) => { ok: true; value: T } | ({ ok: false } & Problem);

export class AiGateway {
  readonly client: ModelClient | null;
  readonly breaker: Breaker;
  readonly slots: Semaphore;
  private readonly o: Required<Omit<GatewayOptions, 'client' | 'record' | 'prices' | 'log'>> & Pick<GatewayOptions, 'record' | 'prices'> & { log: Logger };

  constructor(opts: GatewayOptions) {
    this.client = opts.client;
    this.o = {
      flags: opts.flags, timeoutMs: opts.timeoutMs, maxConcurrency: opts.maxConcurrency, maxRetries: opts.maxRetries ?? 3,
      breakerThreshold: opts.breakerThreshold ?? 5, breakerCooldownMs: opts.breakerCooldownMs ?? 60_000, maxRetryAfterMs: opts.maxRetryAfterMs ?? 20_000,
      prices: opts.prices ?? null, record: opts.record, sleep: opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms))),
      random: opts.random ?? Math.random, now: opts.now ?? Date.now, log: opts.log ?? rootLogger,
    };
    this.breaker = new Breaker(this.o.breakerThreshold, this.o.breakerCooldownMs);
    this.slots = new Semaphore(this.o.maxConcurrency);
  }

  /** Whether a capability would reach a model at all (its flag is on and a provider is configured). */
  enabled(capability: Capability): boolean {
    return !!this.client && !!this.o.flags[capability];
  }

  /** Where calls go, for the health check and the screens. Never a key. */
  describe() {
    return { provider: this.client?.provider ?? 'none', deployment: this.client?.deployment ?? null, breaker: this.breaker.state(this.o.now()),
      flags: Object.fromEntries(Object.entries(this.o.flags).filter(([, v]) => v)) as Partial<Record<Capability, boolean>> };
  }

  /** A JSON reply validated with the schema, then by `check` (the capability's own rules). */
  json<T>(capability: Capability, template: Template, prompt: Prompt, schema: ZodType<T>, ctx: CallContext,
    check?: (value: T) => Problem | null): Promise<AiResult<T>> {
    const parse: Parse<T> = (text, finish) => {
      const j = parseJsonObject(text);
      if (j.ok === false) return { ok: false, reason: 'invalid_json', problems: [finish === 'length' ? 'The reply was cut off before the JSON ended: answer more briefly.' : j.problem] };
      const v = schema.safeParse(j.value);
      if (!v.success) return { ok: false, reason: 'schema', problems: zodProblems(v.error.issues) };
      const bad = check?.(v.data);
      return bad ? { ok: false, ...bad } : { ok: true, value: v.data };
    };
    const system = `${prompt.system}\n\nReply with one JSON object only, in the format above, and nothing else.`;
    return this.run(capability, template, { ...prompt, system }, ctx, true, parse);
  }

  /** A plain-text reply, after `check`. */
  text(capability: Capability, template: Template, prompt: Prompt, ctx: CallContext, check?: (text: string) => Problem | null): Promise<AiResult<string>> {
    const parse: Parse<string> = (text, finish) => {
      const t = text.trim();
      if (!t) return { ok: false, reason: 'unusable', problems: ['The reply was empty.'] };
      if (finish === 'length') return { ok: false, reason: 'unusable', problems: ['The reply was cut off: answer more briefly.'] };
      const bad = check?.(t);
      return bad ? { ok: false, ...bad } : { ok: true, value: t };
    };
    return this.run(capability, template, prompt, ctx, false, parse);
  }

  private async run<T>(capability: Capability, template: Template, prompt: Prompt, ctx: CallContext, json: boolean, parse: Parse<T>): Promise<AiResult<T>> {
    if (!this.client) return { ok: false, reason: 'not_configured', callId: null };
    if (!this.o.flags[capability]) return { ok: false, reason: 'disabled', callId: null };
    const client = this.client, id = randomUUID(), started = this.o.now();
    const deadline = started + (ctx.deadlineMs ?? this.o.timeoutMs * 2.5);
    const tally = { attempts: 0, promptTokens: 0, completionTokens: 0, providerRequestId: null as string | null, filtered: [] as string[] };
    const finish = async (reason: FallbackReason | null, problems?: string[]): Promise<AiResult<T> | null> => {
      await this.finishCall({ id, capability, template, client, ctx, started, tally, reason });
      return reason ? { ok: false, reason, callId: id, ...(problems ? { problems } : {}) } : null;
    };
    if (!this.breaker.allow(this.o.now())) return (await finish('circuit_open'))!;
    let messages = prompt.messages;
    try {
      for (let pass = 0; pass < 2; pass++) {
        const res = await this.send(client, { system: prompt.system, messages, json, maxTokens: prompt.maxTokens, temperature: prompt.temperature ?? 0.2 }, ctx, deadline, tally);
        if (res.finish === 'content_filter') {
          tally.filtered = res.filtered ?? [];
          this.breaker.neutral();
          return (await finish('content_filter'))!;
        }
        const parsed = parse(res.text, res.finish);
        if (parsed.ok === false) {
          if (pass === 1 || this.o.now() >= deadline - 1000) {
            this.breaker.neutral();
            return (await finish(parsed.reason, parsed.problems))!;
          }
          // One repair: the model sees its reply and what was wrong with it.
          messages = [...messages, { role: 'assistant', content: res.text },
            { role: 'user', content: `That reply could not be used:\n- ${parsed.problems.join('\n- ')}\nReply again${json ? ' with one corrected JSON object only' : ''}, following every rule above.` }];
          continue;
        }
        this.breaker.success();
        await finish(null);
        return { ok: true, value: parsed.value, callId: id, provider: client.provider, deployment: client.deployment, template };
      }
      return (await finish('internal'))!;
    } catch (err) {
      if (err instanceof ModelError) {
        const reason = REASON_OF[err.kind];
        if (reason === 'content_filter') { tally.filtered = err.filtered ?? []; this.breaker.neutral(); }
        else if (UNWELL.has(reason)) this.breaker.failure(this.o.now());
        else this.breaker.neutral();
        return (await finish(reason))!;
      }
      if (err instanceof BusyError) { this.breaker.neutral(); return (await finish('busy'))!; }
      this.o.log.error({ event: 'ai.internal', capability, err }, 'AI call failed unexpectedly');
      this.breaker.neutral();
      return (await finish('internal'))!;
    }
  }

  /** One request with its retries. Throws ModelError (or BusyError) when it gives up. */
  private async send(client: ModelClient, req: Omit<Parameters<ModelClient['complete']>[0], 'signal'>, ctx: CallContext, deadline: number,
    tally: { attempts: number; promptTokens: number; completionTokens: number; providerRequestId: string | null }): Promise<ModelResponse> {
    for (let attempt = 0; ; attempt++) {
      const left = deadline - this.o.now();
      if (left < 1000) throw new ModelError('timeout', 'The call ran out of time');
      if (!(await this.slots.acquire(left))) throw new BusyError();
      let res: ModelResponse;
      try {
        tally.attempts++;
        res = await this.attempt(client, req, ctx, Math.min(this.o.timeoutMs, deadline - this.o.now()));
      } catch (err) {
        if (!(err instanceof ModelError) || (err.kind !== 'rate_limited' && err.kind !== 'server') || attempt >= this.o.maxRetries) throw err;
        if (err.retryAfterMs !== undefined && err.retryAfterMs > this.o.maxRetryAfterMs) throw err;
        // Full jitter on an exponential base, never less than the provider asked for.
        const base = Math.min(8000, 500 * 2 ** attempt);
        const delay = Math.max(err.retryAfterMs ?? 0, Math.round(this.o.random() * base)) + (err.retryAfterMs ? Math.round(this.o.random() * 250) : 0);
        if (this.o.now() + delay > deadline - 1000) throw err;
        this.o.log.debug({ event: 'ai.retry', kind: err.kind, status: err.status, attempt: attempt + 1, delayMs: delay }, 'Retrying the AI call');
        await this.o.sleep(delay);
        continue;
      } finally {
        this.slots.release();
      }
      tally.promptTokens += res.promptTokens;
      tally.completionTokens += res.completionTokens;
      if (res.providerRequestId) tally.providerRequestId = res.providerRequestId;
      return res;
    }
  }

  /** One attempt, cut off at its timeout even if the client ignores the signal. */
  private async attempt(client: ModelClient, req: Omit<Parameters<ModelClient['complete']>[0], 'signal'>, ctx: CallContext, timeoutMs: number): Promise<ModelResponse> {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    ctx.signal?.addEventListener('abort', onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ctl.abort(); reject(new ModelError('timeout', `No answer within ${timeoutMs} ms`)); }, Math.max(1, timeoutMs));
    });
    try {
      if (ctx.signal?.aborted) throw new ModelError('aborted', 'The request was cancelled');
      return await Promise.race([client.complete({ ...req, signal: ctl.signal }), timeout]);
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', onAbort);
    }
  }

  private async finishCall(c: { id: string; capability: Capability; template: Template; client: ModelClient; ctx: CallContext; started: number;
    tally: { attempts: number; promptTokens: number; completionTokens: number; providerRequestId: string | null; filtered: string[] }; reason: FallbackReason | null }) {
    const p = this.o.prices;
    const cost = p ? Math.round(((c.tally.promptTokens * p.inputPerMTok + c.tally.completionTokens * p.outputPerMTok) / 1e6) * 1e6) / 1e6 : null;
    const rec: AiCallRecord = {
      id: c.id, capability: c.capability, templateId: c.template.id, templateVersion: c.template.version, provider: c.client.provider, deployment: c.client.deployment,
      latencyMs: Math.round(this.o.now() - c.started), promptTokens: c.tally.promptTokens, completionTokens: c.tally.completionTokens, attempts: c.tally.attempts,
      outcome: outcomeOf(c.reason), fallbackReason: c.reason, filterCategories: c.tally.filtered, estCostUsd: cost,
      requestId: c.ctx.requestId ?? null, providerRequestId: c.tally.providerRequestId, businessUnitId: c.ctx.businessUnitId, userId: c.ctx.userId,
    };
    const { businessUnitId: _bu, userId: _u, id: aiCallId, ...meta } = rec;
    void _bu; void _u;
    this.o.log[rec.outcome === 'ok' ? 'info' : rec.outcome === 'error' ? 'warn' : 'info']({ event: 'ai.call', aiCallId, ...meta },
      rec.outcome === 'ok' ? `AI ${c.capability} answered` : `AI ${c.capability}: ${c.reason}, rules used`);
    try {
      await this.o.record?.(rec);
    } catch (err) {
      this.o.log.error({ event: 'ai.record_failed', aiCallId, err }, 'Could not store the AI call record');
    }
  }
}

class BusyError extends Error {
  constructor() { super('Every AI slot stayed busy until the deadline'); this.name = 'BusyError'; }
}

/** The provider configuration the gateway is built from (lib/server/ai.ts reads it from the environment). */
export type ProviderConfig =
  | { provider: 'none' }
  | ({ provider: 'azure-openai' } & AzureConfig)
  | ({ provider: 'bedrock' } & BedrockConfig);

/** The model client for a provider configuration; the only place the two SDK adapters are created. */
export function createModelClient(cfg: ProviderConfig): ModelClient | null {
  if (cfg.provider === 'azure-openai') return createAzureClient(cfg);
  if (cfg.provider === 'bedrock') return createBedrockClient(cfg);
  return null;
}
