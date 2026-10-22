// Hunter.io email verification: the API client (200 / 202 polling / errors), the rate limiter, key storage,
// reuse of stored results, bulk runs and how a result changes a screened list. Hunter is never called: fetch is faked.
// Run with: npm test   (Node older than 22.18 needs --experimental-strip-types)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as H from '../lib/server/hunter.ts';
import * as Store from '../lib/server/secure-store.ts';
import * as Ver from '../lib/server/verification-store.ts';
import { verifyEmail } from '../lib/server/email-verification-service.ts';
import { verifyMany } from '../lib/email-verification/client.ts';
import * as E from '../lib/demandai-engine.ts';
import * as S from '../lib/demandai-sample-data.ts';

process.env.DEMANDAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'demandai-test-'));
delete process.env.HUNTER_API_KEY;

/* ─── helpers ─── */
const KEY = 'sk_test_SECRET_1234567890';
const body = (data: object) => ({ data: { status: 'valid', score: 96, email: 'a@b.com', regexp: true, gibberish: false, disposable: false, webmail: false,
  mx_records: true, smtp_server: true, smtp_check: true, accept_all: false, block: false,
  verification: { date: '2026-09-14', status: 'valid' },
  sources: [{ domain: 'x.com', uri: 'http://x.com/team', extracted_on: '2020-01-01', last_seen_on: '2021-01-01', still_on_page: true }], ...data }, meta: {} });
const reply = (status: number, json?: object, headers: Record<string, string> = {}) =>
  new Response(json ? JSON.stringify(json) : null, { status, headers: { 'content-type': 'application/json', ...headers } });
/** A fetch that answers from a queue (the last answer repeats) and remembers the URLs it was asked for. */
function fakeFetch(...answers: (Response | Error | (() => Response))[]) {
  const urls: string[] = []; let i = 0;
  const fn = (async (url: string) => {
    urls.push(String(url));
    const a = answers[Math.min(i++, answers.length - 1)];
    if (a instanceof Error) throw a;
    return typeof a === 'function' ? a() : a.clone();
  }) as unknown as typeof fetch;
  return { fn, urls, calls: () => urls.length };
}
/** A clock that jumps instead of waiting. */
function fakeClock(start = 1_000_000) { const c = { t: start, now: () => c.t, sleep: async (ms: number) => { c.t += ms; } }; return c; }
const opts = (f: ReturnType<typeof fakeFetch>, extra = {}) => { const clock = fakeClock(); return { apiKey: KEY, fetchFn: f.fn, clock, limiter: new H.RateLimiter(clock), ...extra }; };

/* ─── Hunter client ─── */
test('200: every response field is kept, and valid is the one conclusive "good" answer', async () => {
  const f = fakeFetch(reply(200, body({})));
  const r = await H.verifyWithHunter('  A@B.com ', opts(f));
  assert.ok(r.ok);
  const v = r.verification;
  assert.equal(v.email, 'a@b.com');
  assert.equal(v.outcome, 'valid');
  assert.deepEqual([v.status, v.score, v.regexp, v.gibberish, v.disposable, v.webmail, v.mx_records, v.smtp_server, v.smtp_check, v.accept_all, v.block],
    ['valid', 96, true, false, false, false, true, true, true, false, false]);
  assert.deepEqual(v.verification, { date: '2026-09-14', status: 'valid' });
  assert.equal(v.sources.length, 1);
  assert.equal(v.sources[0].uri, 'http://x.com/team');
  assert.match(f.urls[0], /^https:\/\/api\.hunter\.io\/v2\/email-verifier\?email=a%40b\.com&api_key=/);
});

test('invalid is conclusive; accept_all, webmail, disposable and unknown are never valid or invalid', async () => {
  const inv = await H.verifyWithHunter('a@b.com', opts(fakeFetch(reply(200, body({ status: 'invalid', smtp_check: false })))));
  assert.ok(inv.ok); assert.equal(inv.verification.outcome, 'invalid');
  for (const status of ['accept_all', 'webmail', 'disposable', 'unknown']) {
    const r = await H.verifyWithHunter('a@b.com', opts(fakeFetch(reply(200, body({ status })))));
    assert.ok(r.ok, status);
    assert.equal(r.verification.outcome, 'inconclusive', status);
  }
  // A status we do not know, or none at all, is also not a verdict.
  const odd = await H.verifyWithHunter('a@b.com', opts(fakeFetch(reply(200, body({ status: 'deliverable' })))));
  assert.ok(odd.ok); assert.equal(odd.verification.outcome, 'inconclusive'); assert.equal(odd.verification.status, null);
});

