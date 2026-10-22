// Column mapping with saved mappings (G-040): a file whose columns the synonym table doesn't know stops at the header
// check and says which template columns are missing; a person maps them once, the stored file is checked again with the
// mapping (not re-sent), and the mapping is kept for the unit's next files from that source.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import * as E from '../../lib/demandai-engine.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { createAppWorker } from '../../lib/server/jobs/handlers.ts';
import { getJob } from '../../lib/server/jobs/queue.ts';
import { receiveUpload, uploadLimits } from '../../lib/server/services/uploads.ts';
import { getList, recheckUpload, type Actor } from '../../lib/server/services/lists.ts';
import { listMappings, saveMapping } from '../../lib/server/services/mappings.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import * as S from '../../lib/demandai-sample-data.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const limits = uploadLimits({ UPLOAD_MAX_BYTES: 1024 * 1024, UPLOAD_MAX_ROWS: 1000, UPLOAD_TIME_LIMIT_MS: 60_000, UPLOAD_MAX_UNZIPPED_BYTES: 50 * 1024 * 1024 });
const ctx = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const actor = (): Actor => ({ userId: ids.adminA, role: 'Admin' });

// The fictional sample with two columns renamed the way an odd CRM export might.
const RENAMED: Record<string, string> = { company_name: 'Org Legal Title', owner_email: 'Rep Mailbox' };
const csv = (grid: unknown[][]) => Buffer.from(grid.map(r => r.map(v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n'));
const oddFile = () => csv(S.LEADS.map((r, i) => (i === 1 ? r.map(h => RENAMED[String(h).replace('*', '').trim()] ?? h) : r)));

before(async () => {
  db = await freshDatabase('mappings');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
});
after(async () => { await db?.drop(); });

async function finished(jobId: string) {
  await createAppWorker(app, limits).drain();
  const job = (await withTenant(app, ctx(), s => getJob(s, jobId)))!;
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  return withTenant(app, ctx(), s => getList(s, actor(), job.progress.result!.listId));
}

test('G-040: unknown columns stop the check and name the missing ones; a saved mapping reads the same file fully', async () => {
  const up = await withTenant(app, ctx(), s => receiveUpload(s, { kind: 'lead', fileName: 'crm_export.csv', mediaType: 'text/csv', bytes: oddFile() }, limits));
  const first = await finished(up.jobId!);
  assert.equal(first.stats.contacts, 0);
  assert.equal(first.checks[0].sev, 'stop');
  assert.ok(first.fileColumns.includes('Org Legal Title') && first.fileColumns.includes('Rep Mailbox'));
  assert.deepEqual(first.missingColumns.sort(), ['company_name', 'owner_email']);

  const { id: mappingId } = await withTenant(app, ctx(), s => saveMapping(s, actor(), { kind: 'lead', name: 'CRM export', mapping: { 'Org Legal Title': 'company_name', 'Rep Mailbox': 'owner_email' } }));
  const again = await withTenant(app, ctx(), s => recheckUpload(s, up.uploadId, mappingId));
  const second = await finished(again.jobId);
  const reference = E.processLeads(S.LEADS, { file: 'crm_export.csv', sheet: '(CSV)' });
  assert.equal(second.stats.contacts, reference.stats.contacts);
  assert.equal(second.stats.accountsPass, reference.stats.accountsPass);
  assert.deepEqual(second.missingColumns, [], 'nothing missing once mapped');
  assert.equal((await owner.query('SELECT count(*)::int n FROM uploads')).rows[0].n, 1, 'the file was not sent again');
  const notes = await owner.query(`SELECT data->>'issue' issue FROM issues WHERE list_id = $1 AND data->>'issue' LIKE 'Column %saved mapping%'`, [second.id]);
  assert.equal(notes.rowCount, 2);
  assert.deepEqual((await withTenant(app, ctx(), s => listMappings(s, 'lead'))).map(m => m.name), ['CRM export']);
});

test('G-040: a mapping must point at template columns, each once', async () => {
  await assert.rejects(withTenant(app, ctx(), s => saveMapping(s, actor(), { kind: 'lead', name: 'Bad', mapping: { 'Org Legal Title': 'company' } })), (e: HttpError) => e.status === 400);
  await assert.rejects(withTenant(app, ctx(), s => saveMapping(s, actor(), { kind: 'lead', name: 'Twice', mapping: { A: 'company_name', B: 'company_name' } })), (e: HttpError) => e.status === 400 && /once/.test(e.message));
  const again = await withTenant(app, ctx(), s => saveMapping(s, actor(), { kind: 'lead', name: 'CRM export', mapping: { 'Org Legal Title': 'company_name' } }));
  assert.ok(again.id, 'saving under the same name replaces it');
  assert.equal((await withTenant(app, ctx(), s => listMappings(s, 'lead'))).length, 1);
});
