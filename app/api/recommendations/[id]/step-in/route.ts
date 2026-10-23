import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { stepIn } from '@/lib/server/services/review';

// A rep steps in on an item that went ahead on its own: back to their queue as an intervention.
export const POST = withApi<undefined, { id: string }>({ route: 'POST /api/recommendations/:id/step-in', auth: 'unit', permission: 'review.decide' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => stepIn(s, { userId: tenant!.userId, role: role! }, params.id));
  return { ok: true };
});
