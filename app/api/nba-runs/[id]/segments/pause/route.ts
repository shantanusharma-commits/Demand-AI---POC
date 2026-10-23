import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { notFound } from '@/lib/server/http/errors';
import { isUuid } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { setSegmentPaused } from '@/lib/server/services/nba';

// 6.3 A manager pauses a micro-segment ('' is the group with no micro-segment): its items can't be used or decided
// until it is resumed.
const Body = z.object({ segment: z.string().trim().max(120), reason: z.string().trim().max(500).default('') });

export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/nba-runs/:id/segments/pause', auth: 'unit', permission: 'segments.pause', body: Body }, async ({ deps, tenant, role, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  return withTenant(deps.db, tenant!, s => setSegmentPaused(s, { userId: tenant!.userId, role: role! }, params.id, body.segment, true, body.reason));
});
