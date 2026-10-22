/* Verify one address: reuse a stored result when there is one, otherwise ask Hunter and store the answer (server only). */
import type { VerifyResponse } from '../../types/email-verification.ts';
import { verifyWithHunter, type VerifyOptions } from './hunter.ts';
import { getHunterKey } from './secure-store.ts';
import { getStored, keyOf, putStored } from './verification-store.ts';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const inFlight = new Map<string, Promise<VerifyResponse>>();

export async function verifyEmail(raw: string, { refresh = false, hunter }: { refresh?: boolean; hunter?: Partial<VerifyOptions> } = {}): Promise<VerifyResponse> {
  const email = keyOf(raw || '');
  if (!EMAIL_RE.test(email)) return { ok: false, error: { code: 'bad_email', message: 'That is not a well-formed email address', retryable: false } };

  if (!refresh) {
    const hit = (await getStored([email]))[email];
    if (hit) return { ok: true, verification: hit, reused: true };
  }
  // The same address asked for twice at once (two tabs, a double click) costs one call.
  const running = inFlight.get(email);
  if (running) return running;

  const job = (async (): Promise<VerifyResponse> => {
    const k = await getHunterKey();
    if (!k) return { ok: false, error: { code: 'not_configured', message: 'No Hunter.io API key is set. Add one in Setup, or set HUNTER_API_KEY.', retryable: false } };
    const r = await verifyWithHunter(email, { apiKey: k.key, ...hunter });
    if (r.ok === false) return { ok: false, error: r.error };
    await putStored(r.verification);
    return { ok: true, verification: r.verification, reused: false };
  })();
  inFlight.set(email, job);
  try { return await job; } finally { inFlight.delete(email); }
}
