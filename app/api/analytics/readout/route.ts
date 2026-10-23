import { withApi } from '@/lib/server/http/api';
import { analyticsQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { readoutView } from '@/lib/server/services/analytics';

// The pilot readout as Markdown, organised by the six success areas (?rep=).
export const GET = withApi({ route: 'GET /api/analytics/readout', auth: 'unit', permission: 'analytics.view' }, async ({ request, deps, tenant, role }) => {
  const q = analyticsQuery(request);
  return withTenant(deps.db, tenant!, s => readoutView(s, { userId: tenant!.userId, role: role! }, q.rep), { label: 'analytics.readout', slowMs: 3_000 });
});
