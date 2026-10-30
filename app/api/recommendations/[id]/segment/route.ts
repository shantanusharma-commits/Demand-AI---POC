import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { changeSegment } from '@/lib/server/services/review';

const Body = z.object({ segment: z.string().max(60), reason: z.string().max(300) });

// F2 · Move an item waiting in For Review to another micro-segment, with the reason; the message is redrafted for it.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/segment', auth: 'unit', permission: 'review.decide', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => changeSegment(s, { userId: tenant!.userId, role: role! }, params.id, body));
});
