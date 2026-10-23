import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { sendBack } from '@/lib/server/services/review';

const Body = z.object({ note: z.string().max(500) });

// The sales manager sends a sensitive item back to the rep, saying what should change.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/send-back', auth: 'unit', permission: 'review.approve', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => sendBack(s, { userId: tenant!.userId, role: role! }, params.id, body.note));
  return { ok: true };
});
