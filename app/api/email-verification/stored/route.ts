/* POST { emails } → the stored results that are still fresh, without calling Hunter. Lets a list show what is already known. */
import { getStored } from '../../../../lib/server/verification-store.ts';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { emails?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Send JSON: { "emails": […] }' }, { status: 400 }); }
  const emails = Array.isArray(body.emails) ? body.emails.filter((e): e is string => typeof e === 'string').slice(0, 5000) : [];
  return Response.json({ results: await getStored(emails) }, { headers: { 'Cache-Control': 'no-store' } });
}
