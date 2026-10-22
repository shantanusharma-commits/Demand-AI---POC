'use client';

/* Prospecting (was legacy/10-prospecting.html): upload a lead file, run the fixed checks, review the final list and
   accounts, save the list for Scoring. Markup, text and timings match the original page.
   The file is screened on the server and stays there: the screen holds one page of rows at a time, and search, filter,
   sort and paging are answered by the server, so a list of 7,000+ leads opens as fast as one of 20. The rows in view are
   drawn by a virtualized table, and a row's full detail is fetched only when it is opened. */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { DemandAI } from '@/lib/demandai-engine';
import { download } from '@/lib/download';
import { avColor, initials, showToast } from '@/lib/ui';
import { sx } from '@/lib/sx';
import { STEPS } from '@/lib/prospecting/checks';
import { verifyMany, type BulkProgress } from '@/lib/email-verification/client';
import {
  RunExpired, exportRunList, getAccountsPage, getContactDetail, getContactsPage, getEmailsToVerify, getExportSummary, getMatchingRows,
  startSampleRun, syncVerifications, uploadLeadFile,
} from '@/lib/prospecting/runs-client';
import { HunterLabel, VerificationDetails, type VerifyState } from './EmailVerificationUI';
import { ContactDetailPanel, type DrawerState } from './ContactDetailPanel';
import { VirtualTable, type VCol } from './VirtualTable';
import type { Issue, LeadStats, SavedList } from '@/types/demandai';
import type { EmailVerification } from '@/types/email-verification';
import type { AccountRowItem, ContactRowItem, Page, PageQuery, RunSummary, SortDir, StepSummary } from '@/types/prospecting-runs';

/* ═══════════════ STATE SHAPES ═══════════════ */
interface Run { runId: string; fileName: string; sheet: string; sandbox: boolean; stats: LeadStats; unattached: Issue[]; unattachedTotal: number; savedId: string | null; selOnly: boolean }
type StartTab = 'upload' | 'saved';
type View = 'list' | 'accounts';
/** The pop-up opens as soon as the file is sent; `steps` arrive when the server has screened it. */
interface ChecksState { key: number; shown: boolean; fileName: string; stats: LeadStats | null; steps: StepSummary[] | null; t: number }
interface SaveState { key: number; shown: boolean; go: boolean; saved: boolean; selOnly: boolean; base: string; text: string }

const PAGE_SIZES = [25, 50, 100];
const OVERLAY_CSS = 'position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px';
const upperFirst = (s: string) => s.replace(/^./, m => m.toUpperCase());

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
/** The first issue and how many more there are; the rest is in the detail panel. */
function issueCell(count: number, first: ContactRowItem['firstIssue']): ReactNode {
  if (!first) return <span className="muted">—</span>;
  return (
    <div style={sx('display:flex;gap:8px;align-items:flex-start')} title={`${first.issue}: ${first.outcome}${count > 1 ? `\n+${count - 1} more: open the row to see them` : ''}`}>
      <span style={{ ...sx('width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:6px'), background: DOT[first.severity] }}></span>
      <div style={sx('min-width:0')}><span className="clamp2" style={sx('color:var(--i1);font-size:12px')}>{first.issue}</span>
        <span className="sub">{first.outcome + (count > 1 ? ` · +${count - 1} more` : '')}</span></div></div>
  );
}

/* One row of the Final list. Memoised so ticking one checkbox does not redraw the other rows. */
const ContactRow = memo(function ContactRow({ c, selected, onToggle, vs, onVerify, onDetails, onOpen }: {
  c: ContactRowItem; selected: boolean; onToggle: (row: number, on: boolean) => void;
  vs: VerifyState | undefined; onVerify: (row: number) => void; onDetails: (row: number) => void; onOpen: (row: number) => void;
}) {
  const reason = (c.status.match(/\((.*)\)$/) || [])[1];
  const emailSub = c.emailRaw ? (c.email ? (c.emailVerified ? <span style={sx('color:var(--pos)')}>Verified</span> : <span style={sx('color:var(--warn)')}>Not verified</span>) : <span style={sx('color:var(--neg)')}>Malformed</span>) : '';
  const emailSubTitle = c.emailRaw ? (c.email ? (c.emailVerified ? 'Verified' : 'Not verified') : 'Malformed') : '';
  const hunter = c.email && !c.optOut ? <>{' · '}<HunterLabel outcome={c.emailOutcome} state={vs} hasEmail onVerify={() => onVerify(c.row)} onDetails={() => onDetails(c.row)} /></> : null;
  const emailSubFull = emailSub ? <>{emailSub}{hunter}</> : '';
  return (
    <tr style={selected ? sx('background:var(--brand-lt)') : undefined}>
      <td>{c.selectable ? <input type="checkbox" checked={selected} onChange={e => onToggle(c.row, e.target.checked)} style={sx('cursor:pointer;vertical-align:middle')} /> : <span className="muted" title="Not in the list">—</span>}</td>
      <td><div className="person" style={sx('cursor:pointer')} onClick={() => onOpen(c.row)} title="Open the full record"><div className="co-av" style={{ background: avColor(c.company) }}>{initials(c.name)}</div><div>{cell(c.name, 'Row ' + c.row, 'dt-main')}</div></div></td>
      <td>{cell(c.company)}</td>
      <td>{cell(c.jobTitle)}</td>
      <td>{personaTag(c.persona)}</td>
      <td>{cell(c.emailRaw, emailSubFull, 'val', emailSubTitle)}</td>
      <td>{cell(c.linkedinRaw && c.linkedinRaw.replace(/^https?:\/\/(www\.)?/, ''))}</td>
      <td>{cell([c.city, c.country].filter(Boolean).join(', '))}</td>
      <td>{cell(c.industry)}</td>
      <td className="num">{c.employees != null ? c.employees.toLocaleString('en-US') : <span className="muted">—</span>}</td>
      <td>{c.reachableBy === 'none' ? <span style={sx('color:var(--neg)')}>No channel</span> : cell(upperFirst(c.reachableBy))}</td>
      <td>{c.optOut ? <span style={sx('color:var(--neg)')}>Opted out</span> : cell(c.consent)}</td>
      <td>{cell(c.owner)}</td>
      <td>{statusTag(c.status)}{reason ? <span className="sub" title={reason}>{upperFirst(reason)}</span> : null}</td>
      <td className="wrap">{issueCell(c.issueCount, c.firstIssue)}</td>
    </tr>
  );
});

