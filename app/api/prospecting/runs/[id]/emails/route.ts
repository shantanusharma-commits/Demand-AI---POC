/* POST { rows? }: the addresses to verify, being those contacts' (or everyone's) emails, minus opt-outs. */
import { emailsFor, getRun } from '@/lib/server/prospecting-runs';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const run = await getRun((await ctx.params).id);
  if (!run) return Response.json({ error: 'run_not_found' }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { rows?: unknown };
  const rows = Array.isArray(body.rows) ? body.rows.filter((n): n is number => typeof n === 'number') : undefined;
  return Response.json({ emails: emailsFor(run, rows) });
}
