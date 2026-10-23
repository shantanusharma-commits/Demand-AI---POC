// Scoring settings and monitoring on the server against PostgreSQL (G-023): a run takes the signal settings of the
// active configuration when it starts (types switched off in Setup are rejected as OFF, types added there are scored)
// and keeps them; Signal monitoring counts what has come in per type, owner-scoped (G-014); the unused-rows filter.
// Uses the full sample from test-data/.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import * as E from '../../lib/demandai-engine.ts';
import { serializeConfig } from '../../lib/engine/config.ts';
import { createDb, withTenant, type Db, type TenantContext } from '../../lib/server/db/tenant.ts';
import { createAppWorker } from '../../lib/server/jobs/handlers.ts';
import { getJob } from '../../lib/server/jobs/queue.ts';
import { receiveUpload, uploadLimits, type UploadLimits } from '../../lib/server/services/uploads.ts';
import { saveList, type Actor } from '../../lib/server/services/lists.ts';
import { activeSignalSettings, getRun, listSignals, signalSettingsOf, startScoringRun } from '../../lib/server/services/scoring.ts';
import { signalMonitoring } from '../../lib/server/services/signal-monitoring.ts';
import { HttpError } from '../../lib/server/http/errors.ts';
import { freshDatabase, type TestDatabase } from './harness.ts';
import { seedBasics, type Basics } from './fixtures.ts';
import { AS_OF, DATASET, loadDataset } from '../helpers/answer-key.ts';

let db: TestDatabase, owner: pg.Pool, app: Db, ids: Basics;
const limits: UploadLimits = uploadLimits({ UPLOAD_MAX_BYTES: 25 * 1024 * 1024, UPLOAD_MAX_ROWS: 50_000, UPLOAD_TIME_LIMIT_MS: 120_000, UPLOAD_MAX_UNZIPPED_BYTES: 200 * 1024 * 1024 });
const dataset = loadDataset();
const sample = readFileSync(DATASET);
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const admin = (): TenantContext => ({ userId: ids.adminA, businessUnitId: ids.buA, scope: 'all', ownerEmails: [] });
const adminActor = (): Actor => ({ userId: ids.adminA, role: 'Admin' });
const repCtx = (emails: string[]): TenantContext => ({ userId: ids.repA, businessUnitId: ids.buA, scope: 'own', ownerEmails: emails });
const as = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(app, ctx, fn);

const DEMO: E.CustomSignalType = { name: 'Demo request', segment: 'Inquiry', level: 'Strong', full: 30, zero: 90 };
const SETTINGS = { off: ['Webinar attended'], custom: [DEMO] };
const leads = E.processLeads(dataset.leadGrid, { file: 'Lead_Research_Sample_Dataset.xlsx', sheet: 'Lead template' });
const someOwner = [...new Set(leads.contacts.map(c => c.owner).filter(Boolean))].sort()[0];

/** Outcome counts as the screens show them: status, with the code for rejections. */
function outcomes(sigs: { status: string; code: string }[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const s of sigs) { const k = s.status === 'Rejected' ? `Rejected ${s.code}` : s.status; o[k] = (o[k] ?? 0) + 1; }
  return o;
}
/** What the engine itself makes of the sample with these settings: the reference the stored run must match. */
function engineSignals(settings: { off: string[]; custom: E.CustomSignalType[] }) {
  const sig = E.processSignals(dataset.signalGrid, leads, { file: 'Lead_Research_Sample_Dataset.xlsx', sheet: 'Signal template', asOf: AS_OF, ...settings });
  E.scoreList(leads, sig);
  return sig.signals;
}
const engineOutcome = (settings: { off: string[]; custom: E.CustomSignalType[] }) => outcomes(engineSignals(settings));

async function setConfig(body: Record<string, unknown>) {
  await owner.query(`UPDATE config_versions SET body = $2 WHERE business_unit_id = $1 AND status = 'active'`, [ids.buA, JSON.stringify(body)]);
}
async function runJobs() { await createAppWorker(app, limits).drain(); }
async function score(signalUploadId: string) {
  const started = await as(admin(), s => startScoringRun(s, adminActor(), { listId, signalUploadId, asOf: AS_OF }));
  await runJobs();
  const job = (await as(admin(), s => getJob(s, started.jobId)))!;
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  return started.runId;
}
async function storedOutcome(runId: string) {
  const r = await owner.query(`SELECT status, data->>'code' code FROM signals WHERE run_id = $1`, [runId]);
  return outcomes(r.rows);
}

