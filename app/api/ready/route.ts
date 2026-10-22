import { env } from '@/lib/server/env';
import { readiness } from '@/lib/server/health';
import { getPool } from '@/lib/server/db/pool';

// Readiness: 200 only when the database answers and has every migration this build expects; 503 otherwise.
export async function GET() {
  const result = await readiness(env().DATABASE_URL ? getPool() : null);
  return Response.json(result, { status: result.status === 'ready' ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
