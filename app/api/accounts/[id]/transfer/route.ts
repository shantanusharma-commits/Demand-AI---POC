import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, reasonField, uuidField } from '@/lib/server/http/schemas';
import { env } from '@/lib/server/env';
import { withTenant } from '@/lib/server/db/tenant';
import { uploadLimits } from '@/lib/server/services/uploads';
import { transferAccount } from '@/lib/server/services/routing';

const Body = z.object({ toBusinessUnitId: uuidField, reason: reasonField });

// Moves an account to another business unit where the caller is also a manager (D-34): its rows go there as a lead
// file and arrive as a saved list; this unit stops handing it off. Audited in both units.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/accounts/:id/transfer', auth: 'unit', permission: 'routing.transfer', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  const result = await withTenant(deps.db, tenant!, s => transferAccount(s, { userId: tenant!.userId, role: role! }, params.id, body, uploadLimits(env())), { label: 'routing.transfer', slowMs: 5_000 });
  return Response.json(result, { status: 201 });
});
