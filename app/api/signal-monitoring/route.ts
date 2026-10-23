import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { signalMonitoring } from '@/lib/server/services/signal-monitoring';

// What has come in per signal type, from the signal files scored so far (G-023). Reps count their own accounts' rows.
export const GET = withApi({ route: 'GET /api/signal-monitoring', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant }) => {
  return { monitoring: await withTenant(deps.db, tenant!, s => signalMonitoring(s)) };
});
