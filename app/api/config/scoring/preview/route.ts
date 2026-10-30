import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { previewScoring } from '@/lib/server/services/setup';

const Body = z.object({ settings: z.unknown() });

// How many accounts of the newest scored list would change tier with these settings, before they are saved (Admin).
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/config/scoring/preview', auth: 'unit', permission: 'setup.signals', body: Body }, async ({ deps, tenant, body }) => {
  return withTenant(deps.db, tenant!, s => previewScoring(s, body.settings), { label: 'setup.preview', slowMs: 5_000 });
});
