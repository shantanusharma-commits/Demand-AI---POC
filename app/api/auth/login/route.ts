import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { emailField } from '@/lib/server/http/schemas';
import { login } from '@/lib/server/services/auth';
import { sessionCookieHeader } from '@/lib/server/auth/sessions';

const Body = z.object({ email: emailField, password: z.string().min(1).max(200) });

export const POST = withApi({ route: 'POST /api/auth/login', auth: 'public', body: Body }, async ({ body, deps, ip, userAgent }) => {
  const result = await login(deps, { ...body, ip, userAgent });
  if (result.ok) {
    return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookieHeader(result.cookie, result.maxAgeSeconds, deps.session.secureCookies) } });
  }
  if (result.reason === 'rate_limited') {
    return Response.json({ error: 'Too many sign-in attempts. Wait a few minutes and try again.', code: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(result.retryAfterSeconds ?? 900) } });
  }
  return Response.json({ error: 'Email or password is incorrect.', code: 'invalid_credentials' }, { status: 401 });
});
