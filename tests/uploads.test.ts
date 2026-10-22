// Uploads on the server: what is refused before parsing (type, size, macros, passwords, zip bombs) and how files
// are read (G-024 dates in every time zone, G-059 encodings and delimiters, D-8 row cap). Fixtures are built here
// or come from test-data/; nothing reads reference_content/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { inspectUpload, type InspectLimits } from '../lib/server/uploads/inspect.ts';
import { DEFAULT_ZIP_LIMITS } from '../lib/server/uploads/zip.ts';
import { readUpload, UploadReadError } from '../lib/server/uploads/parse.ts';
import { LEAD_SHEET, SIGNAL_SHEET } from '../lib/engine/sheets.ts';
import * as E from '../lib/demandai-engine.ts';
import { buildZip, WORKBOOK_PARTS } from './helpers/zip.ts';
import { DATASET, loadDataset } from './helpers/answer-key.ts';

const LIMITS: InspectLimits = { maxBytes: 25 * 1024 * 1024, zip: DEFAULT_ZIP_LIMITS };
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const inspect = (fileName: string, bytes: Buffer, mediaType = '', limits = LIMITS) => inspectUpload({ fileName, mediaType, bytes }, limits);
const code = (r: ReturnType<typeof inspect>) => (r.ok === false ? `${r.status} ${r.code}` : 'ok');
const sample = readFileSync(DATASET);

function workbook(rows: unknown[][], sheet = 'Lead template'): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('G-024: a real Excel date reads as the same calendar day in every time zone', () => {
  const script = fileURLToPath(new URL('./helpers/read-dates.ts', import.meta.url));
  const want = ['2026-09-01', '2026-09-01', '2026-01-01', '2026-10-25', '1982-01-01'];
  for (const tz of ['UTC', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Jakarta', 'America/Los_Angeles', 'America/Sao_Paulo', 'Pacific/Auckland']) {
    const out = execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--conditions=react-server', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    const got = JSON.parse(out);
    assert.equal(got.tz, tz);
    assert.deepEqual(got.dates, want, `1900 date system under ${tz}`);
    assert.deepEqual(got.dates1904, want, `1904 date system under ${tz}`);
  }
});

test('the full sample workbook reads to the same grid the engine was tested on, with identical results', () => {
  const lead = readUpload(sample, 'xlsx', { ...LEAD_SHEET, maxRows: 50_000 });
  const signal = readUpload(sample, 'xlsx', { ...SIGNAL_SHEET, maxRows: 50_000 });
  assert.equal(lead.sheet, 'Lead template');
  assert.equal(signal.sheet, 'Signal template');
  const old = loadDataset();
  const a = E.processLeads(lead.grid, { file: 'dataset', sheet: 'Lead template' });
  const b = E.processLeads(old.leadGrid, { file: 'dataset', sheet: 'Lead template' });
  assert.deepStrictEqual(a, b);
  assert.equal(a.stats.rowsRead, 7498);
  const listA = JSON.parse(JSON.stringify({ accounts: a.accounts, contacts: a.contacts }));
  const listB = JSON.parse(JSON.stringify({ accounts: b.accounts, contacts: b.contacts }));
  const sa = E.processSignals(signal.grid, listA, { asOf: '2026-09-30' });
  const sb = E.processSignals(old.signalGrid, listB, { asOf: '2026-09-30' });
  assert.deepStrictEqual(E.scoreList(listA, sa), E.scoreList(listB, sb));
});

test('accepted: the sample .xlsx, a .csv, an .xls, with the types browsers really send', () => {
  assert.equal(code(inspect('Lead_Research_Sample_Dataset.xlsx', sample, XLSX_TYPE)), 'ok');
  assert.equal(code(inspect('leads.xlsx', sample, '')), 'ok');
  assert.equal(code(inspect('leads.csv', Buffer.from('company_name,country\nA,B\n'), 'application/vnd.ms-excel')), 'ok');
  const xls = XLSX.write(XLSX.read(workbook([['company_name'], ['A']])), { type: 'buffer', bookType: 'biff8' });
  assert.equal(code(inspect('leads.xls', xls, 'application/vnd.ms-excel')), 'ok');
  assert.deepEqual(readUpload(xls, 'xls', { ...LEAD_SHEET, maxRows: 10 }).grid, [['company_name'], ['A']]);
});

test('refused before parsing: wrong or unknown type, empty, oversize, mismatched media type', () => {
  assert.equal(code(inspect('leads.pdf', Buffer.from('%PDF-1.7'))), '415 unsupported_type');
  assert.equal(code(inspect('leads', Buffer.from('a,b'))), '415 unsupported_type');
  assert.equal(code(inspect('leads.csv', Buffer.alloc(0))), '422 empty_file');
  assert.equal(code(inspect('leads.csv', Buffer.alloc(2048, 0x41), '', { ...LIMITS, maxBytes: 1024 })), '413 too_large');
  assert.equal(code(inspect('leads.csv', Buffer.from('a,b'), 'image/png')), '415 unsupported_type');
  assert.equal(code(inspect('leads.xlsx', sample, 'text/html')), '415 unsupported_type');
});

test('refused: macro-enabled workbooks, by name, by VBA part, by content type, and .xls with a VBA project', () => {
  assert.equal(code(inspect('leads.xlsm', sample)), '415 macro_file');
  assert.equal(code(inspect('LEADS.XLSB', sample)), '415 macro_file');
  assert.equal(code(inspect('leads.xlsx', buildZip([...WORKBOOK_PARTS, { name: 'xl/vbaProject.bin', data: 'VBA' }]))), '415 macro_file');
  assert.equal(code(inspect('leads.xlsx', buildZip([...WORKBOOK_PARTS, { name: 'xl/macrosheets/sheet1.xml', data: '<x/>' }]))), '415 macro_file');
  const enabled = [{ name: '[Content_Types].xml', data: '<Types><Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>' }, WORKBOOK_PARTS[1]];
  assert.equal(code(inspect('leads.xlsx', buildZip(enabled))), '415 macro_file');
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512), Buffer.from('_VBA_PROJECT_CUR', 'utf16le')]);
  assert.equal(code(inspect('leads.xls', ole)), '415 macro_file');
  // Printer settings are .bin parts too, and ordinary.
  assert.equal(code(inspect('leads.xlsx', buildZip([...WORKBOOK_PARTS, { name: 'xl/printerSettings/printerSettings1.bin', data: 'x' }]))), 'ok');
});

