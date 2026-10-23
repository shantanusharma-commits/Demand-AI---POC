import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { today } from '@/lib/server/services/today';

// Today: what waits for the signed-in person (or, for a manager, the team), the blockers, the outcomes to mark and the
// success gates, all from the database. Opening it draws the week's spot-checks, as For Review does.
export const GET = withApi({ route: 'GET /api/today', auth: 'unit', permission: 'today.view' }, async ({ deps, tenant, role }) => {
  return withTenant(deps.db, tenant!, s => today(s, { userId: tenant!.userId, role: role! }), { label: 'today', slowMs: 2_000 });
});
