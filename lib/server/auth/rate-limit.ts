// Sliding-window rate limits stored in PostgreSQL (rate_limits), so they hold across restarts and instances. Counts
// are kept per fixed window; a hit is judged on the current window's count plus the previous window's, weighted by
// how much of the previous window still lies inside the last windowSeconds. A burst across a window boundary can't get
// twice the limit through, as it could with plain fixed windows. Each hit commits on its own, so a refused request
// still counts.
import 'server-only';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/tenant.ts';

/** `what` names the requests in the refusal ("Too many uploads …"). */
export type Limit = { name: string; limit: number; windowSeconds: number; what?: string };

const TEN_MINUTES = 10 * 60;

export const LIMITS = {
  // Sign-in and reset (plan §4 item 3). Keys are pseudonymous hashes, never raw emails or addresses.
  loginPerIp: { name: 'login:ip', limit: 30, windowSeconds: 15 * 60 },
  loginPerEmail: { name: 'login:email', limit: 10, windowSeconds: 15 * 60 },
  forgotPerIp: { name: 'forgot:ip', limit: 10, windowSeconds: 60 * 60 },
  forgotPerEmail: { name: 'forgot:email', limit: 3, windowSeconds: 60 * 60 },
  tokenPerIp: { name: 'token:ip', limit: 30, windowSeconds: 15 * 60 },
  // Per person, on routes that start heavy jobs or model calls (a model call costs money). withApi's `limit` option.
  upload: { name: 'upload:user', limit: 60, windowSeconds: TEN_MINUTES, what: 'uploads' },
  correction: { name: 'correct:user', limit: 60, windowSeconds: TEN_MINUTES, what: 'corrections' },
  scoringRun: { name: 'scoring:user', limit: 30, windowSeconds: TEN_MINUTES, what: 'scoring runs' },
  nbaBuild: { name: 'nba-build:user', limit: 20, windowSeconds: TEN_MINUTES, what: 'builds' },
  studioWrite: { name: 'studio:user', limit: 60, windowSeconds: TEN_MINUTES, what: 'writing requests' },
  copilot: { name: 'copilot:user', limit: 120, windowSeconds: TEN_MINUTES, what: 'questions' },
  aiHealthcheck: { name: 'ai-health:user', limit: 10, windowSeconds: TEN_MINUTES, what: 'health checks' },
} as const satisfies Record<string, Limit>;

export type HitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

/** Seconds until one more hit would be allowed, if none comes in meanwhile (at least 1). */
export function secondsUntilAllowed(prev: number, count: number, elapsedMs: number, windowMs: number, limit: number): number {
  const room = limit - count - 1;
  // Inside this window, one more hit fits once prev·(1 − t/W) + count + 1 ≤ limit; past it, `count` becomes the previous window.
  const waitMs = room >= 0 ? (prev > 0 ? windowMs * (1 - room / prev) - elapsedMs : 0)
    : windowMs - elapsedMs + windowMs * Math.max(0, 1 - (limit - 1) / count);
  return Math.max(1, Math.ceil(waitMs / 1000));
}

export async function hit(db: Db, limit: Limit, subject: string, now = new Date()): Promise<HitResult> {
  const windowMs = limit.windowSeconds * 1000;
  const startMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const key = `${limit.name}:${subject}`;
  const result = await db.execute<{ count: number; prev: number }>(sql`
    with cur as (
      insert into rate_limits (key, window_start, count) values (${key}, ${new Date(startMs).toISOString()}, 1)
      on conflict (key, window_start) do update set count = rate_limits.count + 1
      returning count)
    select (select count from cur) as count,
      coalesce((select count from rate_limits where key = ${key} and window_start = ${new Date(startMs - windowMs).toISOString()}), 0) as prev`);
  const count = Number(result.rows[0].count), prev = Number(result.rows[0].prev), elapsedMs = now.getTime() - startMs;
  const allowed = prev * (1 - elapsedMs / windowMs) + count <= limit.limit;
  return { allowed, count, retryAfterSeconds: allowed ? 0 : secondsUntilAllowed(prev, count, elapsedMs, windowMs, limit.limit) };
}

/** Removes windows older than a day (the longest window is an hour); the job worker calls it every hour. */
export async function pruneRateLimits(db: Db): Promise<number> {
  const r = await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  return r.rowCount ?? 0;
}
