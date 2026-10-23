import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { approveItem } from '@/lib/server/services/review';

const Edit = z.object({ subject: z.string().max(300).optional(), body: z.string().max(10_000).optional(), note: z.string().max(1000).optional(), task: z.string().max(2000).optional() });
const Body = z.object({ draft: Edit.optional(), tags: z.array(z.string().max(60)).max(10).default([]) });

// Step 5 · The sales manager approves a sensitive item (any edit versioned first) and it is released.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/approve', auth: 'unit', permission: 'review.approve', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => approveItem(s, { userId: tenant!.userId, role: role! }, params.id, body));
});
