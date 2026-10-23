'use client';
// Copilot's side panel (G-013; the legacy panel without saved chats: retention is not approved, so the conversation
// lives only while the page is open). It answers about what is on the screen; the server decides how (rules first,
// the model for the rest). Answers arrive as blocks and are rendered as React elements: nothing in them is run as
// markup. An Autopilot plan runs only when the person presses its button, and can be undone.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { sx } from '@/lib/sx';
import { api, errorText } from '@/lib/client/api';
import { showToast } from '@/lib/ui';
import { useCan } from '@/components/SessionContext';
import { AiTag } from '@/components/AiTag';
import { CHIPS, type AutopilotPlan, type CopilotAnswer, type CopilotBlock, type CopilotRef, type CopilotScreen, type CopilotTurn } from '@/lib/copilot/types';

type Msg = { you: string } | { answer: CopilotAnswer };
type PlanState = { phase: 'ready' | 'running' | 'done' | 'cancelled' | 'undone'; runId?: string; done?: number; skipped?: { label: string; why: string }[]; error?: string };

/** **bold** spans in a line of text, as React elements. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}

/** An answer as plain text, for the last turns sent with the next question. */
function plainOf(a: CopilotAnswer): string {
  return a.blocks.map(b => b.t === 'p' || b.t === 'note' ? b.text : b.t === 'list' ? b.items.join('; ') : b.t === 'items' ? b.rows.map(r => r.label).join('; ')
    : b.t === 'table' ? b.rows.map(r => r.join(' · ')).join('; ') : b.t === 'checks' ? b.checks.map(c => `${c.ok ? '✓' : '✗'} ${c.name}`).join(', ') : '').filter(Boolean).join('\n').replace(/\*\*/g, '').slice(0, 600);
}

