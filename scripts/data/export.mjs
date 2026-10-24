#!/usr/bin/env node
// Returns the pilot's data (spec 1.6, D-20) before it is purged: the uploaded files exactly as they were received, and
// the rows made from them as JSON Lines, one file per table, per business unit, through export_pilot_files() and
// export_pilot_rows() as the ops role. The output holds personal data: write it to encrypted storage, hand it over by
// an agreed secure route, and delete the copy afterwards. Every export is recorded in the audit log.
//
//   npm run data:export -- --out <new folder> [--unit pilot-bu] [--before 2026-12-01 | --upload <upload id>]
//
// With no --before or --upload it takes everything up to now. Writes <out>/<unit>/files/…, <out>/<unit>/<table>.jsonl
// and <out>/manifest.json (counts and SHA-256 of every file). Prints counts and paths, never data. --json prints the
// manifest instead.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { connectOps, hideUrls, parseWhen } from './ops-db.mjs';

export const TABLES = ['uploads', 'lead_lists', 'accounts', 'contacts', 'corrections', 'issues', 'scoring_runs', 'signals', 'account_scores', 'prospect_scores',
  'handoffs', 'handoff_items', 'nba_runs', 'recommendations', 'drafts', 'decision_log', 'readouts', 'readout_signoffs', 'studio_items', 'people'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseArgs(argv, now = new Date()) {
  const o = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--unit') o.unit = argv[++i];
    else if (a === '--before') o.before = parseWhen(argv[++i], '--before');
    else if (a === '--upload') o.upload = argv[++i];
    else if (a === '--json') o.json = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.out) throw new Error('--out <new folder> is required');
  if (o.before && o.upload) throw new Error('give --before or --upload, not both');
  if (o.upload !== undefined && !UUID.test(o.upload)) throw new Error('--upload needs an upload ID');
  if (!o.upload && !o.before) o.before = now.toISOString();
  return o;
}

/** A file name that stays inside its folder. */
const safeName = name => String(name).replace(/[/\\\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '_').slice(0, 150) || 'file';

export async function exportData(client, { out, unit = null, before = null, upload = null }) {
  const root = resolve(out);
  if (existsSync(root) && readdirSync(root).length) throw new Error('--out must be a new or empty folder');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const manifest = { exportedAt: new Date().toISOString(), scope: { unit, before, upload }, units: {} };
  const unitOf = code => {
    if (!manifest.units[code]) {
      manifest.units[code] = { files: [], tables: {} };
      mkdirSync(join(root, safeName(code), 'files'), { recursive: true, mode: 0o700 });
    }
    return manifest.units[code];
  };
  const files = await client.query('SELECT upload_id, unit_code, kind, file_name, created_at, sha256, bytes FROM export_pilot_files($1, $2, $3)', [upload, before, unit]);
  for (const f of files.rows) {
    const u = unitOf(f.unit_code);
    const name = `${f.created_at.toISOString().slice(0, 10)}_${f.kind}_${f.upload_id.slice(0, 8)}_${safeName(f.file_name)}`;
    const bytes = f.bytes ?? Buffer.alloc(0);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(root, safeName(f.unit_code), 'files', name), bytes, { mode: 0o600 });
    u.files.push({ name, uploadId: f.upload_id, kind: f.kind, bytes: bytes.length, sha256, matchesUpload: sha256 === f.sha256 });
  }
  for (const table of TABLES) {
    const { rows } = await client.query('SELECT unit_code, data FROM export_pilot_rows($1, $2, $3, $4)', [table, upload, before, unit]);
    const byUnit = new Map();
    for (const r of rows) (byUnit.get(r.unit_code) ?? byUnit.set(r.unit_code, []).get(r.unit_code)).push(JSON.stringify(r.data));
    for (const [code, lines] of byUnit) {
      unitOf(code).tables[table] = lines.length;
      writeFileSync(join(root, safeName(code), `${table}.jsonl`), lines.join('\n') + '\n', { mode: 0o600 });
    }
  }
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let client;
  try {
    const o = parseArgs(process.argv.slice(2));
    client = await connectOps();
    const m = await exportData(client, o);
    if (o.json) console.log(JSON.stringify(m));
    else {
      for (const [code, u] of Object.entries(m.units)) {
        const rows = Object.entries(u.tables).map(([t, n]) => `${t} ${n}`).join(', ') || 'no rows';
        console.log(`${code}: ${u.files.length} file(s); ${rows}`);
        for (const f of u.files.filter(f => !f.matchesUpload)) console.log(`  warning: ${f.name} does not match the checksum taken at upload`);
      }
      if (!Object.keys(m.units).length) console.log('Nothing to export in that scope.');
      console.log(`Written to ${resolve(o.out)} (manifest.json lists every file). It holds personal data: keep it encrypted and delete it after the hand-over.`);
    }
  } catch (err) {
    console.error(`export failed: ${hideUrls(err.message)}`);
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
