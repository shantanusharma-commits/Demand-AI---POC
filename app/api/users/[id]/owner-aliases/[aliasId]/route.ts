import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { removeOwnerAlias } from '@/lib/server/services/users';

export const DELETE = withApi<undefined, { id: string; aliasId: string }>(
  { route: 'DELETE /api/users/:id/owner-aliases/:aliasId', auth: 'unit', permission: 'users.manage' },
  async ({ deps, tenant, role, params }) => {
    if (!isUuid(params.id) || !isUuid(params.aliasId)) throw notFound();
    await withTenant(deps.db, tenant!, s => removeOwnerAlias(s, { userId: tenant!.userId, role: role! }, params.id, params.aliasId));
    return { ok: true };
  });
