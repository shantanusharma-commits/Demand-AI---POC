/* Stored email verifications (server only): one record per address, so a result is bought once and reused. */
import path from 'node:path';
import type { EmailVerification } from '../../types/email-verification.ts';
import { dataDir, readJson, withFileLock, writeJson } from './secure-store.ts';

const file = () => path.join(dataDir(), 'email-verifications.json');
const DAY = 86_400_000;
/** A conclusive answer is reused for a month (Hunter's own date can be that old); an inconclusive one only for a day. */
export const REUSE_MS = { conclusive: 30 * DAY, inconclusive: DAY };

export const keyOf = (email: string) => email.trim().toLowerCase();

export function isFresh(v: EmailVerification, now: number): boolean {
  const age = now - Date.parse(v.checkedAt);
  if (!(age >= 0)) return false;
  return age < (v.outcome === 'inconclusive' ? REUSE_MS.inconclusive : REUSE_MS.conclusive);
}

export async function getStored(emails: string[], now = Date.now()): Promise<Record<string, EmailVerification>> {
  const all = await readJson<Record<string, EmailVerification>>(file(), {});
  const out: Record<string, EmailVerification> = {};
  for (const e of emails) { const v = all[keyOf(e)]; if (v && isFresh(v, now)) out[keyOf(e)] = v; }
  return out;
}

export async function putStored(v: EmailVerification): Promise<void> {
  await withFileLock(file(), async () => {
    const all = await readJson<Record<string, EmailVerification>>(file(), {});
    all[keyOf(v.email)] = v;
    await writeJson(file(), all);
  });
}
