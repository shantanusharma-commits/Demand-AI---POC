'use client';

/* Port of legacy/07-content.html — Content library: tabs, detail drawer, add modal. */
import { useRef, useState, type ReactNode } from 'react';
import { sx } from '@/lib/sx';
import { showToast } from '@/lib/ui';

type Tab = 'brand' | 'claims' | 'banned' | 'collateral' | 'messages' | 'coverage';
type Status = 'approved' | 'draft' | 'expired';

interface Claim { id: string; text: string; source: string | null; product: string; vertical: string; owner: string; status: Status; expiry: string; citedIn: number }
interface Banned { id: string; rule: string; reason: string }
interface Collateral { id: string; title: string; type: string; product: string; vertical: string; actions: string[]; owner: string; status: Status; expiry: string; citedIn: number }
interface KeyMessage { id: string; stage: string; message: string; proof: string | null }
interface BrandDoc { name: string; size: string; owner: string; when: string; status: Status }
interface ActionCoverage { action: string; proof: boolean }

const APPROVED_CLAIMS: Claim[] = [
  {id:'c1', text:'Meridian Chemical Corp migrated from a legacy DCS to our platform in 2024 with zero unplanned downtime during cutover', source:'Case study: Meridian Chemical Corp Migration', product:'Process control DCS platform', vertical:'Chemicals', owner:'Rajiv Nair', status:'approved', expiry:'2026-03-15', citedIn:4},
  {id:'c2', text:'Average site-assessment turnaround is 10 business days from request to report', source:'Internal service-level record', product:'Process control DCS platform', vertical:'All', owner:'Rajiv Nair', status:'approved', expiry:'2026-01-20', citedIn:2},
  {id:'c3', text:'Our OT-cyber compliance guide covers grid-reliability audit requirements', source:null, product:'Process control DCS platform', vertical:'Power Generation', owner:'Rajiv Nair', status:'draft', expiry:'—', citedIn:0},
];
const BANNED: Banned[] = [
  {id:'b1', rule:'Never claim "zero downtime" without a named, cited case study', reason:'Unsupportable as a general claim'},
  {id:'b2', rule:'Never use "guaranteed" in relation to savings or ROI', reason:'Legal — no guarantee language'},
  {id:'b3', rule:'Never name a specific competitor product in outbound content', reason:'Brand guideline'},
];
const COLLATERAL: Collateral[] = [
  {id:'k1', title:'Migration Case Study — Meridian Chemical Corp', type:'Case study', product:'Process control DCS platform', vertical:'Chemicals', actions:['Propose a migration or upgrade discussion'], owner:'Rajiv Nair', status:'approved', expiry:'2026-03-15', citedIn:4},
  {id:'k2', title:'Site Assessment Overview — One-pager', type:'Datasheet', product:'Process control DCS platform', vertical:'All', actions:['Offer a site assessment or health check'], owner:'Rajiv Nair', status:'approved', expiry:'2026-06-01', citedIn:3},
  {id:'k3', title:'Regulatory Compliance Brief — Grid Reliability', type:'Whitepaper', product:'Process control DCS platform', vertical:'Power Generation', actions:['Invite to a webinar or event'], owner:'Rajiv Nair', status:'expired', expiry:'2025-11-01', citedIn:1},
];
const MESSAGES: KeyMessage[] = [
  {id:'m1', stage:'Awareness', message:'A modern DCS platform reduces unplanned downtime and simplifies compliance reporting.', proof:'c1'},
  {id:'m2', stage:'Consideration', message:'Site assessments typically surface 2–3 concrete risks worth addressing before a renewal decision locks in.', proof:'c2'},
  {id:'m3', stage:'Purchase', message:'Migration projects are scoped to run alongside existing operations, not replace them overnight.', proof:'c1'},
  {id:'m4', stage:'Loyalty', message:'Existing customers get priority scheduling on site assessments and health checks.', proof:null},
];
const BRAND_DOCS: BrandDoc[] = [
  {name:'Client Brand Guidelines v3.pdf', size:'2.4 MB', owner:'Rajiv Nair', when:'3 weeks ago', status:'approved'},
  {name:'Sign-off and Email Signature Standards.docx', size:'180 KB', owner:'Rajiv Nair', when:'3 weeks ago', status:'approved'},
  {name:'Q1 Messaging Refresh — Draft.pptx', size:'5.1 MB', owner:'Rajiv Nair', when:'2 days ago', status:'draft'},
];
const BRAND = {
  tone: 'Direct, specific, no hype. Lead with the account’s own signal, not a generic pitch.',
  signoff: '"Best, [newline] Client Team" — no first names of AEs unless the rep edits it in.',
  glossary: [{use:'site assessment', not:'audit'},{use:'process control platform', not:'system' },{use:'DCS', not:'legacy control system'}],
};

