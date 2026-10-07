'use client';

/* Prospecting (was legacy/10-prospecting.html): upload a lead file, run the fixed checks, review the final list and
   accounts, save the list for Scoring. Markup, text, timings and storage match the original page. */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { DemandAI } from '@/lib/demandai-engine';
import { DemandAISample } from '@/lib/demandai-sample-data';
import { download } from '@/lib/download';
import { pickSheet, readFileToGrids } from '@/lib/file-reader';
import { avColor, initials, showToast } from '@/lib/ui';
import { sx } from '@/lib/sx';
import { STEPS, groupIssues, stepResult, type IssuesByCheck } from '@/lib/prospecting/checks';
import type { Account, Contact, Grid, Issue, LeadResult, LeadStats, SavedList } from '@/types/demandai';

/* ═══════════════ STATE SHAPES ═══════════════ */
interface Run { fileName: string; sheet: string; sandbox: boolean; result: LeadResult; savedId: string | null; selOnly: boolean }
type StartTab = 'upload' | 'saved';
type View = 'list' | 'accounts';
interface ChecksState { key: number; shown: boolean; fileName: string; result: LeadResult; by: IssuesByCheck; t: number }
interface SaveState { key: number; shown: boolean; go: boolean; saved: boolean; selOnly: boolean; base: string; text: string }
interface Selection { stats: LeadStats; accounts: Account[]; contacts: Contact[] }

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

