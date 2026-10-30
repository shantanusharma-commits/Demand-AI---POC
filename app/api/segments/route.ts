import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { listSegments } from '@/lib/server/services/segments';

// Every micro-segment in the unit: the rules' own, and those the AI or a person created, with status and usage.
export const GET = withApi({ route: 'GET /api/segments', auth: 'unit', permission: 'setup.view' }, async ({ deps, tenant }) => {
  return { segments: await withTenant(deps.db, tenant!, s => listSegments(s)) };
});
