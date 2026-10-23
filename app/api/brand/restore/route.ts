import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { restoreVersion } from '@/lib/server/services/brand';

const Body = z.object({ versionNo: z.number().int().min(1) });

// Makes an earlier brand version the one in use again, as a new version (Admin, Sales manager).
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/brand/restore', auth: 'unit', permission: 'brand.manage', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => restoreVersion(s, { userId: tenant!.userId, role: role! }, body.versionNo));
});
