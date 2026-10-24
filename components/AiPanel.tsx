'use client';

/* The AI service, on Setup (Admin; Phase 6; D-44): where calls go (the main model, and the small one with the
   capabilities that use it), which capabilities are on (each with its rules as the fallback), whether a circuit
   breaker has taken over, the last 30 days of calls from the metadata record with the models that answered, and a
   health check that makes one tiny call to each model. Flags are set in the server's configuration, not here: each stays off in
   production until its evaluation passes (docs/AI.md). No key is ever shown. */
import { useEffect, useState } from 'react';
import { sx } from '@/lib/sx';
import { api, errorText, type WireDeep } from '@/lib/client/api';
import { useCan } from '@/components/SessionContext';
import type { aiStatus } from '@/lib/server/services/ai-admin';

type Status = WireDeep<Awaited<ReturnType<typeof aiStatus>>>;
type Check = { ok: boolean; provider: string; deployment: string | null; latencyMs: number | null; message: string };

const PROVIDER: Record<string, string> = { 'azure-openai': 'Azure OpenAI', bedrock: 'Amazon Bedrock', none: 'None: every capability uses its rules' };
const BREAKER: Record<string, string> = { closed: 'Working normally', open: 'Paused after repeated failures: the rules are answering until it cools down', half_open: 'Trying one call to see whether it has recovered' };

export function AiPanel({ num }: { num: number }) {
  const allowed = useCan('ai.admin');
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => { if (allowed) api<Status>('/api/admin/ai').then(setS, err => setError(errorText(err))); }, [allowed]);
  if (!allowed) return null;

  async function runCheck() {
    setChecking(true);
    try { setCheck(await api<Check>('/api/admin/ai/healthcheck', { body: {} })); api<Status>('/api/admin/ai').then(setS, () => {}); }
    catch (err) { setCheck({ ok: false, provider: s?.provider ?? '', deployment: null, latencyMs: null, message: errorText(err) }); }
    finally { setChecking(false); }
  }

  return <div className="panel" id="sec-ai">
    <div className="panel-hdr"><span className="panel-ttl">{`${num} · AI service`}</span>{s ? <span className={`sc ${s.provider === 'none' ? 'sc-m' : 'sc-h'}`}>{s.provider === 'none' ? 'Rules only' : PROVIDER[s.provider]}</span> : null}</div>
    <div className="panel-body" style={sx('font-size:12px;color:var(--i2);line-height:1.6')}>
      {error ? <p role="alert" style={sx('color:var(--neg)')}>{error}</p> : null}
      {!s && !error ? <p>Loading…</p> : null}
      {s ? <>
        <p style={sx('margin:0 0 10px')}>Every AI capability has its own switch in the server&apos;s configuration and its rules as the fallback: when a switch is off, the model is slow or failing, or an answer fails the checks, the rules answer and the screen says so. Only what each call was is kept (capability, template, timing, tokens, outcome), never what was asked or answered.</p>
        <table className="au"><tbody>
          <tr><td>Provider</td><td>{PROVIDER[s.provider] ?? s.provider}</td></tr>
          {s.deployment ? <tr><td>{s.provider === 'bedrock' ? 'Model' : 'Deployment'}</td><td>{s.deployment}{s.apiVersion ? ` · API version ${s.apiVersion}` : ''}{s.region ? ` · ${s.region}` : ''}</td></tr> : null}
          {s.small ? <tr><td>{s.provider === 'bedrock' ? 'Small model' : 'Small deployment'}</td><td>{`${s.small.deployment} · used for ${s.small.for.map(k => s.capabilities.find(c => c.key === k)?.label.toLowerCase() ?? k).join(', ') || 'nothing'}`}{s.small.breaker !== 'closed' ? ` · ${BREAKER[s.small.breaker] ?? s.small.breaker}` : ''}</td></tr> : null}
          {s.authHeader ? <tr><td>Key sent as</td><td>{s.authHeader} header (the key itself is never shown)</td></tr> : null}
          <tr><td>State</td><td>{BREAKER[s.breaker] ?? s.breaker}</td></tr>
          <tr><td>Limits</td><td>{`${Math.round(s.timeoutMs / 1000)} s per attempt · ${s.maxConcurrency} calls at once · cost estimate at USD ${s.prices.inputPerMTok} / ${s.prices.outputPerMTok} per million tokens in / out${s.smallPrices ? ` (small model ${s.smallPrices.inputPerMTok} / ${s.smallPrices.outputPerMTok})` : ''}`}</td></tr>
        </tbody></table>
        <div style={sx('display:flex;align-items:center;gap:10px;margin:12px 0')}>
          <button className="btn btn-sec btn-sm" disabled={checking || s.provider === 'none'} onClick={() => void runCheck()}>{checking ? 'Checking…' : 'Run a health check'}</button>
          {check ? <span role="status" style={sx(`color:${check.ok ? 'var(--pos)' : 'var(--neg)'}`)}>{check.ok ? '✓ ' : '✗ '}{check.message}</span>
            : s.provider === 'none' ? <span>Set AI_PROVIDER and its settings in the server&apos;s configuration to connect a model.</span> : <span>{s.small ? 'One tiny call to each model' : 'One tiny call'}; it shows whether the model answers and how fast.</span>}
        </div>
        <table className="au"><thead><tr><th>Capability</th><th>Switch</th><th>{`Calls (${s.days} days)`}</th><th>Answered</th><th>Rules took over</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>
          {s.capabilities.map(c => <tr key={c.key}>
            <td><b>{c.label}</b><div style={sx('color:var(--i3)')}>{c.what}</div>{c.models.length ? <div style={sx('color:var(--i3)')}>{`Answered by ${c.models.join(', ')}`}</div> : null}</td>
            <td>{c.flag ? <span className={`tag ${c.on ? 'tag-green' : 'tag-grey'}`} title={c.flag}>{c.on ? 'On' : 'Off: rules only'}</span> : '—'}</td>
            <td>{c.calls}{c.avgLatencyMs !== null ? <div style={sx('color:var(--i3)')}>{`${(c.avgLatencyMs / 1000).toFixed(1)} s average`}</div> : null}</td>
            <td>{c.ok}</td>
            <td>{c.fallback + c.filtered + c.error}{c.reasons.length ? <div style={sx('color:var(--i3)')}>{c.reasons.slice(0, 2).map(r => `${r.n}: ${r.words}`).join('; ')}</div> : null}</td>
            <td>{c.tokens.toLocaleString('en-US')}</td><td>{`USD ${c.costUsd.toFixed(2)}`}</td>
          </tr>)}
        </tbody></table>
      </> : null}
    </div>
  </div>;
}
