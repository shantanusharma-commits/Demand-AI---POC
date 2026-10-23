import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { removeSignalType } from '@/lib/server/services/setup';

const Body = z.object({ name: z.string().trim().min(1).max(80), reason: z.string().trim().max(500).default('') });

// Removes a signal type added in Setup (Admin): new runs treat its tag as unknown again.
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/config/signals/remove', auth: 'unit', permission: 'setup.signals', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => removeSignalType(s, { userId: tenant!.userId, role: role! }, body));
});
