import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { nameField, pageQuery } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { listMappings, saveMapping } from '@/lib/server/services/mappings';

const Kind = z.enum(['lead', 'signal']);

// Saved column mappings of the unit (G-040), by kind of file.
export const GET = withApi({ route: 'GET /api/column-mappings', auth: 'unit', permission: 'lists.view' }, async ({ request, deps, tenant }) => {
  const { kind } = pageQuery(request, { kind: Kind.default('lead') });
  return { mappings: await withTenant(deps.db, tenant!, s => listMappings(s, kind)) };
});

const Body = z.object({ kind: Kind, name: nameField, mapping: z.record(z.string().trim().min(1).max(200), z.string().max(60)).refine(m => Object.keys(m).length <= 200, 'Too many columns.') });

export const POST = withApi({ route: 'POST /api/column-mappings', auth: 'unit', permission: 'lists.write', body: Body }, async ({ deps, tenant, role, body }) => {
  const result = await withTenant(deps.db, tenant!, s => saveMapping(s, { userId: tenant!.userId, role: role! }, body));
  return Response.json(result, { status: 201 });
});
