import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { reassign } from '@/lib/server/services/review';

const Body = z.object({ ownerEmail: z.string().max(254) });

// Step 10 · A manager moves an item to another sales rep's queue ('' leaves it unassigned).
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/reassign', auth: 'unit', permission: 'review.approve', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => reassign(s, { userId: tenant!.userId, role: role! }, params.id, body.ownerEmail));
});
