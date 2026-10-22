import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { uuidField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { createHandoff } from '@/lib/server/services/handoffs';

const Body = z.object({ runId: uuidField, contactIds: z.array(uuidField).min(1).max(5000).optional() });

// Hands prospects with a live signal to Micro-segments & NBA: the selected ones, or every tier A and B prospect.
export const POST = withApi({ route: 'POST /api/handoffs', auth: 'unit', permission: 'handoff.create', body: Body, maxBodyBytes: 256 * 1024 }, async ({ deps, tenant, role, body }) => {
  const result = await withTenant(deps.db, tenant!, s => createHandoff(s, { userId: tenant!.userId, role: role! }, body));
  return Response.json(result, { status: 201 });
});
