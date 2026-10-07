'use client';

// Port of legacy/13-analytics.html (everything after </nav>; the ROLE ENGINE lives in AppShell).
import { useState } from 'react';
import { sx } from '@/lib/sx';
import { showToast } from '@/lib/ui';

type Tab = 'gates' | 'funnel' | 'weekly' | 'readout';

const NOTE = 'font-size:10.5px;color:var(--i3);margin-top:8px;padding-top:8px;border-top:1px solid var(--s75)';

function Gates() {
  // #gatesWorking visibility: the original toggled style.display; a re-render (tab switch) resets it.
  const [showing, setShowing] = useState(false);
  return (
    <>
      <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px')}>
        <div className="panel" style={sx('border-color:var(--pos)')}>
          <div className="panel-hdr"><span className="panel-ttl" title="Are we materially reducing the human work needed to reach a usable first action?">Reduced human effort</span><span className="sc sc-h">On track</span></div>
          <div className="panel-body">
            <div style={sx('font-family:var(--fd);font-size:30px;font-weight:700;color:var(--pos);margin-bottom:4px')}>62%</div>
            <div style={sx('font-size:11.5px;color:var(--i3)')}>reduction in human minutes per usable first action, vs. Client&apos;s timed baseline</div>
          </div>
        </div>
        <div className="panel" style={sx('border-color:var(--pos)')}>
          <div className="panel-hdr"><span className="panel-ttl" title="Of what we recommend, how much does Client accept and use with no or minor changes?">Recommendation acceptance</span><span className="sc sc-h">On track</span></div>
          <div className="panel-body">
            <div style={sx('font-family:var(--fd);font-size:30px;font-weight:700;color:var(--pos);margin-bottom:4px')}>78%</div>
            <div style={sx('font-size:11.5px;color:var(--i3)')}>of recommendations accepted as-is or with a minor edit</div>
          </div>
        </div>
      </div>

      <div style={sx('text-align:center;margin-bottom:16px')}>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowing(s => !s)} id="gatesWorkingBtn">{showing ? 'Hide the working' : 'Show the working'}</button>
      </div>

      <div id="gatesWorking" style={showing ? sx('display:block') : sx('display:none')}>
        <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px')}>
          <div className="panel">
            <div className="panel-hdr"><span className="panel-ttl">Reduced human effort — the working</span></div>
            <div className="panel-body">
              <div className="dim-row"><span className="dim-lbl">Baseline (Client, timed)</span><span className="dim-val" style={sx('margin-left:auto')}>38 min / account</span></div>
              <div className="dim-row"><span className="dim-lbl">Pilot (queue + edit + spot-check time)</span><span className="dim-val" style={sx('margin-left:auto')}>14.4 min / account</span></div>
              <div style={sx(NOTE)}>Measured on 24 accounts from the golden dataset, agreed at kickoff. Threshold agreed with Client at kickoff.</div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-hdr"><span className="panel-ttl">Recommendation acceptance — the working</span></div>
            <div className="panel-body">
              <div className="dim-row"><span className="dim-lbl">Usable as-is</span><div className="dim-track"><div className="dim-fill" style={sx('width:54%;background:var(--pos)')}></div></div><span className="dim-val">54%</span></div>
              <div className="dim-row"><span className="dim-lbl">Minor edit</span><div className="dim-track"><div className="dim-fill" style={sx('width:24%;background:var(--sec)')}></div></div><span className="dim-val">24%</span></div>
              <div className="dim-row"><span className="dim-lbl">Major edit</span><div className="dim-track"><div className="dim-fill" style={sx('width:15%;background:var(--warn)')}></div></div><span className="dim-val">15%</span></div>
              <div className="dim-row"><span className="dim-lbl">Reject</span><div className="dim-track"><div className="dim-fill" style={sx('width:7%;background:var(--neg)')}></div></div><span className="dim-val">7%</span></div>
              <div style={sx(NOTE)}>Every exception, plus a random weekly sample of items that proceeded on their own. Threshold agreed at kickoff.</div>
            </div>
          </div>
        </div>

        <div className="panel" style={sx('margin-bottom:16px')}>
          <div className="panel-hdr"><span className="panel-ttl">Rejection reasons, this week</span></div>
          <div className="panel-body">
            <div className="dim-row"><span className="dim-lbl">Wrong fit</span><div className="dim-track"><div className="dim-fill" style={sx('width:8%;background:var(--s300)')}></div></div><span className="dim-val">3</span></div>
            <div className="dim-row"><span className="dim-lbl">Wrong action</span><div className="dim-track"><div className="dim-fill" style={sx('width:22%;background:var(--s300)')}></div></div><span className="dim-val">8</span></div>
            <div className="dim-row"><span className="dim-lbl">Factual issue</span><div className="dim-track"><div className="dim-fill" style={sx('width:14%;background:var(--s300)')}></div></div><span className="dim-val">5</span></div>
            <div className="dim-row"><span className="dim-lbl">Signal not adequate</span><div className="dim-track"><div className="dim-fill" style={sx('width:11%;background:var(--s300)')}></div></div><span className="dim-val">4</span></div>
            <div style={sx('font-size:10.5px;color:var(--i3);margin-top:6px')}>Feeds the weekly review — a cluster of &quot;wrong action&quot; rejections in one segment is a signal the action set needs a look.</div>
          </div>
        </div>
      </div>
    </>
  );
}