export function CopilotButton({ screen, ctxRef, title, onChanged }: { screen: CopilotScreen; ctxRef: CopilotRef; title: string; onChanged?: () => void }) {
  const allowed = useCan('copilot.use');
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [plans, setPlans] = useState<Record<string, PlanState>>({});
  const ctl = useRef<AbortController | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const key = `${screen}:${JSON.stringify(ctxRef)}`;
  const [shownKey, setShownKey] = useState(key);
  // A different record on the screen starts a new conversation about it.
  if (shownKey !== key) { setShownKey(key); setMsgs([]); setPlans({}); }
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 60); }, [open]);
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight }); }, [msgs, busy]);
  if (!allowed) return null;

  const kind = ctxRef.itemId ? 'item' : screen === 'nba' ? 'nba' : screen === 'prospecting' ? 'prospecting' : screen === 'scoring' ? (ctxRef.contactId ? 'prospect' : 'scoring') : 'queue';
  const chips = CHIPS[kind] ?? CHIPS.queue;

  async function ask(q: string, chip = false) {
    q = q.trim();
    if (!q || busy) return;
    const turns: CopilotTurn[] = msgs.map(m => ('you' in m ? { role: 'you' as const, text: m.you } : { role: 'copilot' as const, text: plainOf(m.answer) }));
    setMsgs(m => [...m, { you: q }]);
    setText('');
    setBusy(true);
    const c = new AbortController();
    ctl.current = c;
    try {
      const answer = await api<CopilotAnswer>('/api/copilot', { body: { screen, ref: ctxRef, question: q, turns, chip, offset: new Date().getTimezoneOffset() }, signal: c.signal });
      setMsgs(m => [...m, { answer }]);
    } catch (err) {
      const stopped = err instanceof DOMException && err.name === 'AbortError';
      setMsgs(m => [...m, { answer: { blocks: [{ t: 'note', text: stopped ? 'Stopped.' : errorText(err) }], source: 'none', suggestions: [] } }]);
    } finally {
      setBusy(false);
      ctl.current = null;
    }
  }

  async function runPlan(id: string, plan: AutopilotPlan) {
    setPlans(p => ({ ...p, [id]: { phase: 'running' } }));
    try {
      const r = await api<{ runId: string; done: { label: string }[]; skipped: { label: string; why: string }[] }>('/api/copilot/autopilot', { body: { kind: plan.kind, ids: plan.will.map(w => w.id), instruction: plan.instruction } });
      setPlans(p => ({ ...p, [id]: { phase: 'done', runId: r.runId, done: r.done.length, skipped: r.skipped } }));
      showToast(r.done.length ? `Autopilot ${plan.kind === 'spot' ? 'rated' : 'accepted and released'} ${r.done.length}` : 'Autopilot changed nothing');
      onChanged?.();
    } catch (err) { setPlans(p => ({ ...p, [id]: { phase: 'ready', error: errorText(err) } })); }
  }
  async function undo(id: string, runId: string) {
    try {
      const r = await api<{ restored: number; kept: { why: string }[] }>(`/api/copilot/autopilot/${runId}/undo`, { body: {} });
      setPlans(p => ({ ...p, [id]: { ...p[id], phase: 'undone' } }));
      showToast(`Undone: ${r.restored} back in For Review${r.kept.length ? `, ${r.kept.length} changed since and left as they are` : ''}`);
      onChanged?.();
    } catch (err) { showToast(errorText(err)); }
  }

  function block(b: CopilotBlock, i: number, at: number): ReactNode {
    switch (b.t) {
      case 'p': return <p key={i}><Rich text={b.text} /></p>;
      case 'note': return <p key={i} className="cpp-muted"><Rich text={b.text} /></p>;
      case 'list': { const L = b.ordered ? 'ol' : 'ul'; return <L key={i}>{b.items.map((x, j) => <li key={j}><Rich text={x} /></li>)}</L>; }
      case 'items': return <div key={i} className="cpp-rows">{b.rows.map(r => <Link key={r.id} href={r.href} className="cpp-row"><span><b>{r.label}</b>{r.sub ? <span className="cpp-sub"> · {r.sub}</span> : null}</span><span aria-hidden="true">›</span></Link>)}
        {b.more ? <div className="cpp-sub">and {b.more} more</div> : null}</div>;
      case 'table': return <div key={i} className="cpp-card"><table className="cpp-tbl">{b.head.some(Boolean) ? <thead><tr>{b.head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead> : null}
        <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}><Rich text={c} /></td>)}</tr>)}</tbody></table></div>;
      case 'checks': return <div key={i} className="tags" style={sx('margin:6px 0')}>{b.checks.map(c => <span key={c.name} className={`tag ${c.ok ? 'tag-green' : 'tag-red'}`}>{c.ok ? '✓' : '✗'} {c.name}</span>)}</div>;
      case 'link': return <div key={i}><Link className="btn btn-sec btn-sm" style={sx('text-decoration:none;margin-top:6px')} href={b.href}>{b.label}</Link></div>;
      case 'plan': {
        const id = `${at}-${i}`, st = plans[id] ?? { phase: 'ready' }, p = b.plan;
        return <div key={i} className="cpp-card cpp-plan">
          <div className="cpp-plan-h ok">{`${p.kind === 'spot' ? 'Rate as accepted' : 'Accept and release'} · ${p.will.length}`}</div>
          {p.will.length ? <ul>{p.will.slice(0, 8).map(w => <li key={w.id}>{w.label}</li>)}{p.will.length > 8 ? <li className="cpp-sub">and {p.will.length - 8} more</li> : null}</ul> : <p className="cpp-muted">None: every match has a reason a person must decide.</p>}
          {p.left.length ? <><div className="cpp-plan-h warn">{`Left for you · ${p.left.length}`}</div><ul>{p.left.slice(0, 6).map(l => <li key={l.id}>{l.label}<div className="cpp-sub">{l.why}</div></li>)}</ul></> : null}
          {st.error ? <p role="alert" className="cpp-err">{st.error}</p> : null}
          {st.phase === 'ready' && p.will.length ? <div className="cpp-act"><button className="btn btn-primary btn-sm" onClick={() => void runPlan(id, p)}>{`Run with Autopilot · ${p.will.length}`}</button>
            <button className="btn btn-sec btn-sm" onClick={() => setPlans(x => ({ ...x, [id]: { phase: 'cancelled' } }))}>Cancel</button></div> : null}
          {st.phase === 'running' ? <p className="cpp-muted">Autopilot is checking each item again…</p> : null}
          {st.phase === 'cancelled' ? <span className="tag tag-grey">Cancelled: nothing changed</span> : null}
          {st.phase === 'done' ? <><p><b>Autopilot finished.</b> {`It ${p.kind === 'spot' ? 'rated' : 'accepted and released'} ${st.done}${st.skipped?.length ? ` and left ${st.skipped.length} for you` : ''}. Logged under your name.`}</p>
            {st.skipped?.map((s, j) => <div key={j} className="cpp-sub">{`Left for you: ${s.label} (${s.why})`}</div>)}
            <div className="cpp-act">{st.done ? <button className="btn btn-sec btn-sm" onClick={() => void undo(id, st.runId!)}>Undo this run</button> : null}<Link className="btn btn-ghost btn-sm" style={sx('text-decoration:none')} href="/review?view=log">Decision log →</Link></div></> : null}
          {st.phase === 'undone' ? <span className="tag tag-grey">Undone: back in For Review</span> : null}
        </div>;
      }
    }
  }

  const last = msgs.at(-1);
  const follow = last && 'answer' in last ? last.answer.suggestions : [];
  const panel = open ? <aside className="copilot" aria-label="Copilot" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); ctl.current?.abort(); setOpen(false); } }}>
    <div className="cpp-h"><span className="cpp-logo" aria-hidden="true">✦</span>
      <div className="cpp-ht"><div className="cpp-t">Copilot</div><div className="cpp-s" title={title}>{title}</div></div>
      <button className="cpp-tool" title="New chat" aria-label="New chat" disabled={busy} onClick={() => { setMsgs([]); setPlans({}); }}>＋</button>
      <button className="cpp-tool" title="Close (Esc)" aria-label="Close Copilot" onClick={() => { ctl.current?.abort(); setOpen(false); }}>✕</button></div>
    <div className="cpp-b" ref={body}>
      {!msgs.length ? <div className="cpp-hello"><div className="cpp-hello-t">{`What do you want to know about ${title}?`}</div>
        <div className="cpp-hello-s">I answer from the data on this screen. I never change anything unless you confirm, and chats are not kept.</div>
        <div className="cpp-sugg">{chips.map(c => <button key={c} onClick={() => void ask(c, true)}>{c}</button>)}</div></div> : null}
      {msgs.map((m, at) => ('you' in m ? <div key={at} className="cpp-me">{m.you}</div>
        : <div key={at} className="cpp-ai"><span className="cpp-logo sm" aria-hidden="true">✦</span><div className="cpp-ai-b">
          {m.answer.blocks.map((b, i) => block(b, i, at))}
          {m.answer.source === 'ai' ? <div style={sx('margin-top:6px')}><AiTag title="Answered by AI from the data on this screen only; people were not named to it." /></div> : null}
          {m.answer.partial ? <p className="cpp-muted">{m.answer.partial}</p> : null}
          {m.answer.fallback ? <p className="cpp-muted">{`The AI couldn't answer: ${m.answer.fallback}.`}</p> : null}
        </div></div>))}
      {busy ? <div className="cpp-ai"><span className="cpp-logo sm" aria-hidden="true">✦</span><div className="cpp-ai-b"><span className="cpp-typing" role="status" aria-label="Copilot is answering"><i /><i /><i /></span></div></div> : null}
      {follow.length && !busy ? <div className="cpp-follow">{follow.map(c => <button key={c} onClick={() => void ask(c, true)}>{c}</button>)}</div> : null}
    </div>
    <form className="cpp-f" onSubmit={e => { e.preventDefault(); void ask(text); }}>
      <div className="cpp-comp"><textarea ref={input} rows={1} value={text} placeholder={`Ask about ${title}…`} aria-label="Ask Copilot" onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text); } }} />
        {busy ? <button type="button" className="cpp-send busy" aria-label="Stop" onClick={() => ctl.current?.abort()}>■</button> : <button type="submit" className="cpp-send" aria-label="Send">↑</button>}</div>
      <div className="cpp-foot">Enter to send · Shift + Enter for a new line · Esc to close</div>
    </form>
  </aside> : null;

  return <>
    <button className="btn btn-sec btn-sm" title="Ask Copilot" onClick={() => setOpen(o => !o)} aria-expanded={open}><span style={sx('color:var(--brand)')}>✦</span> Copilot</button>
    {panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
  </>;
}
