import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { decideSegment } from '@/lib/server/services/segments';
import { releaseForSegment } from '@/lib/server/services/review';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['approve', 'retire', 'restore']) }),
  z.object({ action: z.literal('rename'), name: z.string().trim().min(2).max(60) }),
  z.object({ action: z.literal('merge'), into: z.string().trim().min(1).max(80) }),
]);

// A sales manager approves, renames, merges or retires a micro-segment the AI or a person created.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/segments/:id', auth: 'unit', permission: 'review.approve', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => decideSegment(s, { userId: tenant!.userId, role: role! }, params.id, body, releaseForSegment));
});
