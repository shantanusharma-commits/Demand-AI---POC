import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, pageQuery } from '@/lib/server/http/schemas';
import { csvDownload } from '@/lib/server/http/download';
import { withTenant } from '@/lib/server/db/tenant';
import { checkCsv } from '@/lib/server/services/lists';
import { CHECK_KEYS } from '@/lib/prospecting/checks';

// One check's findings as a CSV download (G-015), neutralised against formulas (G-052). Reps get their own rows.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/lists/:id/issues.csv', auth: 'unit', permission: 'lists.view' }, async ({ request, deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const { check } = pageQuery(request, { check: z.enum(CHECK_KEYS) });
  const file = await withTenant(deps.db, tenant!, s => checkCsv(s, params.id, check));
  return csvDownload(file.fileName, file.csv);
});
