import { withApi } from '@/lib/server/http/api';
import { analyticsQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { evidenceView } from '@/lib/server/services/analytics';

// Supporting evidence: acceptance by tier, decision reasons and codes, edits, data-quality reasons, decision time (?rep=).
export const GET = withApi({ route: 'GET /api/analytics/evidence', auth: 'unit', permission: 'analytics.view' }, async ({ request, deps, tenant, role }) => {
  const q = analyticsQuery(request);
  return withTenant(deps.db, tenant!, s => evidenceView(s, { userId: tenant!.userId, role: role! }, q.rep), { label: 'analytics.evidence', slowMs: 3_000 });
});
