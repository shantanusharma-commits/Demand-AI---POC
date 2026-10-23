// Content library on the server against PostgreSQL (G-009): the unit's draft and what it changes, saving a version,
// restoring an earlier one (append-only versions), claims with an owner and an expiry read by the draft checks,
// guideline documents, and business-unit isolation.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import * as N from '../../lib/engine/nba.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import type { Actor } from '../../lib/server/services/lists.ts';
import { addDocument, discardDraft, getBrand, getDocument, PackInput, publishDraft, restoreVersion, saveDraft } from '../../lib/server/services/brand.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const adminActor = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
const status = (code: number, re?: RegExp) => (e: HttpError) => e.status === code && (!re || re.test(e.message));
/** What the screen sends for a pack: the parts people edit (the server keeps the rest). */
const input = (p: N.BrandPack): PackInput => PackInput.parse({
  voice: p.voice, negative: p.negative, competitors: p.competitors, claims: p.claims, frameworks: p.frameworks,
  guideline: p.guideline ? { documentId: (p.guideline as { documentId: string }).documentId } : null,
});
const edit = (p: N.BrandPack, f: (d: N.BrandPack) => void) => { const d: N.BrandPack = JSON.parse(JSON.stringify(p)); f(d); return input(d); };

before(async () => {
  db = await freshDatabase('brand');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
});
after(async () => { await db?.drop(); });

test('G-009: a unit starts on the starting pack; changes wait in the draft and say what they change; saving makes v2', async () => {
  const start = await as(admin(), s => getBrand(s));
  assert.deepEqual([start.live.versionNo, start.draft, start.versions.map(v => v.versionNo)], [1, null, [1]]);
  assert.deepEqual(start.live.pack.claims.map(c => c.id), N.defaultBrand().claims.map(c => c.id));
  const changed = edit(start.live.pack, d => { d.voice.preset = 'Formal'; d.negative.push('synergy'); });
  const saved = await as(admin(), s => saveDraft(s, adminActor(), { pack: changed, baseVersionNo: 1 }));
  assert.deepEqual(saved.changes, [{ section: 'Voice and tone', lines: ['Voice: Direct → Formal'] }, { section: 'Negative keywords', lines: ['Added keywords: synergy'] }]);
  const mid = await as(admin(), s => getBrand(s));
  assert.equal(mid.live.versionNo, 1, 'drafts keep following v1 until the changes are saved');
  assert.deepEqual([mid.draft!.baseVersionNo, mid.draft!.updatedBy, mid.draft!.changes.length], [1, 'admin.a', 2]);
  const v2 = await as(admin(), s => publishDraft(s, adminActor(), ''));
  assert.equal(v2.versionNo, 2);
  const after2 = await as(admin(), s => getBrand(s));
  assert.deepEqual([after2.live.versionNo, after2.live.pack.v, after2.live.pack.voice.preset, after2.draft], [2, 2, 'Formal', null]);
  assert.deepEqual([after2.versions[0].note, after2.versions[0].sections, after2.versions[0].changes, after2.versions[0].by],
    ['Voice and tone, Negative keywords', ['Voice and tone', 'Negative keywords'], ['Voice and tone: Voice: Direct → Formal', 'Negative keywords: Added keywords: synergy'], 'admin.a']);
  await assert.rejects(as(admin(), s => saveDraft(s, adminActor(), { pack: changed, baseVersionNo: 1 })), status(409, /Brand v2 was saved since/), 'a stale draft is refused');
  await assert.rejects(as(admin(), s => publishDraft(s, adminActor(), '')), status(409, /Nothing to save/));
  const same = await as(admin(), s => saveDraft(s, adminActor(), { pack: input(after2.live.pack), baseVersionNo: 2 }));
  assert.deepEqual(same.changes, []);
  assert.equal((await as(admin(), s => getBrand(s))).draft, null, 'no changes: nothing pending');
  const audit = (await owner.query(`SELECT details FROM audit_log WHERE action = 'brand.published'`)).rows;
  assert.deepEqual(audit.map(a => a.details.versionNo), [2]);
});

test('G-009: restoring v1 makes it the version in use again, as v3; versions are append-only; unsaved changes block it', async () => {
  const live = (await as(admin(), s => getBrand(s))).live;
  await as(admin(), s => saveDraft(s, adminActor(), { pack: edit(live.pack, d => { d.competitors.push('Rivalco'); }), baseVersionNo: 2 }));
  await assert.rejects(as(admin(), s => restoreVersion(s, adminActor(), 1)), status(409, /unsaved changes/));
  await as(admin(), s => discardDraft(s, adminActor()));
  await assert.rejects(as(admin(), s => discardDraft(s, adminActor())), status(409));
  const r = await as(admin(), s => restoreVersion(s, adminActor(), 1));
  assert.equal(r.versionNo, 3);
  const b = await as(admin(), s => getBrand(s));
  const v1 = N.defaultBrand();
  assert.deepEqual([b.live.versionNo, b.live.pack.voice, b.live.pack.negative], [3, v1.voice, v1.negative], 'restoring v1 works');
  assert.deepEqual([b.versions[0].note, b.versions[0].restoredFrom, b.versions[0].changes], ['Restored v1', 1, ['Voice and tone: Voice: Formal → Direct', 'Negative keywords: Removed keywords: synergy']]);
  await assert.rejects(as(admin(), s => restoreVersion(s, adminActor(), 3)), status(409, /already the version in use/));
  await assert.rejects(as(admin(), s => restoreVersion(s, adminActor(), 99)), status(404));
  await assert.rejects(owner.query(`UPDATE brand_versions SET note = 'x'`), /append-only/);
  await assert.rejects(owner.query(`DELETE FROM brand_versions`), /append-only/);
});

