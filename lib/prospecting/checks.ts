/* Prospecting: the checks run on an uploaded lead file, and what each found.
   Same steps, labels and grouping rules as the original 10-prospecting.html (CHECKS / STEPS / checkOf / stepResult). */
import type { Issue, LeadResult } from '../../types/demandai';

/** The ten checks run on the file; their findings have a pane and a CSV each. */
export const CHECK_KEYS = ['columns', 'required', 'emailFormat', 'verified', 'liFormat', 'channel', 'dupes', 'formats', 'consent', 'optout'] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];
export type StepKey = CheckKey | 'classify' | 'knockouts';

export const CHECKS: [CheckKey, string, string][] = [
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

/** Why each check matters, and what to do for the next upload (the original CHECK_HELP). */
export const CHECK_HELP: Record<CheckKey, [string, string]> = {
  columns:     ['A missing or renamed column means a whole field is lost for every row.', 'Start from the lead template and keep its header row as it is. Extra columns are fine; renamed ones are not.'],
  required:    ['Without the basics a contact can\'t be grouped, scored or owned.', 'Fill in name, title, company, domain, country, industry, size and owner on every row before export.'],
  emailFormat: ['A malformed address bounces, and bounces hurt the sender\'s reputation.', 'Export emails straight from the CRM; don\'t retype them. Watch for spaces and missing domains.'],
  verified:    ['Only verified emails are used, so unverified ones reduce who can be reached.', 'Run the export through the email verification tool and set email_verified to Y or N.'],
  liFormat:    ['A link that isn\'t a profile can\'t be used for a connection note.', 'Use the full profile URL, like https://www.linkedin.com/in/name, not a search or company page.'],
  channel:     ['A contact with no email and no LinkedIn URL can\'t be reached at all.', 'Add at least one: a verified work email, or the LinkedIn profile URL.'],
  dupes:       ['The same person twice would get two messages.', 'De-duplicate on email and LinkedIn URL in the CRM before export. Repeats are merged here, keeping the first row.'],
  formats:     ['Inconsistent values (Y/N, numbers, account types) break scoring and grouping.', 'Use Y or N, plain numbers without commas, and the account types from the template list.'],
  consent:     ['No recognised consent basis means the contact can only be called, not emailed.', 'Record legitimate interest, existing customer or opted in for each contact.'],
  optout:      ['Opted-out contacts are never contacted: that is the law, and the brand.', 'Keep opt-outs in the file so they stay suppressed; they are removed from the list automatically.'],
};
export const CHECK_SHORT: Record<CheckKey, string> = { columns: 'Columns', required: 'Required', emailFormat: 'Email format', verified: 'Verified', liFormat: 'LinkedIn', channel: 'Reachable', dupes: 'Duplicates', formats: 'Values', consent: 'Consent', optout: 'Opt-outs' };

export function checkOf(i: Issue): CheckKey {
  if (/Required column|isn't in the template|header row|format hints|^File (encoding|delimiter)|^Column ".*" read as/.test(i.issue)) return 'columns';
  if (i.code === 'D5') return 'dupes';
  if (i.field === 'email' && /malformed|personal \(webmail\)|shared mailbox|company domain|typo of/.test(i.issue)) return 'emailFormat';
  if (i.field === 'email_verified') return 'verified';
  if (i.field === 'linkedin_url' && /profile URL/.test(i.issue)) return 'liFormat';
  if (i.issue === 'No email and no LinkedIn URL' || i.issue === 'No email' || i.issue === 'No LinkedIn URL') return 'channel';
  if (i.field === 'consent_basis') return 'consent';
  if (i.field === 'opt_out' && (i.issue === 'Opted out' || /^Differs from row|says opted in/.test(i.issue))) return 'optout';
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

/* People instead of row numbers: a finding names the person on its row, and the rows its text mentions. */

/** A finding as the check pane gets it: the person on its row (a merged repeat's, the person it went into), and the
 *  people on the rows its text mentions. Null when the row isn't a contact the caller can see (a row not loaded). */
export type Finding = Issue & { who: string | null; names: Record<string, string> };

/** The rows a finding's text mentions ("Differs from row 2", "Merged into row 4"). */
export function rowsIn(text: string): number[] {
  return [...text.matchAll(/\brow (\d+)/gi)].map(m => Number(m[1]));
}

/** The finding's text with the person beside each row it mentions: "Differs from row 2 (Grace Teh) for Eastwind",
 *  "The value from row 2 (Grace Teh) used for the account". A row already followed by a name is left as it is. */
export function namedRows(text: string, names: Record<string, string>): string {
  return text
    .replace(/\b([Rr])ow (\d+)'s (\w+)/g, (m, r: string, n: string, what: string) => names[n] ? `${r === 'R' ? 'The' : 'the'} ${what} from row ${n} (${names[n]})` : m)
    .replace(/\b([Rr])ow (\d+)\b(?!'s|\s*\()/g, (m, r: string, n: string) => names[n] ? `${r}ow ${n} (${names[n]})` : m);
}
