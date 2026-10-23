'use client';

/* Micro-segments & NBA (was legacy/12-nba.html), on the server (G-006). A build groups a stored hand-off's prospects
   into micro-segments, gives each account one recommended action and a checked first message, and routes it: on its
   own, to the rep's exception queue, or to the sales manager. This screen shows and uses the work; decisions happen
   in For Review. Builds are shared in the unit and kept (the decisions made on them are evidence); each person sees
   their own recommendations (G-014). Not ported: building from an uploaded CSV of prospects scored elsewhere and the
   built-in NBA scenario samples (the engine tests cover the scenarios), and Copilot (Phase 6). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CONFIG } from '@/lib/demandai-engine';
import * as R from '@/lib/engine/review';
import { sx } from '@/lib/sx';
import { MessageBar } from '@/components/ContentPicker';
import { api, errorText, waitForJob, type WireDeep } from '@/lib/client/api';
import { AiTag, aiShare } from '@/components/AiTag';
import { showToast, initials, avColor } from '@/lib/ui';
import { useCan } from '@/components/SessionContext';
import { RenameField } from '@/components/RenameField';
import { CopilotButton } from '@/components/Copilot';
import type { BuildSource, BuildStep, NbaRunSummary, RecRowView } from '@/lib/server/services/nba';
import type { getNbaRun } from '@/lib/server/services/nba';
import type { ItemDetail } from '@/lib/server/services/recommendations';

type Runs = { runs: WireDeep<NbaRunSummary>[]; sources: WireDeep<BuildSource>[]; meetings: { count: number; runId: string | null } };
type Run = WireDeep<Awaited<ReturnType<typeof getNbaRun>>>;
type Rec = WireDeep<RecRowView>;
type Item = WireDeep<ItemDetail>;
type AiDraftStats = { asked: number; written: number; fallbacks: Record<string, number> };
type Built = { runId: string; name: string; stats: Record<string, number> & { aiDrafts?: AiDraftStats }; checks: BuildStep[] };
/** `ai`: the first messages are being written with AI (the build runs as a job); `status`: the job's current stage. */
type Checks = { phase: 'running' | 'done' | 'failed'; label: string; built?: Built; error?: string; ai?: boolean; status?: string };
export const AI_DRAFT = 'Written with AI from the action, the brief and an approved claim (put in word for word), then passed the same brand, claim and grounding checks as the rules\' drafts.';
const JOB_STAGE: Record<string, string> = {
  queued: 'Waiting for its turn…', prepare: 'Grouping the prospects into micro-segments…',
  draft: 'Writing each first message with AI, then checking it against the brand pack and the approved claims…', save: 'Checking and routing each recommendation…',
};

export const SEG_TONE: Record<string, string> = { Inquiry: 'tag-blue', Modernisation: 'tag-violet', 'Service renewal': 'tag-teal', Project: 'tag-amber', Leadership: 'tag-pink', Engagement: 'tag-green' };
const SHOW_LABEL: Record<string, string> = { proceeded: 'Went ahead on their own', waiting: 'Waiting for a person', meeting: 'Meeting booked', released: 'Released: ready to use', rejected: 'Not accepted' };
const SEG_STEPS: [string, string, string][] = [
  ['read', 'Read the scored accounts', 'The highest-priority prospects, or the ones chosen in Scoring'],
  ['engage', 'Engage-once rule', 'Accounts already recommended in this pilot are set aside'],
  ['group', 'Group by the strongest signal', `At least ${CONFIG.minSegmentAccounts} different accounts each; an account is in one only`],
  ['fallback', 'Join on the next signal', 'Only a micro-segment formed on strongest signals; the rest go to a person'],
  ['except', 'Exception check', 'Accounts that fit no segment go to a person'],
  ['action', 'Next best action and runner-up', 'From the segment\'s approved library, with a reason'],
  ['channel', 'Channel within hard limits', 'Verified email, LinkedIn URL, consent and opt-out confirmed'],
  ['proof', 'Approved proof for each case', 'Unexpired collateral; none found: a task for the owner'],
  ['draft', 'First engagement drafted', 'Email, LinkedIn note or a task, with the brief'],
  ['brand', 'Brand and rule checks', 'Banned claims, competitors, pricing, sensitive terms, length'],
  ['claims', 'Every claim supported', 'Each claim matches its cited, unexpired source'],
  ['confidence', 'Confidence', 'Grounding, open flags and signal strength'],
  ['send', 'Exception check', 'Segment too small, low confidence, sensitive content, a claim that can\'t be verified'],
  ['spot', 'Weekly spot-check', 'Each week a random share of what proceeded goes to each rep to rate'],
];
const OVERLAY = sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px');
const fmtDate = (t: string | number | Date) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const timeOf = (t: string | number | Date) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const srcKey = (s: { kind: string; id: string }) => `${s.kind}:${s.id}`;

export function SegTag({ seg }: { seg: string | null }) {
  return seg ? <span className={`tag ${SEG_TONE[seg] || 'tag-grey'}`}>{seg}</span> : <span className="tag tag-grey">No micro-segment</span>;
}
function Cell({ v, sub, cls = 'val' }: { v: string; sub?: ReactNode; cls?: string }) {
  return <><span className={cls} title={v}>{v || <span className="muted">—</span>}</span>{sub ? <span className="sub">{sub}</span> : null}</>;
}
const needsPerson = (r: Pick<Rec, 'status' | 'spot'>) => r.status === 'Waiting' || r.status === 'Awaiting approval' || r.spot === 'pending';
function statusOf(r: Rec): [string, string] { return R.statusLabel({ status: r.status as R.RecStatus, spot: r.spot as R.RecState['spot'], released: r.released as R.RecState['released'], meeting: r.meeting }, r.paused); }

