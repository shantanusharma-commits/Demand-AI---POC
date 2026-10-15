'use client';

/* Account Scoring (was legacy/11-scoring.html).
   Pick a saved prospect list (or upload a lead file), upload the signal file, watch the checks run, then work the
   ranked prospects: tiers, filters, the detail drawer, saving the run and the hand-off to Micro-segments & NBA.
   The original kept its state in module variables and re-rendered #mainArea / #rows with innerHTML; here the same
   variables live in one ref (`st`) and a re-render is requested after each change. `mainKey` is bumped where the
   original replaced #mainArea, so uncontrolled inputs (search, date, rename) reset exactly as they did. */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DemandAI } from '@/lib/demandai-engine';
import { DemandAISample } from '@/lib/demandai-sample-data';
import { showToast, avColor } from '@/lib/ui';
import { download } from '@/lib/download';
import { readFileToGrids, pickSheet, type SheetGrid } from '@/lib/file-reader';
import { sx } from '@/lib/sx';
import type {
  Contact, DqCode, Grid, PersonScore, SavedList, SavedScoring, ScoreResult, Signal, SignalResult, Tier,
} from '@/types/demandai';

/* ═══════════════ TYPES ═══════════════ */
interface Prospect {
  key: string;
  c: Contact;
  r: ScoreResult;
  p: PersonScore | null;
  tier: Tier;
  score?: number;
  fit?: number;
  timing?: number;
}

interface Run {
  listId: string;
  list: SavedList;
  fileName: string;
  sheet: string;
  grid: Grid;
  asOf: string;
  sandbox: boolean;
  sig: SignalResult;
  scored: ScoreResult[];
  prospects: Prospect[] | null;
  savedId: string | null;
  name: string | null;
}

/** A scoring run as stored under demandai_scorings_v1. */
interface ScoringRun extends SavedScoring {
  id: string;
  name: string;
  listId: string;
  listName: string;
  fileName: string;
  sheet: string;
  grid: Grid;
  asOf: string;
  sandbox: boolean;
  createdAt: number;
  stats: { scored: number; A: number };
}

/** One item handed to Micro-segments & NBA (localStorage demandai_nba_v1). */
interface NbaItem {
  id: string; name: string; title: string; co: string; priority: number;
  action: string; chosenAction: string; channel: 'Call' | 'Email' | 'DM'; channelWhy: string;
  routed: 'review'; confidence: string; team: null; isNew: true; fromScoring: true;
  signal: string; signalSrc: string; format: 'email';
  emailSubj: string; email: string; dmNote: string; dmMessage: string; callOpener: string;
}

interface StepResult { sev: '' | 'warn' | 'info' | 'stop'; label: string; rows?: string }

type SrcMode = 'saved' | 'upload';
type StartTab = 'new' | 'saved';
type View = 'ranked' | 'evidence';

interface PageState {
  screen: 'none' | 'start' | 'results';
  mainKey: number;
  srcMode: SrcMode;
  tab: StartTab;
  selListId: string | null;
  RUN: Run | null;
  view: View;
  filt: string;
  q: string;
  renamingId: string | null;
  NSEL: Set<string>;
  lists: SavedList[];
  runs: ScoringRun[];
  // Checks pop-up (#checksOverlay): open, how many ticks have run, the results it shows.
  checksOpen: boolean;
  ckDone: number;
  ckResults: StepResult[];
  // Save pop-up (#saveOverlay)
  saveOpen: boolean;
  saveKey: number;
  // Detail drawer: its content stays after it closes, as the original's innerHTML did.
  drawerOpen: boolean;
  drawerWide: boolean;
  drawerX: Prospect | null;
  drawerUnused: Signal[];
  focusRename: boolean;
}

