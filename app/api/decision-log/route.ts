import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { pageQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { decisionLogRows } from '@/lib/server/services/review';

// Who decided what, when and why, newest first (?before=<seq>&limit=&q=&flagged=1). A rep sees their own decisions.
export const GET = withApi({ route: 'GET /api/decision-log', auth: 'unit', permission: 'review.decide' }, async ({ request, deps, tenant, role }) => {
  const q = pageQuery(request, { before: z.coerce.number().int().min(1).optional(), flagged: z.enum(['1']).optional() });
  return withTenant(deps.db, tenant!, s => decisionLogRows(s, { userId: tenant!.userId, role: role! }, { before: q.before, limit: q.limit, q: q.q, flagged: q.flagged === '1' }));
});
