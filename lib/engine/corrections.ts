/* Corrections to a lead file (G-015; the original 10-prospecting.html EDIT_FIELDS, openEdit, saveEdit and recheck),
   and the decisions people make on held rows and unclassified accounts (D-17, G-021).

   The uploaded file is never changed. Each correction is kept, in order, and replayed onto the file's grid whenever
   the list is built, so every rebuild gives the same list:
   - a person's own fields go on their row (as the original did);
   - the account's details (employees, industry, managed separately) go on every row of the account, merged repeats
     included, so a stray row can't keep the account held;
   - a confirmed opt-out goes on the person's row and the rows merged into it, for the same reason;
   - people taken out of the list and verticals chosen for an account reach the engine as decisions. */
import { headerMapper, headerRowOf, LEAD_COLUMNS, processLeads, VERTICAL_CHOICES, type ColumnMapping, type VerticalChoice } from '../demandai-engine.ts';
import type { Cell, Grid } from '../../types/demandai';

export type CorrectionSeverity = 'major' | 'minor';

/** The original EDIT_FIELDS: [column, label, severity]. Employees and industry change for the whole account. */
export const EDIT_FIELDS = [
  ['first_name', 'First name', 'major'], ['last_name', 'Last name', 'major'], ['job_title', 'Job title', 'minor'], ['email', 'Email', 'major'],
  ['email_verified', 'Email verified (Y/N)', 'minor'], ['linkedin_url', 'LinkedIn URL', 'major'], ['city', 'City', 'minor'], ['country', 'Country', 'minor'],
  ['owner_email', 'Owner (email)', 'minor'], ['employee_count', 'Employees (whole account)', 'minor'], ['industry', 'Industry (whole account)', 'minor'],
] as const satisfies readonly (readonly [string, string, CorrectionSeverity])[];
export type EditField = (typeof EDIT_FIELDS)[number][0];

/** Decisions on what the checks held (D-17), on the vertical (G-021), and taking someone out of the list. */
export const DECISION_FIELDS = {
  opt_out: 'Opt-out', managed_separately: 'Managed separately (whole account)', vertical: 'Vertical (whole account)', take_out: 'In the list',
} as const;
export type CorrectionField = EditField | keyof typeof DECISION_FIELDS;
export const CORRECTION_FIELDS = [...EDIT_FIELDS.map(f => f[0]), ...(Object.keys(DECISION_FIELDS) as (keyof typeof DECISION_FIELDS)[])] as [CorrectionField, ...CorrectionField[]];
/** Fields that change every row of the account. */
export const ACCOUNT_FIELDS: readonly CorrectionField[] = ['employee_count', 'industry', 'managed_separately', 'vertical'];

/** The original EDIT_REASONS and EDIT_SOURCES, plus the two confirmations and where a confirmation comes from. */
export const EDIT_REASONS = ['Moved to another company', 'Wrong or bounced email', 'Missing email found', 'Wrong LinkedIn profile', 'Wrong job title',
  'Wrong headcount or size', 'Wrong industry', 'Wrong location', 'Duplicate person', 'Opt-out not confirmed', 'Managed status not confirmed', 'Other'] as const;
export const EDIT_SOURCES = ['Checked their LinkedIn profile', 'Found with a third-party tool', 'Known from the account team', 'Bounce or reply',
  'Confirmed with the contact', 'Checked the CRM or consent record', 'Other'] as const;

export const TAKEN_OUT = 'Taken out';
export const PUT_BACK = 'Back in the list';

export function fieldLabel(f: CorrectionField): string {
  return (EDIT_FIELDS.find(x => x[0] === f)?.[1]) ?? DECISION_FIELDS[f as keyof typeof DECISION_FIELDS] ?? f;
}

/** The original rule: moving company is major whatever changed; otherwise the field's own weight. Taking someone
 *  out, and confirming an opt-out or managed status, change who is contacted: major. */
export function severityOf(field: CorrectionField, reason: string): CorrectionSeverity {
  if (reason === 'Moved to another company' || field === 'take_out' || field === 'opt_out' || field === 'managed_separately') return 'major';
  return EDIT_FIELDS.find(x => x[0] === field)?.[2] ?? 'minor';
}

/** What is wrong with a value for a field, or null. The checks run again on the row, so free text is allowed. */
export function correctionProblem(field: CorrectionField, to: string): string | null {
  if (to.length > 500) return 'Keep it under 500 characters.';
  if ((field === 'email_verified' || field === 'opt_out' || field === 'managed_separately') && !/^[YN]$/.test(to)) return 'Use Y or N.';
  if (field === 'vertical' && !VERTICAL_CHOICES.includes(to)) return `Choose one of: ${VERTICAL_CHOICES.join(', ')}.`;
  if (field === 'take_out' && to !== TAKEN_OUT && to !== PUT_BACK) return `Use "${TAKEN_OUT}" or "${PUT_BACK}".`;
  return null;
}

