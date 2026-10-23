import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { recordSignoff } from '@/lib/server/services/analytics';

const Body = z.object({ kind: z.string().max(40), verdict: z.string().max(60), note: z.string().max(2000).optional() });

// A validator's verdict on one success area, or the sponsor's decision, recorded by a signed-in Admin or Sales manager
// and kept with the evidence they judged (D-27, D-38). Append-only: a later verdict supersedes, the earlier one stays.
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/readout/signoffs', auth: 'unit', permission: 'readout.signoff', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => recordSignoff(s, { userId: tenant!.userId, role: role! }, body));
});
