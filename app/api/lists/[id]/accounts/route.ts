import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, pageQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { listAccounts } from '@/lib/server/services/lists';

export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/lists/:id/accounts', auth: 'unit', permission: 'lists.view' }, async ({ request, deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const q = pageQuery(request, { filter: z.enum(['pass', 'excluded', 'review']).optional() });
  return withTenant(deps.db, tenant!, s => listAccounts(s, params.id, q));
});
