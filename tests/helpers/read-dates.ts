// Run in a child process with TZ set (tests/uploads.test.ts): writes a workbook whose cells are real Excel dates,
// reads it back through the server's upload reader, and prints the date strings it produced as JSON.
import * as XLSX from 'xlsx';
import { readUpload } from '../../lib/server/uploads/parse.ts';

const serial = (y: number, m: number, d: number, date1904 = false) =>
  (Date.UTC(y, m - 1, d) - Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30)) / 86400000;

const CASES: [number, number, number, string][] = [
  [2026, 9, 1, 'yyyy-mm-dd'], [2026, 9, 1, 'm/d/yy'], [2026, 1, 1, 'dd-mmm-yyyy'], [2026, 10, 25, 'yyyy-mm-dd h:mm'], [1982, 1, 1, 'd/m/yyyy'],
];

function book(date1904: boolean): Buffer {
  const ws: XLSX.WorkSheet = { '!ref': `A1:A${CASES.length + 1}`, A1: { t: 's', v: 'event_date' } };
  CASES.forEach(([y, m, d, z], i) => { ws[`A${i + 2}`] = { t: 'n', v: serial(y, m, d, date1904) + (z.includes('h') ? 0.75 : 0), z }; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Signal template');
  if (date1904) wb.Workbook = { ...wb.Workbook, WBProps: { date1904: true } };
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const read = (date1904: boolean) =>
  readUpload(book(date1904), 'xlsx', { anchor: 'event_date', namePattern: /signal template/i, maxRows: 100 }).grid.slice(1).map(r => r[0]);

process.stdout.write(JSON.stringify({ tz: process.env.TZ, dates: read(false), dates1904: read(true) }));
