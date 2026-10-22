/* Hunter.io Email Verifier client (server only). Docs: https://hunter.io/api-documentation/v2#email-verifier
   - 202: verification still running; the same URL is polled until it completes (repeat polls count as one request).
   - 222: the remote SMTP server gave an unexpected answer; retry later.  451: the person asked not to be processed.
   - 403: Hunter's rate limit (10/s, 300/min).  429: the plan's usage limit.
   Only 'valid' and 'invalid' are conclusive. accept_all, webmail, disposable and unknown are inconclusive and are
   never turned into either. Never import this from a client component: it handles the API key. */
import type {
  EmailVerification, HunterSource, HunterStatus, HunterVerification, VerificationOutcome, VerifyError,
} from '../../types/email-verification.ts';

export const HUNTER_URL = 'https://api.hunter.io/v2/email-verifier';
export const HUNTER_LIMITS = { perSecond: 10, perMinute: 300 };

export interface Clock { now(): number; sleep(ms: number): Promise<void> }
export const realClock: Clock = { now: () => Date.now(), sleep: ms => new Promise(r => setTimeout(r, ms)) };

/** Thrown when a request would have to wait longer than the caller allows. */
export class RateWait extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) { super('rate limit wait'); this.retryAfterMs = retryAfterMs; }
}

/** Sliding-window limiter: at most `perSecond` calls in any 1 s and `perMinute` in any 60 s. Shared by every caller in the process. */
export class RateLimiter {
  private stamps: number[] = [];
  private clock: Clock; private perSecond: number; private perMinute: number; private marginMs: number;
  constructor(clock: Clock = realClock, perSecond = HUNTER_LIMITS.perSecond, perMinute = HUNTER_LIMITS.perMinute, marginMs = 25) {
    this.clock = clock; this.perSecond = perSecond; this.perMinute = perMinute; this.marginMs = marginMs;
  }

  /** ms until another call is allowed (0 = now). */
  private wait(now: number): number {
    this.stamps = this.stamps.filter(t => now - t < 60_000 + this.marginMs);
    let w = 0;
    const inSecond = this.stamps.filter(t => now - t < 1000 + this.marginMs);
    if (inSecond.length >= this.perSecond) w = Math.max(w, inSecond[inSecond.length - this.perSecond] + 1000 + this.marginMs - now);
    if (this.stamps.length >= this.perMinute) w = Math.max(w, this.stamps[this.stamps.length - this.perMinute] + 60_000 + this.marginMs - now);
    return w;
  }

  /** Takes a slot, sleeping until one is free. Throws RateWait instead if that would take longer than `maxWaitMs`. */
  async acquire(maxWaitMs = Infinity): Promise<void> {
    for (;;) {
      const w = this.wait(this.clock.now());
      if (w <= 0) { this.stamps.push(this.clock.now()); return; }
      if (w > maxWaitMs) throw new RateWait(w);
      await this.clock.sleep(w);
    }
  }
}

export interface VerifyOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  clock?: Clock;
  limiter?: RateLimiter;
  /** Longest a request may wait for a rate-limit slot before the caller is told to retry. */
  maxQueueMs?: number;
  /** Timeout of one HTTP call. Hunter holds a request open for about 20 s before answering 202. */
  requestTimeoutMs?: number;
  /** Polling of 202 answers. */
  pollDelayMs?: number;
  maxPolls?: number;
  totalTimeoutMs?: number;
}

export type HunterResult =
  | { ok: true; verification: EmailVerification }
  | { ok: false; error: VerifyError };

const bool = (v: unknown): boolean | null => typeof v === 'boolean' ? v : null;
const STATUSES: HunterStatus[] = ['valid', 'invalid', 'accept_all', 'webmail', 'disposable', 'unknown'];

function sources(v: unknown): HunterSource[] {
  if (!Array.isArray(v)) return [];
  return v.filter(s => s && typeof s === 'object').map((s: Record<string, unknown>) => ({
    domain: String(s.domain ?? ''), uri: String(s.uri ?? ''), extracted_on: String(s.extracted_on ?? ''),
    last_seen_on: String(s.last_seen_on ?? ''), still_on_page: s.still_on_page === true,
  }));
}

/** Hunter's `data` object, reduced to the fields we keep. Anything missing or of the wrong type becomes null. */
export function parseHunterData(data: Record<string, unknown>): HunterVerification {
  const status = STATUSES.includes(data.status as HunterStatus) ? data.status as HunterStatus : null;
  const ver = data.verification && typeof data.verification === 'object' ? data.verification as Record<string, unknown> : null;
  return {
    status, score: typeof data.score === 'number' ? data.score : null,
    regexp: bool(data.regexp), gibberish: bool(data.gibberish), disposable: bool(data.disposable), webmail: bool(data.webmail),
    mx_records: bool(data.mx_records), smtp_server: bool(data.smtp_server), smtp_check: bool(data.smtp_check),
    accept_all: bool(data.accept_all), block: bool(data.block),
    verification: ver ? { date: typeof ver.date === 'string' ? ver.date : null, status: typeof ver.status === 'string' ? ver.status : null } : null,
    sources: sources(data.sources),
  };
}

