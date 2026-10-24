// The ops role's database connection, for the data purge and export (scripts/data/*.mjs). The ops role has no table
// privileges: it can only run the purge, retention and export functions (drizzle/0037_data_lifecycle.sql).
import pg from 'pg';
import { sslOptions, stripSslParams } from '../db/pg-ssl.mjs';

/** DATABASE_OPS_URL; locally, DATABASE_URL's server with the demandai_ops role and DEMANDAI_OPS_PASSWORD. */
export function opsUrl(env = process.env) {
  if (env.DATABASE_OPS_URL) return env.DATABASE_OPS_URL;
  if (env.DATABASE_URL && env.DEMANDAI_OPS_PASSWORD) {
    const u = new URL(env.DATABASE_URL);
    u.username = 'demandai_ops';
    u.password = env.DEMANDAI_OPS_PASSWORD;
    return u.toString();
  }
  throw new Error('DATABASE_OPS_URL is not set (the connection for the demandai_ops role)');
}

export async function connectOps(env = process.env) {
  const client = new pg.Client({ connectionString: stripSslParams(opsUrl(env)), ssl: sslOptions(env), application_name: 'demandai-ops' });
  await client.connect();
  return client;
}

/** A date (YYYY-MM-DD, midnight UTC) or a full ISO timestamp, as an ISO string; anything else is refused. */
export function parseWhen(value, flag) {
  const s = String(value ?? '').trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s;
  const t = Date.parse(iso);
  if (!/^\d{4}-\d{2}-\d{2}/.test(s) || Number.isNaN(t)) throw new Error(`${flag} needs a date such as 2026-12-31`);
  return new Date(t).toISOString();
}

/** Connection URLs never reach the output. */
export const hideUrls = text => String(text).replace(/postgres(ql)?:\/\/[^\s]+/g, '[url]');
