'use client';
// Copilot's side panel (G-013; the legacy panel, saved chats included). It answers about what is on the screen; the
// server decides how (rules first, the model for the rest) and keeps each question and answer in the person's chat
// about the record open on the screen, so the conversation is there when they come back. A prospect or item picked on
// the screen is the chat's focus: it stays until another is picked or it is cleared. Answers arrive as blocks and are
// rendered as React elements: nothing in them is run as markup. An Autopilot plan runs only when the person presses
// its button, and can be undone.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { sx } from '@/lib/sx';
import { api, errorText } from '@/lib/client/api';
import { showToast } from '@/lib/ui';
import { useCan } from '@/components/SessionContext';
import { AiTag } from '@/components/AiTag';
import {
  CHIPS, chatKey, type AutopilotPlan, type CopilotAnswer, type CopilotBlock, type CopilotChat, type CopilotChatSummary, type CopilotFocus, type CopilotRef,
  type CopilotScreen,
} from '@/lib/copilot/types';

/** `kept`: an answer read back from a saved chat (its Autopilot plan is not run again from here). */
type Msg = { you: string; about?: string | null } | { answer: CopilotAnswer; kept?: boolean };
type PlanState = { phase: 'ready' | 'running' | 'done' | 'cancelled' | 'undone'; runId?: string; done?: number; skipped?: { label: string; why: string }[]; error?: string };
/** A chat: the live one about this record (carried on), or a saved one about another record, to read. */
type Thread = { id?: string; msgs: Msg[] };

/** **bold** spans in a line of text, as React elements. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}

const ICON = {
  history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3.5V8h4.5" /><path d="M12 7.5V12l3 2" /></>,
  chat: <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />,
  trash: <><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M18 7l-.8 12.2a2 2 0 0 1-2 1.8H8.8a2 2 0 0 1-2-1.8L6 7" /></>,
  back: <><path d="M19 12H5" /><path d="M11 18l-6-6 6-6" /></>,
};
const Icon = ({ n, s = 16 }: { n: keyof typeof ICON; s?: number }) =>
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[n]}</svg>;
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const msgsOf = (c: CopilotChat): Msg[] => c.messages.map(m => (m.role === 'you' ? { you: m.text, about: m.focus?.label ?? null } : { answer: m.answer, kept: true }));
/** The prospect or item the chat was last about, to carry on with it. */
function lastFocus(c: CopilotChat, screen: CopilotScreen): CopilotFocus | null {
  const f = c.messages.filter(m => m.role === 'you').at(-1)?.focus;
  return f ? { ref: screen === 'scoring' ? { contactId: f.id } : { itemId: f.id }, label: f.label } : null;
}

