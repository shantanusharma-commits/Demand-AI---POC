// HTTP tests on the production build (standalone server) against PostgreSQL: route inventory, authentication on
// every route, the role × route matrix, CSRF origin checks, cookie flags, sign-in behaviour, page access by role,
// the invite and business-unit flows, and log hygiene (G-001, G-003, G-014 groundwork, G-034).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { can, type Action, type BuRole } from '../../lib/auth/permissions.ts';
import { REPO } from '../integration/harness.ts';
import { Browser, startServer, type TestServer } from './server.ts';

type Policy = { auth: 'public' | 'user' | 'unit' | 'platform'; permission?: Action };

// The intended policy of every API route. A route missing here, or declared differently, fails the inventory.
const EXPECTED: Record<string, Policy> = {
  'POST /api/auth/login': { auth: 'public' },
  'POST /api/auth/logout': { auth: 'user' },
  'POST /api/auth/accept-invite': { auth: 'public' },
  'POST /api/auth/forgot': { auth: 'public' },
  'POST /api/auth/reset': { auth: 'public' },
  'GET /api/me': { auth: 'user' },
  'POST /api/session/business-unit': { auth: 'user' },
  'GET /api/users': { auth: 'unit', permission: 'users.view' },
  'POST /api/users': { auth: 'unit', permission: 'users.manage' },
  'PATCH /api/users/:id': { auth: 'unit', permission: 'users.manage' },
  'POST /api/users/:id/deactivate': { auth: 'unit', permission: 'users.manage' },
  'POST /api/users/:id/reactivate': { auth: 'unit', permission: 'users.manage' },
  'POST /api/users/:id/resend-invite': { auth: 'unit', permission: 'users.manage' },
  'POST /api/users/:id/reset-link': { auth: 'unit', permission: 'users.manage' },
  'GET /api/users/:id/history': { auth: 'unit', permission: 'users.view' },
  'POST /api/users/:id/owner-aliases': { auth: 'unit', permission: 'users.manage' },
  'DELETE /api/users/:id/owner-aliases/:aliasId': { auth: 'unit', permission: 'users.manage' },
  'GET /api/platform/business-units': { auth: 'platform' },
  'POST /api/platform/business-units': { auth: 'platform' },
  'POST /api/platform/business-units/:id/admins': { auth: 'platform' },
  'POST /api/uploads': { auth: 'unit', permission: 'data.upload' },
  'POST /api/uploads/sample': { auth: 'unit', permission: 'data.upload' },
  'GET /api/jobs/:id': { auth: 'unit', permission: 'lists.view' },
  'GET /api/lists': { auth: 'unit', permission: 'lists.view' },
  'GET /api/lists/:id': { auth: 'unit', permission: 'lists.view' },
  'PATCH /api/lists/:id': { auth: 'unit', permission: 'lists.write' },
  'DELETE /api/lists/:id': { auth: 'unit', permission: 'lists.write' },
  'POST /api/lists/:id/save': { auth: 'unit', permission: 'lists.write' },
  'GET /api/lists/:id/contacts': { auth: 'unit', permission: 'lists.view' },
  'GET /api/lists/:id/accounts': { auth: 'unit', permission: 'lists.view' },
  'GET /api/lists/:id/issues': { auth: 'unit', permission: 'lists.view' },
  'GET /api/lists/:id/issues.csv': { auth: 'unit', permission: 'lists.view' },
  'GET /api/lists/:id/report.csv': { auth: 'unit', permission: 'lists.view' },
  'GET /api/lists/:id/contacts/:row': { auth: 'unit', permission: 'lists.view' },
  'GET /api/lists/:id/corrections': { auth: 'unit', permission: 'lists.view' },
  'POST /api/lists/:id/corrections': { auth: 'unit', permission: 'lists.write' },
  'GET /api/corrections': { auth: 'unit', permission: 'lists.view' },
  'GET /api/scoring-runs': { auth: 'unit', permission: 'lists.view' },
  'POST /api/scoring-runs': { auth: 'unit', permission: 'scoring.run' },
  'GET /api/scoring-runs/:id': { auth: 'unit', permission: 'lists.view' },
  'PATCH /api/scoring-runs/:id': { auth: 'unit', permission: 'scoring.run' },
  'DELETE /api/scoring-runs/:id': { auth: 'unit', permission: 'scoring.run' },
  'POST /api/scoring-runs/:id/save': { auth: 'unit', permission: 'scoring.run' },
  'GET /api/scoring-runs/:id/prospects': { auth: 'unit', permission: 'lists.view' },
  'GET /api/scoring-runs/:id/prospects/:contactId': { auth: 'unit', permission: 'lists.view' },
  'GET /api/scoring-runs/:id/signals': { auth: 'unit', permission: 'lists.view' },
  'GET /api/signal-monitoring': { auth: 'unit', permission: 'lists.view' },
  'GET /api/config': { auth: 'unit', permission: 'setup.view' },
  'GET /api/config/export': { auth: 'unit', permission: 'setup.view' },
  'POST /api/config/sections/:section/sign-off': { auth: 'unit', permission: 'setup.signOff' },
  'POST /api/config/sections/:section/reopen': { auth: 'unit', permission: 'setup.signOff' },
  'POST /api/config/signals': { auth: 'unit', permission: 'setup.signals' },
  'POST /api/config/signals/switch': { auth: 'unit', permission: 'setup.signals' },
  'POST /api/config/signals/remove': { auth: 'unit', permission: 'setup.signals' },
  'GET /api/brand': { auth: 'unit', permission: 'content.view' },
  'GET /api/brand/claims/usage': { auth: 'unit', permission: 'content.view' },
  'PUT /api/brand/draft': { auth: 'unit', permission: 'brand.manage' },
  'DELETE /api/brand/draft': { auth: 'unit', permission: 'brand.manage' },
  'POST /api/brand/publish': { auth: 'unit', permission: 'brand.manage' },
  'POST /api/brand/restore': { auth: 'unit', permission: 'brand.manage' },
  'POST /api/brand/documents': { auth: 'unit', permission: 'brand.manage' },
  'GET /api/brand/documents/:id': { auth: 'unit', permission: 'content.view' },
  'POST /api/handoffs': { auth: 'unit', permission: 'handoff.create' },
  'GET /api/handoffs/:id': { auth: 'unit', permission: 'lists.view' },
  'GET /api/nba-runs': { auth: 'unit', permission: 'lists.view' },
  'POST /api/nba-runs': { auth: 'unit', permission: 'nba.run' },
  'GET /api/nba-runs/:id': { auth: 'unit', permission: 'lists.view' },
  'PATCH /api/nba-runs/:id': { auth: 'unit', permission: 'nba.run' },
  'POST /api/nba-runs/:id/segments/pause': { auth: 'unit', permission: 'segments.pause' },
  'POST /api/nba-runs/:id/segments/resume': { auth: 'unit', permission: 'segments.pause' },
  'GET /api/recommendations/:id': { auth: 'unit', permission: 'lists.view' },
  'POST /api/recommendations/:id/open': { auth: 'unit', permission: 'lists.view' },
  'POST /api/recommendations/:id/outcome': { auth: 'unit', permission: 'review.decide' },
  'GET /api/review/queue': { auth: 'unit', permission: 'review.decide' },
  'GET /api/today': { auth: 'unit', permission: 'today.view' },
  'GET /api/analytics/areas': { auth: 'unit', permission: 'analytics.view' },
  'GET /api/analytics/gates': { auth: 'unit', permission: 'analytics.view' },
  'GET /api/analytics/funnel': { auth: 'unit', permission: 'analytics.view' },
  'GET /api/analytics/evidence': { auth: 'unit', permission: 'analytics.view' },
  'GET /api/analytics/weekly': { auth: 'unit', permission: 'analytics.view' },
  'GET /api/analytics/weekly.md': { auth: 'unit', permission: 'analytics.view' },
  'GET /api/analytics/readout': { auth: 'unit', permission: 'analytics.view' },
  'GET /api/analytics/readout.md': { auth: 'unit', permission: 'analytics.view' },
  'GET /api/analytics/learning-loop': { auth: 'unit', permission: 'analytics.view' },
  'GET /api/analytics/validation': { auth: 'unit', permission: 'analytics.view' },
  'PATCH /api/analytics/validation': { auth: 'unit', permission: 'validation.edit' },
  'GET /api/exports/outcome-log.csv': { auth: 'unit', permission: 'review.decide' },
  'POST /api/readout/signoffs': { auth: 'unit', permission: 'readout.signoff' },
  'GET /api/routing-rules': { auth: 'unit', permission: 'lists.view' },
  'POST /api/routing-rules': { auth: 'unit', permission: 'routing.manage' },
  'PATCH /api/routing-rules/:id': { auth: 'unit', permission: 'routing.manage' },
  'DELETE /api/routing-rules/:id': { auth: 'unit', permission: 'routing.manage' },
  'POST /api/routing-rules/:id/move': { auth: 'unit', permission: 'routing.manage' },
  'GET /api/scoring-runs/:id/routing': { auth: 'unit', permission: 'lists.view' },
  'POST /api/accounts/:id/transfer': { auth: 'unit', permission: 'routing.transfer' },
  'GET /api/transfers': { auth: 'unit', permission: 'lists.view' },
  'POST /api/recommendations/:id/accept': { auth: 'unit', permission: 'review.decide' },
  'POST /api/recommendations/:id/reject': { auth: 'unit', permission: 'review.decide' },
  'POST /api/recommendations/:id/hold': { auth: 'unit', permission: 'review.decide' },
  'POST /api/recommendations/:id/unhold': { auth: 'unit', permission: 'review.decide' },
  'POST /api/recommendations/:id/action': { auth: 'unit', permission: 'review.decide' },
  'POST /api/recommendations/:id/fixes': { auth: 'unit', permission: 'review.decide' },
  'POST /api/recommendations/:id/step-in': { auth: 'unit', permission: 'review.decide' },
  'POST /api/recommendations/:id/teach': { auth: 'unit', permission: 'review.decide' },
  'POST /api/recommendations/:id/approve': { auth: 'unit', permission: 'review.approve' },
  'POST /api/recommendations/:id/send-back': { auth: 'unit', permission: 'review.approve' },
  'POST /api/recommendations/:id/reassign': { auth: 'unit', permission: 'review.approve' },
  'POST /api/decision-log/:id/check': { auth: 'unit', permission: 'review.approve' },
  'GET /api/decision-log': { auth: 'unit', permission: 'review.decide' },
  'GET /api/exports/decision-log.csv': { auth: 'unit', permission: 'review.decide' },
  'GET /api/exports/released-messages.csv': { auth: 'unit', permission: 'review.decide' },
  'GET /api/exports/tasks.csv': { auth: 'unit', permission: 'review.decide' },
  'GET /api/column-mappings': { auth: 'unit', permission: 'lists.view' },
  'POST /api/column-mappings': { auth: 'unit', permission: 'lists.write' },
  'POST /api/uploads/:id/recheck': { auth: 'unit', permission: 'data.upload' },
};
// Infrastructure endpoints outside withApi: no session by design, nothing private, own safeguards.
const INFRA = ['GET /api/health', 'GET /api/ready', 'POST /api/client-errors'];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routeFiles(p) : name === 'route.ts' ? [p] : [];
  });
}

