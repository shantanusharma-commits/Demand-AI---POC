// Parity of the helpers the two engines still share. Since Phase 4b the TypeScript engine carries data-quality
// fixes (N-01, G-016…G-044) that the legacy engine keeps as defects (rule 7: legacy/ is never edited), so their
// whole-pipeline outputs differ on purpose. The answer-key test (tests/answer-key.test.ts) is now the oracle for
// behaviour, and the legacy engine's own tests are ported in Phase 4c (G-053).
// Remove this file together with legacy/ once the original version is retired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as TS from '../lib/demandai-engine.ts';

const require = createRequire(import.meta.url);
const JS = require('../legacy/demandai-engine.js');

test('helpers give the same results as the original', () => {
  const csv = '﻿a,"b,c","d ""q"""\r\n1,"x\ny",3';
  assert.deepStrictEqual(TS.parseCSV(csv), JS.parseCSV(csv));
  const rows = [['a,b', 'c"d', 'e\nf', 12, null]];
  assert.equal(TS.toCSV(rows), JS.toCSV(rows));
  for (const t of ['Head of Instrumentation', 'Plant Manager', 'HR Manager', '']) assert.equal(TS.personaOf(t), JS.personaOf(t));
  for (const [i, s] of [['Oil & Gas - Refining', 'Crude refining'], ['Petrochemicals', ''], ['', 'LNG'], ['Refining', 'Petrochemicals']])
    assert.deepStrictEqual(TS.classify(i, s), JS.classify(i, s));
  // No match: the same answer, but the reason no longer says the AI classifier "isn't connected yet" (Phase 6, ts-1.12.0).
  const { reason, ...rest } = TS.classify('Mining', ''), { reason: was, ...legacy } = JS.classify('Mining', '');
  assert.deepStrictEqual(rest, legacy);
  assert.match(was, /isn't connected yet/);
  assert.equal(reason, '"Mining" has no match in the mapping table, so this is held as other for review');
  for (const w of [[], [100], [60, 100, 30], [30, 30, 30, 30]]) assert.equal(TS.stack(w), JS.stack(w));
  for (const [r, h] of [[40, true], [35, true], [20, true], [19.9, true], [80, false]] as const) assert.equal(TS.tierFor(r, h), JS.tierFor(r, h));
  assert.deepStrictEqual(TS.CONFIG.tierThresholds, JS.CONFIG.tierThresholds);
  assert.equal(JSON.stringify(TS.CONFIG.signalTypes), JSON.stringify(JS.CONFIG.signalTypes));
});
