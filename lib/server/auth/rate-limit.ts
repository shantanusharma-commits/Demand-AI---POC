// Fixed-window rate limits stored in PostgreSQL (rate_limits), so they hold across restarts and instances.
// Each hit commits on its own, so a failed request still counts.
import 'server-only';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/tenant.ts';

export type Limit = { name: string; limit: number; windowSeconds: number };

// Sign-in and reset limits (plan §4 item 3). Keys are pseudonymous hashes, never raw emails or addresses.
export const LIMITS = {
  loginPerIp: { name: 'login:ip', limit: 30, windowSeconds: 15 * 60 },
  loginPerEmail: { name: 'login:email', limit: 10, windowSeconds: 15 * 60 },
  forgotPerIp: { name: 'forgot:ip', limit: 10, windowSeconds: 60 * 60 },
  forgotPerEmail: { name: 'forgot:email', limit: 3, windowSeconds: 60 * 60 },
  tokenPerIp: { name: 'token:ip', limit: 30, windowSeconds: 15 * 60 },
} as const satisfies Record<string, Limit>;

export type HitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

export async function hit(db: Db, limit: Limit, subject: string, now = new Date()): Promise<HitResult> {
  const windowMs = limit.windowSeconds * 1000;
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${limit.name}:${subject}`;
  const result = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${start.toISOString()}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  const count = Number(result.rows[0].count);
  return { allowed: count <= limit.limit, count, retryAfterSeconds: Math.ceil((start.getTime() + windowMs - now.getTime()) / 1000) };
}

/** Removes windows older than a day (called opportunistically; the table stays small). */
export async function pruneRateLimits(db: Db): Promise<number> {
  const r = await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  return r.rowCount ?? 0;
}
