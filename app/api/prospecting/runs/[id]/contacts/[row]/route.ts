/* GET: the full record behind one row (account, every issue, the whole verification result). Fetched when a row is opened. */
import { contactDetail, getRun } from '@/lib/server/prospecting-runs';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; row: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id, row } = await ctx.params;
  const run = await getRun(id);
  if (!run) return Response.json({ error: 'run_not_found' }, { status: 404 });
  const d = contactDetail(run, Number(row));
  return d ? Response.json(d, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'contact_not_found' }, { status: 404 });
}