let listId = '', signalUploadId = '', firstRun = '';

before(async () => {
  db = await freshDatabase('scoring');
  owner = db.pool('demandai_owner');
  app = createDb(db.pool('demandai_app'));
  ids = await seedBasics(owner);
  await owner.query(`INSERT INTO config_versions (business_unit_id, version_no, status, body, engine_version, created_by, activated_at, activated_by)
    VALUES ($1, 1, 'active', $2, 't', $3, now(), $3)`, [ids.buA, JSON.stringify(serializeConfig()), ids.adminA]);
  const up = await as(admin(), s => receiveUpload(s, { kind: 'lead', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits));
  await runJobs();
  listId = (await as(admin(), s => getJob(s, up.jobId!)))!.progress.result!.listId;
  await as(admin(), s => saveList(s, adminActor(), listId, { name: 'Full sample' }));
  signalUploadId = (await as(admin(), s => receiveUpload(s, { kind: 'signal', fileName: 'Lead_Research_Sample_Dataset.xlsx', mediaType: XLSX_TYPE, bytes: sample }, limits))).uploadId;
});
after(async () => { await db?.drop(); });

test('G-023: a run takes the signal settings in force when it starts; switched-off rows are rejected as OFF and added types are scored', async () => {
  await setConfig({ ...serializeConfig(), signalsOff: SETTINGS.off, signalsCustom: SETTINGS.custom });
  firstRun = await score(signalUploadId);
  const stored = await owner.query(`SELECT signals_off, signals_custom FROM scoring_runs WHERE id = $1`, [firstRun]);
  assert.deepEqual([stored.rows[0].signals_off, stored.rows[0].signals_custom], [SETTINGS.off, SETTINGS.custom]);
  const got = await storedOutcome(firstRun);
  assert.deepEqual(got, engineOutcome(SETTINGS), 'the stored run is what the engine makes of the sample with these settings');
  assert.notDeepEqual(got, engineOutcome({ off: [], custom: [] }), 'and differs from a run without them');
  const off = await owner.query(`SELECT DISTINCT data->>'type' type, data->>'reason' reason FROM signals WHERE run_id = $1 AND data->>'code' = 'OFF'`, [firstRun]);
  assert.deepEqual(off.rows, [{ type: 'Webinar attended', reason: 'Webinar attended is switched off in Setup' }]);
  assert.equal(got['Rejected OFF'], 187);
  const demo = await owner.query(`SELECT status, data->>'code' code FROM signals WHERE run_id = $1 AND data->>'type' = 'Demo request'`, [firstRun]);
  const demoWant = outcomes(engineSignals(SETTINGS).filter(x => x.type === 'Demo request'));
  assert.deepEqual(outcomes(demo.rows), demoWant);
  assert.ok(demoWant.Qualified > 0, 'an added type is scored; without Setup it stays an unknown tag (D-14)');
  assert.equal(outcomes(engineSignals({ off: [], custom: [] }).filter(x => x.type === 'Demo request')).Qualified, undefined);
  const run = await as(admin(), s => getRun(s, adminActor(), firstRun));
  assert.deepEqual(run.signalSettings, SETTINGS);
  const audit = await owner.query(`SELECT details FROM audit_log WHERE action = 'scoring.started' AND target_id = $1`, [firstRun]);
  assert.deepEqual([audit.rows[0].details.signalsOff, audit.rows[0].details.signalsAdded], [['Webinar attended'], ['Demo request']]);
});

test('G-023: switching a type back on changes new runs only; the earlier run keeps the settings it was scored with', async () => {
  await setConfig(serializeConfig());
  const second = await score(signalUploadId);
  assert.deepEqual(await storedOutcome(second), engineOutcome({ off: [], custom: [] }));
  assert.deepEqual((await as(admin(), s => getRun(s, adminActor(), second))).signalSettings, { off: [], custom: [] });
  assert.equal((await storedOutcome(firstRun))['Rejected OFF'], 187, 'the first run is unchanged');
  assert.deepEqual((await as(admin(), s => getRun(s, adminActor(), firstRun))).signalSettings, SETTINGS);
});

test('G-023: settings that can’t be used stop a new run with the reason, never a silent score with other settings', async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ signalsOff: ['Not a type'] }, /"Not a type" is switched off but is not a signal type/],
    [{ signalsOff: 'Webinar attended' }, /not a list of names/],
    [{ signalsCustom: [{ ...DEMO, name: 'Email clicked' }] }, /already a signal type/],
    [{ signalsCustom: [DEMO, { ...DEMO, name: 'demo REQUEST' }] }, /already a signal type/],
    [{ signalsCustom: [{ ...DEMO, segment: 'Nowhere' }] }, /micro-segment/],
    [{ signalsCustom: [{ ...DEMO, full: 90, zero: 30 }] }, /gone after/],
    [{ signalsCustom: [{ ...DEMO, level: 'Huge' }] }, /how strong/],
  ];
  for (const [settings, reason] of cases) {
    assert.throws(() => signalSettingsOf(settings), reason, JSON.stringify(settings));
    await setConfig({ ...serializeConfig(), ...settings });
    const active = await as(admin(), s => activeSignalSettings(s));
    assert.match(String(active.problem), reason);
    await assert.rejects(as(admin(), s => startScoringRun(s, adminActor(), { listId, signalUploadId, asOf: AS_OF })),
      (e: HttpError) => e.status === 409 && /Fix them in Setup/.test(e.message), JSON.stringify(settings));
  }
  assert.deepEqual(signalSettingsOf({ signalsOff: ['Demo request', 'Demo request'], signalsCustom: [DEMO] }), { off: ['Demo request'], custom: [DEMO] }, 'an added type can be switched off');
  assert.deepEqual(signalSettingsOf({}), { off: [], custom: [] }, 'a configuration without the keys switches nothing off');
  await setConfig({ ...serializeConfig(), signalsOff: SETTINGS.off, signalsCustom: SETTINGS.custom });
});