export function NbaScreen() {
  const canPause = useCan('segments.pause');
  const canBuild = useCan('nba.run');
  const canReassign = useCan('review.approve');
  const [screen, setScreen] = useState<'start' | 'results'>('start');
  const [tab, setTab] = useState<'new' | 'saved'>('new');
  const [runs, setRuns] = useState<Runs | null>(null);
  const [loadError, setLoadError] = useState('');
  const [src, setSrc] = useState('');
  const [checks, setChecks] = useState<Checks | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [segFilt, setSegFilt] = useState<string | null>(null);
  const [vertFilt, setVertFilt] = useState<string | null>(null);
  const [showFilt, setShowFilt] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState<{ id: string; item: Item | null } | null>(null);
  const booted = useRef(false);

  const reloadRuns = () => api<Runs>('/api/nba-runs').then(r => { setRuns(r); setSrc(cur => cur && r.sources.some(s => srcKey(s) === cur) ? cur : r.sources[0] ? srcKey(r.sources[0]) : ''); return r; });
  const loadRun = (id: string) => api<{ run: Run }>(`/api/nba-runs/${encodeURIComponent(id)}`).then(({ run }) => { setRun(run); return run; });
  const loadItem = (id: string) => api<{ item: Item }>(`/api/recommendations/${encodeURIComponent(id)}`).then(({ item }) => { setDrawer(d => d && d.id === id ? { id, item } : d); return item; });

  async function build(key: string) {
    const [kind, id] = key.split(':');
    const s = runs?.sources.find(x => srcKey(x) === key);
    const label = s?.label ?? 'Sent from Scoring';
    setChecks({ phase: 'running', label });
    try {
      const started = await api<Built | { jobId: string }>('/api/nba-runs', { body: kind === 'handoff' ? { handoffId: id } : { scoringRunId: id } });
      let built: Built;
      if ('jobId' in started) {
        // AI drafting is on: the build is a job; follow it, then read the build it made.
        setChecks({ phase: 'running', label, ai: true, status: JOB_STAGE.queued });
        const job = await waitForJob(started.jobId, j => setChecks(c => (c && c.phase === 'running' ? { ...c, status: JOB_STAGE[j.stage ?? ''] ?? c.status } : c)), 700);
        if (job.status !== 'succeeded' || !job.progress.result?.runId) {
          setChecks({ phase: 'failed', label, ai: true, error: job.error?.message ?? 'The build did not finish. Try again.' });
          return;
        }
        const { run: r } = await api<{ run: Run }>(`/api/nba-runs/${encodeURIComponent(job.progress.result.runId)}`);
        built = { runId: r.id, name: r.name, stats: r.stats as Built['stats'], checks: r.checks };
      } else built = started;
      setChecks({ phase: 'done', label: s?.label ?? built.name, built, ai: !!built.stats.aiDrafts });
      void reloadRuns();
    } catch (err) { setChecks({ phase: 'failed', label, error: errorText(err) }); }
  }
  async function openRun(id: string, opts: { show?: string | null; rec?: string | null } = {}) {
    try {
      await loadRun(id);
      setScreen('results'); setView(opts.show ? 'list' : 'grid'); setSegFilt(null); setVertFilt(null); setShowFilt(opts.show ?? null); setQ(''); setDrawer(null);
      if (opts.rec) void openRec(opts.rec);
    } catch (err) { showToast(errorText(err)); }
  }
  async function openRec(id: string) {
    setDrawer({ id, item: null });
    try {
      await api(`/api/recommendations/${encodeURIComponent(id)}/open`, { body: {} });
      await loadItem(id);
      if (run) void loadRun(run.id);
    } catch (err) { setDrawer(null); showToast(errorText(err)); }
  }
  /** After a change on the item: the drawer, the list and the counts show what the server now has. */
  async function refreshAfter(id: string, toast: string) {
    showToast(toast);
    await Promise.all([loadItem(id), run ? loadRun(run.id) : null]).catch(err => showToast(errorText(err)));
  }
  async function act(id: string, path: string, body: unknown, toast: (r: Record<string, unknown>) => string) {
    try { const r = await api<Record<string, unknown>>(`/api/recommendations/${encodeURIComponent(id)}/${path}`, { body }); await refreshAfter(id, toast(r)); }
    catch (err) { showToast(errorText(err)); }
  }
  async function pause(seg: string, on: boolean) {
    if (!run) return;
    try {
      await api(`/api/nba-runs/${run.id}/segments/${on ? 'pause' : 'resume'}`, { body: { segment: seg } });
      showToast(on ? `${seg || 'Items with no micro-segment'} paused` : 'Resumed');
      await loadRun(run.id);
      if (drawer) void loadItem(drawer.id);
    } catch (err) { showToast(errorText(err)); }
  }
  async function rename(id: string, name: string) {
    setRenaming(null);
    const r = runs?.runs.find(x => x.id === id);
    if (!name || !r || name === r.name) return;
    try { await api(`/api/nba-runs/${id}`, { method: 'PATCH', body: { name } }); showToast('Renamed'); void reloadRuns(); }
    catch (err) { showToast(errorText(err)); }
  }
  function copy(text: string) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showToast('Copied'), () => showToast("Couldn't copy here"));
    else showToast("Couldn't copy here");
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const p = new URLSearchParams(window.location.search);
    reloadRuns().then(r => {
      const handoff = p.get('handoff');
      if (p.get('run')) { void openRun(p.get('run')!, { show: p.get('show'), rec: p.get('rec') }); return; }
      if (handoff && r.sources.some(s => s.kind === 'handoff' && s.id === handoff)) {
        try { history.replaceState(null, '', window.location.pathname); } catch { /* keep the address */ }
        setSrc('handoff:' + handoff);
        void build('handoff:' + handoff);
      }
    }, err => setLoadError(errorText(err)));
  });   // runs once (booted)

  /* ═══════════════ START ═══════════════ */
  function startScreen(): ReactNode {
    const ft = (id: 'new' | 'saved', label: string, n?: number) => <div className={'ftab' + (tab === id ? ' active' : '')} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}>{label}{n !== undefined ? <> <span className="ftab-cnt">{n}</span></> : null}</div>;
    const s = runs?.sources.find(x => srcKey(x) === src);
    return <>
      <div className="topbar"><div className="topbar-l"><span className="tb-title">Micro-segments &amp; NBA</span></div></div>
      <div className="ftabs">{ft('new', 'New')}{ft('saved', 'Saved', runs?.runs.length ?? 0)}</div>
      <div className="canvas">
        {meetingBanner()}
        {loadError ? <div role="alert" style={sx('color:var(--neg);font-size:12.5px')}>{loadError}</div> : null}
        {tab === 'new' ? <div style={sx('max-width:560px;margin:56px auto 0')}>
          <div style={sx('font-family:var(--fd);font-size:22px;font-weight:700;color:var(--i1);margin-bottom:6px')}>Group prospects and plan the next step</div>
          <div style={sx('font-size:13px;color:var(--i3);margin-bottom:22px;line-height:1.55')}>Prospects with the same reason to buy now are grouped, and each one gets a recommended action and a first message. What needs a person goes to For Review.</div>
          {!runs ? <div style={sx('font-size:12.5px;color:var(--i3)')}>Loading…</div> : runs.sources.length ? <>
            <label htmlFor="nbaSrc" style={sx('font-size:11px;font-weight:600;color:var(--i2)')}>Prospects</label>
            <select id="nbaSrc" value={src} onChange={e => setSrc(e.target.value)} style={sx('width:100%;margin:6px 0 10px;padding:10px 12px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px')}>
              {runs.sources.map(x => <option key={srcKey(x)} value={srcKey(x)}>{x.kind === 'handoff' ? `${x.label} (${pl(x.count, 'prospect')})` : x.label}</option>)}
            </select>
            <div style={sx('display:flex;align-items:center;gap:12px;margin-top:16px')}>
              <span style={sx('flex:1;font-size:12.5px;color:var(--i2)')}>{s ? (s.kind === 'handoff' ? <><b style={sx('color:var(--i1)')}>{s.count}</b> prospects handed off on {fmtDate(s.createdAt)}</> : 'Its tier A and B prospects with a live signal, who can be contacted') : null}</span>
              <button className="btn btn-primary" disabled={!canBuild || !src || checks?.phase === 'running'} onClick={() => void build(src)}>Build micro-segments →</button>
            </div>
          </> : <div style={sx('font-size:12.5px;color:var(--i2);line-height:1.55')}>Nothing to group yet. Score a list in <Link href="/scoring" style={sx('color:var(--brand);font-weight:600;text-decoration:none')}>Account Scoring</Link> and hand off its prospects, or save the scored list.</div>}
        </div> : savedTable()}
      </div>
    </>;
  }
  function savedTable(): ReactNode {
    const rs = runs?.runs ?? [];
    return <div className="score-list"><div className="dt-wrap"><table className="dt">
      <colgroup>{['30%', '18%', '11%', '9%', '9%', '13%', '10%'].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead><tr><th>Name</th><th>Prospects from</th><th className="num">Micro-segments</th><th className="num">Prospects</th><th className="num">To review</th><th>Built</th><th></th></tr></thead>
      <tbody>{rs.length ? rs.map(r => <tr key={r.id}>
        <td><div className="person"><div className="co-av" style={{ background: avColor(r.id) }}>{initials(r.name)}</div><div style={sx('flex:1;min-width:0')}>{renaming === r.id
          ? <RenameField initial={r.name} onDone={n => void rename(r.id, n)} onCancel={() => setRenaming(null)} />
          : <div style={sx('display:flex;align-items:center;gap:6px;min-width:0')}><span className="dt-main" title={r.name}>{r.name}</span>
            <button title="Rename" aria-label={`Rename ${r.name}`} onClick={() => setRenaming(r.id)} style={sx('flex-shrink:0;color:var(--i3);display:flex;padding:2px')}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg></button></div>}</div></div></td>
        <td><Cell v={r.source} sub={`as of ${r.asOf} · by ${r.by}`} /></td>
        <td className="num">{r.segments}</td><td className="num">{r.prospects}</td><td className="num">{r.waiting}</td>
        <td><Cell v={fmtDate(r.createdAt)} sub={timeOf(r.createdAt)} /></td>
        <td style={sx('text-align:right')}><button className="btn btn-sec btn-sm" onClick={() => void openRun(r.id)}>Open</button></td>
      </tr>) : <tr><td colSpan={7} className="dt-empty">Nothing built yet. <a href="#" onClick={e => { e.preventDefault(); setTab('new'); }} style={sx('color:var(--brand);font-weight:600')}>Build micro-segments</a>; they are kept automatically.</td></tr>}</tbody>
    </table></div>
      <div style={sx('font-size:11px;color:var(--i3);margin:10px 14px')}>Builds are kept: the decisions made on them are the evidence for the pilot. Prospects and To review count your own items.</div>
    </div>;
  }
  function meetingBanner(): ReactNode {
    const m = runs?.meetings;
    if (!m || !m.count || !m.runId) return null;
    return <a href={`/nba?run=${encodeURIComponent(m.runId)}&show=meeting`} onClick={e => { e.preventDefault(); void openRun(m.runId!, { show: 'meeting' }); }}
      style={sx('display:flex;align-items:center;gap:10px;padding:11px 14px;margin-bottom:14px;background:var(--brand-lt);border:1px solid var(--brand-mid);border-radius:var(--rmd);text-decoration:none')}>
      <span className="tag tag-violet">New</span><span style={sx('flex:1;font-size:12.5px;color:var(--i1)')}><b>{pl(m.count, 'meeting')} booked</b>: the call script{m.count === 1 ? ' is' : 's are'} ready. Next best action: prepare and run the meeting.</span>
      <span style={sx('font-size:12px;font-weight:700;color:var(--brand);white-space:nowrap')}>Open {m.count === 1 ? 'it' : 'them'} →</span></a>;
  }

  /* ═══════════════ CHECKS POP-UP ═══════════════ */
  function checksOverlay(ck: Checks): ReactNode {
    const steps = ck.built?.checks ?? [];
    const done = ck.phase === 'done';
    const st = ck.built?.stats ?? {};
    return <div style={OVERLAY}>
      <div role="dialog" aria-modal="true" aria-label="Building micro-segments" style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:560px;max-width:100%;max-height:90vh;display:flex;flex-direction:column')}>
        <div style={sx('padding:20px 22px 12px')}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1)')}>Building micro-segments</div>
          <div style={sx('font-size:12px;color:var(--i3);margin-top:3px')}>{ck.built ? ck.built.name : ck.label}{ck.ai ? ' · fixed rules, first messages written with AI' : ' · fixed rules'}</div>
          <div style={sx('height:4px;background:var(--s75);border-radius:2px;margin-top:12px;overflow:hidden')}><div style={{ ...sx('height:100%;background:var(--brand);transition:width .3s var(--ease)'), width: done ? '100%' : '15%' }}></div></div>
        </div>
        <div style={sx('padding:0 22px;overflow-y:auto')}>{SEG_STEPS.map(([k, name, what]) => {
          const res = steps.find(s => s.key === k);
          const tone = res ? (res.sev === 'warn' ? 'tag-amber' : res.sev === 'info' ? 'tag-grey' : 'tag-green') : '';
          return <div key={k} className={res ? 'ck-row' : 'ck-row pending'}>
            <div className={'ck ' + (res ? (res.sev === 'warn' ? 'ck-warn' : res.sev === 'info' ? 'ck-info' : 'ck-ok') : ck.phase === 'running' ? 'ck-run' : 'ck-wait')}>{res ? (res.sev ? '!' : '✓') : null}</div>
            <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>{name}</div><div style={sx('font-size:11px;color:var(--i3)')}>{what}</div></div>
            <div style={sx('text-align:right;flex-shrink:0;max-width:46%')}>{res ? <span className={`tag ${tone}`}>{res.label}</span> : null}</div>
          </div>;
        })}</div>
        <div style={sx('padding:14px 22px 18px;display:flex;align-items:center;gap:8px;border-top:1px solid var(--border);margin-top:4px')}>{done && ck.built ? <>
          <span style={sx('flex:1;font-size:12px;color:var(--i2)')}><b>{st.segments}</b> micro-segment{st.segments === 1 ? '' : 's'} · <b>{st.auto}</b> went ahead · <b>{(st.prospects ?? 0) - (st.auto ?? 0)}</b> to For Review
            {st.aiDrafts ? <span style={sx('display:block;margin-top:4px;color:var(--i3)')}>{aiShare('First messages', st.aiDrafts)}</span> : null}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { setChecks(null); setTab('new'); }}>Back</button>
          <button className="btn btn-primary btn-sm" onClick={() => { const id = ck.built!.runId; setChecks(null); void openRun(id); }}>View the micro-segments →</button>
        </> : ck.phase === 'failed' ? <>
          <span role="alert" style={sx('flex:1;font-size:12px;color:var(--neg)')}>{ck.error}</span>
          <button className="btn btn-primary btn-sm" onClick={() => setChecks(null)}>Back</button>
        </> : <span role="status" style={sx('flex:1;font-size:12px;color:var(--i3)')}>{ck.status ?? 'Grouping, drafting and checking each recommendation…'}</span>}</div>
      </div>
    </div>;
  }

  /* ═══════════════ RESULTS ═══════════════ */
  function visibleRecs(r: Run): Rec[] {
    let rs = r.recs;
    if (segFilt) rs = rs.filter(x => segFilt === '__x' ? !(x.segment || x.assignedSegment) : (x.segment || x.assignedSegment) === segFilt);
    if (vertFilt) rs = rs.filter(x => x.account.vertical === vertFilt);
    if (showFilt) rs = rs.filter(x => showFilt === 'proceeded' ? x.released === 'auto' : showFilt === 'waiting' ? needsPerson(x) : showFilt === 'meeting' ? x.outcome === 'Meeting booked'
      : showFilt === 'released' ? x.status === 'Released' : showFilt === 'rejected' ? ['Closed', 'Set aside', 'Watch list'].includes(x.status) : true);
    if (q) rs = rs.filter(x => `${x.contact.name} ${x.account.name} ${x.chosenAction}`.toLowerCase().includes(q));
    // New call scripts first: the meeting is the next best action now.
    const fresh = (x: Rec) => (x.meeting && !x.meeting.seen ? 0 : 1);
    return rs.slice().sort((a, b) => fresh(a) - fresh(b));
  }
  function resultsScreen(r: Run): ReactNode {
    const recs = r.recs, waiting = recs.filter(needsPerson).length, auto = recs.filter(x => x.passed).length;
    const exc = recs.filter(x => x.status === 'Waiting' || x.status === 'Awaiting approval').length;
    const pausedNames = Object.keys(r.paused);
    const ft = (id: 'grid' | 'list', label: string, n: number) => <div className={'ftab' + (view === id ? ' active' : '')} role="tab" aria-selected={view === id}
      onClick={() => { setView(id); if (id === 'grid') { setSegFilt(null); setVertFilt(null); } setQ(''); }}>{label} <span className="ftab-cnt">{n}</span></div>;
    return <>
      <div className="topbar">
        <div className="topbar-l"><span className="tb-title">{r.name}</span><span className="tb-badge badge-neutral">{`Config v${r.configVersionNo ?? '—'} · Brand v${r.brandVersionNo} · as of ${r.asOf}`}</span></div>
        <div className="topbar-r"><CopilotButton screen="nba" ctxRef={drawer ? { itemId: drawer.id } : { nbaRunId: r.id }} title={drawer?.item ? `${drawer.item.contact.name} · ${drawer.item.account.name}` : r.name}
          onChanged={() => { void loadRun(r.id); if (drawer) void loadItem(drawer.id); }} /><button className="btn btn-sec btn-sm" onClick={() => { setScreen('start'); setRun(null); setDrawer(null); setTab('new'); void reloadRuns(); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>Group another list</button></div>
      </div>
      <div className="ftabs">{ft('grid', 'Micro-segments', r.segments.length)}{ft('list', 'Recommendations', recs.length)}</div>
      <div className="canvas">
        <div style={sx(`display:flex;align-items:center;gap:12px;padding:12px 16px;background:${waiting ? 'var(--brand-lt)' : 'var(--pos-lt)'};border-radius:var(--rmd);margin-bottom:16px`)}>
          <span style={sx(`width:26px;height:26px;border-radius:50%;background:${waiting ? 'var(--brand)' : 'var(--pos)'};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0`)}>{waiting ? '→' : '✓'}</span>
          <div style={sx('flex:1;font-size:13px;color:var(--i1);line-height:1.5')}>{waiting
            ? <><b>{auto}</b> passed every check and proceeded: ready to use. <b>{exc}</b> {exc === 1 ? 'is' : 'are'} waiting for a decision in For Review.</>
            : <><b>{auto}</b> proceeded on their own and nothing is waiting for a decision. Use them below and mark what happened.</>}
            {pausedNames.length ? <> <b>Paused:</b> {pausedNames.map(k => k || 'no micro-segment').join(', ')}; its items can&apos;t be used or decided until it&apos;s resumed.</> : null}</div>
          <Link className="btn btn-primary btn-sm" href="/review" style={sx('text-decoration:none')}>Open For Review →</Link>
        </div>
        {view === 'grid' ? gridTab(r) : listTab(r)}
      </div>
    </>;
  }
  /* 5.2 The micro-segments, with what proceeded and what waits; 5.3 drill down from a row. */
  function gridTab(r: Run): ReactNode {
    const min = CONFIG.minSegmentAccounts;
    const accOf = (rs: Rec[]) => [...new Map(rs.map(x => [x.account.name, x])).values()];
    const go = (seg: string | null) => { setSegFilt(seg ?? '__x'); setVertFilt(null); setView('list'); setQ(''); };
    const th = 'padding:10px 12px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--i3);border-bottom:1px solid var(--border);background:var(--s50)';
    const td = 'padding:12px;border-bottom:1px solid var(--border);vertical-align:middle';
    const num = (n: number, sub: string, tone: string) => <td style={sx(`${td};text-align:center`)}><div style={sx(`font-family:var(--fd);font-size:18px;font-weight:700;color:${n ? tone : 'var(--i4)'};line-height:1.1`)}>{n}</div><div style={sx('font-size:10.5px;color:var(--i3);margin-top:2px')}>{sub}</div></td>;
    const unseg = accOf(r.recs.filter(x => !(x.segment || x.assignedSegment)));
    return <>
      <div style={sx('background:var(--surf);border:1px solid var(--border);border-radius:var(--rmd);overflow-x:auto')}>
        <table style={sx('width:100%;border-collapse:collapse;font-family:var(--fb);table-layout:fixed;min-width:640px')}>
          <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 120 }} /><col style={{ width: 90 }} /></colgroup>
          <thead><tr><th style={sx(`${th};text-align:left`)}>Micro-segment · recommended action</th><th style={sx(`${th};text-align:center`)}>Accounts</th><th style={sx(`${th};text-align:center`)}>Proceeded</th><th style={sx(`${th};text-align:center`)}>Waiting</th><th style={sx(th)}></th></tr></thead>
          <tbody>{r.segments.length ? r.segments.map(g => {
            const rs = r.recs.filter(x => (x.segment || x.assignedSegment) === g.name), byAcc = accOf(rs), fb = byAcc.filter(x => x.fallback).length;
            const paused = r.paused[g.name], assigned = byAcc.filter(x => !x.segment);
            return <tr key={g.name} style={sx('cursor:pointer')} onClick={() => go(g.name)}>
              <td style={sx(td)}><div style={sx('display:flex;align-items:center;gap:8px;margin-bottom:4px')}><SegTag seg={g.name} />{paused ? <span className="tag tag-grey">Paused by {paused.by}</span> : null}</div>
                <div style={sx('font-size:12px;color:var(--i2)')}>{R.SEG_MEANS[g.name] || ''}</div>
                <div style={sx('font-size:12px;color:var(--i1);font-weight:600;margin-top:4px')}>→ {(CONFIG.segmentLibrary[g.name] || [''])[0]}</div>
                {fb ? <div style={sx('font-size:10.5px;color:var(--i3);margin-top:3px')}>{fb} of {byAcc.length} accounts joined on their second signal</div> : null}
                {assigned.length ? <div style={sx('font-size:10.5px;color:var(--brand-dk);margin-top:3px')}>{assigned.length} assigned by a person in For Review: {assigned.map(x => x.account.name).join(', ')}</div> : null}
                {canPause ? <button className="btn btn-ghost btn-sm" style={sx('margin-top:6px;padding:0 6px')} onClick={e => { e.stopPropagation(); void pause(g.name, !paused); }}>{paused ? 'Resume' : 'Pause this micro-segment'}</button> : null}</td>
              {num(byAcc.length, byAcc.length === 1 ? 'account' : 'accounts', 'var(--brand-dk)')}{num(rs.filter(x => x.passed).length, 'ready to use', 'var(--pos)')}{num(rs.filter(needsPerson).length, 'in For Review', 'var(--warn)')}
              <td style={sx(`${td};text-align:right`)}><span className="btn btn-sec btn-sm">View →</span></td></tr>;
          }) : <tr><td colSpan={5} style={sx(`${td};text-align:center;color:var(--i3);font-size:12.5px`)}>No micro-segment formed: fewer than {min} accounts share a signal.</td></tr>}</tbody>
        </table>
      </div>
      <div style={sx('font-size:11px;color:var(--i3);margin:8px 2px 0')}>A micro-segment is a group of at least {min} accounts with the same reason to buy now. Click one to see its accounts.</div>
      {unseg.length ? <div onClick={() => go(null)} style={sx('display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surf);border:1px solid var(--border);border-radius:var(--rmd);margin-top:8px;cursor:pointer')}>
        <span className="tag tag-grey">No micro-segment</span><span style={sx('flex:1;font-size:12px;color:var(--i2)')}>{unseg.map(x => x.account.name).join(', ')}: fewer than {min} accounts share any of their signals, so each gets its own action.</span>
        <span style={sx('font-size:12px;font-weight:600;color:var(--i1)')}>{pl(unseg.length, 'account')}</span><span style={sx('color:var(--i3)')}>›</span>
        {canPause ? <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); void pause('', !r.paused['']); }}>{r.paused[''] ? 'Resume' : 'Pause'}</button> : null}</div> : null}
      {r.engaged.length ? <div style={sx('display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surf);border:1px solid var(--border);border-radius:var(--rmd);margin-top:8px')}>
        <span className="tag tag-grey">Engaged once</span><span style={sx('flex:1;font-size:12px;color:var(--i2)')}>{r.engaged.map(e => e.name).join(', ')}: already recommended in this pilot ({[...new Set(r.engaged.map(e => e.label))].join('; ')}), so not recommended again.</span>
        <span style={sx('font-size:12px;font-weight:600;color:var(--i1)')}>{pl(r.engaged.length, 'account')}</span></div> : null}
    </>;
  }
  function listTab(r: Run): ReactNode {
    const segs = r.segments.map(g => g.name).concat(r.recs.some(x => !(x.segment || x.assignedSegment)) ? ['__x'] : []);
    const verts = [...new Set(r.recs.map(x => x.account.vertical))].sort();
    const sel = sx('padding:6px 9px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px');
    const rows = visibleRecs(r);
    return <>
      {showFilt !== 'meeting' ? meetingBanner() : null}
      <div className="score-list">
        <div className="sl-toolbar">
          <div className="sl-srch"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={sx('color:var(--i3);flex-shrink:0')}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input type="text" aria-label="Search" placeholder="Search accounts, contacts or actions…" value={q} onChange={e => setQ(e.target.value.toLowerCase())} /></div>
          <select aria-label="Micro-segment" value={segFilt ?? ''} onChange={e => setSegFilt(e.target.value || null)} style={sel}><option value="">All micro-segments</option>{segs.map(n => <option key={n} value={n}>{n === '__x' ? 'No micro-segment' : n}</option>)}</select>
          <select aria-label="Vertical" value={vertFilt ?? ''} onChange={e => setVertFilt(e.target.value || null)} style={sel}><option value="">All verticals</option>{verts.map(v => <option key={v}>{v}</option>)}</select>
          <select aria-label="Status" value={showFilt ?? ''} onChange={e => setShowFilt(e.target.value || null)} style={sel}><option value="">All statuses</option>{[['released', 'Released: ready to use'], ['waiting', 'Waiting for a person'], ['rejected', 'Not accepted'], ['meeting', 'Meeting booked'], ['proceeded', 'Went ahead on their own']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        {showFilt ? <div style={sx('display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border);font-size:12px;color:var(--i2)')}>Showing <span className="tag tag-blue">{SHOW_LABEL[showFilt] || showFilt}</span>
          <a href="#" onClick={e => { e.preventDefault(); setShowFilt(null); }} style={sx('color:var(--brand);font-weight:600;text-decoration:none')}>Show all</a>
          {showFilt === 'proceeded' ? <span style={sx('color:var(--i3)')}>· passed every check: segment size, confidence, sensitive content and claims</span> : null}</div> : null}
        <div className="dt-wrap"><table className="dt">
          <colgroup>{['16%', '15%', '12%', '23%', '8%', '26%'].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead><tr><th>Account</th><th>Contact</th><th>Micro-segment</th><th>Action and runner-up</th><th>Channel</th><th>Status</th></tr></thead>
          <tbody>{rows.length ? rows.map(x => {
            const [label, tone] = statusOf(x), seg = x.segment || x.assignedSegment;
            return <tr key={x.id} className="click" onClick={() => void openRec(x.id)}>
              <td><Cell v={x.account.name} sub={`${x.account.vertical} · ${x.account.existingCustomer ? 'Existing customer' : 'Net-new'}`} cls="dt-main" /></td>
              <td><div className="person"><div className="co-av" style={{ background: avColor(x.contact.name) }}>{initials(x.contact.name)}</div><div><Cell v={x.contact.name} sub={x.contact.jobTitle} /></div></div></td>
              <td><SegTag seg={seg} />{!x.segment && seg ? <span className="sub">assigned</span> : null}{x.segSince ? <span className="sub">since {fmtDate(x.segSince)}</span> : null}</td>
              <td className="wrap"><span className="clamp2" style={sx('font-size:12px;color:var(--i1)')} title={x.chosenAction}>{x.chosenAction}</span>{x.runnerUp ? <span className="sub" title={x.runnerUp}>Runner-up: {x.runnerUp}</span> : null}</td>
              <td><Cell v={x.channel} /></td>
              <td><span className={`tag ${tone}`}>{label}</span>{x.outcome ? <span className="sub">{x.outcome}</span> : canPause ? <span className="sub">{x.ownerName || x.ownerEmail || 'Unassigned'}</span> : null}</td>
            </tr>;
          }) : <tr><td colSpan={6} className="dt-empty">No recommendations match.</td></tr>}</tbody>
        </table></div>
      </div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>One recommendation per account. {canPause ? 'You see every rep\'s accounts.' : 'You see your own accounts.'} Click one to see the message, copy it and mark what happened.</div>
    </>;
  }

  /* ═══════════════ THE DRAWER: the same card for every item ═══════════════ */
  function drawerBody(it: Item): ReactNode {
    const st = it.state, x = it.draft, c = it.contact;
    const [label, tone] = R.statusLabel({ status: st.status, spot: st.spot, released: st.released, meeting: st.meeting }, !!it.paused);
    const panel = (title: string, right: ReactNode, body: ReactNode) => <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">{title}</span>{right}</div><div className="panel-body">{body}</div></div>;
    const kv = (k: string, v: ReactNode) => <div style={sx('display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--s75);font-size:12px;line-height:1.45')}><span style={sx('color:var(--i3);width:84px;flex-shrink:0')}>{k}</span><span style={sx('color:var(--i1);min-width:0')}>{v}</span></div>;
    const lbl = (t: string) => <div style={sx('font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin:10px 0 5px')}>{t}</div>;
    const field = (v: string, rows = 0) => rows ? <textarea readOnly rows={rows} value={v} style={sx('width:100%;border:1px solid var(--bdk);border-radius:var(--rsm);padding:8px 10px;font-size:12px;color:var(--i1);line-height:1.6;font-family:var(--fb);resize:vertical;outline:none;background:var(--s50)')} />
      : <input readOnly value={v} style={sx('width:100%;border:1px solid var(--bdk);border-radius:var(--rsm);padding:8px 10px;font-size:12.5px;font-weight:600;color:var(--i1);outline:none;background:var(--s50);margin-bottom:6px')} />;
    const sig = it.signal, seg = it.segOf;
    const failing = it.checks.flags.length || it.checks.unsupported.length;
    const ru = it.runnerUp, opts = it.options;
    const messageText = x.channel === 'Email' ? `${x.subject}\n\n${x.body}` : x.channel === 'LinkedIn' ? x.note || '' : x.task || '';
    const m = st.meeting, sc = m?.script;
    const conf = it.confidence.level, all = it.trackRecord.all, s1 = it.trackRecord.segment;
    return <>
      <div className="ar-chips" style={sx('margin:0 0 12px')}><SegTag seg={seg} /><span className={`tag ${tone}`}>{label}</span>{c.persona ? <span className="tag tag-grey">{c.persona} persona</span> : null}</div>
      {m && sc ? panel('Meeting booked: call script', <span className={`tag ${m.seen ? 'tag-green' : 'tag-violet'}`}>{m.seen ? 'Ready' : 'New'}</span>, <>
        <div style={sx('font-size:11px;color:var(--i3);margin-bottom:6px')}>Generated {fmtDate(m.at)} {timeOf(m.at)}, when the meeting was marked as booked.</div>
        {lbl('Opener')}<div style={sx('font-size:12.5px;color:var(--i1);line-height:1.55')}>{sc.opener}</div>
        {lbl('Agenda')}<ol style={sx('margin:4px 0 0 18px;padding:0;font-size:12px;color:var(--i1);line-height:1.6')}>{sc.agenda.map(t => <li key={t}>{t}</li>)}</ol>
        {lbl('Discovery questions')}<ol style={sx('margin:4px 0 0 18px;padding:0;font-size:12px;color:var(--i1);line-height:1.6')}>{sc.questions.map(t => <li key={t}>{t}</li>)}</ol>
        {lbl('If they say')}<div style={sx('font-size:12px;color:var(--i1)')}>{sc.objection}</div>
        {lbl('You say')}<div style={sx('font-size:12px;color:var(--i1)')}>{sc.response}</div>
        {lbl('The ask')}<div style={sx('font-size:12.5px;color:var(--i1);font-weight:600')}>{sc.ask}</div>
        <button className="btn btn-sec btn-sm" style={sx('margin-top:10px')} onClick={() => copy(['Opener: ' + sc.opener, 'Agenda:\n- ' + sc.agenda.join('\n- '), 'Questions:\n- ' + sc.questions.join('\n- '), 'If they say: ' + sc.objection, 'You say: ' + sc.response, 'The ask: ' + sc.ask].join('\n\n'))}>Copy the script</button>
      </>) : null}
      {panel('Next best action', st.manualAction ? <span className="tag tag-violet">Your own</span> : st.useRunnerUp ? <span className="tag tag-grey">Runner-up chosen</span> : <span className="tag tag-violet">Recommended</span>, <>
        <div className="ar-act">{it.chosenAction}</div>
        <div className="ar-why"><span className="ar-k">Why now</span><b>{sig.type || 'Signal'}</b>{sig.age !== undefined ? ` · ${sig.age} days ago` : ''}<div>{String(it.reason).replace(/^[^:]{3,40}:\s*/, '').replace(/^./, s => s.toUpperCase())}</div></div>
        {ru && !st.manualAction ? <div className="ar-ru"><span className="ar-k">{st.useRunnerUp ? 'Recommended' : 'Runner-up'}</span><b>{st.useRunnerUp ? it.recommended : ru.action}</b>
          {it.can.swap ? <button className="btn btn-sec btn-sm" onClick={() => void act(it.id, 'action', { use: st.useRunnerUp ? 'recommended' : 'runner-up' }, r => String(r.message))}>Use this instead</button> : null}</div> : null}
        {ru && !st.manualAction && opts.runnerUp ? <details className="ar-more"><summary>Compare them side by side</summary><div style={sx('margin-top:8px')}>{compare(it)}</div></details> : null}
      </>)}
      {panel(x.channel === 'Task' ? 'Task for the team' : x.channel === 'LinkedIn' ? 'LinkedIn note' : 'Email', <span style={sx('display:flex;gap:6px')}>{st.edited ? <span className="tag tag-violet">Edited</span> : null}{x.version > 1 ? <span className="tag tag-grey">v{x.version}</span> : null}</span>, <>
        <div className="ar-to">{x.channel === 'Email' ? (c.email ? <>To <b>{c.email}</b> {c.emailVerified ? <span className="tag tag-green">Verified</span> : <span className="tag tag-amber">Not verified</span>}</> : <span className="tag tag-red">No email on file</span>)
          : x.channel === 'LinkedIn' ? <>To <b>{c.name}</b> on LinkedIn</> : 'Owned by a person'}</div>
        {x.channel !== 'Task' ? <MessageBar recId={it.id} channel={x.channel} content={it.content} canEdit={it.can.content} seg={it.segOf} action={it.chosenAction} sameAction={it.sameAction}
          who={`${c.name} · ${it.account.name}`} onChanged={() => void loadItem(it.id)} /> : null}
        {x.channel === 'Email' ? <>{field(x.subject || '')}{field(x.body || '', 8)}</> : x.channel === 'LinkedIn' ? field(x.note || '', 3) : field(x.task || '', 3)}
        <div className="ar-row">{st.status === 'Released' && x.channel !== 'Task' && !it.paused ? <button className="btn btn-primary btn-sm" onClick={() => copy(messageText)}>Copy the message</button> : null}
          {failing ? <span className="tag tag-red">✗ {it.checks.flags[0]?.rule || 'Claim with no source'}</span> : <span className="ar-ok">✓ Brand and claims pass</span>}</div>
      </>)}
      {panel(st.status === 'Released' ? 'What happened' : 'Status', <span className={`tag ${tone}`}>{label}</span>, it.paused
        ? <><div className="ar-txt">The {it.segment || 'no-micro-segment'} group was paused by {it.paused.by} on {fmtDate(it.paused.at)}. Don&apos;t use it until it&apos;s resumed.</div>{canPause ? <button className="btn btn-sec btn-sm" onClick={() => void pause(it.segment ?? '', false)}>Resume it</button> : null}</>
        : R.needsPerson(st) ? <><div className="ar-txt">{st.status === 'Awaiting approval' ? 'Sensitive content: waiting for the sales manager\'s approval.' : st.spot === 'pending' ? 'Ready to use. It was also picked for this week\'s spot-check.' : 'Not ready yet: it waits for a decision in For Review.'}</div>
          <Link className="btn btn-sec btn-sm" style={sx('text-decoration:none')} href={`/review?item=${encodeURIComponent(it.id)}`}>Open in For Review →</Link></>
        : st.status === 'Released' ? <><div className="ar-txt">{st.released === 'auto' ? 'Went ahead on its own' : st.released === 'approved' ? `Approved by ${st.approvedBy ?? 'the sales manager'}` : `Accepted by ${st.decidedBy ?? 'the rep'}`}. Send it from your own mailbox or LinkedIn, then mark what happened.</div>
          <div className="tags">{R.OUTCOMES.map(o => <button key={o} className={`tag ${st.outcome === o ? 'tag-violet' : 'tag-grey'}`} style={sx('cursor:pointer')} disabled={!it.can.outcome}
            onClick={() => void act(it.id, 'outcome', { outcome: o }, () => o === 'Meeting booked' && st.outcome !== o ? 'Meeting booked: a call script is ready' : `Outcome logged: ${o}`)}>{o}</button>)}</div>
          {it.can.stepIn ? <button className="btn btn-ghost btn-sm" style={sx('margin-top:8px')} onClick={() => void act(it.id, 'step-in', {}, () => 'Moved to your exception queue as an intervention')}>Step in: edit or reject it</button> : null}</>
        : <div className="ar-txt">{(R.REJECT.find(z => z[0] === st.rejectCode) || [])[1] || 'Rejected'}{st.decidedBy ? ` · ${st.decidedBy}` : ''}{st.decidedAt ? ` · ${fmtDate(st.decidedAt)} ${timeOf(st.decidedAt)}` : ''}<div className="ws-sub">{st.status}</div></div>)}
      <details className="panel ar-details"><summary>Details <span>checks, track record, brief, owner and history</span></summary><div className="panel-body">
        {kv('Checks', <span className="tags" style={sx('display:inline-flex;flex-wrap:wrap;gap:4px')}>{it.fourChecks.map(f => <span key={f.name} className={`tag ${f.ok ? 'tag-green' : 'tag-red'}`}>{f.ok ? '✓' : '✗'} {f.name}</span>)}</span>)}
        {kv('Confidence', <><span className={`tag ${conf === 'High' ? 'tag-green' : conf === 'Medium' ? 'tag-amber' : 'tag-red'}`}>{conf}</span> <span style={sx('color:var(--i3)')}>{it.confidence.reason.replace(/^\w+:\s*/, '')}</span></>)}
        {it.draft.ai ? kv('Written by', <><AiTag confidence={conf} title={AI_DRAFT} /> <span style={sx('color:var(--i3)')}>the action, the brief and an approved claim; the same checks as every draft</span></>) : null}
        {kv('Track record', all.n ? (s1 && s1.n ? <>Reps agreed <b>{s1.a} of {s1.n}</b> times in {it.segment}</> : `${all.a} of ${all.n} across all`) : <span style={sx('color:var(--i3)')}>No decisions yet</span>)}
        {kv('Micro-segment', <><SegTag seg={seg} /> <span style={sx('color:var(--i3)')}>{seg ? R.SEG_MEANS[seg] || '' : ''}{it.segSince ? ` · since ${fmtDate(it.segSince)}` : ''}</span></>)}
        {kv('Proof', it.brief.proof ? <>{it.brief.proof.title} <span style={sx('color:var(--i3)')}>· {it.brief.proof.type}, {it.brief.proof.year}</span></> : <span style={sx('color:var(--i3)')}>No approved proof</span>)}
        {kv('Angle', it.brief.angle)}
        {kv('Owner', canReassign && it.can.reassign ? <select aria-label="Owner" value={it.owner.email ?? ''} onChange={e => void act(it.id, 'reassign', { ownerEmail: e.target.value }, () => `Moved to ${it.reps.find(r => r.email === e.target.value)?.name ?? 'nobody'}'s queue`)}
          style={sx('padding:3px 6px;border:1px solid var(--bdk);border-radius:6px;font-size:12px')}>
          {ownerOptions(it).map(([e, n]) => <option key={e} value={e}>{n}</option>)}
        </select> : it.owner.name || it.owner.email || 'Unassigned')}
        {it.history.length ? <><div className="ar-k" style={sx('margin-top:10px')}>History</div>{it.history.map(l => <div key={l.id} style={sx('padding:6px 0;border-bottom:1px solid var(--s75);font-size:11.5px')}>
          <b style={sx('color:var(--i1)')}>{l.decision}</b> <span style={sx('color:var(--i3)')}>· {l.who} · {fmtDate(l.at)} {timeOf(l.at)}</span>{l.note ? <div style={sx('color:var(--i2)')}>{l.note}</div> : null}</div>)}</> : null}
      </div></details>
    </>;
  }
  /** Who a manager can move an item to: the unit's reps, plus its current owner when that is someone else. */
  function ownerOptions(it: Item): [string, string][] {
    const out: [string, string][] = [['', 'Unassigned'], ...it.reps.map(r => [r.email, r.name] as [string, string])];
    if (it.owner.email && !it.reps.some(r => r.email === it.owner.email)) out.push([it.owner.email, it.owner.name ?? it.owner.email]);
    return out;
  }
  function compare(it: Item): ReactNode {
    const A = it.options.recommended, B = it.options.runnerUp!, st = it.state;
    const useB = st.useRunnerUp && !st.manualAction, useA = !st.useRunnerUp && !st.manualAction;
    const cellv = (v: string, other: string) => <span style={v !== other ? sx('font-weight:700;color:var(--i1)') : sx('color:var(--i2)')}>{v || '—'}</span>;
    const rowv = (k: string, a: ReactNode, b: ReactNode) => <tr><td style={sx('padding:6px 8px 6px 0;font-size:11px;color:var(--i3);vertical-align:top;white-space:nowrap')}>{k}</td><td style={sx('padding:6px 8px;font-size:12px;vertical-align:top')}>{a}</td><td style={sx('padding:6px 0 6px 8px;font-size:12px;vertical-align:top')}>{b}</td></tr>;
    const head = (t: string, chosen: boolean) => <th style={sx('text-align:left;padding:0 8px 8px;vertical-align:bottom;width:44%')}><div style={sx(`font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${chosen ? 'var(--brand-dk)' : 'var(--i3)'}`)}>{t}</div>
      <div style={sx('margin-top:6px')}>{chosen ? <span className="tag tag-violet">Chosen</span> : it.can.swap ? <button className="btn btn-sec btn-sm" onClick={() => void act(it.id, 'action', { use: t === 'Recommended' ? 'recommended' : 'runner-up' }, r => String(r.message))}>Use this instead</button> : null}</div></th>;
    const checks = (f: typeof A) => f.ok ? <span style={sx('color:var(--pos)')}>✓ All pass</span> : <span style={sx('color:var(--neg)')}>✗ {f.flags.join(', ')}</span>;
    return <><table style={sx('width:100%;border-collapse:collapse')}>
      <thead><tr><th></th>{head('Recommended', useA)}{head('Runner-up', useB)}</tr></thead>
      <tbody style={sx('border-top:1px solid var(--s75)')}>
        {rowv('Action', <b style={sx('color:var(--i1)')}>{A.action}</b>, <b style={sx('color:var(--i1)')}>{B.action}</b>)}
        {rowv('Why', <span style={sx('color:var(--i2)')}>{A.reason}</span>, <span style={sx('color:var(--i2)')}>{B.reason}</span>)}
        {rowv('Channel', cellv(A.channel, B.channel), cellv(B.channel, A.channel))}
        {rowv('Proof', cellv(A.proof || 'None approved', B.proof || 'None approved'), cellv(B.proof || 'None approved', A.proof || 'None approved'))}
        {rowv('Confidence', cellv(A.conf, B.conf), cellv(B.conf, A.conf))}
        {rowv('Brand and claims', checks(A), checks(B))}
      </tbody></table>
      <div style={sx('font-size:10.5px;color:var(--i3);margin-top:6px')}>Bold marks what differs. Decisions are made in For Review; after release the rep may switch to one that passes every check.</div></>;
  }

  const it = drawer?.item ?? null;
  return <>
    <main className="main" id="mainArea">{screen === 'results' && run ? resultsScreen(run) : startScreen()}</main>
    {checks ? checksOverlay(checks) : null}
    <div className={'detail-drawer' + (drawer ? ' open' : '')} id="detailDrawer" style={drawer ? { width: '520px' } : undefined} aria-hidden={!drawer}>
      <div className="drawer-hdr">
        <div><div className="drawer-title">{it ? it.contact.name : 'Recommendation'}</div><div className="drawer-sub">{it ? [it.contact.jobTitle, it.account.name].filter(Boolean).join(' · ') : '—'}</div></div>
        <div className="drawer-close" role="button" tabIndex={0} aria-label="Close" onClick={() => setDrawer(null)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setDrawer(null); }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></div>
      </div>
      <div className="drawer-body" id="detBody">{it ? <div key={it.id}>{drawerBody(it)}</div> : drawer ? <div style={sx('padding:40px 0;text-align:center;font-size:12px;color:var(--i3)')}>Loading…</div> : null}</div>
    </div>
  </>;
}
