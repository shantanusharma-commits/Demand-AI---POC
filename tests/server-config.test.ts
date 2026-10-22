// Configuration, logging and start-up (G-056 groundwork, D-39). Run with --conditions=react-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, describeConfig } from '../lib/server/env.ts';
import { createLogger, withLogContext, addLogContext, scrub, timed } from '../lib/server/logger.ts';
import { boot, logRequestError } from '../lib/server/boot.ts';

const SECRET = 'S3cr3t-Value-That-Must-Not-Leak';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const raw: string[] = [];
  const log = createLogger({ level: 'trace', version: 'test', destination: { write: (s: string) => { raw.push(s); lines.push(JSON.parse(s)); } } });
  return { log, lines, raw };
}

test('an empty environment gives development defaults with every AI flag off', () => {
  const r = parseEnv({});
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.env.NODE_ENV, 'development');
  assert.equal(r.env.PORT, 3000);
  assert.equal(r.env.AI_PROVIDER, 'none');
  assert.equal(r.env.AZURE_OPENAI_API_VERSION, '2024-06-01');
  assert.equal(r.env.UPLOAD_MAX_BYTES, 25 * 1024 * 1024);
  assert.equal(r.env.UPLOAD_MAX_ROWS, 50_000);
  assert.deepEqual(describeConfig(r.env).aiFeatures, []);
});

test('production refuses to start without APP_BASE_URL, naming the variable', () => {
  const r = parseEnv({ NODE_ENV: 'production' });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errors, ['APP_BASE_URL is required in production']);
});

test('azure-openai needs endpoint, key and deployment; errors never contain a value', () => {
  const r = parseEnv({ AI_PROVIDER: 'azure-openai', AZURE_OPENAI_API_KEY: SECRET });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errors.sort(), [
    'AZURE_OPENAI_DEPLOYMENT is required when AI_PROVIDER=azure-openai',
    'AZURE_OPENAI_ENDPOINT is required when AI_PROVIDER=azure-openai',
  ]);
  const bad = parseEnv({ AZURE_OPENAI_ENDPOINT: `http://${SECRET}.example/`, DATABASE_URL: `mysql://u:${SECRET}@h/db` });
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.equal(bad.errors.length, 2);
  for (const e of bad.errors) assert.ok(!e.includes(SECRET), 'error text must not echo the value');
  assert.ok(bad.errors.some(e => e.startsWith('AZURE_OPENAI_ENDPOINT ')));
  assert.ok(bad.errors.some(e => e.startsWith('DATABASE_URL ')));
});

test('bedrock needs a region and a model ID', () => {
  const r = parseEnv({ AI_PROVIDER: 'bedrock' });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errors.sort(), ['AWS_REGION is required when AI_PROVIDER=bedrock', 'BEDROCK_MODEL_ID is required when AI_PROVIDER=bedrock']);
});

test('blank values count as unset, flags accept 1/0/true/false only', () => {
  const r = parseEnv({ APP_BASE_URL: '  ', AI_FEATURE_DRAFTING: '1', AI_FEATURE_COPILOT: 'false', NOTIFICATION_DISABLED: 'true' });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.env.APP_BASE_URL, undefined);
  assert.equal(r.env.AI_FEATURE_DRAFTING, true);
  assert.equal(r.env.AI_FEATURE_COPILOT, false);
  assert.equal(r.env.NOTIFICATION_DISABLED, true);
  assert.equal(parseEnv({ AI_FEATURE_DRAFTING: 'yes' }).ok, false);
});

test('warnings: email not configured, AI flags without a provider', () => {
  const r = parseEnv({ AI_FEATURE_WHY_NOW: '1' });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.warnings.some(w => w.startsWith('email is not configured')));
  assert.ok(r.warnings.some(w => w.includes('AI_FEATURE_WHY_NOW set but AI_PROVIDER=none')));
  const quiet = parseEnv({ NOTIFICATION_DISABLED: '1' });
  assert.ok(quiet.ok && quiet.warnings.length === 0);
});

