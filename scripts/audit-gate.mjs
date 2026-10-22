#!/usr/bin/env node
// Dependency audit gate (CI step). Two rules:
//  1. Production dependencies: no high or critical advisory, ever.
//  2. All dependencies: a high or critical advisory fails the gate unless security/audit-allowlist.json lists it,
//     the package is reached only through dev dependencies (rule 1 proves that), and the entry has not expired.
// Usage: node scripts/audit-gate.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);

function audit(args) {
  let out;
  try {
    out = execFileSync('npm', ['audit', '--json', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    out = err.stdout; // npm audit exits non-zero whenever it finds something
  }
  return JSON.parse(out);
}

// Root advisories only: entries whose `via` holds advisory objects. Packages that are vulnerable only because
// they depend on one (string `via` entries) are covered by the root advisory.
function blockingAdvisories(report) {
  const found = [];
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities || {})) {
    for (const via of vuln.via) {
      if (typeof via === 'object' && BLOCKING.has(via.severity)) {
        found.push({ pkg, id: String(via.url || '').split('/').pop(), severity: via.severity, title: via.title, range: via.range });
      }
    }
  }
  return found;
}

const allowlist = JSON.parse(readFileSync(new URL('../security/audit-allowlist.json', import.meta.url), 'utf8')).advisories;
const today = new Date().toISOString().slice(0, 10);
const failures = [];

const prod = blockingAdvisories(audit(['--omit=dev']));
for (const a of prod) failures.push(`production dependency ${a.pkg}: ${a.id} (${a.severity}) ${a.title}`);

const all = blockingAdvisories(audit([]));
for (const a of all) {
  if (prod.some(p => p.id === a.id && p.pkg === a.pkg)) continue; // already reported above
  const entry = allowlist.find(e => e.advisory === a.id && e.package === a.pkg);
  if (!entry) failures.push(`dev dependency ${a.pkg}: ${a.id} (${a.severity}) ${a.title} — not in security/audit-allowlist.json`);
  else if (entry.expires < today) failures.push(`allowlist entry for ${a.id} (${a.pkg}) expired on ${entry.expires}; review it`);
  else console.log(`allowed until ${entry.expires}: ${a.pkg} ${a.id} (${a.severity}, dev only) — ${entry.reason}`);
}
for (const e of allowlist) {
  if (!all.some(a => a.id === e.advisory && a.pkg === e.package)) console.log(`note: allowlist entry ${e.advisory} (${e.package}) no longer matches anything; remove it`);
}

if (failures.length) {
  console.error(`audit gate FAILED:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`audit gate passed: production 0 high/critical; ${all.length} dev advisory(ies) allowed`);
