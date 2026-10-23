import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { checkFlagged } from '@/lib/server/services/review';

// A manager checks a flagged decision (too fast, or one of a run of identical ones): a new log row linked to it, after
// which it counts toward G2.
export const POST = withApi<undefined, { id: string }>({ route: 'POST /api/decision-log/:id/check', auth: 'unit', permission: 'review.approve' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => checkFlagged(s, { userId: tenant!.userId, role: role! }, params.id));
  return { ok: true };
});
