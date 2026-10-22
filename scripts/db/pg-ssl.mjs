// TLS options for node-postgres from DATABASE_SSL_MODE (and DATABASE_SSL_CA_FILE for verify-full).
// Shared by the scripts; lib/server/db/pool.ts applies the same rules for the app.
import { readFileSync } from 'node:fs';

export function sslOptions(env = process.env) {
  const mode = env.DATABASE_SSL_MODE || (env.NODE_ENV === 'production' ? 'verify-full' : 'disable');
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  if (mode === 'verify-full') {
    return env.DATABASE_SSL_CA_FILE ? { rejectUnauthorized: true, ca: readFileSync(env.DATABASE_SSL_CA_FILE, 'utf8') } : { rejectUnauthorized: true };
  }
  throw new Error('DATABASE_SSL_MODE must be disable, require or verify-full');
}

/** Removes sslmode/ssl query parameters so the explicit `ssl` option is the only TLS setting. */
export function stripSslParams(url) {
  const u = new URL(url);
  for (const k of ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey']) u.searchParams.delete(k);
  return u.toString();
}
