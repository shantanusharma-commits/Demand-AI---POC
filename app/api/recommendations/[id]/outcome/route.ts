import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { OUTCOMES } from '@/lib/engine/review';
import { markOutcome } from '@/lib/server/services/recommendations';

const Body = z.object({ outcome: z.enum(OUTCOMES) });

// What happened after the rep sent a released message themselves; a booked meeting brings a call script.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/outcome', auth: 'unit', permission: 'review.decide', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => markOutcome(s, { userId: tenant!.userId, role: role! }, params.id, body.outcome));
});
