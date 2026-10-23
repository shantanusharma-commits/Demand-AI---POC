import { withApi } from '@/lib/server/http/api';
import { analyticsQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { areasView } from '@/lib/server/services/analytics';

// The six success areas (D-38), each with its measured evidence (?rep= for a manager). Reps see their own results.
export const GET = withApi({ route: 'GET /api/analytics/areas', auth: 'unit', permission: 'analytics.view' }, async ({ request, deps, tenant, role }) => {
  const q = analyticsQuery(request);
  return withTenant(deps.db, tenant!, s => areasView(s, { userId: tenant!.userId, role: role! }, q.rep), { label: 'analytics.areas', slowMs: 3_000 });
});
