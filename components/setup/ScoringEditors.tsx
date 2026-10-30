'use client';

/* The scoring settings in Setup (30 Oct 2026; replaces the D-13 lock): the ICP rubric and its parts, the fit floor and
   tiers, size bands, verticals, knock-outs and region (section 2), personas (section 3), and how much and how long each
   starting signal counts (section 4). One working copy is edited across those sections; the save bar says what
   changed, previews how many accounts of the newest scored list would change tier, and saves it as the next
   configuration version, with the sponsor's sign-off when the settings are locked to that. */
import { useState, type ReactNode } from 'react';
import {
  BUILT_IN_PARTS, PART_COLUMNS, PART_LEVELS, RULE_TESTS, type BuiltInPartKey, type PartRule, type RubricPart, type ScoringSettings,
} from '@/lib/demandai-engine';
import { PERSONA_TERMS, newPart, scoringChanges } from '@/lib/engine/settings';
import { sx } from '@/lib/sx';
import { showToast } from '@/lib/ui';
import { ApiError, api, errorText } from '@/lib/client/api';
import type { ScoringLock, TierPreview } from '@/lib/server/services/setup';

export type SetScoring = (f: (s: ScoringSettings) => void) => void;
const num = (v: string) => (v.trim() === '' ? 0 : Number(v));
const money = (n: number) => (n >= 1e9 ? `${+(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `${Math.round(n / 1e6)}m` : n.toLocaleString('en-US'));
const isBuiltIn = (p: RubricPart) => (BUILT_IN_PARTS as string[]).includes(p.key);
// Fixed order, validated for colour-blind separation; every slice also carries a visible label and value.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6f5bd3', '#00838f', '#b0573a', '#5e6b78'];

/** What a part's levels say, in one line: built-in ones with their points, added ones by their rules. */
export function partLevels(p: RubricPart): string {
  if (isBuiltIn(p)) return PART_LEVELS[p.key as BuiltInPartKey].map(l => `${l.label} (${p.levels?.[l.key] ?? l.points})`).join(' · ');
  return [...(p.rules ?? []).map(r => `${PART_COLUMNS[p.column ?? '']?.label ?? p.column} ${RULE_TESTS[r.when]}${r.value ? ' ' + r.value : ''} (${r.points})`), `otherwise (${p.otherwise ?? 0})`].join(' · ');
}

const Num = ({ value, onChange, label, min = 0, max = 100, step = 1, width = 64 }: { value: number; onChange: (n: number) => void; label: string; min?: number; max?: number; step?: number; width?: number }) =>
  <input type="number" className="ed-n" aria-label={label} value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} style={{ width }}
    onChange={e => onChange(num(e.currentTarget.value))} />;

/* ─── Section 2: the parts, weights and levels ─── */
export function RubricEdit({ s, set }: { s: ScoringSettings; set: SetScoring }) {
  const [adding, setAdding] = useState('');
  const total = s.parts.reduce((t, p) => t + p.weight, 0);
  const addPart = () => {
    const name = adding.trim();
    if (!name) return;
    set(x => { x.parts.push(newPart(x.parts, name)); });
    setAdding('');
  };
  const missing = BUILT_IN_PARTS.filter(k => !s.parts.some(p => p.key === k));
  return <div className="ed">
    <div className="ed-h"><b>Parts of the fit score</b><span className={`ed-tot ${total === 100 ? 'ok' : 'bad'}`}>{total === 100 ? '✓ Weights add up to 100%' : `Weights add up to ${total}%: they must add up to 100%`}</span></div>
    {s.parts.map((p, i) => <div key={p.key} className="ed-part">
      <div className="ed-row">
        <span className="rl-dot" style={{ background: SERIES[i % SERIES.length] }}></span>
        <input className="ed-t" aria-label="Part name" value={p.label} maxLength={60} onChange={e => { const v = e.currentTarget.value; set(x => { x.parts[i].label = v; }); }} />
        <label className="ed-w"><Num label={`${p.label} weight`} value={p.weight} onChange={n => set(x => { x.parts[i].weight = n; })} />%</label>
        <button className="link" onClick={() => set(x => { x.parts.splice(i, 1); })}>Remove</button>
      </div>
      {isBuiltIn(p) ? <div className="ed-levels">{PART_LEVELS[p.key as BuiltInPartKey].map(l => <label key={l.key}><span>{l.label}</span>
        <Num label={`${p.label}, ${l.label} points`} value={p.levels?.[l.key] ?? l.points} onChange={n => set(x => { x.parts[i].levels = { ...x.parts[i].levels, [l.key]: n }; })} /></label>)}</div>
        : <RulesEdit p={p} onChange={next => set(x => { x.parts[i] = next; })} />}
    </div>)}
    <div className="ed-add">
      <input placeholder="Name a new part, e.g. Plant age or Home market" aria-label="New part name" value={adding} maxLength={60}
        onChange={e => setAdding(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') addPart(); }} />
      <button className="btn btn-sec btn-sm" onClick={addPart} disabled={!adding.trim()}>+ Add a part</button>
      {missing.map(k => <button key={k} className="chip" onClick={() => set(x => { x.parts.push({ key: k, label: { vertical: 'Vertical', size: 'Company size', site: 'Site profile', relationship: 'Relationship', accountType: 'Account type', contacts: 'Contact coverage' }[k], weight: 0, levels: Object.fromEntries(PART_LEVELS[k].map(l => [l.key, l.points])) }); })}>{`Put back ${k === 'accountType' ? 'account type' : k}`}</button>)}
    </div>
    <div className="su-sub">A new part reads one column of the lead file for each account; its rules are checked in order and the first that fits gives the points (0 to 100).</div>
  </div>;
}

function RulesEdit({ p, onChange }: { p: RubricPart; onChange: (p: RubricPart) => void }) {
  const rules = p.rules ?? [];
  const setRule = (i: number, r: Partial<PartRule>) => onChange({ ...p, rules: rules.map((x, j) => (j === i ? { ...x, ...r } : x)) });
  return <div className="ed-rules">
    <label className="ed-col"><span>Reads</span><select aria-label={`${p.label}: column`} value={p.column} onChange={e => onChange({ ...p, column: e.currentTarget.value })}>
      {Object.entries(PART_COLUMNS).map(([k, c]) => <option key={k} value={k}>{`${c.label} (${k})`}</option>)}</select></label>
    {rules.map((r, i) => <div key={i} className="ed-rule"><span>{i ? 'else if it' : 'If it'}</span>
      <select aria-label="Test" value={r.when} onChange={e => setRule(i, { when: e.currentTarget.value as PartRule['when'] })}>{Object.entries(RULE_TESTS).map(([k, w]) => <option key={k} value={k}>{w}</option>)}</select>
      {['yes', 'no', 'blank'].includes(r.when) ? null : <input aria-label="Value" value={r.value} maxLength={100} placeholder={['atLeast', 'below'].includes(r.when) ? 'a number' : 'a value'} onChange={e => setRule(i, { value: e.currentTarget.value })} />}
      <span>→</span><Num label="Points" value={r.points} onChange={n => setRule(i, { points: n })} /><span>points</span>
      <button className="link" onClick={() => onChange({ ...p, rules: rules.filter((_, j) => j !== i) })} disabled={rules.length < 2}>Remove</button></div>)}
    <div className="ed-rule"><button className="link" onClick={() => onChange({ ...p, rules: [...rules, { when: 'is', value: '', points: 50 }] })} disabled={rules.length >= 20}>+ Another rule</button>
      <span style={sx('margin-left:auto')}>Otherwise</span><Num label="Otherwise points" value={p.otherwise ?? 0} onChange={n => onChange({ ...p, otherwise: n })} /><span>points</span></div>
  </div>;
}

/* ─── Section 2: floor, tiers, bands, verticals, knock-outs and region ─── */
export function CutoffsEdit({ s, set }: { s: ScoringSettings; set: SetScoring }) {
  const [word, setWord] = useState<Record<string, string>>({});
  const [vName, setVName] = useState('');
  const [country, setCountry] = useState('');
  const b = s.sizeBands;
  return <div className="ed">
    <div className="ed-grid">
      <label><span>Fit floor</span><Num label="Fit floor" value={s.fitFloor} onChange={n => set(x => { x.fitFloor = n; })} /><em>Accounts below it are not scored for timing.</em></label>
      <label><span>Tier A from</span><Num label="Tier A from" value={s.tiers.A} onChange={n => set(x => { x.tiers.A = n; })} /><em>Score 0–100</em></label>
      <label><span>Tier B from</span><Num label="Tier B from" value={s.tiers.B} onChange={n => set(x => { x.tiers.B = n; })} /><em>Below it: tier C. Tiers A and B go to NBA.</em></label>
    </div>
    <div className="ed-h"><b>Size bands</b><span className="su-sub">Above target, in target or below target</span></div>
    <div className="ed-grid">
      <label><span>Revenue above target from (USD)</span><Num label="Revenue above target" value={b.revenueAbove} max={1e13} step={1e6} width={130} onChange={n => set(x => { x.sizeBands.revenueAbove = n; })} /><em>{money(b.revenueAbove)}</em></label>
      <label><span>Revenue in target from (USD)</span><Num label="Revenue in target" value={b.revenueIn} max={1e13} step={1e6} width={130} onChange={n => set(x => { x.sizeBands.revenueIn = n; })} /><em>{money(b.revenueIn)}</em></label>
      <label><span>Staff above target from</span><Num label="Staff above target" value={b.employeesAbove} max={1e7} width={100} onChange={n => set(x => { x.sizeBands.employeesAbove = n; })} /></label>
      <label><span>Staff in target from</span><Num label="Staff in target" value={b.employeesIn} max={1e7} width={100} onChange={n => set(x => { x.sizeBands.employeesIn = n; })} /></label>
    </div>
    <div className="ed-h"><b>Verticals</b><span className="su-sub">How each industry counts. Words find a new vertical in the lead file&apos;s industry or site process (from the next lead file processed).</span></div>
    <table className="au ed-tab"><thead><tr><th>Vertical</th><th>Counts as</th><th>Also matched by</th><th></th></tr></thead><tbody>
      {s.verticals.map((v, i) => <tr key={v.name}><td><b>{v.name}</b></td>
        <td><select aria-label={`${v.name} level`} value={v.level} onChange={e => { const l = e.currentTarget.value as 'core'; set(x => { x.verticals[i].level = l; }); }}>
          <option value="core">Core</option><option value="adjacent">Adjacent</option><option value="other">Other</option></select></td>
        <td><div className="chips">{v.words.map(w => <span key={w} className="chip">{w}<button aria-label={`Remove ${w}`} onClick={() => set(x => { x.verticals[i].words = x.verticals[i].words.filter(z => z !== w); })}>×</button></span>)}
          <input className="ed-word" placeholder="add a word" aria-label={`Add a word for ${v.name}`} value={word[v.name] ?? ''} onChange={e => { const t = e.currentTarget.value; setWord(o => ({ ...o, [v.name]: t })); }}
            onKeyDown={e => { const t = (word[v.name] ?? '').trim(); if (e.key === 'Enter' && t.length > 1) { set(x => { if (!x.verticals[i].words.includes(t)) x.verticals[i].words.push(t); }); setWord(o => ({ ...o, [v.name]: '' })); } }} /></div></td>
        <td>{i >= 3 ? <button className="link" onClick={() => set(x => { x.verticals.splice(i, 1); })}>Remove</button> : <span className="su-sub">Starting</span>}</td></tr>)}
    </tbody></table>
    <div className="ed-add"><input placeholder="Add a vertical, e.g. Pharmaceuticals" aria-label="New vertical" value={vName} maxLength={60} onChange={e => setVName(e.currentTarget.value)} />
      <button className="btn btn-sec btn-sm" disabled={vName.trim().length < 2} onClick={() => { const n = vName.trim(); set(x => { if (!x.verticals.some(v => v.name.toLowerCase() === n.toLowerCase())) x.verticals.push({ name: n, level: 'adjacent', words: [n.toLowerCase().slice(0, 40)] }); }); setVName(''); }}>+ Add vertical</button></div>
    <div className="ed-h"><b>Knock-outs, before any scoring</b></div>
    <div className="ed-ko">{([['region', 'Out of the pilot region'], ['installed', 'Pilot product already installed'], ['managed', 'Managed separately (strategic account)'], ['nobodyLeft', 'No contact left after opt-outs']] as const).map(([k, l]) =>
      <label key={k}><button className={`sw ${s.knockouts[k] ? 'on' : ''}`} role="switch" aria-checked={s.knockouts[k]} aria-label={l} onClick={() => set(x => { x.knockouts[k] = !x.knockouts[k]; })}><i></i></button>{l}</label>)}</div>
    <div className="ed-h"><b>Pilot region</b><span className="su-sub">Accounts in other countries are knocked out while the region knock-out is on.</span></div>
    <div className="chips">{s.countries.map(c => <span key={c} className="chip">{c}<button aria-label={`Remove ${c}`} onClick={() => set(x => { x.countries = x.countries.filter(z => z !== c); })}>×</button></span>)}
      <input className="ed-word" placeholder="add a country" aria-label="Add a country" value={country} onChange={e => setCountry(e.currentTarget.value)}
        onKeyDown={e => { const t = country.trim(); if (e.key === 'Enter' && t.length > 1) { set(x => { if (!x.countries.some(c => c.toLowerCase() === t.toLowerCase())) x.countries.push(t); }); setCountry(''); } }} /></div>
  </div>;
}

/* ─── Section 3: personas ─── */
export function PersonasEdit({ s, set }: { s: ScoringSettings; set: SetScoring }) {
  const [add, setAdd] = useState<{ primary: string; secondary: string }>({ primary: '', secondary: '' });
  return <div className="ed">{(['primary', 'secondary'] as const).map(kind => <div key={kind} style={sx('margin-bottom:10px')}>
    <div className="ed-h"><b>{kind === 'primary' ? 'Primary: the buying role (approached first)' : 'Secondary: a fallback contact'}</b></div>
    <div className="chips">{PERSONA_TERMS.filter(t => t.kind === kind).map(t => { const off = s.personas.off.includes(t.source);
      return <button key={t.source} className={`chip ${off ? 'off' : ''}`} aria-pressed={!off} title={off ? 'Switched off: click to use it again' : 'Click to switch it off'}
        onClick={() => set(x => { x.personas.off = off ? x.personas.off.filter(o => o !== t.source) : [...x.personas.off, t.source]; })}>{off ? <s>{t.label}</s> : t.label}</button>; })}
      {s.personas[kind].map(w => <span key={w} className="chip add">{w}<button aria-label={`Remove ${w}`} onClick={() => set(x => { x.personas[kind] = x.personas[kind].filter(z => z !== w); })}>×</button></span>)}
      <input className="ed-word" placeholder="add a job-title phrase" aria-label={`Add a ${kind} job-title phrase`} value={add[kind]} onChange={e => { const t = e.currentTarget.value; setAdd(a => ({ ...a, [kind]: t })); }}
        onKeyDown={e => { const t = add[kind].trim(); if (e.key === 'Enter' && t.length > 1) { set(x => { if (!x.personas[kind].includes(t)) x.personas[kind].push(t); }); setAdd(a => ({ ...a, [kind]: '' })); } }} /></div>
  </div>)}<div className="su-sub">A job title that contains a phrase gets that persona. Changes apply to lead files processed from now on.</div></div>;
}

/* ─── The save bar: what changed, the preview, the reason and the sponsor ─── */
export function ScoringSaveBar({ saved, draft, lock, onSaved, onDiscard }: { saved: ScoringSettings; draft: ScoringSettings; lock: ScoringLock; onSaved: (v: number) => void; onDiscard: () => void }) {
  const changes = scoringChanges(saved, draft);
  const [reason, setReason] = useState('');
  const [sponsor, setSponsor] = useState({ name: '', note: '' });
  const [preview, setPreview] = useState<TierPreview | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'save'>('');
  const [error, setError] = useState('');
  if (!changes.length) return null;
  async function run(kind: 'preview' | 'save') {
    setBusy(kind); setError('');
    try {
      if (kind === 'preview') setPreview(await api<TierPreview>('/api/config/scoring/preview', { body: { settings: draft } }));
      else {
        const r = await api<{ versionNo: number }>('/api/config/scoring', { method: 'PUT', body: { settings: draft, reason, sponsor: lock.mode === 'sponsor' ? sponsor : null } });
        showToast(`Scoring settings saved · Config v${r.versionNo}`); onSaved(r.versionNo);
      }
    } catch (e) { setError(e instanceof ApiError && e.fields ? Object.values(e.fields).flat()[0] ?? errorText(e) : errorText(e)); }
    setBusy('');
  }
  const locked = lock.mode === 'locked';
  return <div className="ed-bar" role="region" aria-label="Unsaved scoring changes">
    <div className="ed-bar-h"><b>{`${changes.length} unsaved change${changes.length === 1 ? '' : 's'} to the scoring settings`}</b><span>Saving makes the next configuration version. Lists and runs already made keep theirs.</span></div>
    <ul className="ed-ch">{changes.slice(0, 12).map(c => <li key={c}>{c}</li>)}{changes.length > 12 ? <li>{`… and ${changes.length - 12} more`}</li> : null}</ul>
    <div className="ed-pv">{preview ? preview.run ? <><b>{`${preview.changed} of ${preview.accounts} accounts`}</b>{` in ${preview.run.name} (as of ${preview.run.asOf}) would change tier`}
      {preview.moves.length ? `: ${preview.moves.map(m => `${m.n} ${m.from} → ${m.to}`).join(', ')}` : '.'}
      {preview.examples.length ? <div className="su-sub">{preview.examples.slice(0, 5).map(e => `${e.account} ${e.from} → ${e.to}`).join(' · ')}</div> : null}</>
      : 'No list has been scored yet, so there is nothing to compare.' : <span className="su-sub">Preview how many accounts of the newest scored list would change tier.</span>}
      <button className="btn btn-sec btn-sm" disabled={!!busy} onClick={() => void run('preview')}>{busy === 'preview' ? 'Working it out…' : 'Preview tier changes'}</button></div>
    {locked ? <div role="alert" className="ed-err">{`The scoring settings are locked for the measurement weeks${lock.note ? ` (${lock.note})` : ''}. Unlock them in “Lock during measurement” to save.`}</div> : <>
      <label className="af"><span>Why (required)</span><input value={reason} maxLength={500} placeholder="e.g. Agreed with the Client on 3 Nov: size matters more than site" onChange={e => setReason(e.currentTarget.value)} /></label>
      {lock.mode === 'sponsor' ? <div className="af-row"><label className="af"><span>Signed off by the sponsor (name)</span><input value={sponsor.name} maxLength={120} onChange={e => { const v = e.currentTarget.value; setSponsor(o => ({ ...o, name: v })); }} /></label>
        <label className="af"><span>Their note (optional)</span><input value={sponsor.note} maxLength={500} onChange={e => { const v = e.currentTarget.value; setSponsor(o => ({ ...o, note: v })); }} /></label></div> : null}</>}
    {error ? <div role="alert" className="ed-err">{error}</div> : null}
    <div style={sx('display:flex;gap:8px;justify-content:flex-end')}><button className="btn btn-ghost btn-sm" onClick={onDiscard} disabled={!!busy}>Discard changes</button>
      <button className="btn btn-primary btn-sm" disabled={!!busy || locked || !reason.trim() || (lock.mode === 'sponsor' && !sponsor.name.trim())} onClick={() => void run('save')}>{busy === 'save' ? 'Saving…' : 'Save as a new version'}</button></div>
  </div>;
}

/* ─── The lock during the measurement weeks ─── */
export function LockControl({ lock, canLock, onChanged }: { lock: ScoringLock; canLock: boolean; onChanged: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const words: Record<ScoringLock['mode'], ReactNode> = {
    open: <>Open: an Admin can change the scoring settings; each change is a new version.</>,
    locked: <><b>Locked</b> for the measurement weeks: no change until it is unlocked.</>,
    sponsor: <>Open only with the <b>sponsor&apos;s sign-off</b>: each change names who signed it off.</>,
  };
  async function to(mode: ScoringLock['mode']) {
    setBusy(true);
    try { const r = await api<{ versionNo: number }>('/api/config/scoring/lock', { body: { mode, note } }); showToast(`Config v${r.versionNo}`); setNote(''); onChanged(); }
    catch (e) { showToast(errorText(e)); }
    setBusy(false);
  }
  return <div className="ed-lock"><div><b>Lock during measurement</b><div className="su-sub">{words[lock.mode]}{lock.by ? ` Set by ${lock.by}${lock.at ? ` on ${new Date(lock.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}${lock.note ? `: “${lock.note}”` : ''}.` : ''}</div></div>
    {canLock ? <div className="ed-lock-a"><input placeholder="Note (optional), e.g. weeks 3–6" aria-label="Lock note" value={note} maxLength={300} onChange={e => setNote(e.currentTarget.value)} />
      {(['open', 'sponsor', 'locked'] as const).filter(m => m !== lock.mode).map(m => <button key={m} className="btn btn-sec btn-sm" disabled={busy} onClick={() => void to(m)}>{m === 'open' ? 'Unlock' : m === 'locked' ? 'Lock' : 'Require sponsor sign-off'}</button>)}</div> : null}
  </div>;
}
