// Reads an inspected upload into the grid the engine takes (plan §4 item 9).
// - Excel: SheetJS 0.20.3 with cellDates off. A number in a date format becomes YYYY-MM-DD from SSF's own
//   calendar arithmetic, so no time zone can move it a day (G-024). Formulas are never evaluated: the cached value
//   is read. Error cells read as their Excel text (#N/A) so the checks flag them instead of treating them as blank.
// - CSV: the encoding is detected (BOM, then strict UTF-8, else Windows-1252) and so is the delimiter
//   (comma, semicolon, tab or pipe) (G-059). Both are reported when they aren't UTF-8 and comma.
// - Rows above the cap are refused, never silently dropped (D-8).
import 'server-only';
import * as XLSX from 'xlsx';
import { parseCSV } from '../../demandai-engine.ts';
import { pickSheet, type SheetGrid } from '../../engine/sheets.ts';
import type { Cell, Grid } from '../../../types/demandai';
import type { UploadFormat } from './inspect.ts';

/** A refusal found while reading the file: shown to the person, so plain words and no file content. */
export class UploadReadError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'UploadReadError';
    this.code = code;
  }
}

/** Something about how the file was read that the person should know (encoding, delimiter). */
export type FileNote = { issue: string; outcome: string; fix: string };

export type ReadResult = {
  sheet: string;
  grid: Grid;
  sheets: string[];
  notes: FileNote[];
  encoding?: string;
  delimiter?: string;
};

export type ReadOptions = { anchor: string; namePattern: RegExp; maxRows: number };

// Rows above the data that a template may hold (title, header, format hints) before the cap applies.
const HEADER_ALLOWANCE = 10;

const ERRORS: Record<number, string> = { 0x00: '#NULL!', 0x07: '#DIV/0!', 0x0f: '#VALUE!', 0x17: '#REF!', 0x1d: '#NAME?', 0x24: '#NUM!', 0x2a: '#N/A', 0x2b: '#GETTING_DATA' };

function isoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

type XCell = { t: string; v?: unknown; z?: string | number };

function cellValue(c: XCell | undefined, date1904: boolean): Cell {
  if (!c || c.v === undefined || c.v === null) return '';
  switch (c.t) {
    case 'n': {
      const v = c.v as number;
      if (typeof c.z === 'string' && XLSX.SSF.is_date(c.z)) {
        const p = XLSX.SSF.parse_date_code(v, { date1904 });
        if (p && p.y > 0) return isoDate(p.y, p.m, p.d);
      }
      return v;
    }
    case 'd': {
      const d = c.v as Date;
      return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    case 'b': return c.v as boolean;
    case 'e': return ERRORS[c.v as number] ?? '#ERROR';
    case 's': return String(c.v);
    default: return '';
  }
}

function sheetGrid(ws: XLSX.WorkSheet, date1904: boolean): { grid: Grid; fullRows: number } {
  const ref = ws['!ref'];
  if (!ref) return { grid: [], fullRows: 0 };
  const range = XLSX.utils.decode_range(ref);
  const full = ws['!fullref'] ? XLSX.utils.decode_range(ws['!fullref'] as string) : range;
  const data = ((ws as unknown as { '!data'?: (XCell | undefined)[][] })['!data']) ?? [];
  const width = range.e.c + 1;
  const grid: Grid = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row = data[r];
    const out: Cell[] = new Array(width);
    for (let c = 0; c < width; c++) out[c] = cellValue(row?.[c], date1904);
    grid.push(out);
  }
  return { grid, fullRows: full.e.r + 1 };
}