test('202: the same URL is polled until Hunter finishes', async () => {
  const f = fakeFetch(reply(202), reply(202), reply(200, body({})));
  const o = opts(f);
  const r = await H.verifyWithHunter('a@b.com', o);
  assert.ok(r.ok); assert.equal(r.verification.outcome, 'valid');
  assert.equal(f.calls(), 3);
  assert.equal(new Set(f.urls).size, 1, 'polls the same endpoint');
  assert.equal(o.clock.t - 1_000_000 >= 2 * 2000, true, 'waits between polls');
});

test('202 that never finishes comes back as pending, not as a verdict', async () => {
  const f = fakeFetch(reply(202));
  const r = await H.verifyWithHunter('a@b.com', opts(f, { maxPolls: 3 }));
  assert.ok(!r.ok);
  assert.equal((r as any).error.code, 'pending'); assert.equal((r as any).error.retryable, true);
  assert.equal(f.calls(), 4);
});

test('error statuses: 222, 400, 401, 403, 429, 451, 5xx', async () => {
  const run = async (res: Response) => H.verifyWithHunter('a@b.com', opts(fakeFetch(res)));
  let r = await run(reply(222));
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'smtp_unavailable'); assert.ok((r as any).error.retryable);
  r = await run(reply(400, { errors: [{ id: 'invalid_email', details: 'Invalid email "x".' }] }));
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'bad_email'); assert.ok(!(r as any).error.retryable); assert.match((r as any).error.message, /Invalid email/);
  r = await run(reply(401, { errors: [{ id: 'authentication_failed' }] }));
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'invalid_api_key'); assert.ok(!(r as any).error.retryable);
  r = await run(reply(403, { errors: [] }, { 'retry-after': '7' }));
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'rate_limited'); assert.ok((r as any).error.retryable); assert.equal((r as any).error.retryAfterMs, 7000);
  r = await run(reply(429, { errors: [] }));
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'quota_exceeded'); assert.ok(!(r as any).error.retryable);
  r = await run(reply(503));
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'upstream_error'); assert.ok((r as any).error.retryable);
  r = await run(reply(418));
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'upstream_error'); assert.ok(!(r as any).error.retryable);
});

test('451: the address is recorded as do-not-process, never as valid or invalid', async () => {
  const r = await H.verifyWithHunter('a@b.com', opts(fakeFetch(reply(451, { errors: [{ id: 'claimed_email' }] }))));
  assert.ok(r.ok);
  assert.equal(r.verification.outcome, 'do_not_process');
  assert.equal(r.verification.status, null);
});

test('timeouts and network failures are retryable errors and never leak the key', async () => {
  const abort = Object.assign(new Error(`aborted https://api.hunter.io/?api_key=${KEY}`), { name: 'AbortError' });
  let r = await H.verifyWithHunter('a@b.com', opts(fakeFetch(abort)));
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'timeout'); assert.ok((r as any).error.retryable);
  r = await H.verifyWithHunter('a@b.com', opts(fakeFetch(new TypeError(`fetch failed for ...api_key=${KEY}`))));
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'network_error');
  assert.ok(!JSON.stringify(r).includes(KEY));
  r = await H.verifyWithHunter('a@b.com', opts(fakeFetch(reply(200, { nope: true }))));
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'upstream_error');
  r = await H.verifyWithHunter('a@b.com', { ...opts(fakeFetch(reply(200))), apiKey: '' });
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'not_configured');
});

/* ─── Rate limiting: 10 per second, 300 per minute ─── */
test('limiter: never more than 10 calls in any second', async () => {
  const clock = fakeClock(), lim = new H.RateLimiter(clock), at: number[] = [];
  for (let i = 0; i < 55; i++) { await lim.acquire(); at.push(clock.now()); }
  for (let i = 10; i < at.length; i++) assert.ok(at[i] - at[i - 10] >= 1000, `calls ${i - 10}..${i} fit in under a second`);
  assert.ok(at[54] - at[0] >= 5000, '55 calls need at least 5 s');
});

