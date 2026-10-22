// Repository hygiene: confidential material can't be committed or shipped, and the Client's name
// never appears in a tracked file (G-030, G-064, G-065).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });

test('git ignores reference_content/, the local DEMANDAI_ documents, .idea/ and .env files', () => {
  for (const path of ['reference_content', 'reference_content/x.docx', 'DEMANDAI_WORKLOG.md', '.idea/x.xml', '.env', '.env.local', '.env.production']) {
    assert.match(git('check-ignore', '-v', '--no-index', path), /\.gitignore|info\/exclude/, `${path} must be ignored`);
  }
  // The template is the one env file that is tracked.
  assert.throws(() => git('check-ignore', '--no-index', '.env.example'), '.env.example must not be ignored');
});

test('no tracked file lives under reference_content/', () => {
  assert.equal(git('ls-files', 'reference_content').trim(), '');
});

test('the Docker build context excludes confidential, local and non-product files', () => {
  const patterns = readFileSync(join(repo, '.dockerignore'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  for (const p of ['reference_content/', 'DEMANDAI_*', '.env*', '.git/', 'legacy/', 'tests/', 'test-data/', 'node_modules/', '.next/']) {
    assert.ok(patterns.includes(p), `.dockerignore must list ${p}`);
  }
  assert.ok(patterns.includes('!.env.example'));
});

test('no orphan gitlinks remain in the tree', () => {
  const gitlinks = git('ls-files', '-s').split('\n').filter(l => l.startsWith('160000 '));
  assert.deepEqual(gitlinks, []);
});

// The pattern is never stored in the repository. Locally it is derived from the reference file names;
// in CI it comes from the CLIENT_NAME_PATTERN secret. Without either, the scan is skipped.
function clientNamePattern(): RegExp | null {
  if (process.env.CLIENT_NAME_PATTERN) return new RegExp(process.env.CLIENT_NAME_PATTERN, 'i');
  const docs = join(repo, 'reference_content', 'Documentation');
  if (!existsSync(docs)) return null;
  const counts = new Map<string, number>();
  const stop = new Set(['final', 'document', 'documentation', 'process', 'flows', 'detailed', 'proposal', 'draft', 'version', 'client', 'demand', 'generation', 'marketing']);
  for (const name of readdirSync(docs)) {
    for (const w of new Set((name.match(/[A-Za-z]{5,}/g) || []).map(t => t.toLowerCase()))) {
      if (!stop.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  const best = [...counts].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
  return best ? new RegExp(best[0], 'i') : null;
}

test("no tracked text file contains the Client's name", t => {
  const pattern = clientNamePattern();
  if (!pattern) return t.skip('no reference_content/ and no CLIENT_NAME_PATTERN');
  const offenders: string[] = [];
  for (const file of git('ls-files', '-z').split('\0').filter(Boolean)) {
    const path = join(repo, file);
    if (!existsSync(path)) continue;
    const buf = readFileSync(path);
    if (buf.includes(0)) continue; // binary
    const hits = buf.toString('utf8').split('\n').filter(line => pattern.test(line)).length;
    if (hits) offenders.push(`${file} (${hits} line(s))`); // never the matching text itself
  }
  assert.deepEqual(offenders, []);
});
