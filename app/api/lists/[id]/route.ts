import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, nameField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { deleteList, getList, renameList } from '@/lib/server/services/lists';

type P = { id: string };

export const GET = withApi<undefined, P>({ route: 'GET /api/lists/:id', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return { list: await withTenant(deps.db, tenant!, s => getList(s, { userId: tenant!.userId, role: role! }, params.id)) };
});

const Rename = z.object({ name: nameField });

export const PATCH = withApi<z.infer<typeof Rename>, P>({ route: 'PATCH /api/lists/:id', auth: 'unit', permission: 'lists.write', body: Rename }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => renameList(s, { userId: tenant!.userId, role: role! }, params.id, body.name));
  return { ok: true };
});

export const DELETE = withApi<undefined, P>({ route: 'DELETE /api/lists/:id', auth: 'unit', permission: 'lists.write' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => deleteList(s, { userId: tenant!.userId, role: role! }, params.id));
});
