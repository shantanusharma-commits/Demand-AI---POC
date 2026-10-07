// Parity check for the TypeScript migration: the TypeScript engine must give exactly the same output as the
// original demandai-engine.js (kept in legacy/) for the same input. Runs the sample data and the
// 7,498-row generated dataset through both engines and compares every result field by field.
// Remove this file together with legacy/ once the original version is retired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as TS from '../lib/demandai-engine.ts';
import * as S from '../lib/demandai-sample-data.ts';
import type { Grid } from '../types/demandai';

const require = createRequire(import.meta.url);
const JS = require('../legacy/demandai-engine.js');
const XLSX = require('xlsx');

// Maps are compared as arrays of entries; everything else as JSON.
const snapshot = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => x instanceof Map ? [...x.entries()] : x));

function runBoth(leadGrid: Grid, signalGrid: Grid, asOf: string) {
  return [TS, JS].map(E => {
    const leads = E.processLeads(leadGrid, { file: 'lead', sheet: 'Lead template' });
    const list = { accounts: leads.accounts, contacts: leads.contacts };
    const sig = E.processSignals(signalGrid, list, { file: 'signal', sheet: 'Signal template', asOf });
    const scored = E.scoreList(list, sig);
    return snapshot({ leads, sig, scored });
  });
}

test('sample data: TypeScript engine output equals the original engine output', () => {
  const [ts, js] = runBoth(S.LEADS, S.SIGNALS, S.SAMPLE_AS_OF);
  assert.deepStrictEqual(ts, js);
});

test('7,498-row dataset: TypeScript engine output equals the original engine output', () => {
  const wb = XLSX.readFile(new URL('../test-data/Lead_Research_Sample_Dataset.xlsx', import.meta.url).pathname, { cellDates: true });
  const grid = (name: string): Grid => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
  const [ts, js] = runBoth(grid('Lead template'), grid('Signal template'), '2026-09-30');
  assert.equal(ts.leads.stats.rowsRead, 7498);
  assert.deepStrictEqual(ts, js);
});

test('helpers give the same results as the original', () => {
  const csv = '﻿a,"b,c","d ""q"""\r\n1,"x\ny",3';
  assert.deepStrictEqual(TS.parseCSV(csv), JS.parseCSV(csv));
  const rows = [['a,b', 'c"d', 'e\nf', 12, null]];
  assert.equal(TS.toCSV(rows), JS.toCSV(rows));
  for (const t of ['Head of Instrumentation', 'Plant Manager', 'HR Manager', '']) assert.equal(TS.personaOf(t), JS.personaOf(t));
  for (const [i, s] of [['Oil & Gas - Refining', 'Crude refining'], ['Petrochemicals', ''], ['', 'LNG'], ['Mining', ''], ['Refining', 'Petrochemicals']])
    assert.deepStrictEqual(TS.classify(i, s), JS.classify(i, s));
  for (const w of [[], [100], [60, 100, 30], [30, 30, 30, 30]]) assert.equal(TS.stack(w), JS.stack(w));
  for (const [r, h] of [[40, true], [35, true], [20, true], [19.9, true], [80, false]] as const) assert.equal(TS.tierFor(r, h), JS.tierFor(r, h));
  assert.deepStrictEqual(TS.CONFIG.tierThresholds, JS.CONFIG.tierThresholds);
  assert.equal(JSON.stringify(TS.CONFIG.signalTypes), JSON.stringify(JS.CONFIG.signalTypes));
});
