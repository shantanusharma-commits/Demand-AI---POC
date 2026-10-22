// Corrections on the server against PostgreSQL (G-015; D-17 confirmations; G-021 vertical set by a person): the
// append-only log, owner scoping (G-014), the rebuild that replays every correction of the upload and replaces the
// list, and the rules for what may be confirmed. Rows are fictional and built here.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import * as E from '../../lib/demandai-engine.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { createAppWorker } from '../../lib/server/jobs/handlers.ts';
import { getJob } from '../../lib/server/jobs/queue.ts';
import { receiveUpload, uploadLimits, type UploadLimits } from '../../lib/server/services/uploads.ts';
import { deleteList, getList, listContacts, saveList, savedLists, type Actor } from '../../lib/server/services/lists.ts';
import { addCorrections, getEditRow, listCorrections, type CorrectionInput } from '../../lib/server/services/corrections.ts';
import { getRun, startScoringRun } from '../../lib/server/services/scoring.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { CORRECTION_FIELD_NAMES } from '../../lib/server/db/schema.ts';
import { CORRECTION_FIELDS, TAKEN_OUT, PUT_BACK } from '../../lib/engine/corrections.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';

let db: TestDatabase, owner: pg.Pool, appPool: pg.Pool, app: Db, ids: Basics;
const limits: UploadLimits = uploadLimits({ UPLOAD_MAX_BYTES: 5 * 1024 * 1024, UPLOAD_MAX_ROWS: 50_000, UPLOAD_TIME_LIMIT_MS: 60_000, UPLOAD_MAX_UNZIPPED_BYTES: 50 * 1024 * 1024 });
const ONE = 'rep.one@client.example', TWO = 'rep.two@client.example';

const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const adminActor = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const repOne = (): TenantContext => ({ userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: ['rep.a@demandai.test', ONE] });
const repOneActor = (): Actor => ({ userId: ids.repA, role: 'Sales rep' });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);
const pgCode = (code: string) => (err: unknown) => (err as { code?: string }).code === code || (err as { cause?: { code?: string } }).cause?.code === code;
const status = (n: number) => (e: unknown) => e instanceof HttpError && e.status === n;

// The file: Ann's email is malformed; Delta Gas never says whether it is managed separately (held, D-17); Di's opt-out
// is blank and her repeat (row 7) unreadable; Widget Works has an industry the mapping table doesn't know (G-021).
type Row = Partial<Record<(typeof E.LEAD_COLUMNS)[number], string>>;
const BASE: Row = {
  job_title: 'Instrumentation Manager', email_verified: 'Y', country: 'Singapore', industry: 'Refining', annual_revenue_usd: '2000000000', employee_count: '3000',
  account_type: 'Owner-operator', existing_customer: 'N', managed_separately: 'N', consent_basis: 'Legitimate interest', opt_out: 'N', owner_email: ONE,
};
const ROWS: Row[] = [
  { first_name: 'Ann', last_name: 'Lee', email: 'ann.lee@acme-refining', linkedin_url: '', company_name: 'Acme Refining', company_domain: 'acme-refining.com' },
  { first_name: 'Bo', last_name: 'Tan', email: 'bo.tan@acme-refining.com', company_name: 'Acme Refining', company_domain: 'acme-refining.com', job_title: 'Buyer' },
  { first_name: 'Cy', last_name: 'Ng', email: 'cy@delta-gas.com', company_name: 'Delta Gas', company_domain: 'delta-gas.com', industry: 'LNG', managed_separately: '', owner_email: TWO },
  { first_name: 'Di', last_name: 'Oh', email: 'di@delta-gas.com', company_name: 'Delta Gas', company_domain: 'delta-gas.com', industry: 'LNG', managed_separately: '', opt_out: '', owner_email: TWO },
  { first_name: 'Ed', last_name: 'Ho', email: 'ed@widget-works.com', company_name: 'Widget Works', company_domain: 'widget-works.com', industry: 'Specialty widgets' },
  { first_name: 'Di', last_name: 'Oh', email: 'di@delta-gas.com', company_name: 'Delta Gas', company_domain: 'delta-gas.com', industry: 'LNG', managed_separately: '', opt_out: 'perhaps', owner_email: TWO },
];
const csv = (rows: Row[]) => Buffer.from(E.toCSV([E.LEAD_COLUMNS, ...rows.map(r => E.LEAD_COLUMNS.map(h => ({ ...BASE, ...r })[h] ?? ''))]));

