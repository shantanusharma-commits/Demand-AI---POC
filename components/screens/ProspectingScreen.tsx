'use client';

/* Prospecting (was legacy/10-prospecting.html): upload a lead file, watch the checks run on the server, review the
   final list and accounts, save the list for Scoring. Markup and text match the original page. The file is checked
   by a background job whose real stages drive the pop-up (G-043); the list lives in PostgreSQL (G-004, G-012) and is
   read a page at a time with server search (G-022). Reps see their own contacts and accounts (G-014). Each list keeps
   its % clean, check panes with every finding and a CSV per check, the validation report with D-codes, and the
   readiness checks (G-015). */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { DemandAI } from '@/lib/demandai-engine';
import { DemandAISample } from '@/lib/demandai-sample-data';
import { download } from '@/lib/download';
import { avColor, initials, showToast } from '@/lib/ui';
import { sx } from '@/lib/sx';
import { CHECK_HELP, CHECK_SHORT, CHECKS, STEPS, type CheckKey, type StepResult } from '@/lib/prospecting/checks';
import { ApiError, api, errorText, uploadFile, waitForJob, type JobState, type Wire } from '@/lib/client/api';
import { useDebounced } from '@/lib/client/use-debounced';
import { usePaged } from '@/lib/client/use-paged';
import { RenameField } from '@/components/RenameField';
import type { AccountRow as AccountRowData, ContactRow as ContactRowData, ListDetail as ServerListDetail, ListSummary as ServerListSummary } from '@/lib/server/services/lists';
import type { Account, Contact, DqCode, Issue } from '@/types/demandai';

/* ═══════════════ STATE SHAPES ═══════════════ */
type ListDetail = Wire<ServerListDetail>;
type ListSummary = Wire<ServerListSummary>;
type StartTab = 'upload' | 'saved';
type View = 'list' | 'accounts';
interface ChecksState { key: number; shown: boolean; fileName: string; phase: 'running' | 'done' | 'failed'; stage: string; done: number; total: number; list: ListDetail | null; error: string }
interface SaveState { key: number; shown: boolean; go: boolean; saved: boolean; selOnly: boolean; base: string; text: string }
/** The check pane: which list's findings, for which check. */
interface PaneState { list: ListDetail; check: CheckKey }

const OVERLAY_CSS = 'position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px';
const upperFirst = (s: string) => s.replace(/^./, m => m.toUpperCase());
const STAGE_TEXT: Record<string, string> = { queued: 'Waiting to start…', parse: 'Reading the file…', check: 'Running the checks…', save: 'Saving the list…' };
const PAGE = 200;
/** A job that ended without a list: its message is written for the person. */
class JobFailed extends Error {}

/* ═══════════════ TABLES: every field in the row, fixed column widths ═══════════════ */
type Col = [ReactNode, number, string?];
function Table({ cols, rows, empty }: { cols: Col[]; rows: ReactNode[]; empty: ReactNode }) {
  const w = cols.reduce((n, c) => n + c[1], 0);
  return (
    <div className="dt-wrap"><table className="dt" style={{ minWidth: w + 'px' }}>
      <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c[1] + 'px' }} />)}</colgroup>
      <thead><tr>{cols.map((c, i) => <th key={i} className={c[2] || ''}>{c[0]}</th>)}</tr></thead>
      <tbody>{rows.length ? rows : <tr><td colSpan={cols.length} className="dt-empty">{empty}</td></tr>}</tbody>
    </table></div>
  );
}
type CellValue = string | number | null | undefined | false;
const dash = (v: CellValue): ReactNode => v ? v : <span className="muted">—</span>;
/** The original cell(v, sub, cls). `subTitle` is the sub's text when `sub` is markup (the original stripped the tags). */
function cell(v: CellValue, sub?: ReactNode, cls = 'val', subTitle?: string): ReactNode {
  return <>
    <span className={cls} title={String(v || '')}>{dash(v)}</span>
    {sub ? <span className="sub" title={subTitle ?? String(sub)}>{sub}</span> : null}
  </>;
}
function statusTag(st: string): ReactNode {
  if (st === 'In the final list') return <span className="tag tag-green">In the list</span>;
  if (st.startsWith('In the list')) return <span className="tag tag-amber">Not contactable</span>;
  return <span className="tag tag-red">Not in the list</span>;
}
function personaTag(p: string): ReactNode {
  return p === 'Primary' ? <span className="tag tag-violet">Primary</span> : p === 'Secondary' ? <span className="tag tag-grey">Secondary</span> : <span className="muted">None</span>;
}
const DOT: Record<Issue['severity'], string> = { stop: 'var(--neg)', flag: 'var(--warn)', info: 'var(--s300)' };
function issueCell(is: Issue[]): ReactNode {
  if (!is.length) return <span className="muted">—</span>;
  const first = is[0];
  return (
    <div style={sx('display:flex;gap:8px;align-items:flex-start')} title={is.map(i => `${i.issue}: ${i.outcome}. Fix: ${i.fix}`).join('\n')}>
      <span style={{ ...sx('width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:6px'), background: DOT[first.severity] }}></span>
      <div style={sx('min-width:0')}><span className="clamp2" style={sx('color:var(--i1);font-size:12px')}>{first.issue}</span>
        <span className="sub">{first.outcome + (is.length > 1 ? ` · +${is.length - 1} more` : '')}</span></div></div>
  );
}
const selectable = (c: Contact) => c.status.startsWith('In the');
const dqTone = (sc: number) => sc >= 90 ? 'var(--pos)' : sc >= 70 ? 'var(--warn)' : 'var(--neg)';
/** The ten checks' whole-file results, in CHECKS order (a list's `checks` follow STEPS, which start with them). */
const checkResults = (l: ListDetail): Map<CheckKey, StepResult> => new Map(CHECKS.map(([k], i) => [k, l.checks[i]]));
const sevTag = (s: Issue['severity']) => s === 'stop' ? <span className="tag tag-red">Stops the row</span> : s === 'flag' ? <span className="tag tag-amber">Flagged</span> : <span className="tag tag-grey">For information</span>;

