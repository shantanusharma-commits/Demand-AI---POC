/* Types for the data the DemandAI engine reads and produces.
   They describe the shapes the original demandai-engine.js already used; nothing here changes the data model. */

/** One cell of a sheet as read from CSV (string) or SheetJS (string, number, boolean, Date or empty). */
export type Cell = string | number | boolean | Date | null | undefined;
/** A sheet as an array of rows, the way SheetJS `sheet_to_json({header:1})` and `parseCSV` return it. */
export type Grid = Cell[][];

export type Severity = 'stop' | 'flag' | 'info';
export type DqCode = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

export interface Issue {
  file: string;
  sheet: string;
  /** Spreadsheet row number, or '—' when the issue is about the whole file. */
  row: number | '—';
  field: string;
  issue: string;
  outcome: string;
  code: DqCode | '—';
  fix: string;
  severity: Severity;
}

/** One data row keyed by normalised header, plus its spreadsheet row number. */
export type TableRecord = Record<string, string> & { __row: number };

export interface TableResult {
  records: TableRecord[];
  issues: Issue[];
  headers: string[];
}

export type Persona = 'Primary' | 'Secondary' | 'None';
export type AccountTypeKey = 'owner-operator' | 'epc contractor' | 'system integrator' | 'distributor' | 'other';
export type VerticalLevel = 'core' | 'adjacent' | 'other';
export type Confidence = 'high' | 'medium' | 'low';
export type ReachableBy = 'email and LinkedIn' | 'email' | 'LinkedIn' | 'none';

export interface Contact {
  row: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
  seniority: string;
  company: string;
  companyKey: string;
  domain: string;
  country: string;
  city: string;
  industry: string;
  siteName: string;
  siteProcess: string;
  siteCapacity: string;
  capacityUnit: string;
  owner: string;
  email: string;
  emailRaw: string;
  emailVerified: boolean;
  linkedin: string;
  linkedinRaw: string;
  flags: string[];
  name: string;
  persona: Persona;
  revenue: number | null;
  employees: number | null;
  accountType: AccountTypeKey;
  existingCustomer: boolean;
  managedSeparately: boolean;
  optOut: boolean;
  optOutUnknown: boolean;
  consent: string;
  consentOk: boolean;
  reachableBy: ReachableBy;
  contactable: boolean;
  accountId: string;
  status: string;
}

export interface KnockoutCheck {
  rule: string;
  pass: boolean | null;
  why: string;
}

export interface Account {
  id: string;
  key: string;
  name: string;
  domain: string;
  country: string;
  city: string;
  industry: string;
  revenue: number | null;
  employees: number | null;
  accountType: AccountTypeKey;
  existingCustomer: boolean;
  managedSeparately: boolean;
  siteName: string;
  siteProcess: string;
  siteCapacity: string;
  capacityUnit: string;
  owner: string;
  vertical: string;
  verticalLevel: VerticalLevel;
  confidence: Confidence;
  classReason: string;
  needsReview: boolean;
  contactIds: number[];
  checks: KnockoutCheck[];
  excluded: boolean;
  excludedReason: string;
}

export interface LeadStats {
  rowsRead: number;
  notLoaded: number;
  merged: number;
  contacts: number;
  accounts: number;
  accountsPass: number;
  inFinalList: number;
  issues: number;
  issuesBySeverity: Record<Severity, number>;
}

export interface LeadResult {
  contacts: Contact[];
  accounts: Account[];
  issues: Issue[];
  stats: LeadStats;
}

export interface Classification {
  vertical: string;
  level: VerticalLevel;
  confidence: Confidence;
  reason: string;
  needsReview?: boolean;
}

export interface SignalTypeConfig {
  code?: string;
  tier?: number;
  strength?: number;
  full?: number;
  zero?: number;
  segment?: string;
  knockout?: boolean;
  reject?: DqCode;
}

/** A signal type that is scored (not a knock-out or a rejected type). */
export interface ScoredSignalType {
  code: string;
  tier: number;
  strength: number;
  full: number;
  zero: number;
  segment: string;
}

export interface Signal {
  id: string;
  row: number;
  company: string;
  personRef: string;
  type: string;
  date: string;
  detail: string;
  source: string;
  product: string;
  status: string;
  code: string;
  reason: string;
  assigned: string;
  personName: string;
  accountId: string | null;
  contactRow: number | null;
  age?: number;
  tier?: number;
  strength?: number;
  segment?: string;
  decay?: number;
  weight?: number;
  window?: string;
}

export interface SuggestedContact {
  company: string;
  person: string;
  signal: string;
  row: number;
}

export interface SignalResult {
  signals: Signal[];
  issues: Issue[];
  knockouts: Map<string, string>;
  suggested: SuggestedContact[];
  rowsRead: number;
}

export interface RubricRow {
  key: 'vertical' | 'size' | 'site' | 'relationship' | 'accountType' | 'contacts';
  label: string;
  weight: number;
}

export interface FitLevel {
  level: number;
  levelLabel: string;
  why: string;
}

export type FitBreakdownRow = RubricRow & FitLevel & { points: number };

export interface Fit {
  fit: number;
  breakdown: FitBreakdownRow[];
  belowFloor: boolean;
}

export type Tier = 'A' | 'B' | 'C' | 'Watch list' | 'Below fit floor' | 'Excluded';

export interface PersonScore {
  contact: Contact;
  signals: Signal[];
  raw: number;
  score: number;
  timing?: number;
  final?: number;
  tier?: Tier;
  whyNow?: string;
}

export interface ScoreResult {
  account: Account;
  contacts: Contact[];
  excluded: boolean;
  excludedReason: string;
  fit?: number;
  breakdown?: FitBreakdownRow[];
  belowFloor?: boolean;
  tier?: Tier;
  people?: PersonScore[];
  timingRaw?: number;
  rank?: number;
  timing?: number;
  score?: number;
  signalCount?: number;
  confidence?: Confidence;
  confidenceWhy?: string;
  whyNow?: string;
  whyNowSources?: string[];
  segment?: string;
}

/** The accounts and contacts handed from Prospecting to Scoring. */
export interface LeadList {
  accounts: Account[];
  contacts: Contact[];
}

/** A list saved under Saved lists (localStorage key demandai_lists_v1). */
export interface SavedList extends LeadList {
  id: string;
  name: string;
  createdAt: number;
  sourceFile: string;
  sheet: string;
  sandbox: boolean;
  stats: LeadStats;
  scoring?: unknown;
  [extra: string]: unknown;
}

/** A scoring run saved under localStorage key demandai_scorings_v1. Its shape is owned by the Scoring page. */
export interface SavedScoring {
  id: string;
  [field: string]: unknown;
}
