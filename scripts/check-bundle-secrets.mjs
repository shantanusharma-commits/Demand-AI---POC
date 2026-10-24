#!/usr/bin/env node
// No secret reaches the build (remediation prompt §9 item 8; plan §9 item 4). Run after `npm run build` with known
// dummy values in the secret variables (CI does): every secret value that is set is searched for in the browser bundle
// (.next/static) and in the server output and prerendered pages (.next/server, .next/standalone). A value found
// anywhere fails the check; the message names the variable and the file, never the value.
//   SESSION_SECRET=dummy-… AZURE_OPENAI_API_KEY=dummy-… npm run build && … node scripts/check-bundle-secrets.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Variables whose values are secrets (lib/server/env.ts, compose.yaml). URLs count for the password inside them. */
export const SECRET_VARS = ['SESSION_SECRET', 'AZURE_OPENAI_API_KEY', 'NOTIFICATION_APP_PASSWORD', 'DATABASE_URL', 'DATABASE_MIGRATION_URL', 'DATABASE_OPS_URL',
  'DEMANDAI_OWNER_PASSWORD', 'DEMANDAI_APP_PASSWORD', 'DEMANDAI_OPS_PASSWORD', 'POSTGRES_PASSWORD', 'DEV_SEED_PASSWORD', 'AWS_SECRET_ACCESS_KEY'];
const MIN_LENGTH = 8;

/** The strings to look for: each secret's value, and the password inside a connection URL. */
export function needles(env) {
  const out = [];
  for (const name of SECRET_VARS) {
    const v = env[name];
    if (!v || v.length < MIN_LENGTH) continue;
    out.push({ name, value: v });
    try {
      const pw = decodeURIComponent(new URL(v).password || '');
      if (pw.length >= MIN_LENGTH) out.push({ name: `${name} (password)`, value: pw });
    } catch { /* not a URL */ }
  }
  return out;
}

function* files(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const n of names) {
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) { if (n !== 'node_modules' && n !== 'cache') yield* files(p); } else yield p;
  }
}

/** Every place a secret value appears under the given folders. */
export function findSecrets(roots, env) {
  const look = needles(env), found = [];
  if (!look.length) return { checked: 0, found };
  let checked = 0;
  for (const root of roots) {
    for (const f of files(root)) {
      checked++;
      const text = readFileSync(f).toString('latin1');
      for (const { name, value } of look) if (text.includes(value)) found.push({ name, file: f });
    }
  }
  return { checked, found };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = fileURLToPath(new URL('..', import.meta.url));
  const roots = ['.next/static', '.next/server', '.next/standalone'].map(d => join(repo, d));
  const set = needles(process.env);
  if (!set.length) { console.error('check-bundle-secrets: set dummy values in the secret variables (and build with them) first'); process.exit(2); }
  const { checked, found } = findSecrets(roots, process.env);
  if (found.length) {
    for (const f of found) console.error(`secret ${f.name} found in ${relative(repo, f.file)}`);
    process.exit(1);
  }
  console.log(`bundle secret check passed: ${set.length} secret value(s), ${checked} file(s) in .next/static, .next/server and .next/standalone`);
}
