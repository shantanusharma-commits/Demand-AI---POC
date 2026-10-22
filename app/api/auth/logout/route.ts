import { withApi } from '@/lib/server/http/api';
import { logout } from '@/lib/server/services/auth';
import { clearSessionCookieHeader } from '@/lib/server/auth/sessions';

export const POST = withApi({ route: 'POST /api/auth/logout', auth: 'user' }, async ({ session, deps }) => {
  await logout(deps, session!.sessionId, session!.user.id);
  return Response.json({ ok: true }, { headers: { 'set-cookie': clearSessionCookieHeader(deps.session.secureCookies) } });
});
