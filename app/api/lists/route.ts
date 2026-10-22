import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { savedLists } from '@/lib/server/services/lists';

export const GET = withApi({ route: 'GET /api/lists', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant }) => {
  return { lists: await withTenant(deps.db, tenant!, s => savedLists(s)) };
});
