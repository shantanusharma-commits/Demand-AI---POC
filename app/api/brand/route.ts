import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { getBrand } from '@/lib/server/services/brand';

// The brand pack in use, the unit's unsaved changes with what they change, and every version (G-009).
export const GET = withApi({ route: 'GET /api/brand', auth: 'unit', permission: 'content.view' }, async ({ deps, tenant }) => {
  return { brand: await withTenant(deps.db, tenant!, s => getBrand(s)) };
});
