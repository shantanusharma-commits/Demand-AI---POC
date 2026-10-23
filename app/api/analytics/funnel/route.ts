import { withApi } from '@/lib/server/http/api';
import { analyticsQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { funnelView } from '@/lib/server/services/analytics';

// The work-done funnel, from the stored lists, runs and builds and the decision log (?rep=).
export const GET = withApi({ route: 'GET /api/analytics/funnel', auth: 'unit', permission: 'analytics.view' }, async ({ request, deps, tenant, role }) => {
  const q = analyticsQuery(request);
  return withTenant(deps.db, tenant!, s => funnelView(s, { userId: tenant!.userId, role: role! }, q.rep), { label: 'analytics.funnel', slowMs: 3_000 });
});
