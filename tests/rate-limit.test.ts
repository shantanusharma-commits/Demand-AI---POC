// The sliding-window limiter's wait (lib/server/auth/rate-limit.ts): how long until one more hit fits, if nothing
// else comes in. The limiter itself runs against PostgreSQL in tests/integration/auth.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { secondsUntilAllowed } from '../lib/server/auth/rate-limit.ts';

test('the wait is until enough of the previous window has slid out, or into the next window when this one is full', () => {
  // limit 10 per 60 s, 1 s into a window: previous window 10, this one 1. 10 × (1 − t/60) + 2 ≤ 10 at t = 12 s.
  assert.equal(secondsUntilAllowed(10, 1, 1000, 60_000, 10), 11);
  // This window alone is over: wait for the next, then until 12 × (1 − t/60) + 1 ≤ 10, t = 15 s.
  assert.equal(secondsUntilAllowed(0, 12, 30_000, 60_000, 10), 30 + 15);
  // Never less than a second.
  assert.equal(secondsUntilAllowed(0, 3, 59_999, 60_000, 10), 1);
});