const CONF_TAG: Record<AccountRowItem['confidence'], ReactNode> = {
  high: <span className="tag tag-green">High</span>, medium: <span className="tag tag-amber">Medium</span>, low: <span className="tag tag-red">Low</span>,
};
const money = (n: number | null) => n == null ? '' : n >= 1e9 ? 'USD ' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'bn' : 'USD ' + Math.round(n / 1e6) + 'm';
const AccountRow = memo(function AccountRow({ a }: { a: AccountRowItem }) {
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
      <td>{cell(a.contactCount + ' contact' + (a.contactCount === 1 ? '' : 's'), a.primaryCount ? a.primaryCount + ' primary persona' : 'No primary persona')}</td>
      <td>{cell(a.owner)}</td>
      <td>{a.excluded ? <><span className="tag tag-red">Excluded</span><span className="sub" title={a.excludedReason}>{a.excludedReason}</span></> : <><span className="tag tag-green">Pass</span><span className="sub">Region · managed · contacts</span></>}</td>
    </tr>
  );
});

/* ═══════════════ PAGER ═══════════════ */
function Pager({ page, size, total, loading, onPage, onSize }: { page: number; size: number; total: number; loading: boolean; onPage: (p: number) => void; onSize: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size)), from = total ? page * size + 1 : 0, to = Math.min(total, (page + 1) * size);
  return (
    <div style={sx('display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;border-top:1px solid var(--border);font-size:12px;color:var(--i2)')}>
      <span>{loading && !total ? 'Loading…' : total ? <>Showing <b>{from.toLocaleString('en-US')}–{to.toLocaleString('en-US')}</b> of <b>{total.toLocaleString('en-US')}</b></> : 'No matches'}</span>
      <span style={sx('flex:1')}></span>
      <label style={sx('display:flex;align-items:center;gap:6px;color:var(--i3)')}>Rows per page
        <select value={size} onChange={e => onSize(Number(e.target.value))} style={sx('border:1px solid var(--bdk);border-radius:6px;padding:3px 6px;font-size:12px;background:var(--surf)')}>
          {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => onPage(0)} title="First page">«</button>
      <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
      <span>{`Page ${page + 1} of ${pages.toLocaleString('en-US')}`}</span>
      <button className="btn btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next</button>
      <button className="btn btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => onPage(pages - 1)} title="Last page">»</button>
    </div>
  );
}

