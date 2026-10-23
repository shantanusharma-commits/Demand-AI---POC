import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { moveRule } from '@/lib/server/services/routing';

const Body = z.object({ direction: z.enum(['up', 'down']) });

// Moves a rule one place up or down: the first rule that matches routes the account.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/routing-rules/:id/move', auth: 'unit', permission: 'routing.manage', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => moveRule(s, { userId: tenant!.userId, role: role! }, params.id, body.direction));
  return { ok: true };
});