const ACTIONS_COVERAGE: ActionCoverage[] = [
  {action:'Propose a migration or upgrade discussion', proof:true},
  {action:'Share a relevant case study or reference project', proof:true},
  {action:'Offer a site assessment or health check', proof:true},
  {action:'Invite to a webinar or event', proof:false},
  {action:'Introduction to a new leader in a buying role', proof:false},
  {action:'Consideration message on the use case', proof:false},
  {action:'Cross-sell to an existing customer site', proof:false},
  {action:'Follow up on an inquiry or RFQ', proof:false},
];

const TABS: { id: Tab; label: string }[] = [
  { id: 'brand', label: 'Brand guidelines' },
  { id: 'claims', label: 'Approved claims' },
  { id: 'banned', label: 'Banned phrases' },
  { id: 'collateral', label: 'Case studies & collateral' },
  { id: 'messages', label: 'Key messages' },
  { id: 'coverage', label: 'Coverage' },
];

function statusBadge(s: Status): ReactNode {
  if (s === 'approved') return <span className="sc sc-h">APPROVED</span>;
  if (s === 'draft') return <span className="sc sc-m">DRAFT</span>;
  return <span className="sc sc-l">EXPIRED</span>;
}
function expiringSoon(dateStr: string): boolean {
  if (dateStr === '—') return false;
  const d = new Date(dateStr); const now = new Date('2026-01-20'); // pilot "today"
  const days = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 30;
}

const MODAL_LABELS: Partial<Record<Tab, string>> = { claims: 'an approved claim', banned: 'a banned phrase or rule', collateral: 'case study or collateral', messages: 'a key message', brand: 'a brand guideline entry' };
const FILE_TABS: Tab[] = ['collateral', 'brand'];

function ModalField({ id, label, value, placeholder }: { id: string; label: string; value?: string; placeholder?: string }) {
  return <div style={sx('margin-bottom:12px')}><div style={sx('font-size:11px;font-weight:600;color:var(--i2);margin-bottom:5px')}>{label}</div><input id={id} defaultValue={value || ''} placeholder={placeholder || ''} style={sx('width:100%;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:var(--fb);outline:none')} /></div>;
}

type Drawer = { kind: 'claim'; c: Claim } | { kind: 'collateral'; k: Collateral } | null;
interface ModalState { tab: Tab; key: number }
interface PickedFile { name: string; kb: number }