function readWorkbook(bytes: Buffer, opts: ReadOptions): ReadResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, {
      type: 'buffer', dense: true, cellDates: false, cellNF: true, cellFormula: false, cellHTML: false, cellText: false,
      cellStyles: false, sheetStubs: false, bookVBA: false, sheetRows: opts.maxRows + HEADER_ALLOWANCE + 1,
    });
  } catch (err) {
    if (/password|encrypt/i.test(String((err as Error).message))) {
      throw new UploadReadError('protected', 'This workbook is password-protected. Remove the password in Excel and upload it again.');
    }
    throw new UploadReadError('unreadable', "The workbook couldn't be read. Open it in Excel, save it again as .xlsx, and upload that.");
  }
  // A damaged zip header (outside the CRC-checked data) can leave a listed sheet unloaded: refuse it, don't crash.
  if (wb.SheetNames.some(name => !wb.Sheets[name])) {
    throw new UploadReadError('unreadable', "The workbook couldn't be read. Open it in Excel, save it again as .xlsx, and upload that.");
  }
  const date1904 = !!wb.Workbook?.WBProps?.date1904;
  const sheets: (SheetGrid & { fullRows: number })[] = wb.SheetNames.map(name => ({ sheet: name, ...sheetGrid(wb.Sheets[name], date1904) }));
  if (!sheets.length) throw new UploadReadError('unreadable', 'The workbook has no sheets.');
  const chosen = pickSheet(sheets, opts.anchor, opts.namePattern) as SheetGrid & { fullRows: number };
  if (chosen.fullRows > opts.maxRows + HEADER_ALLOWANCE) throw tooManyRows(chosen.fullRows, opts.maxRows);
  return { sheet: chosen.sheet, grid: chosen.grid, sheets: wb.SheetNames.slice(), notes: [] };
}

function tooManyRows(rows: number, max: number): UploadReadError {
  return new UploadReadError('too_many_rows', `The sheet has ${rows.toLocaleString('en-US')} rows; the limit is ${max.toLocaleString('en-US')} per file. Split it into smaller files.`);
}

/** Text from CSV bytes: BOM first, then strict UTF-8, otherwise Windows-1252 (what Excel on Windows writes). */
export function decodeText(bytes: Buffer): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8' };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'Windows-1252' };
  }
}

const DELIMITERS = [',', ';', '\t', '|'] as const;
const DELIMITER_NAMES: Record<string, string> = { ',': 'commas', ';': 'semicolons', '\t': 'tabs', '|': 'vertical bars' };

/** The delimiter that splits the first lines most consistently (counted outside quotes); comma on a tie. */
export function detectDelimiter(text: string): string {
  // The first lines with quoted text left out, so a delimiter inside quotes isn't counted.
  const lines: string[] = [];
  let line = '', quoted = false;
  for (let i = 0; i < text.length && lines.length < 30; i++) {
    const ch = text[i];
    if (ch === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (ch === '\n' || ch === '\r') {
      if (line.trim()) lines.push(line);
      line = '';
      continue;
    }
    line += ch;
  }
  if (line.trim() && lines.length < 30) lines.push(line);
  let best: string = ',', bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map(l => l.split(d).length - 1).filter(n => n > 0);
    if (!counts.length) continue;
    const freq = new Map<number, number>();
    for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1);
    const [mode, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    // Lines that agree on the same column count, then how many columns that is.
    const score = times * 1000 + mode;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function readCsv(bytes: Buffer, opts: ReadOptions): ReadResult {
  const { text, encoding } = decodeText(bytes);
  const delimiter = detectDelimiter(text);
  const grid = parseCSV(text, delimiter);
  if (grid.length > opts.maxRows + HEADER_ALLOWANCE) throw tooManyRows(grid.length, opts.maxRows);
  const notes: FileNote[] = [];
  if (encoding === 'Windows-1252') {
    notes.push({ issue: 'File encoding: not UTF-8, read as Windows-1252', outcome: 'Accented letters read with that encoding', fix: 'Save as "CSV UTF-8" to be sure names come through as written' });
  }
  if (delimiter !== ',') {
    notes.push({ issue: `File delimiter: columns separated by ${DELIMITER_NAMES[delimiter]}`, outcome: 'Read with that delimiter', fix: 'Nothing to fix' });
  }
  return { sheet: '(CSV)', grid, sheets: ['(CSV)'], notes, encoding, delimiter };
}

export function readUpload(bytes: Buffer, format: UploadFormat, opts: ReadOptions): ReadResult {
  return format === 'csv' ? readCsv(bytes, opts) : readWorkbook(bytes, opts);
}
