'use client';

/* Setup (was legacy/09-setup.html), on the server (G-002, D-13). One screen, two modes: View shows what the scoring
   runs on; Edit (Admin) signs sections off and switches signal types, each change kept with who, when and why.
   The rubric, fit floor and personas are fixed for the pilot (D-13) and shown read-only. A signal switch, or a type
   added or removed, makes the next configuration version: new runs name it, runs already made keep theirs (G-023).
   The export is a real JSON file of the active version (it was a toast). */
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DemandAI } from '@/lib/demandai-engine';
import { DemandAISample } from '@/lib/demandai-sample-data';
import { showToast } from '@/lib/ui';
import { sx } from '@/lib/sx';
import { ApiError, api, errorText, type WireDeep } from '@/lib/client/api';
import { RoutingRules } from '@/components/RoutingRules';
import { useCan, useSessionUser } from '@/components/SessionContext';
import type { SetupState } from '@/lib/server/services/setup';
import type { SignalTypeConfig } from '@/types/demandai';

type Setup = WireDeep<SetupState>;
type SectionId = keyof Setup['sections'];
type Mode = 'view' | 'edit';
type Modal = { kind: 'switch'; name: string; isOff: boolean } | { kind: 'add'; name: string } | { kind: 'remove'; name: string };

const STEPS: { id: SectionId; num: number; title: string }[] = [
  { id: 'scope', num: 1, title: 'Scope' }, { id: 'rubric', num: 2, title: 'ICP and rubric' }, { id: 'personas', num: 3, title: 'Personas' },
  { id: 'signals', num: 4, title: 'Signals' }, { id: 'actions', num: 5, title: 'Actions' }, { id: 'brand', num: 6, title: 'Brand' }, { id: 'users', num: 7, title: 'Users' },
];

// What each rubric level means (the rubric itself is DemandAI.CONFIG.rubric, fixed for the pilot, D-13).
const LEVELS: Record<string, string> = {
  vertical: 'Core (100) · Adjacent (50) · Other (0)', size: 'Above target (100) · In target (70) · Below (20)', site: 'Suits the product (100) · Partly (50) · Unknown (30)',
  relationship: 'Customer on another line (100) · Past (70) · None (40)', accountType: 'Owner-operator (100) · EPC or integrator (60) · Distributor (20)', contacts: 'Buying role present (100) · Other roles (40) · None (0)',
};
const RUBRIC = DemandAI.CONFIG.rubric.map(r => ({ key: r.key, name: r.label, weight: r.weight, levels: LEVELS[r.key] || '' }));
// Fixed order, validated for colour-blind separation; every slice also carries a visible label and value.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const KNOCKOUTS = ['Out of the pilot region', 'Pilot product already installed', 'Managed separately (strategic account)', 'No contact left after opt-outs'];
const PERSONAS = ['Head of Instrumentation / I&C', 'Automation or DCS manager', 'Control systems lead', 'Plant manager', 'Operations or maintenance lead', 'Procurement lead'];