before(async () => {
  db = await freshDatabase('corrections');
  owner = db.pool('demandai_owner');
  appPool = db.pool('demandai_app');
  app = createDb(appPool);
  ids = await seedBasics(owner);
});
after(async () => { await db?.drop(); });

const runJobs = () => createAppWorker(app, limits).drain();

async function uploadList(ctx = admin(), rows = ROWS): Promise<string> {
  const r = await as(ctx, s => receiveUpload(s, { kind: 'lead', fileName: 'corrections.csv', mediaType: 'text/csv', bytes: csv(rows) }, limits));
  await runJobs();
  const job = (await as(ctx, s => getJob(s, r.jobId!)))!;
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  return job.progress.result!.listId;
}

/** Records a correction as the admin, runs the rebuild, and returns the new version's ID. */
async function correct(listId: string, input: Partial<CorrectionInput> & Pick<CorrectionInput, 'row' | 'changes'>, ctx = admin(), actor = adminActor()): Promise<string> {
  const { jobId } = await as(ctx, s => addCorrections(s, actor, listId, { reason: 'Other', source: '', note: '', ...input }));
  await runJobs();
  const job = (await as(ctx, s => getJob(s, jobId)))!;
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  return job.progress.result!.listId;
}
const contact = async (listId: string, row: number, ctx = admin()) => (await as(ctx, s => listContacts(s, listId, { limit: 500 }))).rows.find(r => r.contact.row === row);

let listId = '';

test('the corrections table accepts exactly the fields the engine replays', () => {
  assert.deepEqual([...CORRECTION_FIELD_NAMES].sort(), [...CORRECTION_FIELDS].sort());
});

test('G-015: a corrected email is kept in the log, the list is checked again, and the new version replaces the saved one', async () => {
  listId = await uploadList();
  await as(admin(), s => saveList(s, adminActor(), listId, { name: 'Pilot list' }));
  const before = await contact(listId, 2);
  assert.match(before!.contact.status, /^In the list, not contactable/);
  assert.equal(before!.corrected, false);
  const edit = await as(admin(), s => getEditRow(s, adminActor(), listId, 2));
  assert.equal(edit.raw.email, 'ann.lee@acme-refining', 'the edit form shows the file’s value');
  assert.equal(edit.canEdit, true);

  const next = await correct(listId, { row: 2, changes: { email: 'ann.lee@acme-refining.com', job_title: BASE.job_title }, reason: 'Wrong or bounced email', source: 'Bounce or reply', note: 'From the bounce report' });
  assert.notEqual(next, listId);
  const old = await as(admin(), s => getList(s, adminActor(), listId));
  assert.deepEqual([old.status, old.replacedBy], ['replaced', next]);
  const now = await as(admin(), s => getList(s, adminActor(), next));
  assert.deepEqual([now.status, now.name, now.savedAt?.toISOString(), now.replacedBy], ['saved', 'Pilot list', old.savedAt?.toISOString(), null], 'the new version keeps the name and saved state');
  assert.ok((await as(admin(), s => savedLists(s))).every(l => l.id !== listId), 'only the current version is listed');
  const ann = await contact(next, 2);
  assert.equal(ann!.contact.status, 'In the final list');
  assert.equal(ann!.corrected, true);
  assert.equal((await contact(next, 3))!.corrected, false);
  assert.equal((await as(admin(), s => getEditRow(s, adminActor(), next, 2))).raw.email, 'ann.lee@acme-refining.com');
  const log = await as(admin(), s => listCorrections(s, { listId: next }));
  assert.equal(log.rows.length, 1, 'the unchanged job title is not recorded');
  assert.deepEqual(log.rows.map(r => [r.row, r.field, r.from, r.to, r.severity, r.reason, r.source, r.note, r.who, r.role, r.contact]),
    [[2, 'email', 'ann.lee@acme-refining', 'ann.lee@acme-refining.com', 'major', 'Wrong or bounced email', 'Bounce or reply', 'From the bounce report', 'admin.a', 'Admin', 'Ann Lee']]);
  assert.deepEqual(log.summary, { corrections: 1, people: 1, major: 1, minor: 0, top: { reason: 'Wrong or bounced email', n: 1 } });
  listId = next;
});

