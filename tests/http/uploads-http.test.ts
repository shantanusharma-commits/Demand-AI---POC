// Uploads, lists, scoring and hand-off over HTTP on the production build (standalone server, real job worker):
// N-06 (a 24 MB upload reaches its handler; 26 MB is refused before it is stored), refusals by type, macros and zip
// bombs, CSRF on uploads, the full sample flow to a hand-off, G-061 over HTTP, rep scoping and IDOR (G-014), and
// that no contact's address ever reaches the logs.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Browser, startServer, type TestServer } from './server.ts';
import { DATASET } from '../helpers/answer-key.ts';
import { buildZip, WORKBOOK_PARTS } from '../helpers/zip.ts';
import { serializeConfig } from '../../lib/engine/config.ts';

let srv: TestServer;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SAMPLE_OWNER = 'meera.nair@client-sample.com'; // an owner in test-data's lead sheet (fictional)

before(async () => {
  srv = await startServer('http_uploads');
  // rep.a@demandai.test owns one of the sample's reps' accounts through an alias (D-33).
  await srv.db.pool('demandai_owner').query(`INSERT INTO user_owner_aliases (user_id, owner_email, created_by) VALUES ($1, $2, $1)`, [srv.ids.repA, SAMPLE_OWNER]);
  await srv.db.pool('demandai_owner').query(`INSERT INTO config_versions (business_unit_id, version_no, status, body, engine_version, created_by, activated_at, activated_by)
    VALUES ($1, 1, 'active', $2, 't', $3, now(), $3)`, [srv.ids.buA, JSON.stringify(serializeConfig()), srv.ids.adminA]);
});
after(async () => { await srv?.stop(); });

const form = (kind: string, name: string, bytes: Buffer, type = '') => {
  const f = new FormData();
  f.set('kind', kind);
  f.set('file', new Blob([new Uint8Array(bytes)], { type }), name);
  return f;
};
const admin = async () => { const b = new Browser(srv.base); await b.signIn('admin.a@demandai.test'); return b; };
const countUploads = async () => (await srv.db.pool('demandai_owner').query('SELECT count(*)::int n FROM uploads')).rows[0].n;

test('N-06: a 24 MB upload reaches its handler through the production server; 26 MB is refused and not stored', async () => {
  const b = await admin();
  const header = 'first_name,last_name,job_title,company_name,company_domain,country,notes\r\n';
  const row = (i: number) => `Ann,Lee,Instrument Engineer,Acme ${i},acme${i}.com,Singapore,${'x'.repeat(240 * 1024)}\r\n`;
  const big = Buffer.from(header + Array.from({ length: 103 }, (_, i) => row(i)).join(''));
  assert.ok(big.length > 24 * 1024 * 1024 && big.length < 25 * 1024 * 1024, String(big.length));
  const ok = await b.upload('/api/uploads', form('lead', 'big.csv', big, 'text/csv'));
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const job = await b.waitForJob(String(ok.json.jobId));
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  const before = await countUploads();
  const tooBig = await b.upload('/api/uploads', form('lead', 'huge.csv', Buffer.concat([big, Buffer.alloc(2 * 1024 * 1024, 0x41)]), 'text/csv'));
  assert.equal(tooBig.status, 413);
  assert.equal(await countUploads(), before);
});

test('refusals: macro-enabled, zip bomb, wrong type, not multipart, no Origin — each with a reason, nothing stored', async () => {
  const b = await admin();
  const before = await countUploads();
  const xlsm = await b.upload('/api/uploads', form('lead', 'leads.xlsm', readFileSync(DATASET)));
  assert.deepEqual([xlsm.status, xlsm.json.code], [415, 'macro_file']);
  assert.match(String(xlsm.json.error), /Macro-enabled/);
  const bomb = buildZip([...WORKBOOK_PARTS, { name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(40 * 1024 * 1024) }]);
  const z = await b.upload('/api/uploads', form('lead', 'leads.xlsx', bomb, XLSX_TYPE));
  assert.deepEqual([z.status, z.json.code], [422, 'zip_bomb']);
  const pdf = await b.upload('/api/uploads', form('lead', 'leads.pdf', Buffer.from('%PDF-1.7')));
  assert.equal(pdf.status, 415);
  const json = await b.post('/api/uploads', { kind: 'lead' });
  assert.equal(json.status, 415);
  const kindless = await b.upload('/api/uploads', form('other', 'leads.csv', Buffer.from('a,b'), 'text/csv'));
  assert.equal(kindless.status, 400);
  const evil = await b.upload('/api/uploads', form('lead', 'leads.csv', Buffer.from('company_name\nA'), 'text/csv'), { origin: 'https://evil.example' });
  assert.equal(evil.status, 403, 'CSRF: another site cannot upload');
  assert.equal(await countUploads(), before);
});

