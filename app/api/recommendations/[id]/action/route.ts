import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { chooseAction } from '@/lib/server/services/review';

const Body = z.object({ use: z.enum(['recommended', 'runner-up', 'own']), text: z.string().max(300).optional() });

// The recommended action, the runner-up or the reviewer's own; the message is redrafted for it. After release only the
// first two, and only to one that passes every check (stepping in).
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/action', auth: 'unit', permission: 'review.decide', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => chooseAction(s, { userId: tenant!.userId, role: role! }, params.id, body));
});
