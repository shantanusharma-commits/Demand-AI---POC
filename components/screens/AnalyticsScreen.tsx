'use client';

/* Analytics (was legacy/13-analytics.html), on the server (G-011). The pilot measured from the shared decision log and
   the stored lists, runs and builds, organised by the six success areas (D-38): the areas with their evidence, the
   success gates G1 and G2 (D-21), the work-done funnel, the supporting evidence, the weekly summary, the pilot
   readout, the decision log, the learning loop and the validation settings. Reps see their own results, managers can
   pick a rep, a Viewer reads the aggregates. The weekly summary and the readout download as the Markdown the server
   built; there is no PDF export. */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import * as R from '@/lib/engine/review';
import { AREA_VERDICTS, gateLabel, SPONSOR_DECISIONS, type Gate, type GateState } from '@/lib/engine/gates';
import { sx } from '@/lib/sx';
import { api, errorText, type WireDeep } from '@/lib/client/api';
import { showToast } from '@/lib/ui';
import { useSessionUser } from '@/components/SessionContext';
import type { areasView, evidenceView, funnelView, gatesView, learningLoopView, readoutView, validationView, weeklyView } from '@/lib/server/services/analytics';
import type { LogRow } from '@/lib/server/services/review';

type Tab = 'areas' | 'gates' | 'funnel' | 'evidence' | 'weekly' | 'readout' | 'log' | 'loop' | 'validation';
type Areas = WireDeep<Awaited<ReturnType<typeof areasView>>>;
type Gates = WireDeep<Awaited<ReturnType<typeof gatesView>>>;
type Funnel = WireDeep<Awaited<ReturnType<typeof funnelView>>>;
type Evidence = WireDeep<Awaited<ReturnType<typeof evidenceView>>>;
type Weekly = WireDeep<Awaited<ReturnType<typeof weeklyView>>>;
type Readout = WireDeep<Awaited<ReturnType<typeof readoutView>>>;
type Loop = WireDeep<Awaited<ReturnType<typeof learningLoopView>>>;
type Validation = WireDeep<Awaited<ReturnType<typeof validationView>>>;
type Log = WireDeep<LogRow>;
type Lens = { rep: { email: string; name: string } | null; own: boolean; manager: boolean; viewer: boolean; reps?: { email: string; name: string }[]; builds?: number };

const TABS: [Tab, string][] = [['areas', 'Success areas'], ['gates', 'Success gates'], ['funnel', 'Work-done funnel'], ['evidence', 'Supporting evidence'], ['weekly', 'Weekly summary'],
  ['readout', 'Pilot readout'], ['log', 'Decision log'], ['loop', 'Learning loop'], ['validation', 'Validation']];
const ENDPOINT: Record<Tab, string> = { areas: 'areas', gates: 'gates', funnel: 'funnel', evidence: 'evidence', weekly: 'weekly', readout: 'readout', log: '', loop: 'learning-loop', validation: 'validation' };
const pct0 = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Math.round(v) + '%');
const fmtDate = (t: string) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const pill = (bg: string, fg: string) => sx(`display:inline-flex;align-items:center;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:${bg};color:${fg}`);
const REASON_CODE: Record<string, string> = Object.fromEntries(R.REJECT.map(([c, l]) => [l, c]));
const MIN = 3;
const verdictPill = (v: string) => (v === 'Satisfied' || v === 'Go to production' ? pill('var(--pos-lt)', 'var(--pos)') : v === 'Not satisfied' || v === 'Stop' ? pill('var(--neg-lt)', 'var(--neg)') : pill('var(--warn-lt)', 'var(--warn)'));

function badge(g: Pick<Gate, 'state' | 'n' | 'min'>): ReactNode {
  if (g.state === 'none') return <span style={pill('var(--s100)', 'var(--i3)')}>No data yet</span>;
  if (g.state === 'early') return <span style={pill('var(--s100)', 'var(--i2)')}>{gateLabel(g)}</span>;
  return g.state === 'met' ? <span style={pill('var(--pos-lt)', 'var(--pos)')}>On track</span> : <span style={pill('var(--neg-lt)', 'var(--neg)')}>Below the threshold</span>;
}
function stateBadge(state: GateState | null, label: string | null): ReactNode {
  if (!state || !label) return <span style={pill('var(--s100)', 'var(--i3)')}>No threshold: judged by the validator</span>;
  const [bg, fg] = state === 'met' ? ['var(--pos-lt)', 'var(--pos)'] : state === 'below' ? ['var(--neg-lt)', 'var(--neg)'] : ['var(--s100)', 'var(--i2)'];
  return <span style={pill(bg, fg)}>{label}</span>;
}
const arow = (key: string, label: ReactNode, val: ReactNode, sub?: ReactNode) => <div key={key} style={sx('display:flex;align-items:baseline;gap:12px;padding:7px 0;border-bottom:1px solid var(--s75);font-size:12px')}>
  <span style={sx('flex:1;color:var(--i2)')}>{label}{sub ? <span style={sx('display:block;font-size:10.5px;color:var(--i3)')}>{sub}</span> : null}</span><span style={sx('color:var(--i1);font-weight:600;text-align:right')}>{val}</span></div>;
const apanel = (title: ReactNode, right: ReactNode, body: ReactNode, key?: string) => <div key={key} className="panel" style={sx('margin-bottom:16px')}><div className="panel-hdr"><span className="panel-ttl">{title}</span>{right}</div><div className="panel-body">{body}</div></div>;
const two = (a: ReactNode, b: ReactNode) => <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>{a}{b}</div>;
const bar = (key: string, label: string, n: number, total: number, color: string) => <div key={key} className="dim-row"><span className="dim-lbl" style={sx('width:150px;flex-shrink:0')}>{label}</span>
  <div className="dim-track"><div className="dim-fill" style={sx(`width:${total ? Math.round(n / total * 100) : 0}%;background:${color}`)} /></div><span className="dim-val">{n}</span></div>;
