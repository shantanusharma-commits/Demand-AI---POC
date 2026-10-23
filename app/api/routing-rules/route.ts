import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { uuidField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { getRules, saveRule } from '@/lib/server/services/routing';

const Rule = z.object({
  name: z.string().trim().min(1, 'Give the rule a name.').max(120), countries: z.array(z.string().max(80)).max(50).default([]),
  verticals: z.array(z.string().max(80)).max(30).default([]), tiers: z.array(z.string().max(20)).max(4).default([]),
  assignOwner: z.string().max(254).nullable().default(null), targetBusinessUnitId: uuidField.nullable().default(null), active: z.boolean().default(true),
});

// The unit's routing rules (D-34), in order, with what each says, and the choices for writing one.
export const GET = withApi({ route: 'GET /api/routing-rules', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant }) => {
  return withTenant(deps.db, tenant!, s => getRules(s));
});

// Adds a rule at the end of the list (managers).
export const POST = withApi<z.infer<typeof Rule>>({ route: 'POST /api/routing-rules', auth: 'unit', permission: 'routing.manage', body: Rule }, async ({ deps, tenant, role, body }) => {
  return Response.json(await withTenant(deps.db, tenant!, s => saveRule(s, { userId: tenant!.userId, role: role! }, null, body)), { status: 201 });
});
