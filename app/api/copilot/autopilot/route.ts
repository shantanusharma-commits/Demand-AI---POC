import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { uuidField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { runAutopilot } from '@/lib/server/services/autopilot';

const Body = z.object({ kind: z.enum(['spot', 'exception']), ids: z.array(uuidField).min(1).max(200), instruction: z.string().max(300) });

// Autopilot runs the plan a person confirmed in Copilot: each item is checked again, and only low-risk ones are taken
// (never sensitive content). Logged under the person's name; not counted toward G2.
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/copilot/autopilot', auth: 'unit', permission: 'review.decide', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => runAutopilot(s, { userId: tenant!.userId, role: role! }, body), { label: 'autopilot.run', slowMs: 5_000 });
});
