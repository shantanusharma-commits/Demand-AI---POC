import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { csvDownload } from '@/lib/server/http/download';
import { withTenant } from '@/lib/server/db/tenant';
import { nbaRunCsv } from '@/lib/server/services/nba';

// A build as a file: every recommendation the caller can see, where it is now and its message (owner-scoped; formulas
// neutralised, G-052).
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/nba-runs/:id/export.csv', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const file = await withTenant(deps.db, tenant!, s => nbaRunCsv(s, { userId: tenant!.userId, role: role! }, params.id), { label: 'nba.export', slowMs: 5_000 });
  return csvDownload(file.fileName, file.csv);
});
