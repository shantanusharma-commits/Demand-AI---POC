#!/usr/bin/env node
// D-31 supply-chain rule: no locked package version may be younger than one day when it was locked.
// Versions younger than seven days are reported as a warning.
//
// Usage: node scripts/check-dependency-age.mjs [--base <git-ref>] [--min-days 1] [--warn-days 7]
//   --base  check only name@version pairs that are not in <git-ref>'s package-lock.json (CI uses the PR base)
// The reference time is when package-lock.json was last committed, or now if the working copy changed it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = opt('--base', null);
const minDays = Number(opt('--min-days', 1));
const warnDays = Number(opt('--warn-days', 7));
const DAY = 86_400_000;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

function registryPackages(lock) {
  const out = new Map();
  for (const [path, entry] of Object.entries(lock.packages || {})) {
    if (!path || entry.link || !entry.version || !String(entry.resolved || '').startsWith('https://registry.npmjs.org/')) continue;
    const name = entry.name || path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    out.set(`${name}@${entry.version}`, { name, version: entry.version });
  }
  return out;
}

const current = registryPackages(JSON.parse(readFileSync('package-lock.json', 'utf8')));
let toCheck = [...current.values()];
if (base) {
  let baseLock = null;
  try { baseLock = JSON.parse(git('show', `${base}:package-lock.json`)); } catch { /* no lockfile at base: check everything */ }
  if (baseLock) {
    const before = registryPackages(baseLock);
    toCheck = toCheck.filter(p => !before.has(`${p.name}@${p.version}`));
  }
}

let reference = Date.now();
try {
  const dirty = git('status', '--porcelain', '--', 'package-lock.json').trim();
  if (!dirty) reference = Date.parse(git('log', '-1', '--format=%cI', '--', 'package-lock.json').trim()) || reference;
} catch { /* not a git checkout: use now */ }

async function publishTime({ name, version }) {
  const url = `https://registry.npmjs.org/${name.replace('/', '%2f')}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (res.ok) {
      const doc = await res.json();
      return doc.time?.[version] ? Date.parse(doc.time[version]) : NaN;
    }
    if (attempt >= 3) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise(r => setTimeout(r, 1000 * attempt));
  }
}

const results = [];
const queue = [...toCheck];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const p = queue.shift();
    results.push({ ...p, published: await publishTime(p) });
  }
}));

const tooNew = results.filter(r => !(reference - r.published >= minDays * DAY));
const young = results.filter(r => !tooNew.includes(r) && reference - r.published < warnDays * DAY);
for (const r of young) console.log(`warning: ${r.name}@${r.version} was ${((reference - r.published) / DAY).toFixed(1)} days old when locked (prefer >= ${warnDays})`);
if (tooNew.length) {
  for (const r of tooNew) {
    const age = Number.isNaN(r.published) ? 'unknown publish time' : `${((reference - r.published) / DAY).toFixed(2)} days old`;
    console.error(`FAIL: ${r.name}@${r.version} is ${age} (minimum ${minDays} day)`);
  }
  process.exit(1);
}
console.log(`dependency age check passed: ${results.length} locked version(s) checked${base ? ` (new since ${base})` : ''}, reference ${new Date(reference).toISOString()}`);
