/* Browser side of a Prospecting run: every call asks the server for a small piece (a page, one row, a count).
   The full result never comes down except when the list is saved for Scoring. */
import type { Account, Contact, LeadStats } from '../../types/demandai.ts';
import type {
  AccountRowItem, ContactDetail, ContactRowItem, ExportSummary, Page, PageQuery, RunSummary,
} from '../../types/prospecting-runs.ts';

/** The run is no longer on the server (restarted, or older than a day). The file has to be uploaded again. */
export class RunExpired extends Error { constructor() { super('This upload is no longer on the server. Upload the file again.'); this.name = 'RunExpired'; } }

async function read<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const error = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : '';
  if (res.status === 404 && error === 'run_not_found') throw new RunExpired();
  if (!res.ok) throw new Error(error || `The server answered ${res.status}`);
  return body as T;
}
const base = (id: string) => `/api/prospecting/runs/${encodeURIComponent(id)}`;
const post = (url: string, body: unknown, signal?: AbortSignal) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });

export function queryString(p: Partial<PageQuery> & { selectable?: boolean }): string {
  const sp = new URLSearchParams();
  if (p.offset) sp.set('offset', String(p.offset));
  if (p.limit) sp.set('limit', String(p.limit));
  if (p.q) sp.set('q', p.q);
  if (p.filter && p.filter !== 'all') sp.set('filter', p.filter);
  if (p.sort) { sp.set('sort', p.sort); sp.set('dir', p.dir || 'asc'); }
  if (p.selectable) sp.set('selectable', '1');
  const s = sp.toString();
  return s ? '?' + s : '';
}

export const uploadLeadFile = (file: File) => { const f = new FormData(); f.append('file', file); return fetch('/api/prospecting/runs', { method: 'POST', body: f }).then(r => read<RunSummary>(r)); };
export const startSampleRun = () => post('/api/prospecting/runs', { sample: true }).then(r => read<RunSummary>(r));

export const getContactsPage = (id: string, p: PageQuery, signal?: AbortSignal) =>
  fetch(`${base(id)}/contacts${queryString(p)}`, { signal, cache: 'no-store' }).then(r => read<Page<ContactRowItem>>(r));
export const getAccountsPage = (id: string, p: PageQuery, signal?: AbortSignal) =>
  fetch(`${base(id)}/accounts${queryString(p)}`, { signal, cache: 'no-store' }).then(r => read<Page<AccountRowItem>>(r));
export const getContactDetail = (id: string, row: number) =>
  fetch(`${base(id)}/contacts/${row}`, { cache: 'no-store' }).then(r => read<ContactDetail>(r));
export const getMatchingRows = (id: string, p: Pick<PageQuery, 'q' | 'filter'>) =>
  fetch(`${base(id)}/contact-rows${queryString({ ...p, selectable: true })}`, { cache: 'no-store' }).then(r => read<{ rows: number[] }>(r)).then(b => b.rows);

export const getEmailsToVerify = (id: string, rows?: number[]) => post(`${base(id)}/emails`, { rows }).then(r => read<{ emails: string[] }>(r)).then(b => b.emails);
export const syncVerifications = (id: string, emails: string[]) => post(`${base(id)}/verifications`, { emails }).then(r => read<{ stats: LeadStats }>(r)).then(b => b.stats);

export const exportRunList = (id: string, rows?: number[]) =>
  post(`${base(id)}/export`, { rows }).then(r => read<{ stats: LeadStats; accounts: Account[]; contacts: Contact[] }>(r));
export const getExportSummary = (id: string, rows: number[]) => post(`${base(id)}/export`, { rows, summary: true }).then(r => read<ExportSummary>(r));
