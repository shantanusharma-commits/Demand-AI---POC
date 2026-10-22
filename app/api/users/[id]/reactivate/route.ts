import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, reasonField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { restoreMember } from '@/lib/server/services/users';

const Body = z.object({ reason: reasonField });

export const POST = withApi<z.infer<typeof Body>, { id: string }>(
  { route: 'POST /api/users/:id/reactivate', auth: 'unit', permission: 'users.manage', body: Body },
  async ({ deps, tenant, role, body, params }) => {
    if (!isUuid(params.id)) throw notFound();
    await withTenant(deps.db, tenant!, s => restoreMember(s, { userId: tenant!.userId, role: role! }, params.id, body.reason));
    return { ok: true };
  });
