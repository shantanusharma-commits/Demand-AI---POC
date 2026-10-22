/* Reading an uploaded lead file on the server: CSV or Excel, every sheet. Same rules and messages as lib/file-reader.ts,
   which does the same in the browser (the Scoring screen still uses that one). */
import * as XLSX from 'xlsx';
import { parseCSV } from '../demandai-engine.ts';
import type { Grid } from '../../types/demandai.ts';

export interface SheetGrid { sheet: string; grid: Grid }

export function gridsFromFile(name: string, bytes: ArrayBuffer): SheetGrid[] {
  if (/\.csv$/i.test(name)) return [{ sheet: '(CSV)', grid: parseCSV(new TextDecoder('utf-8').decode(bytes)) }];
  if (!/\.(xlsx|xls)$/i.test(name)) throw new Error('Use a .csv or .xlsx file');
  const wb = XLSX.read(new Uint8Array(bytes), { type: 'array', cellDates: true });
  return wb.SheetNames.map(n => ({ sheet: n, grid: XLSX.utils.sheet_to_json<Grid[number]>(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
}