let listId = '', runId = '';

test('the full sample over HTTP: upload, real job stages, save, page through, score as of a validated date, hand off', async () => {
  const b = await admin();
  const up = await b.upload('/api/uploads', form('lead', 'Lead_Research_Sample_Dataset.xlsx', readFileSync(DATASET), XLSX_TYPE));
  assert.equal(up.status, 201);
  const job = await b.waitForJob(String(up.json.jobId));
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  assert.deepEqual([job.progress.stages, job.progress.done], [['parse', 'check', 'save'], 3]);
  listId = job.progress.result!.listId;
  assert.equal((await b.post(`/api/lists/${listId}/save`, { name: 'Full sample' })).status, 200);
  const list = (await b.get(`/api/lists/${listId}`)).json.list as { stats: { rowsRead: number }; visible: { contacts: { all: number } } };
  assert.deepEqual([list.stats.rowsRead, list.visible.contacts.all], [7498, 6985]);
  const page = await b.get(`/api/lists/${listId}/contacts?limit=200`);
  assert.equal((page.json.rows as unknown[]).length, 200);
  const next = await b.get(`/api/lists/${listId}/contacts?limit=200&after=${page.json.next}`);
  assert.ok((next.json.rows as { contact: { row: number } }[])[0].contact.row > Number(page.json.next));
  assert.equal((await b.get(`/api/lists/${listId}/contacts?limit=9999`)).status, 400, 'page size is capped');
  const listed = (await b.get('/api/lists')).json.lists as { id: string }[];
  assert.ok(listed.some(l => l.id === listId));

  const sig = await b.upload('/api/uploads', form('signal', 'Lead_Research_Sample_Dataset.xlsx', readFileSync(DATASET), XLSX_TYPE));
  assert.deepEqual([sig.status, sig.json.jobId], [201, null]);
  const bad = await b.post('/api/scoring-runs', { listId, signalUploadId: sig.json.uploadId, asOf: '2026-02-30' });
  assert.equal(bad.status, 400, 'G-061');
  assert.match(String((bad.json.fields as Record<string, string[]>).asOf), /not a real date/);
  const future = await b.post('/api/scoring-runs', { listId, signalUploadId: sig.json.uploadId, asOf: '2099-01-01' });
  assert.equal(future.status, 400);
  const started = await b.post('/api/scoring-runs', { listId, signalUploadId: sig.json.uploadId, asOf: '2026-09-30' });
  assert.equal(started.status, 201);
  runId = String(started.json.runId);
  const sj = await b.waitForJob(String(started.json.jobId));
  assert.equal(sj.status, 'succeeded', JSON.stringify(sj.error));
  const run = (await b.get(`/api/scoring-runs/${runId}`)).json.run as { stats: { scored: number }; visible: { tiers: Record<string, number> } };
  assert.equal(run.stats.scored, 330);
  const a = await b.get(`/api/scoring-runs/${runId}/prospects?tier=A&limit=500`);
  assert.equal((a.json.rows as unknown[]).length, run.visible.tiers.A);
  const h = await b.post('/api/handoffs', { runId });
  assert.deepEqual([h.status, h.json.count, h.json.heldBack], [201, 135, 9]);
  const items = ((await b.get(`/api/handoffs/${h.json.handoffId}`)).json.handoff as { items: { id: string }[] }).items;
  assert.equal(new Set(items.map(i => i.id)).size, 135, 'G-049: one UUID per hand-off item');
});

