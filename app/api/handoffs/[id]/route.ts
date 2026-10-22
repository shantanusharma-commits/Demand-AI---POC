import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { getHandoff } from '@/lib/server/services/handoffs';

export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/handoffs/:id', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return { handoff: await withTenant(deps.db, tenant!, s => getHandoff(s, params.id)) };
});
