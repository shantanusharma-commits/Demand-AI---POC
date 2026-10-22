import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { emailField, isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { addOwnerAlias } from '@/lib/server/services/users';

const Body = z.object({ ownerEmail: emailField });

export const POST = withApi<z.infer<typeof Body>, { id: string }>(
  { route: 'POST /api/users/:id/owner-aliases', auth: 'unit', permission: 'users.manage', body: Body },
  async ({ deps, tenant, role, body, params }) => {
    if (!isUuid(params.id)) throw notFound();
    const created = await withTenant(deps.db, tenant!, s => addOwnerAlias(s, { userId: tenant!.userId, role: role! }, params.id, body.ownerEmail));
    return Response.json(created, { status: 201 });
  });
