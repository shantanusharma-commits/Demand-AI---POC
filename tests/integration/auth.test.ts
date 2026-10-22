// Sign-in, sessions, invites and resets against PostgreSQL (G-001, G-003, D-3): non-enumeration, lockout, rate
// limits, single-use expiring links, a reset that ends every session, refusal of tampered cookies and of people
// removed or deactivated, and no password data in user lists.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { createDb, withTenant, withUser, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { signSessionId } from '../../lib/server/auth/crypto.ts';
import { loadSession, type SessionConfig } from '../../lib/server/auth/sessions.ts';
import { acceptInvite, login, LOCK_MINUTES, MAX_FAILED_LOGINS, requestPasswordReset, resetPassword, type AuthDeps } from '../../lib/server/services/auth.ts';
import { inviteMember, issueResetLink, listMembers, removeMember, resendInvite, restoreMember, updateMember, type UsersDeps } from '../../lib/server/services/users.ts';
import { createUnit, inviteUnitAdmin, listUnits } from '../../lib/server/services/platform.ts';
import type { MailMessage, Mailer } from '../../lib/server/mail/mailer.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { createAdmin } from '../../scripts/users/create-admin.mjs';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';

const PASSWORD = 'correct horse battery 42';
const session: SessionConfig = { secret: 's'.repeat(48), absoluteHours: 12, idleMinutes: 60, secureCookies: false };

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const sent: MailMessage[] = [];
const mailer: Mailer = { enabled: true, send: async m => { sent.push(m); return { delivered: true }; } };
const offMailer: Mailer = { enabled: false, send: async () => ({ delivered: false }) };
const deps = (): AuthDeps & UsersDeps => ({ db: app, mailer, session, appBaseUrl: 'https://demandai.example.test' });
const client = { ip: '203.0.113.10', userAgent: 'test' };
const adminA = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const tokenFrom = (m: MailMessage) => /#token=([^\s"<]+)/.exec(m.text)![1];

before(async () => {
  db = await freshDatabase('auth');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  const hash = bcrypt.hashSync(PASSWORD, 4);
  await owner.query(`UPDATE users SET password_hash = $1 WHERE kind = 'person'`, [hash]);
});
after(async () => { await db?.drop(); });

const rejectsWith = (status: number, re?: RegExp) => (err: unknown) => err instanceof HttpError && err.status === status && (!re || re.test(err.message));

test('a wrong password and an unknown email get the same answer', async () => {
  const wrong = await login(deps(), { email: 'rep.a@demandai.test', password: 'not the password', ...client });
  const unknown = await login(deps(), { email: 'nobody@demandai.test', password: 'not the password', ...client });
  assert.deepEqual(wrong, { ok: false, reason: 'invalid' });
  assert.deepEqual(unknown, wrong);
  const ok = await login(deps(), { email: 'REP.A@demandai.test', password: PASSWORD, ...client });
  assert.equal(ok.ok, true, 'email is case-insensitive');
});

test(`${MAX_FAILED_LOGINS} wrong passwords lock the account for ${LOCK_MINUTES} minutes, then it works again`, async () => {
  for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login(deps(), { email: 'rep.a2@demandai.test', password: 'wrong', ...client, ip: `198.51.100.${i}` });
  const locked = await login(deps(), { email: 'rep.a2@demandai.test', password: PASSWORD, ...client });
  assert.deepEqual(locked, { ok: false, reason: 'invalid' }, 'even the right password is refused while locked, with the same reply');
  await owner.query(`UPDATE users SET locked_until = now() - interval '1 second' WHERE email = 'rep.a2@demandai.test'`);
  assert.equal((await login(deps(), { email: 'rep.a2@demandai.test', password: PASSWORD, ...client })).ok, true);
  assert.equal((await owner.query(`SELECT failed_login_count n FROM users WHERE email = 'rep.a2@demandai.test'`)).rows[0].n, 0);
});

