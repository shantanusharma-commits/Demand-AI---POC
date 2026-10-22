// Liveness and readiness. /api/health says the process is up and which build it runs (a redeploy checks the new
// version is live). /api/ready says it can serve: the database answers and every migration this build expects
// has been applied. Neither reveals configuration, host names or error text.
import 'server-only';
import type pg from 'pg';
import journal from '../../drizzle/meta/_journal.json' with { type: 'json' };
import { logger } from './logger.ts';

const started = Date.now();

export function health(version: string) {
  return { status: 'ok' as const, version, uptimeSeconds: Math.round((Date.now() - started) / 1000) };
}

export type Readiness = {
  status: 'ready' | 'not-ready';
  checks: { database: 'ok' | 'down' | 'not-configured'; migrations: 'ok' | 'pending' | 'unknown' };
};

const expected = journal.entries.length;
const latestWhen = journal.entries.reduce((max, e) => Math.max(max, e.when), 0);

/** Checks the database within timeoutMs. Pass null when DATABASE_URL is not configured. */
export async function readiness(pool: pg.Pool | null, timeoutMs = 2000): Promise<Readiness> {
  if (!pool) return { status: 'not-ready', checks: { database: 'not-configured', migrations: 'unknown' } };
  let timer: NodeJS.Timeout | undefined;
  try {
    const query = pool.query<{ n: number; latest: string | null }>(
      'SELECT count(*)::int AS n, max(created_at)::text AS latest FROM drizzle.__drizzle_migrations');
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('readiness check timed out')), timeoutMs); });
    const { rows } = await Promise.race([query, timeout]);
    const applied = rows[0];
    const current = applied.n >= expected && Number(applied.latest) >= latestWhen;
    if (!current) logger.warn({ event: 'ready.migrations_pending', applied: applied.n, expected }, 'Database is behind this build');
    return { status: current ? 'ready' : 'not-ready', checks: { database: 'ok', migrations: current ? 'ok' : 'pending' } };
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 42P01: the migrations table doesn't exist yet, so the database answers but nothing is migrated.
    if (code === '42P01') return { status: 'not-ready', checks: { database: 'ok', migrations: 'pending' } };
    logger.warn({ event: 'ready.database_down', err }, 'Readiness check could not reach the database');
    return { status: 'not-ready', checks: { database: 'down', migrations: 'unknown' } };
  } finally {
    clearTimeout(timer);
  }
}
