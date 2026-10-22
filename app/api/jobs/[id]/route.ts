import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { getJob } from '@/lib/server/jobs/queue';

// A background job's real progress (G-043), polled by the screen while an upload is checked or a list is scored.
export const GET = withApi<undefined, { id: string }>({ route: 'GET /api/jobs/:id', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const job = await withTenant(deps.db, tenant!, s => getJob(s, params.id), { label: 'job.get' });
  if (!job) throw notFound('That job is not there any more.');
  return { job };
});
