import { withApi } from '@/lib/server/http/api';
import { csvDownload } from '@/lib/server/http/download';
import { withTenant } from '@/lib/server/db/tenant';
import { reviewExport } from '@/lib/server/services/review';

// Released tasks for the team, with a call script, as a file (owner-scoped; formulas neutralised, G-052).
export const GET = withApi({ route: 'GET /api/exports/tasks.csv', auth: 'unit', permission: 'review.decide' }, async ({ deps, tenant, role }) => {
  const file = await withTenant(deps.db, tenant!, s => reviewExport(s, { userId: tenant!.userId, role: role! }, 'tasks'), { label: 'review.export', slowMs: 5_000 });
  return csvDownload(file.fileName, file.csv);
});