export function ContentScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('claims');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The overlay is created on first open and afterwards only hidden (display:none), as in the original.
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const switchTab = (t: Tab) => setActiveTab(t);
  const closeDrawer = () => setDrawerOpen(false);
  const openClaim = (c: Claim) => { setDrawer({ kind: 'claim', c }); setDrawerOpen(true); };
  const openCollateral = (k: Collateral) => { setDrawer({ kind: 'collateral', k }); setDrawerOpen(true); };

  const openAddModal = () => {
    setPicked(null);
    setModal(m => ({ tab: activeTab, key: (m ? m.key : 0) + 1 }));
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);
  const handleFilePicked = (input: HTMLInputElement) => {
    if (input.files && input.files[0]) {
      const f = input.files[0];
      setPicked({ name: f.name, kb: Math.round(f.size / 1024) });
    }
  };
  const confirmAdd = () => {
    const title = titleRef.current!.value.trim();
    if (!title) { showToast('Enter a title or text'); return; }
    const fileInput = fileRef.current;
    const hasFile = fileInput && fileInput.files && fileInput.files[0];
    closeModal();
    showToast(hasFile ? `"${fileInput.files![0].name}" uploaded — added as draft, submit for approval when ready` : 'Added as draft — submit for approval when ready');
  };

  const renderTabBody = (): ReactNode => {
    if (activeTab === 'brand') return <>
      <div className="panel" style={sx('margin-bottom:14px')}>
        <div className="panel-hdr"><span className="panel-ttl">Uploaded documents</span></div>
        <div className="panel-body" style={sx('padding:0')}>
          {BRAND_DOCS.map(d => <div key={d.name} style={sx('display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--s75)')}>
            <span style={sx('font-size:16px')}>📎</span>
            <div style={sx('flex:1')}><div style={sx('font-size:12px;font-weight:600;color:var(--i1)')}>{d.name}</div><div style={sx('font-size:10.5px;color:var(--i3)')}>{`${d.size} · uploaded by ${d.owner} · ${d.when}`}</div></div>
            {statusBadge(d.status)}
          </div>)}
          <div style={sx('padding:10px 14px')}><button className="btn btn-sec btn-sm" onClick={openAddModal}>+ Upload a document</button></div>
        </div>
      </div>
      <div className="panel" style={sx('margin-bottom:14px')}>
        <div className="panel-hdr"><span className="panel-ttl">Tone of voice</span></div>
        <div className="panel-body" style={sx('font-size:12px;color:var(--i2);line-height:1.6')}>{BRAND.tone}</div>
      </div>
      <div className="panel" style={sx('margin-bottom:14px')}>
        <div className="panel-hdr"><span className="panel-ttl">Sign-off format</span></div>
        <div className="panel-body" style={sx('font-size:12px;color:var(--i2);white-space:pre-line')}>{BRAND.signoff}</div>
      </div>
      <div className="panel">
        <div className="panel-hdr"><span className="panel-ttl">Glossary</span></div>
        <div className="panel-body" style={sx('padding:0')}>
          {BRAND.glossary.map(g => <div key={g.use} style={sx('display:flex;gap:16px;padding:9px 14px;border-bottom:1px solid var(--s75);font-size:12px')}><span style={sx('color:var(--pos);font-weight:600')}>{`Use: ${g.use}`}</span><span style={sx('color:var(--neg)')}>{`Not: ${g.not}`}</span></div>)}
        </div>
      </div>
    </>;

    if (activeTab === 'claims') return (
      <div className="score-list">
        <div className="sl-head" style={sx('grid-template-columns:2.5fr 1fr 1fr 90px 90px;')}><div className="sl-th">Claim</div><div className="sl-th">Vertical</div><div className="sl-th">Owner</div><div className="sl-th">Status</div><div className="sl-th">Expires</div></div>
        {APPROVED_CLAIMS.map(c => (
          <div key={c.id} className="sl-row" style={sx('grid-template-columns:2.5fr 1fr 1fr 90px 90px;cursor:pointer')} onClick={() => openClaim(c)}>
            <div style={sx('font-size:12px;color:var(--i1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{c.text}</div>
            <div style={sx('font-size:11px;color:var(--i3)')}>{c.vertical}</div>
            <div style={sx('font-size:11px;color:var(--i3)')}>{c.owner}</div>
            <div>{statusBadge(c.status)}</div>
            <div style={{ fontSize: '10.5px', color: expiringSoon(c.expiry) ? 'var(--warn)' : 'var(--i4)' }}>{c.expiry + (expiringSoon(c.expiry) ? ' ⚠' : '')}</div>
          </div>))}
      </div>);

    if (activeTab === 'banned') return (
      <div className="score-list">
        <div className="sl-head" style={sx('grid-template-columns:2fr 1.5fr;')}><div className="sl-th">Rule</div><div className="sl-th">Reason</div></div>
        {BANNED.map(b => <div key={b.id} className="sl-row" style={sx('grid-template-columns:2fr 1.5fr;')}><div style={sx('font-size:12px;color:var(--i1)')}>{b.rule}</div><div style={sx('font-size:11.5px;color:var(--i3)')}>{b.reason}</div></div>)}
      </div>);

    if (activeTab === 'collateral') return (
      <div className="score-list">
        <div className="sl-head" style={sx('grid-template-columns:2fr 1fr 1.3fr 90px 90px;')}><div className="sl-th">Title</div><div className="sl-th">Type</div><div className="sl-th">Supports action</div><div className="sl-th">Status</div><div className="sl-th">Cited in</div></div>
        {COLLATERAL.map(k => (
          <div key={k.id} className="sl-row" style={sx('grid-template-columns:2fr 1fr 1.3fr 90px 90px;cursor:pointer')} onClick={() => openCollateral(k)}>
            <div style={sx('font-size:12px;color:var(--i1)')}>{k.title}</div>
            <div style={sx('font-size:11px;color:var(--i3)')}>{k.type}</div>
            <div style={sx('font-size:10.5px;color:var(--i3)')}>{k.actions.join(', ')}</div>
            <div>{statusBadge(k.status)}</div>
            <div style={sx('font-size:11px;color:var(--i3)')}>{`${k.citedIn} drafts`}</div>
          </div>))}
      </div>);

    if (activeTab === 'messages') return (
      <div className="score-list">
        <div className="sl-head" style={sx('grid-template-columns:120px 2fr 1fr;')}><div className="sl-th">Stage</div><div className="sl-th">Message</div><div className="sl-th">Proof point</div></div>
        {MESSAGES.map(m => <div key={m.id} className="sl-row" style={sx('grid-template-columns:120px 2fr 1fr;')}><div style={sx('font-size:11.5px;font-weight:600;color:var(--i1)')}>{m.stage}</div><div style={sx('font-size:12px;color:var(--i2)')}>{m.message}</div><div style={{ fontSize: '11px', color: m.proof ? 'var(--i3)' : 'var(--neg)' }}>{m.proof ? 'Linked claim' : 'No proof point linked'}</div></div>)}
      </div>);

    if (activeTab === 'coverage') {
      const covered = ACTIONS_COVERAGE.filter(a => a.proof).length;
      return <>
        <div className="panel" style={sx('margin-bottom:14px')}>
          <div className="panel-body" style={sx('font-size:12px;color:var(--i2)')}>{`${covered} of ${ACTIONS_COVERAGE.length} enabled actions have approved proof. This feeds the readiness gate — an action without proof routes to a task instead of a draft.`}</div>
        </div>
        <div className="score-list">
          <div className="sl-head" style={sx('grid-template-columns:2fr 140px 1fr;')}><div className="sl-th">Action</div><div className="sl-th">Proof</div><div className="sl-th">Fix</div></div>
          {ACTIONS_COVERAGE.map(a => (
            <div key={a.action} className="sl-row" style={sx('grid-template-columns:2fr 140px 1fr;')}>
              <div style={sx('font-size:12px;color:var(--i1)')}>{a.action}</div>
              <div>{a.proof ? <span className="sc sc-h">Available</span> : <span className="sc sc-l">No approved proof</span>}</div>
              <div style={sx('font-size:11px;color:var(--i3)')}>{a.proof ? '—' : <a href="#" onClick={e => { e.preventDefault(); switchTab('collateral'); }} style={sx('color:var(--brand)')}>Add collateral for this action →</a>}</div>
            </div>))}
        </div>
      </>;
    }
    return null;
  };

  const renderDrawerBody = (): ReactNode => {
    if (!drawer) return null;
    if (drawer.kind === 'claim') {
      const c = drawer.c;
      return <>
        <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-body" style={sx('font-size:12.5px;color:var(--i1);line-height:1.6')}>{`"${c.text}"`}</div></div>
        <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">Source</span></div><div className="panel-body" style={sx('font-size:12px;color:var(--i2)')}>{c.source || <span style={sx('color:var(--neg)')}>No source yet — draft, not approved</span>}</div></div>
        <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">Used in</span></div><div className="panel-body" style={sx('font-size:12px;color:var(--i2)')}>{`Cited in ${c.citedIn} draft${c.citedIn === 1 ? '' : 's'}`}</div></div>
        <div style={sx('display:flex;gap:8px')}>
          <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center')} onClick={() => showToast('Editing creates a new version — drafts keep the version they cited')}>Edit</button>
          {c.status !== 'approved'
            ? <button className="btn btn-primary btn-sm" style={sx('flex:1;justify-content:center')} onClick={() => showToast('Approved — now usable in drafts')}>Approve</button>
            : <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center;color:var(--neg)')} onClick={() => showToast('Retired — no longer usable in new drafts')}>Retire</button>}
        </div>
      </>;
    }
    const k = drawer.k;
    return <>
      <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">Supports</span></div><div className="panel-body" style={sx('font-size:12px;color:var(--i2)')}>{k.actions.join(', ')}</div></div>
      <div className="panel" style={sx('margin-bottom:12px')}><div className="panel-hdr"><span className="panel-ttl">Used in</span></div><div className="panel-body" style={sx('font-size:12px;color:var(--i2)')}>{`Cited in ${k.citedIn} draft${k.citedIn === 1 ? '' : 's'}`}{k.status === 'expired' ? <><br /><span style={sx('color:var(--neg)')}>Expired — no longer usable until renewed</span></> : null}</div></div>
      <div style={sx('display:flex;gap:8px')}>
        <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center')} onClick={() => showToast('Editing creates a new version')}>Edit</button>
        <button className="btn btn-sec btn-sm" style={sx('flex:1;justify-content:center;color:var(--neg)')} onClick={() => showToast('Retired')}>Retire</button>
      </div>
    </>;
  };

  const drawerTitle = !drawer ? 'Item detail' : drawer.kind === 'claim' ? 'Approved claim' : drawer.k.title;
  const drawerSub = !drawer ? '—' : drawer.kind === 'claim' ? drawer.c.vertical + ' · ' + drawer.c.owner : drawer.k.type + ' · ' + drawer.k.vertical;

  const renderModal = () => {
    if (!modal) return null;
    const showFile = FILE_TABS.includes(modal.tab);
    return (
      <div id="modalOverlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        style={{ ...sx('position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;'), display: modalOpen ? 'flex' : 'none' }}>
        <div key={modal.key} style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:440px;max-width:90vw;padding:22px;')} onClick={e => e.stopPropagation()}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);margin-bottom:4px')}>{`Add ${MODAL_LABELS[modal.tab] || 'an item'}`}</div>
          <div style={sx('font-size:11.5px;color:var(--i3);margin-bottom:14px')}>Submitted as draft — the admin approves before it’s usable in drafts.</div>
          <div style={sx('margin-bottom:12px')}><div style={sx('font-size:11px;font-weight:600;color:var(--i2);margin-bottom:5px')}>Title or text</div><input id="mTitle" ref={titleRef} defaultValue="" placeholder="" style={sx('width:100%;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:var(--fb);outline:none')} /></div>
          {showFile ? (
            <div style={sx('margin-bottom:12px')}>
              <div style={sx('font-size:11px;font-weight:600;color:var(--i2);margin-bottom:5px')}>File — upload, or leave blank and just write the entry above</div>
              <div onClick={() => fileRef.current!.click()} style={sx('border:1.5px dashed var(--bdk);border-radius:8px;padding:14px;text-align:center;cursor:pointer;background:var(--s50)')}>
                <input type="file" id="mFile" ref={fileRef} style={sx('display:none')} onChange={e => handleFilePicked(e.currentTarget)} accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg" />
                {picked
                  ? <div id="mFileLabel" style={sx('font-size:11.5px;color:var(--i1)')}>📎 <b>{picked.name}</b> <span style={sx('color:var(--i4)')}>{`(${picked.kb} KB)`}</span> — click to change</div>
                  : <div id="mFileLabel" style={sx('font-size:11.5px;color:var(--i3)')}>Click to choose a file (PDF, Word, PowerPoint, or image)</div>}
              </div>
            </div>) : null}
          <ModalField id="mOwner" label="Owner" value="Rajiv Nair" />
          <ModalField id="mExpiry" label="Expiry date (YYYY-MM-DD)" value="" />
          <div style={sx('display:flex;justify-content:flex-end;gap:8px;margin-top:16px')}><button className="btn btn-ghost btn-sm" onClick={closeModal}>Cancel</button><button className="btn btn-primary btn-sm" onClick={confirmAdd}>Save</button></div>
        </div>
      </div>
    );
  };

  return (
    <>
      <main className="main" id="mainArea">
        <div className="topbar">
          <div className="topbar-l"><span className="tb-title">Content library</span></div>
          <div className="topbar-r">{activeTab !== 'coverage' ? <button className="btn btn-primary btn-sm" onClick={openAddModal}>+ Add</button> : null}</div>
        </div>
        <div className="ftabs">
          {TABS.map(t => <div key={t.id} className={`ftab ${activeTab === t.id ? 'active' : ''}`} onClick={() => switchTab(t.id)}>{t.label}</div>)}
        </div>
        <div className="canvas">{renderTabBody()}</div>
      </main>

      <div className={`detail-drawer${drawerOpen ? ' open' : ''}`} id="detailDrawer">
        <div className="drawer-hdr">
          <div><div className="drawer-title" id="detTitle">{drawerTitle}</div><div className="drawer-sub" id="detSub">{drawerSub}</div></div>
          <div className="drawer-close" onClick={closeDrawer}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></div>
        </div>
        <div className="drawer-body" id="detBody">{renderDrawerBody()}</div>
      </div>
      {renderModal()}
    </>
  );
}
