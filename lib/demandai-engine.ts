/* ═══════════════ DemandAI engine ═══════════════
   Deterministic rules for Lead discovery (stages 1–5) and Scoring (stages 6–8),
   as written in the Stage_Input_Reasoning_Output sheet and the lead/signal templates.
   No AI runs here: validation, knock-outs, fit and signal weighting are fixed code.
   The two places the spec hands to AI (classification with no lookup match, and the
   wording of the why-now line) are marked below and fall back to rules.

   TypeScript port of demandai-engine.js: same rules, thresholds, messages and output shapes. */
import type {
  Account, AccountTypeKey, Cell, Classification, Contact, DqCode, Fit, FitBreakdownRow, FitLevel, Grid, Issue, LeadList,
  LeadResult, LeadStats, PersonScore, RubricRow, ScoredSignalType, ScoreResult, Severity, Signal,
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
  // Micro-segments: a segment needs this many distinct accounts.
  minSegmentAccounts: 3,
  // The agreed action library per segment (proposed in the process flows; the Client approves the final list).
  // The first option is the recommendation; the next is the runner-up unless the strongest signal says otherwise.
  segmentLibrary: {
    'Inquiry':         ['Call to follow up on the inquiry', 'Route the inquiry to the sales owner'],
    'Modernisation':   ['Propose a migration-path discussion', 'Offer a site assessment', 'Offer a lifecycle service review'],
    'Service renewal': ['Offer a renewal review', 'Route to the service owner'],
    'Project':         ['Share a comparable case study and offer a technical session', 'Offer a reference-site visit', 'Offer an early design workshop'],
    'Leadership':      ['Introduce Client to the new leader', 'Share a peer case study from their sector', 'Invite to a short briefing'],
    'Engagement':      ['Follow up on the topic they engaged with', 'Invite to a related session'],
  } as Record<string, string[]>,
  // Proceed criteria: an estimated first deal below this goes to a person (USD; placeholder until kickoff).
  dealSize: { threshold: 250000, base: { core: 600000, adjacent: 350000, other: 150000 } as Record<VerticalLevel, number> },
  // Outreach limits checked on every draft (the brand pack adds its own words and competitors).
  brand: { maxSubjectWords: 6, maxNote: 200, competitors: [] as string[] },
  // 3.3 Data sufficiency: the readiness checks before measurement (placeholders until kickoff).
  readiness: { accounts: 30, contactable: 60, coverage: 40, recency: 70, recencyDays: 90 },
  // For Review: the share of items that went ahead on their own picked at random for a spot-check.
  spotCheckShare: 0.2,
  // G1: minutes a person spent per usable first action before the pilot (the Client's timed baseline; placeholder).
  g1BaselineMinutes: 38,
  // Success gates: the thresholds agreed at kickoff (placeholders until then).
  g2Threshold: 70, g1Threshold: 50,
  // A gate reads "too early to call" below this many decisions.
  minDecisions: 10,
  // Review by when: working days from the moment an item reaches For Review (0 = by 5 pm the same day).
  // A buyer who asked (an inquiry) and sensitive content are same-day; spot-checks are due by Friday of the week drawn.
  reviewDue: { inquiry: 0, sensitive: 0, sentback: 0, reach: 1, alternative: 1, intervention: 1, brand: 1, claim: 2, low: 2, small: 2, deal: 2, other: 2 } as Record<string, number>,
  // How often each run is expected. In the pilot people start runs by hand; Today calls out a run that is overdue.
  schedule: [
    { id: 'nba', name: 'Micro-segments & NBA build', everyDays: 1, href: '/nba', owner: 'Sales manager' },
    { id: 'scoring', name: 'Signal file scoring', everyDays: 7, href: '/scoring', owner: 'Sales manager' },
  ] as { id: 'nba' | 'scoring'; name: string; everyDays: number; href: string; owner: string }[],
  // Weights for a signal type added in Setup, by the strength chosen there.
  customStrength: { Strong: { tier: 100, strength: 1 }, Medium: { tier: 60, strength: 1 }, Light: { tier: 30, strength: 1 } } as Record<string, { tier: number; strength: number }>,
  // Industry and site-process mapping (D-15 v1, provisional until the Client's taxonomy arrives): the first match
  // wins, refining first. Exclusions are checked before it: palm-oil, oleochemical, edible-oil and sugar refiners are
  // out of the ICP, whatever "refining" says.
  verticalMap: [
    { pattern: /refin/i, vertical: 'Refining', level: 'core' },
    { pattern: /downstream|fuels? (&|and) lubricants?|condensate splitting|residue upgrading|hydrocrack/i, vertical: 'Refining', level: 'core' },
    { pattern: /petrochem/i, vertical: 'Petrochemicals', level: 'adjacent' },
    { pattern: /polymer|plastic|olefin|basic chemical|aromatic|\bbtx\b|polypropylene|polyethylene|\bpta\b/i, vertical: 'Petrochemicals', level: 'adjacent' },
    { pattern: /gas processing|\blng\b/i, vertical: 'Gas processing', level: 'adjacent' },
    { pattern: /natural gas|midstream gas|gas separation/i, vertical: 'Gas processing', level: 'adjacent' },
  ] as { pattern: RegExp; vertical: string; level: VerticalLevel }[],
  verticalExclusions: [/palm oil|oleochem|edible oil|fatty acid|\bsugar\b/i],
  // Persona dictionary (D-15 v1, provisional): the original terms plus instrument and control-system titles, their
  // abbreviations (Inst., Instr., Ctrl Sys.), and the Thai, Vietnamese and Indonesian titles seen in the sample.
  personas: {
    primary: [/instrumentation/i, /\bi&c\b/i, /\be&i\b/i, /automation/i, /control systems?\b/i, /\bdcs\b/i,
      /\binstr(\.|\b|ument)/i, /\binst\b/i, /\b(control|ctrl)\.?\s*sys/i, /điều khiển/i, /instrumentasi/i, /เครื่องมือวัด/],
    secondary: [/plant manager/i, /operations/i, /procurement/i, /project director/i, /maintenance/i, /reliability/i,
      /\bplant\s*(mgr|head)\b/i, /\bgm\b[\s.,-]*plant|\bplant\b[\s.,-]*gm\b/i, /factory manager/i, /\bmaint\b/i, /purchasing/i,
      /pengadaan|pemeliharaan|kepala pabrik/i, /ผู้จัดการโรงงาน|ซ่อมบำรุง/, /bảo trì/i],
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
  // Value synonyms (D-14, provisional v1 until the Client confirms). A value read through one gets an info note
  // ("read as …"). Anything not listed keeps its normal treatment: Business card, Trade show, Consent, Implied and
  // Contract stay unrecognised consent bases; Demo request, Site visit, Webinar, Price request stay unknown types.
  synonyms: {
    version: 'synonyms v1 (D-14, provisional)',
    // Keys are countryKey() forms: lower case, no accents or punctuation, no "the / republic of / kingdom of".
    countries: {
      'sg': 'Singapore', 'sgp': 'Singapore', 'singapore': 'Singapore',
      'my': 'Malaysia', 'mys': 'Malaysia', 'malaysia': 'Malaysia', 'malasia': 'Malaysia',
      'th': 'Thailand', 'tha': 'Thailand', 'thailand': 'Thailand', 'thai': 'Thailand',
      'ph': 'Philippines', 'phl': 'Philippines', 'philippines': 'Philippines', 'phillipines': 'Philippines', 'philippine': 'Philippines', 'phillippines': 'Philippines',
      'id': 'Indonesia', 'idn': 'Indonesia', 'indonesia': 'Indonesia',
      'vn': 'Vietnam', 'vnm': 'Vietnam', 'vietnam': 'Vietnam', 'viet nam': 'Vietnam',
    } as Record<string, string>,
    accountTypes: {
      'owner operator': 'owner-operator', 'owner/operator': 'owner-operator', 'operator': 'owner-operator', 'end user': 'owner-operator',
      'si': 'system integrator',
    } as Record<string, AccountTypeKey>,
    consentBases: { 'opt-in': 'opted in', 'opt in': 'opted in' } as Record<string, string>,
    signalTypes: { 'rfq': 'Inquiry or RFQ', 'inquiry': 'Inquiry or RFQ' } as Record<string, string>,
  },
  // Column names common CRM and marketing exports use (G-040, v1), keyed in normalised header form; each column read
  // through one is noted. Anything else can be mapped by a person (a saved mapping).
  headerSynonyms: {
    'first': 'first_name', 'firstname': 'first_name', 'given_name': 'first_name',
    'last': 'last_name', 'lastname': 'last_name', 'surname': 'last_name', 'family_name': 'last_name',
    'title': 'job_title', 'position': 'job_title', 'designation': 'job_title', 'level': 'seniority',
    'email_address': 'email', 'e_mail': 'email', 'work_email': 'email', 'business_email': 'email',
    'verified': 'email_verified', 'linkedin': 'linkedin_url', 'linkedin_profile': 'linkedin_url', 'linkedin_url_(profile)': 'linkedin_url',
    'company': 'company_name', 'account': 'company_name', 'account_name': 'company_name', 'acct_name': 'company_name',
    'organisation': 'company_name', 'organization': 'company_name',
    'domain': 'company_domain', 'website_domain': 'company_domain', 'email_domain': 'company_domain',
    'country/region': 'country', 'country_name': 'country', 'town': 'city', 'sector': 'industry', 'industry_type': 'industry',
    'annual_revenue': 'annual_revenue_usd', 'revenue': 'annual_revenue_usd', 'revenue_(usd)': 'annual_revenue_usd',
    'employees': 'employee_count', 'number_of_employees': 'employee_count', 'headcount': 'employee_count',
    'type': 'account_type', 'customer': 'existing_customer', 'is_customer': 'existing_customer', 'key_account': 'managed_separately',
    'consent': 'consent_basis', 'lawful_basis': 'consent_basis', 'legal_basis': 'consent_basis',
    'opt_out_flag': 'opt_out', 'do_not_contact': 'opt_out', 'unsubscribed': 'opt_out', 'email_opt_out': 'opt_out',
    'owner': 'owner_email', 'account_owner': 'owner_email', 'owner_email_address': 'owner_email', 'rep_email': 'owner_email',
    'contact': 'contact_email_or_linkedin', 'contact_email': 'contact_email_or_linkedin', 'person': 'contact_email_or_linkedin',
    'signal': 'signal_type', 'event_type': 'signal_type', 'date': 'event_date', 'description': 'detail', 'details': 'detail',
  } as Record<string, string>,
};

/** A country as the synonym table keys it: lower case, accents and punctuation removed, leading articles and state
 *  titles dropped ("Việt Nam" → "viet nam", "Republic of Indonesia" → "indonesia"). */
export function countryKey(raw: string): string {
  return raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(the |socialist republic of |republic of the |republic of |kingdom of )+/, '');
}

