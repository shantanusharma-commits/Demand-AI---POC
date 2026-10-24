// Security headers and the Content Security Policy on the production build (G-054; plan §4 item 12, §9 item 4):
// every page gets a CSP whose script nonce is fresh per request and is on every script and style element the page
// sends; scripts never run inline or through eval; no page can be framed; fonts come from the app, not Google; and
// every response, pages, API, static files and errors alike, carries the other headers and no X-Powered-By.
// The server runs with an https APP_BASE_URL (as deployed), so the https-only parts are checked too.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { Browser, PASSWORD, startServer, type TestServer } from './server.ts';

const ORIGIN = 'https://demandai.example';
let srv: TestServer;
let admin: Browser;
before(async () => {
  srv = await startServer('http_headers', { APP_BASE_URL: ORIGIN });
  admin = new Browser(srv.base);
  const r = await admin.post('/api/auth/login', { email: 'admin.a@demandai.test', password: PASSWORD }, { origin: ORIGIN });
  assert.equal(r.status, 200, r.text);
});
after(async () => { await srv?.stop(); });

const directives = (csp: string) => new Map(csp.split(';').map(d => d.trim()).filter(Boolean).map(d => { const [k, ...v] = d.split(/\s+/); return [k, v] as const; }));
const nonceOf = (csp: string) => /'nonce-([A-Za-z0-9+/=]+)'/.exec(directives(csp).get('script-src')!.join(' '))?.[1];
const tags = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(m => m[0]);

test('every page gets a CSP with a fresh nonce, on every script and style element it sends; no inline or eval scripts', async () => {
  const anon = new Browser(srv.base);
  const pages: [Browser, string][] = [[anon, '/login'], [anon, '/accept-invite'], [anon, '/forgot-password'], [anon, '/reset-password'], [admin, '/no-such-page'],
    [admin, '/today'], [admin, '/prospecting'], [admin, '/review'], [admin, '/studio']];
  const seen = new Set<string>();
  for (const [b, path] of pages) {
    const r = await b.get(path);
    assert.ok([200, 404].includes(r.status), `${path}: ${r.status}`);
    const csp = r.headers.get('content-security-policy');
    assert.ok(csp, `${path}: no CSP`);
    const d = directives(csp), nonce = nonceOf(csp);
    assert.ok(nonce && nonce.length >= 22, `${path}: no nonce`);
    assert.ok(!seen.has(nonce), `${path}: a nonce was reused`);
    seen.add(nonce);
    const scripts = d.get('script-src')!;
    assert.ok(scripts.includes("'strict-dynamic'"), path);
    assert.ok(!scripts.includes("'unsafe-inline'") && !scripts.includes("'unsafe-eval'"), `${path}: ${scripts.join(' ')}`);
    assert.deepEqual(d.get('style-src-elem'), ["'self'", `'nonce-${nonce}'`], path);
    for (const [k, v] of [['frame-ancestors', "'none'"], ['object-src', "'none'"], ['base-uri', "'none'"], ['default-src', "'self'"], ['font-src', "'self'"], ['connect-src', "'self'"]]) {
      assert.deepEqual(d.get(k), [v], `${path} ${k}`);
    }
    assert.ok(d.has('upgrade-insecure-requests'), `${path}: an https deployment upgrades requests`);
    const scriptTags = tags(r.text, 'script'), styleTags = tags(r.text, 'style');
    assert.ok(scriptTags.length > 0, `${path}: no scripts?`);
    for (const t of [...scriptTags, ...styleTags]) assert.ok(t.includes(`nonce="${nonce}"`), `${path}: ${t.slice(0, 120)} has no nonce`);
    assert.doesNotMatch(r.text, /fonts\.(googleapis|gstatic)\.com/, `${path}: fonts must be self-hosted`);
  }
  // Fonts are preloaded (Next.js sends a Link header) from the app's own static files.
  const login = await anon.get('/login');
  const fonts = (login.headers.get('link') ?? '').split(/,\s*(?=<)/).filter(l => /as="font"/.test(l));
  assert.ok(fonts.length >= 3, `font preloads: ${fonts.length}`);
  for (const f of fonts) assert.match(f, /^<\/_next\/static\/media\/[^>]+\.woff2>/);
  const font = await fetch(srv.base + /^<([^>]+)>/.exec(fonts[0])![1]);
  assert.equal(font.status, 200);
});

test('every response carries the security headers and none says what it runs on: pages, API, static files, errors', async () => {
  const anon = new Browser(srv.base);
  const login = await anon.get('/login');
  const asset = await fetch(srv.base + /src="(\/_next\/static\/[^"]+\.js)"/.exec(login.text)![1]);
  assert.equal(asset.status, 200);
  const responses: [string, Headers][] = [
    ['page', login.headers],
    ['redirect to sign-in', (await anon.get('/today')).headers],
    ['API 200', (await admin.get('/api/me')).headers],
    ['API 401', (await anon.get('/api/me')).headers],
    ['API 403 (CSRF)', (await admin.post('/api/users', {}, { origin: 'https://evil.example' })).headers],
    ['health', (await anon.get('/api/health')).headers],
    ['ready', (await anon.get('/api/ready')).headers],
    ['static script', asset.headers],
    ['404 page', (await admin.get('/no-such-page')).headers],
  ];
  for (const [what, h] of responses) {
    assert.equal(h.get('strict-transport-security'), 'max-age=31536000; includeSubDomains', what);
    assert.equal(h.get('x-content-type-options'), 'nosniff', what);
    assert.equal(h.get('x-frame-options'), 'DENY', what);
    assert.equal(h.get('referrer-policy'), 'same-origin', what);
    assert.match(h.get('permissions-policy') ?? '', /camera=\(\), microphone=\(\), geolocation=\(\)/, what);
    assert.equal(h.get('cross-origin-opener-policy'), 'same-origin', what);
    assert.equal(h.get('cross-origin-resource-policy'), 'same-origin', what);
    assert.equal(h.get('x-powered-by'), null, what);
  }
});
