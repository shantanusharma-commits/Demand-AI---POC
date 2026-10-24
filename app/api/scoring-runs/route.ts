import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { LIMITS } from '@/lib/server/auth/rate-limit';
import { uuidField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { activeSignalSettings, savedRuns, startScoringRun } from '@/lib/server/services/scoring';

// The saved runs, and the signal settings a new run would take (G-023: the start screen marks switched-off and added types).
export const GET = withApi({ route: 'GET /api/scoring-runs', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant }) => {
  return withTenant(deps.db, tenant!, async s => {
    const { configVersionId: _c, ...signalSettings } = await activeSignalSettings(s);
    void _c;
    return { runs: await savedRuns(s), signalSettings };
  });
});

// The as-of date is checked in full by the service (a real date, not in the future, G-061).
const Start = z.object({ listId: uuidField, signalUploadId: uuidField, asOf: z.string().max(20) });

export const POST = withApi({ route: 'POST /api/scoring-runs', auth: 'unit', permission: 'scoring.run', body: Start, limit: LIMITS.scoringRun }, async ({ deps, tenant, role, body }) => {
  const result = await withTenant(deps.db, tenant!, s => startScoringRun(s, { userId: tenant!.userId, role: role! }, body));
  return Response.json(result, { status: 201 });
});
