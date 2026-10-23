import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { undoAutopilot } from '@/lib/server/services/autopilot';

// The person who ran Autopilot puts its items back in For Review (items changed since are left as they are).
export const POST = withApi<undefined, { id: string }>({ route: 'POST /api/copilot/autopilot/:id/undo', auth: 'unit', permission: 'review.decide' }, async ({ deps, tenant, role, params }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => undoAutopilot(s, { userId: tenant!.userId, role: role! }, params.id), { label: 'autopilot.undo' });
});
