/* Prospecting: the checks run on an uploaded lead file, and what each found.
   Same steps, labels and grouping rules as the original 10-prospecting.html (CHECKS / STEPS / checkOf / stepResult). */
import type { Issue, LeadResult } from '@/types/demandai';

export type StepKey = 'columns' | 'required' | 'emailFormat' | 'verified' | 'liFormat' | 'channel' | 'dupes' | 'formats'
  | 'consent' | 'optout' | 'classify' | 'knockouts';

export const CHECKS: [StepKey, string, string][] = [
  ['columns',     'Columns match the template',        'Required columns present, nothing unexpected'],
  ['required',    'Required fields filled in',          'Name, title, company, domain, country, industry, size, owner'],
  ['emailFormat', 'Email format',                       'Every email is a well-formed address'],
  ['verified',    'Email verified',                     'Only verified emails are used as a channel'],
  ['liFormat',    'LinkedIn URL format',                'Every LinkedIn URL points to a profile'],
  ['channel',     'Email or LinkedIn on every contact', 'Each contact can be reached one way or another'],
  ['dupes',       'Duplicates',                         'The same email or LinkedIn URL appearing twice'],
  ['formats',     'Values and formats',                 'Y/N fields, numbers, account type, consistent company details'],
  ['consent',     'Consent basis',                      'Legitimate interest, existing customer or opted in'],
  ['optout',      'Opt-outs',                           'Opted-out contacts are suppressed, never contacted'],
];

export function checkOf(i: Issue): StepKey {
  if (/Required column|isn't in the template|header row|format hints/.test(i.issue)) return 'columns';
  if (i.code === 'D5') return 'dupes';
  if (i.field === 'email' && /malformed/.test(i.issue)) return 'emailFormat';
  if (i.field === 'email_verified') return 'verified';
  if (i.field === 'linkedin_url' && /profile URL/.test(i.issue)) return 'liFormat';
  if (i.issue === 'No email and no LinkedIn URL' || i.issue === 'No email' || i.issue === 'No LinkedIn URL') return 'channel';
  if (i.field === 'consent_basis') return 'consent';
  if (i.field === 'opt_out' && i.issue === 'Opted out') return 'optout';
  if (/isn't Y or N|commas|isn't a number|isn't on the list|isn't in the form|Differs from row|is blank$/.test(i.issue)) return 'formats';
  return 'required';
}

export const STEPS: [StepKey, string, string][] = [...CHECKS,
  ['classify',  'Classification',             'Industry and site mapped to vertical and account type'],
  ['knockouts', 'Knock-outs and suppression', 'Pilot region, managed separately, contacts left after opt-outs'],
];

export type StepSev = 'stop' | 'warn' | 'info' | '';
export interface StepResult { n: number; sev: StepSev; label: string; rows?: string }

export type IssuesByCheck = Partial<Record<StepKey, Issue[]>>;

export function groupIssues(r: LeadResult): IssuesByCheck {
  const by: IssuesByCheck = {};
  r.issues.forEach(i => { (by[checkOf(i)] = by[checkOf(i)] || []).push(i); });
  return by;
}

export function stepResult(r: LeadResult, k: StepKey, by: IssuesByCheck): StepResult {
  if (k === 'classify') { const n = r.accounts.filter(a => a.needsReview).length; return { n, sev: n ? 'info' : '', label: n ? `${n} need review` : `${r.accounts.length} accounts` }; }
  if (k === 'knockouts') { const n = r.accounts.filter(a => a.excluded).length; return { n, sev: n ? 'info' : '', label: n ? `${n} excluded` : 'All pass' }; }
  const is = by[k] || []; const n = is.length;
  const sev: StepSev = is.some(i => i.severity === 'stop') ? 'stop' : is.some(i => i.severity === 'flag') ? 'warn' : n ? 'info' : '';
  const rows = [...new Set(is.map(i => i.row))];
  return { n, sev, label: n ? `${n} found` : 'Passed', rows: n ? (rows.length === 1 && rows[0] === '—' ? 'Whole file' : 'Row' + (rows.length > 1 ? 's ' : ' ') + rows.slice(0, 5).join(', ') + (rows.length > 5 ? '…' : '')) : '' };
}
