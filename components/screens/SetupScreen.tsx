'use client';

/* Port of legacy/09-setup.html. The original kept its data in module-level arrays that the handlers mutated and then
   re-rendered #mainArea with innerHTML (renderMain). Here the same data lives in a ref (mutated the same way) and
   renderMain() bumps a counter; the rendered content is keyed by that counter so every renderMain recreates the DOM,
   exactly like innerHTML did (inputs reset to the data, focus lost, no CSS transitions on the toggles).
   fitFloor is changed without a re-render, as in the original — the summary text picks it up on the next render. */
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { showToast } from '@/lib/ui';
import { sx } from '@/lib/sx';

type StepStatus = 'todo' | 'review' | 'done';
type StepId = 'scope' | 'rubric' | 'personas' | 'signals' | 'actions' | 'brand' | 'users';
interface Step { id: StepId; num: number; title: string; status: StepStatus }
interface RubricRow { name: string; levels: string; weight: number }
type SignalGroup = 'Ready' | 'Needs data' | 'Needs enabling';
interface Signal { code: string; name: string; group: SignalGroup; on: boolean }
interface SetupUser { name: string; role: string; email: string; status?: 'active' | 'invited' }

interface SetupData {
  expandedWorking: Set<string>;
  STEPS: Step[];
  RUBRIC: RubricRow[];
  fitFloor: number;
  SIGNALS: Signal[];
  PERSONAS: string[];
  USERS: SetupUser[];
  ACTIONS_LIB: Record<string, string[]>;
}

function initData(): SetupData {
  return {
    expandedWorking: new Set(),
    STEPS: [
      { id: 'scope', num: 1, title: 'Scope', status: 'done' },
      { id: 'rubric', num: 2, title: 'ICP and rubric', status: 'review' },
      { id: 'personas', num: 3, title: 'Personas', status: 'done' },
      { id: 'signals', num: 4, title: 'Signals', status: 'review' },
      { id: 'actions', num: 5, title: 'Actions', status: 'todo' },
      { id: 'brand', num: 6, title: 'Brand', status: 'done' },
      { id: 'users', num: 7, title: 'Users', status: 'done' },
    ],
    RUBRIC: [
      { name: 'Vertical', levels: 'Core (100) · Adjacent (50) · Other (0)', weight: 30 },
      { name: 'Company size', levels: 'Above target (100) · In target (70) · Below (20)', weight: 20 },
      { name: 'Site profile', levels: 'Suits product (100) · Partly (50) · Unknown (30)', weight: 20 },
      { name: 'Relationship', levels: 'Other-line customer (100) · Past (70) · None (40)', weight: 15 },
      { name: 'Account type', levels: 'Owner-operator (100) · EPC (60) · Distributor (20)', weight: 10 },
      { name: 'Contact coverage', levels: 'Buying role present (100) · Other roles (40) · None (0)', weight: 5 },
    ],
    fitFloor: 50,
    SIGNALS: [
      { code: 'C1a', name: 'Financing / project finance', group: 'Ready', on: true },
      { code: 'C1b', name: 'Hiring surge, control/automation roles', group: 'Ready', on: true },
      { code: 'C1c', name: 'New executive in a buying role', group: 'Ready', on: true },
      { code: 'C1i', name: 'Capital project / expansion announcement', group: 'Ready', on: true },
      { code: 'C1q', name: 'LinkedIn posts from target-account people', group: 'Ready', on: true },
      { code: 'C1g', name: 'Compliance deadline', group: 'Needs data', on: true },
      { code: 'C1n', name: 'Champion changes jobs', group: 'Needs data', on: true },
      { code: 'C1w', name: 'Content download / webinar attendance', group: 'Needs data', on: false },
      { code: 'C1j', name: 'Competitor contract at the site', group: 'Needs enabling', on: true },
      { code: 'C1t / C1v', name: 'Researching us / a competitor on G2', group: 'Needs enabling', on: false },
      { code: 'C1u', name: 'Visited Client’s website', group: 'Needs enabling', on: false },
    ],
    PERSONAS: ['Plant Manager / Owner-operator', 'Head of Process Safety', 'Director of Automation', 'VP / Director of Operations', 'Chief Digital Officer'],
    USERS: [
      { name: 'Pavan Kumar', role: 'Sales manager', email: 'pavan.kumar@client.com', status: 'active' },
      { name: 'Sofia Ahlgren', role: 'Sales rep', email: 'sofia.ahlgren@client.com', status: 'active' },
      { name: 'Marcus Webb', role: 'Sales rep', email: 'marcus.webb@client.com', status: 'active' },
      { name: 'Elena Vogel', role: 'Viewer', email: 'elena.vogel@client.com', status: 'invited' },
      { name: 'Rajiv Nair', role: 'Admin', email: 'rajiv.nair@client.com', status: 'active' },
      { name: 'Shantanu Rao', role: 'Platform admin', email: 'shantanu.rao@partner.com', status: 'active' },
    ],
    ACTIONS_LIB: {}, // segment -> [actions], starts empty ('todo')
  };
}

