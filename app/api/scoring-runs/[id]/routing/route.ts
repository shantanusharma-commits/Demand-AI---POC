import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { runRouting } from '@/lib/server/services/routing';

// How the run's scored accounts route (D-34): the rule each matches, the owner it names for accounts without one, the
// business unit it belongs to, and whether it has been moved. Owner-scoped for reps.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/scoring-runs/:id/routing', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => runRouting(s, params.id));
});
