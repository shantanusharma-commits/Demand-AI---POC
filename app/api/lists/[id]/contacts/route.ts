import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, pageQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { listContacts } from '@/lib/server/services/lists';

// The final list a page at a time (keyset on the sheet row), with server search (G-022). Reps get their own rows.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/lists/:id/contacts', auth: 'unit', permission: 'lists.view' }, async ({ request, deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const q = pageQuery(request, { group: z.enum(['in', 'nc', 'out']).optional() });
  return withTenant(deps.db, tenant!, s => listContacts(s, params.id, q));
});
