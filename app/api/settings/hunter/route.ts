/* The Hunter.io API key: configured here, never sent back. GET says whether a key exists; PUT saves; DELETE removes. */
import { clearHunterKey, getHunterKey, saveHunterKey } from '../../../../lib/server/secure-store.ts';
import type { HunterSettingsStatus } from '@/types/email-verification';

export const dynamic = 'force-dynamic';
const noStore = { headers: { 'Cache-Control': 'no-store' } };

async function status(): Promise<HunterSettingsStatus> {
  const k = await getHunterKey();
  return { configured: !!k, source: k ? k.source : null };
}

export async function GET() {
  return Response.json(await status(), noStore);
}

export async function PUT(request: Request) {
  let body: { apiKey?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Send JSON: { "apiKey": "…" }' }, { status: 400, ...noStore }); }
  const key = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (key.length < 8 || key.length > 200 || /\s/.test(key)) return Response.json({ error: 'That does not look like a Hunter.io API key' }, { status: 400, ...noStore });
  await saveHunterKey(key);
  return Response.json(await status(), noStore);
}

export async function DELETE() {
  await clearHunterKey();
  return Response.json(await status(), noStore);
}