const none = (t: string) => <div style={sx('font-size:12px;color:var(--i3)')}>{t}</div>;
const note = (t: ReactNode) => <div style={sx('font-size:10.5px;color:var(--i3);margin-top:8px;padding-top:8px;border-top:1px solid var(--s75);line-height:1.5')}>{t}</div>;
const mini = (head: string[], rows: ReactNode[][]) => <table style={sx('width:100%;border-collapse:collapse;font-size:12px')}><tbody>
  <tr style={sx('color:var(--i3);font-size:10px;text-transform:uppercase;letter-spacing:.06em')}>{head.map((h, i) => <td key={h} style={sx(`padding:6px 0;${i ? 'text-align:right' : ''}`)}>{h}</td>)}</tr>
  {rows.length ? rows.map((r, j) => <tr key={j} style={sx('border-top:1px solid var(--s75)')}>{r.map((c, i) => <td key={i} style={sx(`padding:8px 0;${i ? 'text-align:right' : ''}`)}>{c}</td>)}</tr>)
    : <tr><td colSpan={head.length} style={sx('padding:10px 0;color:var(--i3)')}>Nothing yet.</td></tr>}</tbody></table>;
const flag = (t: string, tone: 'g' | 'w' | '') => <span style={pill(tone === 'g' ? 'var(--pos-lt)' : tone === 'w' ? 'var(--warn-lt)' : 'var(--s100)', tone === 'g' ? 'var(--pos)' : tone === 'w' ? 'var(--warn)' : 'var(--i3)')}>{t}</span>;

/** The Markdown the server built, shown as the original page rendered it (headings, bullets, sub-bullets, text). */
function markdown(text: string): ReactNode {
  return text.split('\n').map((l, i) => l.startsWith('# ') ? <div key={i} style={sx('font-family:var(--fd);font-size:18px;font-weight:700;color:var(--i1);margin-bottom:4px')}>{l.slice(2)}</div>
    : l.startsWith('## ') ? <div key={i} style={sx('font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--brand);margin:16px 0 6px')}>{l.slice(3)}</div>
      : l.startsWith('  - ') ? <div key={i} style={sx('font-size:12.5px;color:var(--i2);padding:2px 0 2px 28px')}>· {l.slice(4)}</div>
        : l.startsWith('- ') ? <div key={i} style={sx('font-size:12.5px;color:var(--i1);padding:3px 0 3px 12px')}>· {l.slice(2)}</div>
          : l ? <div key={i} style={sx('font-size:12px;color:var(--i3)')}>{l}</div> : null);
}

const tabOf = (t: string | undefined): Tab => (TABS.some(([k]) => k === t) ? t as Tab : 'areas');

