'use client';

/* Account Scoring (was legacy/11-scoring.html).
   Pick a saved prospect list (or upload a lead file), upload the signal file, watch the checks run, then work the
   ranked prospects: tiers, filters, the detail drawer, saving the run and the hand-off to Micro-segments & NBA.
   Markup and text match the original page. Scoring runs on the server as a job whose real stages drive the pop-up
   (G-043); runs are stored, read a page at a time with server search (G-022), and the as-of date is validated,
   never silently replaced by today (G-061). The hand-off is stored with a UUID per prospect (G-049). Phase 4c (G-023):
   the signal settings each run was scored with, Signal monitoring, the unused-rows drawer, the tier explainer and
   what would move a prospect to tier A (worked out with the engine's own scoring). */
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DemandAI } from '@/lib/demandai-engine';
import { DemandAISample } from '@/lib/demandai-sample-data';
import { SIG_STEPS, nextTierMoves } from '@/lib/engine/prospects';
import { showToast, avColor } from '@/lib/ui';
import { download } from '@/lib/download';
import { sx } from '@/lib/sx';
import { ApiError, api, errorText, uploadFile, waitForJob, type JobState, type Wire } from '@/lib/client/api';
import { useDebounced } from '@/lib/client/use-debounced';
import { usePaged } from '@/lib/client/use-paged';
import { RenameField } from '@/components/RenameField';
import { RoutingTab } from '@/components/RoutingTab';
import { useCan } from '@/components/SessionContext';
import type { ListDetail as ServerListDetail, ListSummary as ServerListSummary } from '@/lib/server/services/lists';
import type { ActiveSignalSettings, ProspectDetail, ProspectRow, RunDetail as ServerRunDetail, RunSummary as ServerRunSummary } from '@/lib/server/services/scoring';
import type { MonitoredFile, MonitoredType, SignalMonitoring, SignalTypeStatus } from '@/lib/server/services/signal-monitoring';
import type { DqCode, Signal, Tier } from '@/types/demandai';

/* ═══════════════ TYPES ═══════════════ */
type ListSummary = Wire<ServerListSummary>;
type RunSummary = Wire<ServerRunSummary>;
type RunDetail = Wire<ServerRunDetail>;
type SignalRow = Signal & { seq: number };
type SrcMode = 'saved' | 'upload';
type StartTab = 'new' | 'saved' | 'monitor';
type NewRunSettings = Omit<ActiveSignalSettings, 'configVersionId'>;
type Monitoring = Omit<SignalMonitoring, 'types' | 'files'> & { types: Wire<MonitoredType>[]; files: Wire<MonitoredFile>[] };
type View = 'ranked' | 'evidence' | 'routing';
interface ChecksState { phase: 'running' | 'done' | 'failed'; stage: string; done: number; total: number; listName: string; fileName: string; asOf: string; run: RunDetail | null; error: string }

/** A job that ended without a result: its message is written for the person. */
class JobFailed extends Error {}

/* ═══════════════ HELPERS (local copies, as the original page had them) ═══════════════ */
function initials(n: string): string { return String(n).split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function esc(s: unknown): string {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function todayIso(): string { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const fmt1 = (n: number | undefined | null): string => n === undefined || n === null ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 1 : 0, maximumFractionDigits: 1 });
const fmtDate = (t: string | number): string => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
/** A YYYY-MM-DD day as written, whatever the browser's time zone. */
const fmtDay = (iso: string): string => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const kb = (b: number): string => b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
const upperFirst = (s: string): string => s.replace(/^./, m => m.toUpperCase());
const query = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

/** What is wrong with the as-of date, or null (the server checks the same, G-061). */
function asOfProblem(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return 'Choose the date to score as of.';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return `${v} is not a real date.`;
  if (v > todayIso()) return "The scoring date can't be in the future.";
  return null;
}

/** The sub line of a cell: what it shows, and its title (the original stripped the tags from the sub's HTML). */
interface Sub { node: ReactNode; title: string }
/** A sub given as escaped text in the original (`esc(x)`): shows x; its title attribute carried esc(x) literally. */
const escSub = (text: string): Sub | null => text ? { node: text, title: esc(text) } : null;

function cell(v: string | null | undefined, sub?: Sub | null, cls = 'val'): ReactNode {
  return <>
    <span className={cls} title={v || ''}>{v ? v : <span className="muted">—</span>}</span>
    {sub ? <span className="sub" title={sub.title}>{sub.node}</span> : null}
  </>;
}

type Col = [ReactNode, string, string?];
function table(cols: Col[], rows: ReactNode[], empty: ReactNode): ReactNode {
  return <div className="dt-wrap"><table className="dt">
    <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c[1] }} />)}</colgroup>
    <thead><tr>{cols.map((c, i) => <th key={i} className={c[2] || ''}>{c[0]}</th>)}</tr></thead>
    <tbody>{rows.length ? rows : <tr><td colSpan={cols.length} className="dt-empty">{empty}</td></tr>}</tbody>
  </table></div>;
}

const SEG_TONE: Record<string, string> = { Inquiry: 'tag-blue', Modernisation: 'tag-violet', 'Service renewal': 'tag-teal', Project: 'tag-amber', Leadership: 'tag-pink', Engagement: 'tag-green' };
/** A signal tag, coloured by the micro-segment it feeds (`segment` for a type added in Setup). */
function tagChip(t: string, key?: string | number, segment?: string): ReactNode {
  const seg = DemandAI.CONFIG.signalTypes[t]?.segment ?? segment;
  return <span key={key} className={`tag ${(seg && SEG_TONE[seg]) || 'tag-grey'}`}>{t}</span>;
}
const TIER_PILL = { A: ['tag-green', 'Tier A'], B: ['tag-amber', 'Tier B'], C: ['tag-blue', 'Tier C'], 'Watch list': ['tag-grey', 'Watch list'], 'Below fit floor': ['tag-grey', 'Below floor'], Excluded: ['tag-red', 'Excluded'] } as Record<Tier, [string, string]>;
function tierPill(t: Tier): ReactNode {
  const m = TIER_PILL[t];
  return <span className={`tag ${m[0]}`}>{m[1]}</span>;
}
const tierName = (t: Tier): string => TIER_PILL[t]?.[1] ?? t;

function ago(d: number): string { return d === 0 ? 'today' : d < 14 ? d + 'd ago' : d < 60 ? Math.round(d / 7) + 'w ago' : Math.round(d / 30) + 'mo ago'; }
function miniStat(label: string, val: string, sub: string): ReactNode {
  return <div style={sx('flex:1;padding:10px 12px;border-right:1px solid var(--border)')}><div style={sx('font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--i3)')}>{label}</div><div style={sx('font-family:var(--fd);font-size:20px;font-weight:700;color:var(--i1);margin-top:2px')}>{val}</div>{sub ? <div style={sx('font-size:10px;color:var(--i3)')}>{sub}</div> : null}</div>;
}
/** A key/value row of the Contact panel. `title` is the original's tag-stripped HTML of the value. */
function kv(k: string, v: ReactNode, title: string): ReactNode {
  return <div style={sx('display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--s75);font-size:12px')}><span style={sx('color:var(--i3);width:96px;flex-shrink:0')}>{k}</span><span style={sx('color:var(--i1);min-width:0;overflow:hidden;text-overflow:ellipsis')} title={title}>{v}</span></div>;
}

const SEARCH_ICON = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={sx('color:var(--i3);flex-shrink:0')}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
const OVERLAY_STYLE = sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px');
const STATUS_TAG: Record<SignalTypeStatus, ReactNode> = {
  'Not a known tag': <span className="tag tag-amber">Not a known tag</span>, 'Knock-out': <span className="tag tag-grey">Knock-out</span>,
  'Not scored': <span className="tag tag-grey">Not scored</span>, Off: <span className="tag tag-red">Off</span>, On: <span className="tag tag-green">On</span>,
};
// The tier explainer is open on the first visit and folded after (a screen preference, not personal data).
const TIER_KEY = 'demandai_scoring_tiers_v1';
// What one new signal of each type looks like, in the original's words.
const MOVE_TEXT: Record<string, (first: string) => string> = {
  'Inquiry or RFQ': first => `${first} asks a question or for a quote`,
  'Installed system near end of support': () => 'News that their control system is nearing end of support',
  'Capital project': () => 'A new project or expansion announced at the site',
};
const STAGE_TEXT: Record<string, string> = { queued: 'Waiting to start…', parse: 'Reading the signal file…', check: 'Checking the signals…', score: 'Scoring the prospects…', save: 'Saving the scores…' };
const PAGE = 200;