export const CODES: Record<DqCode, string> = {
  OFF: 'Switched off in Setup',
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
// company_domain is optional (D-16): when given, it matches the signal to its account before the name does (G-044).
export const SIGNAL_COLUMNS = ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product', 'company_domain'];
export const SIGNAL_REQUIRED = ['company_name', 'signal_type', 'event_date', 'detail'];

/* ─── Small helpers ─── */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// A stricter address check (G-019): the local part and the domain as mail systems accept them.
const EMAIL_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const EMAIL_DOMAIN = /^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
/** Why an email can't be used as written, or null when it is a valid address. */
export function emailProblem(raw: string): string | null {
  if (!EMAIL_RE.test(raw)) return '';
  if (/\.\./.test(raw)) return 'two dots in a row';
  if (/[.,;]$/.test(raw)) return 'ends with a dot, comma or semicolon';
  if (/[:;<>()[\],\s"]/.test(raw)) return 'has characters an address can\'t contain';
  const at = raw.lastIndexOf('@');
  return EMAIL_LOCAL.test(raw.slice(0, at)) && EMAIL_DOMAIN.test(raw.slice(at + 1)) ? null : '';
}
// Review flags on valid addresses (G-019): kept and usable, but a person should look before outreach.
const WEBMAIL = /^(gmail|googlemail|ymail|rocketmail|hotmail|outlook|live|msn|icloud|me|aol|protonmail|proton|gmx|yandex|qq|163|126|mail)\.|^yahoo\./;
// A shared mailbox: the local part is made only of role words ("sales", "plant.ops", "procurement-team").
const ROLE_WORDS = new Set(['info', 'sales', 'procurement', 'purchasing', 'purchase', 'admin', 'contact', 'contactus', 'enquiries', 'enquiry', 'inquiries',
  'inquiry', 'hr', 'it', 'office', 'marketing', 'support', 'service', 'services', 'careers', 'jobs', 'accounts', 'finance', 'hello', 'team', 'general',
  'mail', 'noreply', 'no', 'reply', 'webmaster', 'reception', 'plant', 'ops', 'operations', 'site', 'dept', 'department', 'desk', 'group', 'all']);
const isRoleLocal = (local: string) => { const words = local.toLowerCase().split(/[._-]+/).filter(Boolean); return words.length > 0 && words.every(w => ROLE_WORDS.has(w)); };
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** A review note for a valid address, or null. */
export function emailReviewNote(email: string, companyDomain: string): string | null {
  const at = email.lastIndexOf('@'), local = email.slice(0, at), domain = email.slice(at + 1);
  if (WEBMAIL.test(domain)) return 'is a personal (webmail) address, not a work email';
  if (isRoleLocal(local)) return `is a shared mailbox (${local}@), not a person`;
  const company = companyDomain.replace(/^www\./, '');
  if (!company || !company.includes('.') || domain === company) return null;
  if (editDistance(domain, company) <= 2) return `domain looks like a typo of ${company}`;
  return `domain ${domain} is not the company domain ${company}`;
}
export const LINKEDIN_RE = /linkedin\.com\/(in|pub)\/[^\s/]+/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

export function clean(v: unknown): string { return v === undefined || v === null ? '' : String(v).trim(); }
export function normKey(s: unknown): string { return clean(s).toLowerCase().replace(/\s+/g, ' '); }
function normHeader(h: Cell): string { return clean(h).toLowerCase().replace(/\*/g, '').trim().replace(/[\s-]+/g, '_'); }
export function normEmail(e: unknown): string { return clean(e).toLowerCase(); }
/** linkedin.com/in/<slug>: no scheme, no www or country sub-domain (sg., uk.), no query, no trailing slash (G-039). */
export function normLinkedIn(u: unknown): string {
  return clean(u).toLowerCase().replace(/^https?:\/\//, '').replace(/^([a-z0-9-]+\.)*linkedin\.com/, 'linkedin.com').replace(/[?#].*$/, '').replace(/\/+$/, '');
}
export function round1(n: number): number { return Math.round(n * 10) / 10; }

export function parseIsoDate(s: unknown): number | null {
  const m = DATE_RE.exec(clean(s));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 ? t : null;
}
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(((parseIsoDate(toIso) as number) - (parseIsoDate(fromIso) as number)) / DAY_MS);
}
export function yesNo(v: unknown): 'Y' | 'N' | '' | null {
  const s = clean(v).toLowerCase();
  if (s === 'y' || s === 'yes') return 'Y';
  if (s === 'n' || s === 'no') return 'N';
  return s === '' ? '' : null; // null = present but not Y/N
}

/* ─── File reading: CSV text or a SheetJS-style array of rows ─── */
export function parseCSV(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* A cell starting with = + - or @ would run as a formula in a spreadsheet (G-052): prefix it with an apostrophe.
   Plain numbers, negative ones included, stay as they are. Cells are trimmed, so no leading tab or CR survives. */
const FORMULA_START = /^[=+\-@]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
export function toCSV(rows: unknown[][]): string {
  return rows.map(r => r.map(v => {
    let s = clean(v);
    if (FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = "'" + s;
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

/** A person's choice of template column for a file's own column name (G-040), as saved for that source. */
export type ColumnMapping = Record<string, string>;

/** How a file column reads: by its own name, a person's saved mapping, or a common synonym (G-040). */
export function headerMapper(columns: string[], mapping?: ColumnMapping): (cell: Cell) => { col: string; via?: 'saved' | 'synonym' } {
  const saved = new Map(Object.entries(mapping ?? {}).filter(([, to]) => columns.includes(to)).map(([from, to]) => [clean(from).toLowerCase(), to]));
  return cell => {
    const n = normHeader(cell), raw = clean(cell).toLowerCase();
    if (columns.includes(n)) return { col: n };
    if (saved.has(raw)) return { col: saved.get(raw)!, via: 'saved' };
    const syn = CONFIG.headerSynonyms[n];
    return syn && columns.includes(syn) ? { col: syn, via: 'synonym' } : { col: n };
  };
}

/** The required template columns a file's column names don't provide, even through synonyms or the mapping. */
export function missingColumns(fileColumns: string[], kind: 'lead' | 'signal', mapping?: ColumnMapping): string[] {
  const [columns, required] = kind === 'lead' ? [LEAD_COLUMNS, LEAD_REQUIRED] : [SIGNAL_COLUMNS, SIGNAL_REQUIRED];
  const map = headerMapper(columns, mapping);
  const have = new Set(fileColumns.map(c => map(c).col));
  return required.filter(c => !have.has(c));
}
interface ReadTableOptions { file: string; sheet: string; columns: string[]; required: string[]; anchor: string; mapping?: ColumnMapping }

/** The header row's index (0-based) among the first ten rows: the row naming the anchor column and at least one more
 *  template column, by their own names, a saved mapping or a synonym. -1 when there is none. */
export function headerRowOf(grid: Grid, columns: string[], anchor: string, mapping?: ColumnMapping): number {
  const mapHeader = headerMapper(columns, mapping);
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const hs = (grid[i] || []).map(h => mapHeader(h).col);
    if (hs.includes(anchor) && hs.filter(h => columns.includes(h)).length >= 2) return i;
  }
  return -1;
}

/* Finds the header row (the template has a title row above it and a format-hints row below it),
   then returns one record per data row with its real spreadsheet row number. */
export function readTable(grid: Grid, { file, sheet, columns, required, anchor, mapping }: ReadTableOptions): TableResult {
  const issues: Issue[] = [];
  const at = (row: Issue['row'], field: string, issue: string, outcome: string, code: Issue['code'], fix: string, severity: Severity = 'flag') =>
    issues.push({ file, sheet, row, field, issue, outcome, code, fix, severity });
  const mapHeader = headerMapper(columns, mapping);
  const headerIdx = headerRowOf(grid, columns, anchor, mapping);
  if (headerIdx < 0) {
    at('—', '—', `Couldn't find the header row (looked for a row containing "${anchor}")`, 'File not processed', 'D3',
      'Use the template: column names exactly as in the template, in the first rows of the sheet', 'stop');
    return { records: [], issues, headers: [] };
  }
  const mapped = grid[headerIdx].map(mapHeader);
  const headers = mapped.map(m => m.col);
  mapped.forEach((m, i) => {
    if (m.via) at(headerIdx + 1, m.col, `Column "${clean(grid[headerIdx][i])}" read as ${m.col}${m.via === 'saved' ? ' (saved mapping)' : ''}`, 'Mapped', '—', 'Nothing to fix', 'info');
  });
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
export function parseNumber(raw: unknown): { value: number | null; reformatted?: boolean; invalid?: boolean } {
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

type OptState = 'Y' | 'N' | 'blank' | 'bad';
const COMPANY_FIELDS: [keyof Contact, string][] = [['country', 'country'], ['industry', 'industry'], ['revenue', 'annual_revenue_usd'], ['employees', 'employee_count'],
  ['accountType', 'account_type'], ['existingCustomer', 'existing_customer'], ['managedSeparately', 'managed_separately']];
const blankValue = (v: unknown) => v === '' || v === null || v === undefined;

/* Merges a repeated row into the contact it repeats. Blanks are filled from the repeat; Y on opt-out or managed
   separately wins whichever row it is on; an unreadable opt-out on either row means not confirmed (fails closed);
   a blank never confirms anything. Company details that differ are flagged on the repeated row. */
/** Y wins; then unreadable (fails closed); then N; a blank never confirms. */
function combineStates(states: OptState[]): OptState {
  return states.includes('Y') ? 'Y' : states.includes('bad') ? 'bad' : states.includes('N') ? 'N' : 'blank';
}

function mergeDuplicate(into: Contact, from: Contact, optState: Map<Contact, OptState>, managedState: Map<Contact, OptState>, flag: (field: string, issue: string, outcome: string) => void): void {
  for (const [k, col] of COMPANY_FIELDS) {
    const a = into[k], b = from[k];
    if (k === 'managedSeparately' || k === 'existingCustomer') {
      if (a !== b) flag(col, `Differs from row ${into.row} for ${into.company}`, k === 'managedSeparately' ? 'Y kept: the account is treated as managed separately' : 'Y kept for the account');
    } else if (!blankValue(a) && !blankValue(b) && String(a) !== String(b)) {
      flag(col, `Differs from row ${into.row} for ${into.company}`, `Row ${into.row}'s value used for the account`);
    }
  }
  const sa = optState.get(into) ?? 'blank', sb = optState.get(from) ?? 'blank';
  const state = combineStates([sa, sb]);
  managedState.set(into, combineStates([managedState.get(into) ?? 'blank', managedState.get(from) ?? 'blank']));
  if (sa !== sb && sa !== 'blank' && sb !== 'blank') {
    flag('opt_out', `Differs from row ${into.row} (opt-out ${sa === 'bad' ? 'unreadable' : sa} there, ${sb === 'bad' ? 'unreadable' : sb} here)`,
      state === 'Y' ? 'Opted out: never contacted' : "Can't confirm the contact hasn't opted out: not contactable");
  }
  const target = into as unknown as Record<string, unknown>, source = from as unknown as Record<string, unknown>;
  for (const k of Object.keys(source)) {
    if (k === 'row' || k === 'flags' || k === 'optOut' || k === 'optOutUnknown' || k === 'name' || k === 'persona' || k === 'altRefs') continue;
    if (!target[k] && source[k]) target[k] = source[k];
  }
  into.optOut = state === 'Y';
  into.optOutUnknown = state === 'bad' || state === 'blank';
  optState.set(into, state);
  into.name = [into.firstName, into.lastName].filter(Boolean).join(' ') || '(no name)';
  into.persona = personaOf(into.jobTitle);
}

/** What people decided about a file's rows (G-015, G-021): rows a reviewer took out of the list, with the reason, and
 *  accounts whose vertical a person set (the account holding the row), applied after classification. */
export type LeadDecisions = { removed?: ReadonlyMap<number, string>; verticals?: readonly VerticalChoice[] };
export type VerticalChoice = { row: number; vertical: string; reason: string };

export function processLeads(grid: Grid, { file = 'lead file', sheet = 'Sheet1', mapping, removed, verticals }: { file?: string; sheet?: string; mapping?: ColumnMapping } & LeadDecisions = {}): LeadResult {
  const table = readTable(grid, { file, sheet, columns: LEAD_COLUMNS, required: LEAD_REQUIRED, anchor: 'company_name', mapping });
  const issues = table.issues.slice();
  const at = (row: Issue['row'], field: string, issue: string, outcome: string, code: Issue['code'], fix: string, severity: Severity = 'flag') =>
    issues.push({ file, sheet, row, field, issue, outcome, code, fix, severity });
  const missingCols = new Set(LEAD_REQUIRED.filter(c => !table.headers.includes(c)));

  const contacts: Contact[] = [];
  // A person is found again by their email, their LinkedIn URL, or the address exactly as written (lower case), so two
  // rows with the same malformed address are still one person; a merged repeat's own keys point to the same person.
  const byEmail = new Map<string, Contact>(), byLinkedIn = new Map<string, Contact>(), byRawEmail = new Map<string, Contact>();
  const index = (keys: Contact, person: Contact) => {
    if (keys.email && !byEmail.has(keys.email)) byEmail.set(keys.email, person);
    if (keys.linkedin && !byLinkedIn.has(keys.linkedin)) byLinkedIn.set(keys.linkedin, person);
    // Only something shaped like an address: placeholders ("N/A", "none") never make two people one.
    const raw = normEmail(keys.emailRaw);
    if (/^[^@\s]+@[^@\s]+\.[^@\s]*$/.test(raw) && !byRawEmail.has(raw)) byRawEmail.set(raw, person);
    // A merged repeat's own email and LinkedIn still name this person when a signal uses them.
    if (keys !== person) {
      const refs = [keys.email, keys.linkedin, raw].filter(r => r && r !== person.email && r !== person.linkedin);
      if (refs.length) person.altRefs = [...new Set([...(person.altRefs ?? []), ...refs])];
    }
  };
  // How each contact's opt-out and managed-separately were given, so merges and accounts can tell blank (no answer)
  // from unreadable (fails closed).
  const optState = new Map<Contact, OptState>(), managedState = new Map<Contact, OptState>();
  // A merged repeat's row → the person it was merged into, so a decision about either row reaches that person.
  const mergedInto = new Map<number, Contact>();
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
    const emailWhy = c.emailRaw ? emailProblem(c.emailRaw) : null;
    if (c.emailRaw) {
      if (emailWhy === null) {
        c.email = normEmail(c.emailRaw);
        const note = emailReviewNote(c.email, c.domain);
        if (note) at(row, 'email', `Email "${c.emailRaw}" ${note}`, 'Kept; flagged for review before any outreach', '—', 'Use the person\'s own work address if one is held');
        const v = yesNo(r.email_verified);
        if (v === null) at(row, 'email_verified', `"${clean(r.email_verified)}" isn't Y or N`, 'Email treated as not verified, so not used as a channel', 'D3', 'Use Y or N');
        else if (v !== 'Y') at(row, 'email_verified', 'Email not verified', 'Email not used as a channel', '—', 'Verify the address and set email_verified to Y', 'info');
        c.emailVerified = v === 'Y';
      } else {
        at(row, 'email', `Email "${c.emailRaw}" is malformed${emailWhy ? ` (${emailWhy})` : ''}`, c.linkedinRaw ? 'Email not used; LinkedIn only' : 'Email not used', 'D3', 'Correct the address');
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

    // Company-level fields: checked on every row, duplicates included (G-037)
    req('country', 'Country is missing', 'The account fails the region check', 'Add the country');
    const countryAs = CONFIG.synonyms.countries[countryKey(c.country)];
    if (countryAs) {
      if (countryAs.toLowerCase() !== c.country.toLowerCase()) at(row, 'country', `"${c.country}" read as ${countryAs}`, 'Matched to the pilot region', '—', 'Write the country name in full', 'info');
      c.country = countryAs;
    }
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

    const at0 = clean(r.account_type).toLowerCase().replace(/\s+/g, ' ');
    const atAs = CONFIG.synonyms.accountTypes[at0];
    if (!at0) { c.accountType = 'other'; at(row, 'account_type', 'Account type is blank', 'Scores 0 for account type', '—', 'Choose from the list', 'info'); }
    else if (CONFIG.accountTypes[at0 as AccountTypeKey]) c.accountType = at0 as AccountTypeKey;
    else if (atAs) {
      c.accountType = atAs;
      at(row, 'account_type', `"${clean(r.account_type)}" read as ${atAs[0].toUpperCase() + atAs.slice(1)}`, 'Scored as that account type', '—', 'Choose the type from the list', 'info');
    }
    else { c.accountType = 'other'; at(row, 'account_type', `"${clean(r.account_type)}" isn't on the list`, 'Treated as Other', 'D3', 'Choose Owner-operator, EPC contractor, System integrator, Distributor or Other'); }

    const yn = (f: string, blankOutcome: string): 'Y' | 'N' | '' => {
      if (missingCols.has(f)) return '';
      const v = yesNo(r[f]);
      if (v === null) { at(row, f, `"${clean(r[f])}" isn't Y or N`, blankOutcome, 'D3', 'Use Y or N'); return ''; }
      if (v === '') at(row, f, `${f} is blank`, blankOutcome, 'D3', 'Use Y or N');
      return v;
    };
    c.existingCustomer = yn('existing_customer', 'Treated as N (no relationship); confirm') === 'Y';
    const managed = yn('managed_separately', 'Not confirmed: the account is held unless another row confirms it (D-17)');
    c.managedSeparately = managed === 'Y';
    managedState.set(c, managed === 'Y' || managed === 'N' ? managed : clean(r.managed_separately) ? 'bad' : 'blank');
    const opt = yn('opt_out', "Can't confirm the contact hasn't opted out: not contactable");
    c.optOut = opt === 'Y';
    c.optOutUnknown = opt === '';
    optState.set(c, opt === 'Y' || opt === 'N' ? opt : clean(r.opt_out) ? 'bad' : 'blank');
    if (c.optOut) at(row, 'opt_out', 'Opted out', 'Suppressed: never contacted', '—', 'Nothing to fix', 'info');

    const consent = clean(r.consent_basis);
    c.consent = consent;
    const consentAs = CONFIG.synonyms.consentBases[consent.toLowerCase()];
    c.consentOk = CONFIG.consentBases.includes(consentAs ?? consent.toLowerCase());
    if (consentAs) at(row, 'consent_basis', `"${consent}" read as ${consentAs}`, 'Recognised consent basis', '—', 'Use the wording from the list', 'info');
    if (!consent) { if (!missingCols.has('consent_basis')) at(row, 'consent_basis', 'No consent basis', 'Not contactable', 'D3', 'Add legitimate interest, existing customer or opted in'); }
    else if (!c.consentOk) at(row, 'consent_basis', `"${consent}" isn't a recognised basis`, 'Not contactable until confirmed', 'D3', 'Use legitimate interest, existing customer or opted in');
    // The row contradicts itself: the opt-out wins, and a person is asked to correct it (G-060).
    if (c.optOut && consent.toLowerCase() === 'opted in') {
      at(row, 'opt_out', 'Opted out, but the consent basis says opted in', 'Opt-out wins: never contacted', '—', 'Confirm with the owner and correct the consent basis');
    }

    if (!c.owner) { if (!missingCols.has('owner_email')) at(row, 'owner_email', 'No owner rep', 'Only the sales manager sees this account', 'D3', "Add the assigned rep's email"); }
    else if (emailProblem(c.owner) !== null) at(row, 'owner_email', `Owner "${c.owner}" isn't an email`, 'Only the sales manager sees this account', 'D3', "Use the rep's work email");

    // Duplicates (same email or LinkedIn URL): merged into the first row after their own checks, blanks filled
    // from the repeat; an opt-out or managed-separately Y on any row wins, and conflicts are flagged (N-01, G-060).
    const byLi = c.linkedin ? byLinkedIn.get(c.linkedin) : undefined;
    const dupOf = (c.email && byEmail.get(c.email)) || byLi || (c.emailRaw ? byRawEmail.get(normEmail(c.emailRaw)) : undefined);
    if (dupOf) {
      at(row, dupOf === byLi && !(c.email && byEmail.get(c.email)) ? 'linkedin_url' : 'email', `Duplicate of row ${dupOf.row} (${dupOf.name})`,
        `Merged into row ${dupOf.row}`, 'D5', 'Remove the repeated row');
      mergeDuplicate(dupOf, c, optState, managedState, (field, issue, outcome) => at(row, field, issue, outcome, '—', 'Correct the row that is wrong, then remove the repeat'));
      mergedInto.set(row, dupOf);
      index(c, dupOf);
      merged++;
      continue;
    }

    contacts.push(c);
    index(c, c);
  }

  // Possible duplicates (G-041): the same last name at the same company with the same first name or its initial, under
  // a different email and LinkedIn. Listed for a person to decide; never merged automatically.
  const firstOk = (a: string, b: string) => {
    const x = a.toLowerCase().replace(/\.$/, ''), y = b.toLowerCase().replace(/\.$/, '');
    return !!x && !!y && (x === y || (x.length === 1 && y.startsWith(x)) || (y.length === 1 && x.startsWith(y)));
  };
  const seenPeople = new Map<string, Contact[]>();
  for (const c of contacts) {
    if (!c.lastName) continue;
    const k = `${companyBase(c.company)}|${c.lastName.toLowerCase()}`;
    const earlier = (seenPeople.get(k) ?? []).find(p => firstOk(p.firstName, c.firstName));
    if (earlier) {
      issues.push({ file, sheet, row: c.row, field: 'first_name / last_name', issue: `Possible duplicate of row ${earlier.row} (${earlier.name})`,
        outcome: 'Kept and not merged; listed for review', code: 'D5', fix: 'If it is the same person, remove one row or give both the same email', severity: 'flag' });
    }
    seenPeople.set(k, [...(seenPeople.get(k) ?? []), c]);
  }

  // People a reviewer took out of the list stay visible, with the reason, and are never contacted or scored.
  const byRow = new Map(contacts.map(c => [c.row, c]));
  const personAt = (row: number) => byRow.get(row) ?? mergedInto.get(row);
  for (const [row, why] of removed ?? []) { const c = personAt(row); if (c) c.takenOut = why; }

  // Reachability and contactability
  for (const c of contacts) {
    const emailOk = !!c.email && c.emailVerified, liOk = !!c.linkedin;
    c.reachableBy = emailOk && liOk ? 'email and LinkedIn' : emailOk ? 'email' : liOk ? 'LinkedIn' : 'none';
    c.contactable = canContact(c);
  }

  const chosen = new Map<Contact, VerticalChoice>();
  for (const v of verticals ?? []) { const c = personAt(v.row); if (c) { chosen.delete(c); chosen.set(c, v); } }
  const accounts = buildAccounts(contacts, issues, { file, sheet }, managedState, chosen);
  const stats: LeadStats = {
    rowsRead: table.records.length, notLoaded, merged, contacts: contacts.length,
    accounts: accounts.length, accountsPass: accounts.filter(a => !a.excluded).length,
    inFinalList: contacts.filter(c => c.status === 'In the final list').length,
    issues: issues.length,
    issuesBySeverity: (['stop', 'flag', 'info'] as Severity[]).reduce((o, s) => (o[s] = issues.filter(i => i.severity === s).length, o), {} as Record<Severity, number>),
  };
  return { contacts, accounts, issues, stats };
}

/* ─── Account identity (G-038): the company's domain and its name without legal or group suffixes ─── */
const LEGAL_WORDS = new Set(['group', 'pte', 'ltd', 'limited', 'sdn', 'bhd', 'berhad', 'pt', 'tbk', 'co', 'company', 'corp', 'corporation', 'inc',
  'incorporated', 'plc', 'jsc', 'llc', 'holdings', 'holding', 'public', 'pcl']);
/** "ACME REFINING PTE LTD", "Acme Refining Group" and "PT Acme Refining Tbk" all give "acme refining". */
export function companyBase(name: string): string {
  const words = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && LEGAL_WORDS.has(words[words.length - 1])) words.pop();
  while (words.length > 1 && LEGAL_WORDS.has(words[0])) words.shift();
  return words.join(' ');
}
const validDomain = (d: string) => (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d.replace(/^www\./, '') : '');

/* The one consent gate (G-005, spec 3.6 and 5.10): a usable channel, a recognised consent basis, and an opt-out that
   is confirmed N. Applied wherever someone is picked for outreach: the hand-off, signal auto-assignment, channel and
   contact choice. People who fail it stay visible; they are never handed off or drafted to. */
export function canContact(c: Pick<Contact, 'reachableBy' | 'consentOk' | 'optOut' | 'optOutUnknown' | 'takenOut'>): boolean {
  return c.reachableBy !== 'none' && c.consentOk && !c.optOut && !c.optOutUnknown && !c.takenOut;
}

/** Out of the list for good: opted out, or taken out by a reviewer. Never a prospect, never counted as cover. */
export function suppressed(c: Pick<Contact, 'optOut' | 'takenOut'>): boolean {
  return c.optOut || !!c.takenOut;
}

/** The verticals a person can choose for an account: the mapping table's, plus Other and Out of ICP. */
export const VERTICAL_CHOICES: string[] = [...new Set(CONFIG.verticalMap.map(m => m.vertical)), 'Other', 'Out of ICP'];
export function verticalLevelOf(vertical: string): VerticalLevel {
  return CONFIG.verticalMap.find(m => m.vertical === vertical)?.level ?? 'other';
}

/* Stage 3 classification and stage 4 knock-outs, per account */
/** The vertical a text maps to, or 'excluded' for an out-of-ICP industry (D-15 exclusions). */
function verticalHit(s: string) {
  if (!s) return null;
  if (CONFIG.verticalExclusions.some(re => re.test(s))) return 'excluded' as const;
  return CONFIG.verticalMap.find(m => m.pattern.test(s)) ?? null;
}

export function classify(industry: string, siteProcess: string): Classification {
  const raw = (s: string) => verticalHit(s);
  const excluded = [industry, siteProcess].find(x => raw(x) === 'excluded');
  if (excluded) {
    return { vertical: 'Out of ICP', level: 'other', confidence: 'high',
      reason: `"${excluded}" is out of the ICP: palm-oil, oleochemical, edible-oil and sugar refining are not oil refining` };
  }
  const hit = (s: string) => { const h = raw(s); return h && h !== 'excluded' ? h : null; };
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

function buildAccounts(contacts: Contact[], issues: Issue[], { file, sheet }: { file: string; sheet: string }, managedState: Map<Contact, OptState>, chosen: Map<Contact, VerticalChoice>): Account[] {
  // Rows group into one account when their company's base name agrees and so does the domain (G-038): "X" and "X Group"
  // on x.com are one company. A row with no domain joins the base name's only domain. A different company on the same
  // domain stays separate and is flagged.
  const baseOf = new Map(contacts.map(c => [c, companyBase(c.company) || c.companyKey]));
  const baseDomains = new Map<string, Set<string>>();
  for (const c of contacts) {
    const d = validDomain(c.domain);
    if (d) baseDomains.set(baseOf.get(c)!, new Set([...(baseDomains.get(baseOf.get(c)!) ?? []), d]));
  }
  const domainOf = (c: Contact) => validDomain(c.domain) || (baseDomains.get(baseOf.get(c)!)?.size === 1 ? [...baseDomains.get(baseOf.get(c)!)!][0] : '');
  const map = new Map<string, Contact[]>();
  for (const c of contacts) {
    const k = `${domainOf(c)}|${baseOf.get(c)}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(c);
  }
  const firstOnDomain = new Map<string, Contact>();
  for (const cs of map.values()) {
    const f = cs[0], d = domainOf(f);
    for (const c of cs) {
      if (c.companyKey !== f.companyKey && cs.find(x => x.companyKey === c.companyKey) === c) {
        issues.push({ file, sheet, row: c.row, field: 'company_name', issue: `Company name written differently from row ${f.row} ("${c.company}")`,
          outcome: `Grouped into ${f.company}: same domain and name`, code: '—', fix: 'Write the company name the same way on every row', severity: 'info' });
      }
    }
    if (!d) continue;
    const owner = firstOnDomain.get(d);
    if (!owner) firstOnDomain.set(d, f);
    else issues.push({ file, sheet, row: f.row, field: 'company_domain', issue: `Shares the domain ${d} with ${owner.company} (row ${owner.row})`,
      outcome: 'Kept as a separate account', code: 'D3', fix: 'Check which company the domain belongs to and correct the other', severity: 'flag' });
  }
  const accounts: Account[] = [];
  for (const cs of map.values()) {
    const f = cs[0], key = f.companyKey;
    // Each detail is the first value any row gives, not just the first row's (G-017); a stated relationship or
    // "managed separately" on any row counts.
    const firstOf = <K extends keyof Contact>(k: K): Contact[K] => (cs.find(c => !blankValue(c[k])) ?? f)[k];
    // Managed separately: Y on any row excludes; otherwise an N on any row confirms (a stray unreadable row is flagged
    // on that row); with no readable answer at all the account is held until a person confirms (D-17).
    const rowStates = cs.map(c => managedState.get(c) ?? 'blank');
    const managed: OptState = rowStates.includes('Y') ? 'Y' : rowStates.includes('N') ? 'N' : 'bad';
    const derived = {
      country: firstOf('country'), city: firstOf('city'), industry: firstOf('industry'), domain: firstOf('domain'),
      revenue: cs.find(c => c.revenue !== null && c.revenue !== undefined)?.revenue ?? null,
      employees: cs.find(c => c.employees !== null && c.employees !== undefined)?.employees ?? null,
      accountType: cs.find(c => c.accountType !== 'other')?.accountType ?? 'other',
      existingCustomer: cs.some(c => c.existingCustomer), managedSeparately: managed === 'Y',
      siteName: firstOf('siteName'), siteProcess: firstOf('siteProcess'), siteCapacity: firstOf('siteCapacity'), capacityUnit: firstOf('capacityUnit'),
      owner: firstOf('owner'),
    };
    // Company details should repeat identically on every contact row; say so when a row gives a different value.
    for (const [k, col] of COMPANY_FIELDS) {
      // The first row that gives a value is the reference; the first row that gives a different one is flagged. A blank
      // is "missing" (flagged as such), not a difference; yes/no details are never blank.
      const yesNo = typeof f[k] === 'boolean';
      const source = yesNo ? f : cs.find(c => !blankValue(c[k])) ?? f;
      const other = cs.find(c => c !== source && (yesNo ? c[k] !== source[k] : !blankValue(c[k]) && String(c[k]) !== String(source[k])));
      const kept = yesNo && derived[k as 'existingCustomer' | 'managedSeparately']
        ? (k === 'managedSeparately' ? 'Y kept: the account is treated as managed separately' : 'Y kept for the account') : `Row ${source.row}'s value used for the account`;
      if (other) issues.push({ file, sheet, row: other.row, field: col, issue: `Differs from row ${source.row} for ${f.company}`, outcome: kept, code: 'D3',
        fix: 'Repeat the same company details on every contact row', severity: 'flag' });
    }
    // A vertical set by a person (G-021) replaces the lookup's, with their reason; the last choice for the account wins.
    const choice = [...chosen.entries()].filter(([c]) => cs.includes(c)).map(([, v]) => v).pop();
    const cls: Classification = choice
      ? { vertical: choice.vertical, level: verticalLevelOf(choice.vertical), confidence: 'high', reason: `Set by a person: ${choice.reason}` }
      : classify(derived.industry, derived.siteProcess);
    const a = {
      id: 'acc-' + accounts.length, key, names: [...new Set(cs.map(c => c.companyKey))], name: f.company, ...derived,
      vertical: cls.vertical, verticalLevel: cls.level, confidence: cls.confidence,
      classReason: cls.reason, needsReview: !!cls.needsReview, contactIds: cs.map(c => c.row),
    } as Account;
    // Stage 4: yes-or-no rules, in order. The installed-base rule needs the signal file, so it runs in Scoring.
    const inRegion = CONFIG.pilotCountries.some(p => p.toLowerCase() === a.country.toLowerCase());
    const left = cs.filter(c => !suppressed(c)), anyTakenOut = cs.some(c => c.takenOut);
    a.checks = [
      { rule: 'In the pilot region', pass: inRegion, why: inRegion ? a.country : `Outside the pilot region (${a.country || 'no country'})` },
      { rule: 'Not managed separately', pass: managed === 'N', why: managed === 'Y' ? 'Managed separately by Client' : managed === 'N' ? 'Not managed separately' : 'Managed status not confirmed: confirm before any outreach' },
      { rule: 'Pilot product not installed at the site', pass: null, why: 'Checked in Scoring, from the installed-base rows of the signal file' },
      { rule: 'At least one contact left after suppression', pass: left.length > 0,
        why: left.length ? `${left.length} contact(s) not opted out${anyTakenOut ? ' or taken out' : ''}` : `No contactable contacts after suppression${anyTakenOut ? ' (opted out or taken out by a reviewer)' : ''}` },
    ];
    const failed = a.checks.find(k => k.pass === false);
    a.excluded = !!failed;
    a.excludedReason = failed ? failed.why : '';
    accounts.push(a);
    for (const c of cs) {
      c.accountId = a.id;
      if (c.takenOut) c.status = `Not in the list (taken out by a reviewer: ${c.takenOut.toLowerCase()})`;
      else if (a.excluded) c.status = `Not in the list: account excluded (${a.excludedReason})`;
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

  const siteFound = verticalHit(account.siteProcess);
  const siteHit = siteFound && siteFound !== 'excluded' ? siteFound : null;
  const site = !account.siteProcess ? 30 : siteHit && siteHit.level === 'core' ? 100 : 50;
  const siteLbl = site === 100 ? 'Suits the product' : site === 50 ? 'Partly' : 'Unknown';
  const siteWhy = account.siteProcess
    ? [account.siteName, account.siteProcess, account.siteCapacity && `${Number(account.siteCapacity).toLocaleString('en-US')} ${account.capacityUnit}`].filter(Boolean).join(' · ')
    : 'No site given';

  const live = contacts.filter(c => !suppressed(c));
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

/* ─── Signal types switched off or added in Setup (G-023). A run takes them as settings; the shared configuration is
   never changed, so lists already scored keep the types they were scored with. ─── */
export type CustomSignalType = { name: string; segment: string; level: 'Strong' | 'Medium' | 'Light'; full: number; zero: number; about?: string; data?: string; source?: string };

/** Why a signal type can't be added, or null. */
export function customSignalProblem(def: CustomSignalType, others: CustomSignalType[] = []): string | null {
  const name = clean(def.name);
  if (!name) return 'Give the signal a name, as it appears in the signal_type column';
  if ([...Object.keys(CONFIG.signalTypes), ...others.map(o => o.name)].some(k => k.toLowerCase() === name.toLowerCase())) return `"${name}" is already a signal type`;
  if (!CONFIG.segmentLibrary[def.segment]) return 'Pick the micro-segment it feeds';
  if (!(+def.full > 0) || !(+def.zero > +def.full)) return 'Full weight needs a number of days, and "gone after" must be longer';
  return null;
}

function signalTypesFor(custom: CustomSignalType[]): Record<string, SignalTypeConfig> {
  const types: Record<string, SignalTypeConfig> = { ...CONFIG.signalTypes };
  for (const c of custom) {
    if (types[c.name]) continue;
    types[c.name] = { code: 'C', segment: c.segment, full: +c.full, zero: +c.zero, ...(CONFIG.customStrength[c.level] ?? CONFIG.customStrength.Medium) };
  }
  return types;
}

/* ─── Stage 7: signal intake and qualification, per person ─── */
export function decayFactor(type: Pick<SignalTypeConfig, 'full' | 'zero'>, age: number): number {
  const full = type.full as number, zero = type.zero as number;
  if (age <= full) return 1;
  if (age >= zero) return 0;
  return (zero - age) / (zero - full);
}

export function processSignals(grid: Grid, list: LeadList,
  { file = 'signal file', sheet = 'Sheet1', asOf, mapping, off = [], custom = [] }: { file?: string; sheet?: string; asOf?: string; mapping?: ColumnMapping; off?: string[]; custom?: CustomSignalType[] } = {}): SignalResult {
  const table = readTable(grid, { file, sheet, columns: SIGNAL_COLUMNS, required: SIGNAL_REQUIRED, anchor: 'signal_type', mapping });
  const signalTypes = signalTypesFor(custom);
  const issues = table.issues.slice();
  // An account answers to every company name its rows use (G-038); signals also find it by domain, base name or
  // initials (G-044), each only when exactly one account fits.
  const accountsByKey = new Map<string, Account>();
  const byDomain = new Map<string, Account[]>(), byBase = new Map<string, Account[]>(), byInitials = new Map<string, Account[]>();
  const add = (m: Map<string, Account[]>, k: string, a: Account) => { if (k && !(m.get(k) ?? []).includes(a)) m.set(k, [...(m.get(k) ?? []), a]); };
  for (const a of list.accounts) {
    for (const n of a.names ?? [a.key]) {
      if (!accountsByKey.has(n)) accountsByKey.set(n, a);
      add(byBase, companyBase(n), a);
    }
    add(byDomain, validDomain(a.domain), a);
    const words = companyBase(a.name).split(' ').filter(w => !['and', 'of', 'the'].includes(w));
    if (words.length >= 2) add(byInitials, words.map(w => w[0]).join('').toUpperCase(), a);
  }
  const only = (list: Account[] | undefined) => (list && list.length === 1 ? list[0] : undefined);
  const resolveAccount = (company: string, domain: string): { acc?: Account; how?: string } => {
    const viaDomain = only(byDomain.get(validDomain(domain)));
    if (viaDomain) return { acc: viaDomain, how: `domain ${validDomain(domain)}` };
    const exact = accountsByKey.get(normKey(company));
    if (exact) return { acc: exact };
    const viaBase = only(byBase.get(companyBase(company)));
    if (viaBase) return { acc: viaBase, how: 'name variant' };
    const initials = company.trim();
    if (/^[A-Z]{2,6}$/.test(initials)) {
      const viaInitials = only(byInitials.get(initials));
      if (viaInitials) return { acc: viaInitials, how: 'initials' };
    }
    return {};
  };
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
    if (!s.company) { reject('D3', 'No company name', 'company_name', 'Add the company name as in the lead file'); continue; }
    const { acc, how } = resolveAccount(s.company, clean(r.company_domain).toLowerCase());
    if (!acc) { reject('D4', 'Company is not in the target universe', 'company_name', 'Use the company name exactly as in the lead file, or add the company to the lead file'); continue; }
    if (how) issues.push({ file, sheet, row: s.row, field: 'company_name', issue: `"${s.company}" matched to ${acc.name} by ${how}`, outcome: 'Counted for that account', code: '—', fix: 'Write the company name as in the lead file', severity: 'info' });
    s.accountId = acc.id;
    const cs = contactsByAcc.get(acc.id) || [];
    let typeCfg = signalTypes[s.type] || signalTypes[Object.keys(signalTypes).find(k => k.toLowerCase() === s.type.toLowerCase()) as string];
    const typeAs = typeCfg ? undefined : CONFIG.synonyms.signalTypes[s.type.toLowerCase().replace(/\s+/g, ' ')];
    if (typeAs) {
      typeCfg = signalTypes[typeAs];
      issues.push({ file, sheet, row: s.row, field: 'signal_type', issue: `"${s.type}" read as ${typeAs}`, outcome: 'Scored as that type', code: '—', fix: 'Use the type from the list in the template', severity: 'info' });
    }
    if (typeCfg) s.type = Object.keys(signalTypes).find(k => signalTypes[k] === typeCfg) as string;
    if (typeCfg && off.includes(s.type)) { reject('OFF', `${s.type} is switched off in Setup`, 'signal_type', 'Switch it back on in Setup to score it'); continue; }

    // Installed system (current) is company-wide: it knocks the account out, whoever is named.
    if (typeCfg && typeCfg.knockout) {
      s.status = 'Used for a knock-out'; s.reason = 'Current pilot product installed: account excluded';
      knockouts.set(acc.id, `Pilot product already installed at the site${s.product ? ` (${s.product})` : ''}`);
      continue;
    }

    let person: Contact | null | undefined = null;
    if (s.personRef) {
      const ref = s.personRef.includes('@') ? normEmail(s.personRef) : normLinkedIn(s.personRef);
      person = cs.find(c => (c.email && c.email === ref) || (c.linkedin && c.linkedin === ref) || normEmail(c.emailRaw) === ref || !!c.altRefs?.includes(ref));
      if (!person) {
        reject('D4', `Person ${s.personRef} is not in the lead file for this account (sent back as a suggested new contact)`, 'contact_email_or_linkedin', 'Add this person to the lead file, or correct the email or LinkedIn URL');
        suggested.push({ company: acc.name, person: s.personRef, signal: s.type, row: s.row });
        continue;
      }
      s.assigned = 'Named in the file';
    } else {
      // Only someone who can be contacted is auto-assigned (D-16, G-050).
      const live = cs.filter(canContact);
      person = live.find(c => c.persona === 'Primary') || live[0];
      if (!person) { reject('D4', 'No person named, and no one at this account can be contacted', 'contact_email_or_linkedin', 'Name the person this signal concerns'); continue; }
      s.assigned = person.persona === 'Primary' ? 'Auto-assigned to the primary-persona contact'
        : cs.some(c => c.persona === 'Primary' && !c.optOut) ? 'Auto-assigned (the primary-persona contact can\'t be contacted)' : 'Auto-assigned (no primary-persona contact)';
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
    const people: PersonScore[] = cs.filter(c => !suppressed(c)).map(c => {
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
    const hasPrimary = cs.some(c => !suppressed(c) && c.persona === 'Primary');
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

export function lowerFirst(s: string): string { return s && /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; }

/* Lists, scoring runs and hand-offs are stored on the server (lib/server/services), never in the browser (G-012, G-029). */

/** The engine as one object, the shape the original exposed as window.DemandAI. */
export const DemandAI = {
  CONFIG, CODES, LEAD_COLUMNS, LEAD_REQUIRED, SIGNAL_COLUMNS, SIGNAL_REQUIRED,
  parseCSV, toCSV, readTable, processLeads, canContact, classify, personaOf, fitFor, decayFactor,
  processSignals, scoreList, stack, tierFor, daysBetween, round1,
};
export default DemandAI;

// Re-exported so pages can name the shapes they work with.
export type { Cell, Grid, Account, Contact, Issue, LeadResult, ScoreResult, SignalResult, Signal, Tier };
