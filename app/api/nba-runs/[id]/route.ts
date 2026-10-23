import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, nameField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { getNbaRun, renameNbaRun } from '@/lib/server/services/nba';

type P = { id: string };

// One build: its micro-segments, pauses and build steps, and the recommendations the caller can see.
export const GET = withApi<undefined, P>({ route: 'GET /api/nba-runs/:id', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return { run: await withTenant(deps.db, tenant!, s => getNbaRun(s, params.id)) };
});

const Rename = z.object({ name: nameField });

export const PATCH = withApi<z.infer<typeof Rename>, P>({ route: 'PATCH /api/nba-runs/:id', auth: 'unit', permission: 'nba.run', body: Rename }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => renameNbaRun(s, { userId: tenant!.userId, role: role! }, params.id, body.name));
  return { ok: true };
});
