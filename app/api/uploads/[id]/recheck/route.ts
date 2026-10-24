import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { LIMITS } from '@/lib/server/auth/rate-limit';
import { notFound } from '@/lib/server/http/errors';
import { isUuid, uuidField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { recheckUpload } from '@/lib/server/services/lists';

const Body = z.object({ mappingId: uuidField.nullable() });

// Checks an uploaded lead file again with a saved column mapping (G-040), without sending the file again.
export const POST = withApi<z.infer<typeof Body>, { id: string }>({ route: 'POST /api/uploads/:id/recheck', auth: 'unit', permission: 'data.upload', body: Body, limit: LIMITS.upload }, async ({ deps, tenant, params, body }) => {
  if (!isUuid(params.id)) throw notFound();
  const result = await withTenant(deps.db, tenant!, s => recheckUpload(s, params.id, body.mappingId));
  return Response.json(result, { status: 201 });
});
