'use client';

/* How to use signals for a new or fresh ICP (product owner, 30 Oct 2026): a guide opened from the top of Prospecting
   and Account Scoring. Plain steps from describing the ICP to acting on the signals, with the screen it is opened from
   marked "You are here". */
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DemandAI } from '@/lib/demandai-engine';
import { download } from '@/lib/download';

type From = 'prospecting' | 'scoring';
const STEPS: { key: string; title: string; where: { label: string; href: string }; body: ReactNode; here?: From }[] = [
  { key: 'icp', title: 'Describe the new ICP', where: { label: 'Setup › ICP and rubric', href: '/setup#sec-rubric' },
    body: <>Say what makes an account a good fit: the parts (vertical, size, site, or your own), how much each counts, and the fit floor. Accounts below the floor are not scored for timing.</> },
  { key: 'leads', title: 'Load the people', where: { label: 'Prospecting', href: '/prospecting' }, here: 'prospecting',
    body: <>Upload the lead file. Every row is checked; only people who can be contacted, in accounts that pass the knock-outs, stay in the list. Save the list.</> },
  { key: 'signals', title: 'Choose the signals that mean “now”', where: { label: 'Setup › Signals', href: '/setup#sec-signals' },
    body: <>Switch on the starting types that matter for this ICP and add new ones, named as your source files name them. For each new one write what it means, how strongly it counts and how long it lasts. No micro-segment or action has to be set up: the AI groups accounts and suggests the action from what the signal means.</> },
  { key: 'file', title: 'Fill in the signal file', where: { label: 'Signal template', href: '' },
    body: <>One row per event: the company, the person (<code>contact_email_or_linkedin</code> and <code>lead_name</code>), the <code>signal_type</code> exactly as named in Setup, the <code>event_date</code> (YYYY-MM-DD) and the <code>detail</code>: what happened, in words a rep would use. The detail is quoted in the why-now line and the first message.</> },
  { key: 'score', title: 'Score', where: { label: 'Account Scoring', href: '/scoring' }, here: 'scoring',
    body: <>Pick the saved list and the signal file. Score = fit × timing, so a good-fit account with a fresh, strong signal comes first. A tag the system doesn&apos;t know shows in Signal monitoring with “Add it”.</> },
  { key: 'act', title: 'Act on it', where: { label: 'Micro-segments & NBA', href: '/nba' },
    body: <>Send tier A and B on. Accounts are grouped by what their signals mean and each gets a next best action with a first message. A new group, or an action outside the library, waits in For Review for a person.</> },
];

export function SignalsGuideButton({ from }: { from: From }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const template = () => download('signal_template.csv', DemandAI.toCSV([DemandAI.SIGNAL_COLUMNS]));
  return <>
    <button className="btn btn-sec btn-sm" aria-haspopup="dialog" onClick={() => setOpen(true)} title="How to use signals for a new or fresh ICP">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></svg>
      Signals guide
    </button>
    {open ? <div className="guide-ov" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <aside className="guide" role="dialog" aria-modal="true" aria-labelledby="sgGuideTitle">
        <div className="drawer-hdr"><div><div className="drawer-title" id="sgGuideTitle">Signals for a new ICP</div><div className="drawer-sub">From an empty setup to the first actions</div></div>
          <button ref={closeRef} className="drawer-close" aria-label="Close the guide" onClick={() => setOpen(false)}>✕</button></div>
        <div className="drawer-body">
          <p className="guide-lead">A <b>signal</b> is something that happened at an account that says now is a good time to talk: an inquiry, a project, a webinar, a new leader. <b>Fit</b> says who to talk to; <b>signals</b> say when.</p>
          <ol className="guide-steps">{STEPS.map((s, i) => <li key={s.key} className={`guide-step ${s.here === from ? 'here' : ''}`}>
            <span className="guide-num">{i + 1}</span>
            <div><div className="guide-t">{s.title}{s.here === from ? <span className="guide-here">You are here</span> : null}</div>
              <div className="guide-b">{s.body}</div>
              {s.where.href ? <Link className="guide-where" href={s.where.href} onClick={() => setOpen(false)}>{s.where.label} →</Link>
                : <button className="guide-where" onClick={template}>Download the signal template (.csv)</button>}</div></li>)}</ol>
          <div className="guide-box"><b>How a signal finds its person</b>
            <ul><li>By the email or LinkedIn URL in <code>contact_email_or_linkedin</code>.</li>
              <li>Else by <code>lead_name</code>, when exactly one person at the account has that name.</li>
              <li>Else it goes to the account&apos;s primary-persona contact who can be contacted, marked “Auto-assigned”.</li></ul></div>
          <div className="guide-box"><b>Tips</b>
            <ul><li>Start with a few strong signals; add more once you see which turn into replies and meetings (Analytics › Learning loop).</li>
              <li>A signal counts fully for its “full weight” days, then fades to nothing at “gone after”. Old events don&apos;t lift a score.</li>
              <li>A tag that isn&apos;t a signal type yet is never lost: it is listed in Signal monitoring and Setup until someone adds or ignores it.</li></ul></div>
        </div>
      </aside>
    </div> : null}
  </>;
}
