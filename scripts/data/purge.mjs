#!/usr/bin/env node
// The end-of-pilot purge (D-20, provisional: 30 days after the readout). Removes uploaded files and everything made
// from them (lists, contacts, scores, hand-offs, recommendations, drafts, the decision log, corrections) through
// purge_pilot_data(), as the ops role, in one transaction. Without --yes it is a dry run that changes nothing.
//
//   npm run data:purge -- --status                         when each unit's data is due (the readout + 30 days)
//   npm run data:purge -- --due [--yes]                    every unit that is due
//   npm run data:purge -- --before 2026-12-01 [--unit pilot-bu] [--yes]
//   npm run data:purge -- --upload <upload id> [--yes]
//
// Return the data first if the Client wants it back: npm run data:export. From the image (Compose, a Kubernetes Job):
// node scripts/data/purge.mjs … with DATABASE_OPS_URL set. Prints counts, never data. RETENTION_DAYS_AFTER_READOUT
// changes the 30 days once the contract says otherwise. --json prints the result as JSON.
import { connectOps, hideUrls, parseWhen } from './ops-db.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseArgs(argv) {
  const o = { yes: false, json: false, due: false, status: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes') o.yes = true;
    else if (a === '--dry-run') o.yes = false;
    else if (a === '--json') o.json = true;
    else if (a === '--due') o.due = true;
    else if (a === '--status') o.status = true;
    else if (a === '--before') o.before = parseWhen(argv[++i], '--before');
    else if (a === '--unit') o.unit = argv[++i];
    else if (a === '--upload') o.upload = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (o.upload !== undefined && !UUID.test(o.upload)) throw new Error('--upload needs an upload ID');
  if ([o.status, o.due, o.before !== undefined, o.upload !== undefined].filter(Boolean).length !== 1) {
    throw new Error('give one of --status, --due, --before <date> or --upload <id>');
  }
  if (o.unit !== undefined && !(o.before || o.due)) throw new Error('--unit goes with --before or --due');
  return o;
}

/** What purge_pilot_data() removes (or would remove), table by table. */
export async function purge(client, { upload = null, before = null, unit = null, yes = false }) {
  const { rows } = await client.query('SELECT item, rows FROM purge_pilot_data($1, $2, $3, $4)', [upload, before, !yes, unit]);
  return Object.fromEntries(rows.map(r => [r.item, Number(r.rows)]));
}

/** Each unit's latest sponsor decision and when its data is due to go (only once a decision ends the pilot). */
export async function retention(client, days) {
  const { rows } = await client.query('SELECT unit_code, unit_name, decision, decided_at, purge_due_at, uploads FROM pilot_retention($1)', [days]);
  return rows.map(r => ({ unit: r.unit_code, name: r.unit_name, decision: r.decision, decidedAt: r.decided_at, dueAt: r.purge_due_at, uploads: Number(r.uploads) }));
}

/** Runs the command; returns what it printed as data, for --json and tests. */
export async function run(client, o, env = process.env, now = new Date()) {
  const days = Number(env.RETENTION_DAYS_AFTER_READOUT || 30);
  if (!Number.isInteger(days) || days < 1) throw new Error('RETENTION_DAYS_AFTER_READOUT must be a whole number of days, at least 1');
  if (o.status) return { mode: 'status', days, units: await retention(client, days) };
  if (o.due) {
    const due = (await retention(client, days)).filter(u => u.dueAt && u.dueAt <= now && u.uploads > 0 && (!o.unit || u.unit === o.unit));
    const units = [];
    for (const u of due) units.push({ unit: u.unit, decision: u.decision, decidedAt: u.decidedAt, removed: await purge(client, { before: now.toISOString(), unit: u.unit, yes: o.yes }) });
    return { mode: o.yes ? 'purged' : 'dry-run', days, units };
  }
  return { mode: o.yes ? 'purged' : 'dry-run', scope: { before: o.before ?? null, unit: o.unit ?? null, upload: o.upload ?? null }, removed: await purge(client, o) };
}

function print(r) {
  const table = counts => Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `  ${k.padEnd(18)} ${n}`).join('\n') || '  nothing';
  if (r.mode === 'status') {
    console.log(`Data is due to be purged ${r.days} days after a sponsor decision that ends the pilot (Stop, Go to production).`);
    const day = d => d.toISOString().slice(0, 10);
    for (const u of r.units) {
      const when = u.dueAt ? `"${u.decision}" on ${day(u.decidedAt)}, due ${day(u.dueAt)}` : u.decision ? `"${u.decision}" on ${day(u.decidedAt)}: not due` : 'no sponsor decision yet: not due';
      console.log(`  ${u.unit.padEnd(16)} ${u.uploads} upload(s); ${when}`);
    }
    return;
  }
  const head = r.mode === 'purged' ? 'Removed:' : 'Dry run, nothing removed. In scope:';
  if (r.units) {
    if (!r.units.length) console.log('No unit is due.');
    for (const u of r.units) console.log(`${u.unit} ("${u.decision}" on ${u.decidedAt.toISOString().slice(0, 10)}): ${head}\n${table(u.removed)}`);
  } else console.log(`${head}\n${table(r.removed)}`);
  if (r.mode === 'dry-run' && (r.units?.length || r.removed)) console.log('Run again with --yes to remove it.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let client;
  try {
    const o = parseArgs(process.argv.slice(2));
    client = await connectOps();
    const r = await run(client, o);
    if (o.json) console.log(JSON.stringify(r));
    else print(r);
  } catch (err) {
    console.error(`purge failed: ${hideUrls(err.message)}`);
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