export function AnalyticsScreen({ initialTab }: { initialTab?: string }) {
  const me = useSessionUser();
  const [tab, setTab] = useState<Tab>(() => tabOf(initialTab));
  const [rep, setRep] = useState('');
  const [week, setWeek] = useState('');
  const [data, setData] = useState<{ key: string; body: unknown } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [log, setLog] = useState<{ rows: Log[]; next: number | null } | null>(null);
  const [logKind, setLogKind] = useState('all');
  const [logQ, setLogQ] = useState('');
  const [form, setForm] = useState<Record<string, string | boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<string, { verdict: string; note: string }>>({});
  const [signing, setSigning] = useState<string | null>(null);

  const key = `${tab}|${rep}|${week}|${tick}`;
  useEffect(() => {
    let gone = false;
    if (tab === 'log') {
      api<{ rows: Log[]; next: number | null }>(`/api/decision-log?limit=200${logQ ? `&q=${encodeURIComponent(logQ)}` : ''}`)
        .then(r => { if (!gone) { setLog(r); setLoadError(''); } }, err => { if (!gone) setLoadError(errorText(err)); });
      return () => { gone = true; };
    }
    const qs = new URLSearchParams();
    if (rep && tab !== 'validation') qs.set('rep', rep);
    if (tab === 'weekly' && week) qs.set('week', week);
    api(`/api/analytics/${ENDPOINT[tab]}${qs.toString() ? '?' + qs : ''}`).then(body => {
      if (gone) return;
      setData({ key, body }); setLoadError('');
      if (tab === 'validation') setForm(null);
    }, err => { if (!gone) setLoadError(errorText(err)); });
    return () => { gone = true; };
  }, [tab, rep, week, tick, logQ, key]);

  function pick(t: Tab) {
    setTab(t); setData(null);
    try { history.replaceState(null, '', `${window.location.pathname}?tab=${t}`); } catch { /* keep the address */ }
  }
  const body = <T,>() => (data && data.key === key ? data.body as T : null);

  function repFilter(d: Lens | null, extra?: ReactNode): ReactNode {
    return <div style={sx('display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap')}>
      {d?.manager ? <><label htmlFor="anRep" style={sx('font-size:12px;color:var(--i2)')}>Rep</label>
        <select id="anRep" value={rep} onChange={e => { setRep(e.target.value); setData(null); }} style={sx('padding:6px 9px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px')}>
          <option value="">Everyone</option>{(d.reps || []).map((r, _i, all) => <option key={r.email} value={r.email}>{all.filter(x => x.name === r.name).length > 1 ? `${r.name} (${r.email})` : r.name}</option>)}</select></>
        : <span style={sx('font-size:12px;color:var(--i2)')}>{d?.viewer ? 'The unit’s results · aggregates only' : `Your results · ${me.displayName}`}</span>}
      {extra}</div>;
  }
  const noData = () => <div className="panel"><div className="panel-body" style={sx('text-align:center;padding:30px')}>
    <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1)')}>No recommendations yet</div>
    <div style={sx('font-size:12px;color:var(--i3);margin-top:6px')}>The measures are worked out from real decisions. Build micro-segments, then decide in For Review.{' '}
      {!me.activeBusinessUnit || me.activeBusinessUnit.role !== 'Viewer' ? <Link href="/nba" style={sx('color:var(--brand);font-weight:600;text-decoration:none')}>Go to Micro-segments &amp; NBA →</Link> : null}</div></div></div>;

  /* ─── Readout sign-offs: a verdict per area, the sponsor's decision (Admin or Sales manager, D-27) ─── */
  async function sign(kind: string) {
    const f = verdicts[kind];
    if (!f?.verdict) { showToast(kind === 'sponsor' ? 'Choose a decision' : 'Choose a verdict'); return; }
    setSigning(kind);
    try {
      await api('/api/readout/signoffs', { body: { kind, verdict: f.verdict, note: f.note } });
      showToast(kind === 'sponsor' ? 'Decision recorded' : 'Verdict recorded');
      setVerdicts(v => { const n = { ...v }; delete n[kind]; return n; });
      setTick(t => t + 1);
    } catch (err) { showToast(errorText(err)); }
    finally { setSigning(null); }
  }
  function signForm(kind: string, options: readonly string[], cta: string, placeholder: string): ReactNode {
    const f = verdicts[kind] ?? { verdict: '', note: '' };
    const set = (patch: Partial<typeof f>) => setVerdicts(v => ({ ...v, [kind]: { ...f, ...patch } }));
    return <div style={sx('margin-top:8px')}>
      <div role="radiogroup" aria-label={cta}>{options.map(o => <label key={o} style={sx('display:inline-flex;align-items:center;gap:5px;margin-right:12px;font-size:12px;color:var(--i1);cursor:pointer')}>
        <input type="radio" name={`v_${kind}`} value={o} checked={f.verdict === o} onChange={() => set({ verdict: o })} style={sx('accent-color:var(--brand)')} />{o}</label>)}</div>
      <div style={sx('display:flex;gap:8px;margin-top:6px')}><input aria-label={`${cta}: note`} value={f.note} onChange={e => set({ note: e.target.value })} placeholder={placeholder} maxLength={1000}
        style={sx('flex:1;padding:6px 9px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px')} />
        <button className="btn btn-sec btn-sm" disabled={signing === kind} onClick={() => void sign(kind)}>{signing === kind ? 'Recording…' : cta}</button></div></div>;
  }

  /* ─── The six success areas ─── */
  function areasTab(d: Areas): ReactNode {
    if (!d.builds) return <>{repFilter(d)}{noData()}</>;
    return <>{repFilter(d, <span style={sx('font-size:11px;color:var(--i3);margin-left:auto')}>Judged by Config v{d.configVersion ?? '—'}</span>)}
      <div style={sx('font-size:12px;color:var(--i2);margin-bottom:14px;line-height:1.55;max-width:900px')}>What the pilot set out to show, area by area, with the evidence measured so far. Where an agreed level exists the area says whether it is met; every area is judged by its validator in the pilot readout.</div>
      <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>{d.areas.map((a, i) =>
        <div key={a.key} className="panel"><div className="panel-hdr"><span className="panel-ttl">{i + 1} · {a.title}</span>{stateBadge(a.state, a.stateLabel)}</div><div className="panel-body">
          <div style={sx('font-size:12px;color:var(--i3);margin-bottom:6px')}>{a.question}</div>
          {a.evidence.map(e => e.value.length > 28 ? <div key={e.label} style={sx('padding:7px 0;border-bottom:1px solid var(--s75);font-size:12px')}>
            <div style={sx('color:var(--i2)')}>{e.label}</div><div style={sx('color:var(--i1);font-weight:600;margin-top:2px')}>{e.value}</div>{e.sub ? <div style={sx('font-size:10.5px;color:var(--i3)')}>{e.sub}</div> : null}</div>
            : arow(e.label, e.label, e.value, e.sub))}
          <div style={sx('margin-top:10px')}><a href={`?tab=${a.tab}`} onClick={ev => { ev.preventDefault(); pick(a.tab as Tab); }} style={sx('font-size:11.5px;color:var(--brand);font-weight:600;text-decoration:none')}>See the detail →</a></div>
          {(() => {
            const v = d.verdicts[a.key], earlier = (d.history[a.key] || []).length - 1;
            return <div style={sx('margin-top:12px;padding-top:10px;border-top:1px solid var(--border)')}>
              <div style={sx('display:flex;align-items:center;gap:8px')}><span className="stat-lbl" style={sx('margin:0')}>Validator verdict</span>
                {v ? <span style={verdictPill(v.verdict)}>{v.verdict}</span> : <span style={pill('var(--s100)', 'var(--i3)')}>Not yet judged</span>}</div>
              {v ? <div style={sx('font-size:11px;color:var(--i3);margin-top:4px')}>{v.by} ({v.role}), {fmtDate(v.at)}{v.note ? ` · ${v.note}` : ''}{earlier > 0 ? ` · ${earlier} earlier verdict${earlier === 1 ? '' : 's'} kept` : ''}</div> : null}
              {d.canSign ? signForm(a.key, AREA_VERDICTS, v ? 'Record a new verdict' : 'Record the verdict', 'What the validator found') : null}
            </div>;
          })()}
        </div></div>)}</div></>;
  }

  /* ─── Success gates ─── */
  function gatesTab(d: Gates): ReactNode {
    if (!d.builds) return <>{repFilter(d)}{noData()}</>;
    const m = d.measure, { g1, g2 } = d.gates;
    const rej = Object.entries(m.reasons).sort((a, b) => b[1] - a[1]), rejTotal = rej.reduce((t, x) => t + x[1], 0);
    const decided = m.edits.none + m.edits.minor + m.edits.major + rejTotal, total = m.autoN + m.excN;
    return <>
      {repFilter(d, <span style={sx('font-size:11px;color:var(--i3)')}>{m.items} recommendation{m.items === 1 ? '' : 's'} · {m.autoN} proceeded · {m.excN} exceptions</span>)}
      <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px')}>
        <div className="panel"><div className="panel-hdr"><span className="panel-ttl">G1 · Reduced human effort</span>{badge(g1)}</div><div className="panel-body">
          <div style={sx('font-family:var(--fd);font-size:30px;font-weight:700;color:var(--i1);margin-bottom:4px')}>{g1.value === null ? '—' : Math.round(g1.value) + '% less'}</div>
          <div style={sx('font-size:11.5px;color:var(--i3)')}>{m.minutes === null ? 'No usable first actions yet' : g1.value === null ? `No decisions yet; the baseline is ${m.base} min` : `${Math.round(m.minutes * 10) / 10} min of review per usable first action, against a baseline of ${m.base} min`} · threshold {d.settings.g1Threshold}% less</div></div></div>
        <div className="panel"><div className="panel-hdr"><span className="panel-ttl">G2 · Recommendation acceptance</span>{badge(g2)}</div><div className="panel-body">
          <div style={sx('font-family:var(--fd);font-size:30px;font-weight:700;color:var(--i1);margin-bottom:4px')}>{pct0(m.weighted)}</div>
          <div style={sx('font-size:11.5px;color:var(--i3)')}>accepted on first pass, weighted across both paths{m.partial && m.weighted !== null ? ' (only one path has decisions so far)' : ''} · threshold {d.settings.g2Threshold}%</div></div></div>
      </div>
      {two(apanel('G2 · the working', null, <>
        {arow('a', 'Proceeded path (weekly spot-check)', `${pct0(m.auto.pct)} · ${m.auto.a} of ${m.auto.n} rated · ${m.autoN} items`)}
        {arow('e', 'Exception path (decided in the queue)', `${pct0(m.exc.pct)} · ${m.exc.a} of ${m.exc.n} decided · ${m.excN} items`)}
        {arow('w', 'Weighted', m.auto.pct !== null && m.exc.pct !== null ? <>{pct0(m.auto.pct)} × {m.autoN}/{total} + {pct0(m.exc.pct)} × {m.excN}/{total} = <b>{pct0(m.weighted)}</b></> : pct0(m.weighted))}
        {arow('p', 'Pooled, for comparison', `${pct0(m.pooled.pct)} · ${m.pooled.a} of ${m.pooled.n}`)}
        {arow('l', 'Within one alternative', `${pct0(m.alternatives.pct)} · ${m.alternatives.a} of ${m.alternatives.n}`)}
        {note(`First-pass decisions only: an alternative accepted after a rejection is shown separately. Pooling lets the few hard exceptions weigh as much as the many items that proceeded, so the headline is weighted by how many items took each path. Below ${d.settings.minDecisions} counted decisions a gate is too early to call.`)}</>),
      apanel('How it was decided', null, <>
        {bar('n', 'Accepted as it is', m.edits.none, decided, 'var(--pos)')}{bar('m', 'Minor edit', m.edits.minor, decided, 'var(--sec)')}{bar('j', 'Major edit', m.edits.major, decided, 'var(--warn)')}{bar('r', 'Rejected', rejTotal, decided, 'var(--neg)')}
        {arow('f', 'Flagged, waiting for a check', m.flagged)}{arow('i', 'Interventions on items that proceeded', m.interventions)}
        {note('Decisions under 5 seconds or in a long run of identical ones count only once a manager has checked them. Interventions are an early warning on the automatic path.')}</>))}
      {two(apanel('Rejection reasons', null, <>
        {rej.length ? rej.map(([k, n]) => bar(k, k, n, rejTotal, 'var(--s300)')) : none('No rejections yet.')}
        <div style={sx('font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin:12px 0 4px')}>By cause</div>
        {arow('d', "Gaps in the Client's data", m.causes.data)}{arow('s', "The system's own judgement", m.causes.system)}{arow('o', 'Other', m.causes.other)}{arow('c', 'Compliance: sent back by the sales manager', m.compliance)}</>),
      apanel('What happened next', null, <>{arow('rel', 'Released, ready to use', m.released)}{R.OUTCOMES.map(o => arow(o, o, m.outcomes[o] || 0))}
        {note('Reps mark the outcome on Today or Micro-segments & NBA; there is no CRM link in the pilot to tell us.')}</>))}
    </>;
  }

  /* ─── Work-done funnel ─── */
  function funnelTab(d: Funnel): ReactNode {
    if (!d.builds) return <>{repFilter(d)}{noData()}</>;
    const st = d.stages, max = Math.max(1, ...st.map(s => s.n));
    return <>{repFilter(d)}
      <div className="panel"><div className="panel-body" style={sx('padding:18px 22px')}>{st.map((s, i) => {
        const base = s.of !== undefined ? st[s.of] : null, share = base && base.n ? Math.round(s.n / base.n * 100) : null;
        // With several builds an account can have a recommendation in each, so a share can pass 100%: say so instead.
        const lbl = share !== null ? (share > 100 ? `${s.n} across ${d.builds} builds, against ${base!.n} ${base!.k.toLowerCase()}` : `${share}% of ${base!.k.toLowerCase()}`)
          : s.note || (s.nobase ? 'decisions on exceptions, spot-checks and alternatives' : '');
        return <div key={s.k}>{i ? <div style={sx('display:flex;align-items:center;gap:8px;padding:2px 0 2px 22px;font-size:10.5px;color:var(--i3)')}><span style={sx('font-size:13px;color:var(--i4)')}>↓</span>{lbl}</div> : null}
          <div style={sx('display:grid;grid-template-columns:220px 1fr 70px;gap:14px;align-items:center;padding:6px 0')}>
            <div><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>{i + 1} · {s.k}</div><div style={sx('font-size:10.5px;color:var(--i3);margin-top:2px')}>{s.sub}</div></div>
            <div style={sx('height:12px;background:var(--s75);border-radius:6px;overflow:hidden')}><div style={sx(`height:100%;width:${Math.max(2, s.n / max * 100)}%;background:${s.nobase ? 'var(--sec)' : 'var(--brand)'};border-radius:6px`)} /></div>
            <div style={sx('font-family:var(--fd);font-size:17px;font-weight:700;color:var(--i1);text-align:right')}>{s.n}</div></div></div>;
      })}</div></div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:8px')}>Every stage of the process, counted from the stored lists, runs and builds and the decision log; each stage as a share of the stage it comes from.</div></>;
  }

  /* ─── Supporting evidence ─── */
  function evidenceTab(d: Evidence): ReactNode {
    if (!d.builds) return <>{repFilter(d)}{noData()}</>;
    const reviewed = d.byTier.some(x => x.judged);
    const sec = (v: number | null) => (v === null ? '—' : v);
    return <>{repFilter(d)}
      {apanel('Prioritisation accuracy', <span style={sx('font-size:10.5px;color:var(--i3)')}>if reviewed</span>, <>
        {mini(['Tier', 'Recommendations', 'Judged', 'Accepted', 'Replied', 'Meetings'], d.byTier.map(x => [<b key="t">Tier {x.tier}</b>, x.n, x.judged, <b key="a">{x.judged ? pct0(x.accepted / x.judged * 100) : '—'}</b>, x.replies, x.meetings]))}
        <div style={sx(`font-size:11.5px;color:${!reviewed ? 'var(--i3)' : d.ordered ? 'var(--pos)' : 'var(--warn)'};margin-top:10px`)}>{!reviewed ? 'Not reviewed yet: shown once people have judged recommendations.' : d.ordered ? 'Higher tiers are accepted at least as often as lower ones: the ranking holds.' : 'A lower tier is accepted more often than a higher one: the rubric or the signal weights need a look.'}</div></>)}
      {two(apanel('Rejection reasons and codes', null, d.reasons.length ? d.reasons.map(r => arow(r.reason, <><b style={sx('font-family:var(--fm);font-size:11px;color:var(--i3);margin-right:6px')}>{r.code}</b>{r.reason}</>, r.n,
        r.cause === 'data' ? "Gap in the Client's data" : r.cause === 'system' ? "The system's judgement" : '')) : none('No rejections yet.')),
      apanel('Acceptance', null, <>{arow('as', 'Accepted as it is', d.edits.none)}{arow('mi', 'Minor edit', d.edits.minor, 'Wording, tone or length only')}{arow('ma', 'Major edit', d.edits.major, 'Facts, the ask, the action or the person changed')}
        <div style={sx('font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin:12px 0 4px')}>Quick tags</div>
        {d.tags.length ? d.tags.map(t => arow(t.tag, t.tag, t.n)) : none('No tags yet.')}</>))}
      {two(apanel('Data-quality reasons', null, d.dq.length ? d.dq.map(x => arow(x.label, x.label || 'No code', x.n)) : none('No data-quality issues in the signal files.')),
        apanel('Decision time', <span style={sx('font-size:10.5px;color:var(--i3)')}>median seconds</span>, <>{arow('e', 'Exceptions', sec(d.seconds.exception))}{arow('s', 'Spot-checks', sec(d.seconds.spot))}{arow('a', 'Alternatives', sec(d.seconds.alternative))}{arow('all', 'All decisions', sec(d.seconds.all))}</>))}</>;
  }

  /* ─── Weekly summary ─── */
  function weeklyTab(d: Weekly): ReactNode {
    if (!d.builds) return <>{repFilter(d)}{noData()}</>;
    const qs = new URLSearchParams({ week: d.week, ...(rep ? { rep } : {}) });
    const list = (xs: { k: string; n: number }[]) => (xs.length ? xs.map(x => arow(x.k, x.k, x.n)) : none('None this week.'));
    return <>{repFilter(d, <><label htmlFor="anWeek" style={sx('font-size:12px;color:var(--i2);margin-left:10px')}>Week</label>
      <select id="anWeek" value={d.week} onChange={e => { setWeek(e.target.value); setData(null); }} style={sx('padding:6px 9px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px')}>{d.weeks.map(w => <option key={w}>{w}</option>)}</select>
      <a className="btn btn-primary btn-sm" style={sx('margin-left:auto;text-decoration:none')} href={`/api/analytics/weekly.md?${qs}`} download>Download the report (.md)</a></>)}
      {apanel(`Week ${d.week} · for the business-unit lead`, d.previous ? <span style={sx('font-size:10.5px;color:var(--i3)')}>compared with {d.previous}</span> : null,
        d.rows.map(([k, v], i) => arow(k, k, v, d.previousRows ? `last week: ${d.previousRows[i][1]}` : '')))}
      {two(apanel('Why items went to a person', null, list(d.exceptions)), apanel('Rejection reasons', null, list(d.reasons)))}</>;
  }

  /* ─── Pilot readout ─── */
  function readoutTab(d: Readout): ReactNode {
    if (!d.builds) return <>{repFilter(d)}{noData()}</>;
    return <>{repFilter(d, <a className="btn btn-primary btn-sm" style={sx('margin-left:auto;text-decoration:none')} href={`/api/analytics/readout.md${rep ? `?rep=${encodeURIComponent(rep)}` : ''}`} download>Download the readout (.md)</a>)}
      <div className="panel" style={sx('margin-bottom:16px')}><div className="panel-body" style={sx('padding:20px 24px')}>{markdown(d.text)}</div></div>
      {apanel('The sponsor decides on production', d.sponsor ? <span style={verdictPill(d.sponsor.verdict)}>{d.sponsor.verdict} · {d.sponsor.by}</span> : null, <>
        <div style={sx('font-size:12px;color:var(--i2);margin-bottom:6px;line-height:1.5')}>Once the validators have judged each area (Success areas tab), the sponsor decides with the gates, the evidence and their verdicts in front of them. {Object.keys(d.verdicts).filter(k => k !== 'sponsor').length} of 6 areas judged so far.</div>
        {d.sponsor ? <div style={sx('font-size:11px;color:var(--i3);margin-bottom:6px')}>{d.sponsor.by} ({d.sponsor.role}), {fmtDate(d.sponsor.at)}{d.sponsor.note ? ` · ${d.sponsor.note}` : ''}</div> : null}
        {d.canDecide ? signForm('sponsor', SPONSOR_DECISIONS, d.sponsor ? 'Record a new decision' : 'Record the decision', 'Reasons and conditions')
          : <div style={sx('font-size:11px;color:var(--i3)')}>Recorded by an Admin or the sales manager.</div>}</>)}</>;
  }

  /* ─── Decision log ─── */
  function logTab(): ReactNode {
    if (!log) return <div style={sx('font-size:12.5px;color:var(--i3)')}>Loading…</div>;
    const kinds: [string, string][] = [['all', 'Everything'], ['decisions', 'Decisions'], ['auto', 'Automatic'], ['outcomes', 'Outcomes'], ['other', 'Changes']];
    const isOut = (l: Log) => /^Outcome/.test(l.decision), isAuto = (l: Log) => l.kind === 'system';
    let ls = log.rows;
    if (logKind === 'decisions') ls = ls.filter(l => l.decisive || /^Approved and released|^Sent back/.test(l.decision));
    else if (logKind === 'auto') ls = ls.filter(isAuto);
    else if (logKind === 'outcomes') ls = ls.filter(isOut);
    else if (logKind === 'other') ls = ls.filter(l => !l.decisive && !isAuto(l) && !isOut(l));
    const tone = (t: string) => (/^Accepted|^Approved/.test(t) ? 'tag-green' : /^Rejected|^Sent back/.test(t) ? 'tag-red' : /^Outcome/.test(t) ? 'tag-violet' : /^Proceeded|^Went ahead/.test(t) ? 'tag-blue' : 'tag-grey');
    return <>
      <div style={sx('display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap')}>
        <span style={sx('font-size:12px;color:var(--i2)')}>{me.activeBusinessUnit?.role === 'Sales rep' ? 'The decisions you made' : 'Everyone’s decisions, and what the system did'}</span>
        <div style={sx('margin-left:auto;display:flex;gap:8px;align-items:center')}>
          <div role="tablist" style={sx('display:inline-flex;background:var(--s75);border-radius:999px;padding:3px')}>{kinds.map(([k, l]) => <button key={k} role="tab" aria-selected={logKind === k} onClick={() => setLogKind(k)}
            style={sx(`padding:5px 11px;border-radius:999px;font-size:11.5px;font-weight:600;${logKind === k ? 'background:var(--surf);color:var(--i1);box-shadow:var(--sh)' : 'color:var(--i3)'}`)}>{l}</button>)}</div>
          <input aria-label="Search the log" placeholder="Search…" defaultValue={logQ} onKeyDown={e => { if (e.key === 'Enter') setLogQ((e.target as HTMLInputElement).value.trim()); }}
            onBlur={e => setLogQ(e.target.value.trim())} style={sx('padding:6px 9px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12px;width:160px')} />
          <a className="btn btn-sec btn-sm" href="/api/exports/decision-log.csv" download style={sx('text-decoration:none')}>Download (.csv)</a></div></div>
      <div className="panel"><div className="panel-body" style={sx('padding:0')}>
        {ls.length ? ls.map(l => <div key={l.id} style={sx('display:grid;grid-template-columns:120px 130px 1fr 1.2fr;gap:12px;padding:9px 14px;border-bottom:1px solid var(--s75);font-size:12px;align-items:start')}>
          <div style={sx('color:var(--i3)')}>{fmtDate(l.at)}<div style={sx('font-size:10.5px')}>{new Date(l.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}{l.seconds !== null ? ` · ${l.seconds}s` : ''}</div></div>
          <div style={sx('color:var(--i1)')}>{l.who}<div style={sx('font-size:10.5px;color:var(--i3)')}>{l.role}</div></div>
          <div><span className={`tag ${tone(l.decision)}`}>{l.decision}</span><div style={sx('color:var(--i2);margin-top:3px')}>{l.prospect} · {l.company}</div></div>
          <div style={sx('color:var(--i2)')}>{l.action}<div style={sx('font-size:10.5px;color:var(--i3)')}>{[l.reason && REASON_CODE[l.reason] ? `${REASON_CODE[l.reason]} ${l.reason}` : '', l.tags.join(', '), l.note, l.flag ? `${l.flag}${l.checked ? ' (checked)' : ''}` : ''].filter(Boolean).join(' · ')}</div></div>
        </div>) : <div style={sx('padding:24px;text-align:center;font-size:12px;color:var(--i3)')}>Nothing matches.</div>}
        {log.next ? <div style={sx('padding:10px 14px;font-size:11px;color:var(--i3)')}>Showing the newest 200; the download has them all.</div> : null}
      </div></div></>;
  }

  /* ─── Learning loop ─── */
  function loopTab(d: Loop): ReactNode {
    if (!d.builds) return <>{repFilter(d)}{noData()}</>;
    const all = d.allRate;
    return <>{repFilter(d, d.records ? <a className="btn btn-primary btn-sm" style={sx('margin-left:auto;text-decoration:none')} href={`/api/exports/outcome-log.csv${rep ? `?rep=${encodeURIComponent(rep)}` : ''}`} download>Download the outcome log (.csv)</a> : null)}
      <div style={sx('display:flex;gap:14px;align-items:flex-start;padding:14px 16px;background:var(--brand-lt);border-radius:var(--rmd);margin-bottom:16px')}>
        <div style={sx('flex:1;font-size:12.5px;color:var(--i1);line-height:1.6')}><b>In the pilot the loop records; in production it learns.</b> Every recommendation keeps a full record. Nothing here changes the scoring or the actions during the pilot: the only immediate change is the one alternative after a rejection, for that account alone. The tables show the evidence production starts from, as proposals only.</div>
        <div style={sx('text-align:right;flex-shrink:0;font-size:11px;color:var(--i2)')}>Config v{d.configVersion ?? '—'}<div style={sx('color:var(--i3)')}>{d.complete} of {d.total} records complete</div></div></div>
      {d.records ? apanel('8.1 Outcome log · one record per recommendation', <span style={sx('font-size:10.5px;color:var(--i3)')}>{d.total} records{d.total > d.records.length ? ` · the first ${d.records.length} shown, the download has them all` : ''}</span>,
        <div style={sx('overflow-x:auto')}><table style={sx('width:100%;border-collapse:collapse;font-size:11.5px;min-width:980px')}><tbody>
          <tr style={sx('color:var(--i3);font-size:10px;text-transform:uppercase;letter-spacing:.06em')}>{['Account · micro-segment', 'Signals behind it', 'Action · contact · channel', 'Decision', 'Alternative', 'Outcome', 'Config'].map(h => <td key={h} style={sx('padding:6px 8px 6px 0')}>{h}</td>)}</tr>
          {d.records.map((o, i) => <tr key={i} style={sx('border-top:1px solid var(--s75);vertical-align:top')}>
            <td style={sx('padding:8px 8px 8px 0')}><b style={sx('color:var(--i1)')}>{o.account}</b><div style={sx('color:var(--i3)')}>{o.segment} · tier {o.tier}</div></td>
            <td style={sx('padding:8px 8px 8px 0;color:var(--i2)')}>{o.signals.join(', ')}</td>
            <td style={sx('padding:8px 8px 8px 0;color:var(--i1)')}>{o.action}<div style={sx('color:var(--i3)')}>{o.contact} · {o.channel}</div></td>
            <td style={sx('padding:8px 8px 8px 0;color:var(--i1)')}>{o.decision}{o.reasonCode ? <div style={sx('color:var(--i3)')}>{o.reasonCode} {o.reason}</div> : null}{o.tags ? <div style={sx('color:var(--i3)')}>{o.tags}</div> : null}</td>
            <td style={sx('padding:8px 8px 8px 0;color:var(--i2)')}>{o.alternativeNeeded ? (o.alternativeAccepted === null ? 'Needed, not decided' : o.alternativeAccepted ? 'Needed, accepted' : 'Needed, rejected') : '—'}</td>
            <td style={sx('padding:8px 8px 8px 0;color:var(--i2)')}>{o.outcome || '—'}</td>
            <td style={sx('padding:8px 0;color:var(--i3);font-size:10.5px')}>{o.config}<div>{o.brand}</div></td></tr>)}</tbody></table></div>)
        : <div style={sx('font-size:12px;color:var(--i3);margin-bottom:16px')}>The record per recommendation names accounts and contacts, so it isn&apos;t shown to viewers; the tables below are the aggregates.</div>}
      {apanel('Which actions worked in which segments', <span style={sx('font-size:10.5px;color:var(--i3)')}>production: preferred actions (8.2)</span>, <>
        {mini(['Micro-segment · action', 'Recommended', 'Judged', 'Accepted', 'Replies or meetings', ''], d.actions.map(x => [x.k, x.n, x.j, x.rate === null ? '—' : pct0(x.rate), x.w,
          x.j >= MIN && (x.rate ?? 0) >= 70 && x.w ? flag('Preferred-action candidate', 'g') : x.j < MIN ? flag(`Needs ${MIN}+ judged`, '') : '']))}
        <div style={sx('font-size:11px;color:var(--i3);margin-top:8px')}>In production, an action that keeps being accepted in a segment and keeps leading to replies or meetings becomes the preferred action there.</div></>)}
      {apanel('Segments that keep getting rejected', <span style={sx('font-size:10.5px;color:var(--i3)')}>production: self-correction (8.3)</span>, <>
        {mini(['Micro-segment', 'Judged', 'Accepted', 'Most common rejection', ''], d.segments.map(x => [x.k, x.j, x.rate === null ? '—' : pct0(x.rate), x.top ? `${x.top.reason} (${x.top.n})` : '—',
          x.j >= MIN && x.rate !== null && x.rate < 50 ? flag('Would be paused for review', 'w') : '']))}
        <div style={sx('font-size:11px;color:var(--i3);margin-top:8px')}>In production, a segment that keeps being rejected is paused and sent for review with its reasons: &ldquo;wrong contact&rdquo; points at the persona order, &ldquo;wrong action&rdquo; at the action set.</div></>)}
      {two(apanel('Which signals sat behind accepted recommendations', <span style={sx('font-size:10.5px;color:var(--i3)')}>production: weights (8.4)</span>, <>
        {mini(['Signal', 'Judged', 'Accepted'], d.signals.map(x => [<>{x.k}{x.j >= MIN && all !== null && x.rate !== null && Math.abs(x.rate - all) >= 20 ? <> {flag(x.rate > all ? 'Review: weight up?' : 'Review: weight down?', x.rate > all ? 'g' : 'w')}</> : null}</>, x.j, x.rate === null ? '—' : pct0(x.rate)]))}
        <div style={sx('font-size:11px;color:var(--i3);margin-top:8px')}>Compared with {pct0(all)} overall.</div></>),
      apanel('Which fit criteria sat behind them', null, <>{mini(['Group', 'Judged', 'Accepted'], d.fit.map(x => [x.k, x.j, x.rate === null ? '—' : pct0(x.rate)]))}
        <div style={sx('font-size:11px;color:var(--i3);margin-top:8px')}>&ldquo;Wrong fit&rdquo; and &ldquo;signal too weak&rdquo; rejections point straight at the scoring.</div></>))}
      {apanel('Pilot versus production', null, mini(['Step', 'In the pilot', 'In production'], [
        ['Outcome log', 'Every decision, reason, tag and outcome recorded, with the configuration version', 'The same, plus outcomes read automatically from the Client’s tools'],
        ['Rejection handling', 'One alternative per account, immediately', 'The same'], ['Preferred actions', 'Evidence only (above)', 'Accepted actions weighed first in each segment'],
        ['Self-correction', 'Evidence only (above)', 'Struggling segments paused and reviewed'],
        ['Weight recalibration', 'Weights stay fixed, so the baseline holds', 'Weights tuned from evidence, with the sales manager’s sign-off; a new configuration version, the old one kept'],
      ]))}</>;
  }

  /* ─── Validation ─── */
  function validationTab(d: Validation): ReactNode {
    const s = d.settings, edit = d.canEdit;
    const f = form ?? { g1BaselineMinutes: String(s.g1BaselineMinutes), g1BaselineTimed: s.g1BaselineTimed, g1Threshold: String(s.g1Threshold), g2Threshold: String(s.g2Threshold),
      minDecisions: String(s.minDecisions), spotCheckShare: String(Math.round(s.spotCheckShare * 100)) };
    const set = (k: string, v: string | boolean) => setForm({ ...f, [k]: v });
    const inp = (k: string, unit: string, label: string) => edit ? <><input id={`v_${k}`} aria-label={label} type="number" value={String(f[k])} onChange={e => set(k, e.target.value)}
      style={sx('width:84px;padding:5px 8px;border:1px solid var(--bdk);border-radius:6px;font-size:12px;text-align:right')} /> <span style={sx('color:var(--i3);font-size:11px')}>{unit}</span></> : <>{String(f[k])} {unit}</>;
    const gate = (title: string, rows: [string, ReactNode][]) => apanel(title, null, rows.map(([k, v]) => <div key={k} style={sx('display:grid;grid-template-columns:110px 1fr;gap:12px;padding:8px 0;border-bottom:1px solid var(--s75);font-size:12px;align-items:baseline')}>
      <span style={sx('color:var(--i3)')}>{k}</span><span style={sx('color:var(--i1);line-height:1.5')}>{v}</span></div>));
    async function save() {
      const n = (k: string) => Number(f[k]);
      setSaving(true);
      try {
        const r = await api<{ versionNo: number; changes: string[] }>('/api/analytics/validation', { method: 'PATCH', body: { g1BaselineMinutes: n('g1BaselineMinutes'), g1BaselineTimed: !!f.g1BaselineTimed,
          g1Threshold: n('g1Threshold'), g2Threshold: n('g2Threshold'), minDecisions: n('minDecisions'), spotCheckShare: n('spotCheckShare') / 100 } });
        showToast(`Saved as Config v${r.versionNo}: ${r.changes.join('; ')}`);
        setForm(null); setTick(t => t + 1);
      } catch (err) { showToast(errorText(err)); }
      finally { setSaving(false); }
    }
    const pillFor = (v: string) => (v === 'Sufficient' ? pill('var(--pos-lt)', 'var(--pos)') : v === 'Sufficient with gaps' ? pill('var(--warn-lt)', 'var(--warn)') : pill('var(--neg-lt)', 'var(--neg)'));
    return <>
      {two(gate('G1 · Reduced human effort', [
        ['Method', 'Minutes people spend per usable first action: review time in the exception queue plus spot-check time, divided by the recommendations released ready to use.'],
        ['Baseline', <>{inp('g1BaselineMinutes', 'min per first action', 'G1 baseline in minutes')}
          <label style={sx('display:flex;align-items:center;gap:6px;font-size:11px;color:var(--i2);margin-top:6px')}><input type="checkbox" checked={!!f.g1BaselineTimed} disabled={!edit} onChange={e => set('g1BaselineTimed', e.target.checked)} />Timed by the Client on the same data</label></>],
        ['Sample', d.builds ? `${d.sample.released} usable first actions; ${d.sample.minutes} min of review` : 'No data yet'],
        ['Threshold', inp('g1Threshold', '% less than the baseline', 'G1 threshold')],
      ]), gate('G2 · Recommendation acceptance', [
        ['Method', 'Share accepted on first pass (as it is or edited) among recommendations a person judged: every exception decided in the queue plus the weekly spot-check of items that proceeded. The two paths are weighted by how many items took each.'],
        ['Baseline', 'None: acceptance is measured directly.'],
        ['Sample', <>{d.builds ? `${d.sample.exceptions} exception decisions and ${d.sample.spotChecks} spot-checks; ` : ''}spot-check share {inp('spotCheckShare', '% of proceeded items, weekly', 'Spot-check share')}</>],
        ['Threshold', inp('g2Threshold', '% accepted', 'G2 threshold')],
      ]))}
      {apanel('Counting rules', null, <>
        {arow('min', 'A gate is too early to call below', inp('minDecisions', 'decisions', 'Too early to call below'))}
        {arow('first', 'First pass only', 'An alternative accepted after a rejection is reported as "within one alternative"')}
        {arow('check', 'Checked before counting', 'Decisions under 5 seconds or in a run of identical decisions')}
        {arow('deal', 'Proceed criteria: deal-size threshold', `${Math.round(d.dealThreshold / 1000)}k USD`, 'Fixed for the pilot: every build reads it')}
        {edit ? <><div style={sx('margin-top:12px;padding:9px 12px;background:var(--warn-lt);color:var(--warn);border-radius:var(--rsm);font-size:11.5px')}>Agree these at kickoff. Changing them during measurement moves the goalposts, so each change makes a new configuration version and is dated. The scoring weights can&apos;t be changed in the pilot.</div>
          <div style={sx('display:flex;justify-content:flex-end;gap:8px;margin-top:12px')}><button className="btn btn-sec btn-sm" disabled={!form || saving} onClick={() => setForm(null)}>Undo changes</button>
            <button className="btn btn-primary btn-sm" disabled={!form || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save as a new configuration version'}</button></div></>
          : <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>Set by the sales manager or an Admin.</div>}</>)}
      {apanel('Configuration versions', <span style={sx('font-size:11px;color:var(--i2)')}>Now: Config v{d.configVersion ?? '—'}</span>,
        d.versions.map(v => arow(String(v.versionNo), `v${v.versionNo} · ${v.changes.length ? v.changes.join('; ') : v.versionNo === 1 ? 'Starting values' : 'No recorded change'}`, v.activatedAt ? `${fmtDate(v.activatedAt)}${v.by ? ' · ' + v.by : ''}` : 'Kickoff')))}
      {d.readiness.length && d.verdict ? apanel('Data sufficiency · the readiness checks before measurement', <span style={pillFor(d.verdict)}>{d.verdict}</span>, <>
        {d.readiness.map(x => <div key={x.k} style={sx('display:grid;grid-template-columns:150px 150px 1fr 22px;gap:12px;padding:8px 0;border-bottom:1px solid var(--s75);font-size:12px;align-items:baseline')}>
          <b style={sx('color:var(--i1)')}>{x.k}</b><span style={sx('color:var(--i1)')}>{x.show}</span>
          <span style={sx('color:var(--i3)')}>{x.need}{!x.ok && x.fix ? <span style={sx('display:block;color:var(--warn);margin-top:2px')}>To close: {x.fix}</span> : null}</span>
          <span style={sx(`color:${x.ok ? 'var(--pos)' : 'var(--warn)'};font-weight:700`)} aria-label={x.ok ? 'passes' : 'gap'}>{x.ok ? '✓' : '!'}</span></div>)}
        <div style={sx('font-size:11px;color:var(--i3);margin-top:8px')}>The level for each check is agreed at kickoff. Measurement starts once the checks pass.</div></>)
        : <div style={sx('font-size:12px;color:var(--i3)')}>The readiness checks appear once micro-segments are built.</div>}
    </>;
  }

  function content(): ReactNode {
    if (loadError) return <div role="alert" style={sx('color:var(--neg);font-size:12.5px')}>{loadError}</div>;
    if (tab === 'log') return logTab();
    const loading = <div style={sx('font-size:12.5px;color:var(--i3)')}>Loading…</div>;
    switch (tab) {
      case 'areas': { const d = body<Areas>(); return d ? areasTab(d) : loading; }
      case 'gates': { const d = body<Gates>(); return d ? gatesTab(d) : loading; }
      case 'funnel': { const d = body<Funnel>(); return d ? funnelTab(d) : loading; }
      case 'evidence': { const d = body<Evidence>(); return d ? evidenceTab(d) : loading; }
      case 'weekly': { const d = body<Weekly>(); return d ? weeklyTab(d) : loading; }
      case 'readout': { const d = body<Readout>(); return d ? readoutTab(d) : loading; }
      case 'loop': { const d = body<Loop>(); return d ? loopTab(d) : loading; }
      case 'validation': { const d = body<Validation>(); return d ? validationTab(d) : loading; }
    }
  }

  const viewerRole = me.activeBusinessUnit?.role === 'Viewer';
  return <main className="main" id="mainArea">
    <div className="topbar"><div className="topbar-l"><span className="tb-title">Analytics</span><span className="tb-badge badge-neutral">From live decisions</span></div></div>
    <div className="ftabs" role="tablist">{TABS.filter(([k]) => !(viewerRole && k === 'log')).map(([k, l]) => <div key={k} role="tab" aria-selected={tab === k} className={'ftab' + (tab === k ? ' active' : '')} onClick={() => pick(k)}>{l}</div>)}</div>
    <div className="canvas">{content()}</div>
  </main>;
}