test('G-014 over HTTP: a rep sees only their own prospects; another owner’s is 404; a manager-only list action is 403', async () => {
  const rep = new Browser(srv.base);
  await rep.signIn('rep.a@demandai.test');
  const mine = await rep.get(`/api/lists/${listId}/contacts?limit=500`);
  const rows = mine.json.rows as { contact: { owner: string } }[];
  assert.ok(rows.length > 0);
  assert.ok(rows.every(r => r.contact.owner === SAMPLE_OWNER));
  const other = await srv.db.pool('demandai_owner').query(`SELECT contact_id FROM prospect_scores WHERE run_id = $1 AND owner_email <> $2 LIMIT 1`, [runId, SAMPLE_OWNER]);
  assert.equal((await rep.get(`/api/scoring-runs/${runId}/prospects/${other.rows[0].contact_id}`)).status, 404);
  assert.equal((await rep.get(`/api/scoring-runs/${runId}/prospects/${randomUUID()}`)).status, 404);
  assert.equal((await rep.request('DELETE', `/api/lists/${listId}`)).status, 403, 'only the uploader or a manager deletes a shared list');
  const viewer = new Browser(srv.base);
  await viewer.signIn('rep.a@demandai.test');
  const units = ((await viewer.get('/api/me')).json.user as { memberships: { businessUnitId: string; role: string }[] }).memberships;
  await viewer.post('/api/session/business-unit', { businessUnitId: units.find(m => m.role === 'Viewer')!.businessUnitId });
  assert.equal((await viewer.get(`/api/lists/${listId}`)).status, 403, 'a Viewer has no list access');
});

test('G-023 over HTTP: Signal monitoring counts the scored file once per type; a rep counts their own rows; the unused-rows filter', async () => {
  const b = await admin();
  const runs = await b.get('/api/scoring-runs');
  assert.deepEqual(runs.json.signalSettings, { off: [], custom: [], problem: null }, 'what a new run would take');
  const m = await b.get('/api/signal-monitoring');
  assert.equal(m.status, 200);
  const all = m.json.monitoring as { scope: string; totals: { records: number; files: number; unknownTypes: string[] }; types: { type: string; status: string }[] };
  assert.deepEqual([all.scope, all.totals.records, all.totals.files], ['all', 1492, 1]);
  assert.equal(all.types.find(t => t.type === 'Installed system (current)')!.status, 'Knock-out');
  const rep = new Browser(srv.base);
  await rep.signIn('rep.a@demandai.test');
  const mine = (await rep.get('/api/signal-monitoring')).json.monitoring as typeof all;
  assert.equal(mine.scope, 'own');
  assert.ok(mine.totals.records > 0 && mine.totals.records < all.totals.records, String(mine.totals.records));
  const run = (await b.get(`/api/scoring-runs/${runId}`)).json.run as { visible: { unused: number }; signalSettings: unknown };
  assert.deepEqual(run.signalSettings, { off: [], custom: [] });
  const unused = await b.get(`/api/scoring-runs/${runId}/signals?status=unused&limit=500`);
  assert.equal(unused.status, 200);
  assert.ok((unused.json.rows as { status: string }[]).every(r => r.status !== 'Qualified'));
  assert.equal(run.visible.unused, 1492 - 475, 'every row but the 475 that counted');
  assert.equal((await b.get(`/api/scoring-runs/${runId}/signals?status=bogus`)).status, 400);
});

test('G-002 over HTTP: Setup reads for managers; a switch needs a same-site Origin and makes a version; the export is a JSON file', async () => {
  const b = await admin();
  const setup = await b.get('/api/config');
  assert.equal(setup.status, 200);
  assert.equal((setup.json.setup as { version: { versionNo: number } }).version.versionNo, 1);
  const body = { type: 'Email clicked', on: false, reason: 'Tracking data on hold' };
  assert.equal((await b.request('POST', '/api/config/signals/switch', body, { origin: 'https://evil.example' })).status, 403, 'CSRF');
  assert.equal((await b.post('/api/config/signals/switch', { ...body, reason: '' })).status, 400, 'a reason is required');
  const sw = await b.post('/api/config/signals/switch', body);
  assert.deepEqual([sw.status, sw.json.versionNo], [200, 2]);
  const file = await b.get('/api/config/export');
  assert.equal(file.status, 200);
  assert.match(String(file.headers.get('content-type')), /^application\/json/);
  assert.equal(file.headers.get('content-disposition'), `attachment; filename="demandai-config-v2.json"; filename*=UTF-8''demandai-config-v2.json`);
  const out = JSON.parse(file.text) as { version: { number: number }; signals: { off: string[] } };
  assert.deepEqual([out.version.number, out.signals.off], [2, ['Email clicked']]);
  const rep = new Browser(srv.base);
  await rep.signIn('rep.a@demandai.test');
  assert.equal((await rep.get('/api/config')).status, 403, 'reps have no Setup');
  assert.equal((await b.post('/api/config/signals/switch', { ...body, on: true })).json.versionNo, 3);
});