test('refused: zip bombs, whether the headers are honest or lie about the size', () => {
  const zeros = Buffer.alloc(50 * 1024 * 1024);
  assert.equal(code(inspect('bomb.xlsx', buildZip([...WORKBOOK_PARTS, { name: 'xl/worksheets/sheet1.xml', data: zeros }]))), '422 zip_bomb', 'ratio');
  assert.equal(code(inspect('liar.xlsx', buildZip([...WORKBOOK_PARTS, { name: 'xl/worksheets/sheet1.xml', data: zeros, declaredSize: 1000 }]))), '422 zip_bomb', 'declared 1 kB');
  const tight = { ...LIMITS, zip: { ...DEFAULT_ZIP_LIMITS, maxUnzippedBytes: 4 * 1024 * 1024 } };
  assert.equal(code(inspect('Lead_Research_Sample_Dataset.xlsx', sample, '', tight)), '422 zip_bomb', 'over the total cap');
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `xl/media/${i}.txt`, data: 'x' }));
  assert.equal(code(inspect('many.xlsx', buildZip([...WORKBOOK_PARTS, ...many]), '', { ...LIMITS, zip: { ...DEFAULT_ZIP_LIMITS, maxEntries: 20 } })), '422 zip_bomb');
});

test('refused: not really a workbook, password-protected, truncated, or a workbook named .csv', () => {
  assert.equal(code(inspect('leads.xlsx', Buffer.from('company_name,country\n'))), '422 not_workbook');
  assert.equal(code(inspect('report.xlsx', buildZip([{ name: '[Content_Types].xml', data: '<Types/>' }, { name: 'word/document.xml', data: '<w/>' }]))), '422 not_workbook');
  assert.equal(code(inspect('leads.xlsx', sample.subarray(0, sample.length >> 1))), '422 not_workbook');
  assert.equal(code(inspect('leads.xlsx', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]))), '422 protected');
  assert.equal(code(inspect('leads.xls', sample)), '422 not_workbook');
  assert.equal(code(inspect('leads.csv', sample)), '422 not_text');
  assert.equal(code(inspect('leads.csv', Buffer.from('a,b\u0000c\n'))), '422 not_text');
});

