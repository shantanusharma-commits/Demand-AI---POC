import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { saveActions } from '@/lib/server/services/setup';

const Body = z.object({ actions: z.unknown(), reason: z.string().trim().max(500).default('') });

// Saves the action library (Admin): actions added, edited or retired. A new configuration version, with what changed.
export const PUT = withApi<z.infer<typeof Body>>({ route: 'PUT /api/config/actions', auth: 'unit', permission: 'setup.signals', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => saveActions(s, { userId: tenant!.userId, role: role! }, body));
});
