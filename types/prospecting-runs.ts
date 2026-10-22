/* Prospecting runs on the server: what the browser asks for, a page at a time.
   A run is one uploaded file, screened. The whole result stays on the server; the screen only ever holds one page. */
import type { Account, Contact, Issue, LeadStats, Severity } from './demandai';
import type { VerificationOutcome } from './email-verification';

export type ContactFilter = 'all' | 'in' | 'nc' | 'out';
export type AccountFilter = 'all' | 'pass' | 'excluded' | 'review';
export type SortDir = 'asc' | 'desc';

export interface PageQuery { offset: number; limit: number; q: string; filter: string; sort: string; dir: SortDir }
export interface Page<T> { total: number; offset: number; limit: number; rows: T[] }

/** One row of the checks pop-up: what a step found (same shape as lib/prospecting/checks StepResult, plus the step's key). */
export interface StepSummary { key: string; n: number; sev: 'stop' | 'warn' | 'info' | ''; label: string; rows?: string }

export interface RunSummary {
  runId: string; fileName: string; sheet: string; sandbox: boolean; createdAt: number;
  stats: LeadStats;
  steps: StepSummary[];
  /** Issues that sit on no contact in the list (rows not loaded, whole-file issues): the first few, and how many there are. */
  unattached: Issue[]; unattachedTotal: number;
}

/** A Final-list row: just what the table shows. Nothing nested; the detail panel fetches the rest. */
export interface ContactRowItem {
  row: number; name: string; company: string; jobTitle: string; persona: Contact['persona'];
  email: string; emailRaw: string; emailVerified: boolean; emailOutcome: VerificationOutcome | null;
  linkedinRaw: string; city: string; country: string; industry: string; employees: number | null;
  reachableBy: Contact['reachableBy']; optOut: boolean; consent: string; owner: string; status: string; selectable: boolean;
  issueCount: number; firstIssue: { issue: string; outcome: string; severity: Severity } | null;
}

export interface AccountRowItem {
  id: string; name: string; domain: string; city: string; country: string; industry: string; vertical: string; verticalLevel: Account['verticalLevel'];
  confidence: Account['confidence']; classReason: string; accountType: Account['accountType']; revenue: number | null; employees: number | null;
  existingCustomer: boolean; siteName: string; siteProcess: string; siteCapacity: string; capacityUnit: string; owner: string;
  excluded: boolean; excludedReason: string; contactCount: number; primaryCount: number;
}

/** The full record behind a row, fetched only when the detail panel (or the verification pop-up) opens. */
export interface ContactDetail { contact: Contact; account: Account | null; issues: Issue[] }

export interface ExportSummary { contacts: number; accounts: number; accountsPass: number; inFinalList: number }
