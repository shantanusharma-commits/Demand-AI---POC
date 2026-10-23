import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { aiGateway } from '@/lib/server/ai';
import { aiStatus } from '@/lib/server/services/ai-admin';

// Where AI calls go, which capabilities are on, and the last 30 days of calls in the unit (Admin). Never a key.
export const GET = withApi({ route: 'GET /api/admin/ai', auth: 'unit', permission: 'ai.admin' }, async ({ deps, tenant }) => {
  return withTenant(deps.db, tenant!, s => aiStatus(s, aiGateway()));
});
