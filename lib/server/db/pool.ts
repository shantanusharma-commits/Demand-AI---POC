// The PostgreSQL connection pool: TLS per DATABASE_SSL_MODE, statement and idle-transaction timeouts, error
// listeners (a dropped idle connection must never crash the process), and a clean close on shutdown.
import 'server-only';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { env } from '../env.ts';
import { logger } from '../logger.ts';

export type SslMode = 'disable' | 'require' | 'verify-full';

export function sslOptions(mode: SslMode | undefined, caFile: string | undefined, production: boolean): pg.ConnectionConfig['ssl'] {
  const m = mode ?? (production ? 'verify-full' : 'disable');
  if (m === 'disable') return false;
  if (m === 'require') return { rejectUnauthorized: false };
  return caFile ? { rejectUnauthorized: true, ca: readFileSync(caFile, 'utf8') } : { rejectUnauthorized: true };
}

/** Removes sslmode-style query parameters so the explicit `ssl` option is the only TLS setting. */
export function stripSslParams(url: string): string {
  const u = new URL(url);
  for (const k of ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey']) u.searchParams.delete(k);
  return u.toString();
}

export function createPool(options: { url: string; ssl: pg.ConnectionConfig['ssl']; max: number; statementTimeoutMs: number }): pg.Pool {
  const pool = new pg.Pool({
    connectionString: stripSslParams(options.url),
    ssl: options.ssl,
    max: options.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: options.statementTimeoutMs,
    idle_in_transaction_session_timeout: 60_000,
    application_name: 'demandai',
  });
  pool.on('error', err => logger.error({ event: 'db.pool.error', err }, 'An idle database connection failed'));
  pool.on('connect', client => {
    client.on('error', err => logger.error({ event: 'db.client.error', err }, 'A database connection failed'));
  });
  return pool;
}

// Kept on globalThis: Next bundles server code into several chunks (pages, route handlers, instrumentation), each
// with its own copy of this module, and the process must still share one pool.
const holder = globalThis as typeof globalThis & { __demandaiPool?: pg.Pool };

/** The process-wide pool, created on first use from DATABASE_URL. */
export function getPool(): pg.Pool {
  if (holder.__demandaiPool) return holder.__demandaiPool;
  const e = env();
  if (!e.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const shared = createPool({
    url: e.DATABASE_URL,
    ssl: sslOptions(e.DATABASE_SSL_MODE, e.DATABASE_SSL_CA_FILE, e.NODE_ENV === 'production'),
    max: e.DATABASE_POOL_MAX,
    statementTimeoutMs: e.DATABASE_STATEMENT_TIMEOUT_MS,
  });
  logger.info({ event: 'db.pool.created', max: e.DATABASE_POOL_MAX }, 'Database pool created');
  const close = () => { void closePool(); };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
  holder.__demandaiPool = shared;
  return shared;
}

export async function closePool(): Promise<void> {
  const pool = holder.__demandaiPool;
  holder.__demandaiPool = undefined;
  if (!pool) return;
  try {
    await pool.end();
    logger.info({ event: 'db.pool.closed' }, 'Database pool closed');
  } catch (err) {
    logger.warn({ event: 'db.pool.close_failed', err }, 'Database pool did not close cleanly');
  }
}
