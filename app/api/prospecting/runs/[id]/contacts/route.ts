/* GET ?offset&limit&q&filter&sort&dir: one page of the Final list. Search, filter and sort happen here. */
import { getRun, parseQuery, queryContacts } from '@/lib/server/prospecting-runs';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const run = await getRun((await ctx.params).id);
  if (!run) return Response.json({ error: 'run_not_found' }, { status: 404 });
  return Response.json(queryContacts(run, parseQuery(new URL(request.url).searchParams)), { headers: { 'Cache-Control': 'no-store' } });
}
