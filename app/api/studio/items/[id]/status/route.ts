import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { setReady } from '@/lib/server/services/studio';

const Body = z.object({ ready: z.boolean() });

// Into the Content library (only when every brand and claim check passes), or back to draft.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/studio/items/:id/status', auth: 'unit', permission: 'studio.use', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => setReady(s, { userId: tenant!.userId, role: role! }, params.id, body.ready));
});
