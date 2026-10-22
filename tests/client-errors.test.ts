// POST /api/client-errors and the request helpers behind it. Run with --conditions=react-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClientErrorHandler, MAX_REPORT_BYTES } from '../lib/server/client-errors.ts';
import { createLogger } from '../lib/server/logger.ts';
import { createMemoryRateLimiter } from '../lib/server/http/memory-rate-limit.ts';
import { isSameOrigin } from '../lib/server/http/request.ts';
import { envSchema } from '../lib/server/env.ts';

const BASE = 'https://demandai.example.test';

function setup(limit = 30) {
  const lines: Record<string, unknown>[] = [];
  const log = createLogger({ level: 'trace', destination: { write: (s: string) => lines.push(JSON.parse(s)) } });
  const POST = createClientErrorHandler({ log, appBaseUrl: BASE, production: true, limit });
  return { POST, lines };
}

const report = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}/api/client-errors`, {
    method: 'POST',
    headers: { origin: BASE, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const valid = { source: 'error-boundary', message: 'Cannot read x of undefined (a.rep@client-sample.com)', digest: 'abc123', path: '/prospecting?list=1' };

test('a same-origin report is logged with personal data masked and the query string dropped', async () => {
  const { POST, lines } = setup();
  const res = await POST(report(valid));
  assert.equal(res.status, 204);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, 'client.error');
  assert.equal(lines[0].path, '/prospecting');
  assert.equal(lines[0].clientMessage, 'Cannot read x of undefined ([email])');
  assert.equal(lines[0].digest, 'abc123');
});

test('reports from another origin, or with no Origin, are refused', async () => {
  const { POST, lines } = setup();
  assert.equal((await POST(report(valid, { origin: 'https://evil.example' }))).status, 403);
  const noOrigin = new Request(`${BASE}/api/client-errors`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid) });
  assert.equal((await POST(noOrigin)).status, 403);
  assert.equal(lines.length, 0);
});

test('oversized, non-JSON and malformed reports are refused without logging', async () => {
  const { POST, lines } = setup();
  assert.equal((await POST(report({ ...valid, message: 'x'.repeat(MAX_REPORT_BYTES) }))).status, 413);
  assert.equal((await POST(report(valid, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await POST(report('{not json'))).status, 400);
  assert.equal((await POST(report({ ...valid, source: 'other' }))).status, 400);
  assert.equal(lines.length, 0);
});

test('one address can send only so many reports per window', async () => {
  const { POST } = setup(2);
  assert.equal((await POST(report(valid))).status, 204);
  assert.equal((await POST(report(valid))).status, 204);
  assert.equal((await POST(report(valid))).status, 429);
  assert.equal((await POST(report(valid, { 'x-forwarded-for': '198.51.100.7' }))).status, 204);
});

test('the memory rate limiter opens a new window after windowMs', () => {
  let t = 0;
  const limiter = createMemoryRateLimiter(1, 1000, () => t);
  assert.equal(limiter.take('k'), true);
  assert.equal(limiter.take('k'), false);
  t = 1000;
  assert.equal(limiter.take('k'), true);
});

test('origin check: production accepts only APP_BASE_URL; development also accepts its own origin', () => {
  const req = (origin: string) => new Request('http://localhost:3000/api/x', { method: 'POST', headers: { origin } });
  assert.equal(isSameOrigin(req(BASE), BASE, true), true);
  assert.equal(isSameOrigin(req('http://localhost:3000'), BASE, true), false);
  assert.equal(isSameOrigin(req('http://localhost:3000'), BASE, false), true);
  assert.equal(isSameOrigin(req('http://localhost:3000'), undefined, false), true);
  assert.equal(isSameOrigin(req('https://evil.example'), undefined, false), false);
});

test('.env.example lists every configuration variable, and nothing the app does not read', () => {
  const listed = new Set(readFileSync(new URL('../.env.example', import.meta.url), 'utf8').split('\n')
    .map(l => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]).filter((k): k is string => !!k));
  const schemaKeys = Object.keys(envSchema.shape);
  const composeOnly = ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'DEMANDAI_OWNER_PASSWORD', 'DEMANDAI_APP_PASSWORD',
    'DEMANDAI_OPS_PASSWORD', 'BACKUP_RETAIN', 'APP_PORT', 'DB_PORT', 'DEMANDAI_IMAGE', 'NEXT_TELEMETRY_DISABLED'];
  assert.deepEqual(schemaKeys.filter(k => !listed.has(k)), [], 'missing from .env.example');
  assert.deepEqual([...listed].filter(k => !schemaKeys.includes(k) && !composeOnly.includes(k)), [], 'unknown to the schema');
});
