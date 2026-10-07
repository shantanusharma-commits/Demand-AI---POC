/* Reading an uploaded lead or signal file: CSV or Excel, every sheet looked at.
   Same rules and messages as the original readFileToGrids / pickSheet in Prospecting and Scoring. Client-side only. */
import { parseCSV } from './demandai-engine';
import type { Grid } from '../types/demandai';

export interface SheetGrid { sheet: string; grid: Grid }

export function readFileToGrids(file: File): Promise<SheetGrid[]> {
  return new Promise((resolve, reject) => {
    const isCsv = /\.csv$/i.test(file.name);
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
    if (!isCsv && !isXlsx) { reject(new Error('Use a .csv or .xlsx file')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = async ev => {
      try {
        const result = (ev.target as FileReader).result;
        if (isCsv) { resolve([{ sheet: '(CSV)', grid: parseCSV(result as string) }]); return; }
        // The Excel reader (SheetJS) is loaded when an Excel file is first read, as the CDN script was in the original.
        let XLSX: typeof import('xlsx');
        try { XLSX = await import('xlsx'); }
        catch (e) { reject(new Error('The Excel reader did not load. Save the sheet as CSV and upload that instead')); return; }
        const wb = XLSX.read(new Uint8Array(result as ArrayBuffer), { type: 'array', cellDates: true });
        resolve(wb.SheetNames.map(n => ({ sheet: n, grid: XLSX.utils.sheet_to_json<Grid[number]>(wb.Sheets[n], { header: 1, raw: true, defval: '' }) })));
      } catch (e) { reject(e); }
    };
    if (isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
  });
}

/** True when one of the first 10 rows has a cell naming `anchor` (e.g. company_name, signal_type). */
export function sheetHasColumn(g: SheetGrid, anchor: string): boolean {
  return g.grid.slice(0, 10).some(r => (r || []).some(c => String(c).trim().toLowerCase().replace(/\*/g, '').replace(/\s+/g, '_') === anchor));
}

/** The template workbook has several sheets: prefer the one named like `namePattern` that has the anchor column,
 *  then any sheet with the anchor column, then the first sheet. */
export function pickSheet(grids: SheetGrid[], anchor: string, namePattern: RegExp): SheetGrid {
  return grids.find(g => namePattern.test(g.sheet) && sheetHasColumn(g, anchor)) || grids.find(g => sheetHasColumn(g, anchor)) || grids[0];
}
