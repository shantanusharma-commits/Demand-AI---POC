import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, pageQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { listSignals } from '@/lib/server/services/scoring';

export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/scoring-runs/:id/signals', auth: 'unit', permission: 'lists.view' }, async ({ request, deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const q = pageQuery(request, { status: z.enum(['Qualified', 'Rejected', 'Not used', 'Used for a knock-out']).optional() });
  return withTenant(deps.db, tenant!, s => listSignals(s, params.id, q));
});