/* Signals: exactly the types the client's signal file carries (DemandAI.CONFIG.signalTypes), plus those added here. */
const SIG_INFO: Record<string, { about: string; data: string }> = {
  'Inquiry or RFQ': { about: 'Someone asked the client for information, a quote or a call.', data: 'Who asked, what they asked about, when' },
  'Installed system near end of support': { about: 'A control system at the site reaches end of support.', data: 'The installed product and version, the site, the end-of-support date' },
  'Service contract renewal': { about: 'A service contract with the client is coming up for renewal.', data: 'The contract, its end date' },
  'Capital project': { about: 'A new unit, expansion or revamp at the site.', data: 'The project, its stage, when the control-system decision falls' },
  'Leadership change': { about: 'A new person in a buying role.', data: 'Who, the role, when they started' },
  'Webinar attended': { about: "Attended one of the client's webinars.", data: 'The webinar topic, the date' },
  'Webinar registered': { about: 'Registered for a webinar (did not attend yet).', data: 'The webinar topic, the date' },
  'Content download': { about: 'Downloaded a guide, case study or white paper.', data: 'The piece downloaded, the date' },
  'Email clicked': { about: "Clicked a link in one of the client's emails.", data: 'The email and link, the date' },
  'Installed system (current)': { about: 'The pilot product is already installed.', data: 'The product at the site' },
  'Newsletter sign-up': { about: 'Signed up for the newsletter.', data: 'The date' },
};
// One example of each from the fictional sample files: the detail and where it came from.
const SIG_EX: Record<string, { detail?: string; source?: string }> = (() => {
  const out: Record<string, { detail?: string; source?: string }> = {};
  DemandAISample.SIGNALS.slice(2).forEach(r => { const t = String(r[2] ?? ''); if (t && !out[t]) out[t] = { detail: String(r[4] ?? ''), source: String(r[5] ?? '') }; });
  try {
    const g = DemandAISample.nbaWeekGrid(DemandAISample.SAMPLE_AS_OF), h = g[0].map(x => String(x).toLowerCase());
    const ti = h.indexOf('signal_type'), di = h.indexOf('detail'), si = h.indexOf('source');
    g.slice(1).forEach(r => { const t = String(r[ti] ?? ''); if (t && !out[t]) out[t] = { detail: String(r[di] ?? ''), source: String(r[si] ?? '') }; });
  } catch { /* the examples are optional */ }
  return out;
})();
const REASONS = ['Legal hold', 'Data quality issue', 'Source not available', 'Client request'];
const strength = (c: Pick<SignalTypeConfig, 'tier' | 'strength'>): [string, number] => { const w = (c.tier || 0) * (c.strength || 0); return w >= 80 ? ['Strong', 3] : w >= 45 ? ['Medium', 2] : ['Light', 1]; };
const fmtWhen = (t: string) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const fmtDate = (t: string) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const OVERLAY = sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px');

function statusBadge(status: 'done' | 'review'): ReactNode {
  return status === 'done' ? <span className="sc sc-h">Signed off</span> : <span className="sc sc-m">Draft · needs sign-off</span>;
}

/* ─── The donut: weights add up to 100%, so the parts of a whole read at a glance ─── */
const RUBRIC_TOTAL = RUBRIC.reduce((a, r) => a + r.weight, 0) || 1;
// Each slice's start and end angle, clockwise from the top, with a small gap between slices.
const SLICES: [number, number][] = (() => {
  const gap = 0.012;
  let a0 = -Math.PI / 2;
  return RUBRIC.map(r => { const a = r.weight / RUBRIC_TOTAL * Math.PI * 2, span: [number, number] = [a0 + gap, a0 + a - gap]; a0 += a; return span; });
})();
function Donut({ size, hover, onHover }: { size: number; hover: number; onHover: (i: number) => void }) {
  const total = RUBRIC_TOTAL, R = size / 2, r0 = R * 0.62;
  const arc = (a1: number, a2: number) => {
    const p = (a: number, rad: number) => [R + rad * Math.cos(a), R + rad * Math.sin(a)], large = a2 - a1 > Math.PI ? 1 : 0;
    const [x1, y1] = p(a1, R - 1), [x2, y2] = p(a2, R - 1), [x3, y3] = p(a2, r0), [x4, y4] = p(a1, r0);
    return `M${x1} ${y1} A${R - 1} ${R - 1} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r0} ${r0} 0 ${large} 0 ${x4} ${y4}Z`;
  };
  const slices = RUBRIC.map((r, i) => {
    const [s, e] = SLICES[i];
    return r.weight ? <path key={r.key} d={arc(s, Math.max(s + 0.001, e))} fill={SERIES[i]} className="dn-s" style={{ opacity: hover < 0 || hover === i ? 1 : 0.35 }}
      onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(-1)}><title>{`${r.name}: ${r.weight}%`}</title></path> : null;
  });
  return <div className="dn" style={{ width: size, height: size }}>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`Rubric weights: ${RUBRIC.map(r => `${r.name} ${r.weight}%`).join(', ')}`}>{slices}</svg>
    <div className="dn-c">{hover < 0 ? <><b>{`${total}%`}</b><span>of the fit score</span></> : <><b>{`${RUBRIC[hover].weight}%`}</b><span>{RUBRIC[hover].name}</span></>}</div>
  </div>;
}

