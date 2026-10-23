import { withApi } from '@/lib/server/http/api';
import { jsonDownload } from '@/lib/server/http/download';
import { withTenant } from '@/lib/server/db/tenant';
import { exportConfig } from '@/lib/server/services/setup';

// The active configuration as a JSON file, with what was signed off and the signal changes (was a false toast, G-002).
export const GET = withApi({ route: 'GET /api/config/export', auth: 'unit', permission: 'setup.view' }, async ({ deps, tenant, role }) => {
  const file = await withTenant(deps.db, tenant!, s => exportConfig(s, { userId: tenant!.userId, role: role! }));
  return jsonDownload(file.fileName, file.json);
});
