import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { emailField } from '@/lib/server/http/schemas';
import { requestPasswordReset } from '@/lib/server/services/auth';

const Body = z.object({ email: emailField });

// The reply is the same whether or not the address has an account.
export const POST = withApi({ route: 'POST /api/auth/forgot', auth: 'public', body: Body }, async ({ body, deps, ip, userAgent }) => {
  await requestPasswordReset(deps, { email: body.email, ip, userAgent });
  return { ok: true, emailEnabled: deps.mailer.enabled };
});
