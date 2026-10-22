/* GET ?q&filter&selectable=1: the row numbers of every matching contact, so "select all N" reaches past the page on screen. */
import { contactRows, getRun, parseQuery } from '@/lib/server/prospecting-runs';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const run = await getRun((await ctx.params).id);
  if (!run) return Response.json({ error: 'run_not_found' }, { status: 404 });
  const sp = new URL(request.url).searchParams;
  return Response.json({ rows: contactRows(run, parseQuery(sp), sp.get('selectable') === '1') }, { headers: { 'Cache-Control': 'no-store' } });
}