test('route inventory: every API route is wrapped in withApi with the expected policy, or is listed infrastructure', () => {
  const found: Record<string, Policy> = {};
  const raw: string[] = [];
  for (const file of routeFiles(join(REPO, 'app', 'api'))) {
    const path = '/' + relative(join(REPO, 'app'), file).replace(/\/route\.ts$/, '').replace(/\[(\w+)\]/g, ':$1');
    const src = readFileSync(file, 'utf8');
    const exports = [...src.matchAll(/export (?:const|async function|function) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map(m => m[1]);
    assert.ok(exports.length, `${path}: no HTTP method exported`);
    for (const method of exports) {
      const m = new RegExp(`export const ${method} = withApi(?:<[^(]*>)?\\(\\s*\\{([^}]*)\\}`).exec(src);
      if (!m) { raw.push(`${method} ${path}`); continue; }
      const opt = (k: string) => new RegExp(`${k}: '([^']+)'`).exec(m[1])?.[1];
      assert.equal(opt('route'), `${method} ${path}`, `${file}: the route label must match the file`);
      found[`${method} ${path}`] = { auth: opt('auth') as Policy['auth'], ...(opt('permission') ? { permission: opt('permission') as Action } : {}) };
    }
  }
  assert.deepEqual(raw.sort(), [...INFRA].sort(), 'only the listed infrastructure routes may skip withApi');
  assert.deepEqual(found, EXPECTED);
});

let srv: TestServer;
const people: Record<string, string> = {};
before(async () => {
  srv = await startServer('http_auth');
  const owner = srv.db.pool('demandai_owner');
  // A Sales manager and a Viewer in unit A, on top of the shared fixtures.
  for (const [email, role] of [['manager.a@demandai.test', 'Sales manager'], ['viewer.a@demandai.test', 'Viewer']] as const) {
    const id = randomUUID();
    await owner.query(`INSERT INTO users (id, email, display_name, status, password_hash, created_by, updated_by)
      SELECT $1, $2, $3, 'active', password_hash, created_by, created_by FROM users WHERE id = $4`, [id, email, email.split('@')[0], srv.ids.adminA]);
    await owner.query(`INSERT INTO business_unit_members (business_unit_id, user_id, role, created_by, updated_by) VALUES ($1, $2, $3, $2, $2)`, [srv.ids.buA, id, role]);
  }
  Object.assign(people, { Admin: 'admin.a@demandai.test', 'Sales manager': 'manager.a@demandai.test', 'Sales rep': 'rep.a2@demandai.test', Viewer: 'viewer.a@demandai.test' });
});
after(async () => { await srv?.stop(); });

const concrete = (route: string) => {
  const [method, path] = route.split(' ');
  return { method, path: path.replace(/:\w+/g, () => randomUUID()) };
};

test('without a session, every non-public route answers 401 with a JSON error and a request ID', async () => {
  const anon = new Browser(srv.base);
  for (const [route, policy] of Object.entries(EXPECTED)) {
    if (policy.auth === 'public') continue;
    const { method, path } = concrete(route);
    const r = await anon.request(method, path, method === 'GET' ? undefined : {});
    assert.equal(r.status, 401, route);
    assert.equal(r.json.code, 'unauthorized', route);
    assert.match(String(r.json.requestId), /^[0-9a-f-]{36}$/, route);
    assert.equal(r.headers.get('x-request-id'), r.json.requestId);
  }
});

test('role × route matrix: each role is refused exactly where the permission table says (403 names the reason)', async () => {
  for (const role of ['Admin', 'Sales manager', 'Sales rep', 'Viewer'] as BuRole[]) {
    const b = new Browser(srv.base);
    await b.signIn(people[role]);
    for (const [route, policy] of Object.entries(EXPECTED)) {
      if (policy.auth === 'public' || route === 'POST /api/auth/logout') continue;
      const { method, path } = concrete(route);
      // Invalid bodies and unknown IDs: an allowed call stops at validation (400) or lookup (404), changing nothing.
      const r = await b.request(method, path, method === 'GET' ? undefined : {});
      const allowed = policy.auth === 'user' || (policy.auth === 'unit' && can(role, policy.permission!));
      if (allowed) assert.ok(![401, 403].includes(r.status), `${role} ${route} should be allowed, got ${r.status} ${r.text}`);
      else {
        assert.equal(r.status, 403, `${role} ${route} should be refused, got ${r.status}`);
        if (policy.auth === 'unit') assert.match(String(r.json.error), new RegExp(`Your role \\(${role}\\) cannot`));
      }
    }
  }
  const platform = new Browser(srv.base);
  await platform.signIn('platform@demandai.test');
  assert.equal((await platform.get('/api/platform/business-units')).status, 200);
  assert.equal((await platform.get('/api/users')).status, 403, 'a platform admin without a unit role sees no unit data');
});

test('writes from another site, or without an Origin header, are refused (CSRF)', async () => {
  const admin = new Browser(srv.base);
  await admin.signIn(people.Admin);
  const body = { email: 'csrf@demandai.test', displayName: 'Csrf', role: 'Viewer' };
  const evil = await admin.request('POST', '/api/users', body, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  const res = await fetch(`${srv.base}/api/users`, { method: 'POST', headers: { cookie: admin.cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(res.status, 403, 'no Origin header');
  const count = (await srv.db.pool('demandai_owner').query(`SELECT count(*)::int n FROM users WHERE email = 'csrf@demandai.test'`)).rows[0].n;
  assert.equal(count, 0);
});

test('sign-in: cookie flags, one reply for wrong password and unknown email, then 429 with Retry-After', async () => {
  const b = new Browser(srv.base);
  const ok = await b.post('/api/auth/login', { email: people.Viewer, password: 'correct horse battery 42' });
  const cookie = ok.headers.get('set-cookie')!;
  for (const flag of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=43200']) assert.ok(cookie.includes(flag), flag);
  const wrong = await new Browser(srv.base).post('/api/auth/login', { email: people.Viewer, password: 'nope nope nope' });
  const unknown = await new Browser(srv.base).post('/api/auth/login', { email: 'nobody@demandai.test', password: 'nope nope nope' });
  assert.equal(wrong.status, 401);
  assert.deepEqual([unknown.status, unknown.json.error], [wrong.status, wrong.json.error]);
  let last;
  // The limit is 10 attempts per email per 15 minutes; the 11th is refused.
  for (let i = 0; i < 11; i++) last = await new Browser(srv.base).post('/api/auth/login', { email: 'target@demandai.test', password: 'guess guess guess' });
  assert.equal(last!.status, 429);
  assert.ok(Number(last!.headers.get('retry-after')) > 0);
});

test('pages: no session redirects to sign-in; a Viewer gets Analytics only; Admin opens For Review; no role switcher', async () => {
  const anon = await fetch(`${srv.base}/prospecting`, { redirect: 'manual' });
  assert.equal(anon.status, 307);
  assert.match(anon.headers.get('location')!, /^(https?:\/\/[^/]+)?\/login\?next=%2Fprospecting$/);
  const viewer = new Browser(srv.base);
  await viewer.signIn(people.Viewer);
  const blocked = await viewer.get('/prospecting');
  assert.equal(blocked.status, 200);
  assert.match(blocked.text, /Not available for your role/);
  assert.doesNotMatch(blocked.text, /Upload a lead file/i, "the screen itself isn't sent");
  const home = await viewer.get('/');
  assert.equal(home.headers.get('location'), '/analytics');
  assert.doesNotMatch((await viewer.get('/analytics')).text, /Not available for your role/);
  const admin = new Browser(srv.base);
  await admin.signIn(people.Admin);
  const review = await admin.get('/review');
  assert.doesNotMatch(review.text, /Not available for your role/, 'G-034: Admin can open For Review');
  assert.doesNotMatch(review.text, /Switch role/, 'the demo role switcher is gone');
});

test('invite with email off: the Admin gets a copy link, the new person sets a password and lands in the unit', async () => {
  const admin = new Browser(srv.base);
  await admin.signIn(people.Admin);
  const inv = await admin.post('/api/users', { email: 'fresh.rep@demandai.test', displayName: 'Fresh Rep', role: 'Sales rep' });
  assert.equal(inv.status, 201);
  assert.equal(inv.json.emailed, false);
  const token = /#token=(.+)$/.exec(String(inv.json.link))![1];
  const newcomer = new Browser(srv.base);
  const weak = await newcomer.post('/api/auth/accept-invite', { token, password: 'short' });
  assert.equal(weak.status, 400);
  assert.ok(Array.isArray((weak.json.fields as { password: string[] }).password));
  const accepted = await newcomer.post('/api/auth/accept-invite', { token, password: 'green lantern over water' });
  assert.equal(accepted.status, 200);
  const me = await newcomer.get('/api/me');
  assert.equal((me.json.user as { activeBusinessUnit: { role: string } }).activeBusinessUnit.role, 'Sales rep');
  assert.ok(!JSON.stringify(me.json).includes('$2'), 'no password data');
  assert.equal((await new Browser(srv.base).post('/api/auth/accept-invite', { token, password: 'green lantern over water' })).status, 400, 'single use');
});

test('switching business unit changes the role at once; signing out ends the session', async () => {
  const rep = new Browser(srv.base);
  await rep.signIn('rep.a@demandai.test');
  const me = (await rep.get('/api/me')).json.user as { activeBusinessUnit: { id: string; role: string }; memberships: { businessUnitId: string }[] };
  assert.equal(me.memberships.length, 2);
  const other = me.memberships.find(m => m.businessUnitId !== me.activeBusinessUnit.id)!;
  assert.equal((await rep.post('/api/session/business-unit', { businessUnitId: other.businessUnitId })).status, 200);
  const after = (await rep.get('/api/me')).json.user as { activeBusinessUnit: { id: string; role: string } };
  assert.equal(after.activeBusinessUnit.id, other.businessUnitId);
  assert.equal((await rep.post('/api/session/business-unit', { businessUnitId: randomUUID() })).status, 403, 'not a member there');
  const oldCookie = rep.cookie;
  assert.equal((await rep.post('/api/auth/logout', {})).status, 200);
  const replay = await fetch(`${srv.base}/api/me`, { headers: { cookie: oldCookie } });
  assert.equal(replay.status, 401, 'the old cookie no longer works');
});

test('Analytics and Today: a Viewer reads aggregates without records; the reports download as Markdown; a rep can’t change the settings', async () => {
  const viewer = new Browser(srv.base);
  await viewer.signIn(people.Viewer);
  const areas = await viewer.get('/api/analytics/areas');
  assert.equal(areas.status, 200);
  assert.deepEqual((areas.json.areas as { key: string }[]).map(a => a.key), ['discovery', 'qualification', 'intent', 'routing', 'content', 'value']);
  assert.equal((await viewer.get('/api/analytics/learning-loop')).json.records, null, 'no account or contact records for a Viewer');
  const weekly = await viewer.get('/api/analytics/weekly.md');
  assert.equal(weekly.status, 200);
  assert.equal(weekly.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.match(weekly.headers.get('content-disposition')!, /^attachment; filename="weekly_summary_\d{4}-W\d{2}\.md"/);
  assert.match(weekly.text, /^# Weekly summary · \d{4}-W\d{2}\n/);
  const readout = await viewer.get('/api/analytics/readout.md');
  assert.match(readout.headers.get('content-disposition')!, /filename="pilot_readout\.md"/);
  assert.match(readout.text, /^# Pilot readout\n/);
  assert.equal((await viewer.get('/api/analytics/gates?rep=rep.a2@demandai.test')).status, 403, 'only managers look at one rep');
  assert.equal((await viewer.get('/api/analytics/weekly?week=last')).status, 400);
  const rep = new Browser(srv.base);
  await rep.signIn(people['Sales rep']);
  assert.equal((await rep.request('PATCH', '/api/analytics/validation', { g2Threshold: 75 })).status, 403);
  const today = await rep.get('/api/today');
  assert.equal(today.status, 200);
  assert.equal(typeof today.json.nothing, 'boolean');
  const manager = new Browser(srv.base);
  await manager.signIn(people['Sales manager']);
  assert.equal((await manager.request('PATCH', '/api/analytics/validation', { g2Threshold: 140 })).status, 400);
  assert.equal((await manager.request('PATCH', '/api/analytics/validation', { surprise: 1 })).status, 400, 'unknown settings are refused');
});

test('logs: one access line per API request with request ID and status, and no email addresses anywhere', async () => {
  const lines = srv.logs.join('').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  const access = lines.filter(l => l.event === 'http.request');
  assert.ok(access.length > 50);
  for (const l of access) {
    assert.match(l.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(typeof l.status, 'number');
    assert.equal(typeof l.durationMs, 'number');
  }
  assert.ok(access.some(l => l.userId && l.businessUnitId), 'signed-in lines carry user and unit IDs');
  assert.doesNotMatch(srv.logs.join(''), /[a-z0-9.]+@demandai\.test/i, 'no email address in any log line');
});
