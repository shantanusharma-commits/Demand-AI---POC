'use client';

/* Today (was legacy/00-today.html), on the server (G-010). Land on your work: blockers first, then what waits for you
   and by when, what was released and needs an outcome, and what the system did on its own. Every number comes from
   GET /api/today for the signed-in person (a manager sees the team); due dates are worked out in this browser's time
   zone, as in For Review. Not ported: Copilot and Autopilot (Phase 6), and the "run failed: list deleted" blocker (a
   list with micro-segments can't be deleted). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import * as R from '@/lib/engine/review';
import { gateLabel, type Gate } from '@/lib/engine/gates';
import { sx } from '@/lib/sx';
import { CopilotButton } from '@/components/Copilot';
import { api, errorText, type WireDeep } from '@/lib/client/api';
import { showToast } from '@/lib/ui';
import { useSessionUser } from '@/components/SessionContext';
import type { TodayView } from '@/lib/server/services/today';

type View = WireDeep<TodayView>;
type Full = Extract<View, { nothing: false }>;
type Row = Full['queue'][number];
type Panel = 'guide' | 'blockers' | null;

const GUIDE_KEY = 'demandai_today_intro_v1';
const pl = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const fmtDate = (t: string | number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const ago = (t: string, now: number) => { const h = (now - Date.parse(t)) / 36e5; return h < 1 ? 'just now' : h < 24 ? Math.round(h) + 'h ago' : Math.round(h / 24) + 'd ago'; };
const dueOfRow = (r: Row) => R.dueOf({ cats: r.cats, segment: r.segment, spot: r.spot, routedAt: Date.parse(r.routedAt) });
const nbaLink = (runId: string | null | undefined, show?: string) => (runId ? `/nba?run=${encodeURIComponent(runId)}${show ? `&show=${show}` : ''}` : '/nba');
const itemLink = (id: string) => `/review?item=${encodeURIComponent(id)}`;
const LINK = sx('font-size:11.5px;color:var(--brand);font-weight:600;text-decoration:none;white-space:nowrap');
const KIND_TONE: Record<string, string> = { 'Prospect list': 'tag-grey', 'Scored list': 'tag-blue', 'Micro-segments': 'tag-violet' };

function box(title: ReactNode, right: ReactNode, body: ReactNode, id?: string) {
  return <div className="panel" id={id} style={sx('margin-bottom:20px')}><div className="panel-hdr"><span className="panel-ttl">{title}</span>{right}</div><div className="panel-body" style={sx('padding:0')}>{body}</div></div>;
}
const empty = (t: string) => <div style={sx('padding:14px;font-size:12px;color:var(--i3)')}>{t}</div>;
function line(key: string, main: ReactNode, sub: ReactNode, right: ReactNode, href: string) {
  return <Link key={key} href={href} style={sx('display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--s75);text-decoration:none;color:inherit')}>
    <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{main}</div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{sub}</div></div>{right}<span style={sx('color:var(--i3);font-size:13px')}>›</span></Link>;
}
const gateTone = (g: Gate) => (g.state === 'met' ? 'var(--pos)' : g.state === 'below' ? 'var(--neg)' : 'var(--i3)');
const gateWord = (g: Gate) => (g.state === 'met' ? `On track · target ${g.threshold}%` : g.state === 'below' ? `Below the ${g.threshold}% target` : gateLabel(g));

export function TodayScreen() {
  const me = useSessionUser();
  const [v, setV] = useState<View | null>(null);
  const [loadError, setLoadError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const booted = useRef(false);

  function load(first = false) {
    return api<View>('/api/today').then(r => {
      setV(r);
      if (first) {
        let seen = false;
        try { seen = localStorage.getItem(GUIDE_KEY) === 'closed'; } catch { /* storage blocked: show it */ }
        if (!seen) openGuide();
      }
    }, err => setLoadError(errorText(err)));
  }
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void load(true);
  });   // runs once (booted)

  function openGuide() {
    try { localStorage.setItem(GUIDE_KEY, 'closed'); } catch { /* storage blocked */ }
    setPanel('guide');
  }
  async function markOutcome(id: string, outcome: string) {
    setBusy(id);
    try {
      const r = await api<{ outcome: string; meeting: boolean }>(`/api/recommendations/${encodeURIComponent(id)}/outcome`, { body: { outcome } });
      showToast(r.meeting ? 'Meeting booked: the call script is ready on Micro-segments & NBA' : `Marked ${outcome}`);
      await load();
    } catch (err) { showToast(errorText(err)); }
    finally { setBusy(null); }
  }

  const first = (me.displayName || '').split(' ')[0];
  const now = v ? Date.parse(v.now) : 0;
  const hour = v ? new Date(now).getHours() : 12;
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateLine = v ? new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : '';

  const head = <div className="topbar"><div className="topbar-l"><span className="tb-title">Today</span><span style={sx('font-size:12px;color:var(--i3);margin-left:10px')}>{dateLine}</span></div>
    <div className="topbar-r"><CopilotButton screen="today" ctxRef={{}} title="Today's work" />
      <button className="btn btn-ghost btn-sm" title="How Today works" aria-label="How Today works" onClick={openGuide}
      style={sx('width:28px;height:28px;padding:0;justify-content:center;border-radius:50%;border:1px solid var(--bdk);font-weight:700;margin-right:4px')}>?</button></div></div>;

  function body(): ReactNode {
    if (loadError) return <div role="alert" style={sx('color:var(--neg);font-size:12.5px')}>{loadError}</div>;
    if (!v) return <div style={sx('font-size:12.5px;color:var(--i3)')}>Loading…</div>;
    const hello = (sub: ReactNode) => <div style={sx('margin-bottom:14px')}><div style={sx('font-family:var(--fd);font-size:22px;font-weight:700;color:var(--i1)')}>{greeting}{first ? `, ${first}` : ''}</div>
      <div style={sx('font-size:13px;color:var(--i3);margin-top:4px')}>{sub}
        <a href="#" onClick={e => { e.preventDefault(); openGuide(); }} style={sx('color:var(--brand);font-weight:600;text-decoration:none;margin-left:6px')}>How Today works</a></div></div>;
    if (v.nothing) {
      const step = (n: number, t: string, d: string, href: string, cta: string) => <div className="panel" style={sx('flex:1')}><div className="panel-body">
        <div style={sx('font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--brand)')}>STEP {n}</div>
        <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin:6px 0 4px')}>{t}</div>
        <div style={sx('font-size:12px;color:var(--i2);line-height:1.55;margin-bottom:12px')}>{d}</div><Link href={href} style={LINK}>{cta}</Link></div></div>;
      return <>{hello("Nothing has been built yet. Here's how the pilot runs.")}
        <div style={sx('display:flex;gap:14px;max-width:980px')}>
          {step(1, 'Bring in prospects', 'Upload the account and contact file, or use the sample. Bad rows are set aside with a reason.', '/prospecting', 'Go to Prospecting →')}
          {step(2, 'Score the accounts', 'Fit, intent and timing give each account a tier and a reason. Send the best to micro-segments.', '/scoring', 'Go to Scoring →')}
          {step(3, 'Plan the next step', 'Accounts are grouped by their reason to buy now, and each gets an action and a first message. Exceptions come to For Review.', '/nba', 'Go to Micro-segments & NBA →')}
        </div></>;
    }
    return full(v, hello);
  }

  function full(d: Full, hello: (sub: ReactNode) => ReactNode): ReactNode {
    const mgr = d.manager;
    const queue = d.queue.slice().sort((a, b) => dueOfRow(a) - dueOfRow(b));
    const spots = queue.filter(x => x.spot === 'pending'), exceptions = queue.length - spots.length;
    const needs = queue.length + d.approvals.total;
    const bl = d.blockers;
    const notice = bl.length
      ? <a href="#" onClick={e => { e.preventDefault(); setPanel('blockers'); }} style={sx('display:flex;align-items:center;gap:10px;padding:11px 14px;margin-bottom:14px;background:var(--neg-lt);border:1px solid #F0C9C9;border-radius:var(--rmd);text-decoration:none')}>
        <span style={sx('width:9px;height:9px;border-radius:50%;background:var(--neg);flex-shrink:0')} />
        <span style={sx('flex:1;font-size:12.5px;color:var(--i1)')}><b style={sx('color:var(--neg)')}>{pl(bl.length, 'blocker')}</b> stopping work: {bl[0].title}{bl.length > 1 ? ` · and ${bl.length - 1} more` : ''}</span>
        <span style={sx('font-size:12px;font-weight:700;color:var(--neg);white-space:nowrap')}>View and fix →</span></a>
      : <a href="#" onClick={e => { e.preventDefault(); setPanel('blockers'); }} style={sx('display:flex;align-items:center;gap:8px;padding:8px 14px;margin-bottom:14px;background:var(--pos-lt);border-radius:var(--rmd);text-decoration:none;font-size:12px;color:var(--pos);font-weight:600')}>
        <span style={sx('width:8px;height:8px;border-radius:50%;background:var(--pos)')} />No blockers. Your work is running.</a>;

    // Tiles: each opens the items behind its number.
    const stat = (lbl: string, val: ReactNode, sub: string, href: string, tone?: string) => <Link className="stat stat-link" href={href} title={`Open the items behind ${lbl.toLowerCase()}`}>
      <div className="stat-lbl">{lbl}</div><div className="stat-val" style={sx(tone ? `color:${tone}` : 'color:var(--i1)')}>{val}</div><div className="stat-sub">{sub}</div></Link>;
    const outRate = d.outcomes.marked ? Math.round(d.outcomes.positive / d.outcomes.marked * 100) : null;
    const { g1, g2 } = d.gates;
    const tiles = <div className="stats" style={sx('margin-bottom:18px;grid-template-columns:repeat(6,1fr)')}>
      {stat('In For Review', queue.length, `${pl(exceptions, 'exception')} · ${pl(spots.length, 'spot-check')}`, '/review', queue.length ? 'var(--ter-dk)' : '')}
      {mgr ? stat('Approvals', d.approvals.total, 'sensitive content, needs you', '/review?view=approvals', d.approvals.total ? 'var(--brand)' : '')
        : stat('With the sales manager', d.withManager.total, 'sensitive content you accepted', nbaLink(d.withManager.runId, 'waiting'))}
      {stat('Awaiting outcome', d.ready.total, 'mark what happened', '#outcomes')}
      {stat('Outcome rate', outRate === null ? '—' : outRate + '%', d.outcomes.marked ? `${d.outcomes.positive} replied or booked a meeting, of ${d.outcomes.marked} with a result` : 'No results marked yet', '/analytics?tab=loop', outRate === null ? '' : 'var(--pos)')}
      {stat('G2 acceptance', g2.value === null ? '—' : Math.round(g2.value) + '%', gateWord(g2), '/analytics?tab=gates', gateTone(g2))}
      {stat('G1 effort saved', g1.value === null ? '—' : Math.round(g1.value) + '%', gateWord(g1), '/analytics?tab=gates', gateTone(g1))}
    </div>;

    // Waiting in For Review: one list, earliest due first; an overdue item carries an Overdue tag.
    const dueTone = (b: string) => (b === 'overdue' || b === 'today' ? 'var(--neg)' : b === 'tomorrow' ? 'var(--warn)' : 'var(--i3)');
    const dueDay = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const qRows = queue.slice(0, 5).map(x => {
      const t = dueOfRow(x), b = R.dueBucket(t, now), late = b === 'overdue';
      return line(x.id, `${x.who} · ${x.account}`, `${x.action} · ${x.channel} · ${x.reason}${mgr && x.ownerName ? ` · ${x.ownerName}` : ''}`,
        <><span style={sx(`font-size:11px;font-weight:600;color:${dueTone(b)};white-space:nowrap`)}>{late ? 'Was due ' + dueDay(t) : R.dueLabel(t, now)}</span>{late ? <span className="tag tag-red">Overdue</span> : null}
          <span className={`tag ${x.spot === 'pending' ? 'tag-blue' : 'tag-amber'}`}>{x.whyHere}</span></>, itemLink(x.id));
    });
    // Sensitive at build time, it came straight from the system; otherwise a rep accepted it and it became sensitive.
    const aRows = d.approvals.rows.map(x => line(x.id, `${x.who} · ${x.account}`,
      `${x.why === 'sensitive' ? `Straight from the system${x.ownerName ? ` · for ${x.ownerName}` : ''}` : `Accepted by ${x.ownerName || 'the rep'}`} · ${x.action}`, <span className="tag tag-violet">Approval</span>, itemLink(x.id)));
    const rRows = d.ready.rows.map(x => <div key={x.id} style={sx('padding:10px 14px;border-bottom:1px solid var(--s75)')}>
      <div style={sx('display:flex;align-items:center;gap:10px')}>
        <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>{x.who} · {x.account}</div>
          <div style={sx('font-size:11px;color:var(--i3);margin-top:2px')}>{x.action} · {x.channel}{x.releasedAt ? ` · released ${ago(x.releasedAt, now)}` : ''}{x.outcome ? ` · marked ${x.outcome}` : ''}</div></div>
        <Link href={`${nbaLink(x.runId)}&rec=${encodeURIComponent(x.id)}`} style={LINK}>Open the message →</Link>
      </div>
      <div style={sx('display:flex;flex-wrap:wrap;gap:6px;margin-top:8px')}>{R.OUTCOMES.map(o => <button key={o} className={`tag ${x.outcome === o ? 'tag-violet' : 'tag-grey'}`} style={sx('cursor:pointer;border:none')}
        disabled={busy === x.id} onClick={() => void markOutcome(x.id, o)}>{o}</button>)}</div>
    </div>);

    // Right column: what the system did, spot-checks, gates, set-up (managers), recent lists.
    const trust = d.trust;
    const didPanel = d.latest ? box('What the system did', <span style={sx('font-size:11px;color:var(--i3)')}>{ago(d.latest.createdAt, now)}</span>, <>
      <div style={sx('padding:12px 14px')}><div style={sx('display:flex;gap:22px;margin-bottom:6px')}>
        <Link href={nbaLink(d.latest.id, 'proceeded')} style={sx('text-decoration:none')}><div className="stat-lbl">Went ahead on their own</div><div style={sx('font-family:var(--fd);font-size:20px;font-weight:700;color:var(--pos)')}>{d.latest.went}</div></Link>
        <Link href={nbaLink(d.latest.id, 'waiting')} style={sx('text-decoration:none')}><div className="stat-lbl">Needed a person</div><div style={sx('font-family:var(--fd);font-size:20px;font-weight:700;color:var(--ter-dk)')}>{d.latest.needed}</div></Link>
      </div></div>
      <Link href="/analytics?tab=gates" style={sx('display:block;padding:12px 16px;border-top:1px solid var(--s75);text-decoration:none')}>
        <div className="stat-lbl">How often reps agreed with it</div>
        {trust.all.n ? <><div style={sx('display:flex;align-items:baseline;gap:8px;margin-top:2px')}><span style={sx('font-family:var(--fd);font-size:20px;font-weight:700;color:var(--i1)')}>{trust.all.pct}%</span>
          <span style={sx('font-size:11.5px;color:var(--i2)')}>{trust.all.a} of {trust.all.n} first recommendations accepted</span></div>
          {trust.all.early ? <div style={sx('font-size:11px;color:var(--i3);margin-top:3px')}>Early days: only {pl(trust.all.n, 'decision')} so far, so read it as a hint.</div> : null}
          {trust.segments.length ? <div style={sx('font-size:11px;color:var(--i3);margin-top:3px')}>{trust.segments.map(s => `${s.segment} ${s.a} of ${s.n}`).join(' · ')}</div> : null}</>
          : <div style={sx('font-size:11.5px;color:var(--i3);margin-top:3px')}>No decisions yet. It builds up as people accept or reject items.</div>}
      </Link></>) : null;
    const done = d.spot.rated, total = d.spot.picked, pct = total ? Math.round(done / total * 100) : 0;
    const fri = spots[0] ? R.dueLabel(dueOfRow(spots[0]), now) : '';
    const spotPanel = box("This week's spot-checks", spots.length ? <Link href="/review?kind=spot" style={LINK}>Rate them →</Link> : null, <>
      <div style={sx('padding:14px 16px 12px')}>
        <div style={sx('display:flex;align-items:baseline;gap:8px')}>
          <span style={sx('font-family:var(--fd);font-size:22px;font-weight:700;color:var(--i1)')}>{done}<span style={sx('color:var(--i3);font-size:15px')}> / {total}</span></span>
          <span style={sx('font-size:12px;color:var(--i2)')}>rated</span>
          <span style={sx('margin-left:auto')} className={`tag ${!total ? 'tag-grey' : done >= total ? 'tag-green' : 'tag-amber'}`}>{!total ? 'None picked yet' : done >= total ? 'All done' : `${total - done} to rate${fri ? ' · ' + fri.replace(/^By /, 'by ') : ''}`}</span>
        </div>
        <div style={sx('height:6px;background:var(--s100);border-radius:99px;margin-top:10px;overflow:hidden')}><div style={sx(`width:${pct}%;height:100%;background:var(--pos);border-radius:99px`)} /></div>
      </div>
      {d.spot.rows.map(x => line(x.id, `${x.who} · ${x.account}`, `${x.action}${mgr && x.ownerName ? ` · ${x.ownerName}` : ''}`, <span className="tag tag-blue">Rate it</span>, itemLink(x.id)))}</>);
    const m = d.measure;
    const gatePanel = box('Success gates', <Link href="/analytics?tab=gates" style={LINK}>Analytics →</Link>, <div style={sx('padding:12px 14px')}>
      {([['G2 · first-pass acceptance', g2, m.weighted !== null ? `${m.pooled.a} of ${m.pooled.n} accepted on first pass, weighted across both paths` : 'Decide in For Review to start the count'],
        ['G1 · less review effort', g1, m.minutes !== null && g1.value !== null ? `${Math.round(m.minutes * 10) / 10} min per usable first action against ${m.base} min before` : 'Needs decisions to measure']] as [string, Gate, string][])
        .map(([t, g, detail]) => <Link key={t} href="/analytics?tab=gates" style={sx('display:block;text-decoration:none;padding:8px 0;border-bottom:1px solid var(--s75)')}>
          <div style={sx('display:flex;align-items:baseline;gap:10px')}><span style={sx('flex:1;font-size:12.5px;font-weight:600;color:var(--i1)')}>{t}</span>
            <span style={sx(`font-family:var(--fd);font-size:18px;font-weight:700;color:${gateTone(g)}`)}>{g.value === null ? '—' : Math.round(g.value) + '%'}</span></div>
          <div style={sx(`font-size:11px;color:${gateTone(g)};margin-top:2px`)}>{gateWord(g)}</div><div style={sx('font-size:11px;color:var(--i3);margin-top:2px')}>{detail}</div></Link>)}
    </div>);
    const su = d.setup;
    const setupRow = (k: string, tag: ReactNode, href: string) => <Link href={href} style={sx('display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--s75);text-decoration:none;color:inherit')}>
      <span style={sx('flex:1;font-size:12.5px;color:var(--i1)')}>{k}</span>{tag}<span style={sx('color:var(--i3);font-size:13px')}>›</span></Link>;
    const setupPanel = su ? box('Set-up and data', <Link href="/setup" style={LINK}>Setup →</Link>, <>
      {setupRow('Configuration', <span className="tag tag-green">{su.configVersion ? `Config v${su.configVersion}` : 'Not set up'}</span>, '/analytics?tab=validation')}
      {setupRow('Brand pack', <span className={`tag ${su.brandDraft ? 'tag-amber' : 'tag-green'}`}>Brand v{su.brandVersion}{su.brandDraft ? ' · draft waiting' : ''}</span>, '/content')}
      {setupRow('Data readiness', su.readiness ? <span className={`tag ${su.readiness.ok === su.readiness.total ? 'tag-green' : 'tag-amber'}`}>{su.readiness.ok} of {su.readiness.total} checks pass</span> : <span className="tag tag-grey">No data yet</span>, '/analytics?tab=validation')}
      {setupRow('Saved lists', <span className="tag tag-grey">{pl(su.saved, 'list')}</span>, '/prospecting')}</>) : null;
    const recentPanel = box('Recent lists', null, d.recent.length ? d.recent.map(x => line(x.kind + x.id, x.name, `${x.sub} · ${fmtDate(x.at)}`, <span className={`tag ${KIND_TONE[x.kind]}`}>{x.kind}</span>, x.href)) : empty('No lists yet.'));

    return <>
      {hello(needs ? `${pl(needs, 'item needs', 'items need')} you today.` : 'Nothing is waiting for you. Ready-to-use actions and recent lists are below.')}
      {notice}{tiles}
      <div style={sx('display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:20px;align-items:start')}>
        <div>
          {box('Waiting in For Review', queue.length ? <Link href={itemLink(queue[0].id)} style={LINK}>Start reviewing ({queue.length}) →</Link> : null,
            queue.length ? <>{qRows}{queue.length > 5 ? <div style={sx('padding:8px 14px')}><Link href="/review" style={LINK}>+ {queue.length - 5} more, earliest due first</Link></div> : null}</> : empty('Nothing is waiting for your review.'))}
          {mgr ? box('Approvals', d.approvals.total ? <Link href="/review?view=approvals" style={LINK}>Review them →</Link> : null, aRows.length ? aRows : empty('No sensitive items waiting for your approval.')) : null}
          {box('Awaiting your outcome update', d.ready.total ? <span style={sx('font-size:11px;color:var(--i3)')}>{d.ready.total} · oldest first</span> : null,
            rRows.length ? <>{rRows}{d.ready.total > rRows.length ? <div style={sx('padding:8px 14px;font-size:11.5px;color:var(--i3)')}>+ {d.ready.total - rRows.length} more on Micro-segments &amp; NBA</div> : null}</> : empty('Nothing released is waiting for an outcome.'), 'outcomes')}
        </div>
        <div>{didPanel}{spotPanel}{gatePanel}{setupPanel}{recentPanel}</div>
      </div>
    </>;
  }

  function sidePanel(): ReactNode {
    if (!panel) return null;
    const term = (t: string, d: string) => <div style={sx('padding:10px 0;border-bottom:1px solid var(--s75)')}><div style={sx('font-size:12.5px;font-weight:700;color:var(--i1)')}>{t}</div><div style={sx('font-size:12px;color:var(--i2);line-height:1.55;margin-top:3px')}>{d}</div></div>;
    const bl = v && !v.nothing ? v.blockers : [];
    const [title, sub] = panel === 'guide' ? ['How Today works', 'Your work, in the order to do it'] : bl.length ? [pl(bl.length, 'blocker'), 'Work is stuck until these are cleared'] : ['No blockers', 'Your work is running'];
    return <div className="detail-drawer open" role="dialog" aria-label={title}>
      <div className="drawer-hdr"><div><div className="drawer-title">{title}</div><div className="drawer-sub">{sub}</div></div>
        <button className="drawer-close" aria-label="Close" onClick={() => setPanel(null)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button></div>
      <div className="drawer-body">{panel === 'guide' ? <>
        <div style={sx('font-size:12.5px;color:var(--i2);line-height:1.6;margin-bottom:6px')}>The system does most of the work on its own. Today shows what it needs from you so work keeps moving. Do it in this order:</div>
        {term('1 · Clear blockers', "The notice above the tiles. Anything that stops work: a scheduled run that didn't run, an upload rejected by hard stops, missing data, an expired claim, approvals holding up release. Click it to see each one and where it's fixed.")}
        {term("2 · Review what's waiting, by when it's due", "Items the system couldn't decide on its own, earliest due first. Click one to open it in For Review.")}
        {term('Tiles open the detail', 'Every tile at the top opens the items behind the number. Panel links do the same; Start reviewing → opens the first item due.')}
        {term('3 · Mark outcomes', "There's no CRM link in the pilot, so mark what happened with each released message: Sent, Replied, Meeting booked or No response.")}
        {term('Went ahead on its own', 'Passed all four checks (segment size, confidence, sensitive content, claims) and was released to the rep, ready to use. Each week a few are picked for a spot-check rating.')}
        {term('Exception', 'Failed a check, so a person accepts, edits or rejects it.')}
        {term('G2 and G1', `The success gates. G2: how often recommendations are accepted first time${v && !v.nothing ? ` (target ${v.settings.g2Threshold}%)` : ''}. G1: review time saved against the baseline${v && !v.nothing ? ` of ${v.settings.g1BaselineMinutes} minutes (target ${v.settings.g1Threshold}%)` : ''}. Below ${v && !v.nothing ? v.settings.minDecisions : 'the agreed number of'} decisions a gate is too early to call.`)}
        <div style={sx('font-size:11.5px;color:var(--i3);margin-top:12px')}>New to the pilot? The work starts in <Link href="/prospecting" style={LINK}>Prospecting</Link>, then <Link href="/scoring" style={LINK}>Account Scoring</Link>, then <Link href="/nba" style={LINK}>Micro-segments &amp; NBA</Link>. Reopen this guide with the ? next to the title.</div>
      </> : bl.length ? <>
        {bl.map((b, i) => <div key={i} className="panel" style={sx('margin-bottom:12px;border-color:var(--neg-lt)')}><div className="panel-body">
          <div style={sx('display:flex;gap:8px;align-items:flex-start')}><span style={sx('width:8px;height:8px;border-radius:50%;background:var(--neg);margin-top:6px;flex-shrink:0')} />
            <div><div style={sx('font-size:13px;font-weight:700;color:var(--i1)')}>{b.title}</div>
              <div style={sx('font-size:12px;color:var(--i2);margin-top:4px;line-height:1.55')}>{b.detail}</div>
              <div style={sx('font-size:11px;color:var(--i3);margin-top:6px')}>Fixed by: {b.who}</div></div></div>
          <Link className="btn btn-primary btn-sm" href={b.href} style={sx('text-decoration:none;margin-top:10px;display:inline-flex')}>{b.cta} →</Link></div></div>)}
        <div style={sx('font-size:11px;color:var(--i3);line-height:1.5')}>A blocker is anything that stops work from moving: a scheduled run that didn&apos;t run, an upload rejected by hard stops, data that&apos;s missing, an expired claim an action needs, or approvals holding up release. Something that&apos;s only due soon isn&apos;t a blocker; it&apos;s under Waiting in For Review, by when it&apos;s due.</div>
      </> : <div style={sx('font-size:12.5px;color:var(--i2)')}>Nothing is stopping work. Scheduled runs are on time, uploads loaded, and nothing is held for approval.</div>}</div>
    </div>;
  }

  return <>
    <main className="main" id="mainArea">{head}<div className="canvas" style={sx('padding:20px 28px 48px')}>{body()}</div></main>
    {sidePanel()}
  </>;
}