test('limiter: never more than 300 calls in any minute', async () => {
  const clock = fakeClock(), lim = new H.RateLimiter(clock), at: number[] = [];
  for (let i = 0; i < 650; i++) { await lim.acquire(); at.push(clock.now()); }
  for (let i = 300; i < at.length; i++) assert.ok(at[i] - at[i - 300] >= 60_000, `calls ${i - 300}..${i} fit in under a minute`);
});

test('limiter: a caller that would wait too long is told to retry instead of queuing', async () => {
  const clock = fakeClock(), lim = new H.RateLimiter(clock);
  for (let i = 0; i < 10; i++) await lim.acquire(0);
  await assert.rejects(() => lim.acquire(100), (e: H.RateWait) => e instanceof H.RateWait && e.retryAfterMs > 100);
  const f = fakeFetch(reply(200, body({})));
  const r = await H.verifyWithHunter('a@b.com', { apiKey: KEY, fetchFn: f.fn, clock, limiter: lim, maxQueueMs: 100 });
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'rate_limited'); assert.equal(f.calls(), 0, 'no request is sent while over the limit');
});

/* ─── API key storage ─── */
test('key: saved encrypted, read back, replaced by nothing when cleared; the environment is the fallback', async () => {
  assert.equal(await Store.getHunterKey(), null);
  await Store.saveHunterKey(KEY);
  const raw = readFileSync(path.join(Store.dataDir(), 'settings.json'), 'utf8');
  assert.ok(!raw.includes(KEY) && !raw.includes('SECRET'), 'the key is not on disk in plain text');
  assert.deepEqual(await Store.getHunterKey(), { key: KEY, source: 'settings' });

  process.env.HUNTER_API_KEY = 'env_key_abcdefgh';
  assert.equal((await Store.getHunterKey())!.source, 'settings', 'a key saved in Setup wins');
  await Store.clearHunterKey();
  assert.deepEqual(await Store.getHunterKey(), { key: 'env_key_abcdefgh', source: 'env' });
  delete process.env.HUNTER_API_KEY;
  assert.equal(await Store.getHunterKey(), null);
});

test('key: the settings route reports only whether a key exists', async () => {
  const route = await import('../app/api/settings/hunter/route.ts');
  let res = await route.PUT(new Request('http://x/api/settings/hunter', { method: 'PUT', body: JSON.stringify({ apiKey: KEY }) }));
  let text = await res.text();
  assert.equal(res.status, 200); assert.ok(!text.includes(KEY));
  assert.deepEqual(JSON.parse(text), { configured: true, source: 'settings' });
  text = await (await route.GET()).text();
  assert.ok(!text.includes(KEY)); assert.deepEqual(JSON.parse(text), { configured: true, source: 'settings' });
  res = await route.PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ apiKey: 'x y' }) }));
  assert.equal(res.status, 400);
  text = await (await route.DELETE()).text();
  assert.deepEqual(JSON.parse(text), { configured: false, source: null });
  assert.ok(!readdirSync(Store.dataDir()).some(f => f.endsWith('.tmp')), 'no temp files left behind');
});

/* ─── Service: reuse, refresh, not configured ─── */
test('service: no key → not_configured, and nothing is stored', async () => {
  const f = fakeFetch(reply(200, body({})));
  const r = await verifyEmail('svc0@b.com', { hunter: { fetchFn: f.fn } });
  assert.ok(!r.ok); assert.equal((r as any).error.code, 'not_configured'); assert.equal(f.calls(), 0);
});

