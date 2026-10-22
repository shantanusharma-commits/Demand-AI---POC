import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { memberHistory } from '@/lib/server/services/users';

export const GET = withApi<undefined, { id: string }>(
  { route: 'GET /api/users/:id/history', auth: 'unit', permission: 'users.view' },
  async ({ deps, tenant, params }) => {
    if (!isUuid(params.id)) throw notFound();
    return { history: await withTenant(deps.db, tenant!, s => memberHistory(s, params.id)) };
  });