export interface Correction { row: number; field: CorrectionField; to: string; reason: string }

export interface Replayed {
  grid: Grid;
  /** Rows a reviewer took out (and didn't put back), with what was wrong. */
  removed: Map<number, string>;
  verticals: VerticalChoice[];
}

const MERGED = /^Merged into row (\d+)$/;

/** Replays corrections, in the order given, onto a copy of the file's grid. */
export function applyCorrections(grid: Grid, corrections: readonly Correction[], opts: { file?: string; sheet?: string; mapping?: ColumnMapping } = {}): Replayed {
  const g: Cell[][] = grid.map(r => (r ? r.slice() : []));
  const removed = new Map<number, string>(), verticals: VerticalChoice[] = [];
  if (!corrections.length) return { grid: g, removed, verticals };
  const h = headerRowOf(g, LEAD_COLUMNS, 'company_name', opts.mapping);
  if (h < 0) return { grid: g, removed, verticals };
  const mapHeader = headerMapper(LEAD_COLUMNS, opts.mapping);
  const cols = g[h].map(c => mapHeader(c).col);
  const colOf = (field: string): number => {
    const i = cols.indexOf(field);
    if (i >= 0) return i;
    // A column the file lacks is added after every column any row uses, so no stray cell is read as its value.
    const at = Math.max(cols.length, ...g.map(r => r.length));
    while (g[h].length < at) g[h].push('');
    g[h][at] = field;
    while (cols.length < at) cols.push('');
    cols[at] = field;
    return at;
  };
  const set = (row: number, field: string, value: string) => {
    const r = g[row - 1];
    if (!r || row - 1 <= h) return;
    const c = colOf(field);
    while (r.length < c) r.push('');
    r[c] = value;
  };

  // 1. A person's own fields, on their row; people taken out or put back; verticals chosen (in order).
  const later: Correction[] = [];
  for (const k of corrections) {
    if (k.field === 'take_out') { if (k.to === PUT_BACK) removed.delete(k.row); else removed.set(k.row, k.reason); }
    else if (k.field === 'vertical') verticals.push({ row: k.row, vertical: k.to, reason: k.reason });
    else if (k.field === 'opt_out' || ACCOUNT_FIELDS.includes(k.field)) later.push(k);
    else set(k.row, k.field, k.to);
  }
  if (!later.length) return { grid: g, removed, verticals };

  // 2. Account details and confirmed opt-outs reach every row they hold for: who is merged into whom, and which
  //    rows make up each account, come from checking the file as corrected so far. Grouping and merging depend on
  //    names, domains, emails and LinkedIn URLs, which these fields never change.
  const r1 = processLeads(g, { file: opts.file, sheet: opts.sheet, mapping: opts.mapping });
  const into = new Map<number, number>(), repeats = new Map<number, number[]>();
  for (const i of r1.issues) {
    const m = i.code === 'D5' && typeof i.row === 'number' ? MERGED.exec(i.outcome) : null;
    if (m) { into.set(i.row as number, +m[1]); repeats.set(+m[1], [...(repeats.get(+m[1]) ?? []), i.row as number]); }
  }
  const contactRow = new Map(r1.contacts.map(c => [c.row, c]));
  const accountById = new Map(r1.accounts.map(a => [a.id, a]));
  const person = (row: number) => contactRow.get(into.get(row) ?? row);
  const withRepeats = (rows: number[]) => rows.flatMap(r => [r, ...(repeats.get(r) ?? [])]);
  for (const k of later) {
    const c = person(k.row);
    const rows = !c ? [k.row] : k.field === 'opt_out' ? withRepeats([c.row]) : withRepeats(accountById.get(c.accountId)?.contactIds ?? [c.row]);
    for (const r of rows) set(r, k.field, k.to);
  }
  return { grid: g, removed, verticals };
}

/** The editable fields of each given row as the file (with its corrections) has them, for the edit form. */
export function rowValues(grid: Grid, rows: Iterable<number>, mapping?: ColumnMapping): Map<number, Record<string, string>> {
  const out = new Map<number, Record<string, string>>();
  const h = headerRowOf(grid, LEAD_COLUMNS, 'company_name', mapping);
  if (h < 0) return out;
  const mapHeader = headerMapper(LEAD_COLUMNS, mapping);
  const cols = (grid[h] ?? []).map(c => mapHeader(c).col);
  const wanted = [...EDIT_FIELDS.map(f => f[0]), 'opt_out', 'managed_separately'];
  const text = (v: Cell | undefined) => (v === null || v === undefined ? '' : v instanceof Date
    ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).trim());
  for (const row of rows) {
    const r = grid[row - 1] ?? [];
    out.set(row, Object.fromEntries(wanted.map(f => { const i = cols.indexOf(f); return [f, i < 0 ? '' : text(r[i])]; })));
  }
  return out;
}
