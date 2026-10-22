// One-time links for invites (72 hours) and password resets (30 minutes). A new link voids the user's older
// unused links for the same purpose. Links carry the token in the URL fragment (#token=…), which browsers never
// send to the server or in a Referer header, so it can't end up in proxy or access logs.
import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { emailTokens } from '../db/schema.ts';
import type { Tx } from '../db/tenant.ts';
import { hashesEqual, newLinkToken, parseLinkToken, sha256Hex } from './crypto.ts';

export type TokenPurpose = 'invite' | 'password_reset';
export const TOKEN_LIFETIME_MS: Record<TokenPurpose, number> = { invite: 72 * 3600_000, password_reset: 30 * 60_000 };
export const INVITE_HOURS = 72;
export const RESET_MINUTES = 30;

export async function issueToken(tx: Tx, input: { userId: string; purpose: TokenPurpose; businessUnitId?: string | null; createdBy: string }): Promise<string> {
  await tx.update(emailTokens).set({ usedAt: new Date() })
    .where(and(eq(emailTokens.userId, input.userId), eq(emailTokens.purpose, input.purpose), isNull(emailTokens.usedAt)));
  const t = newLinkToken();
  await tx.insert(emailTokens).values({
    id: t.id, userId: input.userId, purpose: input.purpose, tokenHash: t.hash, businessUnitId: input.businessUnitId ?? null,
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS[input.purpose]), createdBy: input.createdBy,
  });
  return t.token;
}

/**
 * Locks and checks a token without using it up, so the caller can validate the new password first and call
 * markUsed() in the same transaction. Null for anything wrong: malformed, unknown, wrong purpose, used, expired.
 */
export async function lockValidToken(tx: Tx, token: string, purpose: TokenPurpose): Promise<{ tokenId: string; userId: string; businessUnitId: string | null } | null> {
  const parsed = parseLinkToken(token);
  if (!parsed) return null;
  const [row] = await tx.select().from(emailTokens).where(and(eq(emailTokens.id, parsed.id), eq(emailTokens.purpose, purpose))).for('update');
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) return null;
  if (!hashesEqual(row.tokenHash, sha256Hex(parsed.secret))) return null;
  return { tokenId: row.id, userId: row.userId, businessUnitId: row.businessUnitId };
}

export async function markUsed(tx: Tx, tokenId: string): Promise<void> {
  await tx.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, tokenId));
}

export function linkFor(appBaseUrl: string, purpose: TokenPurpose, token: string): string {
  const path = purpose === 'invite' ? '/accept-invite' : '/reset-password';
  return `${appBaseUrl.replace(/\/+$/, '')}${path}#token=${token}`;
}