test('the log is append-only: the app role can’t change or delete a correction, and the trigger stops the owner', async () => {
  await assert.rejects(appPool.query(`UPDATE corrections SET to_value = 'x'`), pgCode('42501'));
  await assert.rejects(appPool.query(`DELETE FROM corrections`), pgCode('42501'));
  await assert.rejects(owner.query(`UPDATE corrections SET to_value = 'x'`), /append-only: UPDATE is not allowed/);
  await assert.rejects(owner.query(`DELETE FROM corrections`), /append-only: DELETE is not allowed/);
  await assert.rejects(owner.query(`DELETE FROM uploads`), /append-only: DELETE is not allowed/, 'deleting the upload would delete its corrections');
});

test('D-17: an unconfirmed opt-out is confirmed only with how the person knows, reaches the merged repeat, and is then fixed', async () => {
  const before = await contact(listId, 5);
  assert.match(before!.contact.status, /opt-out not confirmed|account excluded/);
  assert.equal(before!.contact.optOutUnknown, true);
  await assert.rejects(as(admin(), s => addCorrections(s, adminActor(), listId, { row: 5, changes: { opt_out: 'N' }, reason: 'Opt-out not confirmed', source: '', note: '' })),
    (e: HttpError) => e.status === 400 && /how you know/.test(String(e.fields?.opt_out)));
  listId = await correct(listId, { row: 5, changes: { opt_out: 'n' }, reason: 'Opt-out not confirmed', source: 'Confirmed with the contact' });
  assert.equal((await contact(listId, 5))!.contact.optOutUnknown, false, 'the unreadable repeat on row 7 no longer holds it');
  await assert.rejects(as(admin(), s => addCorrections(s, adminActor(), listId, { row: 2, changes: { opt_out: 'N' }, reason: 'Other', source: 'Other', note: '' })),
    (e: HttpError) => e.status === 400, 'Ann’s opt-out was never in doubt: only nothing changes (N = N)');
  // Opting someone out is always allowed; setting it back to N is not, once the file or a person has said Y.
  listId = await correct(listId, { row: 3, changes: { opt_out: 'Y' }, reason: 'Other', source: 'Bounce or reply' });
  assert.equal((await contact(listId, 3))!.contact.status, 'Not in the list: opted out');
  await assert.rejects(as(admin(), s => addCorrections(s, adminActor(), listId, { row: 3, changes: { opt_out: 'N' }, reason: 'Other', source: 'Other', note: '' })),
    (e: HttpError) => e.status === 400 && /only be changed to Y/.test(String(e.fields?.opt_out)));
});

test('D-17: a held account is released only by confirming it isn’t managed separately; a confirmed one can’t be set back to N', async () => {
  const held = (await as(admin(), s => getEditRow(s, adminActor(), listId, 4))).account;
  assert.equal(held.managedHeld, true);
  listId = await correct(listId, { row: 4, changes: { managed_separately: 'N' }, reason: 'Managed status not confirmed', source: 'Known from the account team' });
  assert.equal((await contact(listId, 4))!.contact.status, 'In the final list');
  assert.equal((await as(admin(), s => getEditRow(s, adminActor(), listId, 7).catch(() => null))), null, 'row 7 is a merged repeat, not a person in the list');
  await assert.rejects(as(admin(), s => addCorrections(s, adminActor(), listId, { row: 2, changes: { managed_separately: 'N' }, reason: 'Other', source: 'Other', note: '' })),
    (e: HttpError) => e.status === 400, 'Acme was never held');
});

