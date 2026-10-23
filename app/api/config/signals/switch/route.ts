import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { switchSignal } from '@/lib/server/services/setup';

const Body = z.object({ type: z.string().trim().min(1).max(80), on: z.boolean(), reason: z.string().trim().max(500).default('') });

// Switches a scored signal type off (a reason is required) or back on (Admin). New runs only (G-023).
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/config/signals/switch', auth: 'unit', permission: 'setup.signals', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => switchSignal(s, { userId: tenant!.userId, role: role! }, body));
});
