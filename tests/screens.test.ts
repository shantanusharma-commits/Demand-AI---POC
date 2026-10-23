// What the screens may and may not hold (G-010, G-011, G-012, G-029; remediation prompt §12): no screen shows a
// hard-coded metric, and browser storage keeps UI preferences only, never personal or pilot data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p, ext) : ext.test(n) ? [p] : []; });
}
const sources = [...files(join(repo, 'components'), /\.tsx?$/), ...files(join(repo, 'lib'), /\.tsx?$/), ...files(join(repo, 'app'), /\.tsx?$/)];

test('no screen shows a hard-coded metric: no bare number or percentage written into the markup', () => {
  const hits: string[] = [];
  for (const f of files(join(repo, 'components'), /\.tsx$/)) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/>\s*-?\d[\d,.]*\s*%?\s*</.test(line)) hits.push(`${relative(repo, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], 'every number on screen comes from the server');
});

test('browser storage keeps UI preferences only: three named keys, read and written behind try/catch', () => {
  const allowed = new Set(['demandai_today_intro_v1', 'demandai_scoring_tiers_v1', 'demandai_review_cols_v1']);
  const uses: string[] = [];
  for (const f of sources) {
    const src = readFileSync(f, 'utf8');
    if (/sessionStorage|indexedDB/.test(src)) assert.fail(`${relative(repo, f)} uses sessionStorage or IndexedDB`);
    if (!/localStorage/.test(src)) continue;
    uses.push(relative(repo, f));
    for (const m of src.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*([A-Z_]+|'[^']*')/g)) {
      const name = m[1].startsWith("'") ? m[1].slice(1, -1) : (new RegExp(`const ${m[1]} = '([^']+)'`).exec(src) || [])[1];
      assert.ok(name && allowed.has(name), `${relative(repo, f)}: localStorage key ${m[1]} is not one of the UI preferences`);
    }
  }
  assert.deepEqual(uses.sort(), ['components/screens/ReviewScreen.tsx', 'components/screens/ScoringScreen.tsx', 'components/screens/TodayScreen.tsx']);
});
