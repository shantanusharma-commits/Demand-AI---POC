import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { env } from '@/lib/server/env';
import { receiveSample, uploadLimits } from '@/lib/server/services/uploads';

const Body = z.object({ kind: z.enum(['lead', 'signal']) });

// "Use sample data": the fictional sample, through the same checks as an upload, marked sandbox.
export const POST = withApi({ route: 'POST /api/uploads/sample', auth: 'unit', permission: 'data.upload', body: Body }, async ({ deps, tenant, body }) => {
  const result = await withTenant(deps.db, tenant!, s => receiveSample(s, body.kind, uploadLimits(env())));
  return Response.json(result, { status: 201 });
});