test('fuzz: damaged copies of the sample are refused or read, never crash the reader', () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const outcomes = new Map<string, number>();
  for (let i = 0; i < 40; i++) {
    const b = Buffer.from(sample);
    for (let k = 0; k < 1 + Math.floor(rand() * 20); k++) b[Math.floor(rand() * b.length)] = Math.floor(rand() * 256);
    const r = inspect('fuzz.xlsx', b);
    let outcome = code(r);
    if (r.ok) {
      try { readUpload(b, 'xlsx', { ...LEAD_SHEET, maxRows: 50_000 }); outcome = 'read'; }
      catch (err) { assert.ok(err instanceof UploadReadError, `unexpected ${String(err)}`); outcome = `read ${err.code}`; }
    }
    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
  }
  assert.ok([...outcomes.keys()].every(k => /^(ok|read|read unreadable|422 \w+|415 \w+)$/.test(k)), JSON.stringify([...outcomes]));
});

test('G-059: CSV encodings are detected and a non-UTF-8 file says how it was read', () => {
  const win = Buffer.from([...Buffer.from('first_name,company_name\nRen'), 0xe9, ...Buffer.from(',Caf'), 0xe9, ...Buffer.from(' Refining\n')]);
  const r = readUpload(win, 'csv', { ...LEAD_SHEET, maxRows: 10 });
  assert.equal(r.encoding, 'Windows-1252');
  assert.deepEqual(r.grid[1], ['René', 'Café Refining']);
  assert.match(r.notes[0].issue, /read as Windows-1252/);
  const utf8bom = readUpload(Buffer.from('﻿first_name,company_name\nZoë,Ngọc Refining\n'), 'csv', { ...LEAD_SHEET, maxRows: 10 });
  assert.deepEqual([utf8bom.encoding, utf8bom.grid[1], utf8bom.notes.length], ['UTF-8', ['Zoë', 'Ngọc Refining'], 0]);
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('first_name\tcompany_name\r\nSiti\tBorneo Gas\r\n', 'utf16le')]);
  const u = readUpload(utf16, 'csv', { ...LEAD_SHEET, maxRows: 10 });
  assert.deepEqual([u.encoding, u.delimiter, u.grid[1]], ['UTF-16', '\t', ['Siti', 'Borneo Gas']]);
});

test('G-059: semicolon, tab and pipe delimiters are detected; quoted delimiters do not mislead', () => {
  const semi = readUpload(Buffer.from('first_name;company_name;annual_revenue_usd\nAnn;"Acme; Refining";"1,5"\nBo;Delta;2\n'), 'csv', { ...LEAD_SHEET, maxRows: 10 });
  assert.equal(semi.delimiter, ';');
  assert.deepEqual(semi.grid[1], ['Ann', 'Acme; Refining', '1,5']);
  assert.match(semi.notes[0].issue, /semicolons/);
  const comma = readUpload(Buffer.from('first_name,company_name,detail\nAnn,Acme,"a; b; c; d"\nBo,Delta,"x;y"\n'), 'csv', { ...LEAD_SHEET, maxRows: 10 });
  assert.equal(comma.delimiter, ',');
  assert.equal(readUpload(Buffer.from('a|b|company_name\n1|2|3\n'), 'csv', { ...LEAD_SHEET, maxRows: 10 }).delimiter, '|');
});

test('D-8: a file over the row cap is refused with the count, never cut short', () => {
  const rows = ['company_name', ...Array.from({ length: 70 }, (_, i) => `Co ${i}`)].join('\n');
  assert.throws(() => readUpload(Buffer.from(rows), 'csv', { ...LEAD_SHEET, maxRows: 50 }), (e: unknown) => e instanceof UploadReadError && e.code === 'too_many_rows' && /71 rows; the limit is 50/.test(e.message));
  const big = workbook([['company_name'], ...Array.from({ length: 200 }, (_, i) => [`Co ${i}`])]);
  assert.throws(() => readUpload(big, 'xlsx', { ...LEAD_SHEET, maxRows: 50 }), (e: unknown) => e instanceof UploadReadError && e.code === 'too_many_rows');
  assert.equal(readUpload(big, 'xlsx', { ...LEAD_SHEET, maxRows: 200 }).grid.length, 201);
});

test('Excel error cells read as their text, and formulas give their saved value without being run', () => {
  const ws: XLSX.WorkSheet = { '!ref': 'A1:C2', A1: { t: 's', v: 'company_name' }, B1: { t: 's', v: 'annual_revenue_usd' }, C1: { t: 's', v: 'x' },
    A2: { t: 's', v: 'Acme' }, B2: { t: 'e', v: 0x2a }, C2: { t: 'n', v: 3, f: 'HYPERLINK("http://evil.example")' } };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lead template');
  const r = readUpload(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'xlsx', { ...LEAD_SHEET, maxRows: 10 });
  assert.deepEqual(r.grid[1], ['Acme', '#N/A', 3]);
});
