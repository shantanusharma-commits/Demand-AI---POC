/* ═══════════════ DemandAI engine ═══════════════
   Deterministic rules for Lead discovery (stages 1–5) and Scoring (stages 6–8),
   as written in the Stage_Input_Reasoning_Output sheet and the lead/signal templates.
   No AI runs here: validation, knock-outs, fit and signal weighting are fixed code.
   The two places the spec hands to AI (classification with no lookup match, and the
   wording of the why-now line) are marked below and fall back to rules.

   TypeScript port of demandai-engine.js: same rules, thresholds, messages and output shapes. */
import type {
  Account, AccountTypeKey, Cell, Classification, Contact, DqCode, Fit, FitBreakdownRow, FitLevel, Grid, Issue, LeadList,
  LeadResult, LeadStats, PersonScore, RubricRow, SavedList, SavedScoring, ScoredSignalType, ScoreResult, Severity, Signal,
  SignalResult, SignalTypeConfig, SuggestedContact, TableRecord, TableResult, Tier, VerticalLevel,
} from '../types/demandai';

/* ─── Configuration: starting values, to confirm at kickoff ─── */
export const CONFIG = {
  version: 'Config v1 · starting values',
  pilotCountries: ['Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Indonesia', 'Vietnam'],
  fitFloor: 50,
  // Tiers on the 0–100 score. Score = rank ÷ 2, so these are the stage sheet's 70 / 40 on the rank:
  // every account lands in the same tier as before. To recalibrate with the client.
  tierThresholds: { A: 35, B: 20 },
  // Stacked timing can't exceed twice the strongest tier weight (100 + 50 + 25 + … < 200).
  timingMax: 200,
  verticalMap: [
    { pattern: /refin/i, vertical: 'Refining', level: 'core' },
    { pattern: /petrochem/i, vertical: 'Petrochemicals', level: 'adjacent' },
    { pattern: /gas processing|\blng\b/i, vertical: 'Gas processing', level: 'adjacent' },
  ] as { pattern: RegExp; vertical: string; level: VerticalLevel }[],
  personas: {
    primary: [/instrumentation/i, /\bi&c\b/i, /\be&i\b/i, /automation/i, /control systems?\b/i, /\bdcs\b/i],
    secondary: [/plant manager/i, /operations/i, /procurement/i, /project director/i, /maintenance/i, /reliability/i],
  },
  rubric: [
    { key: 'vertical', label: 'Vertical', weight: 30 },
    { key: 'size', label: 'Company size', weight: 20 },
    { key: 'site', label: 'Site profile', weight: 20 },
    { key: 'relationship', label: 'Relationship', weight: 15 },
    { key: 'accountType', label: 'Account type', weight: 10 },
    { key: 'contacts', label: 'Contact coverage', weight: 5 },
  ] as RubricRow[],
  sizeBands: { revenueAbove: 1e9, revenueIn: 250e6, employeesAbove: 3000, employeesIn: 1000 },
  accountTypes: {
    'owner-operator': { label: 'Owner-operator', level: 100 },
    'epc contractor': { label: 'EPC or integrator', level: 60 },
    'system integrator': { label: 'EPC or integrator', level: 60 },
    'distributor': { label: 'Distributor', level: 20 },
    'other': { label: 'Other', level: 0 },
  } as Record<AccountTypeKey, { label: string; level: number }>,
  consentBases: ['legitimate interest', 'existing customer', 'opted in'],
  signalTypes: {
    'Inquiry or RFQ':                       { code: 'Y2',  tier: 100, strength: 1,    full: 30,  zero: 90,  segment: 'Inquiry' },
    'Installed system near end of support': { code: 'Y1',  tier: 100, strength: 1,    full: 365, zero: 730, segment: 'Modernisation' },
    'Service contract renewal':             { code: 'Y1',  tier: 60,  strength: 1,    full: 90,  zero: 180, segment: 'Service renewal' },
    'Capital project':                      { code: 'Y4',  tier: 100, strength: 0.8,  full: 90,  zero: 365, segment: 'Project' },
    'Leadership change':                    { code: 'C1c', tier: 60,  strength: 0.75, full: 30,  zero: 120, segment: 'Leadership' },
    'Webinar attended':                     { code: 'C1w', tier: 60,  strength: 1,    full: 30,  zero: 180, segment: 'Engagement' },
    'Webinar registered':                   { code: 'C1w', tier: 30,  strength: 1,    full: 30,  zero: 120, segment: 'Engagement' },
    'Content download':                     { code: 'C1w', tier: 60,  strength: 1,    full: 30,  zero: 180, segment: 'Engagement' },
    'Email clicked':                        { code: 'C1x', tier: 30,  strength: 1,    full: 14,  zero: 60,  segment: 'Engagement' },
    'Installed system (current)':           { knockout: true },
    'Newsletter sign-up':                   { reject: 'D1' },
  } as Record<string, SignalTypeConfig>,
};

export const CODES: Record<DqCode, string> = {
  D1: 'Wrong fit',
  D2: 'Stale',
  D3: 'Incomplete',
  D4: "Can't be matched",
  D5: 'Duplicate',
};

export const LEAD_COLUMNS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
  'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
  'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
  'capacity_unit', 'consent_basis', 'opt_out', 'owner_email'];
export const LEAD_REQUIRED = ['first_name', 'last_name', 'job_title', 'company_name', 'company_domain', 'country', 'industry',
  'existing_customer', 'managed_separately', 'consent_basis', 'opt_out', 'owner_email'];
