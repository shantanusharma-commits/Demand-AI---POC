import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, nameField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { saveRun } from '@/lib/server/services/scoring';

const Body = z.object({ name: nameField });

export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/scoring-runs/:id/save', auth: 'unit', permission: 'scoring.run', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => saveRun(s, { userId: tenant!.userId, role: role! }, params.id, body.name));
  return { ok: true };
});
