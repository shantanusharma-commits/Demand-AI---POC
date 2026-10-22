// A per-process fixed-window counter for low-value endpoints (client error reports). Sign-in and reset use the
// PostgreSQL limiter instead, so their limits survive restarts and hold across instances.
import 'server-only';

export function createMemoryRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    /** Counts one hit for key; false once the key has used up its window. */
    take(key: string): boolean {
      const t = now();
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k);
      }
      const w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        windows.set(key, { start: t, count: 1 });
        return true;
      }
      w.count++;
      return w.count <= limit;
    },
  };
}
