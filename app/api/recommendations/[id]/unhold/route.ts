import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { holdItem } from '@/lib/server/services/review';

// Takes an item off hold: back in the queue.
export const POST = withApi<undefined, { id: string }>({ route: 'POST /api/recommendations/:id/unhold', auth: 'unit', permission: 'review.decide' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => holdItem(s, { userId: tenant!.userId, role: role! }, params.id, null));
  return { ok: true };
});
