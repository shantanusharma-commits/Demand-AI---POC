import { withApi } from '@/lib/server/http/api';
import { analyticsQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { weeklyView } from '@/lib/server/services/analytics';

// The weekly summary for the business-unit lead (?week=2026-W43&rep=), compared with the week before.
export const GET = withApi({ route: 'GET /api/analytics/weekly', auth: 'unit', permission: 'analytics.view' }, async ({ request, deps, tenant, role }) => {
  const q = analyticsQuery(request);
  return withTenant(deps.db, tenant!, s => weeklyView(s, { userId: tenant!.userId, role: role! }, q), { label: 'analytics.weekly', slowMs: 3_000 });
});
