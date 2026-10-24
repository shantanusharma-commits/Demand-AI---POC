// POST /api/client-errors and the request helpers behind it. Run with --conditions=react-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClientErrorHandler, MAX_REPORT_BYTES } from '../lib/server/client-errors.ts';
import { createLogger } from '../lib/server/logger.ts';
import { createMemoryRateLimiter } from '../lib/server/http/memory-rate-limit.ts';
import { clientAddress, isSameOrigin } from '../lib/server/http/request.ts';
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

test('the client address is the entry our proxy added, not one the client forged', () => {
  const req = (xff?: string) => new Request('http://x/api', { headers: xff ? { 'x-forwarded-for': xff } : {} });
  assert.equal(clientAddress(req('203.0.113.9')), '203.0.113.9');
  assert.equal(clientAddress(req('6.6.6.6, 203.0.113.9')), '203.0.113.9', 'a forged left-hand entry is ignored');
  assert.equal(clientAddress(req('6.6.6.6, 198.51.100.1, 10.0.0.2'), 2), '198.51.100.1', 'two trusted hops');
  assert.equal(clientAddress(req()), 'unknown');
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
  // Read only to refuse them (Bedrock authenticates by IAM role), so the template never offers them.
  const refused = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const schemaKeys = Object.keys(envSchema.shape).filter(k => !refused.includes(k));
  const composeOnly = ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'DEMANDAI_OWNER_PASSWORD', 'DEMANDAI_APP_PASSWORD',
    'DEMANDAI_OPS_PASSWORD', 'BACKUP_RETAIN', 'APP_PORT', 'DB_PORT', 'DEMANDAI_IMAGE', 'NEXT_TELEMETRY_DISABLED', 'DEV_SEED_PASSWORD'];
  assert.deepEqual(schemaKeys.filter(k => !listed.has(k)), [], 'missing from .env.example');
  assert.deepEqual([...listed].filter(k => !schemaKeys.includes(k) && !composeOnly.includes(k)), [], 'unknown to the schema');
});

test('compose.yaml passes every runtime setting to the app container, so the stack is configured from its env file alone', () => {
  const yml = readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8');
  const app = yml.slice(yml.indexOf('\n  app:'), yml.indexOf('\nvolumes:'));
  const passed = new Set([...app.matchAll(/^ {6}([A-Z][A-Z0-9_]*):/gm)].map(m => m[1]));
  // Set by the image (PORT, APP_BUILD_VERSION), used by the migrate service and the ops commands only, refused, or for
  // the live smoke test on a developer's machine.
  const notForTheApp = ['PORT', 'APP_BUILD_VERSION', 'DATABASE_MIGRATION_URL', 'DATABASE_OPS_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AI_LIVE_SMOKE'];
  assert.deepEqual(Object.keys(envSchema.shape).filter(k => !notForTheApp.includes(k) && !passed.has(k)), [], 'not passed to the app');
  assert.match(app, /AZURE_OPENAI_API_VERSION: \$\{AZURE_OPENAI_API_VERSION:-2025-04-01-preview\}/, 'the API version D-44 settled on');
});
