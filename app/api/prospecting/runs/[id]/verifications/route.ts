/* POST { emails }: bring the stored Hunter results for those addresses into the run; answers with the new counts.
   The browser only names addresses: what a result says always comes from the server's own store. */
import { getRun, syncVerifications } from '@/lib/server/prospecting-runs';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const run = await getRun((await ctx.params).id);
  if (!run) return Response.json({ error: 'run_not_found' }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { emails?: unknown };
  const emails = Array.isArray(body.emails) ? body.emails.filter((e): e is string => typeof e === 'string').slice(0, 5000) : [];
  return Response.json({ stats: await syncVerifications(run, emails) });
}
