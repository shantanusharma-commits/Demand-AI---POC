'use client';

/* Port of legacy/00-today.html — the page was static markup inside <main class="main">. */
import Link from 'next/link';
import { useRef } from 'react';
import { sx } from '@/lib/sx';

export function TodayScreen() {
  const outcomeRef = useRef<HTMLDivElement>(null);
  return (
    <main className="main">
      <div className="topbar">
        <div className="topbar-l">
          <span className="tb-title">Today</span>
          <span className="tb-badge badge-neutral">Wednesday, 30 September</span>
        </div>
      </div>
      <div className="canvas">
    
        <div style={sx('margin-bottom:20px')}>
          <div style={sx('font-family:var(--fd);font-size:20px;font-weight:700;color:var(--i1)')}>Good morning, Pavan</div>
          <div style={sx('font-size:12.5px;color:var(--i3);margin-top:2px')}>Overnight run finished 3:12 AM. Here&apos;s what needs you today.</div>
        </div>
    
        <div className="stats" style={sx('margin-bottom:20px')}>
          <Link href="/review" className="stat" style={sx('cursor:pointer;text-decoration:none;color:inherit')}><div className="stat-lbl">Exceptions waiting</div><div className="stat-val sv1">4</div><div className="stat-sub">click to open the queue</div></Link>
          <div className="stat"><div className="stat-lbl">Proceeded on their own</div><div className="stat-val sv4">470</div><div className="stat-sub">overnight</div></div>
          <Link href="/nba" className="stat" style={sx('cursor:pointer;text-decoration:none;color:inherit')}><div className="stat-lbl">🎉 Meetings booked</div><div className="stat-val" style={sx('color:var(--pos)')}>1</div><div className="stat-sub">this week — click to see it</div></Link>
          <div className="stat" style={sx('cursor:pointer')} onClick={() => outcomeRef.current!.scrollIntoView({ behavior: 'smooth' })}><div className="stat-lbl">⏱ Outcomes overdue</div><div className="stat-val" style={sx('color:var(--warn)')}>2</div><div className="stat-sub">not observed automatically</div></div>
          <div className="stat" title="Of what we recommend, how much is accepted as-is or with a minor edit"><div className="stat-lbl">My first-pass acceptance</div><div className="stat-val sv3">78%</div><div className="stat-sub">threshold agreed at kickoff</div></div>
        </div>
    
        <div className="panel" id="outcomePanel" ref={outcomeRef} style={sx('margin-bottom:16px;border-color:var(--warn)')}>
          <div className="panel-hdr"><span className="panel-ttl">⏱ Awaiting your outcome update</span><span className="sc sc-m">2 waiting</span></div>
          <div className="panel-body" style={sx('padding:0')}>
            <div style={sx('padding:10px 16px;font-size:11px;color:var(--i3);border-bottom:1px solid var(--s75)')}>No CRM or calendar sync in this pilot — outcomes are reported, not observed. These went out and haven't been updated yet.</div>
            <div style={sx('display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--s75)')}>
              <div className="co-av" style={sx('background:#7D52A2')}>KW</div>
              <div style={sx('flex:1')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>Karen Whitfield · Meridian Chemical Corp</div><div style={sx('font-size:10.5px;color:var(--i3)')}>Email sent 3 days ago</div></div>
              <span className="sc sc-m" style={sx('margin-right:10px')}>3D</span>
              <Link href="/nba?openAccount=l1" className="btn btn-sec btn-sm" style={sx('text-decoration:none')}>Open →</Link>
            </div>
            <div style={sx('display:flex;align-items:center;gap:10px;padding:11px 16px')}>
              <div className="co-av" style={sx('background:#0094DA')}>RA</div>
              <div style={sx('flex:1')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>Robert Achebe · Trident Refining</div><div style={sx('font-size:10.5px;color:var(--i3)')}>LinkedIn DM sent 9 days ago — overdue</div></div>
              <span className="sc sc-l" style={sx('margin-right:10px')}>9D</span>
              <Link href="/nba?openAccount=l12" className="btn btn-sec btn-sm" style={sx('text-decoration:none')}>Open →</Link>
            </div>
          </div>
        </div>
    
        <div style={sx('display:grid;grid-template-columns:1.3fr 1fr;gap:16px;margin-bottom:16px')}>
          <div className="panel">
            <div className="panel-hdr"><span className="panel-ttl">Exceptions needing you</span><span className="sc sc-m">4 waiting</span></div>
            <div className="panel-body" style={sx('padding:0')}>
              <Link href="/review" style={sx('display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--s75);cursor:pointer;text-decoration:none;color:inherit')}>
                <div className="co-av" style={sx('background:#0094DA')}>RL</div>
                <div style={sx('flex:1')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>Rebecca Lindqvist · Ridgeline Utilities</div><div style={sx('font-size:10.5px;color:var(--i3)')}>Low confidence — no primary-persona contact</div></div>
                <span className="sc sc-m">TIER B</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--i4)" strokeWidth="2" strokeLinecap="round" style={sx('flex-shrink:0;margin-left:8px')}><polyline points="9 18 15 12 9 6" /></svg>
              </Link>
              <Link href="/review" style={sx('display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--s75);cursor:pointer;text-decoration:none;color:inherit')}>
                <div className="co-av" style={sx('background:#FF8820')}>TO</div>
                <div style={sx('flex:1')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>Thomas Okafor · Altair Petrochemicals</div><div style={sx('font-size:10.5px;color:var(--i3)')}>Low confidence — single uncorroborated signal</div></div>
                <span className="sc sc-m">TIER B</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--i4)" strokeWidth="2" strokeLinecap="round" style={sx('flex-shrink:0;margin-left:8px')}><polyline points="9 18 15 12 9 6" /></svg>
              </Link>
              <Link href="/review" style={sx('display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--s75);cursor:pointer;text-decoration:none;color:inherit')}>
                <div className="co-av" style={sx('background:#2E7D5A')}>GA</div>
                <div style={sx('flex:1')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>Grace Adeyemi · Vantage Oil &amp; Gas</div><div style={sx('font-size:10.5px;color:var(--i3)')}>Compliance gate — references a regional incident</div></div>
                <span className="sc sc-l">TIER C</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--i4)" strokeWidth="2" strokeLinecap="round" style={sx('flex-shrink:0;margin-left:8px')}><polyline points="9 18 15 12 9 6" /></svg>
              </Link>
              <Link href="/review" style={sx('display:flex;align-items:center;gap:10px;padding:11px 16px;cursor:pointer;text-decoration:none;color:inherit')}>
                <div className="co-av" style={sx('background:#7D52A2')}>NK</div>
                <div style={sx('flex:1')}><div style={sx('font-size:12.5px;font-weight:600;color:var(--i1)')}>Nadia Kowalski · Meadowbrook Power</div><div style={sx('font-size:10.5px;color:var(--i3)')}>Proceed criteria not met — only 2 in segment</div></div>
                <span className="sc sc-l">TIER C</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--i4)" strokeWidth="2" strokeLinecap="round" style={sx('flex-shrink:0;margin-left:8px')}><polyline points="9 18 15 12 9 6" /></svg>
              </Link>
            </div>
            <div style={sx('padding:10px 16px;border-top:1px solid var(--border)')}><Link href="/review" className="btn btn-primary btn-sm" style={sx('width:100%;justify-content:center;text-decoration:none')}>Open Review</Link></div>
          </div>
    
          <div className="panel">
            <div className="panel-hdr"><span className="panel-ttl">Work done overnight</span></div>
            <div className="panel-body">
              <div className="dim-row" style={sx('border:none;padding:5px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Records read</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>11,900</span></div>
              <div className="dim-row" style={sx('border:none;padding:5px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Accounts in scope</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>3,200</span></div>
              <div className="dim-row" style={sx('border:none;padding:5px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Signals qualified</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>2,100</span></div>
              <div className="dim-row" style={sx('border:none;padding:5px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Accounts with a live signal</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>1,860</span></div>
              <div className="dim-row" style={sx('border:none;padding:5px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Segments formed</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>34</span></div>
              <div className="dim-row" style={sx('border:none;padding:5px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Drafts generated</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>610</span></div>
              <div className="dim-row" style={sx('border:none;padding:5px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Drafts that passed every check</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>540</span></div>
              <div style={sx('margin-top:8px;padding-top:8px;border-top:1px solid var(--s75)')}><Link href="/analytics" style={sx('font-size:11px;color:var(--brand)')}>See the full funnel in Analytics →</Link></div>
            </div>
          </div>
        </div>
    
        <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px')}>
          <div className="panel">
            <div className="panel-hdr"><span className="panel-ttl">Scoring snapshot</span><Link href="/scoring" style={sx('font-size:10.5px;color:var(--brand)')}>Open →</Link></div>
            <div className="panel-body">
              <div className="dim-row"><span className="dim-lbl">Tier A — act now</span><div className="dim-track"><div className="dim-fill" style={sx('width:13%;background:var(--pos)')}></div></div><span className="dim-val">240</span></div>
              <div className="dim-row"><span className="dim-lbl">Tier B — act this cycle</span><div className="dim-track"><div className="dim-fill" style={sx('width:33%;background:var(--warn)')}></div></div><span className="dim-val">610</span></div>
              <div className="dim-row"><span className="dim-lbl">Tier C — nurture</span><div className="dim-track"><div className="dim-fill" style={sx('width:54%;background:var(--s300)')}></div></div><span className="dim-val">1,010</span></div>
              <div style={sx('font-size:10.5px;color:var(--i3);margin-top:8px;padding-top:8px;border-top:1px solid var(--s75)')}>58% of the universe carries at least one live signal. Strongest on modernisation and renewal timing.</div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-hdr"><span className="panel-ttl">NBA snapshot</span><Link href="/nba" style={sx('font-size:10.5px;color:var(--brand)')}>Open →</Link></div>
            <div className="panel-body">
              <div className="dim-row" style={sx('border:none;padding:5px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Segments live</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>21 of 34</span></div>
              <div className="dim-row" style={sx('border:none;padding:5px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Recommendations this week</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>850</span></div>
              <div className="dim-row" style={sx('border:none;padding:5px 0')}><span style={sx('font-size:11.5px;color:var(--i3)')}>Manual swaps to the runner-up</span><span style={sx('font-size:11.5px;color:var(--i1);margin-left:auto;font-weight:600')}>18</span></div>
              <div style={sx('font-size:10.5px;color:var(--i3);margin-top:8px;padding-top:8px;border-top:1px solid var(--s75)')}>Channel mix: 64% email · 24% LinkedIn · 12% call. Top segment this week: Modernisation (12 accounts, 5 at Tier A).</div>
            </div>
          </div>
        </div>
    
        <div className="panel">
          <div className="panel-hdr"><span className="panel-ttl">Where things stand</span></div>
          <div className="panel-body" style={sx('display:grid;grid-template-columns:repeat(5,1fr);text-align:center;gap:4px')}>
            <Link href="/setup" style={sx('text-decoration:none;color:inherit')}>
              <div style={sx('font-size:11px;font-weight:700;color:var(--i1)')}>Setup</div>
              <div style={sx('font-size:10px;color:var(--pos);margin-top:2px')}>5 of 7 signed off</div>
            </Link>
            <Link href="/prospecting" style={sx('text-decoration:none;color:inherit')}>
              <div style={sx('font-size:11px;font-weight:700;color:var(--i1)')}>Lead discovery</div>
              <div style={sx('font-size:10px;color:var(--i3);margin-top:2px')}>Universe ready</div>
            </Link>
            <Link href="/scoring" style={sx('text-decoration:none;color:inherit')}>
              <div style={sx('font-size:11px;font-weight:700;color:var(--i1)')}>Scoring</div>
              <div style={sx('font-size:10px;color:var(--i3);margin-top:2px')}>240 at Tier A</div>
            </Link>
            <Link href="/nba" style={sx('text-decoration:none;color:inherit')}>
              <div style={sx('font-size:11px;font-weight:700;color:var(--i1)')}>Next best action</div>
              <div style={sx('font-size:10px;color:var(--i3);margin-top:2px')}>21 segments live</div>
            </Link>
            <Link href="/analytics" style={sx('text-decoration:none;color:inherit')}>
              <div style={sx('font-size:11px;font-weight:700;color:var(--i1)')}>Analytics</div>
              <div style={sx('font-size:10px;color:var(--i3);margin-top:2px')}>Week 3 summary</div>
            </Link>
          </div>
        </div>
    
      </div>
    </main>
  );
}
