import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { saveScoring } from '@/lib/server/services/setup';

const Body = z.object({
  settings: z.unknown(),
  reason: z.string().trim().max(500).default(''),
  sponsor: z.object({ name: z.string().trim().max(120), note: z.string().trim().max(500).default('') }).nullable().optional(),
});

// Saves the scoring settings (Admin): the rubric and its parts, personas, knock-outs, region and signal weights. A new
// configuration version, with what changed in words; lists and runs already made keep theirs.
export const PUT = withApi<z.infer<typeof Body>>({ route: 'PUT /api/config/scoring', auth: 'unit', permission: 'setup.signals', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => saveScoring(s, { userId: tenant!.userId, role: role! }, body));
});
