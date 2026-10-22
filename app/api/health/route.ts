import { env } from '@/lib/server/env';
import { health } from '@/lib/server/health';

// Liveness: no dependencies, so an orchestrator never restarts the app because the database is slow.
export function GET() {
  return Response.json(health(env().APP_BUILD_VERSION), { headers: { 'cache-control': 'no-store' } });
}