/* ═══════════════ THE CHECKS POP-UP ═══════════════ */
function ChecksOverlay({ ck, onDifferent, onView }: { ck: ChecksState; onDifferent: () => void; onView: () => void }) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const t = ck.t;
  useEffect(() => { if (t < STEPS.length) rowRefs.current[t]?.scrollIntoView({ block: 'nearest' }); }, [t, ck.key]);
  const s = ck.stats;
  const working = !ck.steps || t < STEPS.length;
  return (
    <div id="checksOverlay" style={{ ...sx(OVERLAY_CSS), display: ck.shown ? 'flex' : 'none' }}>
      <div key={ck.key} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:520px;max-width:100%;max-height:90vh;display:flex;flex-direction:column')}>
        <div style={sx('padding:20px 22px 12px')}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1)')}>{`Checking ${ck.fileName}`}</div>
          <div style={sx('font-size:12px;color:var(--i3);margin-top:3px')}>{s ? `${s.rowsRead.toLocaleString('en-US')} rows · fixed rules, nothing fixed automatically` : 'Reading the file…'}</div>
          <div style={sx('height:4px;background:var(--s75);border-radius:2px;margin-top:12px;overflow:hidden')}><div id="ckBar" style={{ ...sx('height:100%;width:0;background:var(--brand);transition:width .3s var(--ease)'), width: (t / STEPS.length * 100) + '%' }}></div></div>
        </div>
        <div style={sx('padding:0 22px;overflow-y:auto')}>
          {STEPS.map(([k, name, what], i) => {
            const done = !!ck.steps && i < t, running = i === t && t < STEPS.length;
            const res = done ? ck.steps![i] : null;
            const ckCls = res ? 'ck ' + (res.sev === 'stop' ? 'ck-stop' : res.sev === 'warn' ? 'ck-warn' : res.sev === 'info' ? 'ck-info' : 'ck-ok') : running ? 'ck ck-run' : 'ck ck-wait';
            const tone = res ? (res.sev === 'stop' ? 'tag-red' : res.sev === 'warn' ? 'tag-amber' : res.sev === 'info' ? 'tag-grey' : 'tag-green') : '';
            return (
              <div key={k} className={done || running ? 'ck-row' : 'ck-row pending'} id={'ck-' + i} ref={el => { rowRefs.current[i] = el; }}>
                <div className={ckCls} id={'ckc-' + i}>{res ? (res.sev ? '!' : '✓') : null}</div>
                <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>{name}</div><div style={sx('font-size:11px;color:var(--i3)')}>{what}</div></div>
                <div id={'ckr-' + i} style={sx('text-align:right;flex-shrink:0')}>{res ? <><span className={'tag ' + tone}>{res.label}</span>{res.rows ? <div style={sx('font-size:10.5px;color:var(--i3);margin-top:3px')}>{res.rows}</div> : null}</> : null}</div>
              </div>
            );
          })}
        </div>
        <div id="ckFoot" style={sx('padding:14px 22px 18px;display:flex;align-items:center;gap:8px;border-top:1px solid var(--border);margin-top:4px')}>
          {working || !s ? <span style={sx('flex:1;font-size:12px;color:var(--i3)')}>Running checks…</span> : <>
            <span style={sx('flex:1;font-size:12px;color:var(--i2)')}><b>{s.issues}</b>{` issue${s.issues === 1 ? '' : 's'} · `}<b>{s.accountsPass}</b>{` of ${s.accounts} accounts pass · `}<b>{s.inFinalList}</b> contacts in the list</span>
            <button className="btn btn-ghost btn-sm" onClick={onDifferent}>Upload a different file</button>
            <button className="btn btn-primary btn-sm" onClick={onView}>View the list →</button>
          </>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ THE SCREEN ═══════════════ */
export function ProspectingScreen() {
  const router = useRouter();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [screen, setScreen] = useState<'start' | 'run'>('start');
  const [startTab, setStartTab] = useState<StartTab>('upload');
  const [lists, setLists] = useState<SavedList[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Bumped on each full redraw (the original re-rendered #mainArea with innerHTML), so inputs start from their value again.
  const [nonce, setNonce] = useState(0);
  const [run, setRun] = useState<Run | null>(null);
  const [view, setView] = useState<View>('list');
  const [filt, setFilt] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<number>>(() => new Set());
  const [checks, setChecks] = useState<ChecksState | null>(null);
  const [save, setSave] = useState<SaveState | null>(null);
  // One page of rows at a time: where we are, how it is sorted, and what the server last sent.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [contactsPage, setContactsPage] = useState<Page<ContactRowItem> | null>(null);
  const [accountsPage, setAccountsPage] = useState<Page<AccountRowItem> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expired, setExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Hunter.io email verification: per-address state, bulk progress, and the details pop-up.
  const [verState, setVerState] = useState<Record<string, VerifyState>>({});
  const [bulk, setBulk] = useState<BulkProgress | null>(null);
  const [verDetail, setVerDetail] = useState<EmailVerification | null>(null);
  const [recheck, setRecheck] = useState(false);
  const [allUnattached, setAllUnattached] = useState(false);
  const bulkAbort = useRef<AbortController | null>(null);
  const dropRef = useRef<HTMLLabelElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const listNameRef = useRef<HTMLInputElement>(null);
  const selAllRef = useRef<HTMLInputElement>(null);
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  const contactsRef = useRef<Page<ContactRowItem> | null>(null);
  contactsRef.current = contactsPage;

  const closeDrawer = () => setDrawer(null);
  const gone = (e: unknown) => { if (e instanceof RunExpired) { setExpired(true); return true; } return false; };

  // renderStart() on load: the saved lists come from localStorage, so they are read once the page is in the browser.
  useEffect(() => { setLists(DemandAI.loadLists()); }, []);

  function renderStart(tab?: StartTab) {
    setRun(null); closeDrawer();
    if (tab) setStartTab(tab);
    setLists(DemandAI.loadLists());
    setScreen('start');
    setNonce(n => n + 1);
  }
  function renderRun() { setScreen('run'); setNonce(n => n + 1); }

  function removeList(id: string) { DemandAI.deleteList(id); showToast('List deleted'); renderStart('saved'); }
  function downloadTemplate() { void download('lead_template.csv', DemandAI.toCSV([DemandAI.LEAD_COLUMNS])); }

  /* ─── upload: the file goes to the server, which screens it and answers with a summary (never the rows) ─── */
  async function begin(fileName: string, send: () => Promise<RunSummary>) {
    openChecks(fileName);
    try {
      const s = await send();
      bulkAbort.current?.abort();
      setRun({ runId: s.runId, fileName: s.fileName, sheet: s.sheet, sandbox: s.sandbox, stats: s.stats, unattached: s.unattached, unattachedTotal: s.unattachedTotal, savedId: null, selOnly: false });
      setView('list'); setFilt('all'); setQ(''); setPage(0); setSort(null); setSel(new Set());
      setContactsPage(null); setAccountsPage(null); setExpired(false); setLoadError(''); setVerState({}); setBulk(null); setDrawer(null); setAllUnattached(false);
      setChecks(c => c && { ...c, stats: s.stats, steps: s.steps });
    } catch (e) {
      hideChecks();
      showToast((e as Error).message || 'Could not read that file');
    }
  }
  function onFile(file: File | undefined) { if (file) void begin(file.name, () => uploadLeadFile(file)); }
  function onUseSample() { void begin('lead_file.csv', startSampleRun); }

  /* ─── the checks pop-up: one step every 380 ms, once the server has the results ─── */
  function openChecks(fileName: string) {
    setChecks(c => ({ key: (c ? c.key : 0) + 1, shown: true, fileName, stats: null, steps: null, t: 0 }));
  }
  const ckT = checks ? checks.t : STEPS.length, ckKey = checks ? checks.key : 0, ckReady = !!(checks && checks.steps);
  useEffect(() => {
    if (!ckReady || ckT >= STEPS.length) return;
    const id = setTimeout(() => setChecks(c => c && c.key === ckKey ? { ...c, t: c.t + 1 } : c), 380);
    return () => clearTimeout(id);
  }, [ckT, ckKey, ckReady]);
  const hideChecks = () => setChecks(c => c && { ...c, shown: false });

  /* ─── drop zone ─── */
  const dzOver = (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); dropRef.current!.style.borderColor = 'var(--brand)'; };
  const dzLeave = () => { dropRef.current!.style.borderColor = 'var(--bdk)'; };
  const dzDrop = (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); dropRef.current!.style.borderColor = 'var(--bdk)'; if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); };

  /* ─── rename a saved list ─── */
  function startRename(id: string) { setRenamingId(id); renderStart('saved'); }
  useEffect(() => { if (renamingId) { const el = renameRef.current; if (el) { el.focus(); el.select(); } } }, [renamingId]);
  function finishRename(id: string) {
    const el = renameRef.current; const name = el ? el.value.trim() : '';
    const l = DemandAI.getList(id);
    if (l && name && name !== l.name) { l.name = name; DemandAI.saveList(l); showToast('List renamed'); }
    setRenamingId(null); renderStart('saved');
  }

  /* ─── results: the server answers each page, search, filter and sort ─── */
  const runId = run ? run.runId : '';
  useEffect(() => {
    if (!runId || screen !== 'run') return;
    const ctl = new AbortController();
    setLoading(true);
    // A short delay folds typing and quick clicks into one request.
    const timer = setTimeout(async () => {
      const p: PageQuery = { offset: page * pageSize, limit: pageSize, q, filter: filt, sort: sort ? sort.key : '', dir: sort ? sort.dir : 'asc' };
      try {
        if (view === 'list') {
          const d = await getContactsPage(runId, p, ctl.signal);
          setContactsPage(d);
          if (!d.rows.length && d.total && page > 0) setPage(Math.ceil(d.total / pageSize) - 1);
        } else {
          const d = await getAccountsPage(runId, p, ctl.signal);
          setAccountsPage(d);
          if (!d.rows.length && d.total && page > 0) setPage(Math.ceil(d.total / pageSize) - 1);
        }
        setLoadError('');
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (!gone(e)) setLoadError((e as Error).message || 'Could not load the rows');
      }
      if (!ctl.signal.aborted) setLoading(false);
    }, 150);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [runId, screen, view, page, pageSize, q, filt, sort, refreshKey]);

  const onSort = (key: string) => { setSort(s => !s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null); setPage(0); };

  /* ─── selection: kept across pages, as row numbers ─── */
  const toggleSel = useCallback((row: number, on: boolean) => {
    setSel(prev => { const s = new Set(prev); if (on) s.add(row); else s.delete(row); return s; });
  }, []);
  const pageRows = contactsPage ? contactsPage.rows.filter(c => c.selectable) : [];
  function toggleAll(on: boolean) { setSel(prev => { const s = new Set(prev); pageRows.forEach(c => on ? s.add(c.row) : s.delete(c.row)); return s; }); }
  function clearSel() { setSel(new Set()); }
  async function selectAllMatching() {
    if (!run) return;
    try { const rows = await getMatchingRows(run.runId, { q, filter: filt }); setSel(new Set(rows)); showToast(`${rows.length.toLocaleString('en-US')} prospects selected`); }
    catch (e) { if (!gone(e)) showToast((e as Error).message); }
  }
  const allChecked = pageRows.length > 0 && pageRows.every(c => sel.has(c.row));
  const someChecked = !allChecked && pageRows.some(c => sel.has(c.row));
  useEffect(() => { if (selAllRef.current) selAllRef.current.indeterminate = someChecked; });

  /* ─── one row opened: its full record is fetched now, not before ─── */
  const openRow = useCallback(async (row: number) => {
    const id = runRef.current?.runId; if (!id) return;
    setDrawer({ row, status: 'loading' });
    try { const data = await getContactDetail(id, row); setDrawer(d => d && d.row === row ? { row, status: 'ready', data } : d); }
    catch (e) { if (!gone(e)) setDrawer(d => d && d.row === row ? { row, status: 'error', error: (e as Error).message } : d); }
  }, []);
  const showVerification = useCallback(async (row: number) => {
    const id = runRef.current?.runId; if (!id) return;
    try { const d = await getContactDetail(id, row); if (d.contact.emailVerification) setVerDetail(d.contact.emailVerification); }
    catch (e) { if (!gone(e)) showToast((e as Error).message); }
  }, []);

  /* ─── email verification (Hunter.io), one address or many ─── */
  const patchVer = useCallback((email: string, p: VerifyState | null) => setVerState(prev => {
    const n = { ...prev }; if (p) n[email] = p; else delete n[email]; return n;
  }), []);
  async function verifyEmails(emails: string[], refresh: boolean) {
    const id = runRef.current?.runId; if (!id) return;
    const list = [...new Set(emails.map(e => e.toLowerCase()))];
    if (!list.length) { showToast('No emails to verify'); return; }
    list.forEach(e => patchVer(e, { busy: true }));
    const ctl = new AbortController(); bulkAbort.current = ctl;
    if (list.length > 1) setBulk({ done: 0, total: list.length, ok: 0, failed: 0, reused: 0, waitingMs: 0 });
    // Results are brought into the run (on the server) ten at a time, then the page on screen is read again.
    let pending: string[] = [];
    const flush = async () => {
      const batch = pending; pending = [];
      if (!batch.length) return;
      try { const stats = await syncVerifications(id, batch); setRun(r => r && r.runId === id ? { ...r, stats } : r); setRefreshKey(k => k + 1); }
      catch (e) { gone(e); }
    };
    const items = await verifyMany(list, {
      refresh, signal: ctl.signal,
      onProgress: p => { if (list.length > 1) setBulk(p); },
      onItem: ({ email, result }) => {
        if (result.ok) { patchVer(email, null); pending.push(email); if (pending.length >= 10) void flush(); }
        else patchVer(email, { error: result.error.message });
      },
    });
    await flush();
    // Anything cancelled or skipped before it was tried is no longer "verifying".
    list.forEach(e => { if (!items.some(i => i.email === e)) patchVer(e, null); });
    bulkAbort.current = null; setBulk(null);
    const ok = items.filter(i => i.result.ok).length, bad = items.filter(i => !i.result.ok);
    const first = bad.map(i => i.result).find(r => !r.ok);
    showToast(`${ok} verified${bad.length ? ` · ${bad.length} failed${first && !first.ok ? ': ' + first.error.message : ''}` : ''}`);
  }
  const verifyRow = useCallback((row: number) => {
    const c = contactsRef.current?.rows.find(x => x.row === row);
    if (c) void verifyEmails([c.email], c.emailOutcome !== null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function verifyAll() {
    if (!run) return;
    try { await verifyEmails(await getEmailsToVerify(run.runId, sel.size ? [...sel] : undefined), recheck); }
    catch (e) { if (!gone(e)) showToast((e as Error).message); }
  }

  /* ─── save and hand off: the list leaves the server only now, as the saved list Scoring reads ─── */
  async function openSave(go: boolean, selOnlyArg?: boolean) {
    if (!run) return;
    const selOnly = !!selOnlyArg;
    setRun({ ...run, selOnly });
    const saved = !selOnly && run.savedId ? DemandAI.getList(run.savedId) : null;
    const base = saved ? saved.name : run.fileName.replace(/\.[^.]+$/, '') + (selOnly ? ` · ${sel.size} selected` : '') + ' · ' + new Date().toISOString().slice(0, 10);
    let text: string;
    if (selOnly) {
      try {
        const s = await getExportSummary(run.runId, [...sel]);
        text = `The ${s.contacts} selected prospects, at ${s.accountsPass} account${s.accountsPass === 1 ? '' : 's'}.`;
      } catch (e) { if (!gone(e)) showToast((e as Error).message); return; }
    } else text = `${run.stats.accountsPass} accounts that pass the knock-outs, with ${run.stats.inFinalList} contacts in the list.`;
    setSave(sv => ({ key: (sv ? sv.key : 0) + 1, shown: true, go, saved: !!saved, selOnly, base, text: text + ' It appears under Saved lists and in Scoring.' }));
    setTimeout(() => { const el = listNameRef.current; if (el) { el.focus(); el.select(); } }, 30);
  }
  const hideSave = () => setSave(sv => sv && { ...sv, shown: false });
  async function saveList(go: boolean) {
    if (!run) return;
    const name = (listNameRef.current ? listNameRef.current.value : '').trim() || run.fileName;
    let r: Awaited<ReturnType<typeof exportRunList>>;
    try { r = await exportRunList(run.runId, run.selOnly ? [...sel] : undefined); }
    catch (e) { if (!gone(e)) showToast((e as Error).message || "Couldn't prepare the list"); return; }
    const prev = !run.selOnly && run.savedId ? DemandAI.getList(run.savedId) : null;
    const list: SavedList = prev ? Object.assign(prev, { name }) : { id: 'list-' + Date.now().toString(36), name, createdAt: Date.now(), sourceFile: run.fileName, sheet: run.sheet,
      sandbox: run.sandbox, stats: r.stats, accounts: r.accounts, contacts: r.contacts };
    if (!DemandAI.saveList(list)) { showToast("This browser blocks storage, so the list can't be saved. Allow site data and try again"); return; }
    if (!run.selOnly) setRun({ ...run, savedId: list.id });
    hideSave();
    if (go) { router.push('/scoring?list=' + encodeURIComponent(list.id)); return; }
    showToast(`Saved as "${name}"`);
    renderRun();
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
        <div style={sx('max-width:640px;margin:24px auto 0')} key={nonce}>
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
            {' '}This prototype screens the file on the server and shows it a page at a time, so long lists open as quickly as short ones. The production build runs it as a background job.
          </div>
        </div>) : (
        <div className="score-list">
          <Table cols={[['List', 300], ['Source file', 220], ['Accounts', 120, 'num'], ['In the list', 130, 'num'], ['Saved', 190], ['', 190]]}
            rows={lists.map(l => (
              <tr key={l.id}>
                <td><div className="person"><div className="co-av" style={{ background: avColor(l.id) }}>{initials(l.name)}</div><div style={sx('flex:1')}>{renamingId === l.id
                  ? <div style={sx('display:flex;gap:6px;align-items:center')}><input id="renameInput" ref={renameRef} key={nonce} defaultValue={l.name} style={sx('flex:1;min-width:0;padding:6px 9px;border:1px solid var(--brand-mid);border-radius:var(--rsm);font-size:12.5px')} onKeyDown={e => { if (e.key === 'Enter') finishRename(l.id); if (e.key === 'Escape') { setRenamingId(null); renderStart('saved'); } }} /><button className="btn btn-primary btn-sm" onClick={() => finishRename(l.id)}>Save</button></div>
                  : <><div style={sx('display:flex;align-items:center;gap:6px;min-width:0')}><span className="dt-main" title={l.name}>{l.name}</span><button title="Rename" onClick={() => startRename(l.id)} style={sx('flex-shrink:0;color:var(--i3);display:flex;padding:2px')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button></div><span className="sub">{l.scoring ? 'Scored' : 'Not scored yet'}</span></>}</div></div></td>
                <td>{cell(l.sourceFile)}</td>
                <td className="num">{l.stats.accountsPass}<span className="sub">{`of ${l.stats.accounts}`}</span></td>
                <td className="num">{l.stats.inFinalList}<span className="sub">contacts</span></td>
                <td>{cell(new Date(l.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), new Date(l.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))}</td>
                <td style={sx('text-align:right')}><Link className="btn btn-sec btn-sm" style={sx('text-decoration:none')} href={'/scoring?list=' + encodeURIComponent(l.id)}>Score →</Link>{' '}<button className="btn btn-ghost btn-sm" onClick={() => removeList(l.id)}>Delete</button></td>
              </tr>))}
            empty={<>No saved lists yet. <a href="#" onClick={e => { e.preventDefault(); renderStart('upload'); }} style={sx('color:var(--brand);font-weight:600')}>Upload a lead file</a> to build one.</>} />
        </div>)}
      </div>
    </>;
  }

  function toolbar(pills: ReactNode, placeholder: string): ReactNode {
    return (
      <div className="sl-toolbar">
        <div className="sl-srch"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={sx('color:var(--i3);flex-shrink:0')}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input key={nonce} type="text" placeholder={placeholder} defaultValue={q} onChange={e => { setQ(e.target.value.toLowerCase()); setPage(0); }} /></div>
        <div className="sl-seg-filter">{pills}</div></div>
    );
  }
  const pill = (id: string, label: string) => <div className={`seg-pill ${filt === id ? 'active' : ''}`} onClick={() => { setFilt(id); setPage(0); renderRun(); }}>{label}</div>;

  function renderRunView(r: Run): ReactNode {
    const s = r.stats;
    const tab = (id: View, label: string, n: number) => <div className={`ftab ${view === id ? 'active' : ''}`} onClick={() => { setView(id); setFilt('all'); setQ(''); setPage(0); setSort(null); renderRun(); }}>{label + ' '}<span className="ftab-cnt">{n}</span></div>;
    const off = s.accountsPass ? {} : { disabled: true, style: sx('opacity:.5;cursor:not-allowed') };
    const n = sel.size;
    return <>
      <div className="topbar">
        <div className="topbar-l"><span className="tb-title">{r.fileName}</span>
          <span className="tb-badge badge-neutral">{r.sheet}</span></div>
        <div className="topbar-r">
          <button className="btn btn-sec btn-sm" onClick={() => renderStart('upload')}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Upload a different file</button>
          <button className="btn btn-sec btn-sm" onClick={() => void openSave(false)} {...off}>{r.savedId ? 'Saved ✓' : 'Save list'}</button>
          <button id="goScoring" className="btn btn-primary btn-sm" onClick={() => void openSave(true, sel.size > 0)} {...off}>{n ? `Send ${n.toLocaleString('en-US')} selected to Scoring →` : 'Save and go to Scoring →'}</button>
        </div>
      </div>
      <div className="ftabs">{tab('list', 'Final list', s.contacts)}{tab('accounts', 'Accounts', s.accounts)}</div>
      <div className="canvas">
        <div className="stats">
          <div className="stat"><div className="stat-lbl">Rows read</div><div className="stat-val sv1">{s.rowsRead.toLocaleString('en-US')}</div><div className="stat-sub">{`${s.notLoaded} not loaded · ${s.merged} merged duplicate${s.merged === 1 ? '' : 's'}`}</div></div>
          <div className="stat"><div className="stat-lbl">Issues</div><div className="stat-val sv3">{s.issues.toLocaleString('en-US')}</div><div className="stat-sub">{`${s.issuesBySeverity.stop} stop · ${s.issuesBySeverity.flag} flagged · ${s.issuesBySeverity.info} info`}</div></div>
          <div className="stat"><div className="stat-lbl">Accounts</div><div className="stat-val sv2">{s.accounts.toLocaleString('en-US')}</div><div className="stat-sub">{`${s.accountsPass.toLocaleString('en-US')} pass the knock-outs`}</div></div>
          <div className="stat"><div className="stat-lbl">Excluded</div><div className="stat-val sv5">{(s.accounts - s.accountsPass).toLocaleString('en-US')}</div><div className="stat-sub">knock-out rule, logged</div></div>
          <div className="stat"><div className="stat-lbl">In the final list</div><div className="stat-val sv4">{s.inFinalList.toLocaleString('en-US')}</div><div className="stat-sub">{`of ${s.contacts.toLocaleString('en-US')} contacts`}</div></div>
        </div>
        {expired ? expiredNotice() : view === 'list' ? renderListTab() : renderAccountsTab()}
      </div>
    </>;
  }

  function expiredNotice(): ReactNode {
    return (
      <div className="panel" style={sx('border-color:var(--warn)')}><div className="panel-body" style={sx('font-size:12.5px;color:var(--i2);line-height:1.6')}>
        <b>This upload is no longer on the server.</b> The server was restarted, or the file is more than a day old. Upload it again to carry on.{' '}
        <button className="btn btn-primary btn-sm" onClick={() => renderStart('upload')}>Upload the file again</button>
      </div></div>
    );
  }

  function unattachedNotice(): ReactNode {
    const un = run ? run.unattached : [];
    if (!run || !run.unattachedTotal) return null;
    return (
      <div className="panel" style={sx('margin-bottom:12px;border-color:var(--warn)')}><div className="panel-body" style={sx('font-size:12px;color:var(--i2);line-height:1.7')}>
        <b>{`${run.unattachedTotal.toLocaleString('en-US')} issue${run.unattachedTotal > 1 ? 's' : ''} not on any contact in the list`}</b> (rows not loaded, or about the whole file):
        {' '}{(allUnattached ? un : un.slice(0, 5)).map((i, k) => <div key={k}><b>{i.row === '—' ? 'File' : 'Row ' + i.row}</b>{` · ${i.field}: ${i.issue}. `}<span style={sx('color:var(--i3)')}>{`${i.outcome}. Fix: ${i.fix}`}</span></div>)}
        {un.length > 5 ? <div><button className="btn btn-ghost btn-sm" style={sx('padding:2px 0;font-size:11.5px')} onClick={() => setAllUnattached(v => !v)}>{allUnattached ? 'Show fewer' : `Show ${un.length}`}</button></div> : null}
        {allUnattached && run.unattachedTotal > un.length ? <div style={sx('color:var(--i3)')}>{`…and ${(run.unattachedTotal - un.length).toLocaleString('en-US')} more. Fix the file and upload it again to clear them.`}</div> : null}
      </div></div>
    );
  }

  const errorBar = () => loadError ? <div style={sx('padding:10px 14px;font-size:12px;color:var(--neg)')}>{loadError} <button className="btn btn-ghost btn-sm" onClick={() => setRefreshKey(k => k + 1)}>Try again</button></div> : null;

  function renderListTab(): ReactNode {
    const n = sel.size, pg = contactsPage;
    // The selected contacts if any, otherwise everyone with an address who has not opted out (the server works that out).
    const cols: VCol[] = [
      { label: <input key="selAll" type="checkbox" id="selAll" ref={selAllRef} title="Select all on this page" checked={allChecked} onChange={e => toggleAll(e.target.checked)} style={sx('cursor:pointer;vertical-align:middle')} />, width: 58 },
      { label: 'Contact', width: 220, sortKey: 'name' }, { label: 'Account', width: 190, sortKey: 'company' }, { label: 'Job title', width: 210, sortKey: 'jobTitle' },
      { label: 'Persona', width: 140, sortKey: 'persona' }, { label: 'Email', width: 270, sortKey: 'email' }, { label: 'LinkedIn', width: 250, sortKey: 'linkedin' },
      { label: 'Location', width: 190, sortKey: 'location' }, { label: 'Industry', width: 180, sortKey: 'industry' }, { label: 'Employees', width: 120, cls: 'num', sortKey: 'employees' },
      { label: 'Reachable by', width: 170, sortKey: 'reachableBy' }, { label: 'Consent', width: 170, sortKey: 'consent' }, { label: 'Owner', width: 220, sortKey: 'owner' },
      { label: 'Status', width: 230, sortKey: 'status' }, { label: 'Issues', width: 290 },
    ];
    return <>
      {unattachedNotice()}<div className="score-list">
        <div id="verifyBar" className="sl-toolbar" style={sx('display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
          {bulk ? <>
            <span style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>{`Verifying with Hunter.io · ${bulk.done} of ${bulk.total}`}</span>
            <div style={sx('width:160px;height:4px;background:var(--s75);border-radius:2px;overflow:hidden')}><div style={{ ...sx('height:100%;background:var(--brand)'), width: (bulk.done / bulk.total * 100) + '%' }}></div></div>
            <span style={sx('font-size:11px;color:var(--i3)')}>{`${bulk.reused} reused${bulk.failed ? ` · ${bulk.failed} failed` : ''}${bulk.waitingMs ? ` · retrying in ${Math.ceil(bulk.waitingMs / 1000)}s` : ''}`}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => bulkAbort.current?.abort()}>Cancel</button>
          </> : <>
            <button className="btn btn-sec btn-sm" onClick={() => void verifyAll()}>{n ? `Verify ${n.toLocaleString('en-US')} selected emails` : 'Verify emails'}</button>
            <label style={sx('font-size:11px;color:var(--i3);display:flex;align-items:center;gap:5px;cursor:pointer')}><input type="checkbox" checked={recheck} onChange={e => setRecheck(e.target.checked)} />Re-check stored results</label>
            <span style={sx('font-size:11px;color:var(--i3)')}>Hunter.io checks whether each address can receive mail. Results are kept and reused.</span>
          </>}
        </div>
        <div id="selBar" className="sl-toolbar" style={{ ...sx('display:none;background:var(--brand-lt);align-items:center'), display: n ? 'flex' : 'none' }}>
          <span id="selCount" style={sx('font-size:12.5px;font-weight:600;color:var(--brand-dk)')}>{n ? `${n.toLocaleString('en-US')} prospect${n === 1 ? '' : 's'} selected` : ''}</span>
          {pg && pg.total > pg.rows.length ? <button className="btn btn-ghost btn-sm" onClick={() => void selectAllMatching()}>Select all matching</button> : null}
          <button className="btn btn-ghost btn-sm" onClick={clearSel}>Clear</button>
        </div>
        {toolbar(<>{pill('all', 'All')}{pill('in', 'In the final list')}{pill('nc', 'Not contactable')}{pill('out', 'Not in the list')}</>, 'Search name, company or title…')}
        {errorBar()}
        <div id="rows"><VirtualTable cols={cols} rows={pg ? pg.rows : []} rowKey={c => c.row} loading={loading} sort={sort || undefined} onSort={onSort}
          resetKey={`${runId}|${view}|${page}|${pageSize}|${q}|${filt}|${sort ? sort.key + sort.dir : ''}`}
          empty={loading && !pg ? 'Loading…' : 'No contacts match.'}
          renderRow={c => <ContactRow key={c.row} c={c} selected={sel.has(c.row)} onToggle={toggleSel} vs={verState[c.email]} onVerify={verifyRow} onDetails={showVerification} onOpen={openRow} />} />
        <Pager page={page} size={pageSize} total={pg ? pg.total : 0} loading={loading} onPage={setPage} onSize={n2 => { setPageSize(n2); setPage(0); }} /></div></div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>One row per contact: what Lead discovery hands to Scoring. Click a name for the full record; click a column heading to sort. Scroll sideways for more columns; hover a cell for its full text.</div>
    </>;
  }

  function renderAccountsTab(): ReactNode {
    const pg = accountsPage;
    const cols: VCol[] = [
      { label: 'Account', width: 240, sortKey: 'name' }, { label: 'Location', width: 190, sortKey: 'location' }, { label: 'Industry (as held)', width: 180, sortKey: 'industry' },
      { label: 'Vertical', width: 160, sortKey: 'vertical' }, { label: 'Confidence', width: 130, sortKey: 'confidence' }, { label: 'Classification', width: 300 },
      { label: 'Account type', width: 170, sortKey: 'accountType' }, { label: 'Size', width: 170, sortKey: 'size' }, { label: 'Customer', width: 120, sortKey: 'customer' },
      { label: 'Site', width: 240 }, { label: 'Contacts', width: 230, sortKey: 'contacts' }, { label: 'Owner', width: 220, sortKey: 'owner' }, { label: 'Knock-outs', width: 260, sortKey: 'knockouts' },
    ];
    return <>
      <div className="score-list">
        {toolbar(<>{pill('all', 'All')}{pill('pass', 'Pass')}{pill('excluded', 'Excluded')}{pill('review', 'Needs review')}</>, 'Search accounts…')}
        {errorBar()}
        <div id="rows"><VirtualTable cols={cols} rows={pg ? pg.rows : []} rowKey={a => a.id} loading={loading} sort={sort || undefined} onSort={onSort}
          resetKey={`${runId}|${view}|${page}|${pageSize}|${q}|${filt}|${sort ? sort.key + sort.dir : ''}`}
          empty={loading && !pg ? 'Loading…' : 'No accounts match.'} renderRow={a => <AccountRow key={a.id} a={a} />} />
        <Pager page={page} size={pageSize} total={pg ? pg.total : 0} loading={loading} onPage={setPage} onSize={n2 => { setPageSize(n2); setPage(0); }} /></div></div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>One row per account. The installed-base knock-out runs in Scoring, from the signal file. Scroll sideways for more columns; hover a cell for its full text.</div>
    </>;
  }

  const drawerRow = drawer && contactsPage ? contactsPage.rows.find(c => c.row === drawer.row) : null;
  const drawerName = drawer && drawer.status === 'ready' ? drawer.data.contact.name : drawerRow ? drawerRow.name : 'Contact';
  const drawerSub = drawer && drawer.status === 'ready' ? `${drawer.data.contact.jobTitle || 'No job title'} · ${drawer.data.contact.company} · Row ${drawer.row}` : drawer ? `Row ${drawer.row}` : '—';

  return <>
    <main className="main" id="mainArea">{screen === 'run' && run ? renderRunView(run) : renderStartView()}</main>

    <div className={drawer ? 'detail-drawer open' : 'detail-drawer'} id="detailDrawer">
      <div className="drawer-hdr">
        <div>
          <div className="drawer-title" id="detTitle">{drawerName}</div>
          <div className="drawer-sub" id="detSub">{drawerSub}</div>
        </div>
        <div className="drawer-close" onClick={closeDrawer}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
      </div>
      <div className="drawer-body" id="detBody">{drawer ? <ContactDetailPanel d={drawer} onRetry={() => void openRow(drawer.row)} onVerification={() => void showVerification(drawer.row)} /> : null}</div>
    </div>

    {verDetail ? <VerificationDetails v={verDetail} onClose={() => setVerDetail(null)} onRecheck={() => { const e = verDetail.email; setVerDetail(null); void verifyEmails([e], true); }} /> : null}

    {checks ? <ChecksOverlay ck={checks}
      onDifferent={() => { hideChecks(); renderStart('upload'); }}
      onView={() => { hideChecks(); renderRun(); }} /> : null}

    {save ? (
      <div id="saveOverlay" style={{ ...sx(OVERLAY_CSS), display: save.shown ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) hideSave(); }}>
        <div key={save.key} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:440px;max-width:100%;padding:20px 22px')}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:4px')}>{save.saved ? 'Update the saved list' : 'Save the screened list'}</div>
          <div style={sx('font-size:12px;color:var(--i3);margin-bottom:14px;line-height:1.5')}>{save.text}</div>
          <label style={sx('font-size:11px;font-weight:600;color:var(--i2)')}>List name</label>
          <input id="listName" ref={listNameRef} defaultValue={save.base} style={sx('width:100%;margin:5px 0 18px;padding:9px 11px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px')} onKeyDown={e => { if (e.key === 'Enter') void saveList(save.go); }} />
          <div style={sx('display:flex;gap:8px;justify-content:flex-end')}>
            <button className="btn btn-ghost btn-sm" onClick={hideSave}>Cancel</button>
            <button className={`btn ${save.go ? 'btn-sec' : 'btn-primary'} btn-sm`} onClick={() => void saveList(false)}>Save</button>
            <button className={`btn ${save.go ? 'btn-primary' : 'btn-sec'} btn-sm`} onClick={() => void saveList(true)}>Save and go to Scoring →</button>
          </div></div>
      </div>) : null}
  </>;
}