export const SIGNAL_COLUMNS = ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product'];
export const SIGNAL_REQUIRED = ['company_name', 'signal_type', 'event_date', 'detail'];

/* ─── Small helpers ─── */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LINKEDIN_RE = /linkedin\.com\/(in|pub)\/[^\s/]+/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

function clean(v: unknown): string { return v === undefined || v === null ? '' : String(v).trim(); }
function normKey(s: unknown): string { return clean(s).toLowerCase().replace(/\s+/g, ' '); }
function normHeader(h: Cell): string { return clean(h).toLowerCase().replace(/\*/g, '').trim().replace(/[\s-]+/g, '_'); }
function normEmail(e: unknown): string { return clean(e).toLowerCase(); }
function normLinkedIn(u: unknown): string {
  return clean(u).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
}
export function round1(n: number): number { return Math.round(n * 10) / 10; }

function parseIsoDate(s: unknown): number | null {
  const m = DATE_RE.exec(clean(s));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 ? t : null;
}
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(((parseIsoDate(toIso) as number) - (parseIsoDate(fromIso) as number)) / DAY_MS);
}
function yesNo(v: unknown): 'Y' | 'N' | '' | null {
  const s = clean(v).toLowerCase();
  if (s === 'y' || s === 'yes') return 'Y';
  if (s === 'n' || s === 'no') return 'N';
  return s === '' ? '' : null; // null = present but not Y/N
}

