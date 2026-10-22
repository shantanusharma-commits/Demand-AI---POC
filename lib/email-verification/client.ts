/* Browser side of email verification: calls our own API routes (the Hunter key never reaches the browser).
   Bulk runs send a few requests at once; the server holds the real 10/s and 300/min limit and answers 429 with a wait
   when it is busy, which is retried here. */
import { isFailure } from '../../types/email-verification.ts';
import type { EmailVerification, HunterSettingsStatus, VerifyError, VerifyResponse } from '../../types/email-verification.ts';

export interface BulkItem { email: string; result: VerifyResponse }
export interface BulkProgress { done: number; total: number; ok: number; failed: number; reused: number; waitingMs: number }
export interface BulkOptions {
  concurrency?: number;
  maxAttempts?: number;
  refresh?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: BulkProgress) => void;
  onItem?: (item: BulkItem) => void;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const sleepReal = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const fail = (code: VerifyError['code'], message: string, retryable: boolean, retryAfterMs?: number): VerifyResponse => ({ ok: false, error: { code, message, retryable, retryAfterMs } });

export async function verifyOne(email: string, { refresh = false, fetchFn = fetch, signal }: { refresh?: boolean; fetchFn?: typeof fetch; signal?: AbortSignal } = {}): Promise<VerifyResponse> {
  try {
    const res = await fetchFn('/api/email-verification', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, refresh }), signal });
    const body = await res.json() as VerifyResponse;
    if (body && typeof body === 'object' && 'ok' in body) return body;
    return fail('upstream_error', 'Unexpected answer from the server', true, 5000);
  } catch (e) {
    return (e as Error)?.name === 'AbortError' ? fail('network_error', 'Cancelled', false) : fail('network_error', 'Could not reach the server', true, 3000);
  }
}

/** Verifies many addresses (each once, however often it appears). Retries what is worth retrying; results come back in input order. */
export async function verifyMany(emails: string[], o: BulkOptions = {}): Promise<BulkItem[]> {
  const concurrency = Math.max(1, o.concurrency ?? 4), maxAttempts = Math.max(1, o.maxAttempts ?? 3);
  const sleep = o.sleep ?? sleepReal;
  const unique = [...new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, VerifyResponse>();
  const p: BulkProgress = { done: 0, total: unique.length, ok: 0, failed: 0, reused: 0, waitingMs: 0 };
  let next = 0, stopped = false;
  // A missing key, a bad key or an exhausted plan fails every remaining address the same way: stop instead of repeating it.
  const fatal = new Set<VerifyError['code']>(['not_configured', 'invalid_api_key', 'quota_exceeded']);

  async function worker() {
    while (!stopped && !o.signal?.aborted) {
      const i = next++;
      if (i >= unique.length) return;
      const email = unique[i];
      let r: VerifyResponse = fail('network_error', 'Not attempted', true);
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        r = await verifyOne(email, { refresh: o.refresh, fetchFn: o.fetchFn, signal: o.signal });
        if (!isFailure(r) || !r.error.retryable || attempt === maxAttempts || o.signal?.aborted) break;
        const wait = Math.min(r.error.retryAfterMs ?? 2000 * attempt, 65_000);
        p.waitingMs = wait; o.onProgress?.({ ...p });
        await sleep(wait);
        p.waitingMs = 0;
      }
      out.set(email, r);
      p.done++;
      if (isFailure(r)) { p.failed++; if (fatal.has(r.error.code)) stopped = true; } else { p.ok++; if (r.reused) p.reused++; }
      o.onItem?.({ email, result: r });
      o.onProgress?.({ ...p });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return unique.filter(e => out.has(e)).map(email => ({ email, result: out.get(email)! }));
}

/** Results already stored on the server, without spending a Hunter call. */
export async function loadStored(emails: string[], fetchFn: typeof fetch = fetch): Promise<Record<string, EmailVerification>> {
  if (!emails.length) return {};
  try {
    const res = await fetchFn('/api/email-verification/stored', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emails }) });
    return res.ok ? (await res.json() as { results: Record<string, EmailVerification> }).results : {};
  } catch { return {}; }
}

export async function getHunterStatus(fetchFn: typeof fetch = fetch): Promise<HunterSettingsStatus | null> {
  try { const res = await fetchFn('/api/settings/hunter', { cache: 'no-store' }); return res.ok ? await res.json() as HunterSettingsStatus : null; } catch { return null; }
}
export async function saveHunterApiKey(apiKey: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true; status: HunterSettingsStatus } | { ok: false; message: string }> {
  try {
    const res = await fetchFn('/api/settings/hunter', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey }) });
    const body = await res.json();
    return res.ok ? { ok: true, status: body } : { ok: false, message: body.error || 'Could not save the key' };
  } catch { return { ok: false, message: 'Could not reach the server' }; }
}
export async function removeHunterApiKey(fetchFn: typeof fetch = fetch): Promise<HunterSettingsStatus | null> {
  try { const res = await fetchFn('/api/settings/hunter', { method: 'DELETE' }); return res.ok ? await res.json() as HunterSettingsStatus : null; } catch { return null; }
}
