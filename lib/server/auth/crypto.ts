// Small cryptographic helpers for sign-in: signed session cookies, one-time link tokens, pseudonymous hashes.
import 'server-only';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const b64url = (buf: Buffer) => buf.toString('base64url');

/** `<sessionId>.<HMAC-SHA256(secret, sessionId)>`, the same primitive as the RFP service's session cookie. */
export function signSessionId(sessionId: string, secret: string): string {
  return `${sessionId}.${b64url(createHmac('sha256', secret).update(sessionId).digest())}`;
}

/** The session ID if the signature is valid (timing-safe compare), otherwise null. */
export function verifySessionCookie(value: string | undefined | null, secret: string): string | null {
  if (!value || value.length > 200) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const expected = Buffer.from(signSessionId(id, secret).slice(dot + 1));
  const given = Buffer.from(value.slice(dot + 1));
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** A one-time link token: `<id>.<secret>` with a 256-bit secret. Only sha256(secret) is stored. */
export function newLinkToken(): { id: string; secret: string; token: string; hash: string } {
  const id = randomUUID();
  const secret = b64url(randomBytes(32));
  return { id, secret, token: `${id}.${secret}`, hash: sha256Hex(secret) };
}

export function parseLinkToken(token: string | undefined | null): { id: string; secret: string } | null {
  if (!token || token.length > 200) return null;
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{40,60})$/i.exec(token.trim());
  return m ? { id: m[1], secret: m[2] } : null;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A keyed, truncated hash for values that identify a person (IP, email) in rate-limit keys and sessions. */
export function pseudonym(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value.trim().toLowerCase()).digest('hex').slice(0, 32);
}
