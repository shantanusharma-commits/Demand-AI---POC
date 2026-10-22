'use client';

/* The body of the detail drawer in Prospecting: everything about one contact that the table row leaves out.
   It is only fetched when a row is opened (the table rows carry no nested data), so a long list stays light. */
import type { ReactNode } from 'react';
import { sx } from '@/lib/sx';
import type { ContactDetail } from '@/types/prospecting-runs';
import { OUTCOME } from './EmailVerificationUI';

const H = 'font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--i3);margin:16px 0 6px';
const SEV: Record<string, string> = { stop: 'var(--neg)', flag: 'var(--warn)', info: 'var(--s300)' };

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div style={sx('display:flex;gap:10px;padding:4px 0;font-size:12px')}><span style={sx('width:96px;flex-shrink:0;color:var(--i3)')}>{k}</span><span style={sx('flex:1;min-width:0;color:var(--i1);word-break:break-word')}>{v || <span style={sx('color:var(--i4)')}>—</span>}</span></div>;
}

export type DrawerState = { row: number; status: 'loading' } | { row: number; status: 'error'; error: string } | { row: number; status: 'ready'; data: ContactDetail };

export function ContactDetailPanel({ d, onVerification, onRetry }: { d: DrawerState; onVerification: () => void; onRetry: () => void }) {
  if (d.status === 'loading') return <div style={sx('font-size:12px;color:var(--i3)')}>Loading…</div>;
  if (d.status === 'error') return <div style={sx('font-size:12px;color:var(--neg)')}>{d.error} <button className="btn btn-ghost btn-sm" onClick={onRetry}>Retry</button></div>;
  const { contact: c, account: a, issues } = d.data;
  const v = c.emailVerification, o = v ? OUTCOME[v.outcome] : null;
  return <>
    <div style={sx('font-size:12px;color:var(--i2)')}>{c.status}</div>

    <div style={sx(H)}>Contact</div>
    <Row k="Job title" v={c.jobTitle} /><Row k="Persona" v={c.persona} />
    <Row k="Email" v={c.emailRaw} /><Row k="LinkedIn" v={c.linkedinRaw} />
    <Row k="Location" v={[c.city, c.country].filter(Boolean).join(', ')} />
    <Row k="Reachable by" v={c.reachableBy === 'none' ? 'No channel' : c.reachableBy} />
    <Row k="Consent" v={c.optOut ? 'Opted out' : c.consent} /><Row k="Owner" v={c.owner} />

    <div style={sx(H)}>Email verification</div>
    {v && o ? <>
      <div style={sx('display:flex;align-items:center;gap:8px;margin-bottom:4px')}><span className={`tag ${o.tag}`}>{o.label}</span><span style={sx('font-size:11.5px;color:var(--i2)')}>{v.reason}</span></div>
      <button className="btn btn-sec btn-sm" onClick={onVerification}>{`All Hunter.io fields${v.sources.length ? ` · ${v.sources.length} source${v.sources.length === 1 ? '' : 's'}` : ''}`}</button>
    </> : <div style={sx('font-size:12px;color:var(--i3)')}>{c.email ? 'Not verified with Hunter.io yet. Use Verify on the row.' : 'No email to verify.'}</div>}

    {a ? <>
      <div style={sx(H)}>Account</div>
      <Row k="Company" v={a.name} /><Row k="Domain" v={a.domain} /><Row k="Industry" v={a.industry} />
      <Row k="Vertical" v={`${a.vertical} (${a.verticalLevel}, ${a.confidence} confidence)`} />
      <Row k="Classification" v={a.classReason} />
      <Row k="Account type" v={a.accountType} />
      <Row k="Size" v={a.revenue != null ? `USD ${a.revenue.toLocaleString('en-US')}` : a.employees != null ? `${a.employees.toLocaleString('en-US')} employees` : ''} />
      <Row k="Site" v={[a.siteName, a.siteProcess, a.siteCapacity && `${Number(a.siteCapacity).toLocaleString('en-US')} ${a.capacityUnit}`].filter(Boolean).join(' · ')} />
      <div style={sx(H)}>Knock-outs</div>
      {a.checks.map((k, i) => <div key={i} style={sx('display:flex;gap:8px;padding:3px 0;font-size:12px')}>
        <span style={sx(`width:14px;color:${k.pass === false ? 'var(--neg)' : k.pass ? 'var(--pos)' : 'var(--i4)'}`)}>{k.pass === false ? '✕' : k.pass ? '✓' : '·'}</span>
        <span style={sx('flex:1;color:var(--i2)')}>{k.rule}<span style={sx('display:block;font-size:11px;color:var(--i3)')}>{k.why}</span></span></div>)}
    </> : null}

    <div style={sx(H)}>{`Issues (${issues.length})`}</div>
    {issues.length ? issues.map((i, k) => <div key={k} style={sx('display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--s75)')}>
      <span style={{ ...sx('width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:5px'), background: SEV[i.severity] }}></span>
      <div style={sx('font-size:12px;color:var(--i1)')}>{i.issue}<span style={sx('display:block;font-size:11px;color:var(--i3)')}>{`${i.outcome}. Fix: ${i.fix}`}</span></div></div>)
      : <div style={sx('font-size:12px;color:var(--i3)')}>None.</div>}
  </>;
}
