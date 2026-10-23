import { withApi } from '@/lib/server/http/api';
import { analyticsQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { learningLoopView } from '@/lib/server/services/analytics';

// The learning loop: acceptance by action, segment, signal and fit, with the outcome records (left out for a Viewer) (?rep=).
export const GET = withApi({ route: 'GET /api/analytics/learning-loop', auth: 'unit', permission: 'analytics.view' }, async ({ request, deps, tenant, role }) => {
  const q = analyticsQuery(request);
  return withTenant(deps.db, tenant!, s => learningLoopView(s, { userId: tenant!.userId, role: role! }, q.rep), { label: 'analytics.loop', slowMs: 3_000 });
});
