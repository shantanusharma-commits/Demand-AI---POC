import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { acceptItem } from '@/lib/server/services/review';

const Edit = z.object({ subject: z.string().max(300).optional(), body: z.string().max(10_000).optional(), note: z.string().max(1000).optional(), task: z.string().max(2000).optional() });
const Body = z.object({ draft: Edit.optional(), assignedSegment: z.string().trim().max(120).optional(), tags: z.array(z.string().max(60)).max(10).default([]),
  note: z.string().max(500).default(''), queuePosition: z.number().int().min(1).max(100_000).optional(), fromRow: z.boolean().default(false) });

// Step 3 · Accept, or rate a spot-check, with any edit rated and kept as a new version. A rep's sensitive item goes to
// the sales manager; anything else is released. Timed from when the caller opened it or was shown the queue.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/recommendations/:id/accept', auth: 'unit', permission: 'review.decide', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => acceptItem(s, { userId: tenant!.userId, role: role! }, params.id, body));
});