/* ─── File reading: CSV text or a SheetJS-style array of rows ─── */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function toCSV(rows: unknown[][]): string {
  return rows.map(r => r.map(v => {
    const s = clean(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}

function cellToString(v: Cell): string {
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return clean(v);
}

interface ReadTableOptions { file: string; sheet: string; columns: string[]; required: string[]; anchor: string }

/* Finds the header row (the template has a title row above it and a format-hints row below it),
   then returns one record per data row with its real spreadsheet row number. */
export function readTable(grid: Grid, { file, sheet, columns, required, anchor }: ReadTableOptions): TableResult {
  const issues: Issue[] = [];
  const at = (row: Issue['row'], field: string, issue: string, outcome: string, code: Issue['code'], fix: string, severity: Severity = 'flag') =>
    issues.push({ file, sheet, row, field, issue, outcome, code, fix, severity });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const hs = (grid[i] || []).map(normHeader);
    if (hs.includes(anchor) && hs.filter(h => columns.includes(h)).length >= 2) { headerIdx = i; break; }
  }
  if (headerIdx < 0) {
    at('—', '—', `Couldn't find the header row (looked for a row containing "${anchor}")`, 'File not processed', 'D3',
      'Use the template: column names exactly as in the template, in the first rows of the sheet', 'stop');
    return { records: [], issues, headers: [] };
  }
  const headers = grid[headerIdx].map(normHeader);
  const missing = required.filter(c => !headers.includes(c));
  missing.forEach(c => at(headerIdx + 1, c, `Required column "${c}" is missing`,
    c === anchor ? 'File not processed' : 'Every row is treated as having this field blank', 'D3',
    `Add the "${c}" column, named exactly as in the template`, c === anchor ? 'stop' : 'flag'));
  headers.forEach((h, i) => {
    if (h && !columns.includes(h)) at(headerIdx + 1, clean(grid[headerIdx][i]), `Column "${clean(grid[headerIdx][i])}" isn't in the template`,
      'Ignored', '—', 'Remove it, or rename it to a template column if it was meant to be one', 'info');
  });
  if (missing.includes(anchor)) return { records: [], issues, headers };
  const records: TableRecord[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const raw = grid[i] || [];
    if (!raw.some(v => cellToString(v) !== '')) continue;
    const rec = { __row: i + 1 } as TableRecord;
    headers.forEach((h, j) => { if (columns.includes(h)) (rec as Record<string, string>)[h] = cellToString(raw[j]); });
    // The template's third row holds format hints ("Text*", "Email* (or LinkedIn URL)"): not data.
    const starred = Object.values(rec).filter(v => typeof v === 'string' && /\*/.test(v)).length;
    if (i === headerIdx + 1 && starred >= 2) {
      at(i + 1, '—', "Row holds the template's format hints, not data", 'Skipped', '—', 'Nothing to fix', 'info');
      continue;
    }
    records.push(rec);
  }
  return { records, issues, headers };
}

/* ─── Stages 1–5: lead file → screened list ─── */
function parseNumber(raw: unknown): { value: number | null; reformatted?: boolean; invalid?: boolean } {
  const s = clean(raw);
  if (!s) return { value: null };
  if (/^\d+(\.\d+)?$/.test(s)) return { value: Number(s) };
  const stripped = s.replace(/[,\s$€£]|usd/gi, '');
  if (/^\d+(\.\d+)?$/.test(stripped)) return { value: Number(stripped), reformatted: true };
  return { value: null, invalid: true };
}

export function personaOf(title: unknown): Contact['persona'] {
  const t = clean(title);
  if (CONFIG.personas.primary.some(re => re.test(t))) return 'Primary';
  if (CONFIG.personas.secondary.some(re => re.test(t))) return 'Secondary';
  return 'None';
}

export function processLeads(grid: Grid, { file = 'lead file', sheet = 'Sheet1' }: { file?: string; sheet?: string } = {}): LeadResult {
  const table = readTable(grid, { file, sheet, columns: LEAD_COLUMNS, required: LEAD_REQUIRED, anchor: 'company_name' });
  const issues = table.issues.slice();
  const at = (row: Issue['row'], field: string, issue: string, outcome: string, code: Issue['code'], fix: string, severity: Severity = 'flag') =>
    issues.push({ file, sheet, row, field, issue, outcome, code, fix, severity });
  const missingCols = new Set(LEAD_REQUIRED.filter(c => !table.headers.includes(c)));

  const contacts: Contact[] = [];
  const byEmail = new Map<string, Contact>(), byLinkedIn = new Map<string, Contact>();
  let notLoaded = 0, merged = 0;

  for (const r of table.records) {
    const row = r.__row;
    const req = (f: string, issue: string, outcome: string, fix: string, severity: Severity = 'flag'): boolean => {
      if (!clean(r[f]) && !missingCols.has(f)) { at(row, f, issue, outcome, 'D3', fix, severity); return true; }
      return false;
    };
    if (req('company_name', 'Company name is missing', "Row not loaded: it can't be grouped into an account",
      'Add the company name, written the same way as on the other rows for this company', 'stop')) { notLoaded++; continue; }

    // Built up field by field below, in the same order as the original engine (the order shows in saved JSON).
    const c = {
      row, firstName: clean(r.first_name), lastName: clean(r.last_name), jobTitle: clean(r.job_title),
      seniority: clean(r.seniority), company: clean(r.company_name), companyKey: normKey(r.company_name),
      domain: clean(r.company_domain).toLowerCase(), country: clean(r.country), city: clean(r.city),
      industry: clean(r.industry), siteName: clean(r.site_name), siteProcess: clean(r.site_process_type),
      siteCapacity: clean(r.site_capacity), capacityUnit: clean(r.capacity_unit), owner: clean(r.owner_email).toLowerCase(),
      email: '', emailRaw: clean(r.email), emailVerified: false, linkedin: '', linkedinRaw: clean(r.linkedin_url),
      flags: [],
    } as unknown as Contact;
    c.name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '(no name)';

    req('first_name', 'First name is missing', 'Loaded; the draft greeting will need editing', 'Add the first name');
    req('last_name', 'Last name is missing', 'Loaded', 'Add the last name');
    req('job_title', 'Job title is missing', 'Loaded; persona set to none', 'Add the job title');
    c.persona = personaOf(c.jobTitle);

    // Domain
    if (!req('company_domain', 'Company domain is missing', 'Loaded; signals can only be matched by company name', 'Add the website domain, e.g. company.com')
      && c.domain && (/\s|https?:|\//.test(c.domain) || !c.domain.includes('.'))) {
      at(row, 'company_domain', `Domain "${c.domain}" isn't in the form company.com`, 'Loaded; domain not used for matching', 'D3', 'Write the bare domain, e.g. company.com');
    }

    // Email and verification
    if (c.emailRaw) {
      if (EMAIL_RE.test(c.emailRaw)) {
        c.email = normEmail(c.emailRaw);
        const v = yesNo(r.email_verified);
        if (v === null) at(row, 'email_verified', `"${clean(r.email_verified)}" isn't Y or N`, 'Email treated as not verified, so not used as a channel', 'D3', 'Use Y or N');
        else if (v !== 'Y') at(row, 'email_verified', 'Email not verified', 'Email not used as a channel', '—', 'Verify the address and set email_verified to Y', 'info');
        c.emailVerified = v === 'Y';
      } else {
        at(row, 'email', `Email "${c.emailRaw}" is malformed`, c.linkedinRaw ? 'Email not used; LinkedIn only' : 'Email not used', 'D3', 'Correct the address');
      }
    }
    // LinkedIn
    if (c.linkedinRaw) {
      if (LINKEDIN_RE.test(c.linkedinRaw)) c.linkedin = normLinkedIn(c.linkedinRaw);
      else at(row, 'linkedin_url', `LinkedIn URL "${c.linkedinRaw}" isn't a profile URL`, 'LinkedIn not used', 'D3', 'Use the full profile URL, e.g. https://www.linkedin.com/in/name');
    }
    if (!c.emailRaw && !c.linkedinRaw) {
      at(row, 'email / linkedin_url', 'No email and no LinkedIn URL', 'Kept on the account, not contactable', 'D3', 'Add a work email or a LinkedIn URL');
    } else if (!c.emailRaw && c.linkedin) {
      at(row, 'email', 'No email', 'LinkedIn only', '—', 'Add a verified work email if one is held', 'info');
    } else if (!c.linkedinRaw && c.email) {
      at(row, 'linkedin_url', 'No LinkedIn URL', c.emailVerified ? 'Email only' : 'No usable channel until the email is verified', '—', 'Add the LinkedIn profile URL if one is held', 'info');
    }

    // Duplicates (same email or LinkedIn URL): merged into the first row, blanks filled from the repeat
    const dupOf = (c.email && byEmail.get(c.email)) || (c.linkedin && byLinkedIn.get(c.linkedin));
    if (dupOf) {
      at(row, c.email && byEmail.get(c.email) ? 'email' : 'linkedin_url', `Duplicate of row ${dupOf.row} (${dupOf.name})`,
        `Merged into row ${dupOf.row}`, 'D5', 'Remove the repeated row');
      const from = c as unknown as Record<string, unknown>, into = dupOf as unknown as Record<string, unknown>;
      for (const k of Object.keys(from)) if (k !== 'row' && k !== 'flags' && !into[k] && from[k]) into[k] = from[k];
      merged++;
      continue;
    }

    // Company-level fields (validated per row; the account uses its first row)
    req('country', 'Country is missing', 'The account fails the region check', 'Add the country');
    req('industry', 'Industry is missing', 'Vertical set to other, held for review', 'Add the industry as held');
    const rev = parseNumber(r.annual_revenue_usd), emp = parseNumber(r.employee_count);
    ([['annual_revenue_usd', rev], ['employee_count', emp]] as const).forEach(([f, n]) => {
      if (n.reformatted) at(row, f, `"${clean(r[f])}" has commas or a currency symbol`, `Read as ${n.value}`, 'D3', 'Write numbers without commas or currency symbols');
      if (n.invalid) at(row, f, `"${clean(r[f])}" isn't a number`, 'Treated as not provided', 'D3', 'Write a plain number, e.g. 2400000000');
    });
    c.revenue = rev.value; c.employees = emp.value;
    if (c.revenue === null && c.employees === null && !rev.invalid && !emp.invalid) {
      at(row, 'annual_revenue_usd / employee_count', 'No company size', 'Company size scores 0 in fit', 'D3', 'Add revenue, or employees if revenue is unknown');
    }

    const at0 = clean(r.account_type).toLowerCase();
    if (!at0) { c.accountType = 'other'; at(row, 'account_type', 'Account type is blank', 'Scores 0 for account type', '—', 'Choose from the list', 'info'); }
    else if (CONFIG.accountTypes[at0 as AccountTypeKey]) c.accountType = at0 as AccountTypeKey;
    else { c.accountType = 'other'; at(row, 'account_type', `"${clean(r.account_type)}" isn't on the list`, 'Treated as Other', 'D3', 'Choose Owner-operator, EPC contractor, System integrator, Distributor or Other'); }

    const yn = (f: string, blankOutcome: string): 'Y' | 'N' | '' => {
      if (missingCols.has(f)) return '';
      const v = yesNo(r[f]);
      if (v === null) { at(row, f, `"${clean(r[f])}" isn't Y or N`, blankOutcome, 'D3', 'Use Y or N'); return ''; }
      if (v === '') at(row, f, `${f} is blank`, blankOutcome, 'D3', 'Use Y or N');
      return v;
    };
    c.existingCustomer = yn('existing_customer', 'Treated as N (no relationship); confirm') === 'Y';
    c.managedSeparately = yn('managed_separately', 'Treated as N; confirm before any outreach') === 'Y';
    const opt = yn('opt_out', "Can't confirm the contact hasn't opted out: not contactable");
    c.optOut = opt === 'Y';
    c.optOutUnknown = opt === '';
    if (c.optOut) at(row, 'opt_out', 'Opted out', 'Suppressed: never contacted', '—', 'Nothing to fix', 'info');

    const consent = clean(r.consent_basis);
    c.consent = consent;
    c.consentOk = CONFIG.consentBases.includes(consent.toLowerCase());
    if (!consent) { if (!missingCols.has('consent_basis')) at(row, 'consent_basis', 'No consent basis', 'Not contactable', 'D3', 'Add legitimate interest, existing customer or opted in'); }
    else if (!c.consentOk) at(row, 'consent_basis', `"${consent}" isn't a recognised basis`, 'Not contactable until confirmed', 'D3', 'Use legitimate interest, existing customer or opted in');

    if (!c.owner) { if (!missingCols.has('owner_email')) at(row, 'owner_email', 'No owner rep', 'Only the sales manager sees this account', 'D3', "Add the assigned rep's email"); }
    else if (!EMAIL_RE.test(c.owner)) at(row, 'owner_email', `Owner "${c.owner}" isn't an email`, 'Only the sales manager sees this account', 'D3', "Use the rep's work email");

    contacts.push(c);
    if (c.email) byEmail.set(c.email, c);
    if (c.linkedin) byLinkedIn.set(c.linkedin, c);
  }

  // Reachability and contactability
  for (const c of contacts) {
    const emailOk = !!c.email && c.emailVerified, liOk = !!c.linkedin;
    c.reachableBy = emailOk && liOk ? 'email and LinkedIn' : emailOk ? 'email' : liOk ? 'LinkedIn' : 'none';
    c.contactable = c.reachableBy !== 'none' && c.consentOk && !c.optOut && !c.optOutUnknown;
  }

  const accounts = buildAccounts(contacts, issues, { file, sheet });
  const stats: LeadStats = {
    rowsRead: table.records.length, notLoaded, merged, contacts: contacts.length,
    accounts: accounts.length, accountsPass: accounts.filter(a => !a.excluded).length,
    inFinalList: contacts.filter(c => c.status === 'In the final list').length,
    issues: issues.length,
    issuesBySeverity: (['stop', 'flag', 'info'] as Severity[]).reduce((o, s) => (o[s] = issues.filter(i => i.severity === s).length, o), {} as Record<Severity, number>),
  };
  return { contacts, accounts, issues, stats };
}

/* Stage 3 classification and stage 4 knock-outs, per account */
export function classify(industry: string, siteProcess: string): Classification {
  const hit = (s: string) => s ? CONFIG.verticalMap.find(m => m.pattern.test(s)) : null;
  const a = hit(industry), b = hit(siteProcess);
  if (a && b && a.vertical === b.vertical) return { vertical: a.vertical, level: a.level, confidence: 'high', reason: `Industry "${industry}" and site process "${siteProcess}" both map to ${a.vertical}` };
  if (a && b) return { vertical: a.vertical, level: a.level, confidence: 'medium', reason: `Industry maps to ${a.vertical}, site process to ${b.vertical}; industry used` };
  if (a || b) {
    const m = (a || b)!, src = a ? `industry "${industry}"` : `site process "${siteProcess}"`;
    return { vertical: m.vertical, level: m.level, confidence: 'medium', reason: `From the ${src} only` };
  }
  // Spec: with no lookup match, the AI classifier chooses. Not connected in this prototype.
  return { vertical: 'Other', level: 'other', confidence: 'low', needsReview: true,
    reason: `"${industry || '—'}" has no match in the mapping table. The AI classifier would decide here; it isn't connected yet, so this is held as other for review` };
}

function buildAccounts(contacts: Contact[], issues: Issue[], { file, sheet }: { file: string; sheet: string }): Account[] {
  const map = new Map<string, Contact[]>();
  for (const c of contacts) {
    if (!map.has(c.companyKey)) map.set(c.companyKey, []);
    map.get(c.companyKey)!.push(c);
  }
  const accounts: Account[] = [];
  for (const [key, cs] of map) {
    const f = cs[0];
    // Company details should repeat identically on every contact row; say so when they don't.
    const fields: [keyof Contact, string][] = [['country', 'country'], ['industry', 'industry'], ['revenue', 'annual_revenue_usd'], ['employees', 'employee_count'],
      ['accountType', 'account_type'], ['existingCustomer', 'existing_customer'], ['managedSeparately', 'managed_separately']];
    for (const [k, col] of fields) {
      const other = cs.find(c => String(c[k]) !== String(f[k]));
      if (other) issues.push({ file, sheet, row: other.row, field: col, issue: `Differs from row ${f.row} for ${f.company}`,
        outcome: `Row ${f.row}'s value used for the account`, code: 'D3', fix: 'Repeat the same company details on every contact row', severity: 'flag' });
    }
    const cls = classify(f.industry, f.siteProcess);
    const a = {
      id: 'acc-' + accounts.length, key, name: f.company, domain: f.domain, country: f.country, city: f.city,
      industry: f.industry, revenue: f.revenue, employees: f.employees, accountType: f.accountType,
      existingCustomer: f.existingCustomer, managedSeparately: f.managedSeparately,
      siteName: f.siteName, siteProcess: f.siteProcess, siteCapacity: f.siteCapacity, capacityUnit: f.capacityUnit,
      owner: f.owner, vertical: cls.vertical, verticalLevel: cls.level, confidence: cls.confidence,
      classReason: cls.reason, needsReview: !!cls.needsReview, contactIds: cs.map(c => c.row),
    } as Account;
    // Stage 4: yes-or-no rules, in order. The installed-base rule needs the signal file, so it runs in Scoring.
    const inRegion = CONFIG.pilotCountries.some(p => p.toLowerCase() === a.country.toLowerCase());
    a.checks = [
      { rule: 'In the pilot region', pass: inRegion, why: inRegion ? a.country : `Outside the pilot region (${a.country || 'no country'})` },
      { rule: 'Not managed separately', pass: !a.managedSeparately, why: a.managedSeparately ? 'Managed separately by Client' : 'Not managed separately' },
      { rule: 'Pilot product not installed at the site', pass: null, why: 'Checked in Scoring, from the installed-base rows of the signal file' },
      { rule: 'At least one contact left after suppression', pass: cs.some(c => !c.optOut), why: cs.some(c => !c.optOut) ? `${cs.filter(c => !c.optOut).length} contact(s) not opted out` : 'No contactable contacts after suppression' },
    ];
    const failed = a.checks.find(k => k.pass === false);
    a.excluded = !!failed;
    a.excludedReason = failed ? failed.why : '';
    accounts.push(a);
    for (const c of cs) {
      c.accountId = a.id;
      if (a.excluded) c.status = `Not in the list: account excluded (${a.excludedReason})`;
      else if (c.optOut) c.status = 'Not in the list: opted out';
      else if (!c.contactable) c.status = `In the list, not contactable (${notContactableWhy(c)})`;
      else c.status = 'In the final list';
    }
  }
  return accounts;
}

function notContactableWhy(c: Contact): string {
  if (c.reachableBy === 'none') return 'no usable email or LinkedIn';
  if (!c.consentOk) return 'no consent basis';
  if (c.optOutUnknown) return 'opt-out not confirmed';
  return 'see issues';
}

/* ─── Stage 6: weighted fit ─── */
export function fitFor(account: Account, contacts: Contact[]): Fit {
  const b = CONFIG.sizeBands;
  let size: number, sizeWhy: string;
  if (account.revenue !== null && account.revenue !== undefined) {
    size = account.revenue >= b.revenueAbove ? 100 : account.revenue >= b.revenueIn ? 70 : 20;
    sizeWhy = `Revenue USD ${fmtMoney(account.revenue)}`;
  } else if (account.employees !== null && account.employees !== undefined) {
    size = account.employees >= b.employeesAbove ? 100 : account.employees >= b.employeesIn ? 70 : 20;
    sizeWhy = `${account.employees.toLocaleString('en-US')} employees (no revenue given)`;
  } else { size = 0; sizeWhy = 'No size given'; }
  const sizeLbl = size === 100 ? 'Above target' : size === 70 ? 'In target' : size === 20 ? 'Below target' : 'Not provided';

  const siteHit = account.siteProcess ? CONFIG.verticalMap.find(m => m.pattern.test(account.siteProcess)) : null;
  const site = !account.siteProcess ? 30 : siteHit && siteHit.level === 'core' ? 100 : 50;
  const siteLbl = site === 100 ? 'Suits the product' : site === 50 ? 'Partly' : 'Unknown';
  const siteWhy = account.siteProcess
    ? [account.siteName, account.siteProcess, account.siteCapacity && `${Number(account.siteCapacity).toLocaleString('en-US')} ${account.capacityUnit}`].filter(Boolean).join(' · ')
    : 'No site given';

  const live = contacts.filter(c => !c.optOut);
  const coverage = live.some(c => c.persona === 'Primary') ? 100 : live.length ? 40 : 0;
  const at = CONFIG.accountTypes[account.accountType] || CONFIG.accountTypes.other;
  const vLevel = ({ core: 100, adjacent: 50, other: 0 } as Record<VerticalLevel, number>)[account.verticalLevel];

  const levels: Record<RubricRow['key'], FitLevel> = {
    vertical: { level: vLevel, levelLabel: `${account.vertical} (${account.verticalLevel})`, why: account.classReason },
    size: { level: size, levelLabel: sizeLbl, why: sizeWhy },
    site: { level: site, levelLabel: siteLbl, why: siteWhy },
    relationship: { level: account.existingCustomer ? 100 : 40, levelLabel: account.existingCustomer ? 'Existing customer' : 'None', why: account.existingCustomer ? 'existing_customer = Y' : 'existing_customer = N' },
    accountType: { level: at.level, levelLabel: at.label, why: account.accountType },
    contacts: { level: coverage, levelLabel: coverage === 100 ? 'Buying role present' : coverage === 40 ? 'Other roles only' : 'None',
      why: live.filter(c => c.persona === 'Primary').map(c => c.jobTitle).join(', ') || live.map(c => c.jobTitle).join(', ') || 'No contacts' },
  };
  const breakdown: FitBreakdownRow[] = CONFIG.rubric.map(r => ({ ...r, ...levels[r.key], points: levels[r.key].level * r.weight / 100 }));
  const fit = round1(breakdown.reduce((s, x) => s + x.points, 0));
  return { fit, breakdown, belowFloor: fit < CONFIG.fitFloor };
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 ? 1 : 0) + 'bn';
  if (n >= 1e6) return Math.round(n / 1e6) + 'm';
  return n.toLocaleString('en-US');
}

/* ─── Stage 7: signal intake and qualification, per person ─── */
export function decayFactor(type: Pick<SignalTypeConfig, 'full' | 'zero'>, age: number): number {
  const full = type.full as number, zero = type.zero as number;
  if (age <= full) return 1;
  if (age >= zero) return 0;
  return (zero - age) / (zero - full);
}

export function processSignals(grid: Grid, list: LeadList, { file = 'signal file', sheet = 'Sheet1', asOf }: { file?: string; sheet?: string; asOf?: string } = {}): SignalResult {
  const table = readTable(grid, { file, sheet, columns: SIGNAL_COLUMNS, required: SIGNAL_REQUIRED, anchor: 'signal_type' });
  const issues = table.issues.slice();
  const accountsByKey = new Map(list.accounts.map(a => [a.key, a]));
  const contactsByAcc = new Map<string, Contact[]>();
  for (const c of list.contacts) {
    if (!contactsByAcc.has(c.accountId)) contactsByAcc.set(c.accountId, []);
    contactsByAcc.get(c.accountId)!.push(c);
  }
  const knockouts = new Map<string, string>(); // accountId -> reason
  const seen = new Map<string, string>();
  const signals: Signal[] = [];
  const suggested: SuggestedContact[] = [];
  let n = 0;

  for (const r of table.records) {
    n++;
    const s: Signal = {
      id: 'SIG-' + String(n).padStart(2, '0'), row: r.__row, company: clean(r.company_name),
      personRef: clean(r.contact_email_or_linkedin), type: clean(r.signal_type), date: clean(r.event_date),
      detail: clean(r.detail), source: clean(r.source), product: clean(r.product),
      status: '', code: '', reason: '', assigned: '', personName: '', accountId: null, contactRow: null,
    };
    signals.push(s);
    const reject = (code: DqCode, reason: string, field: string, fix: string) => {
      s.status = 'Rejected'; s.code = code; s.reason = reason;
      issues.push({ file, sheet, row: s.row, field, issue: reason, outcome: `Rejected (${code} ${CODES[code]})`, code, fix, severity: 'flag' });
    };

    // 1. Match to the account by company, then to the person by email or LinkedIn URL
    const acc = accountsByKey.get(normKey(s.company));
    if (!s.company) { reject('D3', 'No company name', 'company_name', 'Add the company name as in the lead file'); continue; }
    if (!acc) { reject('D4', 'Company is not in the target universe', 'company_name', 'Use the company name exactly as in the lead file, or add the company to the lead file'); continue; }
    s.accountId = acc.id;
    const cs = contactsByAcc.get(acc.id) || [];
    const typeCfg = CONFIG.signalTypes[s.type] || CONFIG.signalTypes[Object.keys(CONFIG.signalTypes).find(k => k.toLowerCase() === s.type.toLowerCase()) as string];
    if (typeCfg) s.type = Object.keys(CONFIG.signalTypes).find(k => CONFIG.signalTypes[k] === typeCfg) as string;

    // Installed system (current) is company-wide: it knocks the account out, whoever is named.
    if (typeCfg && typeCfg.knockout) {
      s.status = 'Used for a knock-out'; s.reason = 'Current pilot product installed: account excluded';
      knockouts.set(acc.id, `Pilot product already installed at the site${s.product ? ` (${s.product})` : ''}`);
      continue;
    }

    let person: Contact | null | undefined = null;
    if (s.personRef) {
      const ref = s.personRef.includes('@') ? normEmail(s.personRef) : normLinkedIn(s.personRef);
      person = cs.find(c => (c.email && c.email === ref) || (c.linkedin && c.linkedin === ref) || normEmail(c.emailRaw) === ref);
      if (!person) {
        reject('D4', `Person ${s.personRef} is not in the lead file for this account (sent back as a suggested new contact)`, 'contact_email_or_linkedin', 'Add this person to the lead file, or correct the email or LinkedIn URL');
        suggested.push({ company: acc.name, person: s.personRef, signal: s.type, row: s.row });
        continue;
      }
      s.assigned = 'Named in the file';
    } else {
      const live = cs.filter(c => !c.optOut);
      person = live.find(c => c.persona === 'Primary') || live[0];
      if (!person) { reject('D4', 'No person named and no contact left at this account', 'contact_email_or_linkedin', 'Name the person this signal concerns'); continue; }
      s.assigned = person.persona === 'Primary' ? 'Auto-assigned to the primary-persona contact' : 'Auto-assigned (no primary-persona contact)';
      issues.push({ file, sheet, row: s.row, field: 'contact_email_or_linkedin', issue: 'No person named',
        outcome: `Attached to ${person.name} (${person.jobTitle}), flagged as auto-assigned`, code: '—', fix: 'Name the contact responsible for this event', severity: 'info' });
    }
    s.personName = person.name; s.contactRow = person.row;

    // 2. Date
    if (!s.date) { reject('D3', 'No event date', 'event_date', 'Add the date it happened, as YYYY-MM-DD'); continue; }
    if (parseIsoDate(s.date) === null) { reject('D3', `Event date "${s.date}" isn't YYYY-MM-DD`, 'event_date', 'Write the date as YYYY-MM-DD'); continue; }
    s.age = daysBetween(s.date, asOf as string);
    if (s.age < 0) { reject('D3', `Event date ${s.date} is after the scoring date ${asOf}`, 'event_date', 'Check the date'); continue; }

    // 3. Type
    if (!typeCfg) { reject('D3', `Signal type "${s.type}" isn't on the list`, 'signal_type', 'Choose the type from the list in the template'); continue; }
    if (typeCfg.reject) { reject(typeCfg.reject, "Doesn't predict buying the pilot product", 'signal_type', 'Nothing to fix: this type is not scored'); continue; }
    const t = typeCfg as ScoredSignalType;

    // 4. Duplicate
    const dupKey = [acc.id, person.row, s.type, s.date].join('|');
    if (seen.has(dupKey)) { reject('D5', `Same event already recorded (${seen.get(dupKey)})`, 'signal_type', 'Remove the repeated row'); continue; }
    seen.set(dupKey, s.id);

    // 5. Stale
    if (s.age >= t.zero) { reject('D2', `${s.age} days old; this signal type counts for ${t.zero} days`, 'event_date', 'Nothing to fix: past its window'); continue; }

    // 6. Qualified: weight = tier weight × strength × decay
    s.status = 'Qualified';
    s.code = t.code; s.tier = t.tier; s.strength = t.strength; s.segment = t.segment;
    s.decay = decayFactor(t, s.age);
    s.weight = s.tier * s.strength * s.decay;
    s.window = `full for ${t.full} days, zero at ${t.zero}`;
    if (!s.detail) issues.push({ file, sheet, row: s.row, field: 'detail', issue: 'No detail', outcome: 'Qualified; the why-now line can only name the type', code: '—', fix: 'Say what happened', severity: 'info' });
  }
  return { signals, issues, knockouts, suggested, rowsRead: table.records.length };
}

/* ─── Stage 8: timing, rank and reasoning ─── */
export function stack(weights: number[]): number {
  return weights.slice().sort((a, b) => b - a).reduce((sum, w, i) => sum + w * Math.pow(0.5, i), 0);
}

export function tierFor(rank: number, hasSignal: boolean): Tier {
  if (!hasSignal) return 'Watch list';
  if (rank >= CONFIG.tierThresholds.A) return 'A';
  if (rank >= CONFIG.tierThresholds.B) return 'B';
  return 'C';
}

export function scoreList(list: LeadList, signalResult: Pick<SignalResult, 'signals' | 'knockouts'>): ScoreResult[] {
  const results: ScoreResult[] = [];
  const contactsByAcc = new Map<string, Contact[]>();
  for (const c of list.contacts) {
    if (!contactsByAcc.has(c.accountId)) contactsByAcc.set(c.accountId, []);
    contactsByAcc.get(c.accountId)!.push(c);
  }
  for (const a of list.accounts) {
    const cs = contactsByAcc.get(a.id) || [];
    const ko = signalResult.knockouts.get(a.id);
    const res: ScoreResult = { account: a, contacts: cs, excluded: a.excluded || !!ko, excludedReason: a.excludedReason || ko || '' };
    if (!res.excluded) Object.assign(res, fitFor(a, cs));
    const own = signalResult.signals.filter(s => s.accountId === a.id && s.status === 'Qualified');
    if (res.excluded || res.belowFloor) {
      own.forEach(s => { s.status = 'Not used'; s.reason = res.excluded ? `Qualified, but the account is excluded (${res.excludedReason})` : 'Qualified, but the account is below the fit floor'; });
      res.tier = res.excluded ? 'Excluded' : 'Below fit floor';
      results.push(res);
      continue;
    }
    const fit = res.fit as number;
    const weightOf = (s: Signal) => s.weight as number;
    // Person signal score, then account timing over everyone's signals
    const people: PersonScore[] = cs.filter(c => !c.optOut).map(c => {
      const sigs = own.filter(s => s.contactRow === c.row).sort((x, y) => weightOf(y) - weightOf(x));
      const raw = stack(sigs.map(weightOf));
      return { contact: c, signals: sigs, raw: round1(raw), score: round1(raw / CONFIG.timingMax * 100) };
    }).sort((x, y) => y.raw - x.raw || (x.contact.persona === 'Primary' ? -1 : 0) - (y.contact.persona === 'Primary' ? -1 : 0));
    res.people = people;
    // Everything on 0–100: timing as a share of its maximum, score = fit × timing ÷ 100.
    // The stage sheet's rank (fit ÷ 100 × raw timing, which reaches 200) is kept for traceability.
    const rawTiming = stack(own.map(weightOf));
    res.timingRaw = round1(rawTiming);
    res.rank = round1(fit / 100 * rawTiming);
    res.timing = round1(rawTiming / CONFIG.timingMax * 100);
    res.score = round1(fit * (rawTiming / CONFIG.timingMax * 100) / 100);
    res.signalCount = own.length;
    res.tier = tierFor(res.score, own.length > 0);
    // Each prospect scored on their own evidence: account fit × their timing, with their own why-now.
    people.forEach(p => {
      p.timing = p.score;
      p.final = round1(fit * p.timing / 100);
      p.tier = tierFor(p.final, p.signals.length > 0);
      p.whyNow = p.signals.slice(0, 2).map((s, i) => `${i ? 'also ' : ''}${lowerFirst(s.detail || s.type)}`).join('; ');
    });
    const hasPrimary = cs.some(c => !c.optOut && c.persona === 'Primary');
    res.confidence = !hasPrimary ? 'low' : own.length >= 2 ? 'high' : 'medium';
    res.confidenceWhy = !hasPrimary ? 'No contact in the primary persona' : own.length >= 2 ? `${own.length} qualified signals and a primary-persona contact` : 'Only one qualified signal';
    // Why-now line: the spec has AI word it from the evidence; until that's connected it's filled from a template.
    const top = own.slice().sort((x, y) => weightOf(y) - weightOf(x)).slice(0, 2);
    res.whyNow = top.map((s, i) => `${i ? 'also ' : ''}${s.personName}: ${lowerFirst(s.detail || s.type)}`).join('; ');
    res.whyNowSources = top.map(s => `${s.source || 'no source'}, ${s.date}`);
    res.segment = top[0] ? top[0].segment : '';
    results.push(res);
  }
  const order: Record<Tier, number> = { A: 0, B: 1, C: 2, 'Watch list': 3, 'Below fit floor': 4, Excluded: 5 };
  results.sort((x, y) => order[x.tier as Tier] - order[y.tier as Tier] || (y.score || 0) - (x.score || 0) || (y.fit || 0) - (x.fit || 0));
  return results;
}

function lowerFirst(s: string): string { return s && /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; }

/* ─── Lists hand-off between Prospecting and Scoring (browser only) ─── */
const LIST_KEY = 'demandai_lists_v1';
let memoryLists: SavedList[] | null = null;
export function loadLists(): SavedList[] {
  try { return JSON.parse(localStorage.getItem(LIST_KEY) || '[]'); }
  catch (e) { return memoryLists || []; }
}
function saveLists(lists: SavedList[]): boolean {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(lists)); return true; }
  catch (e) { memoryLists = lists; return false; }
}
export function saveList(list: SavedList): boolean {
  const lists = loadLists().filter(l => l.id !== list.id);
  lists.unshift(list);
  return saveLists(lists);
}
export function getList(id: string): SavedList | null { return loadLists().find(l => l.id === id) || null; }
export function deleteList(id: string): boolean { return saveLists(loadLists().filter(l => l.id !== id)); }

const SCORING_KEY = 'demandai_scorings_v1';
export function loadScorings(): SavedScoring[] { try { return JSON.parse(localStorage.getItem(SCORING_KEY) || '[]'); } catch (e) { return []; } }
function saveScorings(all: SavedScoring[]): boolean { try { localStorage.setItem(SCORING_KEY, JSON.stringify(all)); return true; } catch (e) { return false; } }
export function saveScoring(run: SavedScoring): boolean { const all = loadScorings().filter(r => r.id !== run.id); all.unshift(run); return saveScorings(all); }
export function getScoring(id: string): SavedScoring | null { return loadScorings().find(r => r.id === id) || null; }
export function deleteScoring(id: string): boolean { return saveScorings(loadScorings().filter(r => r.id !== id)); }

/** The engine as one object, the shape the original exposed as window.DemandAI. */
export const DemandAI = {
  CONFIG, CODES, LEAD_COLUMNS, LEAD_REQUIRED, SIGNAL_COLUMNS, SIGNAL_REQUIRED,
  parseCSV, toCSV, readTable, processLeads, classify, personaOf, fitFor, decayFactor,
  processSignals, scoreList, stack, tierFor, daysBetween, round1,
  loadLists, saveList, getList, deleteList, loadScorings, saveScoring, getScoring, deleteScoring,
};
export default DemandAI;

// Re-exported so pages can name the shapes they work with.
export type { Cell, Grid, Account, Contact, Issue, LeadResult, ScoreResult, SignalResult, Signal, SavedList, SavedScoring, Tier };
