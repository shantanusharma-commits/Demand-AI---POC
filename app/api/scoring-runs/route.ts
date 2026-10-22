import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { uuidField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { savedRuns, startScoringRun } from '@/lib/server/services/scoring';

export const GET = withApi({ route: 'GET /api/scoring-runs', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant }) => {
  return { runs: await withTenant(deps.db, tenant!, s => savedRuns(s)) };
});

// The as-of date is checked in full by the service (a real date, not in the future, G-061).
const Start = z.object({ listId: uuidField, signalUploadId: uuidField, asOf: z.string().max(20) });

export const POST = withApi({ route: 'POST /api/scoring-runs', auth: 'unit', permission: 'scoring.run', body: Start }, async ({ deps, tenant, role, body }) => {
  const result = await withTenant(deps.db, tenant!, s => startScoringRun(s, { userId: tenant!.userId, role: role! }, body));
  return Response.json(result, { status: 201 });
});