export function SetupScreen() {
  const user = useSessionUser();
  const canSignOff = useCan('setup.signOff'), canSwitch = useCan('setup.signals');
  const canEdit = canSignOff || canSwitch;
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<Mode>('view');
  const [sigQ, setSigQ] = useState('');
  const [auditOpen, setAuditOpen] = useState(false);
  const [hover, setHover] = useState(-1);
  const [modal, setModal] = useState<Modal | null>(null);
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api<{ setup: Setup }>('/api/config').then(r => { if (live) setSetup(r.setup); }, e => { if (live) setLoadError(errorText(e)); });
    return () => { live = false; };
  }, []);
  const reload = async () => { setSetup((await api<{ setup: Setup }>('/api/config')).setup); };

  /* ─── Sign-offs ─── */
  async function signOff(id: SectionId, action: 'sign-off' | 'reopen') {
    try {
      await api(`/api/config/sections/${id}/${action}`, { body: {} });
      await reload();
      showToast(`${STEPS.find(s => s.id === id)!.title} ${action === 'sign-off' ? 'signed off' : 'reopened'}`);
    } catch (e) { showToast(errorText(e)); }
  }

  /* ─── Signal changes: the server makes the next configuration version ─── */
  const openModal = (m: Modal) => { setModal(m); setModalError(''); };
  const field = (id: string) => (formRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)?.value ?? '').trim();
  async function submit(url: string, body: Record<string, unknown>, done: (versionNo: number) => string) {
    setBusy(true);
    try {
      const r = await api<{ versionNo: number }>(url, { body });
      setModal(null); setAuditOpen(true);
      await reload();
      showToast(done(r.versionNo));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 409)) setModalError(e.fields ? Object.values(e.fields).flat()[0] ?? errorText(e) : errorText(e));
      else showToast(errorText(e));
    }
    setBusy(false);
  }
  const doToggle = (name: string, isOff: boolean) => {
    const reason = field('sgWhy');
    if (!isOff && !reason) { setModalError('Say why, so the audit trail explains it.'); return; }
    void submit('/api/config/signals/switch', { type: name, on: isOff, reason }, v => `${name} switched ${isOff ? 'on' : 'off'} · Config v${v}`);
  };
  const saveSignal = () => {
    const name = field('nsName');
    void submit('/api/config/signals', { name, about: field('nsAbout'), data: field('nsData'), source: field('nsSource'), segment: field('nsSeg'), level: field('nsLevel'), full: field('nsFull'), zero: field('nsZero') },
      v => `${name} added · Config v${v}`);
  };
  const removeCustom = (name: string) => { void submit('/api/config/signals/remove', { name, reason: field('rmWhy') }, v => `${name} removed · Config v${v}`); };

  if (!setup) return <main className="main" id="mainArea"><div className="topbar"><div className="topbar-l"><span className="tb-title">Setup</span></div></div>
    <div className="canvas"><div style={sx('font-size:12.5px;color:var(--i3)')} role={loadError ? 'alert' : 'status'}>{loadError || 'Loading…'}</div></div></main>;

  const S = setup, edit = mode === 'edit';
  const done = STEPS.filter(s => S.sections[s.id].status === 'done').length, N = STEPS.length, rem = N - done;
  const off = new Set(S.signals.off);
  const allTypes = [
    ...Object.entries(DemandAI.CONFIG.signalTypes).map(([name, c]) => ({ name, c, cu: null as Setup['signals']['custom'][number] | null })),
    ...S.signals.custom.map(cu => ({ name: cu.name, c: { segment: cu.segment, full: cu.full, zero: cu.zero, ...(DemandAI.CONFIG.customStrength[cu.level] ?? DemandAI.CONFIG.customStrength.Medium) } as SignalTypeConfig, cu })),
  ].map(x => ({ ...x, info: SIG_INFO[x.name] || { about: x.cu?.about ?? '', data: x.cu?.data ?? '' }, ex: SIG_EX[x.name] || { source: x.cu?.source } }))
    .sort((a, b) => (a.c.knockout ? 1 : a.c.reject ? 2 : 0) - (b.c.knockout ? 1 : b.c.reject ? 2 : 0));
  const scored = allTypes.filter(x => !x.c.knockout && !x.c.reject);
  const q = sigQ.toLowerCase();
  const shown = allTypes.filter(x => !q || `${x.name} ${x.info.about} ${x.ex.source ?? ''} ${x.c.segment ?? ''}`.toLowerCase().includes(q));
  const lastChange = (name: string) => S.changes.find(c => c.type === name);
  const word = { off: 'Switched off', on: 'Switched on', added: 'Added', removed: 'Removed' } as const;

  function stepBody(id: SectionId): ReactNode {
    if (id === 'scope') return <div className="kvs">
      <div><span>Pilot product</span><b>Process control DCS platform</b></div>
      <div><span>Business unit</span><b>{user.activeBusinessUnit?.name ?? '—'}</b></div>
      <div><span>Region</span><b>{DemandAI.CONFIG.pilotCountries.join(', ')}</b></div></div>;
    if (id === 'rubric') {
      const total = RUBRIC.reduce((a, r) => a + r.weight, 0);
      return <div className="ru">
        <div className="ru-chart"><Donut size={184} hover={hover} onHover={setHover} />
          <div className="ru-floor">Fit floor <b>{DemandAI.CONFIG.fitFloor}</b><span>Accounts scoring below it drop out before timing is scored.</span></div></div>
        <div className="ru-list">
          <div className="ru-lead">{"The "}<b>fit score</b>{" says how well an account matches the client's ideal customer. It is built from six parts; the bigger the slice, the more that part counts."}</div>
          {RUBRIC.map((r, i) => <div key={r.key} className={`rl ${hover === i ? 'on' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
            <span className="rl-dot" style={{ background: SERIES[i] }}></span>
            <div className="rl-b"><div className="rl-h"><b>{r.name}</b><span className="rl-w">{`${r.weight}%`}</span></div>
              <div className="rl-bar"><i style={{ width: `${r.weight}%`, background: SERIES[i] }}></i></div><div className="rl-l">{r.levels}</div></div></div>)}
          <div className={`ru-tot ${total === 100 ? 'ok' : 'bad'}`}>{total === 100 ? '✓ Adds up to 100%' : `Adds up to ${total}%: it must be 100% to sign off`}</div>
          <div className="ru-ko"><span>Knock-outs, before any scoring:</span>{KNOCKOUTS.map(k => <em key={k}>{k}</em>)}</div>
          {edit ? <div className="su-note">The weights, the fit floor and the personas are fixed for the pilot, so every score in it can be compared. A change would make a new configuration version.</div> : null}
        </div></div>;
    }
    if (id === 'personas') return <>
      <div className="chips">{PERSONAS.map(p => <span key={p} className="chip">{p}</span>)}</div>
      <div className="su-sub">The first contact approached is someone in these roles; anyone else is a fallback and lowers confidence.</div></>;
    if (id === 'signals') return <>
      <div className="sg-top"><div className="sg-sum"><b>{`${scored.filter(x => !off.has(x.name)).length} of ${scored.length}`}</b> signal types are on. These are the types the client&apos;s signal file carries; each row in the file is one event.</div>
        <div className="sg-tools"><input className="sg-q" placeholder="Search signals" aria-label="Search signals" value={sigQ} onChange={e => setSigQ(e.currentTarget.value)} /><Link className="btn btn-sec btn-sm" href="/scoring?tab=monitor" style={sx('text-decoration:none')}>Signal monitoring →</Link></div></div>
      {S.signals.problem ? <div role="alert" style={sx('font-size:12px;color:var(--neg);margin-bottom:10px')}>{S.signals.problem}</div> : null}
      <table className="sg"><thead><tr><th style={sx('width:24%')}>Signal</th><th style={sx('width:30%')}>What comes through</th><th style={sx('width:15%')}>From</th><th style={sx('width:15%')}>How long it counts</th><th style={sx('width:16%')}>Status</th></tr></thead><tbody>
        {shown.length ? shown.map(x => {
          const c = x.c, isOff = off.has(x.name), l = lastChange(x.name), [st, n] = c.knockout || c.reject ? ['', 0] : strength(c);
          return <tr key={x.name} className={isOff ? 'is-off' : ''}>
            <td><b>{x.name}</b>{x.cu ? <><span className="pill nr" style={sx('margin-left:6px')}>Added</span><div className="sg-m">{`By ${x.cu.by ?? '—'}${x.cu.at ? ' · ' + fmtWhen(x.cu.at) : ''}`}{edit && canSwitch ? <>{' · '}<button className="link" onClick={() => openModal({ kind: 'remove', name: x.name })}>Remove</button></> : null}</div></> : null}
              {c.segment ? <div className="sg-m">Feeds <span className="seg">{c.segment}</span></div> : null}
              {n ? <div className="sg-st" title="How much it counts">{[0, 1, 2].map(k => <i key={k} className={k < n ? 'on' : ''}></i>)}<span>{st}</span></div> : null}</td>
            <td>{x.info.about}<div className="sg-m"><b>Data:</b> {x.info.data}</div>{x.ex.detail ? <div className="sg-ex">{`e.g. “${x.ex.detail}”`}</div> : null}</td>
            <td>{x.ex.source || '—'}</td>
            <td>{c.full ? <>{`Full weight for ${c.full} days`}<div className="sg-m">{`Gone after ${c.zero} days`}</div></> : <span className="sg-m">—</span>}</td>
            <td>{c.knockout ? <><span className="pill ko">Knock-out</span><div className="sg-m">Removes the account before scoring</div></>
              : c.reject ? <><span className="pill nr">Not scored</span><div className="sg-m">Too weak to act on</div></>
              : <>{edit && canSwitch ? <button className={`sw ${isOff ? '' : 'on'}`} role="switch" aria-checked={!isOff} aria-label={x.name} onClick={() => openModal({ kind: 'switch', name: x.name, isOff })}><i></i></button> : null}
                <span className={`pill ${isOff ? 'off' : 'on'}`}>{isOff ? 'Off' : 'On'}</span>
                {l ? <div className="sg-m">{`${word[l.change]} · ${l.by} · ${fmtWhen(l.at)}`}{l.reason ? <><br />{`“${l.reason}”`}</> : null}</div> : null}</>}</td>
          </tr>;
        }) : <tr><td colSpan={5} className="su-sub" style={sx('padding:14px')}>No signal matches that search.</td></tr>}
      </tbody></table>
      {edit && canSwitch ? <div className="sg-add"><button className="btn btn-sec btn-sm" onClick={() => openModal({ kind: 'add', name: '' })}>+ Add a signal</button>
        {S.unknownTags.map(t => <span key={t.tag} className="sg-sugg">Seen in a file but not a signal type yet: <b>{t.tag}</b>{` (${t.rows} row${t.rows === 1 ? '' : 's'}) `}<button className="link" onClick={() => openModal({ kind: 'add', name: t.tag })}>Add it</button></span>)}</div> : null}
      <div className="sg-file"><span>Every row in the signal file carries:</span>{DemandAI.SIGNAL_COLUMNS.map(c => <code key={c}>{c}</code>)}</div>
      <div className="sg-audit"><button className="sg-audit-h" onClick={() => setAuditOpen(o => !o)} aria-expanded={auditOpen}><span>{`${auditOpen ? '▾' : '▸'} Audit trail`}</span><em>{`${S.changes.length} change${S.changes.length === 1 ? '' : 's'}`}</em></button>
        {auditOpen ? S.changes.length ? <table className="au"><thead><tr><th>When</th><th>Signal</th><th>Change</th><th>Who</th><th>Why</th><th>Version</th></tr></thead><tbody>
          {S.changes.map((a, i) => <tr key={i}><td>{fmtWhen(a.at)}</td><td>{a.type}</td><td><span className={`pill ${a.change === 'added' ? 'nr' : a.change === 'on' ? 'on' : 'off'}`}>{word[a.change]}</span></td><td>{a.by}</td><td>{a.reason || '—'}</td><td>{`v${a.versionNo}`}</td></tr>)}
        </tbody></table> : <div className="su-sub" style={sx('padding:8px 2px')}>No signal has been switched on or off yet.</div> : null}</div>
    </>;
    if (id === 'actions') return <>
      <div className="su-sub" style={sx('margin-bottom:10px')}>The actions the system may recommend, per micro-segment. It only chooses from this list; the first is the usual recommendation.</div>
      <div className="ac-grid">{Object.entries(DemandAI.CONFIG.segmentLibrary).map(([seg, acts]) => <div key={seg} className="ac"><div className="ac-h">{seg}<span>{acts.length}</span></div>{acts.map((a, i) => <div key={i} className="ac-i">{i === 0 ? <em>Usual</em> : null}{a}</div>)}</div>)}</div>
      {edit ? <div className="su-note">The client approves this list. Changes go to them as a proposal.</div> : null}</>;
    if (id === 'brand') return <><div className="su-sub" style={sx('margin-bottom:10px')}>Brand guidelines, approved claims and messaging frameworks live in the Content library.</div><Link href="/content" className="btn btn-sec btn-sm" style={sx('text-decoration:none;display:inline-flex')}>Open Content library →</Link></>;
    return <><div className="su-sub" style={sx('margin-bottom:10px')}>Who uses DemandAI and what each role can see.</div><Link href="/users" className="btn btn-sec btn-sm" style={sx('text-decoration:none;display:inline-flex')}>Open Users and roles →</Link></>;
  }

  function modalBody(m: Modal): ReactNode {
    const title = sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:4px');
    const err = <div id="sgErr" role="alert" style={sx('font-size:12px;color:var(--neg);min-height:16px;margin-top:4px')}>{modalError}</div>;
    if (m.kind === 'switch') return <>
      <div style={title}>{`${m.isOff ? 'Switch on' : 'Switch off'} “${m.name}”?`}</div>
      <div style={sx('font-size:12.5px;color:var(--i2);line-height:1.55;margin-bottom:14px')}>{m.isOff ? 'New scoring runs will use it again. Lists already scored are not changed.' : 'New scoring runs will skip its rows and list them as switched off. Lists already scored keep it.'}</div>
      <label htmlFor="sgWhy" style={sx('display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin-bottom:6px')}>{`Why${m.isOff ? '' : ' (required)'}`}</label>
      {m.isOff ? null : <div className="chips" style={sx('margin-bottom:8px')}>{REASONS.map(r => <button key={r} className="chip" onClick={() => { const el = formRef.current?.querySelector<HTMLInputElement>('#sgWhy'); if (el) el.value = r; }}>{r}</button>)}</div>}
      <input id="sgWhy" autoFocus placeholder={m.isOff ? 'Optional, e.g. legal cleared it' : 'e.g. Legal hold on webinar data'} maxLength={500} style={sx('width:100%;padding:9px 11px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px')} onKeyDown={e => { if (e.key === 'Enter') doToggle(m.name, m.isOff); }} />
      {err}
      <div style={sx('display:flex;gap:8px;justify-content:flex-end;margin-top:8px')}><button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>Cancel</button><button className={`btn ${m.isOff ? 'btn-primary' : 'btn-danger'} btn-sm`} disabled={busy} onClick={() => doToggle(m.name, m.isOff)}>{m.isOff ? 'Switch on' : 'Switch off'}</button></div></>;
    if (m.kind === 'remove') return <>
      <div style={title}>{`Remove “${m.name}”?`}</div>
      <div style={sx('font-size:12.5px;color:var(--i2);line-height:1.55;margin-bottom:14px')}>New scoring runs will treat it as an unknown tag again. Lists already scored keep it.</div>
      <input id="rmWhy" autoFocus placeholder="Why (optional)" maxLength={500} style={sx('width:100%;padding:9px 11px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:13px')} />
      {err}
      <div style={sx('display:flex;gap:8px;justify-content:flex-end;margin-top:8px')}><button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-danger btn-sm" disabled={busy} onClick={() => removeCustom(m.name)}>Remove</button></div></>;
    const fld = (id: string, label: string, ph: string, v = '') => <label className="af"><span>{label}</span><input id={id} placeholder={ph} defaultValue={v} maxLength={300} /></label>;
    return <>
      <div style={title}>Add a signal</div>
      <div style={sx('font-size:12px;color:var(--i3);line-height:1.5;margin-bottom:12px')}>New scoring runs recognise it in the signal file from now on. Lists already scored are not changed.</div>
      {fld('nsName', 'Name, exactly as in the signal_type column', 'e.g. Trade show visit', m.name)}
      {fld('nsAbout', 'What it means', "e.g. Visited the client's stand at a trade show")}
      {fld('nsData', 'What data comes through', 'e.g. The event, the date, who visited')}
      {fld('nsSource', 'Where it comes from', 'e.g. Events team')}
      <div className="af-row"><label className="af"><span>Feeds micro-segment</span><select id="nsSeg" defaultValue=""><option value="">Pick one…</option>{Object.keys(DemandAI.CONFIG.segmentLibrary).map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="af"><span>How much it counts</span><select id="nsLevel" defaultValue="Medium"><option>Strong</option><option>Medium</option><option>Light</option></select></label></div>
      <div className="af-row"><label className="af"><span>Full weight for (days)</span><input id="nsFull" type="number" min="1" defaultValue="30" /></label>
        <label className="af"><span>Gone after (days)</span><input id="nsZero" type="number" min="2" defaultValue="120" /></label></div>
      {err}
      <div style={sx('display:flex;gap:8px;justify-content:flex-end;margin-top:6px')}><button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy} onClick={saveSignal}>Add signal</button></div></>;
  }

  const v = S.version;
  return <>
    <main className="main" id="mainArea">
      <div className="topbar">
        <div className="topbar-l"><span className="tb-title">Setup</span><span className={`tb-badge ${done === N ? 'badge-live' : 'badge-neutral'}`}>{`${done} of ${N} signed off`}</span></div>
        <div className="topbar-r">
          <div className="mode" role="tablist" aria-label="Mode">
            <button role="tab" aria-selected={!edit} className={!edit ? 'on' : ''} onClick={() => setMode('view')}>View</button>
            <button role="tab" aria-selected={edit} className={edit ? 'on' : ''} disabled={!canEdit} title={canEdit ? 'Change the setup and sign it off' : 'Only an admin can change the setup'} onClick={() => setMode('edit')}>Edit</button>
          </div>
          <a className="btn btn-sec btn-sm" href="/api/config/export" style={sx('text-decoration:none')}>Export config</a>
        </div>
      </div>
      <div className="canvas">
        <div className={`su-intro ${edit ? 'edit' : ''}`}>{edit
          ? <><b>Edit mode.</b> Sign off each section once it is right, and switch signals as the pilot needs. Prospecting, Scoring and Micro-segments read this configuration; every list and run names the version it used.</>
          : <><b>How DemandAI is set up for this pilot.</b>{` What it scores on, which signals it listens to and who it targets.${canEdit ? ' Switch to Edit to change it.' : ' Only an admin can change it.'}`}</>}</div>
        {STEPS.map(s => {
          const st = S.sections[s.id];
          const action = !edit || !canSignOff ? null : st.status === 'done'
            ? <button className="btn btn-ghost btn-sm" onClick={() => void signOff(s.id, 'reopen')}>Reopen to edit</button>
            : <button className="btn btn-primary btn-sm" onClick={() => void signOff(s.id, 'sign-off')}>Sign off this section</button>;
          return <div key={s.id} className="panel su-p" id={`sec-${s.id}`}>
            <div className="panel-hdr"><span className="panel-ttl">{`${s.num} · ${s.title}`}</span>
              <div style={sx('display:flex;align-items:center;gap:8px')}>{st.by && st.at ? <span className="sg-m" style={sx('margin:0')}>{`${st.status === 'done' ? 'Signed off' : 'Reopened'} by ${st.by} · ${fmtWhen(st.at)}${st.note ? ` · ${st.note}` : ''}`}</span> : null}{statusBadge(st.status)}{action}</div></div>
            <div className="panel-body">{stepBody(s.id)}</div></div>;
        })}
        <div className="panel" style={sx(`border:2px solid ${done === N ? 'var(--pos)' : 'var(--border)'}`)}>
          <div className="panel-hdr"><span className="panel-ttl">{`8 · Config v${v.versionNo}`}</span>{done === N ? <span className="sc sc-h">Signed off</span> : <span className="sc sc-m">{`${rem} section${rem > 1 ? 's' : ''} remaining`}</span>}</div>
          <div className="panel-body" style={sx('font-size:12px;color:var(--i2);line-height:1.6')}>
            {done === N ? `All seven sections signed off. Every score, segment and draft from here names this version. A later change makes v${v.versionNo + 1}, and v${v.versionNo} is kept for the audit trail.`
              : `Config v${v.versionNo} is in use: every list and run names it. Sign off the remaining ${rem} section${rem > 1 ? 's' : ''} to confirm it.`}
            <table className="au" style={sx('margin-top:10px')}><thead><tr><th>Version</th><th>In use from</th><th>By</th><th>What changed</th></tr></thead><tbody>
              {S.versions.map(r => <tr key={r.versionNo}><td>{`v${r.versionNo}${r.status === 'active' ? ' · in use' : ''}`}</td><td>{r.activatedAt ? fmtDate(r.activatedAt) : '—'}</td><td>{r.activatedBy ?? '—'}</td><td>{r.changes.length ? r.changes.join('; ') : r.versionNo === 1 ? 'Starting values' : '—'}</td></tr>)}
            </tbody></table>
          </div>
        </div>
        <RoutingRules num={9} />
      </div>
    </main>
    {modal ? <div id="setupModalOverlay" style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
      <div ref={formRef} role="dialog" aria-modal="true" aria-label={modal.kind === 'add' ? 'Add a signal' : modal.kind === 'remove' ? `Remove ${modal.name}` : `Switch ${modal.name}`}
        style={sx(`background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:${modal.kind === 'add' ? 520 : 440}px;max-width:100%;padding:22px`)}>{modalBody(modal)}</div>
    </div> : null}
  </>;
}
