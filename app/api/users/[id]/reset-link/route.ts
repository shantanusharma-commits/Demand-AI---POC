import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { issueResetLink } from '@/lib/server/services/users';

// Returns the one-time link only when it could not be emailed (copy-link fallback).
export const POST = withApi<undefined, { id: string }>(
  { route: 'POST /api/users/:id/reset-link', auth: 'unit', permission: 'users.manage' },
  async ({ deps, tenant, role, params }) => {
    if (!isUuid(params.id)) throw notFound();
    return withTenant(deps.db, tenant!, s => issueResetLink(deps, s, { userId: tenant!.userId, role: role! }, params.id));
  });
