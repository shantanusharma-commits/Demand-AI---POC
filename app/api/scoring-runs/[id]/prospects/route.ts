import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, pageQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { listProspects } from '@/lib/server/services/scoring';

// Ranked prospects a page at a time (keyset on the rank), with server search. Reps get their own prospects.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/scoring-runs/:id/prospects', auth: 'unit', permission: 'lists.view' }, async ({ request, deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const q = pageQuery(request, { tier: z.enum(['A', 'B', 'C', 'Watch list', 'out']).optional() });
  return withTenant(deps.db, tenant!, s => listProspects(s, params.id, q));
});
