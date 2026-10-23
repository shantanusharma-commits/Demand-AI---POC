import { withApi } from '@/lib/server/http/api';
import { analyticsQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { gatesView } from '@/lib/server/services/analytics';

// G1 and G2 from the shared decision log, judged by the unit's settings (D-21), and how decisions were made (?rep=).
export const GET = withApi({ route: 'GET /api/analytics/gates', auth: 'unit', permission: 'analytics.view' }, async ({ request, deps, tenant, role }) => {
  const q = analyticsQuery(request);
  return withTenant(deps.db, tenant!, s => gatesView(s, { userId: tenant!.userId, role: role! }, q.rep), { label: 'analytics.gates', slowMs: 3_000 });
});