test('G-021: the vertical is set by a person only for an account the mapping table couldn’t classify', async () => {
  assert.equal((await as(admin(), s => getEditRow(s, adminActor(), listId, 6))).account.needsReview, true);
  await assert.rejects(as(admin(), s => addCorrections(s, adminActor(), listId, { row: 2, changes: { vertical: 'Petrochemicals' }, reason: 'Wrong industry', source: '', note: '' })),
    (e: HttpError) => e.status === 400 && /correct its industry instead/.test(String(e.fields?.vertical)));
  await assert.rejects(as(admin(), s => addCorrections(s, adminActor(), listId, { row: 6, changes: { vertical: 'Mining' }, reason: 'Wrong industry', source: '', note: '' })),
    (e: HttpError) => e.status === 400);
  listId = await correct(listId, { row: 6, changes: { vertical: 'Petrochemicals' }, reason: 'Wrong industry', source: 'Known from the account team' });
  const a = await as(admin(), s => getEditRow(s, adminActor(), listId, 6));
  assert.deepEqual([a.account.vertical, a.account.needsReview, a.account.verticalByPerson], ['Petrochemicals', false, true]);
  listId = await correct(listId, { row: 6, changes: { vertical: 'Refining' }, reason: 'Wrong industry', source: 'Known from the account team' });
  assert.equal((await as(admin(), s => getEditRow(s, adminActor(), listId, 6))).account.vertical, 'Refining', 'a person can change their own choice');
});

test('taken out of the list: shown with the reason, never handed off; put back later; every correction replays in order', async () => {
  listId = await correct(listId, { row: 6, changes: { take_out: TAKEN_OUT }, reason: 'Moved to another company', source: 'Checked their LinkedIn profile' });
  const ed = await contact(listId, 6);
  assert.equal(ed!.contact.status, 'Not in the list (taken out by a reviewer: moved to another company)');
  assert.equal(E.canContact(ed!.contact), false);
  listId = await correct(listId, { row: 6, changes: { take_out: PUT_BACK }, reason: 'Other', source: 'Known from the account team' });
  assert.equal((await contact(listId, 6))!.contact.takenOut, undefined);
  const log = await as(admin(), s => listCorrections(s, { listId }));
  assert.deepEqual(log.rows.map(r => r.field).reverse(), ['email', 'opt_out', 'opt_out', 'managed_separately', 'vertical', 'vertical', 'take_out', 'take_out']);
  assert.equal((await contact(listId, 2))!.contact.status, 'In the final list', 'the first correction still holds after seven rebuilds');
  assert.equal(log.summary.people, 5);
});

test('G-014: a rep can’t correct a list someone else uploaded; on their own upload only their own rows; they see their own corrections', async () => {
  await assert.rejects(as(repOne(), s => addCorrections(s, repOneActor(), listId, { row: 2, changes: { job_title: 'X' }, reason: 'Wrong job title', source: '', note: '' })), status(403));
  const own = await uploadList(repOne());
  await assert.rejects(as(repOne(), s => addCorrections(s, repOneActor(), own, { row: 4, changes: { job_title: 'X' }, reason: 'Wrong job title', source: '', note: '' })), status(404),
    'row 4 belongs to another owner');
  await assert.rejects(as(repOne(), s => getEditRow(s, repOneActor(), own, 4)), status(404));
  const next = await correct(own, { row: 3, changes: { job_title: 'Lead Control Systems Engineer' }, reason: 'Wrong job title' }, repOne(), repOneActor());
  assert.equal((await contact(next, 3, repOne()))!.contact.persona, 'Primary');
  const mine = await as(repOne(), s => listCorrections(s, {}));
  assert.ok(mine.rows.length > 0 && mine.rows.every(r => [2, 3, 6].includes(r.row)), 'only corrections to rows rep.one owns');
  const all = await as(admin(), s => listCorrections(s, {}));
  assert.ok(all.rows.some(r => r.row === 4) && all.summary.corrections > mine.summary.corrections);
});

test('one rebuild at a time: a second correction while the first is being checked is refused; a replaced version can’t be corrected', async () => {
  const { jobId } = await as(admin(), s => addCorrections(s, adminActor(), listId, { row: 2, changes: { city: 'Jurong' }, reason: 'Wrong location', source: '', note: '' }));
  await assert.rejects(as(admin(), s => addCorrections(s, adminActor(), listId, { row: 3, changes: { city: 'Tuas' }, reason: 'Wrong location', source: '', note: '' })), status(409));
  await runJobs();
  const next = (await as(admin(), s => getJob(s, jobId)))!.progress.result!.listId;
  await assert.rejects(as(admin(), s => addCorrections(s, adminActor(), listId, { row: 3, changes: { city: 'Tuas' }, reason: 'Wrong location', source: '', note: '' })),
    (e: HttpError) => e.status === 409 && /corrected since/.test(e.message));
  await assert.rejects(as(admin(), s => getEditRow(s, adminActor(), listId, 3)), status(404), 'a replaced version without runs keeps no rows');
  assert.equal((await as(admin(), s => getList(s, adminActor(), listId))).replacedBy, next);
  listId = next;
});

