import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { getProspect } from '@/lib/server/services/scoring';

// One prospect's score with its reasoning. Another owner's prospect is "not found" for a rep (G-014, IDOR).
export const GET = withApi<undefined, { id: string; contactId: string }>(
  { route: 'GET /api/scoring-runs/:id/prospects/:contactId', auth: 'unit', permission: 'lists.view' },
  async ({ deps, tenant, params }) => {
    if (!isUuid(params.id) || !isUuid(params.contactId)) throw notFound();
    return { prospect: await withTenant(deps.db, tenant!, s => getProspect(s, params.id, params.contactId)) };
  });