test('G-009: claims carry an owner and an expiry and are validated; an expired claim fails the draft check against the live pack', async () => {
  const live = (await as(admin(), s => getBrand(s))).live;
  const cs01 = live.pack.claims.find(c => c.id === 'CS-01')!;
  for (const [bad, re] of [[{ ...cs01, id: 'CS-02' }, /same ID/], [{ ...cs01, expiry: '30/06/2027', id: 'CL-07' }, /expiry/], [{ ...cs01, segments: ['Nowhere'], id: 'CL-07' }, /micro-segment/]] as const) {
    const parsed = PackInput.safeParse({ ...input(live.pack), claims: [...live.pack.claims.filter(c => c.id !== 'CS-02'), bad, ...(bad.id === 'CS-02' ? [{ ...cs01, id: 'CS-02' }] : [])] });
    assert.equal(parsed.success, false, String(re));
    assert.match(JSON.stringify(parsed.error!.issues), re);
  }
  await as(admin(), s => saveDraft(s, adminActor(), { pack: edit(live.pack, d => {
    d.claims.find(c => c.id === 'CS-01')!.expiry = '2026-01-31';
    d.claims.push({ id: 'CL-07', type: 'Datasheet', year: 2026, title: 'Controller datasheet', segments: ['Modernisation'], expiry: '2027-12-31', claim: 'The controller supports online upgrades', status: 'approved', owner: 'Product marketing' });
  }), baseVersionNo: live.versionNo }));
  await as(admin(), s => publishDraft(s, adminActor(), 'Claims review'));
  const pack = (await as(admin(), s => getBrand(s))).live.pack;
  const cl07 = pack.claims.find(c => c.id === 'CL-07')!;
  assert.deepEqual([cl07.owner, cl07.claim], ['Product marketing', 'The controller supports online upgrades.'], 'owner kept; a claim ends with a full stop');
  const draft = (c: N.Claim): Partial<N.Draft> => ({ channel: 'Email', subject: 'your site', body: `Hi Ann,\n\n${c.claim} [${c.type}, ${c.year}]\n\nWorth a chat?\n\nClient Team` });
  const expired = N.checkDraft(draft(pack.claims.find(c => c.id === 'CS-01')!), pack, '2026-10-23');
  assert.deepEqual(expired.unsupported.map(u => u.reason), ['CS-01 expired on 2026-01-31'], 'an expired claim fails the check');
  assert.deepEqual(N.checkDraft(draft(cl07), pack, '2026-10-23').unsupported, [], 'a new approved claim passes');
});

test('G-009: a guideline document is checked by type and contents, named by the pack, and served only to its unit', async () => {
  const md = Buffer.from('# Client brand guidelines\nNever use: synergy\n');
  const doc = await as(admin(), s => addDocument(s, adminActor(), { fileName: 'guide.md', bytes: md }));
  assert.deepEqual([doc.name, doc.size], ['guide.md', md.length]);
  for (const [fileName, bytes, code] of [['guide.pdf', Buffer.from('not a pdf'), 415], ['run.exe', Buffer.from('MZ'), 415], ['big.md', Buffer.alloc(5 * 1024 * 1024 + 1, 0x61), 413],
    ['bin.txt', Buffer.from([0x61, 0x00, 0x62]), 415]] as const) {
    await assert.rejects(as(admin(), s => addDocument(s, adminActor(), { fileName, bytes })), (e: HttpError) => e.status === code, fileName);
  }
  const live = (await as(admin(), s => getBrand(s))).live;
  await assert.rejects(as(admin(), s => saveDraft(s, adminActor(), { pack: { ...input(live.pack), guideline: { documentId: ids.buB } }, baseVersionNo: live.versionNo })), status(400, /not there any more/));
  await as(admin(), s => saveDraft(s, adminActor(), { pack: { ...input(live.pack), guideline: { documentId: doc.id } }, baseVersionNo: live.versionNo }));
  const d = (await as(admin(), s => getBrand(s))).draft!;
  assert.deepEqual(d.changes, [{ section: 'Brand guidelines', lines: ['New document: guide.md'] }]);
  assert.deepEqual([(d.pack.guideline as { name: string; by: string }).name, (d.pack.guideline as { by: string }).by], ['guide.md', 'admin.a'], 'the server fills in who and what');
  assert.deepEqual((await as(admin(), s => getDocument(s, doc.id))).bytes, md);
  await assert.rejects(as({ userId: ids.repB, businessUnitId: ids.buB, scope: 'all', ownerEmails: [] }, s => getDocument(s, doc.id)), status(404), 'another unit cannot read it');
});

test('D-41: each business unit has its own brand pack and versions', async () => {
  const b = await as({ userId: ids.repB, businessUnitId: ids.buB, scope: 'all', ownerEmails: [] }, s => getBrand(s));
  assert.deepEqual([b.live.versionNo, b.versions.length, b.draft, b.live.pack.voice.preset], [1, 1, null, 'Direct']);
});