test('G-009 over HTTP: the brand pack for everyone with Content library; changes, documents, saving and restoring for managers', async () => {
  const b = await admin();
  type Pack = { voice: { preset: string }; negative: string[]; competitors: string[]; claims: unknown[]; frameworks: unknown[] };
  const brand = (await b.get('/api/brand')).json.brand as { live: { versionNo: number; pack: Pack } };
  assert.equal(brand.live.versionNo, 1);
  const p = brand.live.pack;
  const pack = { voice: { ...p.voice, preset: 'Warm' }, negative: p.negative, competitors: p.competitors, claims: p.claims, frameworks: p.frameworks, guideline: null };
  assert.equal((await b.request('PUT', '/api/brand/draft', { pack, baseVersionNo: 1 }, { origin: 'https://evil.example' })).status, 403, 'CSRF');
  const saved = await b.request('PUT', '/api/brand/draft', { pack, baseVersionNo: 1 });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.changes, [{ section: 'Voice and tone', lines: ['Voice: Direct → Warm'] }]);
  const rep = new Browser(srv.base);
  await rep.signIn('rep.a@demandai.test');
  assert.equal((await rep.get('/api/brand')).status, 200, 'reps see the brand pack');
  assert.equal((await rep.request('PUT', '/api/brand/draft', { pack, baseVersionNo: 1 })).status, 403, 'but do not change it');
  const f = new FormData();
  f.set('file', new Blob([new TextEncoder().encode('# Guideline\nNever use: synergy\n')], { type: 'text/markdown' }), 'guide.md');
  const doc = await b.upload('/api/brand/documents', f);
  assert.equal(doc.status, 201);
  const file = await b.get(`/api/brand/documents/${(doc.json.document as { id: string }).id}`);
  assert.deepEqual([file.status, file.headers.get('content-type'), file.headers.get('x-content-type-options')], [200, 'application/octet-stream', 'nosniff']);
  assert.match(String(file.headers.get('content-disposition')), /^attachment; filename="guide.md"/);
  assert.equal((await b.post('/api/brand/publish', { note: '' })).json.versionNo, 2);
  assert.equal((await b.post('/api/brand/restore', { versionNo: 1 })).json.versionNo, 3);
  assert.equal(((await b.get('/api/brand')).json.brand as { live: { pack: Pack } }).live.pack.voice.preset, 'Direct');
});

test('G-015 over HTTP: per-check CSV and the validation report download as UTF-8 CSV attachments; a bad check is 400', async () => {
  const b = await admin();
  const r = await b.get(`/api/lists/${listId}/issues.csv?check=dupes`);
  assert.equal(r.status, 200);
  assert.match(String(r.headers.get('content-type')), /^text\/csv; charset=utf-8/);
  assert.equal(r.headers.get('content-disposition'), `attachment; filename="Lead_Research_Sample_Dataset-dupes-issues.csv"; filename*=UTF-8''Lead_Research_Sample_Dataset-dupes-issues.csv`);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.ok(r.text.startsWith('Row,Field,Issue,What happens,How to fix,Severity\r\n'), 'the BOM is stripped by fetch; the header row follows');
  assert.equal((await b.get(`/api/lists/${listId}/issues.csv?check=nonsense`)).status, 400);
  assert.equal((await b.get(`/api/lists/${listId}/issues.csv`)).status, 400, 'the check is required');
  const page = await b.get(`/api/lists/${listId}/issues?check=dupes&limit=5`);
  assert.deepEqual([(page.json.rows as unknown[]).length, typeof page.json.total], [5, 'number']);
  const report = await b.get(`/api/lists/${listId}/report.csv`);
  assert.equal(report.status, 200);
  assert.ok(report.text.split('\r\n')[0].endsWith(',Check,D-code,What the code means'));
  const rep = new Browser(srv.base);
  await rep.signIn('rep.a@demandai.test');
  const mine = await rep.get(`/api/lists/${listId}/report.csv`);
  assert.equal(mine.status, 200);
  assert.ok(mine.text.split('\r\n').length < report.text.split('\r\n').length, 'a rep’s report holds only their own rows and the whole-file notes');
  assert.equal((await rep.get(`/api/lists/${randomUUID()}/report.csv`)).status, 404);
});

