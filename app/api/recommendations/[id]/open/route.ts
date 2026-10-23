import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { openItem } from '@/lib/server/services/recommendations';

// Records, by the server's clock, when the caller opened the item: the decision timer runs from here.
export const POST = withApi<undefined, { id: string }>({ route: 'POST /api/recommendations/:id/open', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => openItem(s, { userId: tenant!.userId, role: role! }, params.id));
});
