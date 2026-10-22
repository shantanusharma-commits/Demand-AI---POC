import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { newPasswordField, tokenField } from '@/lib/server/http/schemas';
import { acceptInvite } from '@/lib/server/services/auth';
import { sessionCookieHeader } from '@/lib/server/auth/sessions';

const Body = z.object({ token: tokenField, password: newPasswordField });

export const POST = withApi({ route: 'POST /api/auth/accept-invite', auth: 'public', body: Body }, async ({ body, deps, ip, userAgent }) => {
  const result = await acceptInvite(deps, { ...body, ip, userAgent });
  if (result.ok) {
    return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookieHeader(result.cookie, result.maxAgeSeconds, deps.session.secureCookies) } });
  }
  if (result.reason === 'weak_password') {
    return Response.json({ error: 'Choose a stronger password.', code: 'weak_password', fields: { password: result.problems } }, { status: 400 });
  }
  return Response.json({ error: 'This link is not valid or has expired. Ask your administrator for a new one.', code: 'invalid_link' }, { status: 400 });
});
