/* POST { rows?, summary? }: what a saved list stores (contacts, accounts, counts), for everyone or just `rows`.
   With summary: only the counts. This is the one place the whole list leaves the server: when it is saved for Scoring. */
import { exportRun, exportSummary, getRun } from '@/lib/server/prospecting-runs';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const run = await getRun((await ctx.params).id);
  if (!run) return Response.json({ error: 'run_not_found' }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { rows?: unknown; summary?: unknown };
  const rows = Array.isArray(body.rows) ? body.rows.filter((n): n is number => typeof n === 'number') : undefined;
  return Response.json(body.summary === true && rows ? exportSummary(run, rows) : exportRun(run, rows));
}
