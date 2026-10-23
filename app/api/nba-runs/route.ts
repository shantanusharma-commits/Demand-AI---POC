import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { uuidField } from '@/lib/server/http/schemas';
import { withTenant } from '@/lib/server/db/tenant';
import { buildNbaRun, listNbaRuns } from '@/lib/server/services/nba';

// Every micro-segment build in the unit (with the caller's own counts), what can be built from, and booked meetings
// whose call script hasn't been opened.
export const GET = withApi({ route: 'GET /api/nba-runs', auth: 'unit', permission: 'lists.view' }, async ({ deps, tenant }) => {
  return withTenant(deps.db, tenant!, s => listNbaRuns(s));
});

const Body = z.object({ handoffId: uuidField.optional(), scoringRunId: uuidField.optional() })
  .refine(b => !!b.handoffId !== !!b.scoringRunId, 'Give either a hand-off or a scoring run.');

// Groups a stored hand-off (or a saved scoring run's tier A and B prospects) into micro-segments, with one checked
// first action per account, routed to go ahead, to a rep, or to the sales manager (G-006).
export const POST = withApi<z.infer<typeof Body>>({ route: 'POST /api/nba-runs', auth: 'unit', permission: 'nba.run', body: Body }, async ({ deps, tenant, role, body }) => {
  const result = await withTenant(deps.db, tenant!, s => buildNbaRun(s, { userId: tenant!.userId, role: role! }, body), { label: 'nba.build', slowMs: 5_000 });
  return Response.json(result, { status: 201 });
});
