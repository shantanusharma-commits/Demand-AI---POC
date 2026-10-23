import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { teach } from '@/lib/server/services/review';

const Body = z.object({ tags: z.array(z.string().max(60)).max(10).default([]), note: z.string().max(500).default('') });

// Teach the system: what it got right or wrong, logged for the learning loop.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/teach', auth: 'unit', permission: 'review.decide', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => teach(s, { userId: tenant!.userId, role: role! }, params.id, body));
  return { ok: true };
});
