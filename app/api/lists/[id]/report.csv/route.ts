import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { csvDownload } from '@/lib/server/http/download';
import { withTenant } from '@/lib/server/db/tenant';
import { reportCsv } from '@/lib/server/services/lists';

// The validation report: every finding the caller can see, with its check and D-code (G-015), as a CSV download.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/lists/:id/report.csv', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const file = await withTenant(deps.db, tenant!, s => reportCsv(s, params.id));
  return csvDownload(file.fileName, file.csv);
});