/** What we conclude from Hunter's status. The only two conclusive answers are valid and invalid. */
export function outcomeOf(status: HunterStatus | null): { outcome: VerificationOutcome; reason: string } {
  switch (status) {
    case 'valid': return { outcome: 'valid', reason: 'Hunter confirmed the address can receive mail' };
    case 'invalid': return { outcome: 'invalid', reason: 'Hunter found the address is not deliverable' };
    case 'accept_all': return { outcome: 'inconclusive', reason: 'The mail server accepts every address, so this one cannot be confirmed' };
    case 'webmail': return { outcome: 'inconclusive', reason: 'Webmail provider (such as Gmail or Outlook): the mailbox cannot be checked' };
    case 'disposable': return { outcome: 'inconclusive', reason: 'Disposable email provider: not a mailbox the person is likely to read' };
    case 'unknown': return { outcome: 'inconclusive', reason: 'Hunter could not complete the verification' };
    default: return { outcome: 'inconclusive', reason: 'Hunter returned no usable status' };
  }
}

export function toVerification(email: string, data: Record<string, unknown>, now: Date): EmailVerification {
  const h = parseHunterData(data);
  return { ...h, ...outcomeOf(h.status), email, provider: 'hunter', checkedAt: now.toISOString() };
}

const err = (code: VerifyError['code'], message: string, retryable: boolean, retryAfterMs?: number): HunterResult =>
  ({ ok: false, error: { code, message, retryable, ...(retryAfterMs ? { retryAfterMs } : {}) } });

async function detail(res: Response): Promise<string> {
  try { const j = await res.json() as { errors?: { details?: string }[] }; return j.errors?.[0]?.details || ''; } catch { return ''; }
}

/** Verifies one address. Never throws; every failure comes back as `{ ok: false, error }`. */
export async function verifyWithHunter(rawEmail: string, o: VerifyOptions): Promise<HunterResult> {
  const fetchFn = o.fetchFn ?? fetch, clock = o.clock ?? realClock, limiter = o.limiter ?? sharedLimiter;
  const maxQueue = o.maxQueueMs ?? 15_000, reqTimeout = o.requestTimeoutMs ?? 30_000;
  const pollDelay = o.pollDelayMs ?? 2000, maxPolls = o.maxPolls ?? 6, total = o.totalTimeoutMs ?? 120_000;
  const email = rawEmail.trim().toLowerCase();
  if (!o.apiKey) return err('not_configured', 'No Hunter.io API key is set. Add one in Setup.', false);
  const url = `${HUNTER_URL}?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(o.apiKey)}`;
  const started = clock.now();

  for (let poll = 0; poll <= maxPolls; poll++) {
    try { await limiter.acquire(maxQueue); }
    catch (e) { if (e instanceof RateWait) return err('rate_limited', 'Too many requests at once; try again shortly', true, e.retryAfterMs); throw e; }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), reqTimeout);
    let res: Response;
    try { res = await fetchFn(url, { signal: ctl.signal, cache: 'no-store', headers: { accept: 'application/json' } }); }
    catch (e) {
      // Never put the error text in the answer: it can carry the request URL, which holds the key.
      return (e as Error)?.name === 'AbortError'
        ? err('timeout', 'Hunter did not answer in time', true, 5000)
        : err('network_error', 'Could not reach Hunter', true, 5000);
    } finally { clearTimeout(timer); }

    switch (res.status) {
      case 200: {
        let body: { data?: Record<string, unknown> };
        try { body = await res.json(); } catch { return err('upstream_error', 'Hunter sent an unreadable answer', true, 10_000); }
        if (!body || typeof body.data !== 'object' || !body.data) return err('upstream_error', 'Hunter sent an answer without data', true, 10_000);
        return { ok: true, verification: toVerification(email, body.data, new Date(clock.now())) };
      }
      case 202: {
        if (clock.now() - started + pollDelay > total || poll === maxPolls) return err('pending', 'Hunter is still verifying this address; try again in a moment', true, 15_000);
        await clock.sleep(pollDelay);
        continue;
      }
      case 222: return err('smtp_unavailable', "The address's mail server gave an unexpected answer; try again later", true, 60_000);
      case 400: return err('bad_email', (await detail(res)) || 'Hunter rejected this address', false);
      case 401: return err('invalid_api_key', 'Hunter rejected the API key', false);
      case 403: {
        const ra = Number(res.headers.get('retry-after'));
        return err('rate_limited', "Hunter's rate limit was reached", true, ra > 0 ? ra * 1000 : 60_000);
      }
      case 429: return err('quota_exceeded', "The Hunter plan's usage limit is reached", false);
      case 451: {
        // The person asked Hunter to stop processing their data: record it, and do not process the address.
        const empty = parseHunterData({});
        return { ok: true, verification: { ...empty, email, provider: 'hunter', outcome: 'do_not_process',
          reason: 'The person has asked not to have their data processed: do not use this address', checkedAt: new Date(clock.now()).toISOString() } };
      }
      default:
        return res.status >= 500 ? err('upstream_error', 'Hunter had a problem on its side', true, 10_000)
          : err('upstream_error', `Hunter answered with HTTP ${res.status}`, false);
    }
  }
  return err('pending', 'Hunter is still verifying this address; try again in a moment', true, 15_000);
}

/** One limiter per server process, so every request shares the same 10/s and 300/min budget. */
export const sharedLimiter = new RateLimiter();
