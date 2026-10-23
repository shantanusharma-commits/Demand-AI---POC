import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { setContent } from '@/lib/server/services/studio';

const Body = z.object({ ids: z.array(z.string().uuid()).max(10), scope: z.enum(['one', 'all']) });

// Pieces from the Content library added to this email or LinkedIn message, or to every message with the same action in
// its micro-segment. Logged on the item.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/content', auth: 'unit', permission: 'review.decide', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => setContent(s, { userId: tenant!.userId, role: role! }, params.id, body));
});