test('a scored list keeps its old version for the runs made on it; a saved selection keeps its people; delete removes every version', async () => {
  const sig = await as(admin(), s => receiveUpload(s, { kind: 'signal', fileName: 's.csv', mediaType: 'text/csv',
    bytes: Buffer.from(E.toCSV([E.SIGNAL_COLUMNS, ['Acme Refining', 'bo.tan@acme-refining.com', 'Inquiry or RFQ', '2026-09-20', 'Asked for a quote', 'CRM', '', '']])) }, limits));
  const { runId } = await as(admin(), s => startScoringRun(s, adminActor(), { listId, signalUploadId: sig.uploadId, asOf: '2026-09-30' }));
  await runJobs();
  const scored = listId;
  listId = await correct(listId, { row: 3, changes: { city: 'Tuas' }, reason: 'Wrong location' });
  assert.equal((await as(admin(), s => getRun(s, adminActor(), runId))).listId, scored, 'the run still opens, on the version it scored');
  assert.ok((await as(admin(), s => listContacts(s, scored, { limit: 10 }))).rows.length > 0, 'the scored version keeps its rows');
  await assert.rejects(as(admin(), s => startScoringRun(s, adminActor(), { listId: scored, signalUploadId: sig.uploadId, asOf: '2026-09-30' })),
    (e: HttpError) => e.status === 409 && /current version/.test(e.message));

  const { listId: picked } = await as(admin(), s => saveList(s, adminActor(), listId, { name: 'Two picked', contactRows: [2, 4] }));
  const pickedNext = await correct(picked, { row: 4, changes: { job_title: 'DCS Engineer' }, reason: 'Wrong job title' });
  const rows = (await as(admin(), s => listContacts(s, pickedNext, { limit: 50 }))).rows.map(r => r.contact.row);
  assert.deepEqual(rows, [2, 4], 'the rebuilt selection holds the same people');
  assert.equal((await as(admin(), s => getList(s, adminActor(), pickedNext))).name, 'Two picked');

  const uploadsBefore = (await owner.query(`SELECT count(*)::int n FROM uploads WHERE kind = 'lead'`)).rows[0].n;
  const r = await as(admin(), s => deleteList(s, adminActor(), listId));
  assert.equal(r.runs, 1, 'the run on the older version goes with the list');
  assert.equal((await owner.query(`SELECT count(*)::int n FROM lead_lists WHERE id = ANY($1)`, [[listId, scored]])).rows[0].n, 0, 'every version is gone');
  assert.equal((await owner.query(`SELECT count(*)::int n FROM uploads WHERE kind = 'lead'`)).rows[0].n, uploadsBefore, 'the upload stays (the saved selection and the corrections use it)');
  assert.ok((await owner.query(`SELECT count(*)::int n FROM corrections`)).rows[0].n > 0);
  // The purge path (owner with app.allow_purge, Phase 7) may remove an upload with its corrections; rolled back here.
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.allow_purge', 'on', true)`);
    await c.query(`DELETE FROM lead_lists`);
    assert.ok((await c.query(`DELETE FROM uploads WHERE kind = 'lead'`)).rowCount! > 0);
    await c.query('ROLLBACK');
  } finally { c.release(); }
});

test('a rep deleting their own list whose upload others corrected leaves the upload (the check sees the whole unit)', async () => {
  const own = await uploadList(repOne());
  const next = await correct(own, { row: 4, changes: { city: 'Jurong' }, reason: 'Wrong location' }); // the admin corrects rep.two's row
  await as(repOne(), s => deleteList(s, repOneActor(), next));
  const { rows } = await owner.query(`SELECT count(*)::int n FROM lead_lists WHERE upload_id = (SELECT upload_id FROM corrections WHERE list_id = $1 LIMIT 1)`, [own]);
  assert.equal(rows[0].n, 0);
  assert.equal((await owner.query(`SELECT count(*)::int n FROM uploads u WHERE EXISTS (SELECT 1 FROM corrections k WHERE k.upload_id = u.id AND k.list_id = $1)`, [own])).rows[0].n, 1);
});
