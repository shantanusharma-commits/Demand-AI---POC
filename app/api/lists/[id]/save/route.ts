import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, nameField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { saveList } from '@/lib/server/services/lists';

const Body = z.object({ name: nameField, contactRows: z.array(z.number().int().min(1)).min(1).max(50_000).optional() });

// Saves the list under a name, or (with contactRows) just the selected prospects as a new list.
export const POST = withApi<z.infer<typeof Body>, { id: string }>(
  { route: 'POST /api/lists/:id/save', auth: 'unit', permission: 'lists.write', body: Body, maxBodyBytes: 512 * 1024 },
  async ({ deps, tenant, role, params, body }) => {
    if (!isUuid(params.id)) throw notFound();
    return withTenant(deps.db, tenant!, s => saveList(s, { userId: tenant!.userId, role: role! }, params.id, body), { slowMs: 10_000 });
  });
