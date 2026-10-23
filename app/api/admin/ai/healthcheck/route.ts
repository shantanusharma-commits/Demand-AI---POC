import { withApi } from '@/lib/server/http/api';
import { aiGateway } from '@/lib/server/ai';
import { healthCheck } from '@/lib/server/services/ai-admin';

// One tiny model call (plan §8): ok, provider, deployment and latency; never the key (Admin).
export const POST = withApi({ route: 'POST /api/admin/ai/healthcheck', auth: 'unit', permission: 'ai.admin' }, async ({ deps, tenant, role }) => {
  return healthCheck(deps.db, tenant!, { userId: tenant!.userId, role: role! }, aiGateway());
});