test('the start-up summary names features, never values', () => {
  const r = parseEnv({
    DATABASE_URL: `postgres://app:${SECRET}@db:5432/demandai`, SESSION_SECRET: SECRET + SECRET,
    AI_PROVIDER: 'azure-openai', AZURE_OPENAI_ENDPOINT: 'https://example.invalid/x', AZURE_OPENAI_API_KEY: SECRET,
    AZURE_OPENAI_DEPLOYMENT: 'gpt-4o', AI_FEATURE_DRAFTING: '1',
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  const text = JSON.stringify(describeConfig(r.env));
  assert.ok(!text.includes(SECRET));
  assert.ok(!text.includes('example.invalid'));
  assert.match(text, /"database":"configured/);
  assert.match(text, /"aiFeatures":\["DRAFTING"\]/);
  assert.match(text, /"mail":"not configured"/);
});

test('log lines carry request, user and BU IDs from the context, merged when nested', () => {
  const { log, lines } = capture();
  log.info('outside');
  withLogContext({ requestId: 'req-1' }, () => {
    addLogContext({ userId: 'u-1' });
    withLogContext({ businessUnitId: 'bu-1' }, () => log.info('inside'));
  });
  assert.equal(lines[0].requestId, undefined);
  assert.equal(lines[1].requestId, 'req-1');
  assert.equal(lines[1].userId, 'u-1');
  assert.equal(lines[1].businessUnitId, 'bu-1');
  assert.equal(lines[1].service, 'demandai');
  assert.equal(lines[1].level, 'info');
});

test('secrets and personal data are redacted or masked in log lines', () => {
  const { log, raw } = capture();
  log.info({ password: SECRET, token: SECRET, apiKey: SECRET, email: 'a.person@example.com', user: { email: 'b@example.com', password_hash: SECRET }, headers: { cookie: SECRET, authorization: SECRET } }, 'login for c.person@example.org');
  log.error({ err: new Error(`duplicate key (email)=(d.person@example.net) ${'x'}`) }, 'insert failed');
  const all = raw.join('');
  assert.ok(!all.includes(SECRET), 'secret leaked');
  assert.ok(!/[a-z.]+@example\.(com|org|net)/.test(all), 'email leaked');
  assert.match(all, /\[redacted\]/);
  assert.match(all, /login for \[email\]/);
  assert.match(all, /\(email\)=\(\[email\]\)/);
});

test('scrub masks addresses but keeps the rest of the text', () => {
  assert.equal(scrub('owner rep.one@client-sample.com, row 4'), 'owner [email], row 4');
});

test('timed logs the duration and rethrows failures', async () => {
  const { log, lines } = capture();
  assert.equal(await timed('engine.leads', { rows: 3 }, async () => 42, log), 42);
  await assert.rejects(timed('engine.signals', {}, async () => { throw new Error('boom'); }, log), /boom/);
  assert.equal(lines[0].event, 'engine.leads');
  assert.equal(typeof lines[0].durationMs, 'number');
  assert.equal(lines[1].level, 'error');
  assert.equal((lines[1].err as { message: string }).message, 'boom');
});

test('boot exits with code 1 and lists the problems when the configuration is invalid', () => {
  const { log, lines } = capture();
  let code: number | undefined;
  assert.throws(() => boot({ NODE_ENV: 'production', SESSION_SECRET: 'short' }, (c: number) => { code = c; throw new Error('exit'); }, log), /exit/);
  assert.equal(code, 1);
  assert.equal(lines[0].event, 'config.invalid');
  assert.deepEqual(lines[0].problems, ['SESSION_SECRET must be at least 32 characters', 'APP_BASE_URL is required in production']);
  assert.ok(!JSON.stringify(lines).includes('short'));
});

test('request errors are logged without the query string', () => {
  const { log, lines } = capture();
  logRequestError(Object.assign(new Error('render failed'), { digest: '123' }), { path: '/prospecting?email=x.y@example.com', method: 'GET' }, { routerKind: 'App Router', routePath: '/prospecting', routeType: 'render' }, log);
  assert.equal(lines[0].event, 'request.error');
  assert.equal(lines[0].path, '/prospecting');
  assert.equal(lines[0].digest, '123');
});
