import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, nameField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { deleteRun, getRun, renameRun } from '@/lib/server/services/scoring';

type P = { id: string };

export const GET = withApi<undefined, P>({ route: 'GET /api/scoring-runs/:id', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return { run: await withTenant(deps.db, tenant!, s => getRun(s, { userId: tenant!.userId, role: role! }, params.id)) };
});

const Rename = z.object({ name: nameField });

export const PATCH = withApi<z.infer<typeof Rename>, P>({ route: 'PATCH /api/scoring-runs/:id', auth: 'unit', permission: 'scoring.run', body: Rename }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => renameRun(s, { userId: tenant!.userId, role: role! }, params.id, body.name));
  return { ok: true };
});

export const DELETE = withApi<undefined, P>({ route: 'DELETE /api/scoring-runs/:id', auth: 'unit', permission: 'scoring.run' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => deleteRun(s, { userId: tenant!.userId, role: role! }, params.id));
  return { ok: true };
});