test('G-015 corrections over HTTP: Origin and fields checked, a rep refused on another’s list, then the list is rebuilt and replaced', async () => {
  const b = await admin();
  const first = ((await b.get(`/api/lists/${listId}/contacts?group=nc&limit=1`)).json.rows as { contact: { row: number; jobTitle: string } }[])[0];
  const row = first.contact.row;
  const edit = await b.get(`/api/lists/${listId}/contacts/${row}`);
  assert.equal(edit.status, 200);
  assert.equal((edit.json.row as { raw: Record<string, string> }).raw.job_title, first.contact.jobTitle);
  assert.equal((await b.get(`/api/lists/${listId}/contacts/0`)).status, 404);
  const body = { row, changes: { job_title: 'Lead DCS Engineer' }, reason: 'Wrong job title', source: 'Checked their LinkedIn profile', note: '' };
  assert.equal((await b.request('POST', `/api/lists/${listId}/corrections`, body, { origin: 'https://evil.example' })).status, 403, 'CSRF');
  const bad = await b.post(`/api/lists/${listId}/corrections`, { ...body, reason: 'Because' });
  assert.equal(bad.status, 400);
  assert.ok((bad.json.fields as Record<string, string[]>).reason);
  const rep = new Browser(srv.base);
  await rep.signIn('rep.a@demandai.test');
  assert.equal((await rep.post(`/api/lists/${listId}/corrections`, body)).status, 403, 'only the uploader or a manager corrects a list');
  const ok = await b.post(`/api/lists/${listId}/corrections`, body);
  assert.equal(ok.status, 201);
  const job = await b.waitForJob(String(ok.json.jobId));
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  const next = job.progress.result!.listId;
  const old = (await b.get(`/api/lists/${listId}`)).json.list as { status: string; replacedBy: string };
  assert.deepEqual([old.status, old.replacedBy], ['replaced', next]);
  const log = await b.get(`/api/lists/${next}/corrections`);
  assert.deepEqual((log.json.rows as { field: string; to: string }[]).map(r => [r.field, r.to]), [['job_title', 'Lead DCS Engineer']]);
  assert.equal(((await b.get('/api/corrections')).json.summary as { corrections: number }).corrections, 1);
  assert.equal((await b.post(`/api/lists/${listId}/corrections`, body)).status, 409, 'a replaced version is not corrected');
  listId = next;
});

test('logs: upload and scoring events are logged without file names or any contact’s address', async () => {
  const lines = srv.logs.join('').split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  for (const event of ['upload.received', 'job.started', 'job.stage', 'job.succeeded', 'scoring.started', 'handoff.created', 'upload.refused']) {
    assert.ok(lines.some(l => l.event === event), `no ${event} line`);
  }
  assert.ok(lines.filter(l => l.event === 'job.stage').every(l => typeof l.durationMs === 'number' && l.jobId && l.businessUnitId));
  assert.equal(lines.filter(l => l.event === 'db.pool.created').length, 1, 'pages, routes and the job worker share one pool');
  const all = srv.logs.join('');
  assert.doesNotMatch(all, /@client-sample\.com|@[a-z0-9-]+\.(co\.th|com\.my|co\.id|vn)\b/i, 'no contact address from the sample');
  assert.doesNotMatch(all, /Lead_Research_Sample_Dataset/, 'no file names');
});
