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

test('CSV downloads: UTF-8 with a byte-order mark, attachment with a plain-ASCII name and the UTF-8 name beside it', async () => {
  const { csvDownload } = await import('../lib/server/http/download.ts');
  const r = csvDownload('Lead "file" Việt.csv', 'Row,Field\r\n2,email');
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), `attachment; filename="Lead file Vi_t.csv"; filename*=UTF-8''Lead%20%22file%22%20Vi%E1%BB%87t.csv`);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(new TextDecoder().decode(bytes), 'Row,Field\r\n2,email', 'the decoder drops the mark; the rest is the CSV');
});