function statusBadge(status: StepStatus): ReactNode {
  if (status === 'done') return <span className="sc sc-h">Signed off</span>;
  if (status === 'review') return <span className="sc sc-m">Draft — needs sign-off</span>;
  return <span className="sc sc-l">Not started</span>;
}

const NUM_STYLE = 'width:56px;border:1px solid var(--bdk);border-radius:6px;padding:4px 6px;font-size:11.5px;text-align:center';
const DIM_ROW = 'border:none;padding:4px 0';
const DIM_L = 'font-size:11.5px;color:var(--i3)';
const DIM_R = 'font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600';
const MODAL_TITLE = 'font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:14px';
const FIELD_LABEL = 'font-size:11px;font-weight:600;color:var(--i2);margin-bottom:5px';

/** A number input that reports the native `change` event (commit on blur / Enter / spinner), as the original onchange did. */
function NumberInput({ value, onCommit }: { value: number; onCommit: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const cb = useRef(onCommit);
  useEffect(() => { cb.current = onCommit; });
  useEffect(() => {
    const el = ref.current!;
    const h = () => cb.current(el.value);
    el.addEventListener('change', h);
    return () => el.removeEventListener('change', h);
  }, []);
  return <input ref={ref} type="number" defaultValue={String(value)} min="0" max="100" style={sx(NUM_STYLE)} />;
}

function modalField(id: string, label: string, value: string, placeholder: string, ref: RefObject<HTMLInputElement | null>): ReactNode {
  return (
    <div style={sx('margin-bottom:12px')}>
      <div style={sx(FIELD_LABEL)}>{label}</div>
      <input id={id} ref={ref} defaultValue={value || ''} placeholder={placeholder || ''}
        style={sx('width:100%;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:var(--fb);outline:none')}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--brand-mid)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--bdk)'; }} />
    </div>
  );
}

function roleSelect(id: string, value: string, ref: RefObject<HTMLSelectElement | null>): ReactNode {
  const roles = ['Admin', 'Reviewer', 'Compliance approver', 'Business-unit lead', 'Viewer'];
  return (
    <div style={sx('margin-bottom:12px')}>
      <div style={sx(FIELD_LABEL)}>Role</div>
      <select id={id} ref={ref} defaultValue={roles.includes(value) ? value : roles[0]}
        style={sx('width:100%;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:var(--fb);outline:none;background:var(--surf)')}>
        {roles.map(r => <option key={r}>{r}</option>)}
      </select>
    </div>
  );
}