test('G-023 Signal monitoring: each file counts once, through its latest run; rows per type, unknown tags and the status of each type', async () => {
  const m = await as(admin(), s => signalMonitoring(s));
  const byType = Object.fromEntries(m.types.map(t => [t.type, t]));
  const rows = E.readTable(dataset.signalGrid, { file: 'f', sheet: 's', columns: E.SIGNAL_COLUMNS, required: E.SIGNAL_REQUIRED, anchor: 'signal_type' }).records;
  assert.equal(m.totals.records, rows.filter(r => String(r.signal_type ?? '').trim()).length, 'every row with a tag, once (two runs of the file)');
  assert.equal(m.totals.records, 1492);
  assert.deepEqual(m.files.map(f => [f.fileName, f.rows, f.byteSize, f.usedIn]), [['Lead_Research_Sample_Dataset.xlsx', 1492, sample.length, 'Account Scoring']]);
  // Tags read as the scoring reads them: any case, and the D-14 synonyms (RFQ, Inquiry).
  assert.equal(byType['Inquiry or RFQ'].records, 151 + 2 + 8 + 4);
  assert.equal(byType['Content download'].records, 198 + 3 + 2);
  assert.deepEqual([byType['Webinar attended'].status, byType['Webinar attended'].records], ['Off', 194]);
  assert.deepEqual([byType['Demo request'].status, byType['Demo request'].added, byType['Demo request'].segment], ['On', true, 'Inquiry']);
  assert.equal(byType['Installed system (current)'].status, 'Knock-out');
  assert.equal(byType['Newsletter sign-up'].status, 'Not scored');
  assert.equal(byType['Capital project'].status, 'On');
  assert.deepEqual(m.totals.unknownTypes, ['Price request', 'Trade show visit', 'Site visit', 'Webinar']);
  assert.equal(m.totals.unknownRecords, 5 + 5 + 4 + 3);
  assert.ok(m.totals.unknownTypes.every(t => byType[t].status === 'Not a known tag'));
  assert.deepEqual([m.totals.knownSeen, m.totals.known], [12, 12], 'the 11 starting types and the one added');
  assert.equal(m.types.slice(0, 12).map(t => t.type).join('|'), [...Object.keys(E.CONFIG.signalTypes), 'Demo request'].join('|'), 'known types first, in configuration order');
  // Size: the text of the rows as read; the latest event is the newest valid date.
  const sigs = (await owner.query(`SELECT data FROM signals WHERE run_id = (SELECT id FROM scoring_runs ORDER BY created_at DESC LIMIT 1)`)).rows.map(r => r.data as E.Signal);
  assert.equal(m.totals.size, sigs.reduce((n, x) => n + [x.company, x.personRef, x.type, x.date, x.detail, x.source, x.product].join(',').length + 1, 0));
  const capital = sigs.filter(x => x.type === 'Capital project' || x.type.toLowerCase() === 'capital project').map(x => x.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  assert.equal(byType['Capital project'].latestEvent, capital[capital.length - 1]);
  assert.ok(byType['Capital project'].lastReceived instanceof Date);
  assert.deepEqual([byType['Site visit'].files, byType['Price request'].records], [1, 5]);
});

test('G-014 in Signal monitoring: a rep counts only the rows about the accounts they own, and the screen is told so', async () => {
  const mine = await as(repCtx([someOwner]), s => signalMonitoring(s));
  const latest = (await owner.query(`SELECT id FROM scoring_runs ORDER BY created_at DESC LIMIT 1`)).rows[0].id;
  const own = (await owner.query(`SELECT count(*)::int n FROM signals WHERE run_id = $1 AND owner_email = $2 AND coalesce(data->>'type', '') <> ''`, [latest, someOwner])).rows[0].n;
  assert.equal(mine.scope, 'own');
  assert.ok(own > 0);
  assert.equal(mine.totals.records, own);
  assert.equal(mine.files[0].rows, own);
  const nobody = await as(repCtx([]), s => signalMonitoring(s));
  assert.equal(nobody.totals.records, 0, 'a rep with no owner address sees no rows');
  assert.equal(nobody.files.length, 1, 'the file itself is the unit’s, shared like uploads');
  const other = await as({ userId: ids.repB, businessUnitId: ids.buB, scope: 'all', ownerEmails: [] }, s => signalMonitoring(s));
  assert.deepEqual([other.totals.records, other.files.length], [0, 0], 'another business unit sees nothing');
});

test('G-023 unused rows: the filter returns every row that did not count, in file order, and the run counts them; a rep sees their own', async () => {
  const run = await as(admin(), s => getRun(s, adminActor(), firstRun));
  const want = (await owner.query(`SELECT count(*)::int n FROM signals WHERE run_id = $1 AND status <> 'Qualified'`, [firstRun])).rows[0].n;
  assert.equal(run.visible.unused, want);
  const seen: (E.Signal & { seq: number })[] = [];
  let after: number | undefined;
  do {
    const page = await as(admin(), s => listSignals(s, firstRun, { status: 'unused', after, limit: 500 }));
    seen.push(...page.rows);
    after = page.next ?? undefined;
  } while (after !== undefined);
  assert.equal(seen.length, want);
  assert.ok(seen.every(x => x.status !== 'Qualified'));
  assert.deepEqual(seen.map(x => x.seq), [...seen.map(x => x.seq)].sort((a, b) => a - b));
  assert.ok(seen.some(x => x.code === 'OFF') && seen.some(x => x.status === 'Not used') && seen.some(x => x.status === 'Used for a knock-out'));
  const rep = await as(repCtx([someOwner]), s => getRun(s, { userId: ids.repA, role: 'Sales rep' }, firstRun));
  const own = (await owner.query(`SELECT count(*)::int n FROM signals WHERE run_id = $1 AND status <> 'Qualified' AND owner_email = $2`, [firstRun, someOwner])).rows[0].n;
  assert.equal(rep.visible.unused, own);
  const repPage = await as(repCtx([someOwner]), s => listSignals(s, firstRun, { status: 'unused', limit: 500 }));
  assert.equal(repPage.rows.length, own);
});