/* One row of the Final list. Memoised so ticking one checkbox does not redraw thousands of rows. */
const ContactRow = memo(function ContactRow({ c, a, selected, issues, onToggle }: {
  c: Contact; a: Account | undefined; selected: boolean; issues: Issue[]; onToggle: (row: number, on: boolean) => void;
}) {
  const reason = (c.status.match(/\((.*)\)$/) || [])[1];
  const emailSub = c.emailRaw ? (c.email ? (c.emailVerified ? <span style={sx('color:var(--pos)')}>Verified</span> : <span style={sx('color:var(--warn)')}>Not verified</span>) : <span style={sx('color:var(--neg)')}>Malformed</span>) : '';
  const emailSubTitle = c.emailRaw ? (c.email ? (c.emailVerified ? 'Verified' : 'Not verified') : 'Malformed') : '';
  return (
    <tr style={selected ? sx('background:var(--brand-lt)') : undefined}>
      <td>{selectable(c) ? <input type="checkbox" checked={selected} onChange={e => onToggle(c.row, e.target.checked)} style={sx('cursor:pointer;vertical-align:middle')} /> : <span className="muted" title="Not in the list">—</span>}</td>
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
const AccountRow = memo(function AccountRow({ a, cs }: { a: Account; cs: Contact[] }) {
  const prim = cs.filter(c => c.persona === 'Primary').length;
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
      <td>{cell(cs.length + ' contact' + (cs.length === 1 ? '' : 's'), prim ? prim + ' primary persona' : 'No primary persona')}</td>
      <td>{cell(a.owner)}</td>
      <td>{a.excluded ? <><span className="tag tag-red">Excluded</span><span className="sub" title={a.excludedReason}>{a.excludedReason}</span></> : <><span className="tag tag-green">Pass</span><span className="sub">Region · managed · contacts</span></>}</td>
    </tr>
  );
});

/* ═══════════════ THE CHECKS POP-UP ═══════════════ */
function ChecksOverlay({ ck, onDifferent, onView }: { ck: ChecksState; onDifferent: () => void; onView: () => void }) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const t = ck.t;
  useEffect(() => { if (t < STEPS.length) rowRefs.current[t]?.scrollIntoView({ block: 'nearest' }); }, [t, ck.key]);
  const r = ck.result, s = r.stats;
  return (
    <div id="checksOverlay" style={{ ...sx(OVERLAY_CSS), display: ck.shown ? 'flex' : 'none' }}>
      <div key={ck.key} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:520px;max-width:100%;max-height:90vh;display:flex;flex-direction:column')}>
        <div style={sx('padding:20px 22px 12px')}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1)')}>{`Checking ${ck.fileName}`}</div>
          <div style={sx('font-size:12px;color:var(--i3);margin-top:3px')}>{`${r.stats.rowsRead} rows · fixed rules, nothing fixed automatically`}</div>
          <div style={sx('height:4px;background:var(--s75);border-radius:2px;margin-top:12px;overflow:hidden')}><div id="ckBar" style={{ ...sx('height:100%;width:0;background:var(--brand);transition:width .3s var(--ease)'), width: (t / STEPS.length * 100) + '%' }}></div></div>
        </div>
        <div style={sx('padding:0 22px;overflow-y:auto')}>
          {STEPS.map(([k, name, what], i) => {
            const done = i < t, running = i === t && t < STEPS.length;
            const res = done ? stepResult(r, k, ck.by) : null;
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
          {t < STEPS.length ? <span style={sx('flex:1;font-size:12px;color:var(--i3)')}>Running checks…</span> : <>
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
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  const dropRef = useRef<HTMLLabelElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const listNameRef = useRef<HTMLInputElement>(null);
  const selAllRef = useRef<HTMLInputElement>(null);

  const closeDrawer = () => setDrawerOpen(false);

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

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const grids = await readFileToGrids(file);
      const g = pickSheet(grids, 'company_name', /lead template/i);
      processFile(file.name, g.sheet, g.grid, false);
    } catch (e) { showToast((e as Error).message || 'Could not read that file'); }
  }
  function onUseSample() { processFile(DemandAISample.LEAD_FILE, 'Lead template', DemandAISample.LEADS, true); }
  function processFile(fileName: string, sheet: string, grid: Grid, sandbox: boolean) {
    const result = DemandAI.processLeads(grid, { file: fileName, sheet });
    setRun({ fileName, sheet, sandbox, result, savedId: null, selOnly: false });
    setView('list'); setFilt('all'); setQ('');
    setSel(new Set());
    openChecks(fileName, result);
  }

  /* ─── the checks pop-up: one step every 380 ms ─── */
  function openChecks(fileName: string, result: LeadResult) {
    setChecks(c => ({ key: (c ? c.key : 0) + 1, shown: true, fileName, result, by: groupIssues(result), t: 0 }));
  }
  const ckT = checks ? checks.t : STEPS.length, ckKey = checks ? checks.key : 0;
  useEffect(() => {
    if (ckT >= STEPS.length) return;
    const id = setTimeout(() => setChecks(c => c && c.key === ckKey ? { ...c, t: c.t + 1 } : c), 380);
    return () => clearTimeout(id);
  }, [ckT, ckKey]);
  const hideChecks = () => setChecks(c => c && { ...c, shown: false });

  /* ─── drop zone ─── */
  const dzOver = (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); dropRef.current!.style.borderColor = 'var(--brand)'; };
  const dzLeave = () => { dropRef.current!.style.borderColor = 'var(--bdk)'; };
  const dzDrop = (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); dropRef.current!.style.borderColor = 'var(--bdk)'; if (e.dataTransfer.files[0]) void onFile(e.dataTransfer.files[0]); };

  /* ─── rename a saved list ─── */
  function startRename(id: string) { setRenamingId(id); renderStart('saved'); }
  useEffect(() => { if (renamingId) { const el = renameRef.current; if (el) { el.focus(); el.select(); } } }, [renamingId]);
  function finishRename(id: string) {
    const el = renameRef.current; const name = el ? el.value.trim() : '';
    const l = DemandAI.getList(id);
    if (l && name && name !== l.name) { l.name = name; DemandAI.saveList(l); showToast('List renamed'); }
    setRenamingId(null); renderStart('saved');
  }

  /* ─── results: filters, search, selection ─── */
  const visibleContacts = useMemo(() => {
    if (!run) return [];
    let cs = run.result.contacts;
    if (filt === 'in') cs = cs.filter(c => c.status === 'In the final list');
    if (filt === 'nc') cs = cs.filter(c => c.status.startsWith('In the list'));
    if (filt === 'out') cs = cs.filter(c => c.status.startsWith('Not in'));
    if (q) cs = cs.filter(c => (c.name + ' ' + c.company + ' ' + c.jobTitle).toLowerCase().includes(q));
    return cs;
  }, [run, filt, q]);
  const visibleAccounts = useMemo(() => {
    if (!run) return [];
    let as = run.result.accounts;
    if (filt === 'pass') as = as.filter(a => !a.excluded);
    if (filt === 'excluded') as = as.filter(a => a.excluded);
    if (filt === 'review') as = as.filter(a => a.needsReview);
    if (q) as = as.filter(a => a.name.toLowerCase().includes(q));
    return as;
  }, [run, filt, q]);
  const result = run ? run.result : null;
  const accById = useMemo(() => new Map((result ? result.accounts : []).map(a => [a.id, a])), [result]);
  const contactsByAcc = useMemo(() => {
    const m = new Map<string, Contact[]>();
    (result ? result.contacts : []).forEach(c => { const l = m.get(c.accountId); if (l) l.push(c); else m.set(c.accountId, [c]); });
    return m;
  }, [result]);
  // issuesFor(row): a merged duplicate's issue sits on the repeated row; show it on the row it was merged into.
  const issuesByRow = useMemo(() => {
    const m = new Map<string, Issue[]>();
    const add = (k: string, i: Issue) => { const l = m.get(k); if (l) l.push(i); else m.set(k, [i]); };
    (result ? result.issues : []).forEach(i => {
      const own = typeof i.row === 'number' ? String(i.row) : null;
      if (own !== null) add(own, i);
      if (i.code === 'D5' && i.outcome.startsWith('Merged into row ')) { const k = i.outcome.slice('Merged into row '.length); if (k !== own) add(k, i); }
    });
    return m;
  }, [result]);
  const unattached = useMemo(() => {
    if (!result) return [];
    const rows = new Set<number | string>(result.contacts.map(c => c.row));
    return result.issues.filter(i => !rows.has(i.row) && !(i.code === 'D5' && rows.has(+String(i.outcome).replace('Merged into row ', ''))));
  }, [result]);

  const toggleSel = useCallback((row: number, on: boolean) => {
    setSel(prev => { const s = new Set(prev); if (on) s.add(row); else s.delete(row); return s; });
  }, []);
  function toggleAll(on: boolean) {
    const v = visibleContacts.filter(selectable);
    setSel(prev => { const s = new Set(prev); v.forEach(c => on ? s.add(c.row) : s.delete(c.row)); return s; });
  }
  function clearSel() { setSel(new Set()); }
  const selVisible = visibleContacts.filter(selectable);
  const allChecked = selVisible.length > 0 && selVisible.every(c => sel.has(c.row));
  const someChecked = !allChecked && selVisible.some(c => sel.has(c.row));
  useEffect(() => { if (selAllRef.current) selAllRef.current.indeterminate = someChecked; });

  /* ─── save and hand off ─── */
  function selectionList(r: Run, selOnly: boolean): Selection {
    const res = r.result;
    if (!selOnly) return { stats: res.stats, accounts: res.accounts, contacts: res.contacts };
    const contacts = res.contacts.filter(c => sel.has(c.row));
    const ids = new Set(contacts.map(c => c.accountId));
    const accounts = res.accounts.filter(a => ids.has(a.id));
    return { contacts, accounts, stats: Object.assign({}, res.stats, { contacts: contacts.length, accounts: accounts.length,
      accountsPass: accounts.filter(a => !a.excluded).length, inFinalList: contacts.filter(c => c.status === 'In the final list').length }) };
  }
  function openSave(go: boolean, selOnlyArg?: boolean) {
    if (!run) return;
    const selOnly = !!selOnlyArg;
    setRun({ ...run, selOnly });
    const saved = !selOnly && run.savedId ? DemandAI.getList(run.savedId) : null;
    const base = saved ? saved.name : run.fileName.replace(/\.[^.]+$/, '') + (selOnly ? ` · ${sel.size} selected` : '') + ' · ' + new Date().toISOString().slice(0, 10);
    const L = selectionList(run, selOnly);
    const text = (selOnly ? `The ${L.contacts.length} selected prospects, at ${L.stats.accountsPass} account${L.stats.accountsPass === 1 ? '' : 's'}.` : `${L.stats.accountsPass} accounts that pass the knock-outs, with ${L.stats.inFinalList} contacts in the list.`) + ' It appears under Saved lists and in Scoring.';
    setSave(sv => ({ key: (sv ? sv.key : 0) + 1, shown: true, go, saved: !!saved, selOnly, base, text }));
    setTimeout(() => { const el = listNameRef.current; if (el) { el.focus(); el.select(); } }, 30);
  }
  const hideSave = () => setSave(sv => sv && { ...sv, shown: false });
  function saveList(go: boolean) {
    if (!run) return;
    const name = (listNameRef.current ? listNameRef.current.value : '').trim() || run.fileName;
    const r = selectionList(run, run.selOnly);
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
            <input type="file" id="fileInput" accept=".csv,.xlsx,.xls" style={sx('display:none')} onChange={e => void onFile(e.target.files ? e.target.files[0] : undefined)} />
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
            {' '}This prototype reads the file in your browser. The production build runs it as a background job.
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
        <div className="sl-srch"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={sx('color:var(--i3);flex-shrink:0')}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input key={nonce} type="text" placeholder={placeholder} defaultValue={q} onChange={e => setQ(e.target.value.toLowerCase())} /></div>
        <div className="sl-seg-filter">{pills}</div></div>
    );
  }
  const pill = (id: string, label: string) => <div className={`seg-pill ${filt === id ? 'active' : ''}`} onClick={() => { setFilt(id); renderRun(); }}>{label}</div>;

  function renderRunView(r: Run): ReactNode {
    const res = r.result, s = res.stats;
    const tab = (id: View, label: string, n: number) => <div className={`ftab ${view === id ? 'active' : ''}`} onClick={() => { setView(id); setFilt('all'); setQ(''); renderRun(); }}>{label + ' '}<span className="ftab-cnt">{n}</span></div>;
    const off = s.accountsPass ? {} : { disabled: true, style: sx('opacity:.5;cursor:not-allowed') };
    const n = sel.size;
    return <>
      <div className="topbar">
        <div className="topbar-l"><span className="tb-title">{r.fileName}</span>
          <span className="tb-badge badge-neutral">{r.sheet}</span></div>
        <div className="topbar-r">
          <button className="btn btn-sec btn-sm" onClick={() => renderStart('upload')}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Upload a different file</button>
          <button className="btn btn-sec btn-sm" onClick={() => openSave(false)} {...off}>{r.savedId ? 'Saved ✓' : 'Save list'}</button>
          <button id="goScoring" className="btn btn-primary btn-sm" onClick={() => openSave(true, sel.size > 0)} {...off}>{n ? `Send ${n} selected to Scoring →` : 'Save and go to Scoring →'}</button>
        </div>
      </div>
      <div className="ftabs">{tab('list', 'Final list', res.contacts.length)}{tab('accounts', 'Accounts', res.accounts.length)}</div>
      <div className="canvas">
        <div className="stats">
          <div className="stat"><div className="stat-lbl">Rows read</div><div className="stat-val sv1">{s.rowsRead}</div><div className="stat-sub">{`${s.notLoaded} not loaded · ${s.merged} merged duplicate${s.merged === 1 ? '' : 's'}`}</div></div>
          <div className="stat"><div className="stat-lbl">Issues</div><div className="stat-val sv3">{s.issues}</div><div className="stat-sub">{`${s.issuesBySeverity.stop} stop · ${s.issuesBySeverity.flag} flagged · ${s.issuesBySeverity.info} info`}</div></div>
          <div className="stat"><div className="stat-lbl">Accounts</div><div className="stat-val sv2">{s.accounts}</div><div className="stat-sub">{`${s.accountsPass} pass the knock-outs`}</div></div>
          <div className="stat"><div className="stat-lbl">Excluded</div><div className="stat-val sv5">{s.accounts - s.accountsPass}</div><div className="stat-sub">knock-out rule, logged</div></div>
          <div className="stat"><div className="stat-lbl">In the final list</div><div className="stat-val sv4">{s.inFinalList}</div><div className="stat-sub">{`of ${s.contacts} contacts`}</div></div>
        </div>
        {view === 'list' ? renderListTab() : renderAccountsTab()}
      </div>
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

  function renderListTab(): ReactNode {
    const n = sel.size;
    const cols: Col[] = [[<input key="selAll" type="checkbox" id="selAll" ref={selAllRef} title="Select all" checked={allChecked} onChange={e => toggleAll(e.target.checked)} style={sx('cursor:pointer;vertical-align:middle')} />, 58], ['Contact', 220], ['Account', 190], ['Job title', 210], ['Persona', 140], ['Email', 270], ['LinkedIn', 250], ['Location', 190], ['Industry', 180], ['Employees', 120, 'num'], ['Reachable by', 170], ['Consent', 170], ['Owner', 220], ['Status', 230], ['Issues', 290]];
    return <>
      {unattachedNotice()}<div className="score-list">
        <div id="selBar" className="sl-toolbar" style={{ ...sx('display:none;background:var(--brand-lt);align-items:center'), display: n ? 'flex' : 'none' }}>
          <span id="selCount" style={sx('font-size:12.5px;font-weight:600;color:var(--brand-dk)')}>{n ? `${n} prospect${n === 1 ? '' : 's'} selected` : ''}</span>
          <button className="btn btn-ghost btn-sm" onClick={clearSel}>Clear</button>
        </div>
        {toolbar(<>{pill('all', 'All')}{pill('in', 'In the final list')}{pill('nc', 'Not contactable')}{pill('out', 'Not in the list')}</>, 'Search name, company or title…')}
        <div id="rows"><Table cols={cols} empty="No contacts match."
          rows={visibleContacts.map(c => <ContactRow key={c.row} c={c} a={accById.get(c.accountId)} selected={sel.has(c.row)} issues={issuesByRow.get(String(c.row)) || NO_ISSUES} onToggle={toggleSel} />)} /></div></div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>One row per contact: what Lead discovery hands to Scoring. Scroll sideways for more columns; hover a cell for its full text.</div>
    </>;
  }

  function renderAccountsTab(): ReactNode {
    const cols: Col[] = [['Account', 240], ['Location', 190], ['Industry (as held)', 180], ['Vertical', 160], ['Confidence', 130], ['Classification', 300], ['Account type', 170], ['Size', 170], ['Customer', 120], ['Site', 240], ['Contacts', 230], ['Owner', 220], ['Knock-outs', 260]];
    return <>
      <div className="score-list">
        {toolbar(<>{pill('all', 'All')}{pill('pass', 'Pass')}{pill('excluded', 'Excluded')}{pill('review', 'Needs review')}</>, 'Search accounts…')}
        <div id="rows"><Table cols={cols} empty="No accounts match."
          rows={visibleAccounts.map(a => <AccountRow key={a.id} a={a} cs={contactsByAcc.get(a.id) || NO_CONTACTS} />)} /></div></div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>One row per account. The installed-base knock-out runs in Scoring, from the signal file. Scroll sideways for more columns; hover a cell for its full text.</div>
    </>;
  }

  return <>
    <main className="main" id="mainArea">{screen === 'run' && run ? renderRunView(run) : renderStartView()}</main>

    <div className={drawerOpen ? 'detail-drawer open' : 'detail-drawer'} id="detailDrawer">
      <div className="drawer-hdr">
        <div>
          <div className="drawer-title" id="detTitle">Account detail</div>
          <div className="drawer-sub" id="detSub">—</div>
        </div>
        <div className="drawer-close" onClick={closeDrawer}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
      </div>
      <div className="drawer-body" id="detBody"></div>
    </div>

    {checks ? <ChecksOverlay ck={checks}
      onDifferent={() => { hideChecks(); renderStart('upload'); }}
      onView={() => { hideChecks(); renderRun(); }} /> : null}

    {save ? (
      <div id="saveOverlay" style={{ ...sx(OVERLAY_CSS), display: save.shown ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) hideSave(); }}>
        <div key={save.key} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:440px;max-width:100%;padding:20px 22px')}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:4px')}>{save.saved ? 'Update the saved list' : 'Save the screened list'}</div>
          <div style={sx('font-size:12px;color:var(--i3);margin-bottom:14px;line-height:1.5')}>{save.text}</div>
          <label style={sx('font-size:11px;font-weight:600;color:var(--i2)')}>List name</label>
          <input id="listName" ref={listNameRef} defaultValue={save.base} style={sx('width:100%;margin:5px 0 18px;padding:9px 11px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px')} onKeyDown={e => { if (e.key === 'Enter') saveList(save.go); }} />
          <div style={sx('display:flex;gap:8px;justify-content:flex-end')}>
            <button className="btn btn-ghost btn-sm" onClick={hideSave}>Cancel</button>
            <button className={`btn ${save.go ? 'btn-sec' : 'btn-primary'} btn-sm`} onClick={() => saveList(false)}>Save</button>
            <button className={`btn ${save.go ? 'btn-primary' : 'btn-sec'} btn-sm`} onClick={() => saveList(true)}>Save and go to Scoring →</button>
          </div></div>
      </div>) : null}
  </>;
}

const NO_ISSUES: Issue[] = [];
const NO_CONTACTS: Contact[] = [];