/* One row of the Final list. Memoised so ticking one checkbox does not redraw every row. */
const ContactRow = memo(function ContactRow({ r, selected, onToggle }: { r: ContactRowData; selected: boolean; onToggle: (c: Contact, on: boolean) => void }) {
  const c = r.contact, a = r.account, issues = r.issues;
  const reason = (c.status.match(/\((.*)\)$/) || [])[1];
  const emailSub = c.emailRaw ? (c.email ? (c.emailVerified ? <span style={sx('color:var(--pos)')}>Verified</span> : <span style={sx('color:var(--warn)')}>Not verified</span>) : <span style={sx('color:var(--neg)')}>Malformed</span>) : '';
  const emailSubTitle = c.emailRaw ? (c.email ? (c.emailVerified ? 'Verified' : 'Not verified') : 'Malformed') : '';
  return (
    <tr style={selected ? sx('background:var(--brand-lt)') : undefined}>
      <td>{selectable(c) ? <input type="checkbox" checked={selected} onChange={e => onToggle(c, e.target.checked)} style={sx('cursor:pointer;vertical-align:middle')} /> : <span className="muted" title="Not in the list">—</span>}</td>
      <td><div className="person"><div className="co-av" style={{ background: avColor(c.company) }}>{initials(c.name)}</div><div>{cell(c.name, 'Row ' + c.row, 'dt-main')}</div></div></td>
      <td>{cell(c.company)}</td>
      <td>{cell(c.jobTitle)}</td>
      <td>{personaTag(c.persona)}</td>
      <td>{cell(c.emailRaw, emailSub, 'val', emailSubTitle)}</td>
      <td>{cell(c.linkedinRaw && c.linkedinRaw.replace(/^https?:\/\/(www\.)?/, ''))}</td>
      <td>{cell([c.city, c.country].filter(Boolean).join(', '))}</td>
      <td>{cell(a && a.industry)}</td>
      <td className="num">{a && a.employees != null ? a.employees.toLocaleString('en-US') : <span className="muted">—</span>}</td>
      <td>{c.reachableBy === 'none' ? <span style={sx('color:var(--neg)')}>No channel</span> : cell(upperFirst(c.reachableBy))}</td>
      <td>{c.optOut ? <span style={sx('color:var(--neg)')}>Opted out</span> : cell(c.consent)}</td>
      <td>{cell(c.owner)}</td>
      <td>{statusTag(c.status)}{reason ? <span className="sub" title={reason}>{upperFirst(reason)}</span> : null}</td>
      <td className="wrap">{issueCell(issues)}</td>
    </tr>
  );
});

const CONF_TAG: Record<Account['confidence'], ReactNode> = {
  high: <span className="tag tag-green">High</span>, medium: <span className="tag tag-amber">Medium</span>, low: <span className="tag tag-red">Low</span>,
};
const money = (n: number | null) => n == null ? '' : n >= 1e9 ? 'USD ' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'bn' : 'USD ' + Math.round(n / 1e6) + 'm';
const AccountRow = memo(function AccountRow({ r }: { r: AccountRowData }) {
  const a = r.account, n = r.contacts, prim = r.primary;
  const site = a.siteProcess ? [a.siteName, a.siteProcess].filter(Boolean).join(' · ') : '';
  const accountTypes: Record<string, { label?: string } | undefined> = DemandAI.CONFIG.accountTypes;
  return (
    <tr>
      <td><div className="person"><div className="co-av" style={{ background: avColor(a.name) }}>{initials(a.name)}</div><div>{cell(a.name, a.domain || '', 'dt-main')}</div></div></td>
      <td>{cell([a.city, a.country].filter(Boolean).join(', '))}</td>
      <td>{cell(a.industry)}</td>
      <td>{cell(a.vertical, upperFirst(a.verticalLevel))}</td>
      <td>{CONF_TAG[a.confidence]}</td>
      <td className="wrap"><span className="clamp2" title={a.classReason} style={sx('font-size:12px')}>{a.classReason}</span></td>
      <td>{cell((accountTypes[a.accountType] || {}).label || 'Other')}</td>
      <td>{cell(a.revenue != null ? money(a.revenue) : (a.employees != null ? a.employees.toLocaleString('en-US') + ' employees' : ''), a.revenue != null && a.employees != null ? a.employees.toLocaleString('en-US') + ' employees' : '')}</td>
      <td>{a.existingCustomer ? <span className="tag tag-blue">Existing</span> : <span className="muted">No</span>}</td>
      <td>{cell(site, a.siteCapacity ? Number(a.siteCapacity).toLocaleString('en-US') + ' ' + a.capacityUnit : '')}</td>
      <td>{cell(n + ' contact' + (n === 1 ? '' : 's'), prim ? prim + ' primary persona' : 'No primary persona')}</td>
      <td>{cell(a.owner)}</td>
      <td>{a.excluded ? <><span className="tag tag-red">Excluded</span><span className="sub" title={a.excludedReason}>{a.excludedReason}</span></> : <><span className="tag tag-green">Pass</span><span className="sub">Region · managed · contacts</span></>}</td>
    </tr>
  );
});

/* ═══════════════ THE CHECKS POP-UP: follows the server job ═══════════════ */
function ChecksOverlay({ ck, onDifferent, onView }: { ck: ChecksState; onDifferent: () => void; onView: () => void }) {
  const done = ck.phase === 'done' && ck.list;
  const s = ck.list?.stats;
  const t = done ? STEPS.length : 0;
  const fraction = done ? 1 : ck.total ? ck.done / ck.total : 0;
  return (
    <div id="checksOverlay" style={{ ...sx(OVERLAY_CSS), display: ck.shown ? 'flex' : 'none' }}>
      <div key={ck.key} role="dialog" aria-modal="true" aria-label={`Checking ${ck.fileName}`} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:520px;max-width:100%;max-height:90vh;display:flex;flex-direction:column')}>
        <div style={sx('padding:20px 22px 12px')}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1)')}>{`Checking ${ck.fileName}`}</div>
          <div style={sx('font-size:12px;color:var(--i3);margin-top:3px')}>{s ? `${s.rowsRead} rows · fixed rules, nothing fixed automatically` : 'Fixed rules, nothing fixed automatically'}</div>
          <div style={sx('height:4px;background:var(--s75);border-radius:2px;margin-top:12px;overflow:hidden')}><div id="ckBar" style={{ ...sx('height:100%;width:0;background:var(--brand);transition:width .3s var(--ease)'), width: (fraction * 100) + '%' }}></div></div>
        </div>
        <div style={sx('padding:0 22px;overflow-y:auto')}>
          {STEPS.map(([k, name, what], i) => {
            const res = done ? ck.list!.checks[i] : null;
            const ckCls = res ? 'ck ' + (res.sev === 'stop' ? 'ck-stop' : res.sev === 'warn' ? 'ck-warn' : res.sev === 'info' ? 'ck-info' : 'ck-ok') : ck.phase === 'running' && ck.stage === 'check' ? 'ck ck-run' : 'ck ck-wait';
            const tone = res ? (res.sev === 'stop' ? 'tag-red' : res.sev === 'warn' ? 'tag-amber' : res.sev === 'info' ? 'tag-grey' : 'tag-green') : '';
            return (
              <div key={k} className={i < t ? 'ck-row' : 'ck-row pending'} id={'ck-' + i}>
                <div className={ckCls} id={'ckc-' + i}>{res ? (res.sev ? '!' : '✓') : null}</div>
                <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>{name}</div><div style={sx('font-size:11px;color:var(--i3)')}>{what}</div></div>
                <div id={'ckr-' + i} style={sx('text-align:right;flex-shrink:0')}>{res ? <><span className={'tag ' + tone}>{res.label}</span>{res.rows ? <div style={sx('font-size:10.5px;color:var(--i3);margin-top:3px')}>{res.rows}</div> : null}</> : null}</div>
              </div>
            );
          })}
        </div>
        <div id="ckFoot" style={sx('padding:14px 22px 18px;display:flex;align-items:center;gap:8px;border-top:1px solid var(--border);margin-top:4px')}>
          {ck.phase === 'running' ? <span style={sx('flex:1;font-size:12px;color:var(--i3)')} role="status">{STAGE_TEXT[ck.stage] ?? 'Running checks…'}</span>
            : ck.phase === 'failed' ? <>
              <span style={sx('flex:1;font-size:12px;color:var(--neg)')} role="alert">{ck.error}</span>
              <button className="btn btn-primary btn-sm" onClick={onDifferent}>Upload a different file</button>
            </> : <>
              <span style={sx('flex:1;font-size:12px;color:var(--i2)')}><b>{s!.issues}</b>{` issue${s!.issues === 1 ? '' : 's'} · `}<b>{s!.accountsPass}</b>{` of ${s!.accounts} accounts pass · `}<b>{s!.inFinalList}</b> contacts in the list</span>
              <button className="btn btn-ghost btn-sm" onClick={onDifferent}>Upload a different file</button>
              <button className="btn btn-primary btn-sm" onClick={onView}>View the list →</button>
            </>}
        </div>
      </div>
    </div>
  );
}

