import { withApi } from '@/lib/server/http/api';
import { markdownDownload } from '@/lib/server/http/download';
import { analyticsQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { readoutView } from '@/lib/server/services/analytics';

// The pilot readout as a Markdown file (?rep=): the same text the screen shows. No PDF export (G-011).
export const GET = withApi({ route: 'GET /api/analytics/readout.md', auth: 'unit', permission: 'analytics.view' }, async ({ request, deps, tenant, role }) => {
  const q = analyticsQuery(request);
  const r = await withTenant(deps.db, tenant!, s => readoutView(s, { userId: tenant!.userId, role: role! }, q.rep), { label: 'analytics.readout', slowMs: 3_000 });
  return markdownDownload('pilot_readout.md', r.text);
});
