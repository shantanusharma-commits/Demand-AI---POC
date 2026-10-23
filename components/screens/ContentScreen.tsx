'use client';

/* Content library (was legacy/07-content.html), on the server (G-009): the brand pack every draft is checked against.
   Changes wait in the unit's draft; "Save as vN" makes the next version and earlier ones are kept, and can be
   restored. Approved claims carry an owner and an expiry: an expired claim fails the draft checks. Admin and Sales
   manager change it; everyone else with the screen sees it. Each claim shows where it was used in micro-segment drafts,
   and "From For Review" lists sentences people approved that are not claims yet. The Content tab lists the pieces
   written in Content studio, and each claim says which pieces cite it. The "after the pilot" calls to action (and the
   sign-off column) are not shown (dead controls, G-063). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { VOICE_PRESETS, type BrandPack, type Claim, type Framework } from '@/lib/engine/nba';
import { CLAIM_TYPES, applySuggestion, claimFits, claimStatus, nextClaimId, readRules, type ClaimStatus, type RuleSuggestion } from '@/lib/content/brand';
import { showToast } from '@/lib/ui';
import { sx } from '@/lib/sx';
import { ApiError, api, errorText, uploadFile, type WireDeep } from '@/lib/client/api';
import { useCan, useSessionUser } from '@/components/SessionContext';
import type { BrandState, ClaimUse, FromReview } from '@/lib/server/services/brand';
import type { ItemSummary } from '@/lib/server/services/studio';

type Brand = WireDeep<BrandState>;
type Tab = 'guidelines' | 'framework' | 'voice' | 'negative' | 'claims' | 'content' | 'versions';
type Guideline = { documentId: string; name: string; size: number; at: string; by: string };
type Modal = { kind: 'changes' } | { kind: 'discard' } | { kind: 'restore'; versionNo: number } | { kind: 'claim'; pre?: string } | { kind: 'fromReview' } | { kind: 'framework'; index: number } | { kind: 'sample'; id: string };
type Usage = WireDeep<{ use: Record<string, ClaimUse[]>; fromReview: FromReview[] }>;
type Piece = WireDeep<ItemSummary>;

const TABS: [Tab, string][] = [['guidelines', 'Brand guidelines'], ['framework', 'Messaging frameworks'], ['voice', 'Voice and tone'], ['negative', 'Negative keywords'], ['claims', 'Approved claims'], ['content', 'Content'], ['versions', 'Versions']];
const SECTION_OF: Record<string, Tab> = { 'Brand guidelines': 'guidelines', 'Messaging frameworks': 'framework', 'Voice and tone': 'voice', 'Negative keywords': 'negative', 'Approved claims': 'claims' };
const USE = ['Often', 'Sometimes', 'Rarely', 'Not used'];
const USE_TONE: Record<string, string> = { Often: 'tag-green', Sometimes: 'tag-blue', Rarely: 'tag-amber', 'Not used': 'tag-grey' };
const STATUS_TONE: Record<ClaimStatus, string> = { Approved: 'tag-green', Expired: 'tag-red', Draft: 'tag-amber', Retired: 'tag-grey' };
const FIELD = 'padding:8px 10px;border:1px solid var(--bdk);border-radius:var(--rsm);font-size:12.5px;color:var(--i1);background:#fff';
const OVERLAY = sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px');

const GUIDE_PARTS: [string, string][] = [
  ['Brand at a glance', 'Who the client is, what they sell, and the promise every message keeps.'],
  ['Who we write for', 'The buyers: roles, what they care about, the words they use.'],
  ['Voice and tone', 'How messages should sound, with a good and a bad example.'],
  ['Words we never use', 'Banned words and phrases, competitor names, openers to avoid.'],
  ['Claims and proof', 'What may be claimed, and the approved source behind each claim.'],
  ['Email rules', 'Length, sign-off, header and footer, the opt-out line on promotional email.'],
  ['Visual basics', 'Logo use, brand colours and fonts, for documents and whitepapers.'],
];
const SAMPLE_GUIDE = `# Client brand guidelines (sample)

Use this sample to see what a brand guideline should contain. Replace the text with the client's own, keep the headings, and upload it back to the Content library. Lines written as plain rules (like the ones under "Words we never use") are read automatically and offered as rules to add.

## 1. Brand at a glance
- Client supplies process control systems and services to refineries, petrochemical plants and gas processing sites.
- Our promise: modernise control systems with the least disruption to operations.

## 2. Who we write for
- Heads of instrumentation and control, automation and DCS managers, control systems leads.
- They care about uptime, safe migration within a planned shutdown, and lifecycle support.

## 3. Voice and tone
Tone: Direct
- Lead with the account's own trigger, not a generic pitch.
- One point and one question per message.
- Good: "Your control system reaches end of support next year. A comparable refinery moved within one planned shutdown. Worth comparing the options?"
- Avoid: "We are the world-class leader in game-changing automation solutions!"

## 4. Words we never use
Never use: synergy, world-class, game-changing, revolutionary
Competitors: Rivalco, Acmetrol
Never open with: Just checking in, I hope this email finds you well
No exclamation marks.

## 5. Claims and proof
- Only make claims that are in the approved claims list, word for word, with their source.
- Pricing and commercial terms are left to the account team.
- A plant incident, security or regulation always goes to the sales manager before anything is sent.

## 6. Email rules
Keep emails under 120 words.
Keep sentences under 25 words.
Always sign off as: Client Sales Team
- Header: the client logo, left aligned. Footer: company name, address, and a link to the privacy notice.
- Promotional email always ends with an opt-out line: "Prefer not to hear from us? Unsubscribe here."

## 7. Visual basics
- Logo: on white, with clear space equal to the height of the logo mark.
- Colours: primary purple #7D52A2, dark text #141A21, grey #7A8592.
- Fonts: a clean sans serif for headings and body text.
`;
const SAMPLES = [
  { id: 'full', title: 'Full brand guideline', about: 'Every section a guideline should have. Its rules are read when you upload it back.', file: 'client-brand-guideline-sample.md', text: SAMPLE_GUIDE },
  { id: 'email', title: 'Email guideline', about: 'Header, footer, sign-off, length and the opt-out line on promotional email.', file: 'client-email-guideline-sample.md', text:
`# Client email guideline (sample)

## Structure
- Subject: six words or fewer, about their situation, never a product name.
- Opening line: their own trigger, in one sentence.
- One point, one proof, one question.

## Rules
Keep emails under 120 words.
Keep sentences under 25 words.
Always sign off as: Client Sales Team
Never open with: Just checking in, Hope you are well
No exclamation marks.

## Header and footer
- Header: the client logo, left aligned, on white.
- Footer: company name, registered address, a link to the privacy notice.

## Promotional email
- Always ends with the opt-out line: "Prefer not to hear from us? Unsubscribe here."
- Sent only to contacts with a recorded consent basis.
` },
  { id: 'voice', title: 'Voice and tone sheet', about: 'How the client sounds, with good and bad examples side by side.', file: 'client-voice-and-tone-sample.md', text:
`# Client voice and tone (sample)

Tone: Direct

## We are
- Specific: we name their site, their system, their timeline.
- Practical: one useful point, not a list of features.
- Calm: no hype, no urgency we didn't earn.

## We avoid
Never use: synergy, cutting-edge, best-in-class, revolutionary

## Examples
- Good: "Your control system reaches end of support next year. A comparable refinery moved within one planned shutdown. Worth comparing the options?"
- Not like this: "Exciting news! Our best-in-class platform will revolutionise your plant!"
` },
];
const TONE_SAMPLE: Record<string, string> = {
  Direct: 'Your control system reaches end of support next year. A comparable refinery moved within one planned shutdown. Worth comparing the options?',
  Formal: 'We understand that your control system will reach end of support next year. We recently supported a comparable refinery in completing the migration within a single planned shutdown. Would a short discussion of the options be of interest?',
  Warm: 'I noticed your control system reaches end of support next year, and thought this might help: a refinery much like yours made the move in one planned shutdown. Happy to walk you through how they did it, if useful.',
};

/** The guideline samples' Markdown, as elements (headings, bullets, bold): never as HTML. */
function md(text: string): ReactNode[] {
  const inline = (x: string) => x.split(/\*\*(.+?)\*\*/g).map((part, i) => i % 2 ? <b key={i}>{part}</b> : part);
  const out: ReactNode[] = [];
  let ul: ReactNode[] | null = null;
  const flush = () => { if (ul) { out.push(<ul key={out.length}>{ul}</ul>); ul = null; } };
  for (const l of text.split('\n')) {
    const b = /^\s*[-*]\s+(.*)/.exec(l);
    if (b) { (ul ??= []).push(<li key={ul.length}>{inline(b[1])}</li>); continue; }
    flush();
    if (/^#\s/.test(l)) out.push(<h3 key={out.length}>{inline(l.slice(2))}</h3>);
    else if (/^##\s/.test(l)) out.push(<h4 key={out.length}>{inline(l.slice(3))}</h4>);
    else if (l.trim()) out.push(<p key={out.length}>{inline(l)}</p>);
  }
  flush();
  return out;
}
function saveText(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fmtDate = (t: string) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
/** What the server takes for a pack: the parts people edit. */
const toInput = (p: BrandPack) => ({ voice: p.voice, negative: p.negative, competitors: p.competitors, claims: p.claims, frameworks: p.frameworks,
  guideline: p.guideline ? { documentId: (p.guideline as Guideline).documentId } : null });

function card(title: string, right: ReactNode, body: ReactNode, key?: string): ReactNode {
  return <div key={key} className="panel" style={sx('margin-bottom:14px')}><div className="panel-hdr"><span className="panel-ttl">{title}</span>{right}</div><div className="panel-body">{body}</div></div>;
}
const label = (t: string) => <div style={sx('font-size:11px;font-weight:600;color:var(--i2);margin:12px 0 5px')}>{t}</div>;

export function ContentScreen() {
  const me = useSessionUser();
  const canEdit = useCan('brand.manage');
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('guidelines');
  const [modal, setModal] = useState<Modal | null>(null);
  const [modalError, setModalError] = useState('');
  const [suggest, setSuggest] = useState<{ name: string; items: (RuleSuggestion & { added?: boolean })[] } | null>(null);
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [clq, setClq] = useState(''), [clt, setClt] = useState(''), [cls, setCls] = useState(''), [clsel, setClsel] = useState<string | null>(null);
  const [fwf, setFwf] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [ctf, setCtf] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    let live = true;
    api<{ brand: Brand }>('/api/brand').then(r => { if (live) { setBrand(r.brand); if (TABS.some(([k]) => k === t)) setTab(t as Tab); } }, e => { if (live) setLoadError(errorText(e)); });
    // Where each claim was used in micro-segment drafts (5b); the tab works without it.
    api<Usage>('/api/brand/claims/usage').then(u => { if (live) setUsage(u); }, () => { /* shown as not used yet */ });
    // Content studio's pieces (D-36): the Content tab, and which pieces cite each claim.
    api<{ items: Piece[] }>('/api/studio/items').then(r => { if (live) setPieces(r.items); }, () => { if (live) setPieces([]); });
    return () => { live = false; };
  }, []);
  const reload = async () => setBrand((await api<{ brand: Brand }>('/api/brand')).brand);
  const go = (k: Tab) => { setTab(k); window.history.replaceState(null, '', '?tab=' + k); };

  if (!brand) return <main className="main" id="mainArea"><div className="topbar"><div className="topbar-l"><span className="tb-title">Content library</span></div></div>
    <div className="canvas"><div style={sx('font-size:12.5px;color:var(--i3)')} role={loadError ? 'alert' : 'status'}>{loadError || 'Loading…'}</div></div></main>;

  const live = brand.live, liveV = live.versionNo, pend = brand.draft;
  const draft = (pend ? pend.pack : live.pack) as unknown as BrandPack;
  const changed = pend ? pend.changes : [];
  const nChanges = changed.reduce((a, s) => a + s.lines.length, 0);
  const field = (id: string) => (formRef.current?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('#' + id)?.value ?? '').trim();

  /** Keeps a change in the unit's draft (the server says what it changes); nothing reaches drafts until it is saved. */
  async function commit(next: BrandPack, msg = 'Changed. Save to make it a new version') {
    if (!canEdit) return;
    try {
      await api('/api/brand/draft', { method: 'PUT', body: { pack: toInput(next), baseVersionNo: pend ? pend.baseVersionNo : liveV } });
      await reload();
      showToast(msg);
    } catch (e) {
      showToast(errorText(e));
      if (e instanceof ApiError && e.status === 409) await reload();
    }
  }
  const change = (f: (d: BrandPack) => void, msg?: string) => { const d = clone(draft); f(d); void commit(d, msg); };
  async function act(run: () => Promise<string>) {
    setBusy(true);
    try { const msg = await run(); setModal(null); await reload(); showToast(msg); }
    catch (e) { if (modal) setModalError(errorText(e)); else showToast(errorText(e)); }
    setBusy(false);
  }
  const saveVersion = () => act(async () => { const r = await api<{ versionNo: number }>('/api/brand/publish', { body: { note: '' } }); return `Saved as Brand v${r.versionNo}`; });
  const discard = () => act(async () => { await api('/api/brand/draft', { method: 'DELETE' }); return 'Unsaved changes discarded'; });
  const restore = (v: number) => act(async () => { const r = await api<{ versionNo: number }>('/api/brand/restore', { body: { versionNo: v } }); return `Brand v${v} restored as v${r.versionNo}`; });
  const openModal = (m: Modal) => { setModal(m); setModalError(''); };

  /* ─── Save bar: changes wait here until they are saved, and each save is a new version ─── */
  const saveBar = pend && nChanges ? <div className="pk"><span className="pk-i">✎</span>
    <div style={sx('flex:1;min-width:0')}><b>{`${nChanges} unsaved change${nChanges === 1 ? '' : 's'}`}</b>{` in ${changed.map(c => c.section).join(', ')}`}<div className="pk-s">{`Saving makes Brand v${liveV + 1}. Until then, drafts keep using Brand v${liveV}. Last change by ${pend.updatedBy}, ${fmtDate(pend.updatedAt)}.`}</div></div>
    <button className="btn btn-ghost btn-sm" onClick={() => openModal({ kind: 'changes' })}>See changes</button>
    {canEdit ? <><button className="btn btn-ghost btn-sm" onClick={() => openModal({ kind: 'discard' })}>Discard</button><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void saveVersion()}>{`Save as v${liveV + 1}`}</button></> : null}</div> : null;

  /* ─── Lists of words: chips with remove, and an input to add ─── */
  function chips(get: (d: BrandPack) => string[], ph: string, lower = false, id = 'chipAdd'): ReactNode {
    const list = get(draft);
    const add = () => {
      const el = document.getElementById(id) as HTMLInputElement | null, v = (el?.value ?? '').trim();
      if (!v) return;
      change(d => { const l = get(d); v.split(',').map(x => x.trim()).filter(Boolean).forEach(x => { const val = lower ? x.toLowerCase() : x; if (!l.some(y => y.toLowerCase() === val.toLowerCase())) l.push(val); }); }, 'Added. Save to make it a new version');
    };
    return <>
      <div className="tags" style={sx('margin-bottom:8px')}>{list.length ? list.map((w, i) => <span key={w + i} className="tag tag-grey">{w}{canEdit ? <>{' '}<button aria-label={`Remove ${w}`} onClick={() => change(d => { get(d).splice(i, 1); }, 'Removed. Save to make it a new version')} style={sx('margin-left:4px;color:var(--i3)')}>×</button></> : null}</span>) : <span style={sx('font-size:12px;color:var(--i3)')}>None yet.</span>}</div>
      {canEdit ? <div style={sx('display:flex;gap:8px')}><input id={id} aria-label={ph} placeholder={ph} style={sx(`flex:1;${FIELD}`)} onKeyDown={e => { if (e.key === 'Enter') add(); }} /><button className="btn btn-sec btn-sm" onClick={add}>Add</button></div> : null}
    </>;
  }

  /* ─── Brand guidelines: the reference document, rules read from it, and samples ─── */
  async function onGuideline(file: File | undefined) {
    if (!file) return;
    try {
      const items = /\.(txt|md)$/i.test(file.name) ? readRules(await file.text()) : null;
      const { document } = await uploadFile<{ document: { id: string; name: string } }>('/api/brand/documents', {}, file);
      const d = clone(draft); d.guideline = { documentId: document.id };
      await commit(d, `${file.name} added to the draft${items ? `; ${items.length} rule${items.length === 1 ? '' : 's'} found` : ''}`);
      setSuggest(items ? { name: file.name, items } : null);
    } catch (e) { showToast(errorText(e)); }
  }
  function guidelinesTab(): ReactNode {
    const g = draft.guideline as Guideline | null;
    return <>
      {card('Brand guideline document', null, <>
        {g ? <div style={sx('display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--rsm);margin-bottom:12px')}>
          <div style={sx('flex:1')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>{g.name}</div><div style={sx('font-size:11px;color:var(--i3)')}>{`${Math.max(1, Math.round(g.size / 1024))} KB · uploaded by ${g.by} on ${fmtDate(g.at)}`}</div></div>
          <a className="btn btn-sec btn-sm" href={`/api/brand/documents/${g.documentId}`} style={sx('text-decoration:none')}>Download</a>
          {canEdit ? <button className="btn btn-ghost btn-sm" onClick={() => { setSuggest(null); change(d => { d.guideline = null; }, 'Removed. Save to make it a new version'); }}>Remove</button> : null}</div> : null}
        {canEdit ? <label htmlFor="gFile" style={sx('display:block;border:1.5px dashed var(--bdk);border-radius:var(--rmd);padding:20px;cursor:pointer;background:var(--s50);text-align:center')}>
          <input type="file" id="gFile" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md" style={sx('display:none')} onChange={e => { void onGuideline(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
          <div style={sx('font-size:13px;font-weight:600;color:var(--i1)')}>{g ? 'Replace the guideline document' : 'Upload the brand guideline document'}</div>
          <div style={sx('font-size:11px;color:var(--i3);margin-top:3px')}>PDF, Word or PowerPoint up to 5 MB is kept as the reference. A .txt or .md file is also read for rules you can add in one click.</div></label> : null}
        {label('Key rules from the guidelines, in your words')}
        <textarea key={`notes-${pend?.updatedAt ?? liveV}`} readOnly={!canEdit} aria-label="Key rules from the guidelines" rows={5} defaultValue={draft.voice.notes || ''} style={sx(`width:100%;${FIELD};line-height:1.6`)}
          onBlur={e => { const v = e.currentTarget.value; if (v !== draft.voice.notes) change(d => { d.voice.notes = v; }); }} />
        <div style={sx('font-size:11px;color:var(--i3);margin-top:6px')}>{"For the reviewer's reference. What the drafts follow strictly is set on the other tabs: voice and tone, negative keywords, approved claims and the messaging frameworks."}</div>
      </>)}
      {suggest ? card('Rules found in the document', <span style={sx('font-size:11px;color:var(--i3)')}>{suggest.name}</span>, suggest.items.length
        ? suggest.items.map((x, i) => <div key={i} style={sx('display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--s75);font-size:12px')}>
          <span className="tag tag-grey">{x.kind}</span><span style={sx('flex:1;color:var(--i1)')}>{x.value}</span>
          {x.added ? <span style={sx('color:var(--pos);font-weight:600')}>Added</span> : canEdit ? <button className="btn btn-sec btn-sm" onClick={() => { void commit(applySuggestion(draft, x), 'Added. Save to make it a new version'); setSuggest(s => s && { ...s, items: s.items.map((y, k) => k === i ? { ...y, added: true } : y) }); }}>Add to the draft</button> : null}</div>)
        : <div style={sx('font-size:12px;color:var(--i3)')}>{'No rules in a form the system can read. Lines like "Never use the word synergy", "Do not mention Acme", "Always sign off as …", "Keep emails under 120 words" or "Tone: formal" are picked up.'}</div>) : null}
      {card('Samples', <span style={sx('font-size:11px;color:var(--i3)')}>what a good guideline looks like</span>, <>
        <div className="smp">{SAMPLES.map(s => <div key={s.id} className="smp-c"><div className="smp-doc md">{md(s.text.split('\n').slice(0, 9).join('\n'))}</div>
          <div className="smp-b"><b>{s.title}</b><div>{s.about}</div>
            <div className="smp-a"><button className="btn btn-ghost btn-sm" onClick={() => openModal({ kind: 'sample', id: s.id })}>Preview</button><button className="btn btn-sec btn-sm" onClick={() => saveText(s.file, s.text)}>↓ Download</button></div></div></div>)}</div>
        <div className="su-tip">{'Download a sample, then upload it back with "Upload the brand guideline document". Its rules (banned words, competitors, sign-off, length, tone) are read and offered to add in one click.'}</div>
        <div className="gp" style={sx('margin-top:14px')}>{GUIDE_PARTS.map(([t, d], i) => <div key={t} className="gp-i"><span className="gp-n">{i + 1}</span><div><b>{t}</b><div>{d}</div></div></div>)}</div>
      </>)}
    </>;
  }

  /* ─── Voice and tone ─── */
  function voiceTab(): ReactNode {
    const v = draft.voice, pre = VOICE_PRESETS[v.preset] || VOICE_PRESETS.Direct;
    const sample = `${pre.greeting.replace('{first}', 'Aditi')}\n\n${TONE_SAMPLE[v.preset] || TONE_SAMPLE.Direct}\n\n${pre.closing}\n${v.signoff || 'Client Team'}`;
    const num = (k: 'maxWords' | 'maxSentenceWords', l: string) => <div>{label(l)}<input key={`${k}-${v[k]}`} readOnly={!canEdit} aria-label={l} type="number" defaultValue={v[k]} style={sx(`width:100%;${FIELD}`)}
      onBlur={e => { const n = +e.currentTarget.value; if (n !== v[k]) change(d => { d.voice[k] = n; }); }} /></div>;
    return <>
      {card('Voice', null, <div style={sx('display:grid;grid-template-columns:repeat(3,1fr);gap:10px')}>{Object.entries(VOICE_PRESETS).map(([k, p]) => <button key={k} disabled={!canEdit} onClick={() => change(d => { d.voice.preset = k; }, `Voice set to ${k}. Save to make it a new version`)}
        style={sx(`text-align:left;padding:12px;border-radius:var(--rsm);border:1px solid ${v.preset === k ? 'var(--brand)' : 'var(--border)'};background:${v.preset === k ? 'var(--brand-lt)' : 'var(--surf)'}`)}>
        <div style={sx('font-size:13px;font-weight:700;color:var(--i1)')}>{k}</div><div style={sx('font-size:11.5px;color:var(--i2);margin-top:3px;line-height:1.5')}>{p.about}</div>
        <div style={sx('font-size:11px;color:var(--i3);margin-top:6px')}>{`${p.greeting.replace('{first}', 'Aditi')} … ${p.closing}`}</div></button>)}</div>)}
      {card('Rules every draft must meet', null, <>
        <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:4px 18px')}>
          <div>{label('Sign-off')}<input key={`so-${v.signoff}`} readOnly={!canEdit} aria-label="Sign-off" defaultValue={v.signoff || ''} style={sx(`width:100%;${FIELD}`)} onBlur={e => { const s = e.currentTarget.value.trim(); if (s !== v.signoff) change(d => { d.voice.signoff = s; }); }} /></div>
          {num('maxWords', 'Email length (words, at most)')}
          {num('maxSentenceWords', 'Sentence length (words, at most)')}
          <div>{label('Punctuation')}<label style={sx('display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--i1);padding:8px 0')}><input type="checkbox" disabled={!canEdit} checked={!!v.noExclamation} onChange={e => { const c = e.currentTarget.checked; change(d => { d.voice.noExclamation = c; }); }} style={sx('accent-color:var(--brand)')} />No exclamation marks</label></div>
        </div>
        {label('Openers to avoid')}{chips(d => d.voice.bannedOpeners, 'e.g. Just checking in', false, 'addOpener')}
        <div style={sx('font-size:11px;color:var(--i3);margin-top:8px')}>A draft that breaks one of these is rewritten once automatically; if it still breaks it, it goes to a person in For Review.</div></>)}
      {card('Preview', <span style={sx('font-size:11px;color:var(--i3)')}>{`changes with the voice you pick: ${v.preset}`}</span>, <pre style={sx('white-space:pre-wrap;font-family:var(--fb);font-size:12.5px;color:var(--i1);line-height:1.6;margin:0;padding:12px;background:var(--s50);border-radius:var(--rsm)')}>{sample}</pre>)}
    </>;
  }

  /* ─── Negative keywords and competitors ─── */
  const negativeTab = (): ReactNode => <>
    {card('Negative keywords', <span style={sx('font-size:11px;color:var(--i3)')}>{`${draft.negative.length} words or phrases`}</span>, <><div style={sx('font-size:12px;color:var(--i2);margin-bottom:10px')}>Words and phrases a draft must never use. A draft that contains one is rewritten once, then sent to a person.</div>{chips(d => d.negative, 'Add words or phrases, separated by commas', true, 'addNegative')}</>)}
    {card('Competitor names', null, <><div style={sx('font-size:12px;color:var(--i2);margin-bottom:10px')}>Never named in a draft.</div>{chips(d => d.competitors, 'Add a competitor', false, 'addCompetitor')}</>)}
    {card('Always checked', null, <div style={sx('font-size:12px;color:var(--i2);line-height:1.6')}>Pricing and commercial terms are left to the account team. A plant incident, security or regulation sends the item to the sales manager for approval.</div>)}
  </>;

  /* ─── Approved claims: the only claims a draft may make, each with its source, owner and expiry ─── */
  function claimsTab(): ReactNode {
    const today = todayIso(), cs = draft.claims;
    const topics = [...new Set(cs.flatMap(c => c.segments || []))].sort();
    const q = clq.toLowerCase();
    const list = cs.filter(c => (!q || `${c.claim} ${c.title} ${c.id}`.toLowerCase().includes(q)) && (!clt || (c.segments || []).includes(clt)) && (!cls || claimStatus(c, today) === cls));
    const sel = cs.find(c => c.id === clsel) ?? list[0] ?? null;
    return <>
      <div className="cl-intro">The only claims a draft can make, each with its source. A draft cites an approved, unexpired claim word for word; any other claim sends the item to a person in For Review.</div>
      <div className="cl-tools">
        <div className="cl-q"><input aria-label="Search claims" placeholder="Search claims, sources or IDs" value={clq} onChange={e => { setClq(e.currentTarget.value); setClsel(null); }} /></div>
        <select aria-label="Topic" value={clt} onChange={e => { setClt(e.currentTarget.value); setClsel(null); }}><option value="">All topics</option>{topics.map(t => <option key={t}>{t}</option>)}</select>
        <select aria-label="Status" value={cls} onChange={e => { setCls(e.currentTarget.value); setClsel(null); }}><option value="">All statuses</option>{['Approved', 'Expired', 'Draft', 'Retired'].map(s => <option key={s}>{s}</option>)}</select>
        <span style={sx('flex:1')}></span>
        {canEdit ? <><button className="btn btn-sec btn-sm" onClick={() => openModal({ kind: 'fromReview' })}>From For Review{usage?.fromReview.length ? <> <span className="cnt">{usage.fromReview.length}</span></> : null}</button>
          <button className="btn btn-primary btn-sm" onClick={() => openModal({ kind: 'claim' })}>Add a claim</button></> : null}
      </div>
      <div className="cl-grid">
        <div className="panel" style={sx('margin:0;overflow:hidden')}><table className="cl-t"><thead><tr><th style={sx('width:44%')}>Claim</th><th style={sx('width:20%')}>Topics</th><th style={sx('width:12%')}>Expires</th><th style={sx('width:13%')}>Last used</th><th style={sx('width:11%')}>Status</th></tr></thead><tbody>
          {list.length ? list.map(c => { const st = claimStatus(c, today); return <tr key={c.id} className={sel && c.id === sel.id ? 'sel' : ''} onClick={() => setClsel(c.id)}>
            <td><div className="cl-c">{c.claim}</div><div className="cl-s">{`${c.id} · ${c.type}, ${c.year} · ${c.title}`}</div></td>
            <td>{(c.segments || []).slice(0, 2).map(t => <span key={t} className="tag tag-grey" style={sx('margin-right:4px')}>{t}</span>)}{(c.segments || []).length > 2 ? <span className="cl-s">{`+${c.segments.length - 2}`}</span> : null}</td>
            <td>{c.expiry}</td><td>{lastUsed(c)}</td><td><span className={`tag ${STATUS_TONE[st]}`}>{st}</span></td></tr>; }) : <tr><td colSpan={5} className="cl-s" style={sx('padding:18px')}>No claim matches.</td></tr>}
        </tbody></table></div>
        {sel ? claimPane(sel, claimStatus(sel, today)) : null}
      </div>
    </>;
  }
  const usesOf = (c: Claim) => usage?.use[c.id] ?? [];
  const fmtDay = (t: string) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const afterExpiry = (c: Claim) => usesOf(c).filter(u => u.at.slice(0, 10) > c.expiry).length;
  function lastUsed(c: Claim): ReactNode {
    const uses = usesOf(c), af = afterExpiry(c);
    if (!uses.length) return <span className="cl-s">Not used yet</span>;
    return <>{fmtDay(uses[0].at)}<div className="cl-s">{`${uses.length} message${uses.length === 1 ? '' : 's'}`}</div>{af ? <div className="cl-warn">{`${af} after expiry`}</div> : null}</>;
  }
  function claimPane(c: Claim, st: ClaimStatus): ReactNode {
    const setClaim = (f: (x: Claim) => void, msg: string) => change(d => { const x = d.claims.find(y => y.id === c.id); if (x) f(x); }, msg);
    return <div className="panel cl-pane" style={sx('margin:0')}><div className="panel-hdr"><span className="panel-ttl">{c.id}</span><span className={`tag ${STATUS_TONE[st]}`}>{st}</span></div><div className="panel-body">
      <div className="cl-c" style={sx('font-size:13.5px;line-height:1.55;margin-bottom:12px')}>{`“${c.claim}”`}</div>
      {([['Source', `${c.title} · ${c.type}, ${c.year}`], ['Topics it fits', (c.segments || []).join(', ')], ['Owner', c.owner || '—'], ['Expires', c.expiry]] as [string, string][]).map(([k, v]) => <div key={k} className="cl-kv"><span>{k}</span><b>{v}</b></div>)}
      {(() => { const uses = usesOf(c), out = uses.filter(u => u.out); return <div className="cl-kv"><span>Where it was used</span><b>{uses.length ? `${uses.length} drafted message${uses.length === 1 ? '' : 's'}, ${out.length} sent` : 'Not used yet'}</b>
        {uses.slice(0, 5).map((u, k) => <div key={k} className="cl-u">{`${u.who} · ${u.account}`}<span>{`${fmtDay(u.at)}${u.out ? ' · sent' : ''}`}</span></div>)}{uses.length > 5 ? <div className="cl-s">{`and ${uses.length - 5} more`}</div> : null}</div>; })()}
      {(() => { const ps = (pieces ?? []).filter(p => p.cited.includes(c.id)); return <div className="cl-kv"><span>In content</span><b>{ps.length ? `${ps.length} piece${ps.length === 1 ? '' : 's'}` : 'None yet'}</b>
        {ps.map(p => <div key={p.id} className="cl-u"><a href={`/studio?item=${p.id}`} style={sx('color:var(--brand-dk);text-decoration:none')}>{p.title}</a><span>{p.status === 'Ready' ? 'in the library' : 'draft'}</span></div>)}</div>; })()}
      {afterExpiry(c) ? <div className="cl-alert">{`Used ${afterExpiry(c)} time${afterExpiry(c) === 1 ? '' : 's'} after it expired on ${c.expiry}. Renew the source or retire the claim.`}</div>
        : st === 'Expired' ? <div className="cl-alert">{`Expired on ${c.expiry}: drafts that cite it fail the claim check. Renew the source and its date, or retire the claim.`}</div> : null}
      {canEdit ? <div className="cl-act">
        <select aria-label="Claim status" value={c.status} onChange={e => { const s = e.currentTarget.value; setClaim(x => { x.status = s; }, 'Status changed. Save to make it a new version'); }}>{['approved', 'draft', 'retired'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select>
        <label>Expires <input key={`exp-${c.id}-${c.expiry}`} type="date" defaultValue={c.expiry} onBlur={e => { const v = e.currentTarget.value; if (v && v !== c.expiry) setClaim(x => { x.expiry = v; }, 'Expiry changed. Save to make it a new version'); }} /></label>
        <label>Owner <input key={`own-${c.id}-${c.owner}`} defaultValue={c.owner || ''} style={sx('width:140px')} onBlur={e => { const v = e.currentTarget.value.trim(); if (v !== (c.owner || '')) setClaim(x => { x.owner = v; }, 'Owner changed. Save to make it a new version'); }} /></label>
      </div> : null}
    </div></div>;
  }
  function addClaim() {
    const claim = field('cClaim').replace(/\s+/g, ' '), title = field('cTitle'), exp = field('cExp'), owner = field('cOwner');
    if (!claim || !title || !exp) { setModalError('Add the claim, its source and an expiry date'); return; }
    const d = clone(draft), id = nextClaimId(d.claims);
    d.claims.push({ id, type: field('cType'), year: +field('cYear') || new Date().getFullYear(), title, segments: claimFits(claim + ' ' + title), expiry: exp, claim: /[.!?]$/.test(claim) ? claim : claim + '.', status: 'approved', owner: owner || me.displayName });
    setModal(null); setClsel(id);
    void commit(d, 'Claim added. Save to make it a new version');
  }

  /* ─── Messaging frameworks: what each one is for, its structure, and how often the team uses it ─── */
  function frameworkTab(): ReactNode {
    const list = draft.frameworks, byUse = (u: string) => list.filter(f => f.use === u).length;
    const order = list.map((f, i) => ({ f, i })).filter(o => !fwf || o.f.use === fwf).sort((a, b) => USE.indexOf(a.f.use) - USE.indexOf(b.f.use));
    const often = list.filter(f => f.use === 'Often');
    return <>
      <div style={sx('font-size:12.5px;color:var(--i2);margin-bottom:12px;line-height:1.55')}>The frameworks the team writes with, by objective: what a message is for, the framework that gets there, its structure and how often the team uses it.</div>
      <div className="stats fw-stats">{USE.map(u => <a key={u} className={`stat stat-link ${fwf === u ? 'on' : ''}`} href="#" title="Show only these" onClick={e => { e.preventDefault(); setFwf(fwf === u ? null : u); }}>
        <div className="stat-lbl">{u === 'Not used' ? 'Not used' : 'Used ' + u.toLowerCase()}</div><div className={`stat-val ${u === 'Often' ? 'sv4' : u === 'Sometimes' ? 'sv2' : u === 'Rarely' ? 'sv3' : 'sv5'}`}>{byUse(u)}</div><div className="stat-sub">{`framework${byUse(u) === 1 ? '' : 's'}`}</div></a>)}</div>
      {often.length ? <div style={sx('font-size:12px;color:var(--i2);margin:0 0 10px')}>Used most: {often.map((f, i) => <span key={f.objective}>{i ? '; ' : ''}<b>{f.name}</b>{` to ${f.objective.charAt(0).toLowerCase() + f.objective.slice(1)}`}</span>)}.</div> : null}
      {card('Frameworks by objective', <div style={sx('display:flex;gap:10px;align-items:center')}><span style={sx('font-size:11px;color:var(--i3)')}>{`${list.length} framework${list.length === 1 ? '' : 's'}`}</span>{canEdit ? <button className="btn btn-sec btn-sm" onClick={() => openModal({ kind: 'framework', index: -1 })}>+ Add a framework</button> : null}</div>,
        <div className="fw-t"><div className="fw-r fw-hd"><div>Objective</div><div>Framework and structure</div><div>How often used</div><div></div></div>
          {order.map(({ f, i }) => <div key={f.objective} className="fw-r">
            <div className="fw-o">{f.objective}</div>
            <div><b className="fw-n">{f.name}</b><ol className="fw-s">{f.steps.map((s, k) => <li key={k}>{s}</li>)}</ol></div>
            <div><span className={`tag ${USE_TONE[f.use] || 'tag-grey'}`}>{f.use}</span></div>
            <div className="fw-e">{canEdit ? <button className="btn btn-ghost btn-sm" onClick={() => openModal({ kind: 'framework', index: i })}>Edit</button> : null}</div></div>)}</div>)}
    </>;
  }
  function saveFramework(i: number) {
    const steps = field('fwSteps').split('\n').map(x => x.trim()).filter(Boolean);
    if (!field('fwObj') || !field('fwName') || !steps.length) { setModalError('Add the objective, the framework and its structure'); return; }
    const d = clone(draft), f: Framework = { objective: field('fwObj'), name: field('fwName'), steps, use: field('fwUse'), actions: i >= 0 ? d.frameworks[i].actions || [] : [] };
    if (i >= 0) d.frameworks[i] = f; else d.frameworks.push(f);
    setModal(null);
    void commit(d, i >= 0 ? 'Changed. Save to make it a new version' : 'Framework added. Save to make it a new version');
  }

  /* ─── Versions: every save, who made it, and exactly what changed; an earlier one can be restored ─── */
  /* Content: the pieces written in Content studio; those in the library are what reps add to messages. */
  function contentTab(): ReactNode {
    const all = pieces ?? [], inLib = all.filter(p => p.status === 'Ready'), drafts = all.filter(p => p.status !== 'Ready');
    const used = all.reduce((n, p) => n + p.usage, 0), citing = inLib.filter(p => p.cited.length).length;
    const list = ctf === 'draft' ? drafts : ctf === 'used' ? all.filter(p => p.usage) : inLib;
    const tile = (f: string | null, l: string, v: number, sub: string) => <a key={f ?? 'lib'} className={'stat stat-link' + (ctf === f ? ' on' : '')} href="#" onClick={e => { e.preventDefault(); setCtf(ctf === f ? null : f); }}>
      <div className="stat-lbl">{l}</div><div className="stat-val">{v}</div><div className="stat-sub">{sub}</div></a>;
    return <>
      <div className="stats" style={sx('grid-template-columns:repeat(4,1fr);margin-bottom:16px')}>
        {tile(null, 'In the library', inLib.length, `${inLib.filter(p => p.type === 'blog').length} blogs · ${inLib.filter(p => p.type === 'whitepaper').length} whitepapers`)}
        {tile('draft', 'Drafts in Content studio', drafts.length, 'not in the library yet')}
        {tile('used', 'In messages', used, 'added by reps')}
        <div className="stat"><div className="stat-lbl">Cite approved claims</div><div className="stat-val">{citing}</div><div className="stat-sub">of {inLib.length} in the library</div></div></div>
      {card(ctf === 'draft' ? 'Drafts in Content studio' : ctf === 'used' ? 'Content in messages' : 'Content in the library', <a className="btn btn-sec btn-sm" href="/studio" style={sx('text-decoration:none')}>✎ Write in Content studio</a>,
        !pieces ? <div className="cl-s">Loading…</div> : list.length ? <table className="dt" style={sx('table-layout:auto')}><thead><tr><th>Content</th><th>Status</th><th>Claims it cites</th><th className="num">In messages</th><th /></tr></thead><tbody>
          {list.map(p => <tr key={p.id}>
            <td><span className="dt-main">{p.title}</span><span className="sub">{p.type === 'whitepaper' ? 'Whitepaper' : 'Blog'} · {p.updatedBy}, {fmtDay(p.updatedAt)}</span></td>
            <td>{p.status === 'Ready' ? <span className="tag tag-green">In the library</span> : <span className="tag tag-grey">Draft</span>}{p.issues ? <div className="cl-warn">{`${p.issues} check${p.issues > 1 ? 's' : ''} to fix`}</div> : null}<div className="cl-s">Brand v{p.brandVersionNo}</div></td>
            <td>{p.cited.length ? p.cited.join(' ') : <span className="cl-s">No product claims</span>}</td>
            <td className="num">{p.usage}</td>
            <td style={sx('text-align:right;white-space:nowrap')}><a className="btn btn-ghost btn-sm" href={`/studio?item=${p.id}`} style={sx('text-decoration:none')}>Open</a>{' '}
              <a className="btn btn-sec btn-sm" href={`/api/studio/items/${p.id}/docx`} style={sx('text-decoration:none')}>↓ Word</a></td></tr>)}
        </tbody></table> : <div className="cl-s" style={sx('padding:6px 0')}>{ctf === 'draft' ? 'No drafts.' : ctf === 'used' ? 'No content in messages yet.' : 'Nothing in the library yet. Write a piece in Content studio and add it to the library when its checks pass.'}</div>)}
    </>;
  }
  const versionsTab = (): ReactNode => card('Versions', <span style={sx('font-size:11px;color:var(--i2)')}>{`In use: Brand v${liveV}`}</span>, <>
    <div style={sx('font-size:12px;color:var(--i2);margin-bottom:10px')}>Each save is a new version: guidelines, messaging frameworks, voice, keywords and claims together. Only the latest reaches new drafts; earlier versions are kept, and restoring one makes it the latest again.</div>
    {brand.versions.map(h => { const open = openVersion === h.versionNo, kickoff = h.versionNo === 1 && !h.restoredFrom;
      return <div key={h.versionNo} className="vr"><div className="vr-h" onClick={h.changes.length ? () => setOpenVersion(open ? null : h.versionNo) : undefined} style={h.changes.length ? sx('cursor:pointer') : undefined}>
        <b className="vr-v">{`v${h.versionNo}`}</b>{h.versionNo === liveV ? <span className="tag tag-green">In use</span> : null}
        <span className="vr-n">{h.note}{h.sections.length ? <span className="vr-tags">{h.sections.map(x => <span key={x} className="tag tag-grey">{x}</span>)}</span> : null}</span>
        <span className="vr-m">{kickoff ? 'Kickoff' : `${fmtDate(h.at)} · ${h.by}`}</span>
        {h.changes.length ? <span className="vr-x">{`${open ? '▾' : '▸'} ${h.changes.length} change${h.changes.length === 1 ? '' : 's'}`}</span> : null}
        {canEdit && h.versionNo !== liveV ? <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openModal({ kind: 'restore', versionNo: h.versionNo }); }}>Restore</button> : null}</div>
        {open ? <div className="vr-b">{h.changes.map((l, i) => <div key={i}>{l}</div>)}</div> : null}</div>; })}
  </>);

  function modalBody(m: Modal): ReactNode {
    const title = (t: string) => <div style={sx('font-family:var(--fd);font-size:16px;font-weight:700;color:var(--i1);margin-bottom:12px')}>{t}</div>;
    const err = <div role="alert" style={sx('font-size:12px;color:var(--neg);min-height:16px')}>{modalError}</div>;
    const close = <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>Cancel</button>;
    if (m.kind === 'changes') return <>{title(`What Brand v${liveV + 1} changes`)}
      <div style={sx('font-size:12px;color:var(--i3);margin:-6px 0 14px')}>{`Saved together as one version. Brand v${liveV} is kept.`}</div>
      {changed.map(x => <div key={x.section} className="rc"><div className="rc-h">{x.section}<span>{x.lines.length}</span></div>{x.lines.map((l, i) => <div key={i} className="rc-l">{l}</div>)}</div>)}
      <div style={sx('display:flex;gap:8px;justify-content:flex-end;margin-top:16px')}><button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>Close</button>{canEdit ? <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void saveVersion()}>{`Save as v${liveV + 1}`}</button> : null}</div></>;
    if (m.kind === 'discard') return <>{title('Discard the unsaved changes?')}
      <div style={sx('font-size:12.5px;color:var(--i2);margin-bottom:14px')}>{`${nChanges} change${nChanges === 1 ? '' : 's'} in ${changed.map(c => c.section).join(', ')}. Brand v${liveV} stays in use.`}</div>{err}
      <div style={sx('display:flex;gap:8px;justify-content:flex-end')}>{close}<button className="btn btn-danger btn-sm" disabled={busy} onClick={() => void discard()}>Discard</button></div></>;
    if (m.kind === 'restore') return <>{title(`Restore Brand v${m.versionNo}?`)}
      <div style={sx('font-size:12.5px;color:var(--i2);margin-bottom:14px;line-height:1.55')}>{`It becomes Brand v${liveV + 1}, and new drafts follow it. Brand v${liveV} and every earlier version are kept.${pend ? ' Save or discard the unsaved changes first.' : ''}`}</div>{err}
      <div style={sx('display:flex;gap:8px;justify-content:flex-end')}>{close}<button className="btn btn-primary btn-sm" disabled={busy || !!pend} onClick={() => void restore(m.versionNo)}>{`Restore v${m.versionNo}`}</button></div></>;
    if (m.kind === 'sample') { const s = SAMPLES.find(x => x.id === m.id)!; return <>
      <div style={sx('display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px')}><div style={sx('font-family:var(--fd);font-size:16px;font-weight:700;color:var(--i1)')}>{s.title}</div><button className="btn btn-sec btn-sm" onClick={() => saveText(s.file, s.text)}>↓ Download</button></div>
      <div className="md">{md(s.text)}</div>
      <div style={sx('display:flex;justify-content:flex-end;margin-top:14px')}><button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>Close</button></div></>; }
    if (m.kind === 'fromReview') { const F = usage?.fromReview ?? []; return <>{title('Approved in For Review')}
      <div style={sx('font-size:12px;color:var(--i3);margin:-6px 0 12px;line-height:1.5')}>Sentences a person approved in a message that are not approved claims yet. Add one here and it is checked as approved from the next version, so it isn&apos;t approved again.</div>
      {F.length ? F.map((f, k) => <div key={k} className="rv-c" style={sx('padding:10px 0;border-top:1px solid var(--s75)')}><div className="cl-c">{`“${f.text}”`}</div><div className="cl-s">{`${f.account}${f.by ? ` · approved by ${f.by}` : ''} · ${fmtDay(f.at)}`}</div>
        <button className="btn btn-sec btn-sm" style={sx('margin-top:6px')} onClick={() => openModal({ kind: 'claim', pre: f.text })}>Add as a claim</button></div>)
        : <div className="cl-s" style={sx('padding:10px 0')}>Nothing yet. When someone edits a message in For Review, adds a claim and approves it, the claim shows up here.</div>}
      <div style={sx('display:flex;justify-content:flex-end;margin-top:12px')}><button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>Close</button></div></>; }
    if (m.kind === 'claim') return <>{title('Add a claim')}
      <label className="af"><span>The claim, exactly as a draft may say it</span><textarea id="cClaim" rows={3} maxLength={600} defaultValue={m.pre ?? ''} placeholder="A comparable site … within one planned shutdown." /></label>
      <div className="af-row"><label className="af" style={sx('flex:2')}><span>Source title</span><input id="cTitle" maxLength={200} placeholder="Case study title" /></label>
        <label className="af"><span>Type</span><select id="cType">{CLAIM_TYPES.map(t => <option key={t}>{t}</option>)}</select></label></div>
      <div className="af-row"><label className="af"><span>Year</span><input id="cYear" type="number" defaultValue={new Date().getFullYear()} /></label><label className="af"><span>Expires</span><input id="cExp" type="date" /></label>
        <label className="af"><span>Owner</span><input id="cOwner" maxLength={120} defaultValue={me.displayName} /></label></div>
      {err}<div style={sx('display:flex;gap:8px;justify-content:flex-end')}>{close}<button className="btn btn-primary btn-sm" onClick={addClaim}>Add as approved</button></div></>;
    const f = m.index >= 0 ? draft.frameworks[m.index] : { objective: '', name: '', steps: [] as string[], use: 'Sometimes', actions: [] as string[] };
    return <>{title(m.index >= 0 ? 'Edit the framework' : 'Add a framework')}
      <div className="af-row"><label className="af"><span>Objective: what the message is for</span><input id="fwObj" maxLength={200} defaultValue={f.objective} placeholder="e.g. Win back a lost account" /></label>
        <label className="af"><span>Framework</span><input id="fwName" maxLength={120} defaultValue={f.name} placeholder="e.g. Problem, agitate, solve" /></label></div>
      <label className="af"><span>Structure, one step per line</span><textarea id="fwSteps" rows={4} defaultValue={f.steps.join('\n')} placeholder={'The problem they face\nWhat waiting costs them\nThe approach that solves it'} /></label>
      <label className="af" style={sx('max-width:220px')}><span>How often used</span><select id="fwUse" defaultValue={f.use}>{USE.map(u => <option key={u}>{u}</option>)}</select></label>
      {err}
      <div style={sx('display:flex;gap:8px;justify-content:space-between;margin-top:6px')}>{m.index >= 0 ? <button className="btn btn-ghost btn-sm" style={sx('color:var(--neg)')} onClick={() => { const d = clone(draft); d.frameworks.splice(m.index, 1); setModal(null); void commit(d, 'Removed from the draft'); }}>Remove</button> : <span></span>}
        <span style={sx('display:flex;gap:8px')}>{close}<button className="btn btn-primary btn-sm" onClick={() => saveFramework(m.index)}>Done</button></span></div></>;
  }

  const body: Record<Tab, () => ReactNode> = { guidelines: guidelinesTab, framework: frameworkTab, voice: voiceTab, negative: negativeTab, claims: claimsTab, content: contentTab, versions: versionsTab };
  return <>
    <main className="main" id="mainArea">
      <div className="topbar"><div className="topbar-l"><span className="tb-title">Content library</span><span className="tb-badge badge-neutral">{`Brand v${liveV}`}</span></div></div>
      <div className="ftabs">{TABS.map(([k, l]) => <div key={k} className={`ftab ${tab === k ? 'active' : ''}`} onClick={() => go(k)}>{l}{changed.some(c => SECTION_OF[c.section] === k) ? <>{' '}<span className="chg-dot" title="Changed, not saved yet"></span></> : null}</div>)}</div>
      <div className="canvas cl-canvas">
        {saveBar}
        {!canEdit ? <div style={sx('font-size:12px;color:var(--i3);margin-bottom:14px')}>View only: the admin and the sales manager maintain the brand pack.</div> : null}
        {body[tab]()}
      </div>
    </main>
    {modal ? <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
      <div ref={formRef} role="dialog" aria-modal="true" aria-label={modal.kind === 'claim' ? 'Add a claim' : modal.kind === 'fromReview' ? 'Approved in For Review' : modal.kind === 'framework' ? 'Framework' : 'Content library'}
        style={sx(`background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:${modal.kind === 'sample' || modal.kind === 'framework' ? 680 : modal.kind === 'claim' ? 620 : 560}px;max-width:100%;max-height:88vh;overflow:auto;padding:22px`)}>{modalBody(modal)}</div>
    </div> : null}
  </>;
}
