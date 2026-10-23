import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { reviewQueue } from '@/lib/server/services/review';

// For Review: the caller's queue and the approvals waiting, with why each needs a person and the measures behind the
// tiles. Opening it draws the week's spot-checks and starts the clock for decisions made from a row.
export const GET = withApi({ route: 'GET /api/review/queue', auth: 'unit', permission: 'review.decide' }, async ({ deps, tenant, role }) => {
  return withTenant(deps.db, tenant!, s => reviewQueue(s, { userId: tenant!.userId, role: role! }), { label: 'review.queue', slowMs: 2_000 });
});