const STAGES: { label: string; metric: string }[] = [
  { label: 'Data received', metric: '12,400 received; 11,900 valid' },
  { label: 'Lead discovery and research', metric: '3,200 accounts in scope' },
  { label: 'Signals', metric: '186,000 data points; 9,400 signals; 2,100 qualified' },
  { label: 'Scoring', metric: '1,860 live; 240 A, 610 B, 1,010 C' },
  { label: 'Micro-segments', metric: '34 segments formed; 21 proceed on their own' },
  { label: 'Actions and outputs', metric: '850 actions; 610 drafts; 540 pass every check' },
  { label: 'Human in the loop', metric: '470 proceeded on their own; 140 exceptions; 140 decisions made' },
];

function Funnel() {
  return (
    <>
      <div className="score-list">
        <div className="sl-head" style={sx('grid-template-columns:220px 1fr;')}><div className="sl-th">Stage</div><div className="sl-th">What&apos;s counted</div></div>
        {STAGES.map(s => (
          <div key={s.label} className="sl-row" style={sx('grid-template-columns:220px 1fr;')}><div style={sx('font-size:12px;font-weight:600;color:var(--i1)')}>{s.label}</div><div style={sx('font-size:12px;color:var(--i2)')}>{s.metric}</div></div>
        ))}
      </div>
      <div style={sx('font-size:11px;color:var(--i3);margin-top:10px')}>Every recommendation also carries its own summary — &quot;considered 214 data points and 12 signals; 5 qualified; 4 contributed.&quot;</div>
    </>
  );
}

function Weekly() {
  return (
    <div className="panel">
      <div className="panel-hdr"><span className="panel-ttl">Week 3 summary — for the business-unit lead</span></div>
      <div className="panel-body">
        <div className="dim-row" title="Minutes per usable first action vs the baseline"><span className="dim-lbl">Reduced human effort, this week</span><span className="dim-val" style={sx('margin-left:auto')}>61% reduction</span></div>
        <div className="dim-row" title="Recommendations accepted as-is or with a minor edit"><span className="dim-lbl">First-pass acceptance, this week</span><span className="dim-val" style={sx('margin-left:auto')}>79% accepted</span></div>
        <div className="dim-row"><span className="dim-lbl">Exceptions raised</span><span className="dim-val" style={sx('margin-left:auto')}>42</span></div>
        <div className="dim-row"><span className="dim-lbl">Exceptions decided</span><span className="dim-val" style={sx('margin-left:auto')}>42</span></div>
        <div style={sx('margin-top:12px;padding-top:12px;border-top:1px solid var(--s75);font-size:11.5px;color:var(--i2);line-height:1.6')}>
          <b>Proposals for the Score loop:</b> R6 (wrong action) rejections cluster in the Regulation segment — 5 of 8 this week. Worth reviewing whether the action library for Regulation needs a second option before next week&apos;s run.
        </div>
      </div>
    </div>
  );
}

function Readout() {
  return (
    <div className="panel">
      <div className="panel-hdr"><span className="panel-ttl">Pilot readout — draft, week 3 of 6</span></div>
      <div className="panel-body" style={sx('font-size:12px;color:var(--i2);line-height:1.7')}>
        <p><b>G1 — reduced human effort:</b> 62% reduction against the timed baseline, ahead of week 3 expectations.</p>
        <p><b>G2 — recommendation acceptance:</b> 78% accepted as-is or with a minor edit.</p>
        <p><b>What we learned:</b> Regulation-segment actions need a second library option — wrong-action rejections cluster there. Signal coverage is strong for modernisation and renewal timing, weaker for new-project timing (adding opportunity notes would help most).</p>
        <p><b>Data gaps:</b> Event-attendance coverage is 31% — lower than installed-base coverage at 82%.</p>
        <p style={sx('font-style:italic;color:var(--i3)')}>Full readout finalizes at the end of the pilot, against the thresholds agreed at kickoff.</p>
      </div>
    </div>
  );
}

export function AnalyticsScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('gates');
  // The original re-rendered #mainArea on every switchTab, even the active tab (which reset "Show the working").
  const [renderKey, setRenderKey] = useState(0);
  const switchTab = (tab: Tab) => { setActiveTab(tab); setRenderKey(k => k + 1); };
  const ftab = (tab: Tab, label: string) => (
    <div className={`ftab ${activeTab === tab ? 'active' : ''}`} onClick={() => switchTab(tab)}>{label}</div>
  );
  return (
    <main className="main" id="mainArea">
      <div className="topbar">
        <div className="topbar-l"><span className="tb-title">Analytics</span><span className="tb-badge badge-neutral">Week 3 of the pilot</span></div>
        <div className="topbar-r"><button className="btn btn-sec btn-sm" onClick={() => showToast('Pilot readout exported as PDF')}>Export readout</button></div>
      </div>
      <div className="ftabs">
        {ftab('gates', 'Success gates')}
        {ftab('funnel', 'Work-done funnel')}
        {ftab('weekly', 'Weekly summary')}
        {ftab('readout', 'Pilot readout')}
      </div>
      <div className="canvas" key={renderKey}>{activeTab === 'gates' ? <Gates /> : activeTab === 'funnel' ? <Funnel /> : activeTab === 'weekly' ? <Weekly /> : <Readout />}</div>
    </main>
  );
}
