import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { unattachedIssues } from '@/lib/server/services/lists';

// Issues on no contact in the list: rows that weren't loaded, or the whole file.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/lists/:id/issues', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return { issues: await withTenant(deps.db, tenant!, s => unattachedIssues(s, params.id)) };
});