test('sign-in attempts are rate-limited per email, whoever sends them', async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await login(deps(), { email: 'nobody.else@demandai.test', password: 'x', ip: `192.0.2.${i}` });
  assert.equal(last!.ok, false);
  assert.equal((last as { reason: string }).reason, 'rate_limited');
  const keys = (await owner.query(`SELECT key FROM rate_limits`)).rows.map(r => r.key).join(' ');
  assert.ok(!keys.includes('@') && !keys.includes('192.0.2'), 'keys hold hashes, not emails or addresses');
});

test('sessions: valid cookie works; tampered, revoked, idle-expired or deactivated-user sessions do not', async () => {
  const r = await login(deps(), { email: 'admin.a@demandai.test', password: PASSWORD, ...client });
  assert.ok(r.ok);
  if (!r.ok) return;
  const loaded = await loadSession(app, session, r.cookie);
  assert.equal(loaded?.user.activeBusinessUnit?.role, 'Admin');
  assert.equal(JSON.stringify(loaded).includes('$2'), false, 'no password hash in the session user');
  assert.equal(await loadSession(app, session, r.cookie.slice(0, -1) + (r.cookie.endsWith('A') ? 'B' : 'A')), null, 'tampered');
  assert.equal(await loadSession(app, session, signSessionId(randomUUID(), session.secret)), null, 'well-signed but unknown');
  const sid = loaded!.sessionId;
  await owner.query(`UPDATE sessions SET idle_expires_at = now() - interval '1 second' WHERE id = $1`, [sid]);
  assert.equal(await loadSession(app, session, r.cookie), null, 'idle too long');
  await owner.query(`UPDATE sessions SET idle_expires_at = now() + interval '1 hour', expires_at = now() - interval '1 second' WHERE id = $1`, [sid]);
  assert.equal(await loadSession(app, session, r.cookie), null, 'past the absolute expiry');
  await owner.query(`UPDATE sessions SET expires_at = now() + interval '1 hour' WHERE id = $1`, [sid]);
  assert.ok(await loadSession(app, session, r.cookie));
  await owner.query(`UPDATE users SET status = 'deactivated' WHERE id = $1`, [ids.adminA]);
  assert.equal(await loadSession(app, session, r.cookie), null, 'a deactivated user is refused on the next request');
  await owner.query(`UPDATE users SET status = 'active' WHERE id = $1`, [ids.adminA]);
});

