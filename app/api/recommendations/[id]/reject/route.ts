import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { rejectItem } from '@/lib/server/services/review';

const Body = z.object({ code: z.string().max(4), note: z.string().max(500).default(''), tags: z.array(z.string().max(60)).max(10).default([]),
  queuePosition: z.number().int().min(1).max(100_000).optional(), fromRow: z.boolean().default(false) });

// Step 6 · Reject with a reason (R1–R12, R3 included): the reason decides the one alternative that comes back, or
// where the account goes.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/reject', auth: 'unit', permission: 'review.decide', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => rejectItem(s, { userId: tenant!.userId, role: role! }, params.id, body));
});
