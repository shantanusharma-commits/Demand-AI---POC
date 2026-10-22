import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { getEditRow } from '@/lib/server/services/corrections';

type P = { id: string; row: string };

// One person's row for the edit form: their fields as the file has them, the account's state, and the corrections
// already made to the row (G-015). 404 for a row the caller can't see (G-014).
export const GET = withApi<undefined, P>({ route: 'GET /api/lists/:id/contacts/:row', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, role, params }) => {
  const row = Number(params.row);
  if (!isUuid(params.id) || !Number.isInteger(row) || row < 1 || row > 10_000_000) throw notFound();
  return { row: await withTenant(deps.db, tenant!, s => getEditRow(s, { userId: tenant!.userId, role: role! }, params.id, row)) };
});
