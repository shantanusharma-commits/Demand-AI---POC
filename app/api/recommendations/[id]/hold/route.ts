import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { holdItem } from '@/lib/server/services/review';

const Body = z.object({ why: z.string().max(80), note: z.string().max(300).default('') });

// Put on hold: it waits at the end of the queue until it is taken off hold. Nothing is sent.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/hold', auth: 'unit', permission: 'review.decide', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => holdItem(s, { userId: tenant!.userId, role: role! }, params.id, body));
  return { ok: true };
});
