// Choosing the sheet to read from a workbook. Same rules and order as the original pickSheet in Prospecting and
// Scoring: the sheet named like the template that has the anchor column, then any sheet with it, then the first.
import type { Grid } from '../../types/demandai';

export interface SheetGrid { sheet: string; grid: Grid }

/** True when one of the first 10 rows has a cell naming `anchor` (e.g. company_name, signal_type). */
export function sheetHasColumn(g: SheetGrid, anchor: string): boolean {
  return g.grid.slice(0, 10).some(r => (r || []).some(c => String(c).trim().toLowerCase().replace(/\*/g, '').replace(/\s+/g, '_') === anchor));
}

export function pickSheet(grids: SheetGrid[], anchor: string, namePattern: RegExp): SheetGrid {
  return grids.find(g => namePattern.test(g.sheet) && sheetHasColumn(g, anchor)) || grids.find(g => sheetHasColumn(g, anchor)) || grids[0];
}

export const LEAD_SHEET = { anchor: 'company_name', namePattern: /lead template/i } as const;
export const SIGNAL_SHEET = { anchor: 'signal_type', namePattern: /signal template/i } as const;
