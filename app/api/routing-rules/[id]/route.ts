import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, uuidField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { deleteRule, saveRule } from '@/lib/server/services/routing';

type P = { id: string };
const Rule = z.object({
  name: z.string().trim().min(1, 'Give the rule a name.').max(120), countries: z.array(z.string().max(80)).max(50).default([]),
  verticals: z.array(z.string().max(80)).max(30).default([]), tiers: z.array(z.string().max(20)).max(4).default([]),
  assignOwner: z.string().max(254).nullable().default(null), targetBusinessUnitId: uuidField.nullable().default(null), active: z.boolean().default(true),
});

// Changes a routing rule (managers); audited.
export const PATCH = withApi<z.infer<typeof Rule>, P>({ route: 'PATCH /api/routing-rules/:id', auth: 'unit', permission: 'routing.manage', body: Rule }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => saveRule(s, { userId: tenant!.userId, role: role! }, params.id, body));
});

export const DELETE = withApi<undefined, P>({ route: 'DELETE /api/routing-rules/:id', auth: 'unit', permission: 'routing.manage' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => deleteRule(s, { userId: tenant!.userId, role: role! }, params.id));
  return { ok: true };
});