test('service: a stored result is reused, refresh asks again, and failures are not stored', async () => {
  await Store.saveHunterKey(KEY);
  const clock = fakeClock(Date.now());
  const h = (f: ReturnType<typeof fakeFetch>) => ({ fetchFn: f.fn, clock, limiter: new H.RateLimiter(clock) });
  const f = fakeFetch(reply(200, body({ email: 'svc1@b.com' })));
  const first = await verifyEmail('Svc1@B.com', { hunter: h(f) });
  assert.ok(first.ok && !first.reused);
  const second = await verifyEmail('svc1@b.com', { hunter: h(f) });
  assert.ok(second.ok && second.reused); assert.equal(f.calls(), 1, 'second call did not reach Hunter');
  assert.deepEqual(second.verification, first.verification);
  const third = await verifyEmail('svc1@b.com', { refresh: true, hunter: h(f) });
  assert.ok(third.ok && !third.reused); assert.equal(f.calls(), 2);

  const bad = fakeFetch(reply(503));
  const failed = await verifyEmail('svc2@b.com', { hunter: h(bad) });
  assert.ok(!failed.ok);
  assert.deepEqual(await Ver.getStored(['svc2@b.com']), {}, 'an error is not remembered as a result');

  const malformed = await verifyEmail('not-an-email', { hunter: h(bad) });
  assert.ok(!malformed.ok); assert.equal((malformed as any).error.code, 'bad_email'); assert.equal(bad.calls(), 1, 'a malformed address never reaches Hunter');
  await Store.clearHunterKey();
});

test('service: the same address asked twice at once costs one Hunter call', async () => {
  await Store.saveHunterKey(KEY);
  const clock = fakeClock(Date.now());
  const f = fakeFetch(reply(200, body({})));
  const h = { fetchFn: f.fn, clock, limiter: new H.RateLimiter(clock) };
  const [a, b] = await Promise.all([verifyEmail('svc3@b.com', { hunter: h }), verifyEmail('svc3@b.com', { hunter: h })]);
  assert.ok(a.ok && b.ok); assert.equal(f.calls(), 1);
  await Store.clearHunterKey();
});

test('stored results expire: a month for a conclusive answer, a day for an inconclusive one', () => {
  const v = (outcome: string, ageDays: number) => ({ outcome, checkedAt: new Date(Date.now() - ageDays * 86_400_000).toISOString() }) as never;
  assert.ok(Ver.isFresh(v('valid', 29), Date.now()));
  assert.ok(!Ver.isFresh(v('valid', 31), Date.now()));
  assert.ok(Ver.isFresh(v('inconclusive', 0.5), Date.now()));
  assert.ok(!Ver.isFresh(v('inconclusive', 2), Date.now()));
});

