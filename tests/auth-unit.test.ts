// Sign-in building blocks without a database: signed cookies, link tokens, password rules and the permission
// table (G-001, G-034, D-26, D-33). Run with --conditions=react-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { newLinkToken, parseLinkToken, pseudonym, sha256Hex, signSessionId, verifySessionCookie } from '../lib/server/auth/crypto.ts';
import { passwordProblems } from '../lib/server/auth/password.ts';
import { ACTION_LABELS, ACTIONS, BU_ROLES, can, canAccessPage, homePage, PAGE_ACCESS, PAGES, scopeFor, type PageId } from '../lib/auth/permissions.ts';
import { clearSessionCookieHeader, sessionCookieHeader } from '../lib/server/auth/sessions.ts';

const SECRET = 'a'.repeat(48);

test('a signed session cookie verifies; a tampered, re-signed or malformed one does not', () => {
  const id = randomUUID();
  const cookie = signSessionId(id, SECRET);
  assert.equal(verifySessionCookie(cookie, SECRET), id);
  const [, sig] = cookie.split('.');
  assert.equal(verifySessionCookie(`${randomUUID()}.${sig}`, SECRET), null, 'another session ID with this signature');
  assert.equal(verifySessionCookie(signSessionId(id, 'b'.repeat(48)), SECRET), null, 'signed with another secret');
  assert.equal(verifySessionCookie(`${id}.${sig.slice(0, -2)}xx`, SECRET), null, 'altered signature');
  const forged = `${id}.${createHmac('sha256', '').update(id).digest('base64url')}`;
  assert.equal(verifySessionCookie(forged, SECRET), null, 'signed with an empty key');
  for (const bad of [undefined, null, '', id, `${id}.`, 'not-a-uuid.abc', `${id}.${sig}.extra`, 'x'.repeat(500)]) {
    assert.equal(verifySessionCookie(bad as string, SECRET), null, String(bad).slice(0, 20));
  }
});

test('session cookies are HttpOnly, SameSite=Lax, Path=/, and Secure over https', () => {
  const c = sessionCookieHeader('v', 3600, true);
  assert.match(c, /^demandai_session=v; /);
  for (const part of ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=3600', 'Secure']) assert.ok(c.includes(part), part);
  assert.ok(!sessionCookieHeader('v', 1, false).includes('Secure'));
  assert.match(clearSessionCookieHeader(true), /Max-Age=0/);
});

test('link tokens: 256-bit secret, only its hash is stored, and parsing rejects anything else', () => {
  const t = newLinkToken();
  assert.equal(t.hash, sha256Hex(t.secret));
  assert.ok(!t.hash.includes(t.secret));
  assert.deepEqual(parseLinkToken(t.token), { id: t.id, secret: t.secret });
  assert.ok(t.secret.length >= 43);
  for (const bad of ['', t.id, `${t.id}.short`, `nope.${t.secret}`, `${t.token}x$`]) assert.equal(parseLinkToken(bad), null, bad);
  assert.notEqual(newLinkToken().token, t.token);
});

test('pseudonyms are keyed and stable, so rate-limit keys never hold an address', () => {
  assert.equal(pseudonym(' A@B.com ', SECRET), pseudonym('a@b.com', SECRET));
  assert.notEqual(pseudonym('a@b.com', SECRET), pseudonym('a@b.com', 'z'.repeat(48)));
  assert.ok(!pseudonym('a@b.com', SECRET).includes('@'));
});

test('password rules: length, common words with digits, own email or name, and the 72-byte bcrypt limit', () => {
  assert.deepEqual(passwordProblems('short'), ['Use at least 12 characters.']);
  assert.ok(passwordProblems('Password2026!').includes('This password is too common.'));
  assert.ok(passwordProblems('Welcome12345').includes('This password is too common.'));
  assert.ok(passwordProblems('aaaaaaaaaaaaaa').includes("Don't repeat one character."));
  assert.ok(passwordProblems('my demandai login').includes("Don't use the product's name."));
  assert.ok(passwordProblems('priya.sharma-2026-x', { email: 'priya.sharma@company.com' }).includes("Don't use your email address."));
  assert.ok(passwordProblems('sharma likes tea time', { displayName: 'Priya Sharma' }).includes("Don't use your name."));
  assert.ok(passwordProblems('é'.repeat(40)).some(p => p.startsWith('Use at most 72 bytes')));
  assert.deepEqual(passwordProblems('purple kettle drums at noon', { email: 'priya@company.com', displayName: 'Priya Sharma' }), []);
});

test('permissions: Admin opens For Review (G-034); reps lose Setup and Users; Viewers see Analytics only', () => {
  assert.ok(canAccessPage('Admin', '14-review.html'));
  assert.equal(PAGE_ACCESS.Admin.length, Object.keys(PAGES).length);
  assert.equal(PAGE_ACCESS['Sales manager'].length, Object.keys(PAGES).length);
  assert.ok(!canAccessPage('Sales rep', '09-setup.html') && !canAccessPage('Sales rep', '08-users.html'));
  assert.ok(canAccessPage('Sales rep', '14-review.html') && canAccessPage('Sales rep', '10-prospecting.html'));
  assert.ok(canAccessPage('Sales rep', '15-content-studio.html') && !canAccessPage('Viewer', '15-content-studio.html'), 'D-36: reps write content; viewers don’t');
  assert.deepEqual(PAGE_ACCESS.Viewer, ['13-analytics.html']);
  for (const p of Object.keys(PAGES) as PageId[]) assert.equal(canAccessPage(null, p), false, `no role, no ${p}`);
  assert.equal(homePage('Viewer'), '13-analytics.html');
  assert.equal(homePage('Sales rep'), '00-today.html');
});

test('permissions: only Admin grants Admin (D-26); managers manage users; reps work their own rows (D-33)', () => {
  assert.deepEqual(BU_ROLES.filter(r => can(r, 'users.grantAdmin')), ['Admin']);
  assert.deepEqual(BU_ROLES.filter(r => can(r, 'users.manage')), ['Admin', 'Sales manager']);
  assert.deepEqual(BU_ROLES.filter(r => can(r, 'review.approve')), ['Admin', 'Sales manager']);
  assert.deepEqual(BU_ROLES.filter(r => can(r, 'data.upload')), ['Admin', 'Sales manager', 'Sales rep']);
  assert.deepEqual(BU_ROLES.filter(r => can(r, 'analytics.view')), [...BU_ROLES]);
  assert.equal(scopeFor('Sales rep'), 'own');
  for (const r of ['Admin', 'Sales manager', 'Viewer'] as const) assert.equal(scopeFor(r), 'all');
  assert.equal(can(null, 'analytics.view'), false);
  assert.deepEqual(Object.keys(ACTION_LABELS).sort(), Object.keys(ACTIONS).sort(), 'every action has words for a 403');
});
