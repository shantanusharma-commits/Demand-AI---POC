import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { transfers } from '@/lib/server/services/routing';

// Accounts moved out of this business unit, and into it (D-34).
export const GET = withApi({ route: 'GET /api/transfers', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant }) => {
  return withTenant(deps.db, tenant!, s => transfers(s));
});
