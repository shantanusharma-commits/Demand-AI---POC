import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { itemDetail } from '@/lib/server/services/recommendations';

// One recommendation as the drawer and For Review show it: the action, the exact message and its checks, the
// evidence, every version and the history. 404 when it is not the caller's (G-014).
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/recommendations/:id', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return { item: await withTenant(deps.db, tenant!, s => itemDetail(s, { userId: tenant!.userId, role: role! }, params.id)) };
});
