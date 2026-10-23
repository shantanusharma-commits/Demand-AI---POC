import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { getSetup } from '@/lib/server/services/setup';

// The unit's Setup: the active configuration version, sign-offs, signal switches with their audit trail, the versions,
// and tags seen in signal files that are not signal types yet (G-002).
export const GET = withApi({ route: 'GET /api/config', auth: 'unit', permission: 'setup.view' }, async ({ deps, tenant }) => {
  return { setup: await withTenant(deps.db, tenant!, s => getSetup(s)) };
});
