'use client';

/* Small pieces of the Hunter.io email verification UI that Prospecting shows: the label under an email and the
   pop-up with every field Hunter returned. Built from the screen's existing tags, overlay and table styles. */
import type { ReactNode } from 'react';
import { sx } from '@/lib/sx';
import type { EmailVerification, VerificationOutcome } from '@/types/email-verification';

const OVERLAY = 'position:fixed;inset:0;background:rgba(20,26,33,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px';

export const OUTCOME: Record<VerificationOutcome, { label: string; color: string; tag: string }> = {
  valid: { label: 'Valid', color: 'var(--pos)', tag: 'tag-green' },
  invalid: { label: 'Invalid', color: 'var(--neg)', tag: 'tag-red' },
  inconclusive: { label: 'Inconclusive', color: 'var(--warn)', tag: 'tag-amber' },
  do_not_process: { label: 'Do not process', color: 'var(--neg)', tag: 'tag-red' },
};

export interface VerifyState { busy?: boolean; error?: string }

/** The line under an email in the Final list: what Hunter said, or the way to ask it. */
export function HunterLabel({ outcome, state, hasEmail, onVerify, onDetails }: {
  outcome: VerificationOutcome | null; state?: VerifyState; hasEmail: boolean; onVerify: () => void; onDetails: () => void;
}): ReactNode {
  const v = outcome ? { outcome } : null;
  const link = 'cursor:pointer;color:var(--brand);font-weight:600;background:none;border:0;padding:0;font-size:inherit';
  if (state?.busy) return <span style={sx('color:var(--i3)')}>Verifying…</span>;
  return <>
    {v ? <span style={sx(`color:${OUTCOME[v.outcome].color}`)}>{`Hunter: ${OUTCOME[v.outcome].label}`}</span> : null}
    {state?.error ? <span style={sx('color:var(--neg)')} title={state.error}>{v ? ' · ' : ''}Check failed</span> : null}
    {v ? <>{' · '}<button style={sx(link)} onClick={onDetails}>Details</button></> : null}
    {hasEmail ? <>{v || state?.error ? ' · ' : ''}<button style={sx(link)} onClick={onVerify}>{v ? 'Re-check' : state?.error ? 'Retry' : 'Verify'}</button></> : null}
  </>;
}

const yn = (b: boolean | null) => b === null ? '—' : b ? 'Yes' : 'No';
const HELP: Record<string, string> = {
  status: 'Hunter’s verdict', score: 'Deliverability, 0–100', regexp: 'Passes the format check', gibberish: 'Looks auto-generated',
  disposable: 'From a disposable provider', webmail: 'From a webmail provider (Gmail, Outlook…)', mx_records: 'The domain has mail servers',
  smtp_server: 'Connected to the mail server', smtp_check: 'The address does not bounce', accept_all: 'The server accepts any address',
  block: 'The server blocked the check', verification: 'When and how Hunter last verified it', sources: 'Public pages where the address was found',
};

export function VerificationDetails({ v, onClose, onRecheck }: { v: EmailVerification; onClose: () => void; onRecheck: () => void }) {
  const rows: [string, ReactNode][] = [
    ['status', v.status ?? '—'], ['score', v.score ?? '—'], ['regexp', yn(v.regexp)], ['gibberish', yn(v.gibberish)], ['disposable', yn(v.disposable)],
    ['webmail', yn(v.webmail)], ['mx_records', yn(v.mx_records)], ['smtp_server', yn(v.smtp_server)], ['smtp_check', yn(v.smtp_check)],
    ['accept_all', yn(v.accept_all)], ['block', yn(v.block)],
    ['verification', v.verification ? `${v.verification.status ?? '—'}${v.verification.date ? ' · ' + v.verification.date : ''}` : '—'],
    ['sources', v.sources.length ? <div>{v.sources.map((s, i) => <div key={i} style={sx('font-size:11px;color:var(--i2);word-break:break-all')}>
      {s.uri || s.domain}<span style={sx('color:var(--i3)')}>{` · seen ${s.last_seen_on || '—'}${s.still_on_page ? ' · still on page' : ''}`}</span></div>)}</div> : '—'],
  ];
  const o = OUTCOME[v.outcome];
  return (
    <div id="verifyOverlay" style={sx(OVERLAY)} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={sx('background:var(--surf);border-radius:var(--rlg);box-shadow:var(--sh-lg);width:520px;max-width:100%;max-height:90vh;display:flex;flex-direction:column')}>
        <div style={sx('padding:20px 22px 10px')}>
          <div style={sx('font-family:var(--fd);font-size:15px;font-weight:700;color:var(--i1);word-break:break-all')}>{v.email}</div>
          <div style={sx('margin-top:8px;display:flex;align-items:center;gap:8px')}><span className={`tag ${o.tag}`}>{o.label}</span>
            <span style={sx('font-size:12px;color:var(--i2)')}>{v.reason}</span></div>
          <div style={sx('font-size:11px;color:var(--i3);margin-top:6px')}>{`Hunter.io · checked ${new Date(v.checkedAt).toLocaleString()}`}</div>
        </div>
        <div style={sx('padding:0 22px;overflow-y:auto')}>
          {rows.map(([k, val]) => (
            <div key={k} style={sx('display:flex;gap:12px;padding:7px 0;border-bottom:1px solid var(--s75);align-items:flex-start')}>
              <div style={sx('width:130px;flex-shrink:0')}><div style={sx('font-family:var(--fm);font-size:11px;color:var(--i1)')}>{k}</div><div style={sx('font-size:10px;color:var(--i3)')}>{HELP[k]}</div></div>
              <div style={sx('flex:1;min-width:0;font-size:12.5px;color:var(--i1)')}>{val}</div>
            </div>
          ))}
        </div>
        <div style={sx('padding:14px 22px 18px;display:flex;gap:8px;justify-content:flex-end')}>
          <button className="btn btn-ghost btn-sm" onClick={onRecheck}>Re-check with Hunter</button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
