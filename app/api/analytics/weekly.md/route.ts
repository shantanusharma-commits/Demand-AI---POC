import { withApi } from '@/lib/server/http/api';
import { markdownDownload } from '@/lib/server/http/download';
import { analyticsQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { weeklyMarkdown, weeklyView } from '@/lib/server/services/analytics';

// The weekly summary as a Markdown file (?week=&rep=): the same text the screen shows.
export const GET = withApi({ route: 'GET /api/analytics/weekly.md', auth: 'unit', permission: 'analytics.view' }, async ({ request, deps, tenant, role }) => {
  const q = analyticsQuery(request);
  const w = await withTenant(deps.db, tenant!, s => weeklyView(s, { userId: tenant!.userId, role: role! }, q), { label: 'analytics.weekly', slowMs: 3_000 });
  return markdownDownload(`weekly_summary_${w.week}.md`, weeklyMarkdown(w));
});
