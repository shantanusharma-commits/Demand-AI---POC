import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { fixItem } from '@/lib/server/services/review';

const Body = z.object({ kind: z.enum(['low', 'deal', 'small']), contactRow: z.number().int().min(1).optional(), segment: z.string().trim().max(120).optional() });

// A reason fixed on the account: the right contact (or another one), a deal worth it anyway, the micro-segment.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/fixes', auth: 'unit', permission: 'review.decide', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  await withTenant(deps.db, tenant!, s => fixItem(s, { userId: tenant!.userId, role: role! }, params.id, body));
  return { ok: true };
});