/* ═══════════════ HELPERS (local copies, as the original page had them) ═══════════════ */
function initials(n: string): string { return String(n).split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function esc(s: unknown): string {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function todayIso(): string { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const fmt1 = (n: number | undefined | null): string => n === undefined || n === null ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 1 : 0, maximumFractionDigits: 1 });
const fmtDate = (t: number): string => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const upperFirst = (s: string): string => s.replace(/^./, m => m.toUpperCase());

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
function tagChip(t: string, key?: string | number): ReactNode {
  const c = DemandAI.CONFIG.signalTypes[t];
  return <span key={key} className={`tag ${(c && c.segment && SEG_TONE[c.segment]) || 'tag-grey'}`}>{t}</span>;
}
function tierPill(t: Tier): ReactNode {
  const m = ({ A: ['tag-green', 'Tier A'], B: ['tag-amber', 'Tier B'], C: ['tag-blue', 'Tier C'], 'Watch list': ['tag-grey', 'Watch list'], 'Below fit floor': ['tag-grey', 'Below floor'], Excluded: ['tag-red', 'Excluded'] } as Record<Tier, [string, string]>)[t];
  return <span className={`tag ${m[0]}`}>{m[1]}</span>;
}

const SIG_STEPS: [string, string, string][] = [
  ['columns', 'Columns match the template', 'company_name, contact, signal_type, event_date, detail'],
  ['company', 'Company is on the list', 'Every row names an account from the prospect list'],
  ['person', 'Person is in the lead file', 'Matched by email or LinkedIn URL; blank goes to the primary persona'],
  ['date', 'Event date present and valid', 'YYYY-MM-DD, not after the scoring date'],
  ['type', 'Signal type is a known tag', 'From the template list; newsletter sign-ups are not scored'],
  ['dupes', 'Duplicates', 'The same event recorded twice'],
  ['window', 'Within its time window', 'Older than the tag counts for: stale'],
  ['knockout', 'Installed base', 'Pilot product already installed excludes the account'],
  ['fit', 'Fit', `Rubric score; below ${DemandAI.CONFIG.fitFloor} the account is dropped`],
  ['score', 'Timing and score', 'Each prospect\'s signals weighted and stacked; score 0–100 and tier'],
];

const TIER_ORDER: Record<Tier, number> = { A: 0, B: 1, C: 2, 'Watch list': 3, 'Below fit floor': 4, Excluded: 5 };
function prospects(RUN: Run): Prospect[] {
  if (RUN.prospects) return RUN.prospects;
  const out: Prospect[] = [];
  for (const r of RUN.scored) {
    if (r.people) r.people.forEach(p => { const live = p.signals.length > 0; out.push({ key: r.account.id + '|' + p.contact.row, c: p.contact, r, p, tier: p.tier as Tier, score: live ? p.final : undefined, fit: r.fit, timing: live ? p.timing : undefined }); });
    else r.contacts.filter(c => !c.optOut).forEach(c => out.push({ key: r.account.id + '|' + c.row, c, r, p: null, tier: r.tier as Tier, fit: r.fit }));
  }
  out.sort((x, y) => TIER_ORDER[x.tier] - TIER_ORDER[y.tier] || (y.score || 0) - (x.score || 0) || (y.fit || 0) - (x.fit || 0));
  return RUN.prospects = out;
}
const sendable = (x: Prospect): boolean => x.score !== undefined;

function stepResult(RUN: Run, k: string): StepResult {
  const sig = RUN.sig, sc = RUN.scored, is = sig.issues;
  const rowsLabel = (rowsIn: (number | string)[]): string => { const rows = [...new Set(rowsIn)]; return rows.length ? (rows.length === 1 && rows[0] === '—' ? 'Whole file' : 'Row' + (rows.length > 1 ? 's ' : ' ') + rows.slice(0, 5).join(', ') + (rows.length > 5 ? '…' : '')) : ''; };
  const rej = (test: (s: Signal) => boolean) => sig.signals.filter(s => s.status === 'Rejected' && test(s));
  const out = (list: { row: number | string }[], sev: StepResult['sev'], label?: string | null): StepResult => list.length ? { sev, label: label || `${list.length} found`, rows: rowsLabel(list.map(x => x.row)) } : { sev: '', label: 'Passed' };
  switch (k) {
    case 'columns': return out(is.filter(i => /Required column|isn't in the template|header row|format hints/.test(i.issue)), 'warn');
    case 'company': return out(rej(s => s.code === 'D4' && !/^Person/.test(s.reason) || (s.code === 'D3' && /company/i.test(s.reason))), 'warn', null);
    case 'person': {
      const r = rej(s => s.code === 'D4' && /^Person/.test(s.reason)), auto = sig.signals.filter(s => s.assigned && s.assigned !== 'Named in the file');
      if (r.length) return { sev: 'warn', label: `${r.length} not found`, rows: rowsLabel(r.map(x => x.row)) + (auto.length ? ` · ${auto.length} auto-assigned` : '') };
      return auto.length ? { sev: 'info', label: `${auto.length} auto-assigned`, rows: rowsLabel(auto.map(x => x.row)) } : { sev: '', label: 'Passed' };
    }
    case 'date': return out(rej(s => s.code === 'D3' && /date/i.test(s.reason)), 'warn');
    case 'type': return out(rej(s => s.code === 'D1' || (s.code === 'D3' && /signal type/i.test(s.reason))), 'warn');
    case 'dupes': return out(rej(s => s.code === 'D5'), 'warn');
    case 'window': return out(rej(s => s.code === 'D2'), 'info', null);
    case 'knockout': { const k2 = sig.signals.filter(s => s.status === 'Used for a knock-out'); return k2.length ? { sev: 'info', label: `${k2.length} excluded`, rows: rowsLabel(k2.map(x => x.row)) } : { sev: '', label: 'None installed' }; }
    case 'fit': { const n = sc.filter(r => r.belowFloor).length; return n ? { sev: 'info', label: `${n} below the floor` } : { sev: '', label: 'All above the floor' }; }
    case 'score': { RUN.prospects = null; const ps = prospects(RUN), n = ps.filter(x => x.score !== undefined).length, a = ps.filter(x => x.tier === 'A').length; return { sev: '', label: `${n} prospects scored · ${a} in tier A` }; }
  }
  return { sev: '', label: '' };
}

/* Hand-off to Micro-segments & NBA: the action and channel follow the stage sheet's rules;
   the draft is a template until AI drafting is connected. */
const NBA_ABOUT: Record<string, string> = { 'Inquiry or RFQ': 'your recent inquiry', 'Installed system near end of support': 'your control system reaching end of support',
  'Service contract renewal': 'your service contract coming up for renewal', 'Capital project': 'the project you have under way', 'Leadership change': 'your new role',
  'Webinar attended': 'the webinar you attended', 'Webinar registered': 'the webinar you registered for', 'Content download': 'the material you downloaded', 'Email clicked': 'the material you opened' };
const NBA_ACTION: Record<string, string> = { Inquiry: 'Follow up on the inquiry', Modernisation: 'Propose a migration or upgrade discussion', 'Service renewal': 'Offer a renewal review',
  Project: 'Share a comparable case study and offer a technical session', Leadership: 'Introduction to a new leader in a buying role', Engagement: 'Follow up on the topic they engaged with' };
function toNBA(x: Prospect): NbaItem {
  const p = x.p!;
  const c = x.c, top = p.signals[0], seg = (DemandAI.CONFIG.signalTypes[top.type] || {}).segment || 'Engagement';
  const first = c.firstName || c.name.split(' ')[0];
  const emailOk = c.email && c.emailVerified, liOk = !!c.linkedin;
  const channel = seg === 'Inquiry' || (!emailOk && !liOk) ? 'Call' : emailOk ? 'Email' : 'DM';
  const why = p.whyNow!.replace(/^./, m => m.toUpperCase());
  const about = NBA_ABOUT[top.type] || 'your recent activity';
  const action = NBA_ACTION[seg];
  return { id: 'sc-' + String(x.key).replace(/[^a-z0-9]/gi, ''), name: c.name, title: c.jobTitle, co: x.r.account.name, priority: Math.round(x.score!),
    action: seg, chosenAction: action, channel,
    channelWhy: channel === 'Call' ? (seg === 'Inquiry' ? 'Inquiries go to a call task, per the routing rules.' : 'No verified email and no LinkedIn URL: call is the only channel.') : channel === 'Email' ? 'Verified, sendable email.' : 'No verified email on file, but a LinkedIn URL exists: DM.',
    routed: 'review', confidence: x.r.confidence || 'medium', team: null, isNew: true, fromScoring: true,
    signal: why, signalSrc: `${top.source || 'Signal file'} · scored ${fmt1(x.score)} (tier ${x.tier}) · draft from a template, AI drafting not connected`, format: 'email',
    emailSubj: `${x.r.account.name}: ${about.replace(/^your /, '')}`,
    email: `Hi ${first},\n\nFollowing up on ${about}.\n\nWould a short conversation in the next couple of weeks be useful? We'd come prepared to ${action.charAt(0).toLowerCase() + action.slice(1)}.\n\nBest,\nClient Team`,
    dmNote: `Hi ${first}, following up on ${about}. Happy to connect.`,
    dmMessage: `Thanks for connecting. Would a short conversation be useful? We'd come prepared to ${action.charAt(0).toLowerCase() + action.slice(1)}.`,
    callOpener: `"Hi ${first}, this is [name] from Client, following up on ${about}. Do you have two minutes?"` };
}

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

/* ═══════════════ SCREEN ═══════════════ */
export function ScoringScreen() {
  const router = useRouter();
  const [, setTick] = useState(0);
  const rerender = () => setTick(t => t + 1);
  const st = useRef<PageState>({
    screen: 'none', mainKey: 0, srcMode: 'saved', tab: 'new', selListId: null, RUN: null, view: 'ranked', filt: 'all', q: '', renamingId: null,
    NSEL: new Set<string>(), lists: [], runs: [], checksOpen: false, ckDone: 0, ckResults: [], saveOpen: false, saveKey: 0,
    drawerOpen: false, drawerWide: false, drawerX: null, drawerUnused: [], focusRename: false,
  }).current;
  const asOfRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const runNameRef = useRef<HTMLInputElement>(null);
  const nAllRef = useRef<HTMLInputElement>(null);
  const ckRowRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* ─── drawer ─── */
  const closeDrawer = () => { st.drawerOpen = false; rerender(); };

  /* ─── START: New scoring | Scored lists ─── */
  const renderStart = (t?: StartTab) => {
    st.RUN = null; st.drawerOpen = false;
    if (t) st.tab = t;
    const lists = DemandAI.loadLists(), runs = DemandAI.loadScorings() as ScoringRun[];
    if (st.selListId && !lists.find(l => l.id === st.selListId)) st.selListId = null;
    if (!st.selListId && lists.length) st.selListId = lists[0].id;
    st.lists = lists; st.runs = runs;
    st.screen = 'start'; st.mainKey++;
    rerender();
  };

  async function onLeadFile(file: File | undefined) {
    if (!file) return;
    try {
      const grids = await readFileToGrids(file);
      const has = (g: SheetGrid) => g.grid.slice(0, 10).some(r => (r || []).some(c => String(c).trim().toLowerCase().replace(/\*/g, '') === 'company_name'));
      const g = grids.find(x => /lead template/i.test(x.sheet) && has(x)) || grids.find(has) || grids[0];
      const r = DemandAI.processLeads(g.grid, { file: file.name, sheet: g.sheet });
      if (!r.stats.accountsPass) { showToast(`${file.name}: no accounts pass the checks. Open it in Prospecting to see why`); return; }
      const list: SavedList = { id: 'list-' + Date.now().toString(36), name: file.name.replace(/\.[^.]+$/, '') + ' · ' + todayIso(), createdAt: Date.now(), sourceFile: file.name, sheet: g.sheet,
        sandbox: false, stats: r.stats, accounts: r.accounts, contacts: r.contacts };
      if (!DemandAI.saveList(list)) { showToast("This browser blocks storage, so the list can't be saved"); return; }
      st.selListId = list.id; st.srcMode = 'saved';
      renderStart('new');
      showToast(`${r.stats.rowsRead} rows checked · ${r.stats.accountsPass} accounts and ${r.stats.inFinalList} contacts in the list · ${r.stats.issues} issue${r.stats.issues === 1 ? '' : 's'}. Saved as a list`);
    } catch (e) { showToast((e as Error).message || 'Could not read that file'); }
  }
  const asOfValue = (): string => { const v = asOfRef.current ? asOfRef.current.value : undefined; return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v! : todayIso(); };
  async function onFile(file: File | undefined) {
    if (!file) return;
    try { const g = pickSheet(await readFileToGrids(file), 'signal_type', /signal template/i); score(st.selListId!, file.name, g.sheet, g.grid, asOfValue(), false, null); }
    catch (e) { showToast((e as Error).message || 'Could not read that file'); }
  }
  const useSample = () => { score(st.selListId!, DemandAISample.SIGNAL_FILE, 'Signal template', DemandAISample.SIGNALS, asOfValue(), true, null); };

  /* ─── SCORE: run the rules, show the checks running ─── */
  const baseScore = (listId: string, fileName: string, sheet: string, grid: Grid, asOf: string, sandbox: boolean, saved: ScoringRun | null): boolean => {
    const L = DemandAI.getList(listId);
    if (!L) { showToast("That prospect list isn't saved any more"); renderStart('new'); return false; }
    if (sandbox !== !!L.sandbox) { showToast('Sample signals only go with a list built from sample data'); return false; }
    const list = JSON.parse(JSON.stringify({ accounts: L.accounts, contacts: L.contacts }));
    const sig = DemandAI.processSignals(grid, list, { file: fileName, sheet, asOf });
    const scored = DemandAI.scoreList(list, sig);
    st.RUN = { listId, list: L, fileName, sheet, grid, asOf, sandbox, sig, scored, prospects: null, savedId: saved ? saved.id : null, name: saved ? saved.name : null };
    st.view = 'ranked'; st.filt = 'all'; st.q = ''; st.NSEL.clear();
    return true;
  };
  const score = (...a: Parameters<typeof baseScore>) => { if (baseScore(...a)) runChecks(); };
  const runChecks = () => {
    const RUN = st.RUN!;
    st.ckResults = SIG_STEPS.map(s => stepResult(RUN, s[0]));
    st.ckDone = 0; st.checksOpen = true;
    rerender();
  };
  // The checks tick every 380 ms, as the original's setTimeout(tick, 380).
  useEffect(() => {
    if (!st.checksOpen || st.ckDone >= SIG_STEPS.length) return;
    const row = ckRowRefs.current[st.ckDone];
    if (row) row.scrollIntoView({ block: 'nearest' });
    const t = setTimeout(() => { st.ckDone++; rerender(); }, 380);
    return () => clearTimeout(t);
  }, [st.checksOpen, st.ckDone]);

  /* ─── RESULTS ─── */
  const renderResults = () => { st.screen = 'results'; st.mainKey++; rerender(); };
  const visibleProspects = (): Prospect[] => {
    let rs = prospects(st.RUN!);
    if (st.filt === 'out') rs = rs.filter(x => x.tier === 'Below fit floor' || x.tier === 'Excluded');
    else if (st.filt !== 'all') rs = rs.filter(x => x.tier === st.filt);
    if (st.q) rs = rs.filter(x => (x.c.name + ' ' + x.r.account.name + ' ' + x.c.jobTitle).toLowerCase().includes(st.q));
    return rs;
  };
  const toggleN = (key: string, on: boolean) => { if (on) st.NSEL.add(key); else st.NSEL.delete(key); rerender(); };
  const toggleNAll = (on: boolean) => { visibleProspects().filter(sendable).forEach(x => on ? st.NSEL.add(x.key) : st.NSEL.delete(x.key)); rerender(); };
  const clearN = () => { st.NSEL.clear(); rerender(); };

  const sendToNBA = () => {
    const all = prospects(st.RUN!);
    let pick = st.NSEL.size ? all.filter(x => st.NSEL.has(x.key)) : all.filter(x => x.tier === 'A' || x.tier === 'B');
    pick = pick.filter(x => x.p && x.p.signals.length);
    if (!pick.length) { showToast('Select prospects with a live signal first'); return; }
    const items = pick.map(toNBA);
    let prev: { id: string }[] = []; try { prev = JSON.parse(localStorage.getItem('demandai_nba_v1') || '[]'); } catch (e) { /* as the original */ }
    const ids = new Set(items.map(i => i.id));
    try { localStorage.setItem('demandai_nba_v1', JSON.stringify([...items, ...prev.filter(p => !ids.has(p.id))])); }
    catch (e) { showToast("This browser blocks storage, so the hand-off can't be made"); return; }
    showToast(`${items.length} prospect${items.length === 1 ? '' : 's'} sent to NBA`);
    setTimeout(() => { router.push('/nba?from=scoring&ids=' + items.map(i => i.id).join(',')); }, 500);
  };

  /* ─── SAVE, OPEN, RENAME SCORED LISTS ─── */
  const openSave = () => { st.saveOpen = true; st.saveKey++; rerender(); };
  const hideSave = () => { st.saveOpen = false; rerender(); };
  useEffect(() => {
    if (!st.saveOpen) return;
    const t = setTimeout(() => { const el = runNameRef.current!; el.focus(); el.select(); }, 30);
    return () => clearTimeout(t);
  }, [st.saveKey]);
  const saveRun = () => {
    const RUN = st.RUN!;
    const name = runNameRef.current!.value.trim() || RUN.list.name;
    const prev = RUN.savedId && DemandAI.getScoring(RUN.savedId) as ScoringRun | null;
    const run: ScoringRun = prev ? Object.assign(prev, { name }) : { id: 'run-' + Date.now().toString(36), name, listId: RUN.listId, listName: RUN.list.name,
      fileName: RUN.fileName, sheet: RUN.sheet, grid: RUN.grid, asOf: RUN.asOf, sandbox: RUN.sandbox, createdAt: Date.now(),
      stats: { scored: prospects(RUN).filter(x => x.score !== undefined).length, A: prospects(RUN).filter(x => x.tier === 'A').length } };
    if (!DemandAI.saveScoring(run)) { showToast("This browser blocks storage, so it can't be saved"); return; }
    RUN.savedId = run.id; RUN.name = name;
    st.saveOpen = false; showToast(`Saved as "${name}"`); renderResults();
  };
  const openRun = (id: string) => {
    const r = DemandAI.getScoring(id) as ScoringRun | null;
    if (!r) return;
    const ok = baseScore(r.listId, r.fileName, r.sheet, r.grid, r.asOf, r.sandbox, r);
    if (ok) renderResults();
  };
  const removeRun = (id: string) => { DemandAI.deleteScoring(id); showToast('Scored list deleted'); renderStart('saved'); };
  const startRename = (id: string) => { st.renamingId = id; st.focusRename = true; renderStart('saved'); };
  const finishRename = (id: string) => {
    const el = renameRef.current; const name = el ? el.value.trim() : '';
    const r = DemandAI.getScoring(id) as ScoringRun | null;
    if (r && name && name !== r.name) { r.name = name; DemandAI.saveScoring(r); showToast('Renamed'); }
    st.renamingId = null; renderStart('saved');
  };
  useLayoutEffect(() => {
    if (!st.focusRename) return;
    st.focusRename = false;
    const el = renameRef.current; if (el) { el.focus(); el.select(); }
  });

  /* ─── ACCOUNT DRAWER ─── */
  const openProspect = (key: string) => {
    const x = prospects(st.RUN!).find(p => p.key === key); if (!x) return;
    const a = x.r.account;
    st.drawerUnused = st.RUN!.sig.signals.filter(s => s.accountId === a.id && s.contactRow === x.c.row && s.status !== 'Qualified');
    st.drawerX = x; st.drawerWide = true; st.drawerOpen = true;
    rerender();
  };

  // Indeterminate state of the select-all box, as updateNBar set it.
  useLayoutEffect(() => {
    const all = nAllRef.current;
    if (!all || !st.RUN) return;
    const v = visibleProspects().filter(sendable);
    all.indeterminate = !all.checked && v.some(x => st.NSEL.has(x.key));
  });

  /* ─── BOOT ─── */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('list');
    if (id && DemandAI.getList(id)) st.selListId = id;
    renderStart('new');
  }, []);

  /* ═══════════════ RENDER ═══════════════ */
  const dropHandlers = (onDropFile: (f: File) => void) => ({
    onDragOver: (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--brand)'; },
    onDragLeave: (e: DragEvent<HTMLLabelElement>) => { e.currentTarget.style.borderColor = 'var(--bdk)'; },
    onDrop: (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--bdk)'; if (e.dataTransfer.files[0]) onDropFile(e.dataTransfer.files[0]); },
  });

  function startView(): ReactNode {
    const { lists, runs, tab, srcMode } = st;
    const L = lists.find(l => l.id === st.selListId);
    const ft = (id: StartTab, label: string, n?: number) => <div className={`ftab ${tab === id ? 'active' : ''}`} onClick={() => renderStart(id)}>{label}{n !== undefined ? <>{' '}<span className="ftab-cnt">{n}</span></> : null}</div>;
    const types = Object.keys(DemandAI.CONFIG.signalTypes).filter(k => !DemandAI.CONFIG.signalTypes[k].knockout && !DemandAI.CONFIG.signalTypes[k].reject);
    return <>
      <div className="topbar"><div className="topbar-l"><span className="tb-title">Account Scoring</span><span className="tb-badge badge-neutral">Fit × Timing · rules only</span></div></div>
      <div className="ftabs">{ft('new', 'New scoring')}{ft('saved', 'Scored lists', runs.length)}</div>
      <div className="canvas">{tab === 'new' ? (
        <div style={sx('max-width:640px;margin:24px auto 0')}>
          <div style={sx('font-family:var(--fd);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand);margin-bottom:8px')}>Step 2 · Scoring</div>
          <div style={sx('font-family:var(--fd);font-size:22px;font-weight:700;color:var(--i1);margin-bottom:6px')}>Score a prospect list</div>
          <div style={sx('font-size:13px;color:var(--i3);margin-bottom:20px;line-height:1.55')}>{"There's no data integration in the POC: the client sends the signals as a file. Pick the prospect list, upload the signals for those prospects, and every row is checked and scored by fixed rules."}</div>

          <div className="panel" style={sx('margin-bottom:12px')}>
            <div className="panel-hdr"><span className="panel-ttl">1 · Prospect list</span><Link href="/prospecting" style={sx('font-size:11px;color:var(--brand);font-weight:600;text-decoration:none')}>Build a list in Prospecting →</Link></div>
            <div className="panel-body">
              <div style={sx('display:inline-flex;background:var(--s75);border-radius:999px;padding:3px;margin-bottom:12px')}>
                {([['saved', 'Choose a saved list'], ['upload', 'Upload a prospect file']] as [SrcMode, string][]).map(([m, l]) => <button key={m} onClick={() => { st.srcMode = m; renderStart('new'); }} style={sx(`padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;${srcMode === m ? 'background:var(--surf);color:var(--i1);box-shadow:var(--sh)' : 'color:var(--i3)'}`)}>{l}</button>)}
              </div>
              {srcMode === 'upload' ? <>
                <label id="leadDrop" htmlFor="leadInput" style={sx('display:block;border:1.5px dashed var(--bdk);border-radius:var(--rmd);padding:22px 20px;cursor:pointer;background:var(--s50);text-align:center')} {...dropHandlers(f => { void onLeadFile(f); })}>
                  <input type="file" id="leadInput" accept=".csv,.xlsx,.xls" style={sx('display:none')} onChange={e => { void onLeadFile(e.currentTarget.files ? e.currentTarget.files[0] : undefined); }} />
                  <div style={sx('font-size:13px;font-weight:600;color:var(--i1)')}>Click to choose the prospect file, or drop it here</div>
                  <div style={sx('font-size:11px;color:var(--i3);margin-top:4px')}>.xlsx or .csv · the lead template, one row per contact · checked like in Prospecting, then saved as a list</div>
                </label>
                <div style={sx('margin-top:10px')}><button className="btn btn-sec btn-sm" onClick={() => { void download('lead_template.csv', DemandAI.toCSV([DemandAI.LEAD_COLUMNS])); }}>Download lead template (.csv)</button></div>
              </> : lists.length ? <>
                <select value={st.selListId || ''} onChange={e => { st.selListId = e.currentTarget.value; renderStart('new'); }} style={sx('width:100%;padding:9px 11px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px;background:var(--surf);color:var(--i1)')}>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <div style={sx('display:flex;gap:18px;margin-top:10px;font-size:12px;color:var(--i2)')}>
                  <span><b style={sx('color:var(--i1)')}>{L!.stats.accountsPass}</b> accounts</span><span><b style={sx('color:var(--i1)')}>{L!.stats.inFinalList}</b> contacts in the list</span><span style={sx('color:var(--i3)')}>{`from ${L!.sourceFile} · saved ${fmtDate(L!.createdAt)}`}</span>
                </div>
              </> : <div style={sx('font-size:12.5px;color:var(--i2)')}>No prospect lists yet. <a href="#" onClick={e => { e.preventDefault(); st.srcMode = 'upload'; renderStart('new'); }} style={sx('color:var(--brand);font-weight:600')}>Upload a prospect file</a> here, or build one in Prospecting.</div>}
            </div>
          </div>

          <div className="panel" style={sx(L ? '' : 'opacity:.5;pointer-events:none')}>
            <div className="panel-hdr"><span className="panel-ttl">2 · Signals for these prospects</span>
              <span style={sx('display:flex;align-items:center;gap:6px;font-size:11px;color:var(--i3)')}>Score as of <input type="date" id="asOf" ref={asOfRef} defaultValue={L && L.sandbox ? DemandAISample.SAMPLE_AS_OF : todayIso()} style={sx('padding:3px 6px;border:1px solid var(--bdk);border-radius:6px;font-size:11.5px')} /></span></div>
            <div className="panel-body">
              <label id="dropZone" htmlFor="fileInput" style={sx('display:block;border:1.5px dashed var(--bdk);border-radius:var(--rmd);padding:26px 20px;cursor:pointer;background:var(--s50);text-align:center')} {...dropHandlers(f => { void onFile(f); })}>
                <input type="file" id="fileInput" accept=".csv,.xlsx,.xls" style={sx('display:none')} onChange={e => { void onFile(e.currentTarget.files ? e.currentTarget.files[0] : undefined); }} />
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--i3)" strokeWidth="1.5" strokeLinecap="round" style={sx('margin-bottom:6px')}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                <div style={sx('font-size:13px;font-weight:600;color:var(--i1)')}>Click to choose the signal file, or drop it here</div>
                <div style={sx('font-size:11px;color:var(--i3);margin-top:4px')}>.xlsx or .csv · one row per signal, naming the person by email or LinkedIn URL</div>
              </label>
              <div style={sx('display:flex;gap:8px;margin-top:12px;flex-wrap:wrap')}>
                {L && L.sandbox ? <button className="btn btn-primary btn-sm" onClick={useSample}>Use sample signals</button> : null}
                <button className="btn btn-sec btn-sm" onClick={() => { void download('signal_template.csv', DemandAI.toCSV([DemandAI.SIGNAL_COLUMNS])); }}>Download signal template (.csv)</button>
              </div>
              <div style={sx('font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--i3);margin:16px 0 8px')}>Signal tags the file can use</div>
              <div className="tags">{types.map((t, i) => tagChip(t, i))}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="score-list">{table([['Name', '26%'], ['Prospect list', '18%'], ['Signal file', '14%'], ['Scored', '8%', 'num'], ['Tier A', '7%', 'num'], ['Saved', '11%'], ['', '16%']],
          runs.map(r => {
            const listNow = lists.find(l => l.id === r.listId) || null;
            return <tr key={r.id}>
              <td><div className="person"><div className="co-av" style={{ background: avColor(r.id) }}>{initials(r.name)}</div><div style={sx('flex:1;min-width:0')}>{st.renamingId === r.id
                ? <div style={sx('display:flex;gap:6px;align-items:center')}><input id="renameInput" ref={renameRef} defaultValue={r.name} style={sx('flex:1;min-width:0;padding:6px 9px;border:1px solid var(--brand-mid);border-radius:var(--rsm);font-size:12.5px')} onKeyDown={e => { if (e.key === 'Enter') finishRename(r.id); if (e.key === 'Escape') { st.renamingId = null; renderStart('saved'); } }} /><button className="btn btn-primary btn-sm" onClick={() => finishRename(r.id)}>Save</button></div>
                : <><div style={sx('display:flex;align-items:center;gap:6px;min-width:0')}><span className="dt-main" title={r.name}>{r.name}</span><button title="Rename" onClick={() => startRename(r.id)} style={sx('flex-shrink:0;color:var(--i3);display:flex;padding:2px')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg></button></div><span className="sub">{'As of ' + r.asOf}</span></>}</div></div></td>
              <td>{cell((listNow || { name: undefined }).name || r.listName, listNow ? null : { node: <span style={sx('color:var(--neg)')}>List deleted</span>, title: 'List deleted' })}</td>
              <td>{cell(r.fileName)}</td>
              <td className="num">{r.stats.scored}<span className="sub">prospects</span></td>
              <td className="num">{r.stats.A}</td>
              <td>{cell(fmtDate(r.createdAt), escSub(new Date(r.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })))}</td>
              <td style={sx('text-align:right')}><button className="btn btn-sec btn-sm" onClick={() => openRun(r.id)}>Open</button>{' '}<button className="btn btn-ghost btn-sm" onClick={() => removeRun(r.id)}>Delete</button></td>
            </tr>;
          }), <>No scored lists yet. <a href="#" onClick={e => { e.preventDefault(); renderStart('new'); }} style={sx('color:var(--brand);font-weight:600')}>Score a prospect list</a> and save it.</>)}
        </div>
      )}
      </div>
    </>;
  }

  function searchBox(ph: string): ReactNode {
    return <div className="sl-srch">{SEARCH_ICON}<input type="text" placeholder={ph} defaultValue={st.q} onChange={e => { st.q = e.currentTarget.value.toLowerCase(); rerender(); }} /></div>;
  }
  const pill = (cur: string, id: string, label: string) => <div key={id} className={`seg-pill ${cur === id ? 'active' : ''}`} onClick={() => { st.filt = id; renderResults(); }}>{label}</div>;

  function rankedRows(): ReactNode {
    const rs = visibleProspects();
    const num = (v: number | undefined) => v !== undefined ? fmt1(v) : <span className="muted">—</span>;
    const v = rs.filter(sendable);
    const allChecked = v.length > 0 && v.every(x => st.NSEL.has(x.key));
    return table([[<input key="nAll" type="checkbox" id="nAll" ref={nAllRef} title="Select all" checked={allChecked} onClick={e => e.stopPropagation()} onChange={e => toggleNAll(e.currentTarget.checked)} style={sx('cursor:pointer;vertical-align:middle')} />, '52px'], ['Prospect', '18%'], ['Company', '15%'], ['Tier', '11%'], ['Score', '7%', 'num'], ['Fit', '6%', 'num'], ['Timing', '7%', 'num'], ['Why now', '32%']],
      rs.map(x => {
        const tags = x.p ? [...new Set(x.p.signals.map(s => s.type))].slice(0, 2) : [];
        const on = st.NSEL.has(x.key);
        return <tr key={x.key} className="click" onClick={() => openProspect(x.key)} style={on ? sx('background:var(--brand-lt)') : undefined}>
          <td onClick={e => e.stopPropagation()}>{sendable(x) ? <input type="checkbox" checked={on} onChange={e => toggleN(x.key, e.currentTarget.checked)} style={sx('cursor:pointer;vertical-align:middle')} /> : <span className="muted">—</span>}</td>
          <td><div className="person"><div className="co-av" style={{ background: avColor(x.c.name) }}>{initials(x.c.name)}</div><div>{cell(x.c.name, escSub(x.c.jobTitle || ''), 'dt-main')}</div></div></td>
          <td>{cell(x.r.account.name, escSub(x.r.account.vertical + ' · ' + x.r.account.country))}</td>
          <td>{tierPill(x.tier)}</td>
          <td className="num" style={sx('color:var(--i1);font-weight:600')}>{num(x.score)}</td>
          <td className="num">{num(x.fit)}</td>
          <td className="num">{num(x.timing)}</td>
          <td className="wrap">{x.r.excluded ? <span style={sx('color:var(--i3)')}>{x.r.excludedReason}</span> : x.r.belowFloor ? <span style={sx('color:var(--i3)')}>{`Company fit ${fmt1(x.fit)} is below the floor of ${DemandAI.CONFIG.fitFloor}`}</span> : x.p && x.p.whyNow ? <><div className="tags" style={sx('margin-bottom:5px')}>{tags.map((t, i) => tagChip(t, i))}</div><span className="clamp2" title={x.p.whyNow} style={sx('font-size:12px;color:var(--i2)')}>{upperFirst(x.p.whyNow)}</span></> : <span style={sx('color:var(--i3)')}>No live signal for this person</span>}</td>
        </tr>;
      }), 'No prospects match.');
  }

  function rankedTab(): ReactNode {
    const n = st.NSEL.size;
    return <>
      <div className="score-list">
        <div id="nBar" className="sl-toolbar" style={sx(`display:${n ? 'flex' : 'none'};background:var(--brand-lt);align-items:center`)}>
          <span id="nCount" style={sx('font-size:12.5px;font-weight:600;color:var(--brand-dk)')}>{n ? `${n} prospect${n === 1 ? '' : 's'} selected` : ''}</span>
          <button className="btn btn-ghost btn-sm" onClick={clearN}>Clear</button>
        </div>
        <div className="sl-toolbar">{searchBox('Search prospects or companies…')}<div className="sl-seg-filter">{[pill(st.filt, 'all', 'All'), pill(st.filt, 'A', 'A'), pill(st.filt, 'B', 'B'), pill(st.filt, 'C', 'C'), pill(st.filt, 'Watch list', 'Watch list'), pill(st.filt, 'out', 'Not scored')]}</div></div>
        <div id="rows">{rankedRows()}</div></div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>Each prospect is scored on their own signals: Score = company Fit × their Timing ÷ 100, all on 0–100. Click a prospect for the reasoning.</div>
    </>;
  }

  function evidenceRows(): ReactNode {
    let ss = st.RUN!.sig.signals;
    if (st.filt !== 'all') ss = ss.filter(s => s.status === st.filt);
    if (st.q) ss = ss.filter(s => (s.company + ' ' + s.personName + ' ' + s.personRef + ' ' + s.type).toLowerCase().includes(st.q));
    const stTag: Record<string, ReactNode> = { Qualified: <span className="tag tag-green">Qualified</span>, Rejected: <span className="tag tag-red">Rejected</span>, 'Not used': <span className="tag tag-grey">Not used</span>, 'Used for a knock-out': <span className="tag tag-amber">Knock-out</span> };
    return table([['Signal', '8%'], ['Company', '13%'], ['Person', '13%'], ['Tag', '23%'], ['Event date', '10%'], ['Age', '6%', 'num'], ['Status', '10%'], ['Weight or reason', '17%']],
      ss.map((s, i) => <tr key={i}>
        <td>{cell(s.id, escSub('Row ' + s.row))}</td>
        <td>{cell(s.company)}</td>
        <td>{cell(s.personName || s.personRef, s.assigned && s.assigned !== 'Named in the file' ? { node: <span style={sx('color:var(--warn)')}>Auto-assigned</span>, title: 'Auto-assigned' } : null)}</td>
        <td>{tagChip(s.type)}</td>
        <td style={sx('font-family:var(--fm);font-variant-numeric:tabular-nums')}>{s.date ? s.date : <span className="muted">—</span>}</td>
        <td className="num">{s.age !== undefined ? s.age + 'd' : <span className="muted">—</span>}</td>
        <td>{stTag[s.status]}</td>
        <td className="wrap">{s.status === 'Qualified' ? <><span style={sx('font-family:var(--fm);font-weight:600;color:var(--i1)')}>{fmt1(s.weight)}</span><span className="sub">{`${s.tier} × ${s.strength} × ${s.decay!.toFixed(2)}`}</span></> : <span className="clamp2" title={s.reason} style={sx('font-size:12px')}>{s.status === 'Rejected' ? <><b style={sx('color:var(--i1)')}>{`${s.code} ${DemandAI.CODES[s.code as DqCode]}`}</b>{' · ' + s.reason}</> : s.reason}</span>}</td>
      </tr>), 'No signals match.');
  }

  function evidenceTab(): ReactNode {
    return <>
      <div className="score-list">
        <div className="sl-toolbar">{searchBox('Search company, person or tag…')}<div className="sl-seg-filter">{[pill(st.filt, 'all', 'All'), pill(st.filt, 'Qualified', 'Qualified'), pill(st.filt, 'Rejected', 'Rejected'), pill(st.filt, 'Not used', 'Not used'), pill(st.filt, 'Used for a knock-out', 'Knock-out')]}</div></div>
        <div id="rows">{evidenceRows()}</div></div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>Every row of the signal file, in file order. People not in the lead file are rejected (D4) and come back as suggested new contacts.</div>
    </>;
  }

  function resultsView(): ReactNode {
    const RUN = st.RUN!;
    const sc = prospects(RUN), sig = RUN.sig;
    const count = (t: Tier) => sc.filter(r => r.tier === t).length;
    const ft = (id: View, label: string, n: number) => <div className={`ftab ${st.view === id ? 'active' : ''}`} onClick={() => { st.view = id; st.filt = 'all'; st.q = ''; renderResults(); }}>{label} <span className="ftab-cnt">{n}</span></div>;
    const T = DemandAI.CONFIG.tierThresholds;
    const n = st.NSEL.size;
    return <>
      <div className="topbar">
        <div className="topbar-l"><span className="tb-title">{RUN.name || RUN.list.name}</span>
          <span className="tb-badge badge-neutral">{`${RUN.fileName} · as of ${RUN.asOf}`}</span></div>
        <div className="topbar-r">
          <button className="btn btn-sec btn-sm" onClick={() => renderStart('new')}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>Score a different list</button>
          <button className="btn btn-sec btn-sm" onClick={openSave}>{RUN.savedId ? 'Saved ✓' : 'Save'}</button>
          <button className="btn btn-primary btn-sm" onClick={sendToNBA}>{`Send ${n ? n + ' selected' : 'tier A and B'} to NBA →`}</button>
        </div>
      </div>
      <div className="ftabs">{ft('ranked', 'Ranked prospects', sc.length)}{ft('evidence', 'Signal evidence', sig.signals.length)}</div>
      <div className="canvas">
        <div className="stats">
          <div className="stat"><div className="stat-lbl">Tier A</div><div className="stat-val" style={sx('color:var(--pos)')}>{count('A')}</div><div className="stat-sub">{`score ${T.A} and above`}</div></div>
          <div className="stat"><div className="stat-lbl">Tier B</div><div className="stat-val" style={sx('color:var(--warn)')}>{count('B')}</div><div className="stat-sub">{`score ${T.B}–${T.A - 1}`}</div></div>
          <div className="stat"><div className="stat-lbl">Tier C</div><div className="stat-val sv1">{count('C')}</div><div className="stat-sub">{`below ${T.B}`}</div></div>
          <div className="stat"><div className="stat-lbl">Watch list</div><div className="stat-val sv5">{count('Watch list')}</div><div className="stat-sub">good fit, no live signal</div></div>
          <div className="stat"><div className="stat-lbl">Not scored</div><div className="stat-val sv3">{count('Below fit floor') + count('Excluded')}</div><div className="stat-sub">{`${count('Below fit floor')} below fit floor · ${count('Excluded')} excluded`}</div></div>
        </div>
        {st.view === 'ranked' ? rankedTab() : evidenceTab()}
      </div>
    </>;
  }

  function checksOverlay(): ReactNode {
    const RUN = st.RUN!;
    const sig = RUN.sig, d = st.ckDone;
    const done = d >= SIG_STEPS.length;
    const qn = sig.signals.filter(s => s.status === 'Qualified').length, rj = sig.signals.filter(s => s.status === 'Rejected').length;
    return <div id="checksOverlay" style={OVERLAY_STYLE}>
      <div style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:540px;max-width:100%;max-height:90vh;display:flex;flex-direction:column')}>
        <div style={sx('padding:20px 22px 12px')}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1)')}>{`Scoring ${RUN.list.name}`}</div>
          <div style={sx('font-size:12px;color:var(--i3);margin-top:3px')}>{`${sig.rowsRead} signal rows from ${RUN.fileName} · as of ${RUN.asOf} · fixed rules`}</div>
          <div style={sx('height:4px;background:var(--s75);border-radius:2px;margin-top:12px;overflow:hidden')}><div id="ckBar" style={{ ...sx('height:100%;background:var(--brand);transition:width .3s var(--ease)'), width: d === 0 ? 0 : (d / SIG_STEPS.length * 100) + '%' }}></div></div>
        </div>
        <div style={sx('padding:0 22px;overflow-y:auto')}>
          {SIG_STEPS.map(([, name, what], i) => {
            const res = i < d ? st.ckResults[i] : null;
            const ckClass = res ? 'ck ' + (res.sev === 'stop' ? 'ck-stop' : res.sev === 'warn' ? 'ck-warn' : res.sev === 'info' ? 'ck-info' : 'ck-ok') : i === d ? 'ck ck-run' : 'ck ck-wait';
            const tone = res ? (res.sev === 'stop' ? 'tag-red' : res.sev === 'warn' ? 'tag-amber' : res.sev === 'info' ? 'tag-grey' : 'tag-green') : '';
            return <div key={i} className={i > d ? 'ck-row pending' : 'ck-row'} id={'ck-' + i} ref={el => { ckRowRefs.current[i] = el; }}>
              <div className={ckClass} id={'ckc-' + i}>{res ? (res.sev ? '!' : '✓') : null}</div>
              <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>{name}</div><div style={sx('font-size:11px;color:var(--i3)')}>{what}</div></div>
              <div id={'ckr-' + i} style={sx('text-align:right;flex-shrink:0')}>{res ? <><span className={`tag ${tone}`}>{res.label}</span>{res.rows ? <div style={sx('font-size:10.5px;color:var(--i3);margin-top:3px')}>{res.rows}</div> : null}</> : null}</div>
            </div>;
          })}
        </div>
        <div id="ckFoot" style={sx('padding:14px 22px 18px;display:flex;align-items:center;gap:8px;border-top:1px solid var(--border);margin-top:4px')}>{done ? <>
          <span style={sx('flex:1;font-size:12px;color:var(--i2)')}><b>{qn}</b> signals qualified · <b>{rj}</b> rejected · <b>{prospects(RUN).filter(x => x.tier === 'A').length}</b> prospects in tier A</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { st.checksOpen = false; st.RUN = null; renderStart('new'); }}>Use a different file</button>
          <button className="btn btn-primary btn-sm" onClick={() => { st.checksOpen = false; renderResults(); }}>View the scores →</button>
        </> : <span style={sx('flex:1;font-size:12px;color:var(--i3)')}>Running checks…</span>}</div>
      </div>
    </div>;
  }

  function saveOverlay(): ReactNode {
    const RUN = st.RUN!;
    const name = RUN.name || `${RUN.list.name} · scored ${RUN.asOf}`;
    return <div id="saveOverlay" style={OVERLAY_STYLE} onClick={e => { if (e.target === e.currentTarget) hideSave(); }}>
      <div key={st.saveKey} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:440px;max-width:100%;padding:20px 22px')}>
        <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:4px')}>{RUN.savedId ? 'Update the scored list' : 'Save the scored list'}</div>
        <div style={sx('font-size:12px;color:var(--i3);margin-bottom:14px;line-height:1.5')}>{`${RUN.list.name} with the signals from ${RUN.fileName}, as of ${RUN.asOf}. It appears under Scored lists.`}</div>
        <label style={sx('font-size:11px;font-weight:600;color:var(--i2)')}>Name</label>
        <input id="runName" ref={runNameRef} defaultValue={name} style={sx('width:100%;margin:5px 0 18px;padding:9px 11px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px')} onKeyDown={e => { if (e.key === 'Enter') saveRun(); }} />
        <div style={sx('display:flex;gap:8px;justify-content:flex-end')}>
          <button className="btn btn-ghost btn-sm" onClick={hideSave}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={saveRun}>Save</button>
        </div></div>
    </div>;
  }

  function drawerBody(): ReactNode {
    const x = st.drawerX;
    if (!x) return <div className="detail-empty" style={sx('padding:40px 0')}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--i4)" strokeWidth="1.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
      <div style={sx('font-size:11.5px;color:var(--i4);line-height:1.5;text-align:center')}>Click any row<br />to see the breakdown</div>
    </div>;
    const c = x.c, r = x.r, a = r.account, unused = st.drawerUnused;
    const emailHtml = c.emailRaw ? esc(c.emailRaw) + (c.email && c.emailVerified ? '' : ' (not used)') : '—';
    const liText = c.linkedinRaw ? c.linkedinRaw.replace(/^https?:\/\/(www\.)?/, '') : '—';
    const loc = [c.city, c.country].filter(Boolean).join(', ') || '—';
    const reach = c.reachableBy === 'none' ? 'No channel' : c.reachableBy;
    return <>
      <div className="panel" style={sx('margin-bottom:12px')}>
        <div className="panel-hdr"><span className="panel-ttl">Priority</span>{tierPill(x.tier)}</div>
        {r.excluded ? <div className="panel-body" style={sx('font-size:12px;color:var(--neg);background:var(--neg-lt)')}><b>Not scored.</b>{` ${r.excludedReason}.`}</div>
          : r.belowFloor ? <div className="panel-body" style={sx('font-size:12px;color:var(--warn);background:var(--warn-lt)')}><b>Not scored.</b>{` ${a.name}'s fit of ${fmt1(r.fit)} is below the floor of ${DemandAI.CONFIG.fitFloor}.`}</div>
          : <div style={sx('display:flex')}>{miniStat('Score', x.score !== undefined ? fmt1(x.score) : '—', 'of 100')}{miniStat('Fit', fmt1(x.fit), 'company')}{miniStat('Timing', x.timing !== undefined ? fmt1(x.timing) : '—', x.p!.signals.length + ' signal' + (x.p!.signals.length === 1 ? '' : 's'))}</div>}
      </div>
      {x.p && x.p.whyNow ? <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">Why now</span></div><div className="panel-body">
        <div className="tags" style={sx('margin-bottom:8px')}>{[...new Set(x.p.signals.map(s => s.type))].map((t, i) => tagChip(t, i))}</div>
        <div style={sx('font-size:12.5px;color:var(--i1);line-height:1.55')}>{upperFirst(x.p.whyNow)}</div></div></div> : null}
      {x.p && x.p.signals.length ? <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">Signals</span><span style={sx('font-size:10.5px;color:var(--i3)')}>{x.p.signals.length}</span></div><div className="panel-body" style={sx('display:flex;flex-direction:column;gap:8px')}>
        {x.p.signals.map((s, i) => <div key={i} style={sx('padding:9px 11px;background:var(--s50);border-radius:var(--rsm)')}>
          <div style={sx('display:flex;align-items:center;gap:6px;margin-bottom:4px')}><div style={sx('flex:1')}>{tagChip(s.type)}</div><span style={sx('font-family:var(--fm);font-size:11.5px;font-weight:600;color:var(--i1)')}>{fmt1(s.weight)}</span></div>
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
      {unused.length ? <div className="panel"><div className="panel-hdr"><span className="panel-ttl">Not counted</span><span style={sx('font-size:10.5px;color:var(--i3)')}>{unused.length}</span></div><div className="panel-body" style={sx('padding:0')}>
        {unused.map((s, i) => <div key={i} style={sx('padding:9px 14px;border-bottom:1px solid var(--border)')}><div style={sx('margin-bottom:4px')}>{tagChip(s.type)}</div><div style={sx('font-size:11px;color:var(--i2)')}><b>{s.status === 'Rejected' ? s.code + ' ' + DemandAI.CODES[s.code as DqCode] : s.status}</b>{' · ' + s.reason}</div></div>)}
      </div></div> : null}
    </>;
  }

  const x = st.drawerX;
  return <>
    <main className="main" id="mainArea"><Fragment key={st.mainKey}>
      {st.screen === 'start' ? startView() : st.screen === 'results' && st.RUN ? resultsView() : null}
    </Fragment></main>

    <div className={'detail-drawer' + (st.drawerOpen ? ' open' : '')} id="detailDrawer" style={st.drawerWide ? { width: '440px' } : undefined}>
      <div className="drawer-hdr">
        <div>
          <div className="drawer-title" id="detTitle">{x ? x.c.name : 'Score detail'}</div>
          <div className="drawer-sub" id="detSub">{x ? [x.c.jobTitle, x.r.account.name].filter(Boolean).join(' · ') : '—'}</div>
        </div>
        <div className="drawer-close" onClick={closeDrawer}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </div>
      </div>
      <div className="drawer-body" id="detBody">{drawerBody()}</div>
    </div>

    {st.checksOpen && st.RUN ? checksOverlay() : null}
    {st.saveOpen && st.RUN ? saveOverlay() : null}
  </>;
}