const query = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

/* ═══════════════ THE SCREEN ═══════════════ */
export function ProspectingScreen() {
  const router = useRouter();
  const [screen, setScreen] = useState<'start' | 'run'>('start');
  const [startTab, setStartTab] = useState<StartTab>('upload');
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [run, setRun] = useState<ListDetail | null>(null);
  const [view, setView] = useState<View>('list');
  const [filt, setFilt] = useState('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim().toLowerCase());
  const [sel, setSel] = useState<Map<number, Contact>>(() => new Map());
  const [unattached, setUnattached] = useState<Issue[]>([]);
  const [checks, setChecks] = useState<ChecksState | null>(null);
  // Column mapping (G-040): offered when the file lacks required template columns.
  const [mappings, setMappings] = useState<{ id: string; name: string }[]>([]);
  const [mapChoice, setMapChoice] = useState<Record<string, string>>({});
  const [mapName, setMapName] = useState('');
  const [savedMapping, setSavedMapping] = useState('');
  const [save, setSave] = useState<SaveState | null>(null);
  const [pane, setPane] = useState<PaneState | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const dropRef = useRef<HTMLLabelElement>(null);
  const listNameRef = useRef<HTMLInputElement>(null);
  const selAllRef = useRef<HTMLInputElement>(null);

  const refreshLists = useCallback(async () => {
    try { setLists((await api<{ lists: ListSummary[] }>('/api/lists')).lists); }
    catch (e) { showToast(errorText(e)); }
  }, []);

  const openList = useCallback(async (id: string, keepUrl = false) => {
    try {
      const { list } = await api<{ list: ListDetail }>(`/api/lists/${id}`);
      setRun(list); setView('list'); setFilt('all'); setQ(''); setSel(new Map()); setScreen('run');
      if (!keepUrl) router.replace('/prospecting?list=' + encodeURIComponent(id), { scroll: false });
    } catch (e) { showToast(errorText(e)); }
  }, [router]);

  // On load: the saved lists, and the list named in the address (a reload keeps the list open).
  useEffect(() => {
    void refreshLists();
    const id = new URLSearchParams(window.location.search).get('list');
    if (id) void openList(id, true);
  }, [refreshLists, openList]);

  function renderStart(tab?: StartTab) {
    setRun(null); setPaneOpen(false);
    if (tab) setStartTab(tab);
    void refreshLists();
    setScreen('start');
    router.replace('/prospecting', { scroll: false });
  }

  async function removeList(id: string) {
    try {
      const r = await api<{ runs: number }>(`/api/lists/${id}`, { method: 'DELETE' });
      showToast(r.runs ? `List deleted, with its ${r.runs} scored list${r.runs === 1 ? '' : 's'}` : 'List deleted');
    } catch (e) { showToast(errorText(e)); }
    renderStart('saved');
  }
  function downloadTemplate() { void download('lead_template.csv', DemandAI.toCSV([DemandAI.LEAD_COLUMNS])); }

  /* ─── upload, then follow the job ─── */
  async function follow(fileName: string, start: () => Promise<{ jobId: string | null }>) {
    setChecks(c => ({ key: (c ? c.key : 0) + 1, shown: true, fileName, phase: 'running', stage: 'queued', done: 0, total: STAGE_TOTAL, list: null, error: '' }));
    try {
      const { jobId } = await start();
      const job: JobState = await waitForJob(jobId!, j => setChecks(c => c && { ...c, stage: j.stage ?? 'queued', done: j.progress.done, total: j.progress.stages.length || STAGE_TOTAL }));
      if (job.status !== 'succeeded') throw new JobFailed(job.error?.message ?? 'The checks did not finish. Try again.');
      const { list } = await api<{ list: ListDetail }>(`/api/lists/${job.progress.result!.listId}`);
      setRun(list); setView('list'); setFilt('all'); setQ(''); setSel(new Map());
      setChecks(c => c && { ...c, phase: 'done', done: c.total, list });
      router.replace('/prospecting?list=' + encodeURIComponent(list.id), { scroll: false });
    } catch (e) {
      setChecks(c => c && { ...c, phase: 'failed', error: e instanceof JobFailed ? e.message : e instanceof ApiError ? errorText(e) : 'The upload did not reach DemandAI. Check your connection and try again.' });
    }
  }
  function onFile(file: File | undefined) {
    if (!file) return;
    void follow(file.name, () => uploadFile<{ jobId: string }>('/api/uploads', { kind: 'lead' }, file));
  }
  function onUseSample() { void follow(DemandAISample.LEAD_FILE, () => api<{ jobId: string }>('/api/uploads/sample', { body: { kind: 'lead' } })); }
  const hideChecks = () => setChecks(c => c && { ...c, shown: false });

  /* ─── column mapping: map the missing template columns to the file's own, then check the stored file again ─── */
  const needsMapping = !!run && run.missingColumns.length > 0;
  useEffect(() => {
    if (!needsMapping) return;
    let live = true;
    api<{ mappings: { id: string; name: string }[] }>('/api/column-mappings?kind=lead').then(r => { if (live) setMappings(r.mappings); }).catch(() => {});
    return () => { live = false; };
  }, [needsMapping]);
  async function recheck(mappingId: string) {
    if (!run) return;
    const uploadId = run.uploadId;
    await follow(run.sourceFile, () => api<{ jobId: string }>(`/api/uploads/${uploadId}/recheck`, { body: { mappingId } }));
  }
  async function saveAndRecheck() {
    if (!run) return;
    const mapping = Object.fromEntries(Object.entries(mapChoice).filter(([, from]) => from).map(([to, from]) => [from, to]));
    try {
      const { id } = await api<{ id: string }>('/api/column-mappings', { body: { kind: 'lead', name: mapName.trim() || run.sourceFile.replace(/\.[^.]+$/, '') + ' columns', mapping } });
      setMapChoice({});
      await recheck(id);
    } catch (e) { showToast(errorText(e)); }
  }

  /* ─── drop zone ─── */
  const dzOver = (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); dropRef.current!.style.borderColor = 'var(--brand)'; };
  const dzLeave = () => { dropRef.current!.style.borderColor = 'var(--bdk)'; };
  const dzDrop = (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); dropRef.current!.style.borderColor = 'var(--bdk)'; if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); };

  /* ─── rename a saved list ─── */
  function startRename(id: string) { setRenamingId(id); }
  async function finishRename(id: string, name: string) {
    const l = lists.find(x => x.id === id);
    setRenamingId(null);
    if (l && name && name !== l.name) {
      try { await api(`/api/lists/${id}`, { method: 'PATCH', body: { name } }); showToast('List renamed'); }
      catch (e) { showToast(errorText(e)); }
    }
    void refreshLists();
  }

  /* ─── results: a page at a time from the server, filters and search there too ─── */
  const listId = run?.id;
  const contactsUrl = listId && screen === 'run' && view === 'list' ? `/api/lists/${listId}/contacts?` + query({ group: filt === 'all' ? undefined : filt, q: dq, limit: PAGE }) : null;
  const accountsUrl = listId && screen === 'run' && view === 'accounts' ? `/api/lists/${listId}/accounts?` + query({ filter: filt === 'all' ? undefined : filt, q: dq, limit: PAGE }) : null;
  const contacts = usePaged<ContactRowData>(contactsUrl);
  const accounts = usePaged<AccountRowData>(accountsUrl);
  useEffect(() => {
    if (!listId) return;
    let live = true;
    api<{ issues: Issue[] }>(`/api/lists/${listId}/issues`).then(r => { if (live) setUnattached(r.issues); }).catch(() => { if (live) setUnattached([]); });
    return () => { live = false; };
  }, [listId]);
  const visibleContacts = contacts.rows;
  const visibleAccounts = accounts.rows;

  /* ─── data quality: the check pane, its findings a page at a time from the server ─── */
  const findings = usePaged<Issue>(pane && paneOpen ? `/api/lists/${pane.list.id}/issues?` + query({ check: pane.check, limit: 50 }) : null);
  function openCheckPane(check: CheckKey, list?: ListDetail) {
    const l = list ?? pane?.list ?? run;
    if (!l) return;
    setPane({ list: l, check }); setPaneOpen(true);
  }
  /** The first check with findings, as the original opened it. */
  const firstCheck = (l: ListDetail): CheckKey => CHECKS.map(c => c[0]).find(k => (checkResults(l).get(k)?.n ?? 0) > 0) ?? 'columns';
  async function openListQuality(id: string) {
    try {
      const { list } = await api<{ list: ListDetail }>(`/api/lists/${id}`);
      if (!list.quality) { showToast('This list was saved before data quality was kept with it'); return; }
      openCheckPane(firstCheck(list), list);
    } catch (e) { showToast(errorText(e)); }
  }

  const toggleSel = useCallback((c: Contact, on: boolean) => {
    setSel(prev => { const s = new Map(prev); if (on) s.set(c.row, c); else s.delete(c.row); return s; });
  }, []);
  const selVisible = (visibleContacts ?? []).filter(r => selectable(r.contact));
  function toggleAll(on: boolean) {
    setSel(prev => { const s = new Map(prev); selVisible.forEach(r => on ? s.set(r.contact.row, r.contact) : s.delete(r.contact.row)); return s; });
  }
  function clearSel() { setSel(new Map()); }
  const allChecked = selVisible.length > 0 && selVisible.every(r => sel.has(r.contact.row));
  const someChecked = !allChecked && selVisible.some(r => sel.has(r.contact.row));
  useEffect(() => { if (selAllRef.current) selAllRef.current.indeterminate = someChecked; });

  /* ─── save and hand off ─── */
  function openSave(go: boolean, selOnlyArg?: boolean) {
    if (!run) return;
    const selOnly = !!selOnlyArg;
    const saved = !selOnly && run.status === 'saved';
    const base = saved ? run.name : run.sourceFile.replace(/\.[^.]+$/, '') + (selOnly ? ` · ${sel.size} selected` : '') + ' · ' + new Date().toISOString().slice(0, 10);
    const selAccounts = new Set([...sel.values()].map(c => c.accountId)).size;
    const text = (selOnly ? `The ${sel.size} selected prospects, at ${selAccounts} account${selAccounts === 1 ? '' : 's'}.` : `${run.visible.accounts.pass} accounts that pass the knock-outs, with ${run.visible.contacts.in} contacts in the list.`) + ' It appears under Saved lists and in Scoring.';
    setSave(sv => ({ key: (sv ? sv.key : 0) + 1, shown: true, go, saved, selOnly, base, text }));
    setTimeout(() => { const el = listNameRef.current; if (el) { el.focus(); el.select(); } }, 30);
  }
  const hideSave = () => setSave(sv => sv && { ...sv, shown: false });
  async function saveList(go: boolean) {
    if (!run || !save) return;
    const name = (listNameRef.current ? listNameRef.current.value : '').trim() || run.sourceFile;
    try {
      const r = await api<{ listId: string }>(`/api/lists/${run.id}/save`, { body: { name, ...(save.selOnly ? { contactRows: [...sel.keys()] } : {}) } });
      hideSave();
      if (go) { router.push('/scoring?list=' + encodeURIComponent(r.listId)); return; }
      showToast(`Saved as "${name}"`);
      if (!save.selOnly) setRun((await api<{ list: ListDetail }>(`/api/lists/${run.id}`)).list);
    } catch (e) { showToast(errorText(e)); }
  }

  /* ═══════════════ RENDER ═══════════════ */
  function renderStartView(): ReactNode {
    const t = (id: StartTab, label: string, n?: number) => (
      <div className={`ftab ${startTab === id ? 'active' : ''}`} onClick={() => renderStart(id)}>{n !== undefined ? <>{label + ' '}<span className="ftab-cnt">{n}</span></> : label}</div>
    );
    return <>
      <div className="topbar"><div className="topbar-l"><span className="tb-title">Lead discovery and research</span><span className="tb-badge badge-neutral">Stages 1–5 · rules only</span></div></div>
      <div className="ftabs">{t('upload', 'Upload')}{t('saved', 'Saved lists', lists.length)}</div>
      <div className="canvas">{startTab === 'upload' ? (
        <div style={sx('max-width:640px;margin:24px auto 0')}>
          <div style={sx('font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand);margin-bottom:8px')}>Step 1 · Prospecting</div>
          <div style={sx('font-family:var(--fd);font-size:22px;font-weight:700;color:var(--i1);margin-bottom:6px')}>Upload the lead file</div>
          <div style={sx('font-size:13px;color:var(--i3);margin-bottom:18px;line-height:1.55')}>One row per contact, in the lead template&apos;s columns (any order). Every row is checked by fixed rules, not AI: validation, classification, knock-outs and suppression. Nothing is fixed silently.</div>
          <label id="dropZone" htmlFor="fileInput" ref={dropRef} onDragOver={dzOver} onDragLeave={dzLeave} onDrop={dzDrop} style={sx('display:block;border:1.5px dashed var(--bdk);border-radius:var(--rlg);padding:34px 24px;cursor:pointer;background:var(--surf);text-align:center')}>
            <input type="file" id="fileInput" accept=".csv,.xlsx,.xls" style={sx('display:none')} onChange={e => { onFile(e.target.files ? e.target.files[0] : undefined); e.target.value = ''; }} />
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--i3)" strokeWidth="1.5" strokeLinecap="round" style={sx('margin-bottom:8px')}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div style={sx('font-size:13px;font-weight:600;color:var(--i1)')}>Click to choose a file, or drop it here</div>
            <div style={sx('font-size:11px;color:var(--i3);margin-top:4px')}>.xlsx or .csv · the lead template, filled in</div>
          </label>
          <div style={sx('display:flex;gap:8px;margin:12px 0 18px;flex-wrap:wrap')}>
            <button className="btn btn-primary btn-sm" onClick={onUseSample}>Use sample data</button>
            <button className="btn btn-sec btn-sm" onClick={downloadTemplate}>Download lead template (.csv)</button>
          </div>
          <div style={sx('padding:12px 14px;background:var(--sec-lt);border-radius:var(--rmd);font-size:11.5px;color:var(--sec-dk);line-height:1.6')}>
            <b>Required:</b>{` ${DemandAI.LEAD_REQUIRED.join(', ')}, plus an email or a LinkedIn URL.`}<br />
            {' '}<b>Pilot region:</b>{` ${DemandAI.CONFIG.pilotCountries.join(', ')}.`}<br />
            {' '}The file is checked on the server as a background job, and the list is kept for your business unit.
          </div>
        </div>) : (
        <div className="score-list">
          <Table cols={[['List', 300], ['Source file', 220], ['Data quality', 160], ['Accounts', 120, 'num'], ['In the list', 130, 'num'], ['Saved', 190], ['', 190]]}
            rows={lists.map(l => (
              <tr key={l.id}>
                <td><div className="person"><div className="co-av" style={{ background: avColor(l.id) }}>{initials(l.name)}</div><div style={sx('flex:1')}>{renamingId === l.id
                  ? <RenameField initial={l.name} onDone={name => void finishRename(l.id, name)} onCancel={() => setRenamingId(null)} />
                  : <><div style={sx('display:flex;align-items:center;gap:6px;min-width:0')}><span className="dt-main" title={l.name}>{l.name}</span><button title="Rename" aria-label={`Rename ${l.name}`} onClick={() => startRename(l.id)} style={sx('flex-shrink:0;color:var(--i3);display:flex;padding:2px')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button></div><span className="sub">{l.scored ? 'Scored' : 'Not scored yet'}</span></>}</div></div></td>
                <td>{cell(l.sourceFile)}</td>
                <td>{l.quality ? <a href="#" className="dq-link" title="Open the checks" onClick={e => { e.preventDefault(); void openListQuality(l.id); }}><b style={{ color: dqTone(l.quality.clean) }}>{l.quality.clean}%</b> clean<span className="sub">{`${l.stats.issues} finding${l.stats.issues === 1 ? '' : 's'} · open →`}</span></a> : <span className="muted">Not kept</span>}</td>
                <td className="num">{l.stats.accountsPass}<span className="sub">{`of ${l.stats.accounts}`}</span></td>
                <td className="num">{l.stats.inFinalList}<span className="sub">contacts</span></td>
                <td>{cell(new Date(l.savedAt ?? l.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), new Date(l.savedAt ?? l.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))}</td>
                <td style={sx('text-align:right')}><Link className="btn btn-sec btn-sm" style={sx('text-decoration:none')} href={'/scoring?list=' + encodeURIComponent(l.id)}>Score →</Link>{' '}<button className="btn btn-ghost btn-sm" onClick={() => void removeList(l.id)}>Delete</button></td>
              </tr>))}
            empty={<>No saved lists yet. <a href="#" onClick={e => { e.preventDefault(); renderStart('upload'); }} style={sx('color:var(--brand);font-weight:600')}>Upload a lead file</a> to build one.</>} />
        </div>)}
      </div>
    </>;
  }

  function toolbar(pills: ReactNode, placeholder: string): ReactNode {
    return (
      <div className="sl-toolbar">
        <div className="sl-srch"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={sx('color:var(--i3);flex-shrink:0')}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" placeholder={placeholder} aria-label={placeholder} value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="sl-seg-filter">{pills}</div></div>
    );
  }
  const pill = (id: string, label: string) => <div className={`seg-pill ${filt === id ? 'active' : ''}`} onClick={() => setFilt(id)}>{label}</div>;
  function moreButton(page: { next: number | null; busy: boolean; more: () => Promise<void> }, shown: number, total: number | null): ReactNode {
    if (page.next === null) return null;
    return <div style={sx('display:flex;justify-content:center;padding:12px')}><button className="btn btn-sec btn-sm" disabled={page.busy} onClick={() => void page.more()}>{total !== null ? `Show more (${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} shown)` : `Show more (${shown.toLocaleString('en-US')} shown)`}</button></div>;
  }

  function renderRunView(r: ListDetail): ReactNode {
    const s = r.stats, v = r.visible;
    const tab = (id: View, label: string, n: number) => <div className={`ftab ${view === id ? 'active' : ''}`} onClick={() => { setView(id); setFilt('all'); setQ(''); }}>{label + ' '}<span className="ftab-cnt">{n}</span></div>;
    const off = v.accounts.pass ? {} : { disabled: true, style: sx('opacity:.5;cursor:not-allowed') };
    const n = sel.size;
    return <>
      <div className="topbar">
        <div className="topbar-l"><span className="tb-title">{r.status === 'saved' ? r.name : r.sourceFile}</span>
          <span className="tb-badge badge-neutral">{r.sheet}</span></div>
        <div className="topbar-r">
          <button className="btn btn-sec btn-sm" onClick={() => renderStart('upload')}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Upload a different file</button>
          <button className="btn btn-sec btn-sm" onClick={() => openSave(false)} {...off}>{r.status === 'saved' ? 'Saved ✓' : 'Save list'}</button>
          <button id="goScoring" className="btn btn-primary btn-sm" onClick={() => openSave(true, sel.size > 0)} {...off}>{n ? `Send ${n} selected to Scoring →` : 'Save and go to Scoring →'}</button>
        </div>
      </div>
      <div className="ftabs">{tab('list', 'Final list', v.contacts.all)}{tab('accounts', 'Accounts', v.accounts.all)}</div>
      <div className="canvas">
        <div className="stats">
          {statLink('Rows read', 'sv1', s.rowsRead, `${s.notLoaded} not loaded · ${s.merged} merged duplicate${s.merged === 1 ? '' : 's'}`, 'Show every contact', () => go('list', 'all'))}
          {statLink('Issues', 'sv3', s.issues, `${s.issuesBySeverity.stop} stop · ${s.issuesBySeverity.flag} flagged · ${s.issuesBySeverity.info} info`, 'Open the checks and what they found', () => openCheckPane(firstCheck(r), r))}
          {statLink('Accounts', 'sv2', v.accounts.all, `${v.accounts.pass} pass the knock-outs`, 'Show the accounts that pass', () => go('accounts', 'pass'))}
          {statLink('Excluded', 'sv5', v.accounts.excluded, 'knock-out rule, logged', 'Show the excluded accounts and why', () => go('accounts', 'excluded'))}
          {statLink('In the final list', 'sv4', v.contacts.in, `of ${v.contacts.all} contacts`, 'Show the contacts in the final list', () => go('list', 'in'))}
        </div>
        {r.scope === 'own' ? <div style={sx('font-size:11.5px;color:var(--i3);margin:-4px 0 12px')}>You see the contacts and accounts you own. Rows read, issues and % clean count the whole file.</div> : null}
        {dqCard(r)}
        {readinessPanel(r)}
        {needsMapping ? mappingPanel(r) : null}
        {view === 'list' ? renderListTab(r) : renderAccountsTab(r)}
      </div>
    </>;
  }

  function go(to: View, f: string) { setView(to); setFilt(f); setQ(''); }
  function statLink(label: string, cls: string, value: number, sub: string, tip: string, onGo: () => void): ReactNode {
    return <a className="stat stat-link" href="#" title={tip} onClick={e => { e.preventDefault(); onGo(); }}><div className="stat-lbl">{label}</div><div className={'stat-val ' + cls}>{value}</div><div className="stat-sub">{sub}</div></a>;
  }

  /* The original dqCard: % of rows clean, then each check that found something, worst first by colour. */
  function dqCard(r: ListDetail): ReactNode {
    if (!r.quality) return null;
    const sc = r.quality.clean, tone = dqTone(sc), res = checkResults(r);
    const found = CHECKS.filter(([k]) => (res.get(k)?.n ?? 0) > 0), passed = CHECKS.length - found.length;
    const dot = (k: CheckKey) => res.get(k)?.sev || 'info';
    return (
      <div className="dq2"><span className="dq2-v" style={{ color: tone }}>{sc}%</span><span className="dq2-l">rows clean</span>
        <span className="dq2-bar" title={`${sc}% of rows have no issue`}><i style={{ width: sc + '%', background: tone }}></i></span>
        <span className="dq2-sep"></span>
        {found.length ? found.map(([k, name]) => <button key={k} className="dq2-c" onClick={() => openCheckPane(k, r)} title={name}><i className={'dq2-d ' + dot(k)}></i>{CHECK_SHORT[k]}<b>{res.get(k)!.n}</b></button>) : <span className="dq2-ok">✓ Every check passed</span>}
        {found.length ? <span className="dq2-p">{`${passed} passed`}</span> : null}
        <button className="dq2-all" onClick={() => openCheckPane((found[0] || CHECKS[0])[0], r)}>All checks →</button></div>
    );
  }

  /* Readiness (spec 3.3): shown before the list goes to Scoring, as a warning; it never blocks saving or scoring. */
  function readinessPanel(r: ListDetail): ReactNode {
    if (!r.readiness) return null;
    const short = r.readiness.filter(c => !c.ok);
    if (!short.length) return <div style={sx('font-size:12px;color:var(--pos);margin:-4px 0 12px')} role="status">{'✓ Ready for measurement: ' + r.readiness.map(c => `${c.k.toLowerCase()} ${c.show}`).join(' · ')}</div>;
    return (
      <div className="panel" style={sx('margin-bottom:12px;border-color:var(--warn)')}><div className="panel-body" style={sx('font-size:12px;color:var(--i2);line-height:1.7')}>
        <b>Not ready for measurement yet.</b> You can still save and score this list; the pilot&apos;s readiness checks ask for more:
        {short.map(c => <div key={c.k}><b>{c.k}</b>{`: ${c.show}, needs ${c.need}. `}<span style={sx('color:var(--i3)')}>{`To fix: ${c.fix}.`}</span></div>)}
      </div></div>
    );
  }

  function mappingPanel(r: ListDetail): ReactNode {
    const label = sx('font-size:11px;font-weight:600;color:var(--i2)');
    const field = sx('padding:6px 9px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12.5px;background:var(--surf);color:var(--i1)');
    return (
      <div className="panel" style={sx('margin-bottom:12px;border-color:var(--warn)')}>
        <div className="panel-hdr"><span className="panel-ttl">{`${r.missingColumns.length} required column${r.missingColumns.length === 1 ? '' : 's'} not found in this file`}</span></div>
        <div className="panel-body" style={sx('display:flex;flex-direction:column;gap:10px;font-size:12px;color:var(--i2)')}>
          <div>Choose which of the file&apos;s columns holds each one. The mapping is saved for your business unit, and this file is checked again without sending it again.</div>
          {r.missingColumns.map(col => (
            <div key={col} style={sx('display:flex;align-items:center;gap:10px')}>
              <label htmlFor={'map-' + col} style={{ ...label, ...sx('width:170px;font-family:var(--fm)') }}>{col}</label>
              <select id={'map-' + col} value={mapChoice[col] ?? ''} onChange={e => setMapChoice(m => ({ ...m, [col]: e.target.value }))} style={{ ...field, ...sx('flex:1') }}>
                <option value="">Not in this file</option>
                {r.fileColumns.map(fc => <option key={fc} value={fc}>{fc}</option>)}
              </select>
            </div>
          ))}
          <div style={sx('display:flex;align-items:center;gap:10px')}>
            <label htmlFor="mapName" style={{ ...label, ...sx('width:170px') }}>Save the mapping as</label>
            <input id="mapName" value={mapName} placeholder={r.sourceFile.replace(/\.[^.]+$/, '') + ' columns'} onChange={e => setMapName(e.target.value)} style={{ ...field, ...sx('flex:1') }} />
            <button className="btn btn-primary btn-sm" disabled={!Object.values(mapChoice).some(Boolean)} onClick={() => void saveAndRecheck()}>Save and check again</button>
          </div>
          {mappings.length ? <div style={sx('display:flex;align-items:center;gap:10px')}>
            <label htmlFor="savedMapping" style={{ ...label, ...sx('width:170px') }}>Or use a saved mapping</label>
            <select id="savedMapping" value={savedMapping} onChange={e => setSavedMapping(e.target.value)} style={{ ...field, ...sx('flex:1') }}>
              <option value="">Choose…</option>
              {mappings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className="btn btn-sec btn-sm" disabled={!savedMapping} onClick={() => void recheck(savedMapping)}>Check again</button>
          </div> : null}
        </div>
      </div>
    );
  }

  /* The original openCheckPane: the ten checks, what each is for, and every finding in this file. */
  function checkPaneBody(p: PaneState): ReactNode {
    const l = p.list, res = checkResults(l), k = p.check;
    const [, , what] = CHECKS.find(c => c[0] === k)!, [why, tip] = CHECK_HELP[k];
    const n = res.get(k)?.n ?? 0, rows = findings.rows, total = findings.total;
    const byCode = l.quality ? (Object.entries(l.quality.byCode) as [DqCode, number][]).filter(([, c]) => c > 0) : [];
    return <>
      <div className="dqp-nav">{CHECKS.map(([kk, nm]) => { const m = res.get(kk)?.n ?? 0; return <button key={kk} className={kk === k ? 'on' : ''} onClick={() => openCheckPane(kk)} title={nm}>{CHECK_SHORT[kk]}{m ? <>{' '}<b>{m}</b></> : null}</button>; })}</div>
      <div className="dqp-b"><div className="dqp-k">What it checks</div><div>{what}</div></div>
      <div className="dqp-b"><div className="dqp-k">Why it matters</div><div>{why}</div></div>
      <div className="dqp-b dqp-tip"><div className="dqp-k">For the next upload</div><div>{tip}</div></div>
      <div className="dqp-k" style={sx('margin:14px 0 6px;display:flex;justify-content:space-between;align-items:center')}>{n ? `Found in this file · ${n}` : 'Nothing found in this file'}
        {n ? <a className="btn btn-ghost btn-sm" style={sx('text-decoration:none')} href={`/api/lists/${l.id}/issues.csv?` + query({ check: k })} download>↓ CSV</a> : null}</div>
      {n && total !== null && total < n ? <div style={sx('font-size:11.5px;color:var(--i3);margin-bottom:6px')}>{`You see the ${total} on your own rows and about the whole file.`}</div> : null}
      {!n ? <div className="dqp-ok">✓ Every row passed this check.</div> : rows === null ? <div style={sx('font-size:12px;color:var(--i3)')}>Loading…</div>
        : rows.map((i, x) => <div key={x} className="dqp-i"><div className="dqp-ih"><b>{i.row === '—' ? 'Whole file' : 'Row ' + i.row}</b><span className="dqp-f">{i.field || ''}</span>{sevTag(i.severity)}</div>
          <div className="dqp-t">{i.issue}</div><div className="dqp-o">{'What happens: ' + (i.outcome || '')}</div>{i.fix ? <div className="dqp-o">{'How to fix: ' + i.fix}</div> : null}</div>)}
      {findings.next !== null ? <div style={sx('display:flex;justify-content:center;padding:6px')}><button className="btn btn-sec btn-sm" disabled={findings.busy} onClick={() => void findings.more()}>{`Show more (${(rows ?? []).length} of ${total ?? n} shown)`}</button></div> : null}
      <div className="dqp-b" style={sx('margin-top:14px')}><div className="dqp-k" style={sx('display:flex;justify-content:space-between;align-items:center')}>Validation report
        <a className="btn btn-ghost btn-sm" style={sx('text-decoration:none')} href={`/api/lists/${l.id}/report.csv`} download>↓ CSV</a></div>
        <div style={sx('font-size:12px;color:var(--i2)')}>{byCode.length ? byCode.map(([code, c]) => `${code} ${DemandAI.CODES[code]}: ${c.toLocaleString('en-US')}`).join(' · ') : 'No finding carries a D-code.'}</div>
        <div style={sx('font-size:11px;color:var(--i3);margin-top:3px')}>Every finding with its check and D-code, in file order.</div></div>
    </>;
  }

  function unattachedNotice(): ReactNode {
    const un = unattached;
    if (!un.length) return null;
    return (
      <div className="panel" style={sx('margin-bottom:12px;border-color:var(--warn)')}><div className="panel-body" style={sx('font-size:12px;color:var(--i2);line-height:1.7')}>
        <b>{`${un.length} issue${un.length > 1 ? 's' : ''} not on any contact in the list`}</b> (rows not loaded, or about the whole file):
        {' '}{un.map((i, k) => <div key={k}><b>{i.row === '—' ? 'File' : 'Row ' + i.row}</b>{` · ${i.field}: ${i.issue}. `}<span style={sx('color:var(--i3)')}>{`${i.outcome}. Fix: ${i.fix}`}</span></div>)}
      </div></div>
    );
  }

  function renderListTab(r: ListDetail): ReactNode {
    const n = sel.size;
    const total = dq ? null : filt === 'all' ? r.visible.contacts.all : r.visible.contacts[filt as 'in' | 'nc' | 'out'];
    const cols: Col[] = [[<input key="selAll" type="checkbox" id="selAll" ref={selAllRef} title="Select all shown" aria-label="Select all shown" checked={allChecked} onChange={e => toggleAll(e.target.checked)} style={sx('cursor:pointer;vertical-align:middle')} />, 58], ['Contact', 220], ['Account', 190], ['Job title', 210], ['Persona', 140], ['Email', 270], ['LinkedIn', 250], ['Location', 190], ['Industry', 180], ['Employees', 120, 'num'], ['Reachable by', 170], ['Consent', 170], ['Owner', 220], ['Status', 230], ['Issues', 290]];
    return <>
      {unattachedNotice()}<div className="score-list">
        <div id="selBar" className="sl-toolbar" style={{ ...sx('display:none;background:var(--brand-lt);align-items:center'), display: n ? 'flex' : 'none' }}>
          <span id="selCount" style={sx('font-size:12.5px;font-weight:600;color:var(--brand-dk)')}>{n ? `${n} prospect${n === 1 ? '' : 's'} selected` : ''}</span>
          <button className="btn btn-ghost btn-sm" onClick={clearSel}>Clear</button>
        </div>
        {toolbar(<>{pill('all', 'All')}{pill('in', 'In the final list')}{pill('nc', 'Not contactable')}{pill('out', 'Not in the list')}</>, 'Search name, company or title…')}
        <div id="rows"><Table cols={cols} empty={visibleContacts ? 'No contacts match.' : 'Loading…'}
          rows={(visibleContacts ?? []).map(row => <ContactRow key={row.contact.row} r={row} selected={sel.has(row.contact.row)} onToggle={toggleSel} />)} /></div>
        {visibleContacts ? moreButton(contacts, visibleContacts.length, total) : null}</div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>One row per contact: what Lead discovery hands to Scoring. Scroll sideways for more columns; hover a cell for its full text.</div>
    </>;
  }

  function renderAccountsTab(r: ListDetail): ReactNode {
    const total = dq ? null : filt === 'all' ? r.visible.accounts.all : filt === 'pass' ? r.visible.accounts.pass : filt === 'excluded' ? r.visible.accounts.excluded : r.visible.accounts.review;
    const cols: Col[] = [['Account', 240], ['Location', 190], ['Industry (as held)', 180], ['Vertical', 160], ['Confidence', 130], ['Classification', 300], ['Account type', 170], ['Size', 170], ['Customer', 120], ['Site', 240], ['Contacts', 230], ['Owner', 220], ['Knock-outs', 260]];
    return <>
      <div className="score-list">
        {toolbar(<>{pill('all', 'All')}{pill('pass', 'Pass')}{pill('excluded', 'Excluded')}{pill('review', 'Needs review')}</>, 'Search accounts…')}
        <div id="rows"><Table cols={cols} empty={visibleAccounts ? 'No accounts match.' : 'Loading…'}
          rows={(visibleAccounts ?? []).map(row => <AccountRow key={row.id} r={row} />)} /></div>
        {visibleAccounts ? moreButton(accounts, visibleAccounts.length, total) : null}</div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>One row per account. The installed-base knock-out runs in Scoring, from the signal file. Scroll sideways for more columns; hover a cell for its full text.</div>
    </>;
  }

  return <>
    <main className="main" id="mainArea">{screen === 'run' && run ? renderRunView(run) : renderStartView()}</main>

    <div className={'detail-drawer' + (paneOpen ? ' open' : '')} id="detailDrawer" style={{ width: '480px' }}>
      <div className="drawer-hdr">
        <div>
          <div className="drawer-title" id="detTitle">{pane ? CHECKS.find(c => c[0] === pane.check)![1] : ''}</div>
          <div className="drawer-sub" id="detSub">{pane ? `${pane.list.sourceFile} · ${(checkResults(pane.list).get(pane.check)?.n ?? 0) ? `${checkResults(pane.list).get(pane.check)!.n} found` : 'passed'}` : ''}</div>
        </div>
        <div className="drawer-close" role="button" tabIndex={0} aria-label="Close" onClick={() => setPaneOpen(false)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setPaneOpen(false); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </div>
      </div>
      <div className="drawer-body" id="detBody">{pane ? checkPaneBody(pane) : null}</div>
    </div>

    {checks ? <ChecksOverlay ck={checks}
      onDifferent={() => { hideChecks(); renderStart('upload'); }}
      onView={() => { hideChecks(); setScreen('run'); }} /> : null}

    {save ? (
      <div id="saveOverlay" style={{ ...sx(OVERLAY_CSS), display: save.shown ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) hideSave(); }}>
        <div key={save.key} role="dialog" aria-modal="true" aria-label={save.saved ? 'Update the saved list' : 'Save the screened list'} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:440px;max-width:100%;padding:20px 22px')}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:4px')}>{save.saved ? 'Update the saved list' : 'Save the screened list'}</div>
          <div style={sx('font-size:12px;color:var(--i3);margin-bottom:14px;line-height:1.5')}>{save.text}</div>
          {run?.readiness?.some(c => !c.ok) ? <div role="status" style={sx('font-size:12px;color:var(--warn);margin:-6px 0 14px;line-height:1.5')}>{'Not ready for measurement yet: ' + run.readiness.filter(c => !c.ok).map(c => `${c.k.toLowerCase()} ${c.show} (needs ${c.need})`).join('; ') + '. You can still save and score it.'}</div> : null}
          <label htmlFor="listName" style={sx('font-size:11px;font-weight:600;color:var(--i2)')}>List name</label>
          <input id="listName" ref={listNameRef} defaultValue={save.base} style={sx('width:100%;margin:5px 0 18px;padding:9px 11px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px')} onKeyDown={e => { if (e.key === 'Enter') void saveList(save.go); }} />
          <div style={sx('display:flex;gap:8px;justify-content:flex-end')}>
            <button className="btn btn-ghost btn-sm" onClick={hideSave}>Cancel</button>
            <button className={`btn ${save.go ? 'btn-sec' : 'btn-primary'} btn-sm`} onClick={() => void saveList(false)}>Save</button>
            <button className={`btn ${save.go ? 'btn-primary' : 'btn-sec'} btn-sm`} onClick={() => void saveList(true)}>Save and go to Scoring →</button>
          </div></div>
      </div>) : null}
  </>;
}

const STAGE_TOTAL = 3;