type StartData = [{ lists: ListSummary[] }, { runs: RunSummary[]; signalSettings: NewRunSettings }];
const fetchStart = (): Promise<StartData> => Promise.all([api<{ lists: ListSummary[] }>('/api/lists'), api<{ runs: RunSummary[]; signalSettings: NewRunSettings }>('/api/scoring-runs')]);

/* ═══════════════ SCREEN ═══════════════ */
export function ScoringScreen() {
  const router = useRouter();
  const canSetup = useCan('setup.view');
  const [screen, setScreen] = useState<'none' | 'start' | 'results'>('none');
  const [srcMode, setSrcMode] = useState<SrcMode>('saved');
  const [tab, setTab] = useState<StartTab>('new');
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selListId, setSelListId] = useState<string | null>(null);
  // What the person typed; until then the chosen list's default (the sample's date for a sandbox list, else today).
  const [asOfInput, setAsOfInput] = useState<string | null>(null);
  const [asOfError, setAsOfError] = useState('');
  const [run, setRun] = useState<RunDetail | null>(null);
  const [view, setView] = useState<View>('ranked');
  const [filt, setFilt] = useState('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim().toLowerCase());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nsel, setNsel] = useState<Set<string>>(() => new Set());
  const [checks, setChecks] = useState<ChecksState | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveKey, setSaveKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawer, setDrawer] = useState<Wire<ProspectDetail> | null>(null);
  const [drawerMode, setDrawerMode] = useState<'prospect' | 'unused'>('prospect');
  const [newSettings, setNewSettings] = useState<NewRunSettings | null>(null);
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null);
  const [tiersOpen, setTiersOpen] = useState(() => { try { return localStorage.getItem(TIER_KEY) !== 'closed'; } catch { return true; } });
  const runNameRef = useRef<HTMLInputElement>(null);
  const nAllRef = useRef<HTMLInputElement>(null);

  const closeDrawer = () => setDrawerOpen(false);
  const selList = lists.find(l => l.id === selListId);
  const asOf = asOfInput ?? (selList && selList.sandbox ? DemandAISample.SAMPLE_AS_OF : todayIso());

  /* ─── START: New scoring | Scored lists ─── */
  const applyStart = useCallback(([l, r]: StartData, wantList?: string | null) => {
    setLists(l.lists); setRuns(r.runs); setNewSettings(r.signalSettings);
    setSelListId(cur => {
      const want = wantList ?? cur;
      return want && l.lists.some(x => x.id === want) ? want : l.lists[0]?.id ?? null;
    });
  }, []);
  async function loadStart(wantList?: string | null) {
    try { applyStart(await fetchStart(), wantList); } catch (e) { showToast(errorText(e)); }
  }
  const renderStart = (t?: StartTab) => {
    setRun(null); setDrawerOpen(false);
    if (t) setTab(t);
    setScreen('start');
    void loadStart();
    router.replace(t === 'monitor' ? '/scoring?tab=monitor' : '/scoring', { scroll: false });
  };
  const chooseList = (id: string) => {
    setSelListId(id);
    setAsOfInput(null);
    setAsOfError('');
  };

  /* ─── Upload a prospect file here: checked like in Prospecting, then saved as a list ─── */
  async function onLeadFile(file: File | undefined) {
    if (!file) return;
    try {
      const { jobId } = await uploadFile<{ jobId: string }>('/api/uploads', { kind: 'lead' }, file);
      const job = await waitForJob(jobId, () => {});
      if (job.status !== 'succeeded') { showToast(`${file.name}: ${job.error?.message ?? 'the checks did not finish'}`); return; }
      const { list } = await api<{ list: Wire<ServerListDetail> }>(`/api/lists/${job.progress.result!.listId}`);
      if (!list.stats.accountsPass) { showToast(`${file.name}: no accounts pass the checks. Open it in Prospecting to see why`); return; }
      await api(`/api/lists/${list.id}/save`, { body: { name: file.name.replace(/\.[^.]+$/, '') + ' · ' + todayIso() } });
      setSrcMode('saved');
      await loadStart(list.id);
      const s = list.stats;
      showToast(`${s.rowsRead} rows checked · ${s.accountsPass} accounts and ${s.inFinalList} contacts in the list · ${s.issues} issue${s.issues === 1 ? '' : 's'}. Saved as a list`);
    } catch (e) { showToast(errorText(e)); }
  }

  /* ─── SCORE: on the server, the pop-up following the job ─── */
  async function score(fileName: string, upload: () => Promise<{ uploadId: string }>) {
    const L = lists.find(l => l.id === selListId);
    if (!L) { showToast("That prospect list isn't saved any more"); return; }
    const problem = asOfProblem(asOf);
    if (problem) { setAsOfError(problem); return; }
    setAsOfError('');
    setChecks({ phase: 'running', stage: 'queued', done: 0, total: 4, listName: L.name, fileName, asOf, run: null, error: '' });
    try {
      const { uploadId } = await upload();
      const started = await api<{ runId: string; jobId: string }>('/api/scoring-runs', { body: { listId: L.id, signalUploadId: uploadId, asOf } });
      const job: JobState = await waitForJob(started.jobId, j => setChecks(c => c && { ...c, stage: j.stage ?? 'queued', done: j.progress.done, total: j.progress.stages.length || 4 }));
      if (job.status !== 'succeeded') throw new JobFailed(job.error?.message ?? 'Scoring did not finish. Try again.');
      const detail = (await api<{ run: RunDetail }>(`/api/scoring-runs/${started.runId}`)).run;
      setRun(detail); setView('ranked'); setFilt('all'); setQ(''); setNsel(new Set());
      setChecks(c => c && { ...c, phase: 'done', done: c.total, run: detail });
      router.replace('/scoring?run=' + encodeURIComponent(detail.id), { scroll: false });
    } catch (e) {
      const msg = e instanceof JobFailed ? e.message : e instanceof ApiError ? errorText(e) : 'The file did not reach DemandAI. Check your connection and try again.';
      if (e instanceof ApiError && e.fields?.asOf) setAsOfError(e.fields.asOf[0]);
      setChecks(c => c && { ...c, phase: 'failed', error: msg });
    }
  }
  function onFile(file: File | undefined) {
    if (!file) return;
    void score(file.name, () => uploadFile<{ uploadId: string }>('/api/uploads', { kind: 'signal' }, file));
  }
  const useSample = () => { void score(DemandAISample.SIGNAL_FILE, () => api<{ uploadId: string }>('/api/uploads/sample', { body: { kind: 'signal' } })); };

  /* ─── RESULTS: a page at a time from the server ─── */
  const openRun = useCallback(async (id: string, keepUrl = false) => {
    try {
      const detail = (await api<{ run: RunDetail }>(`/api/scoring-runs/${id}`)).run;
      setRun(detail); setView('ranked'); setFilt('all'); setQ(''); setNsel(new Set()); setDrawerOpen(false); setScreen('results');
      if (!keepUrl) router.replace('/scoring?run=' + encodeURIComponent(id), { scroll: false });
    } catch (e) { showToast(errorText(e)); setScreen('start'); }
  }, [router]);
  const runId = run?.id;
  const rankedUrl = runId && screen === 'results' && view === 'ranked' ? `/api/scoring-runs/${runId}/prospects?` + query({ tier: filt === 'all' ? undefined : filt, q: dq, limit: PAGE }) : null;
  const evidenceUrl = runId && screen === 'results' && view === 'evidence' ? `/api/scoring-runs/${runId}/signals?` + query({ status: filt === 'all' ? undefined : filt, q: dq, limit: PAGE }) : null;
  const unusedUrl = runId && screen === 'results' && drawerOpen && drawerMode === 'unused' ? `/api/scoring-runs/${runId}/signals?` + query({ status: 'unused', limit: PAGE }) : null;
  const prospects = usePaged<ProspectRow>(rankedUrl);
  const evidence = usePaged<SignalRow>(evidenceUrl);
  const unused = usePaged<SignalRow>(unusedUrl);
  const visibleProspects = prospects.rows;
  const visibleSignals = evidence.rows;

  const toggleN = (id: string, on: boolean) => setNsel(prev => { const s = new Set(prev); if (on) s.add(id); else s.delete(id); return s; });
  const toggleNAll = (on: boolean) => setNsel(prev => { const s = new Set(prev); (visibleProspects ?? []).filter(x => x.sendable).forEach(x => on ? s.add(x.contactId) : s.delete(x.contactId)); return s; });
  const clearN = () => setNsel(new Set());

  async function sendToNBA() {
    if (!run) return;
    try {
      const h = await api<{ handoffId: string; count: number; heldBack: number }>('/api/handoffs', { body: { runId: run.id, ...(nsel.size ? { contactIds: [...nsel] } : {}) } });
      showToast(`${h.count} prospect${h.count === 1 ? '' : 's'} sent to NBA` + (h.heldBack ? ` · ${h.heldBack} who can't be contacted stay${h.heldBack === 1 ? 's' : ''} in Scoring` : ''));
      setTimeout(() => { router.push('/nba?handoff=' + encodeURIComponent(h.handoffId)); }, 500);
    } catch (e) { showToast(errorText(e)); }
  }

  /* ─── SAVE, OPEN, RENAME SCORED LISTS ─── */
  const openSave = () => { setSaveOpen(true); setSaveKey(k => k + 1); };
  const hideSave = () => setSaveOpen(false);
  useEffect(() => {
    if (!saveOpen) return;
    const t = setTimeout(() => { const el = runNameRef.current; if (el) { el.focus(); el.select(); } }, 30);
    return () => clearTimeout(t);
  }, [saveOpen, saveKey]);
  async function saveRun() {
    if (!run) return;
    const name = (runNameRef.current?.value ?? '').trim() || run.listName;
    try {
      await api(`/api/scoring-runs/${run.id}/save`, { body: { name } });
      setSaveOpen(false); showToast(`Saved as "${name}"`);
      setRun((await api<{ run: RunDetail }>(`/api/scoring-runs/${run.id}`)).run);
    } catch (e) { showToast(errorText(e)); }
  }
  async function removeRun(id: string) {
    try { await api(`/api/scoring-runs/${id}`, { method: 'DELETE' }); showToast('Scored list deleted'); }
    catch (e) { showToast(errorText(e)); }
    renderStart('saved');
  }
  async function finishRename(id: string, name: string) {
    const r = runs.find(x => x.id === id);
    setRenamingId(null);
    if (r && name && name !== r.name) {
      try { await api(`/api/scoring-runs/${id}`, { method: 'PATCH', body: { name } }); showToast('Renamed'); }
      catch (e) { showToast(errorText(e)); }
    }
    void loadStart();
  }

  /* ─── PROSPECT DRAWER ─── */
  async function openProspect(contactId: string) {
    if (!run) return;
    try {
      const { prospect } = await api<{ prospect: Wire<ProspectDetail> }>(`/api/scoring-runs/${run.id}/prospects/${contactId}`);
      setDrawer(prospect); setDrawerMode('prospect'); setDrawerOpen(true);
    } catch (e) { showToast(errorText(e)); }
  }
  /* ─── UNUSED ROWS: every row of the signal file that didn't count, and why ─── */
  const openUnused = () => { setDrawerMode('unused'); setDrawerOpen(true); };

  /* ─── TIERS EXPLAINED: open on the first visit, folded away after that ─── */
  const toggleTiers = () => setTiersOpen(open => {
    try { localStorage.setItem(TIER_KEY, open ? 'closed' : 'open'); } catch { /* storage blocked: the choice lasts this visit */ }
    return !open;
  });

  /* ─── SIGNAL MONITORING: read when its tab is shown ─── */
  useEffect(() => {
    if (screen !== 'start' || tab !== 'monitor') return;
    let live = true;
    api<{ monitoring: Monitoring }>('/api/signal-monitoring')
      .then(r => { if (live) setMonitoring(r.monitoring); })
      .catch(e => { if (live) showToast(errorText(e)); });
    return () => { live = false; };
  }, [screen, tab]);

  // Indeterminate state of the select-all box, as updateNBar set it.
  useEffect(() => {
    const all = nAllRef.current;
    if (!all) return;
    all.indeterminate = !all.checked && (visibleProspects ?? []).some(x => x.sendable && nsel.has(x.contactId));
  });

  /* ─── BOOT: a run named in the address reopens it; a list named there is preselected ─── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const runParam = params.get('run');
    const toStart = () => fetchStart().then(d => { applyStart(d, params.get('list')); if (params.get('tab') === 'monitor') setTab('monitor'); setScreen('start'); });
    const boot = runParam
      ? api<{ run: RunDetail }>(`/api/scoring-runs/${encodeURIComponent(runParam)}`).then(({ run: detail }) => { setRun(detail); setScreen('results'); })
      : toStart();
    boot.catch(e => { showToast(errorText(e)); void toStart().catch(() => {}); });
  }, [applyStart]);

  /* ═══════════════ RENDER ═══════════════ */
  const dropHandlers = (onDropFile: (f: File) => void) => ({
    onDragOver: (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--brand)'; },
    onDragLeave: (e: DragEvent<HTMLLabelElement>) => { e.currentTarget.style.borderColor = 'var(--bdk)'; },
    onDrop: (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--bdk)'; if (e.dataTransfer.files[0]) onDropFile(e.dataTransfer.files[0]); },
  });

  function startView(): ReactNode {
    const L = lists.find(l => l.id === selListId);
    const ft = (id: StartTab, label: string, n?: number) => <div className={`ftab ${tab === id ? 'active' : ''}`} onClick={() => renderStart(id)}>{label}{n !== undefined ? <>{' '}<span className="ftab-cnt">{n}</span></> : null}</div>;
    // The tags a new run scores: the starting types and those added in Setup; a switched-off one is struck through.
    const added = newSettings?.custom ?? [], off = new Set(newSettings?.off ?? []);
    const segOf = Object.fromEntries(added.map(c => [c.name, c.segment]));
    const types = [...Object.keys(DemandAI.CONFIG.signalTypes).filter(k => !DemandAI.CONFIG.signalTypes[k].knockout && !DemandAI.CONFIG.signalTypes[k].reject), ...added.map(c => c.name)];
    const settingsNote = [off.size ? `Switched off in Setup, so not scored: ${[...off].join(', ')}.` : '', added.length ? `Added in Setup: ${added.map(c => c.name).join(', ')}.` : ''].filter(Boolean).join(' ');
    return <>
      <div className="topbar"><div className="topbar-l"><span className="tb-title">Account Scoring</span><span className="tb-badge badge-neutral">Fit × Timing · rules only</span></div></div>
      <div className="ftabs">{ft('new', 'New scoring')}{ft('saved', 'Scored lists', runs.length)}{ft('monitor', 'Signal monitoring')}</div>
      <div className="canvas">{tab === 'monitor' ? monitorView() : tab === 'new' ? (
        <div style={sx('max-width:640px;margin:24px auto 0')}>
          <div style={sx('font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand);margin-bottom:8px')}>Step 2 · Scoring</div>
          <div style={sx('font-family:var(--fd);font-size:22px;font-weight:700;color:var(--i1);margin-bottom:6px')}>Score a prospect list</div>
          <div style={sx('font-size:13px;color:var(--i3);margin-bottom:20px;line-height:1.55')}>{"There's no data integration in the POC: the client sends the signals as a file. Pick the prospect list, upload the signals for those prospects, and every row is checked and scored by fixed rules."}</div>

          <div className="panel" style={sx('margin-bottom:12px')}>
            <div className="panel-hdr"><span className="panel-ttl">1 · Prospect list</span><Link href="/prospecting" style={sx('font-size:11px;color:var(--brand);font-weight:600;text-decoration:none')}>Build a list in Prospecting →</Link></div>
            <div className="panel-body">
              <div style={sx('display:inline-flex;background:var(--s75);border-radius:999px;padding:3px;margin-bottom:12px')}>
                {([['saved', 'Choose a saved list'], ['upload', 'Upload a prospect file']] as [SrcMode, string][]).map(([m, l]) => <button key={m} onClick={() => setSrcMode(m)} style={sx(`padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;${srcMode === m ? 'background:var(--surf);color:var(--i1);box-shadow:var(--sh)' : 'color:var(--i3)'}`)}>{l}</button>)}
              </div>
              {srcMode === 'upload' ? <>
                <label id="leadDrop" htmlFor="leadInput" style={sx('display:block;border:1.5px dashed var(--bdk);border-radius:var(--rmd);padding:22px 20px;cursor:pointer;background:var(--s50);text-align:center')} {...dropHandlers(f => { void onLeadFile(f); })}>
                  <input type="file" id="leadInput" accept=".csv,.xlsx,.xls" style={sx('display:none')} onChange={e => { void onLeadFile(e.currentTarget.files ? e.currentTarget.files[0] : undefined); e.currentTarget.value = ''; }} />
                  <div style={sx('font-size:13px;font-weight:600;color:var(--i1)')}>Click to choose the prospect file, or drop it here</div>
                  <div style={sx('font-size:11px;color:var(--i3);margin-top:4px')}>.xlsx or .csv · the lead template, one row per contact · checked like in Prospecting, then saved as a list</div>
                </label>
                <div style={sx('margin-top:10px')}><button className="btn btn-sec btn-sm" onClick={() => { download('lead_template.csv', DemandAI.toCSV([DemandAI.LEAD_COLUMNS])); }}>Download lead template (.csv)</button></div>
              </> : lists.length ? <>
                <select value={selListId || ''} aria-label="Prospect list" onChange={e => chooseList(e.currentTarget.value)} style={sx('width:100%;padding:9px 11px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px;background:var(--surf);color:var(--i1)')}>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {L ? <div style={sx('display:flex;gap:18px;margin-top:10px;font-size:12px;color:var(--i2)')}>
                  <span><b style={sx('color:var(--i1)')}>{L.stats.accountsPass}</b> accounts</span><span><b style={sx('color:var(--i1)')}>{L.stats.inFinalList}</b> contacts in the list</span><span style={sx('color:var(--i3)')}>{`from ${L.sourceFile} · saved ${fmtDate(L.savedAt ?? L.createdAt)}`}</span>
                </div> : null}
              </> : <div style={sx('font-size:12.5px;color:var(--i2)')}>No prospect lists yet. <a href="#" onClick={e => { e.preventDefault(); setSrcMode('upload'); }} style={sx('color:var(--brand);font-weight:600')}>Upload a prospect file</a> here, or build one in Prospecting.</div>}
            </div>
          </div>

          <div className="panel" style={sx(L ? '' : 'opacity:.5;pointer-events:none')}>
            <div className="panel-hdr"><span className="panel-ttl">2 · Signals for these prospects</span>
              <span style={sx('display:flex;align-items:center;gap:6px;font-size:11px;color:var(--i3)')}><label htmlFor="asOf">Score as of</label> <input type="date" id="asOf" value={asOf} max={todayIso()} aria-invalid={!!asOfError} aria-describedby={asOfError ? 'asOfError' : undefined} onChange={e => { setAsOfInput(e.currentTarget.value); setAsOfError(''); }} style={sx(`padding:3px 6px;border:1px solid ${asOfError ? 'var(--neg)' : 'var(--bdk)'};border-radius:6px;font-size:11.5px`)} /></span></div>
            <div className="panel-body">
              {asOfError ? <div id="asOfError" role="alert" style={sx('font-size:12px;color:var(--neg);margin-bottom:10px')}>{asOfError}</div> : null}
              <label id="dropZone" htmlFor="fileInput" style={sx('display:block;border:1.5px dashed var(--bdk);border-radius:var(--rmd);padding:26px 20px;cursor:pointer;background:var(--s50);text-align:center')} {...dropHandlers(f => onFile(f))}>
                <input type="file" id="fileInput" accept=".csv,.xlsx,.xls" style={sx('display:none')} onChange={e => { onFile(e.currentTarget.files ? e.currentTarget.files[0] : undefined); e.currentTarget.value = ''; }} />
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--i3)" strokeWidth="1.5" strokeLinecap="round" style={sx('margin-bottom:6px')}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                <div style={sx('font-size:13px;font-weight:600;color:var(--i1)')}>Click to choose the signal file, or drop it here</div>
                <div style={sx('font-size:11px;color:var(--i3);margin-top:4px')}>.xlsx or .csv · one row per signal, naming the person by email or LinkedIn URL</div>
              </label>
              <div style={sx('display:flex;gap:8px;margin-top:12px;flex-wrap:wrap')}>
                {L && L.sandbox ? <button className="btn btn-primary btn-sm" onClick={useSample}>Use sample signals</button> : null}
                <button className="btn btn-sec btn-sm" onClick={() => { download('signal_template.csv', DemandAI.toCSV([DemandAI.SIGNAL_COLUMNS])); }}>Download signal template (.csv)</button>
              </div>
              <div style={sx('font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--i3);margin:16px 0 8px')}>Signal tags the file can use</div>
              <div className="tags">{types.map((t, i) => off.has(t)
                ? <span key={i} className="tag tag-grey" title="Switched off in Setup: rows with this tag are not scored" style={sx('text-decoration:line-through')}>{t}</span>
                : tagChip(t, i, segOf[t]))}</div>
              {settingsNote ? <div style={sx('font-size:11px;color:var(--i3);margin-top:8px;line-height:1.5')}>{settingsNote}</div> : null}
              {newSettings?.problem ? <div role="alert" style={sx('font-size:12px;color:var(--neg);margin-top:8px;line-height:1.5')}>{newSettings.problem}</div> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="score-list">{table([['Name', '26%'], ['Prospect list', '18%'], ['Signal file', '14%'], ['Scored', '8%', 'num'], ['Tier A', '7%', 'num'], ['Saved', '11%'], ['', '16%']],
          runs.map(r => {
            const saved = r.savedAt ?? r.createdAt;
            return <tr key={r.id}>
              <td><div className="person"><div className="co-av" style={{ background: avColor(r.id) }}>{initials(r.name ?? '')}</div><div style={sx('flex:1;min-width:0')}>{renamingId === r.id
                ? <RenameField initial={r.name ?? ''} onDone={name => void finishRename(r.id, name)} onCancel={() => setRenamingId(null)} />
                : <><div style={sx('display:flex;align-items:center;gap:6px;min-width:0')}><span className="dt-main" title={r.name ?? ''}>{r.name}</span><button title="Rename" aria-label={`Rename ${r.name}`} onClick={() => setRenamingId(r.id)} style={sx('flex-shrink:0;color:var(--i3);display:flex;padding:2px')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg></button></div><span className="sub">{'As of ' + r.asOf}</span></>}</div></div></td>
              <td>{cell(r.listName)}</td>
              <td>{cell(r.sourceFile)}</td>
              <td className="num">{r.stats.scored}<span className="sub">prospects</span></td>
              <td className="num">{r.stats.A}</td>
              <td>{cell(fmtDate(saved), escSub(new Date(saved).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })))}</td>
              <td style={sx('text-align:right')}><button className="btn btn-sec btn-sm" onClick={() => void openRun(r.id)}>Open</button>{' '}<button className="btn btn-ghost btn-sm" onClick={() => void removeRun(r.id)}>Delete</button></td>
            </tr>;
          }), <>No scored lists yet. <a href="#" onClick={e => { e.preventDefault(); renderStart('new'); }} style={sx('color:var(--brand);font-weight:600')}>Score a prospect list</a> and save it.</>)}
        </div>
      )}
      </div>
    </>;
  }

  /* ─── SIGNAL MONITORING: what has come in, per signal type ─── */
  function monitorView(): ReactNode {
    const m = monitoring;
    if (!m) return <div style={sx('font-size:12.5px;color:var(--i3)')} role="status">Loading…</div>;
    const T = m.totals, max = Math.max(1, ...m.types.map(t => t.records));
    const tile = (k: string, v: string | number, sub: string) => <div className="stat"><div className="stat-l">{k}</div><div className="stat-v">{v}</div><div className="stat-s" title={sub}>{sub}</div></div>;
    return <div style={sx('max-width:1100px')}>
      <div style={sx('display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:14px;flex-wrap:wrap')}>
        <div><div style={sx('font-family:var(--fd);font-size:18px;font-weight:700;color:var(--i1)')}>What has come in, per signal</div>
          <div style={sx('font-size:12.5px;color:var(--i3);margin-top:3px;line-height:1.5')}>In the POC the client sends signals as files, so this counts the rows in every signal file scored so far, each file once. Once the data connectors are in, it shows the live stream.</div></div>
        {canSetup ? <Link href="/setup#sec-signals" className="btn btn-sec btn-sm" style={sx('text-decoration:none')}>Switch signals on or off in Setup →</Link> : null}</div>
      {m.scope === 'own' ? <div style={sx('font-size:11.5px;color:var(--i3);margin:-4px 0 12px')}>You see the signal rows about the accounts you own.</div> : null}
      {m.settingsProblem ? <div role="alert" style={sx('font-size:12px;color:var(--neg);margin:-4px 0 12px')}>{m.settingsProblem}</div> : null}
      <div className="mon-tiles">{tile('Records received', T.records.toLocaleString('en-US'), `${T.files} file${T.files === 1 ? '' : 's'}`)}{tile('Size', kb(T.size), 'all signal rows')}{tile('Signal types seen', `${T.knownSeen} of ${T.known}`, 'known tags')}{tile('Not a known tag', T.unknownRecords, T.unknownTypes.length ? T.unknownTypes.join(', ') : 'every row uses a known tag')}</div>
      <div className="score-list">{table([['Signal', '26%'], ['Records received', '22%'], ['Size', '9%', 'num'], ['Files', '8%', 'num'], ['Latest event', '12%'], ['Last received', '12%'], ['Status', '11%']],
        m.types.map(t => <tr key={t.type} style={t.records ? undefined : sx('opacity:.6')}>
          <td>{cell(t.type, t.segment ? escSub(`Feeds ${t.segment}${t.added ? ' · added in Setup' : ''}`) : null)}</td>
          <td>{t.records ? <div style={sx('display:flex;align-items:center;gap:8px')}><span style={sx('flex:1;height:6px;border-radius:3px;background:var(--s75);overflow:hidden')}><i style={{ ...sx('display:block;height:100%;background:var(--brand);border-radius:3px'), width: `${t.records / max * 100}%` }}></i></span><b style={sx('min-width:22px;text-align:right;color:var(--i1)')}>{t.records}</b></div> : <span className="muted">None yet</span>}</td>
          <td className="num">{t.records ? kb(t.size) : '—'}</td><td className="num">{t.records ? t.files : '—'}</td>
          <td>{t.latestEvent ? cell(fmtDay(t.latestEvent)) : <span className="muted">—</span>}</td><td>{t.lastReceived ? cell(fmtDate(t.lastReceived)) : <span className="muted">—</span>}</td><td>{STATUS_TAG[t.status]}</td>
        </tr>), 'No signal files yet.')}</div>
      {m.files.length ? <>
        <div style={sx('font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--i3);margin:20px 0 8px')}>Files received</div>
        <div className="score-list">{table([['File', '34%'], ['Used in', '20%'], ['Rows', '10%', 'num'], ['Size', '10%', 'num'], ['Received', '26%']],
          m.files.map(f => <tr key={f.uploadId}><td>{cell(f.fileName)}</td><td>{cell(f.usedIn)}</td><td className="num">{f.rows}</td><td className="num">{kb(f.byteSize)}</td><td>{cell(fmtDate(f.receivedAt))}</td></tr>), '')}</div>
      </> : null}
    </div>;
  }

  function searchBox(ph: string): ReactNode {
    return <div className="sl-srch">{SEARCH_ICON}<input type="text" placeholder={ph} aria-label={ph} value={q} onChange={e => setQ(e.currentTarget.value)} /></div>;
  }
  const pill = (id: string, label: string) => <div key={id} className={`seg-pill ${filt === id ? 'active' : ''}`} onClick={() => setFilt(id)}>{label}</div>;
  function moreButton(page: { next: number | null; busy: boolean; more: () => Promise<void> }, shown: number, total: number | null): ReactNode {
    if (page.next === null) return null;
    return <div style={sx('display:flex;justify-content:center;padding:12px')}><button className="btn btn-sec btn-sm" disabled={page.busy} onClick={() => void page.more()}>{total !== null ? `Show more (${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} shown)` : `Show more (${shown.toLocaleString('en-US')} shown)`}</button></div>;
  }

  function rankedTab(r: RunDetail): ReactNode {
    const n = nsel.size;
    const rs = visibleProspects ?? [];
    const num = (v: number | null) => v !== null ? fmt1(v) : <span className="muted">—</span>;
    const v = rs.filter(x => x.sendable);
    const allChecked = v.length > 0 && v.every(x => nsel.has(x.contactId));
    const t = r.visible.tiers;
    const total = dq ? null : filt === 'all' ? r.visible.prospects : filt === 'out' ? t['Below fit floor'] + t.Excluded : t[filt as Tier];
    return <>
      <div className="score-list">
        <div id="nBar" className="sl-toolbar" style={sx(`display:${n ? 'flex' : 'none'};background:var(--brand-lt);align-items:center`)}>
          <span id="nCount" style={sx('font-size:12.5px;font-weight:600;color:var(--brand-dk)')}>{n ? `${n} prospect${n === 1 ? '' : 's'} selected` : ''}</span>
          <button className="btn btn-ghost btn-sm" onClick={clearN}>Clear</button>
        </div>
        <div className="sl-toolbar">{searchBox('Search prospects or companies…')}<div className="sl-seg-filter">{[pill('all', 'All'), pill('A', 'A'), pill('B', 'B'), pill('C', 'C'), pill('Watch list', 'Watch list'), pill('out', 'Not scored')]}</div></div>
        <div id="rows">{table([[<input key="nAll" type="checkbox" id="nAll" ref={nAllRef} title="Select all shown" aria-label="Select all shown" checked={allChecked} onClick={e => e.stopPropagation()} onChange={e => toggleNAll(e.currentTarget.checked)} style={sx('cursor:pointer;vertical-align:middle')} />, '52px'], ['Prospect', '18%'], ['Company', '15%'], ['Prospect tier', '11%'], ['Score', '7%', 'num'], ['Fit', '6%', 'num'], ['Timing', '7%', 'num'], ['Why now', '32%']],
          rs.map(x => {
            const s = x.summary, on = nsel.has(x.contactId);
            return <tr key={x.contactId} className="click" onClick={() => void openProspect(x.contactId)} style={on ? sx('background:var(--brand-lt)') : undefined}>
              <td onClick={e => e.stopPropagation()}>{x.sendable ? <input type="checkbox" checked={on} aria-label={`Select ${s.name}`} onChange={e => toggleN(x.contactId, e.currentTarget.checked)} style={sx('cursor:pointer;vertical-align:middle')} /> : <span className="muted">—</span>}</td>
              <td><div className="person"><div className="co-av" style={{ background: avColor(s.name) }}>{initials(s.name)}</div><div>{cell(s.name, escSub(s.jobTitle || ''), 'dt-main')}</div></div></td>
              <td>{cell(s.company, escSub(s.vertical + ' · ' + s.country))}</td>
              <td>{tierPill(x.tier)}{x.accountTier ? <span className="sub" title="The account's own tier, from everyone's signals">{`Account: ${tierName(x.accountTier)}`}</span> : null}</td>
              <td className="num" style={sx('color:var(--i1);font-weight:600')}>{num(x.score)}</td>
              <td className="num">{num(x.fit)}</td>
              <td className="num">{num(x.timing)}</td>
              <td className="wrap">{s.excluded ? <span style={sx('color:var(--i3)')}>{s.excludedReason}</span> : s.belowFloor ? <span style={sx('color:var(--i3)')}>{`Company fit ${fmt1(x.fit)} is below the floor of ${DemandAI.CONFIG.fitFloor}`}</span> : s.whyNow ? <><div className="tags" style={sx('margin-bottom:5px')}>{s.types.map((t2, i) => tagChip(t2, i))}</div><span className="clamp2" title={s.whyNow} style={sx('font-size:12px;color:var(--i2)')}>{upperFirst(s.whyNow)}</span></> : <span style={sx('color:var(--i3)')}>No live signal for this person</span>}</td>
            </tr>;
          }), visibleProspects ? 'No prospects match.' : 'Loading…')}</div>
        {visibleProspects ? moreButton(prospects, rs.length, total) : null}</div>
      <div className="rk-foot"><span>Each prospect is scored on their own signals: Score = company Fit × their Timing ÷ 100, all on 0–100. Click a prospect for the reasoning.</span>
        {r.visible.unused ? <a href="#" onClick={e => { e.preventDefault(); openUnused(); }}>{`${r.visible.unused.toLocaleString('en-US')} row${r.visible.unused === 1 ? '' : 's'} of the signal file weren't used: see why →`}</a> : null}</div>
    </>;
  }

  function evidenceTab(r: RunDetail): ReactNode {
    const ss = visibleSignals ?? [];
    const stTag: Record<string, ReactNode> = { Qualified: <span className="tag tag-green">Qualified</span>, Rejected: <span className="tag tag-red">Rejected</span>, 'Not used': <span className="tag tag-grey">Not used</span>, 'Used for a knock-out': <span className="tag tag-amber">Knock-out</span> };
    return <>
      <div className="score-list">
        <div className="sl-toolbar">{searchBox('Search company, person or tag…')}<div className="sl-seg-filter">{[pill('all', 'All'), pill('Qualified', 'Qualified'), pill('Rejected', 'Rejected'), pill('Not used', 'Not used'), pill('Used for a knock-out', 'Knock-out')]}</div></div>
        <div id="rows">{table([['Signal', '8%'], ['Company', '13%'], ['Person', '13%'], ['Tag', '23%'], ['Event date', '10%'], ['Age', '6%', 'num'], ['Status', '10%'], ['Weight or reason', '17%']],
          ss.map(s => <tr key={s.seq}>
            <td>{cell(s.id, escSub('Row ' + s.row))}</td>
            <td>{cell(s.company)}</td>
            <td>{cell(s.personName || s.personRef, s.assigned && s.assigned !== 'Named in the file' ? { node: <span style={sx('color:var(--warn)')}>Auto-assigned</span>, title: 'Auto-assigned' } : null)}</td>
            <td>{tagChip(s.type, undefined, s.segment)}</td>
            <td style={sx('font-family:var(--fm);font-variant-numeric:tabular-nums')}>{s.date ? s.date : <span className="muted">—</span>}</td>
            <td className="num">{s.age !== undefined ? s.age + 'd' : <span className="muted">—</span>}</td>
            <td>{stTag[s.status]}</td>
            <td className="wrap">{s.status === 'Qualified' ? <><span style={sx('font-family:var(--fm);font-weight:600;color:var(--i1)')}>{fmt1(s.weight)}</span><span className="sub">{`${s.tier} × ${s.strength} × ${s.decay!.toFixed(2)}`}</span></> : <span className="clamp2" title={s.reason} style={sx('font-size:12px')}>{s.status === 'Rejected' ? <><b style={sx('color:var(--i1)')}>{`${s.code} ${DemandAI.CODES[s.code as DqCode]}`}</b>{' · ' + s.reason}</> : s.reason}</span>}</td>
          </tr>), visibleSignals ? 'No signals match.' : 'Loading…')}</div>
        {visibleSignals ? moreButton(evidence, ss.length, dq || filt !== 'all' ? null : r.visible.signals) : null}</div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>Every row of the signal file, in file order. People not in the lead file are rejected (D4): add them to the lead file to count their signals.</div>
    </>;
  }

  /* ─── TIERS EXPLAINED ─── */
  function tiersInfo(): ReactNode {
    const T = DemandAI.CONFIG.tierThresholds, pct = (v: number) => v + '%';
    if (!tiersOpen) return <button className="ti-closed" onClick={toggleTiers} aria-expanded="false"><span className="ti-i">i</span><b>How the tiers work</b><span>{`Score = Fit × Timing ÷ 100 · A from ${T.A} · B from ${T.B}`}</span><span className="ti-x">Show ▾</span></button>;
    return <div className="ti"><div className="ti-h"><span className="ti-i">i</span><b>How the tiers work</b><button className="btn btn-ghost btn-sm" onClick={toggleTiers} aria-expanded="true">Hide ▴</button></div>
      <div className="ti-eq"><div className="ti-q"><b>Fit</b><span>How well the company matches the ideal customer: vertical, size, site, relationship (0–100)</span></div><span className="ti-op">×</span>
        <div className="ti-q"><b>Timing</b><span>{"How strong and how recent this person's signals are: an inquiry this week counts far more than a webinar months ago (0–100)"}</span></div><span className="ti-op">÷ 100 =</span>
        <div className="ti-q ti-sc"><b>Score</b><span>0–100, sets the tier</span></div></div>
      <div className="ti-bar"><div className="ti-z ti-c" style={{ width: pct(T.B) }}><b>C</b><span>{`below ${T.B}`}</span></div><div className="ti-z ti-b" style={{ width: pct(T.A - T.B) }}><b>B</b><span>{`${T.B}–${T.A - 1}`}</span></div><div className="ti-z ti-a" style={{ width: pct(100 - T.A) }}><b>A</b><span>{`${T.A} and above · acted on first`}</span></div></div>
      <div className="ti-mv"><div><b>C → B</b><span>A strong, recent signal: an inquiry, a system reaching end of support or a capital project. Or a better fit, such as a contact in the primary persona.</span></div>
        <div><b>B → A</b><span>A second recent signal from the same person, or a stronger one. Signals fade with time, so an account also slips down if nothing new happens.</span></div>
        <div><b>Watch list</b><span>A good fit with no live signal yet: it moves into a tier as soon as one arrives.</span></div></div></div>;
  }

  function resultsView(r: RunDetail): ReactNode {
    const t = r.visible.tiers;
    const ft = (id: View, label: string, n: number) => <div className={`ftab ${view === id ? 'active' : ''}`} onClick={() => { setView(id); setFilt('all'); setQ(''); }}>{label} <span className="ftab-cnt">{n}</span></div>;
    const T = DemandAI.CONFIG.tierThresholds;
    const n = nsel.size;
    return <>
      <div className="topbar">
        <div className="topbar-l"><span className="tb-title">{r.name || r.listName}</span>
          <span className="tb-badge badge-neutral">{`${r.sourceFile} · as of ${r.asOf}`}</span></div>
        <div className="topbar-r">
          <button className="btn btn-sec btn-sm" onClick={() => renderStart('new')}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>Score a different list</button>
          <button className="btn btn-sec btn-sm" onClick={openSave}>{r.status === 'saved' ? 'Saved ✓' : 'Save'}</button>
          <button className="btn btn-primary btn-sm" onClick={() => void sendToNBA()}>{`Send ${n ? n + ' selected' : 'tier A and B'} to NBA →`}</button>
        </div>
      </div>
      <div className="ftabs">{ft('ranked', 'Ranked prospects', r.visible.prospects)}{ft('evidence', 'Signal evidence', r.visible.signals)}
        <div className={`ftab ${view === 'routing' ? 'active' : ''}`} onClick={() => { setView('routing'); setFilt('all'); setQ(''); }}>Routing</div></div>
      <div className="canvas">
        {tiersInfo()}
        <div className="stats">
          <div className="stat"><div className="stat-lbl">Tier A</div><div className="stat-val" style={sx('color:var(--pos)')}>{t.A}</div><div className="stat-sub">{`score ${T.A} and above`}</div></div>
          <div className="stat"><div className="stat-lbl">Tier B</div><div className="stat-val" style={sx('color:var(--warn)')}>{t.B}</div><div className="stat-sub">{`score ${T.B}–${T.A - 1}`}</div></div>
          <div className="stat"><div className="stat-lbl">Tier C</div><div className="stat-val sv1">{t.C}</div><div className="stat-sub">{`below ${T.B}`}</div></div>
          <div className="stat"><div className="stat-lbl">Watch list</div><div className="stat-val sv5">{t['Watch list']}</div><div className="stat-sub">good fit, no live signal</div></div>
          <div className="stat"><div className="stat-lbl">Not scored</div><div className="stat-val sv3">{t['Below fit floor'] + t.Excluded}</div><div className="stat-sub">{`${t['Below fit floor']} below fit floor · ${t.Excluded} excluded`}</div></div>
        </div>
        {r.scope === 'own' ? <div style={sx('font-size:11.5px;color:var(--i3);margin:-4px 0 12px')}>You see the prospects you own.</div> : null}
        {r.signalSettings.off.length || r.signalSettings.custom.length ? <div style={sx('font-size:11.5px;color:var(--i3);margin:-4px 0 12px')}>{[
          r.signalSettings.off.length ? `Scored with ${r.signalSettings.off.join(', ')} switched off in Setup: those rows are rejected (OFF).` : '',
          r.signalSettings.custom.length ? `Signal types added in Setup: ${r.signalSettings.custom.map(c => c.name).join(', ')}.` : ''].filter(Boolean).join(' ')}</div> : null}
        {view === 'ranked' ? rankedTab(r) : view === 'routing' ? <RoutingTab runId={r.id} /> : evidenceTab(r)}
      </div>
    </>;
  }

  function checksOverlay(ck: ChecksState): ReactNode {
    const r = ck.run, done = ck.phase === 'done' && !!r;
    const d = done ? SIG_STEPS.length : 0;
    const fraction = done ? 1 : ck.total ? ck.done / ck.total : 0;
    return <div id="checksOverlay" style={OVERLAY_STYLE}>
      <div role="dialog" aria-modal="true" aria-label={`Scoring ${ck.listName}`} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:540px;max-width:100%;max-height:90vh;display:flex;flex-direction:column')}>
        <div style={sx('padding:20px 22px 12px')}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1)')}>{`Scoring ${ck.listName}`}</div>
          <div style={sx('font-size:12px;color:var(--i3);margin-top:3px')}>{r ? `${r.stats.rowsRead} signal rows from ${ck.fileName} · as of ${ck.asOf} · fixed rules` : `${ck.fileName} · as of ${ck.asOf} · fixed rules`}</div>
          <div style={sx('height:4px;background:var(--s75);border-radius:2px;margin-top:12px;overflow:hidden')}><div id="ckBar" style={{ ...sx('height:100%;background:var(--brand);transition:width .3s var(--ease)'), width: (fraction * 100) + '%' }}></div></div>
        </div>
        <div style={sx('padding:0 22px;overflow-y:auto')}>
          {SIG_STEPS.map(([, name, what], i) => {
            const res = done ? r!.checks[i] : null;
            const ckClass = res ? 'ck ' + (res.sev === 'stop' ? 'ck-stop' : res.sev === 'warn' ? 'ck-warn' : res.sev === 'info' ? 'ck-info' : 'ck-ok') : ck.phase === 'running' && (ck.stage === 'check' || ck.stage === 'score') ? 'ck ck-run' : 'ck ck-wait';
            const tone = res ? (res.sev === 'stop' ? 'tag-red' : res.sev === 'warn' ? 'tag-amber' : res.sev === 'info' ? 'tag-grey' : 'tag-green') : '';
            return <div key={i} className={i < d ? 'ck-row' : 'ck-row pending'} id={'ck-' + i}>
              <div className={ckClass} id={'ckc-' + i}>{res ? (res.sev ? '!' : '✓') : null}</div>
              <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>{name}</div><div style={sx('font-size:11px;color:var(--i3)')}>{what}</div></div>
              <div id={'ckr-' + i} style={sx('text-align:right;flex-shrink:0')}>{res ? <><span className={`tag ${tone}`}>{res.label}</span>{res.rows ? <div style={sx('font-size:10.5px;color:var(--i3);margin-top:3px')}>{res.rows}</div> : null}</> : null}</div>
            </div>;
          })}
        </div>
        <div id="ckFoot" style={sx('padding:14px 22px 18px;display:flex;align-items:center;gap:8px;border-top:1px solid var(--border);margin-top:4px')}>{ck.phase === 'done' && r ? <>
          <span style={sx('flex:1;font-size:12px;color:var(--i2)')}><b>{r.stats.qualified}</b> signals qualified · <b>{r.stats.rejected}</b> rejected · <b>{r.stats.A}</b> prospects in tier A</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { setChecks(null); renderStart('new'); }}>Use a different file</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setChecks(null); setScreen('results'); }}>View the scores →</button>
        </> : ck.phase === 'failed' ? <>
          <span style={sx('flex:1;font-size:12px;color:var(--neg)')} role="alert">{ck.error}</span>
          <button className="btn btn-primary btn-sm" onClick={() => setChecks(null)}>Use a different file</button>
        </> : <span style={sx('flex:1;font-size:12px;color:var(--i3)')} role="status">{STAGE_TEXT[ck.stage] ?? 'Running checks…'}</span>}</div>
      </div>
    </div>;
  }

  function saveOverlay(r: RunDetail): ReactNode {
    const name = r.name || `${r.listName} · scored ${r.asOf}`;
    return <div id="saveOverlay" style={OVERLAY_STYLE} onClick={e => { if (e.target === e.currentTarget) hideSave(); }}>
      <div key={saveKey} role="dialog" aria-modal="true" aria-label={r.status === 'saved' ? 'Update the scored list' : 'Save the scored list'} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:440px;max-width:100%;padding:20px 22px')}>
        <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:4px')}>{r.status === 'saved' ? 'Update the scored list' : 'Save the scored list'}</div>
        <div style={sx('font-size:12px;color:var(--i3);margin-bottom:14px;line-height:1.5')}>{`${r.listName} with the signals from ${r.sourceFile}, as of ${r.asOf}. It appears under Scored lists.`}</div>
        <label htmlFor="runName" style={sx('font-size:11px;font-weight:600;color:var(--i2)')}>Name</label>
        <input id="runName" ref={runNameRef} defaultValue={name} style={sx('width:100%;margin:5px 0 18px;padding:9px 11px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px')} onKeyDown={e => { if (e.key === 'Enter') void saveRun(); }} />
        <div style={sx('display:flex;gap:8px;justify-content:flex-end')}>
          <button className="btn btn-ghost btn-sm" onClick={hideSave}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => void saveRun()}>Save</button>
        </div></div>
    </div>;
  }

  function unusedBody(r: RunDetail): ReactNode {
    const ss = unused.rows;
    return <>
      <div style={sx('font-size:12px;color:var(--i2);margin-bottom:10px;line-height:1.5')}>{"Every row of the signal file is checked. These didn't count towards any score, and why."}</div>
      {ss ? ss.map(s => <div key={s.seq} className="un"><div className="un-h">{tagChip(s.type)}<span>{'Row ' + s.row}</span></div>
        <div className="un-t">{s.company}{s.personName || s.personRef ? ` · ${s.personName || s.personRef}` : ''}</div>
        <div className="un-r"><b>{s.status === 'Rejected' ? `${s.code} ${DemandAI.CODES[s.code as DqCode]}` : s.status}</b>{' · ' + s.reason}</div></div>)
        : <div role="status" style={sx('font-size:12px;color:var(--i3)')}>Loading…</div>}
      {ss ? moreButton(unused, ss.length, r.visible.unused) : null}
    </>;
  }

  /** What one new strong signal would make this person's score (worked out, G-023), for tier B, C and the watch list. */
  function nextTierPanel(x: Wire<ProspectDetail>): ReactNode {
    const T = DemandAI.CONFIG.tierThresholds, c = x.contact, a = x.account, p = x.person, first = c.firstName || c.name;
    if (x.result.excluded || x.result.belowFloor || x.fit === null || !(x.tier === 'B' || x.tier === 'C' || x.tier === 'Watch list')) return null;
    const signals = p ? p.signals : [];
    const moves = nextTierMoves(x.fit, signals.map(s => s.weight ?? 0), signals.map(s => s.type));
    const again = signals.length ? nextTierMoves(x.fit, signals.map(s => s.weight ?? 0), [], [signals[0].type])[0] : null;
    const outcome = (m: { score: number; tier: string }) => ` (score ${fmt1(m.score)}: ${m.tier === 'A' ? 'tier A' : `tier ${m.tier}, not yet A`})`;
    // Keyed by person, so it opens folded for each prospect (React would otherwise keep the last one's open state).
    return <div key={x.contactId} className="panel" style={sx('margin-bottom:12px')}><div className="panel-body"><details className="lt-more" style={sx('border-top:none;padding-top:0')}>
      <summary>{`What would move ${a.name} to tier A`}</summary><div>
        {x.tier === 'Watch list' ? <p>{'It has no recent signal yet. The first strong one, such as a question or a request for a quote, puts it in a tier straight away' + (moves[0] ? outcome(moves[0]) : '') + '.'}</p> : <>
          <p>{`It is ${fmt1(T.A - (x.score ?? 0))} points short. One new signal today would make it:`}</p>
          <ul>
            {moves.map(m => <li key={m.type}>{(MOVE_TEXT[m.type]?.(first) ?? m.type) + outcome(m)}</li>)}
            {again && signals[0] ? <li>{`Another ${signals[0].type} from ${first} today` + outcome(again)}</li> : null}
            {c.persona !== 'Primary' ? <li>A contact in an instrumentation, automation or control systems role would also raise the company’s fit</li> : null}
          </ul>
          <p>Signals fade with time, so it can also drop a tier if nothing new comes in.</p></>}
      </div></details></div></div>;
  }

  function drawerBody(): ReactNode {
    if (drawerMode === 'unused') return run ? unusedBody(run) : null;
    const x = drawer;
    if (!x) return <div className="detail-empty" style={sx('padding:40px 0')}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--i4)" strokeWidth="1.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
      <div style={sx('font-size:11.5px;color:var(--i4);line-height:1.5;text-align:center')}>Click any row<br />to see the breakdown</div>
    </div>;
    const c = x.contact, r = x.result, a = x.account, p = x.person, notCounted = x.unused;
    const T = DemandAI.CONFIG.tierThresholds;
    const next: [string, number] | null = x.score === null ? null : x.score < T.B ? ['B', T.B] : x.score < T.A ? ['A', T.A] : null;
    const emailHtml = c.emailRaw ? esc(c.emailRaw) + (c.email && c.emailVerified ? '' : ' (not used)') : '—';
    const liText = c.linkedinRaw ? c.linkedinRaw.replace(/^https?:\/\/(www\.)?/, '') : '—';
    const loc = [c.city, c.country].filter(Boolean).join(', ') || '—';
    const reach = c.reachableBy === 'none' ? 'No channel' : c.reachableBy;
    return <>
      <div className="panel" style={sx('margin-bottom:12px')}>
        <div className="panel-hdr"><span className="panel-ttl">Prospect tier</span><span style={sx('display:flex;align-items:center;gap:6px')}>{r.tier ? <span style={sx('font-size:11px;color:var(--i3)')}>{`Account: ${tierName(r.tier as Tier)}`}</span> : null}{tierPill(x.tier)}</span></div>
        {r.excluded ? <div className="panel-body" style={sx('font-size:12px;color:var(--neg);background:var(--neg-lt)')}><b>Not scored.</b>{` ${r.excludedReason}.`}</div>
          : r.belowFloor ? <div className="panel-body" style={sx('font-size:12px;color:var(--warn);background:var(--warn-lt)')}><b>Not scored.</b>{` ${a.name}'s fit of ${fmt1(r.fit)} is below the floor of ${DemandAI.CONFIG.fitFloor}.`}</div>
          : <><div style={sx('display:flex')}>{miniStat('Score', x.score !== null ? fmt1(x.score) : '—', 'of 100')}{miniStat('Fit', fmt1(x.fit), 'company')}{miniStat('Timing', x.timing !== null ? fmt1(x.timing) : '—', (p ? p.signals.length : 0) + ' signal' + (p && p.signals.length === 1 ? '' : 's'))}</div>
            {next ? <div className="fs-next" style={sx('margin:0;padding:8px 12px;border-top:1px solid var(--border)')}>{`${fmt1(next[1] - x.score!)} points short of tier ${next[0]} (${next[1]}).`}</div>
              : x.score !== null ? <div className="fs-next" style={sx('margin:0;padding:8px 12px;border-top:1px solid var(--border);color:var(--pos)')}>In the top tier: acted on first.</div> : null}</>}
      </div>
      {nextTierPanel(x)}
      {p && p.whyNow ? <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">Why now</span></div><div className="panel-body">
        <div className="tags" style={sx('margin-bottom:8px')}>{[...new Set(p.signals.map(s => s.type))].map((t, i) => tagChip(t, i))}</div>
        <div style={sx('font-size:12.5px;color:var(--i1);line-height:1.55')}>{upperFirst(p.whyNow)}</div></div></div> : null}
      {p && p.signals.length ? <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">Signals</span><span style={sx('font-size:10.5px;color:var(--i3)')}>{p.signals.length}</span></div><div className="panel-body" style={sx('display:flex;flex-direction:column;gap:8px')}>
        {p.signals.map((s, i) => <div key={i} style={sx('padding:9px 11px;background:var(--s50);border-radius:var(--rsm)')}>
          <div style={sx('display:flex;align-items:center;gap:6px;margin-bottom:4px')}><div style={sx('flex:1')}>{tagChip(s.type, undefined, s.segment)}</div><span style={sx('font-family:var(--fm);font-size:11.5px;font-weight:600;color:var(--i1)')}>{fmt1(s.weight)}</span></div>
          <div style={sx('font-size:12px;color:var(--i1);line-height:1.45')}>{s.detail || s.type}</div>
          <div style={sx('font-size:10.5px;color:var(--i3);margin-top:2px')}>{`${s.source || 'No source'} · ${s.date} · ${ago(s.age!)}` + (s.assigned && s.assigned !== 'Named in the file' ? ' · ' : '')}{s.assigned && s.assigned !== 'Named in the file' ? <><span style={sx('color:var(--warn)')}>auto-assigned</span></> : null}</div>
        </div>)}
      </div></div> : null}
      <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">Contact</span></div><div className="panel-body" style={sx('padding-top:4px;padding-bottom:4px')}>
        {kv('Persona', c.persona, c.persona)}{kv('Reachable by', reach, reach)}
        {kv('Email', c.emailRaw ? c.email && c.emailVerified ? c.emailRaw : <>{c.emailRaw + ' '}<span style={sx('color:var(--warn)')}>(not used)</span></> : '—', emailHtml)}
        {kv('LinkedIn', liText, c.linkedinRaw ? esc(liText) : '—')}
        {kv('Location', loc, esc(loc))}{kv('Owner', c.owner || '—', esc(c.owner || '—'))}
      </div></div>
      {r.breakdown ? <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">{`Company fit · ${a.name}`}</span><span style={sx('font-family:var(--fm);font-size:12px;font-weight:600;color:var(--i1)')}>{`${fmt1(r.fit)} / 100`}</span></div><div className="panel-body">
        {r.breakdown.map((b, i) => <div key={i} style={sx('padding:6px 0')}>
          <div style={sx('display:flex;align-items:baseline;gap:8px;font-size:11.5px')}><span style={sx('flex:1;color:var(--i1)')}>{b.label + ' '}<span style={sx('color:var(--i3)')}>{'· ' + b.levelLabel}</span></span><span style={sx('font-family:var(--fm);color:var(--i1)')}>{fmt1(b.points)}<span style={sx('color:var(--i3)')}>/{b.weight}</span></span></div>
          <div className="dim-track" style={sx('margin-top:4px')}><div className="dim-fill" style={{ width: b.level + '%', background: 'var(--sec)' }}></div></div>
        </div>)}
      </div></div> : null}
      {notCounted.length ? <div className="panel"><div className="panel-hdr"><span className="panel-ttl">Not counted</span><span style={sx('font-size:10.5px;color:var(--i3)')}>{notCounted.length}</span></div><div className="panel-body" style={sx('padding:0')}>
        {notCounted.map((s, i) => <div key={i} style={sx('padding:9px 14px;border-bottom:1px solid var(--border)')}><div style={sx('margin-bottom:4px')}>{tagChip(s.type)}</div><div style={sx('font-size:11px;color:var(--i2)')}><b>{s.status === 'Rejected' ? s.code + ' ' + DemandAI.CODES[s.code as DqCode] : s.status}</b>{' · ' + s.reason}</div></div>)}
      </div></div> : null}
    </>;
  }

  const x = drawer;
  return <>
    <main className="main" id="mainArea">
      {screen === 'start' ? startView() : screen === 'results' && run ? resultsView(run) : null}
    </main>

    <div className={'detail-drawer' + (drawerOpen ? ' open' : '')} id="detailDrawer" style={drawerMode === 'unused' ? { width: '460px' } : drawer ? { width: '440px' } : undefined}>
      <div className="drawer-hdr">
        {drawerMode === 'unused' && run ? <div>
          <div className="drawer-title" id="detTitle">Signal rows not used</div>
          <div className="drawer-sub" id="detSub">{`${run.sourceFile} · ${run.visible.unused.toLocaleString('en-US')} of ${run.visible.signals.toLocaleString('en-US')} rows`}</div>
        </div> : <div>
          <div className="drawer-title" id="detTitle">{x ? x.contact.name : 'Score detail'}</div>
          <div className="drawer-sub" id="detSub">{x ? [x.contact.jobTitle, x.account.name].filter(Boolean).join(' · ') : '—'}</div>
        </div>}
        <div className="drawer-close" role="button" tabIndex={0} aria-label="Close" onClick={closeDrawer} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') closeDrawer(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </div>
      </div>
      <div className="drawer-body" id="detBody">{drawerBody()}</div>
    </div>

    {checks ? checksOverlay(checks) : null}
    {saveOpen && run ? saveOverlay(run) : null}
  </>;
}
