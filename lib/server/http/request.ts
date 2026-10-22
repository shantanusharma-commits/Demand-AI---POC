// Request helpers shared by route handlers.
import 'server-only';

/**
 * The client address, for rate limiting and pseudonymous session records only. The left-hand entries of
 * X-Forwarded-For are whatever the client sent, so they can't be trusted; the entry added by our own outermost
 * trusted proxy is `trustedHops` from the right (1 = one reverse proxy such as Caddy, nginx or an ALB in front of
 * the app). Next.js fills the header with the socket address when no proxy set it.
 */
export function clientAddress(request: Request, trustedHops = Number(process.env.TRUSTED_PROXY_HOPS) || 1): string {
  const entries = (request.headers.get('x-forwarded-for') ?? '').split(',').map(e => e.trim()).filter(Boolean);
  if (!entries.length) return 'unknown';
  return entries[Math.max(0, entries.length - trustedHops)];
}

/**
 * Whether a state-changing request comes from the app's own pages. The Origin header must equal APP_BASE_URL's
 * origin; outside production the request's own origin is accepted too (local development without a proxy).
 */
export function isSameOrigin(request: Request, appBaseUrl: string | undefined, production: boolean): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set<string>();
  if (appBaseUrl) allowed.add(new URL(appBaseUrl).origin);
  if (!production || !appBaseUrl) allowed.add(new URL(request.url).origin);
  return allowed.has(origin);
}

/** Reads a request body as text, refusing anything larger than maxBytes without buffering all of it. */
export async function readBodyText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