/* ─── Bulk (browser side) ─── */
const ok = (email: string, reused = false) => ({ ok: true, reused, verification: { email, outcome: 'valid' } });
const fail = (code: string, retryable: boolean, retryAfterMs?: number) => ({ ok: false, error: { code, message: code, retryable, retryAfterMs } });
const post = (map: (email: string, n: number) => object) => {
  const seen = new Map<string, number>(); let calls = 0;
  const fn = (async (_u: string, init: { body: string }) => {
    const { email } = JSON.parse(init.body); calls++;
    const n = (seen.get(email) || 0) + 1; seen.set(email, n);
    return new Response(JSON.stringify(map(email, n)), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls: () => calls, attempts: (e: string) => seen.get(e) || 0 };
};

test('bulk: each address once, in order, with progress; reused results are counted', async () => {
  const f = post(e => ok(e, e.startsWith('r')));
  const progress: number[] = [];
  const items = await verifyMany(['a@x.com', 'A@x.com', 'r1@x.com', 'b@x.com', ''], { fetchFn: f.fn, onProgress: p => progress.push(p.done), sleep: async () => {} });
  assert.deepEqual(items.map(i => i.email), ['a@x.com', 'r1@x.com', 'b@x.com']);
  assert.equal(f.calls(), 3);
  assert.equal(progress[progress.length - 1], 3);
});

test('bulk: a rate-limited answer is retried after the wait; a permanent error is not', async () => {
  const waits: number[] = [];
  const f = post((e, n) => e === 'slow@x.com' ? (n < 3 ? fail('rate_limited', true, 4000) : ok(e)) : e === 'bad@x.com' ? fail('bad_email', false) : ok(e));
  const items = await verifyMany(['slow@x.com', 'bad@x.com', 'fine@x.com'], { fetchFn: f.fn, concurrency: 1, sleep: async ms => { waits.push(ms); } });
  const by = Object.fromEntries(items.map(i => [i.email, i.result]));
  assert.ok(by['slow@x.com'].ok); assert.equal(f.attempts('slow@x.com'), 3); assert.deepEqual(waits, [4000, 4000]);
  assert.ok(!by['bad@x.com'].ok); assert.equal(f.attempts('bad@x.com'), 1);
  assert.ok(by['fine@x.com'].ok);
});

test('bulk: gives up after the attempts, and stops everything when the key is missing or wrong', async () => {
  let f = post(() => fail('timeout', true, 10));
  let items = await verifyMany(['a@x.com'], { fetchFn: f.fn, maxAttempts: 3, sleep: async () => {} });
  assert.ok(!items[0].result.ok); assert.equal(f.attempts('a@x.com'), 3);

  f = post(() => fail('invalid_api_key', false));
  items = await verifyMany(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'], { fetchFn: f.fn, concurrency: 1, sleep: async () => {} });
  assert.equal(f.calls(), 1, 'the remaining addresses are not tried');
  assert.equal(items.length, 1);
});

test('bulk: cancelling stops further requests', async () => {
  const ctl = new AbortController();
  const f = post(e => { if (e === 'b@x.com') ctl.abort(); return ok(e); });
  const items = await verifyMany(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'], { fetchFn: f.fn, concurrency: 1, signal: ctl.signal, sleep: async () => {} });
  assert.equal(f.calls(), 2); assert.equal(items.length, 2);
});

/* ─── What a result does to a screened list ─── */
function screened() {
  const r = E.processLeads(S.LEADS, { file: S.LEAD_FILE, sheet: 'Lead template' });
  const c = r.contacts.find(x => x.email && x.status === 'In the final list' && x.emailVerified)!;
  return { r, c };
}
const verdict = (email: string, outcome: string) => ({ email, provider: 'hunter', outcome, reason: '', checkedAt: new Date().toISOString(), status: null, score: null,
  regexp: null, gibberish: null, disposable: null, webmail: null, mx_records: null, smtp_server: null, smtp_check: null, accept_all: null, block: null,
  verification: null, sources: [] }) as never;

test('a valid result verifies a contact whose file said N, and puts them in reach', () => {
  const { r, c } = screened();
  // Same list, but the file said the address was not verified for this contact.
  const unverified = { ...c, emailVerified: false, reachableBy: c.linkedin ? 'LinkedIn' : 'none', contactable: !!c.linkedin,
    status: c.linkedin ? 'In the final list' : 'In the list, not contactable (no usable email or LinkedIn)' };
  const before = { ...r, contacts: r.contacts.map(x => x.row === c.row ? unverified : x) };
  const out = E.applyEmailVerification(before as any, { [c.email]: verdict(c.email, 'valid') });
  const n = out.contacts.find(x => x.row === c.row)!;
  assert.equal(n.emailVerified, true); assert.equal(n.reachableBy, c.reachableBy); assert.equal(n.status, 'In the final list');
  assert.equal(n.emailVerification!.outcome, 'valid');
  assert.equal(unverified.emailVerified, false, 'the original list is not mutated');
});

test('an invalid result takes the email away as a channel', () => {
  const { r, c } = screened();
  const out = E.applyEmailVerification(r, { [c.email]: verdict(c.email, 'invalid') });
  const n = out.contacts.find(x => x.row === c.row)!;
  assert.equal(n.emailVerified, false);
  assert.notEqual(n.reachableBy, c.linkedin ? 'email and LinkedIn' : 'email');
  assert.equal(out.stats.inFinalList, out.contacts.filter(x => x.status === 'In the final list').length);
});

test('an inconclusive result is recorded but changes nothing about the contact', () => {
  const { r, c } = screened();
  const out = E.applyEmailVerification(r, { [c.email]: verdict(c.email, 'inconclusive') });
  const n = out.contacts.find(x => x.row === c.row)!;
  assert.equal(n.emailVerified, c.emailVerified); assert.equal(n.status, c.status); assert.equal(n.reachableBy, c.reachableBy);
  assert.equal(n.emailVerification!.outcome, 'inconclusive');
});

test('a person who asked not to be processed is suppressed', () => {
  const { r, c } = screened();
  const out = E.applyEmailVerification(r, { [c.email]: verdict(c.email, 'do_not_process') });
  const n = out.contacts.find(x => x.row === c.row)!;
  assert.equal(n.contactable, false); assert.equal(n.status, 'Not in the list: opted out');
  assert.equal(out.stats.inFinalList, r.stats.inFinalList - 1);
});
