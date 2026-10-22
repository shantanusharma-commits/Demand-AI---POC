import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, pageQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { issuesForCheck, unattachedIssues } from '@/lib/server/services/lists';
import { CHECK_KEYS } from '@/lib/prospecting/checks';

// With ?check=: that check's findings a page at a time (the check pane, G-015). Without: the issues on no contact in
// the list (rows that weren't loaded, or the whole file). Reps get their own rows' findings and the whole-file notes.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/lists/:id/issues', auth: 'unit', permission: 'lists.view' }, async ({ request, deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const q = pageQuery(request, { check: z.enum(CHECK_KEYS).optional() });
  if (q.check) { const check = q.check; return withTenant(deps.db, tenant!, s => issuesForCheck(s, params.id, check, q)); }
  return { issues: await withTenant(deps.db, tenant!, s => unattachedIssues(s, params.id)) };
});
