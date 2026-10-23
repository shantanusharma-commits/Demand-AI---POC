import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { getItem, saveBlocks } from '@/lib/server/services/studio';

// One piece, with its blocks, checks and the conversation that wrote it.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/studio/items/:id', auth: 'unit', permission: 'studio.use' }, async ({ deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => getItem(s, params.id));
});

const Body = z.object({ blocks: z.unknown(), rev: z.number().int().min(1) });

// A person's own edits, saved as they type (refused when someone else saved in between).
export const PUT = withApi<z.infer<typeof Body>, { id: string }>({ route: 'PUT /api/studio/items/:id', auth: 'unit', permission: 'studio.use', body: Body, maxBodyBytes: 512 * 1024 }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => saveBlocks(s, { userId: tenant!.userId, role: role! }, params.id, { blocks: body.blocks, rev: body.rev }));
});
