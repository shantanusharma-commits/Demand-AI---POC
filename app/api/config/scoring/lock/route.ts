import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { setScoringLock } from '@/lib/server/services/setup';

const Body = z.object({ mode: z.enum(['open', 'locked', 'sponsor']), note: z.string().trim().max(300).default('') });

// Locks the scoring settings for the measurement weeks, opens them only with the sponsor's sign-off, or unlocks them
// (Admin). A new configuration version, like any Setup change.
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/config/scoring/lock', auth: 'unit', permission: 'setup.signOff', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => setScoringLock(s, { userId: tenant!.userId, role: role! }, body));
});