export function SetupScreen() {
  const D = useRef<SetupData | null>(null);
  if (!D.current) D.current = initData();
  const d = D.current;
  const [gen, setGen] = useState(0);
  const renderMain = () => setGen(g => g + 1);

  /* Modal: the overlay is created on first open and afterwards only hidden (display:none), like the original. */
  const [modal, setModal] = useState<{ html: ReactNode; seq: number } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const ovRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);

  function openModal(html: ReactNode) {
    setModal(m => ({ html, seq: (m ? m.seq : 0) + 1 }));
    setModalOpen(true);
    setTimeout(() => {
      const firstInput = ovRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
      if (firstInput) setTimeout(() => firstInput.focus(), 50);
    }, 0);
  }
  function closeModal() { setModalOpen(false); }
  function modalActions(onSave: () => void): ReactNode {
    return (
      <div style={sx('display:flex;justify-content:flex-end;gap:8px;margin-top:16px')}>
        <button className="btn btn-ghost btn-sm" onClick={closeModal}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onSave}>Save</button>
      </div>
    );
  }
  const step = (id: StepId) => d.STEPS.find(x => x.id === id)!;

  function toggleWorking(id: string) {
    if (d.expandedWorking.has(id)) d.expandedWorking.delete(id); else d.expandedWorking.add(id);
    renderMain();
  }
  function signOff(id: StepId) {
    const s = step(id);
    if (id === 'rubric') {
      const total = d.RUBRIC.reduce((a, r) => a + r.weight, 0);
      if (total !== 100) { showToast('Weights must total 100 before sign-off'); return; }
    }
    s.status = 'done';
    showToast(s.title + ' signed off');
    renderMain();
  }
  function reopenStep(id: StepId) {
    step(id).status = 'review';
    renderMain();
  }
  function updateWeight(i: number, val: string) { d.RUBRIC[i].weight = parseInt(val) || 0; renderMain(); }
  function toggleSignal(code: string) {
    const s = d.SIGNALS.find(x => x.code === code)!;
    s.on = !s.on;
    renderMain();
  }
  // Not called from anywhere in the original UI; kept for parity.
  function startActions() {
    step('actions').status = 'review';
    showToast('Draft action library started — add 3–5 actions per segment, then sign off');
    renderMain();
  }

  /* Personas */
  function addPersona() {
    openModal(<>
      <div style={sx(MODAL_TITLE)}>Add a persona</div>
      {modalField('mPersonaName', 'Role + typical title', '', 'e.g. Head of OT Security', nameRef)}
      {modalActions(savePersona)}
    </>);
  }
  function savePersona() {
    const name = nameRef.current!.value.trim();
    if (!name) { showToast('Enter a persona name'); return; }
    d.PERSONAS.push(name);
    const s = step('personas'); if (s.status === 'done') s.status = 'review';
    closeModal(); showToast('Persona added'); renderMain();
  }
  function removePersona(i: number) {
    d.PERSONAS.splice(i, 1);
    const s = step('personas'); if (s.status === 'done') s.status = 'review';
    renderMain();
  }

  /* Actions library */
  function addSegment() {
    openModal(<>
      <div style={sx(MODAL_TITLE)}>Add a micro-segment</div>
      {modalField('mSegName', 'Segment name', '', 'e.g. Modernisation, Regulation, Tender', nameRef)}
      {modalActions(saveSegment)}
    </>);
  }
  function saveSegment() {
    const name = nameRef.current!.value.trim();
    if (!name) { showToast('Enter a segment name'); return; }
    if (d.ACTIONS_LIB[name]) { showToast('That segment already exists'); return; }
    d.ACTIONS_LIB[name] = [];
    closeModal(); showToast('Segment added'); renderMain();
  }
  function removeSegment(seg: string) {
    delete d.ACTIONS_LIB[seg];
    renderMain();
  }
  function addAction(seg: string) {
    if (d.ACTIONS_LIB[seg].length >= 5) { showToast('Maximum 5 actions per segment'); return; }
    openModal(<>
      <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:4px')}>Add an action</div>
      <div style={sx('font-size:11.5px;color:var(--i3);margin-bottom:14px')}>For the <b>{seg}</b> segment — something Client&apos;s team can actually deliver</div>
      {modalField('mActionName', 'Action', '', 'e.g. Offer a site assessment', nameRef)}
      {modalActions(() => saveAction(seg))}
    </>);
  }
  function saveAction(seg: string) {
    const name = nameRef.current!.value.trim();
    if (!name) { showToast('Enter an action'); return; }
    d.ACTIONS_LIB[seg].push(name);
    const s = step('actions'); if (s.status === 'todo') s.status = 'review';
    closeModal(); showToast('Action added to ' + seg); renderMain();
  }
  function removeAction(seg: string, i: number) {
    d.ACTIONS_LIB[seg].splice(i, 1);
    renderMain();
  }

  /* Users — like the original, nothing on this screen calls these (the Users section links to Users and roles). */
  function addUser() {
    openModal(<>
      <div style={sx(MODAL_TITLE)}>Add a user</div>
      {modalField('mUserName', 'Name', '', 'e.g. Sofia Ahlgren', nameRef)}
      {roleSelect('mUserRole', 'Reviewer', roleRef)}
      {modalField('mUserEmail', 'Email', '', 'name@client.com', emailRef)}
      {modalActions(saveNewUser)}
    </>);
  }
  function saveNewUser() {
    const name = nameRef.current!.value.trim();
    const role = roleRef.current!.value;
    const email = emailRef.current!.value.trim();
    if (!name || !email) { showToast('Name and email are required'); return; }
    d.USERS.push({ name, role, email });
    const s = step('users'); if (s.status === 'done') s.status = 'review';
    closeModal(); showToast('User added'); renderMain();
  }
  function editUser(i: number) {
    const u = d.USERS[i];
    openModal(<>
      <div style={sx(MODAL_TITLE)}>Edit user</div>
      {modalField('mUserName', 'Name', u.name, '', nameRef)}
      {roleSelect('mUserRole', u.role, roleRef)}
      {modalField('mUserEmail', 'Email', u.email, '', emailRef)}
      {modalActions(() => saveEditUser(i))}
    </>);
  }
  function saveEditUser(i: number) {
    const name = nameRef.current!.value.trim();
    const role = roleRef.current!.value;
    const email = emailRef.current!.value.trim();
    if (!name || !email) { showToast('Name and email are required'); return; }
    d.USERS[i] = { name, role, email };
    const s = step('users'); if (s.status === 'done') s.status = 'review';
    closeModal(); showToast('User updated'); renderMain();
  }
  function removeUser(i: number) {
    d.USERS.splice(i, 1);
    const s = step('users'); if (s.status === 'done') s.status = 'review';
    renderMain();
  }
  void [startActions, addUser, editUser, removeUser];

  function renderStep(s: Step): ReactNode {
    let body: ReactNode = null;
    if (s.id === 'scope') body = <>
      <div className="dim-row" style={sx(DIM_ROW)}><span style={sx(DIM_L)}>Pilot product</span><span style={sx(DIM_R)}>Process control DCS platform</span></div>
      <div className="dim-row" style={sx(DIM_ROW)}><span style={sx(DIM_L)}>Business unit</span><span style={sx(DIM_R)}>Industrial Automation — EMEA</span></div>
      <div className="dim-row" style={sx(DIM_ROW)}><span style={sx(DIM_L)}>Region</span><span style={sx(DIM_R)}>EMEA + North America</span></div>
    </>;

    if (s.id === 'rubric') {
      const total = d.RUBRIC.reduce((a, r) => a + r.weight, 0);
      const expanded = d.expandedWorking.has('rubric');
      body = <>
        <div style={sx('font-size:11.5px;color:var(--i2);margin-bottom:10px')}>{`The ICP in plain words: mid-to-large process-industry operators in the pilot region, evaluated against ${d.RUBRIC.length} weighted criteria (total ${total}/100), a fit floor of ${d.fitFloor}, and 4 knock-out rules.`}</div>
        {' '}<button className="btn btn-ghost btn-sm" onClick={() => toggleWorking('rubric')} style={sx(`margin-bottom:${expanded ? '12' : '0'}px`)}>{expanded ? 'Hide the working' : 'Show the working'}</button>{' '}
        {expanded ? <>
          <div style={sx('font-size:11px;color:var(--i3);margin-bottom:10px')}>Knock-outs: out of region · pilot product already installed · strategic account · sanctioned country</div>
          <div className="score-list" style={sx('border:1px solid var(--border);margin-bottom:10px')}>
            <div className="sl-head" style={sx('grid-template-columns:1.5fr 2fr 90px;padding:8px 12px')}><div className="sl-th">Criterion</div><div className="sl-th">Levels</div><div className="sl-th">Weight</div></div>
            {d.RUBRIC.map((r, i) => (
              <div key={i} className="sl-row" style={sx('grid-template-columns:1.5fr 2fr 90px;padding:6px 12px')}>
                <div style={sx('font-size:11.5px')}>{r.name}</div>
                <div style={sx('font-size:10.5px;color:var(--i3)')}>{r.levels}</div>
                <div><NumberInput value={r.weight} onCommit={v => updateWeight(i, v)} /></div>
              </div>
            ))}
          </div>
          <div style={sx(`font-size:11px;color:${total === 100 ? 'var(--pos)' : 'var(--neg)'};font-weight:600;margin-bottom:8px`)} id="weightTotal">{`Total: ${total} / 100 ${total === 100 ? '✓' : '— must equal 100'}`}</div>
          <div style={sx('display:flex;align-items:center;gap:8px')}>
            <span style={sx('font-size:11.5px;color:var(--i3)')}>Fit floor</span>
            <NumberInput value={d.fitFloor} onCommit={v => { d.fitFloor = parseInt(v); }} />
            <span style={sx('font-size:10.5px;color:var(--i3)')}>— accounts below this drop out before scoring</span>
          </div>
        </> : null}
      </>;
    }

    if (s.id === 'personas') body = (
      <div style={sx('display:flex;flex-wrap:wrap;gap:6px')}>
        {d.PERSONAS.map((p, i) => (
          <span key={i} style={sx('background:var(--s75);padding:4px 6px 4px 10px;border-radius:999px;font-size:11px;display:inline-flex;align-items:center;gap:6px')}>{p}<span onClick={() => removePersona(i)} style={sx('cursor:pointer;color:var(--i3);font-weight:700;padding:0 2px')} title="Remove">×</span></span>
        ))}
        <span style={sx('background:var(--surf);border:1px dashed var(--brand-mid);padding:4px 10px;border-radius:999px;font-size:11px;color:var(--brand-dk);cursor:pointer;font-weight:600')} onClick={addPersona}>+ Add persona</span>
      </div>
    );

    if (s.id === 'signals') {
      const groups: SignalGroup[] = ['Ready', 'Needs data', 'Needs enabling'];
      const onCount = d.SIGNALS.filter(x => x.on).length;
      const expanded = d.expandedWorking.has('signals');
      // In the original the toggle's spans were clicked inside a label that innerHTML had already detached, so the
      // label never forwarded the click to the checkbox. preventDefault keeps that: one toggle per click.
      const spanClick = (e: MouseEvent, code: string) => { e.preventDefault(); toggleSignal(code); };
      body = <>
        <div style={sx('font-size:11.5px;color:var(--i2);margin-bottom:10px')}>{`${onCount} of ${d.SIGNALS.length} signal types enabled — only the ones Client's data actually supports, plus a plain note of how long each counts.`}</div>
        {' '}<button className="btn btn-ghost btn-sm" onClick={() => toggleWorking('signals')} style={sx(`margin-bottom:${expanded ? '12' : '0'}px`)}>{expanded ? 'Hide the working' : 'Show the working'}</button>{' '}
        {expanded ? groups.map(g => (
          <div key={g} style={sx('margin-bottom:12px')}>
            <div style={sx('font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--i3);margin-bottom:6px')}>{g + (g === 'Ready' ? ' — works on our sources alone' : g === 'Needs data' ? ' — needs a Client export' : ' — needs a subscription Client owns')}</div>
            {d.SIGNALS.filter(x => x.group === g).map(x => (
              <div key={x.code} style={sx('display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--s75)')}>
                <label style={sx('position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0')}>
                  <input type="checkbox" defaultChecked={x.on} onChange={() => toggleSignal(x.code)} style={sx('opacity:0;width:0;height:0')} />
                  <span onClick={e => spanClick(e, x.code)} style={sx(`position:absolute;cursor:pointer;inset:0;background:${x.on ? 'var(--brand)' : 'var(--s200)'};border-radius:999px;transition:.15s`)}></span>
                  <span onClick={e => spanClick(e, x.code)} style={sx(`position:absolute;height:14px;width:14px;left:${x.on ? '16px' : '2px'};bottom:2px;background:#fff;border-radius:50%;cursor:pointer;transition:.15s;box-shadow:0 1px 2px rgba(0,0,0,.2)`)}></span>
                </label>
                <span style={sx('font-family:var(--fm);font-size:10px;color:var(--i3);width:60px;flex-shrink:0')}>{x.code}</span>
                <span style={sx('font-size:11.5px;color:var(--i2)')}>{x.name}</span>
              </div>
            ))}
          </div>
        )) : null}
      </>;
    }

    if (s.id === 'actions') {
      const segs = Object.keys(d.ACTIONS_LIB);
      body = <>
        <div style={sx('font-size:11.5px;color:var(--i2);margin-bottom:12px')}>3–5 approved actions per micro-segment — the LLM can only choose from this library. Nothing here yet: Client hasn’t confirmed what their team can actually deliver per segment.</div>
        {segs.length ? segs.map(seg => (
          <div key={seg} style={sx('margin-bottom:14px')}>
            <div style={sx('display:flex;align-items:center;gap:8px;margin-bottom:6px')}>
              <span style={sx('font-size:11px;font-weight:700;color:var(--i1)')}>{seg}</span>
              <span style={sx('font-size:10px;color:var(--i3)')}>{`${d.ACTIONS_LIB[seg].length}/5`}</span>
              <span onClick={() => removeSegment(seg)} style={sx('cursor:pointer;color:var(--i4);font-size:10px;margin-left:auto')}>Remove segment</span>
            </div>
            {d.ACTIONS_LIB[seg].map((a, i) => (
              <div key={i} style={sx('display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--s50);border-radius:7px;margin-bottom:4px')}>
                <span style={sx('font-size:11.5px;color:var(--i2);flex:1')}>{a}</span>
                <span onClick={() => removeAction(seg, i)} style={sx('cursor:pointer;color:var(--i3);font-weight:700;padding:0 2px')}>×</span>
              </div>
            ))}
            {d.ACTIONS_LIB[seg].length < 5 ? <button className="btn btn-ghost btn-sm" style={sx('padding:4px 0;font-size:11px')} onClick={() => addAction(seg)}>{`+ Add action to ${seg}`}</button> : null}
          </div>
        )) : <div style={sx('font-size:11px;color:var(--i4);font-style:italic;margin-bottom:10px')}>No segments defined yet.</div>}
        {' '}<button className="btn btn-sec btn-sm" onClick={addSegment}>+ Add micro-segment</button>
      </>;
    }

    if (s.id === 'brand') body = <>
      <div style={sx('font-size:11.5px;color:var(--i2);margin-bottom:10px')}>Brand pack, approved claims, and 3 collateral items uploaded, each with an owner. 3 of 8 enabled actions have approved proof.</div>
      {' '}<Link href="/content" className="btn btn-sec btn-sm" style={sx('text-decoration:none;display:inline-flex')}>Open content library →</Link>
    </>;

    if (s.id === 'users') body = <>
      <div style={sx('font-size:11.5px;color:var(--i2);margin-bottom:10px')}>{`${d.USERS.length} users — ${d.USERS.filter(u => u.status === 'active').length} active, ${d.USERS.filter(u => u.status === 'invited').length} invited.`}</div>
      {' '}<Link href="/users" className="btn btn-sec btn-sm" style={sx('text-decoration:none;display:inline-flex')}>Open users and roles →</Link>
    </>;

    const actionBtn = s.status === 'done'
      ? <button className="btn btn-ghost btn-sm" onClick={() => reopenStep(s.id)}>Reopen to edit</button>
      : s.status === 'review'
        ? <button className="btn btn-primary btn-sm" onClick={() => signOff(s.id)}>Sign off this section</button>
        : null;

    return (
      <div key={s.id} className="panel" style={sx('margin-bottom:12px')}>
        <div className="panel-hdr">
          <span className="panel-ttl">{`${s.num} · ${s.title}`}</span>
          <div style={sx('display:flex;align-items:center;gap:8px')}>{statusBadge(s.status)}{actionBtn}</div>
        </div>
        <div className="panel-body">{body}</div>
      </div>
    );
  }

  const done = d.STEPS.filter(s => s.status === 'done').length;
  const N = d.STEPS.length;
  const rem = N - done;
  return (
    <>
      <main className="main" id="mainArea">
        <Fragment key={gen}>
          <div className="topbar">
            <div className="topbar-l">
              <span className="tb-title">Setup</span>
              {' '}<span className={`tb-badge ${done === N ? 'badge-live' : 'badge-neutral'}`}>{`${done} of ${N} signed off`}</span>
            </div>
            <div className="topbar-r"><button className="btn btn-sec btn-sm" onClick={() => showToast('Config v1 exported as JSON')}>Export config</button></div>
          </div>
          <div className="canvas">
            <div className="panel" style={sx('margin-bottom:18px;background:var(--brand-lt);border-color:transparent')}>
              <div className="panel-body" style={sx('font-size:12.5px;color:var(--brand-dk);line-height:1.6')}>
                <b>What to do here:</b> review each section below against what Client has provided. Edit anything that needs adjusting, then sign off. <b>Nothing downstream runs until every section is signed off</b> — Prospecting, Scoring and NBA all read this exact configuration.
              </div>
            </div>

            {d.STEPS.map(s => renderStep(s))}

            <div className="panel" style={sx(`border:2px solid ${done === N ? 'var(--pos)' : 'var(--border)'}`)}>
              <div className="panel-hdr">
                <span className="panel-ttl">8 · Config v1</span>
                {done === N ? <span className="sc sc-h">Active</span> : <span className="sc sc-m">{`${rem} section${rem > 1 ? 's' : ''} remaining`}</span>}
              </div>
              <div className="panel-body" style={sx('font-size:11.5px;color:var(--i2);line-height:1.6')}>
                {done === N
                  ? 'All seven sections signed off. Config v1 is active — every score, segment and draft from here names this version. A future change produces v2, with v1 kept for the audit trail.'
                  : `Sign off the remaining ${rem} section${rem > 1 ? 's' : ''} above to activate Config v1. Nothing can run against an incomplete configuration.`}
              </div>
            </div>
          </div>
        </Fragment>
      </main>
      {modal ? (
        <div id="setupModalOverlay" ref={ovRef} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={sx(`position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:${modalOpen ? 'flex' : 'none'};align-items:center;justify-content:center;`)}>
          <div key={modal.seq} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:440px;max-width:90vw;padding:22px;')} onClick={e => e.stopPropagation()}>{modal.html}</div>
        </div>
      ) : null}
    </>
  );
}
