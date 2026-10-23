import { withApi } from '@/lib/server/http/api';
import { csvDownload } from '@/lib/server/http/download';
import { analyticsQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { outcomeLogCsv } from '@/lib/server/services/analytics';

// The outcome log: one record per recommendation (owner-scoped, ?rep= for a manager; formulas neutralised, G-052).
export const GET = withApi({ route: 'GET /api/exports/outcome-log.csv', auth: 'unit', permission: 'review.decide' }, async ({ request, deps, tenant, role }) => {
  const q = analyticsQuery(request);
  const file = await withTenant(deps.db, tenant!, s => outcomeLogCsv(s, { userId: tenant!.userId, role: role! }, q.rep), { label: 'analytics.export', slowMs: 5_000 });
  return csvDownload(file.fileName, file.csv);
});