export function CopilotButton({ screen, ctxRef, title, onChanged, focus }: { screen: CopilotScreen; ctxRef: CopilotRef; title: string; onChanged?: () => void; focus?: CopilotFocus | null }) {
  const allowed = useCan('copilot.use');
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<Thread>({ msgs: [] });
  const [reading, setReading] = useState<(Thread & { title: string; at: string }) | null>(null);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [history, setHistory] = useState<CopilotChatSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [plans, setPlans] = useState<Record<string, PlanState>>({});
  // The prospect or item the chat is about: set when one is picked on the screen, kept when its panel closes.
  const [pinned, setPinned] = useState<CopilotFocus | null>(focus ?? null);
  const ctl = useRef<AbortController | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const key = chatKey(screen, ctxRef);
  const [shownKey, setShownKey] = useState(key);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const focusId = focus ? focus.ref.contactId ?? focus.ref.itemId ?? '' : '';
  const [shownFocus, setShownFocus] = useState(focusId);
  // A different record on the screen is a different conversation: its own saved chat is loaded when the panel opens.
  if (shownKey !== key) { setShownKey(key); setLive({ msgs: [] }); setReading(null); setPlans({}); setPinned(focus ?? null); setLoadedKey(null); setView('chat'); }
  else if (shownFocus !== focusId) { setShownFocus(focusId); if (focus) setPinned(focus); }
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 60); }, [open]);
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight }); }, [live, reading, busy, view]);
  // The person's latest chat about this record, carried on.
  useEffect(() => {
    if (!open || !allowed || loadedKey === key) return;
    let on = true;
    setLoading(true);
    (async () => {
      const { chats } = await api<{ chats: CopilotChatSummary[] }>(`/api/copilot/chats?screen=${screen}&key=${encodeURIComponent(key)}`);
      const latest = chats[0] ? (await api<{ chat: CopilotChat }>(`/api/copilot/chats/${chats[0].id}`)).chat : null;
      if (!on) return;
      setLive(latest ? { id: latest.id, msgs: msgsOf(latest) } : { msgs: [] }); setLoadedKey(key);
      if (latest) { const f = lastFocus(latest, screen); if (f) setPinned(p => p ?? f); }
    })().catch(err => { if (on) { showToast(`Saved chats couldn't be loaded: ${errorText(err)}`); setLoadedKey(key); } }).finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [open, allowed, key, loadedKey, screen]);
  if (!allowed) return null;

  const kind = ctxRef.itemId || pinned?.ref.itemId ? 'item' : screen === 'nba' ? 'nba' : screen === 'prospecting' ? 'prospecting' : screen === 'scoring' ? (pinned?.ref.contactId ? 'prospect' : 'scoring') : 'queue';
  const chips = CHIPS[kind] ?? CHIPS.queue;
  const thread = reading ?? live, msgs = thread.msgs;

  async function ask(q: string, chip = false) {
    q = q.trim();
    if (!q || busy || reading) return;
    const about = pinned?.label ?? null;
    setLive(t => ({ ...t, msgs: [...t.msgs, { you: q, about }] }));
    setText('');
    setBusy(true);
    const c = new AbortController();
    ctl.current = c;
    let next: Msg;
    let id = live.id;
    try {
      const answer = await api<CopilotAnswer>('/api/copilot', { body: {
        screen, ref: { ...ctxRef, ...(pinned?.ref ?? {}) }, question: q, chip, offset: new Date().getTimezoneOffset(),
        ...(id ? { chatId: id } : { title }), ...(pinned ? { focusLabel: pinned.label } : {}),
      }, signal: c.signal });
      id = answer.chatId ?? id;
      next = { answer };
    } catch (err) {
      const stopped = err instanceof DOMException && err.name === 'AbortError';
      next = { answer: { blocks: [{ t: 'note', text: stopped ? 'Stopped.' : errorText(err) }], source: 'none', suggestions: [] } };
    } finally {
      setBusy(false);
      ctl.current = null;
    }
    setLive(t => ({ ...t, id, msgs: [...t.msgs, next] }));
    setHistory(null);
  }

  function newChat() { setLive({ msgs: [] }); setReading(null); setPlans({}); setView('chat'); setTimeout(() => input.current?.focus(), 60); }
  async function showHistory() {
    if (view === 'history') { setView('chat'); return; }
    setView('history');
    try { setHistory((await api<{ chats: CopilotChatSummary[] }>(`/api/copilot/chats?screen=${screen}`)).chats); }
    catch (err) { showToast(errorText(err)); setHistory([]); }
  }
  async function openChat(s: CopilotChatSummary) {
    try {
      const { chat } = await api<{ chat: CopilotChat }>(`/api/copilot/chats/${s.id}`);
      // A chat about this record is carried on; one about another record is there to read.
      if (s.refKey === key) { setLive({ id: chat.id, msgs: msgsOf(chat) }); setReading(null); setPinned(focus ?? lastFocus(chat, screen)); }
      else setReading({ id: chat.id, msgs: msgsOf(chat), title: chat.title, at: chat.updatedAt });
      setPlans({}); setView('chat');
    } catch (err) { showToast(errorText(err)); }
  }
  async function removeChat(s: CopilotChatSummary) {
    try {
      await api(`/api/copilot/chats/${s.id}`, { method: 'DELETE' });
      setHistory(h => (h ?? []).filter(x => x.id !== s.id));
      if (live.id === s.id) setLive({ msgs: [] });
      if (reading?.id === s.id) setReading(null);
      showToast('Chat deleted');
    } catch (err) { showToast(errorText(err)); }
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

  function block(b: CopilotBlock, i: number, at: number, kept: boolean): ReactNode {
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
          {kept && st.phase === 'ready' ? <p className="cpp-muted">A plan from earlier in this chat. Ask again to run it: Autopilot plans against what is waiting now.</p> : null}
          {!kept && st.phase === 'ready' && p.will.length ? <div className="cpp-act"><button className="btn btn-primary btn-sm" onClick={() => void runPlan(id, p)}>{`Run with Autopilot · ${p.will.length}`}</button>
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

  function historyView(): ReactNode {
    return <>
      <div className="cpp-hist-top"><button type="button" className="cpp-link" onClick={() => setView('chat')}><Icon n="back" s={15} /> Back to the chat</button>
        <span>{history ? `${history.length} saved here` : 'Loading…'}</span></div>
      {history && !history.length ? <div className="cpp-none">No saved chats on this screen yet. Every chat you have with Copilot is kept here, for you only.</div> : null}
      {(history ?? []).map(h => <div key={h.id} className={`cpp-hist${h.id === live.id ? ' cur' : ''}`}>
        <button type="button" className="cpp-hist-main" onClick={() => void openChat(h)}><span className="cpp-hist-i"><Icon n="chat" s={15} /></span>
          <span className="cpp-hist-tx"><span className="cpp-hist-t" title={h.title}>{h.title}</span><span className="cpp-hist-q">{h.first}</span>
            <span className="cpp-hist-m">{`${h.questions} question${h.questions === 1 ? '' : 's'} · ${ago(h.updatedAt)}${h.refKey === key ? ' · this one' : ''}`}</span></span></button>
        <button type="button" className="cpp-tool sm" title="Delete this chat" aria-label={`Delete the chat "${h.first || h.title}"`} onClick={() => void removeChat(h)}><Icon n="trash" s={15} /></button></div>)}
    </>;
  }

  const last = msgs.at(-1);
  const follow = !reading && last && 'answer' in last ? last.answer.suggestions : [];
  const panel = open ? <aside className="copilot" aria-label="Copilot" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); ctl.current?.abort(); setOpen(false); } }}>
    <div className="cpp-h"><span className="cpp-logo" aria-hidden="true">✦</span>
      <div className="cpp-ht"><div className="cpp-t">Copilot</div><div className="cpp-s" title={title}>{title}</div></div>
      <button className={`cpp-tool${view === 'history' ? ' on' : ''}`} title="Saved chats" aria-label="Saved chats" aria-pressed={view === 'history'} disabled={busy} onClick={() => void showHistory()}><Icon n="history" s={17} /></button>
      <button className="cpp-tool" title="New chat" aria-label="New chat" disabled={busy} onClick={newChat}>＋</button>
      <button className="cpp-tool" title="Close (Esc)" aria-label="Close Copilot" onClick={() => { ctl.current?.abort(); setOpen(false); }}>✕</button></div>
    <div className="cpp-b" ref={body}>
      {view === 'history' ? historyView() : <>
        {reading ? <div className="cpp-note">{`A saved chat about ${reading.title}, from ${ago(reading.at)}. `}<button type="button" className="cpp-link" onClick={() => setReading(null)}>Back to the current chat</button></div> : null}
        {loading && !msgs.length ? <div className="cpp-muted" role="status">Loading your chat…</div> : null}
        {!loading && !msgs.length ? <div className="cpp-hello"><div className="cpp-hello-t">{`What do you want to know about ${pinned?.label ?? title}?`}</div>
          <div className="cpp-hello-s">I answer from the data on this screen. I never change anything unless you confirm. Your chats are kept for you under Saved chats.</div>
          <div className="cpp-sugg">{chips.map(c => <button key={c} onClick={() => void ask(c, true)}>{c}</button>)}</div></div> : null}
        {msgs.map((m, at) => ('you' in m ? <div key={at} style={sx('display:contents')}><div className="cpp-me">{m.you}</div>{m.about ? <div className="cpp-me-about">{`About ${m.about}`}</div> : null}</div>
          : <div key={at} className="cpp-ai"><span className="cpp-logo sm" aria-hidden="true">✦</span><div className="cpp-ai-b">
            {m.answer.blocks.map((b, i) => block(b, i, at, !!m.kept || !!reading))}
            {m.answer.source === 'ai' ? <div style={sx('margin-top:6px')}><AiTag title="Answered by AI from the data on this screen only; people were not named to it." /></div> : null}
            {m.answer.partial ? <p className="cpp-muted">{m.answer.partial}</p> : null}
            {m.answer.fallback ? <p className="cpp-muted">{`The AI couldn't answer: ${m.answer.fallback}.`}</p> : null}
          </div></div>))}
        {busy ? <div className="cpp-ai"><span className="cpp-logo sm" aria-hidden="true">✦</span><div className="cpp-ai-b"><span className="cpp-typing" role="status" aria-label="Copilot is answering"><i /><i /><i /></span></div></div> : null}
        {follow.length && !busy ? <div className="cpp-follow">{follow.map(c => <button key={c} onClick={() => void ask(c, true)}>{c}</button>)}</div> : null}
      </>}
    </div>
    {view === 'chat' && !reading ? <form className="cpp-f" onSubmit={e => { e.preventDefault(); void ask(text); }}>
      {pinned ? <div className="cpp-focus"><span>About</span><b title={pinned.label}><span>{pinned.label}</span>
        <button type="button" aria-label={`Stop asking about ${pinned.label}`} title={`Ask about ${title} instead`} disabled={busy} onClick={() => setPinned(null)}>✕</button></b></div> : null}
      <div className="cpp-comp"><textarea ref={input} rows={1} value={text} placeholder={`Ask about ${pinned?.label ?? title}…`} aria-label="Ask Copilot" onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text); } }} />
        {busy ? <button type="button" className="cpp-send busy" aria-label="Stop" onClick={() => ctl.current?.abort()}>■</button> : <button type="submit" className="cpp-send" aria-label="Send">↑</button>}</div>
      <div className="cpp-foot">Enter to send · Shift + Enter for a new line · Esc to close</div>
    </form> : null}
  </aside> : null;

  return <>
    <button className="btn btn-sec btn-sm" title="Ask Copilot" onClick={() => setOpen(o => !o)} aria-expanded={open}><span style={sx('color:var(--brand)')}>✦</span> Copilot</button>
    {panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
  </>;
}
