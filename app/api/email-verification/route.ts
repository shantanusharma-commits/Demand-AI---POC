/* POST { email, refresh? } → verify one address through Hunter.io (or reuse its stored result). */
import { verifyEmail } from '../../../lib/server/email-verification-service.ts';
import type { VerifyResponse } from '@/types/email-verification';

export const dynamic = 'force-dynamic';
export const maxDuration = 150; // a 202 may be polled for a couple of minutes

// Status codes the browser can act on; the body carries the detail.
const HTTP: Record<string, number> = {
  not_configured: 409, invalid_api_key: 502, rate_limited: 429, quota_exceeded: 402, timeout: 504, pending: 202,
  smtp_unavailable: 503, bad_email: 400, upstream_error: 502, network_error: 502,
};

export async function POST(request: Request) {
  let body: { email?: unknown; refresh?: unknown };
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: { code: 'bad_email', message: 'Send JSON: { "email": "…" }', retryable: false } } satisfies VerifyResponse, { status: 400 }); }
  const r = await verifyEmail(typeof body.email === 'string' ? body.email : '', { refresh: body.refresh === true });
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (!r.ok && r.error.retryAfterMs) headers['Retry-After'] = String(Math.ceil(r.error.retryAfterMs / 1000));
  return Response.json(r, { status: r.ok ? 200 : HTTP[r.error.code] ?? 500, headers });
}