test('invite: emailed link, weak password keeps the link usable, then single use; a resend voids the old link', async () => {
  sent.length = 0;
  const r = await withTenant(app, adminA(), s => inviteMember(deps(), s, { userId: ids.adminA, role: 'Admin' }, { email: 'new.rep@demandai.test', displayName: 'New Rep', role: 'Sales rep' }));
  assert.deepEqual([r.emailed, r.link, r.existingAccount], [true, null, false]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'invite');
  const token = tokenFrom(sent[0]);
  assert.ok(sent[0].text.includes('https://demandai.example.test/accept-invite#token='), 'token travels in the fragment');
  const weak = await acceptInvite(deps(), { token, password: 'password1234', ...client });
  assert.equal(weak.ok, false);
  assert.equal((weak as { reason: string }).reason, 'weak_password');
  const ok = await acceptInvite(deps(), { token, password: 'blue river under the bridge', ...client });
  assert.equal(ok.ok, true);
  const again = await acceptInvite(deps(), { token, password: 'blue river under the bridge', ...client });
  assert.deepEqual(again, { ok: false, reason: 'invalid_link' });
  const row = (await owner.query(`SELECT status, email_verified_at IS NOT NULL AS verified FROM users WHERE email = 'new.rep@demandai.test'`)).rows[0];
  assert.deepEqual(row, { status: 'active', verified: true });

  sent.length = 0;
  await withTenant(app, adminA(), s => inviteMember(deps(), s, { userId: ids.adminA, role: 'Admin' }, { email: 'late@demandai.test', displayName: 'Late Joiner', role: 'Viewer' }));
  const first = tokenFrom(sent[0]);
  const userId = (await owner.query(`SELECT id FROM users WHERE email = 'late@demandai.test'`)).rows[0].id;
  await withTenant(app, adminA(), s => resendInvite(deps(), s, { userId: ids.adminA, role: 'Admin' }, userId));
  const second = tokenFrom(sent[1]);
  assert.deepEqual(await acceptInvite(deps(), { token: first, password: 'violet lamps glow softly', ...client }), { ok: false, reason: 'invalid_link' });
  await owner.query(`UPDATE email_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  assert.deepEqual(await acceptInvite(deps(), { token: second, password: 'violet lamps glow softly', ...client }), { ok: false, reason: 'invalid_link' }, 'expired');
});

test('reset: same reply for unknown emails; the link works once and ends every session', async () => {
  sent.length = 0;
  await requestPasswordReset(deps(), { email: 'ghost@demandai.test', ...client });
  assert.equal(sent.length, 0);
  const s1 = await login(deps(), { email: 'rep.b@demandai.test', password: PASSWORD, ...client });
  const s2 = await login(deps(), { email: 'rep.b@demandai.test', password: PASSWORD, ...client, ip: '203.0.113.99' });
  assert.ok(s1.ok && s2.ok);
  await requestPasswordReset(deps(), { email: 'rep.b@demandai.test', ...client });
  assert.equal(sent.length, 1);
  const token = tokenFrom(sent[0]);
  assert.deepEqual(await resetPassword(deps(), { token, password: 'orange tram at midnight', ...client }), { ok: true });
  assert.equal(sent.at(-1)!.kind, 'password_changed');
  if (!s1.ok || !s2.ok) return;
  assert.equal(await loadSession(app, session, s1.cookie), null, 'every session ended');
  assert.equal(await loadSession(app, session, s2.cookie), null);
  assert.deepEqual(await resetPassword(deps(), { token, password: 'another long phrase here', ...client }), { ok: false, reason: 'invalid_link' }, 'single use');
  assert.equal((await login(deps(), { email: 'rep.b@demandai.test', password: PASSWORD, ...client })).ok, false, 'old password gone');
  assert.equal((await login(deps(), { email: 'rep.b@demandai.test', password: 'orange tram at midnight', ...client })).ok, true);
});

test('with email off, invites and reset links come back to the Admin to copy', async () => {
  const off = { ...deps(), mailer: offMailer };
  const r = await withTenant(app, adminA(), s => inviteMember(off, s, { userId: ids.adminA, role: 'Admin' }, { email: 'copy.link@demandai.test', displayName: 'Copy Link', role: 'Sales rep' }));
  assert.equal(r.emailed, false);
  assert.match(r.link!, /^https:\/\/demandai\.example\.test\/accept-invite#token=/);
  const reset = await withTenant(app, adminA(), s => issueResetLink(off, s, { userId: ids.adminA, role: 'Admin' }, ids.repA));
  assert.match(reset.link!, /\/reset-password#token=/);
});

test('roles: only an Admin grants Admin; the last Admin cannot be demoted or removed', async () => {
  const manager = { userId: ids.adminA, role: 'Sales manager' as const };
  await assert.rejects(withTenant(app, adminA(), s => updateMember(s, manager, ids.repA, { role: 'Admin' })), rejectsWith(403, /Only an Admin/));
  await assert.rejects(withTenant(app, adminA(), s => updateMember(s, { userId: ids.adminA, role: 'Admin' }, ids.adminA, { role: 'Viewer' })), rejectsWith(409, /last active Admin/));
  await assert.rejects(withTenant(app, adminA(), s => removeMember(s, { userId: ids.adminA, role: 'Admin' }, ids.adminA, 'leaving')), rejectsWith(409, /last active Admin/));
  await withTenant(app, adminA(), s => updateMember(s, { userId: ids.adminA, role: 'Admin' }, ids.repA2, { role: 'Admin', reason: 'second admin' }));
  await withTenant(app, adminA(), s => updateMember(s, { userId: ids.adminA, role: 'Admin' }, ids.adminA, { role: 'Sales manager' }));
  const history = (await owner.query(`SELECT field, from_value, to_value FROM user_role_history WHERE user_id = $1 ORDER BY created_at`, [ids.repA2])).rows;
  assert.deepEqual(history.at(-1), { field: 'role', from_value: 'Sales rep', to_value: 'Admin' });
  const audit = (await owner.query(`SELECT count(*)::int n FROM audit_log WHERE action = 'user.updated' AND business_unit_id = $1`, [ids.buA])).rows[0].n;
  assert.ok(audit >= 2, 'every change is audited');
  // Restore the original Admin for the tests that follow.
  await withTenant(app, { ...adminA(), userId: ids.repA2 }, s => updateMember(s, { userId: ids.repA2, role: 'Admin' }, ids.adminA, { role: 'Admin' }));
});

test('removing someone from a unit ends their sessions; restoring brings the membership back', async () => {
  const s = await login(deps(), { email: 'rep.a2@demandai.test', password: PASSWORD, ...client });
  assert.ok(s.ok);
  if (!s.ok) return;
  await withTenant(app, adminA(), sc => updateMember(sc, { userId: ids.adminA, role: 'Admin' }, ids.repA2, { role: 'Sales rep' }));
  await withTenant(app, adminA(), sc => removeMember(sc, { userId: ids.adminA, role: 'Admin' }, ids.repA2, 'left the team'));
  assert.equal(await loadSession(app, session, s.cookie), null);
  const again = await login(deps(), { email: 'rep.a2@demandai.test', password: PASSWORD, ...client });
  assert.ok(again.ok);
  if (!again.ok) return;
  assert.equal((await loadSession(app, session, again.cookie))?.user.activeBusinessUnit, null, 'signed in, but no unit to work in');
  await withTenant(app, adminA(), sc => restoreMember(sc, { userId: ids.adminA, role: 'Admin' }, ids.repA2, 'came back'));
  assert.equal((await loadSession(app, session, again.cookie))?.user.activeBusinessUnit?.id, ids.buA);
});

test('a unit cannot change or see people of another unit (IDOR), and lists never carry password data', async () => {
  await assert.rejects(withTenant(app, adminA(), s => updateMember(s, { userId: ids.adminA, role: 'Admin' }, ids.repB, { role: 'Viewer' })), rejectsWith(404));
  await assert.rejects(withTenant(app, adminA(), s => removeMember(s, { userId: ids.adminA, role: 'Admin' }, ids.repB, 'nope')), rejectsWith(404));
  const members = await withTenant(app, adminA(), s => listMembers(s));
  assert.ok(!members.some(m => m.id === ids.repB), "unit B's rep isn't listed in unit A");
  const text = JSON.stringify(members);
  assert.ok(!/\$2[aby]\$/.test(text) && !/password/i.test(text), 'no password hash or field');
});

test('platform: a new unit starts with config v1 and its first Admin; the CLI makes an Admin whose link works', async () => {
  const pa = { userId: ids.platform, platformAdmin: true };
  const unit = await withUser(app, pa, s => createUnit(s, { code: 'unit-c', name: 'Unit C' }));
  const cfg = (await owner.query(`SELECT version_no, status FROM config_versions WHERE business_unit_id = $1`, [unit.id])).rows;
  assert.deepEqual(cfg, [{ version_no: 1, status: 'active' }]);
  sent.length = 0;
  const invited = await withUser(app, pa, s => inviteUnitAdmin(deps(), s, unit.id, { email: 'lead.c@demandai.test', displayName: 'Lead C' }));
  assert.equal(invited.emailed, true);
  const units = await withUser(app, pa, s => listUnits(s));
  assert.equal(units.find(u => u.id === unit.id)?.admins, 1);

  const c = await owner.connect();
  try {
    const { token } = await createAdmin(c, { platform: false, unit: 'unit-c', email: 'ops.c@demandai.test', name: 'Ops C' });
    const accepted = await acceptInvite(deps(), { token, password: 'seven quiet harbour lights', ...client });
    assert.equal(accepted.ok, true);
    if (accepted.ok) assert.equal((await loadSession(app, session, accepted.cookie))?.user.activeBusinessUnit?.role, 'Admin');
  } finally {
    c.release();
  }
});
