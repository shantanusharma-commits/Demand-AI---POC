/* GET: the run's summary (counts, what each of the 12 steps found). Never the rows. */
import { getRun, summarise } from '@/lib/server/prospecting-runs';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const run = await getRun((await ctx.params).id);
  return run ? Response.json(summarise(run)) : Response.json({ error: 'run_not_found' }, { status: 404 });
}
