// CSV exports never hand a spreadsheet a live formula (G-052, audit SEC-08). Cells are trimmed (as before), so a
// leading tab or carriage return never survives; a cell that then starts with = + - or @ is prefixed with an
// apostrophe, so Excel and LibreOffice show it as text. Plain numbers, including negative ones, are left as they are.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, toCSV } from '../lib/demandai-engine.ts';

test('formula-like cells are neutralised in CSV exports', () => {
  const cells = ['=HYPERLINK("http://evil.example","x")', '@SUM(1+1)', '+44 20 7946 0000', '-2+3', '=cmd|"/c calc"!A1', '\t\r=1+1', '\t@A1'];
  const back = parseCSV(toCSV([cells]))[0];
  assert.deepEqual(back, cells.map(c => `'${c.trim()}`));
});

test('ordinary values, numbers and negative numbers are unchanged', () => {
  const cells = ['Northwind Refining', 'a,b', 'say "hi"', 'x=1', '12', '-5', '-0.25', '2400000000', ''];
  assert.deepEqual(parseCSV(toCSV([cells]))[0], cells);
});
