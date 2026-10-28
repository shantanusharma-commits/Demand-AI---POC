'use client';

/* Content studio (was legacy/15-content-studio.html), on the server (D-36). Ask for a blog or a whitepaper in the chat;
   it is written in a canvas beside the chat, in the brand voice, citing approved claims word for word. Change it by
   chatting, or click one part to change just that one; type in the canvas to edit by hand (saved as you type). Add it
   to the Content library when every check passes; reps then add it to an email or LinkedIn message. Downloads come
   from the server (Word, Markdown). Not ported: inline bold, italic and links (a piece is plain text), the "send for
   sign-off" button (after the pilot, G-063), and several pieces in one chat (each piece keeps its own chat). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { audienceLabel, LENGTHS, SUGGESTIONS, TONES, TYPES, textOf, titleOf, wordsOf, type Block, type ContentType } from '@/lib/content/studio';
import type { CheckResult } from '@/lib/engine/nba';
import { sx } from '@/lib/sx';
import { AiTag } from '@/components/AiTag';
import { api, ApiError, errorText, type WireDeep } from '@/lib/client/api';
import { showToast } from '@/lib/ui';
import type { ItemSummary, ItemView } from '@/lib/server/services/studio';
import { Tab, Tabs } from '@/components/Tabs';

type Summary = WireDeep<ItemSummary>;
type Item = WireDeep<ItemView>;
type Msg = { who: string; text: string };
type Created = { created: false; question: string } | { created: true; item: Item };
type ChangeOp = { op: 'ask' | 'tone' | 'length' | 'regenerate' | 'remove' | 'restore'; q?: string; value?: string; target?: string | null; blocks?: Block[] };

const NEW_RE = /\b(write|draft|create|generate|produce|give me|need|want)\b[^.?!]*?\b(a|an|another|new|one more)\s+(\w+\s+){0,3}?(blog|white\s?-?paper|article)\b|^\s*(a|an|another)\s+(short |long |detailed |new )?(blog|white\s?-?paper)\b/i;
const fmtWhen = (t: string) => { const d = Math.round((Date.now() - Date.parse(t)) / 864e5); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? `${d} days ago` : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
const statusTag = (s: string) => (s === 'Ready' ? <span className="tag tag-green">In Content library</span> : <span className="tag tag-grey">Draft</span>);
const issues = (c: CheckResult) => c.flags.length + c.unsupported.length;
function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p));
}

/** One block of the canvas, editable as plain text. It is not re-rendered while the person types: the canvas is
 *  remounted (a new key) only when the piece changes from outside (the writer, undo, a reload). */
function BlockView({ b, sel, onInput, onSelect }: { b: Block; sel: boolean; onInput: (b: Block) => void; onSelect: () => void }) {
  const cls = sel ? 'sel' : undefined;
  const edit = { contentEditable: 'plaintext-only' as unknown as boolean, suppressContentEditableWarning: true, spellCheck: true };
  if (Array.isArray(b.text)) {
    const items = b.text.slice();
    const Tag = b.tag === 'ol' ? 'ol' : 'ul';
    return <Tag className={cls} data-b={b.id} onClick={onSelect}>{items.map((t, i) =>
      <li key={i} {...edit} onInput={e => { items[i] = (e.target as HTMLElement).innerText; onInput({ ...b, text: items.slice(), edited: true }); }}>{t}</li>)}</Tag>;
  }
  const props = { className: cls, 'data-b': b.id, onClick: onSelect, ...edit, onInput: (e: React.FormEvent<HTMLElement>) => onInput({ ...b, text: (e.target as HTMLElement).innerText, edited: true }) };
  if (b.tag === 'h1') return <h1 {...props}>{b.text}</h1>;
  if (b.tag === 'h2') return <h2 {...props}>{b.text}</h2>;
  if (b.tag === 'blockquote') return <blockquote {...props}>{b.text}</blockquote>;
  return <p {...props}>{b.text}</p>;
}

export function StudioScreen({ initialItem }: { initialItem?: string }) {
  const [tab, setTab] = useState<'new' | 'saved'>('new');
  const [kind, setKind] = useState<ContentType>('blog');
  const [items, setItems] = useState<Summary[] | null>(null);
  const [libF, setLibF] = useState<string | null>(null);
  const [it, setIt] = useState<Item | null>(null);
  const [chat, setChat] = useState<{ type: ContentType; pending: string | null; msgs: Msg[] } | null>(null);
  const [canvas, setCanvas] = useState(true);
  const [target, setTarget] = useState<string | null>(null);
  const [undo, setUndo] = useState<Block[][]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState<'Saved' | 'Saving…' | 'Not saved'>('Saved');
  const [checks, setChecks] = useState<CheckResult | null>(null);
  const [chkOpen, setChkOpen] = useState(false);
  const [input, setInput] = useState('');
  const [home, setHome] = useState('');
  const [dd, setDd] = useState(false);
  const [docSeq, setDocSeq] = useState(0);
  const [live, setLive] = useState<{ title: string; words: number } | null>(null);
  const blocks = useRef<Block[]>([]);
  const rev = useRef(1);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const booted = useRef(false);
  const thread = useRef<HTMLDivElement>(null);

  function loadList() { return api<{ items: Summary[] }>('/api/studio/items').then(r => setItems(r.items), err => showToast(errorText(err))); }
  /** Shows a piece: the canvas is rebuilt from what the server has. */
  function show(item: Item, select: string | null = null) {
    blocks.current = item.blocks as Block[]; rev.current = item.rev; dirty.current = false;
    setIt(item); setChecks(item.checks as CheckResult); setTarget(select); setLive(null); setDocSeq(s => s + 1); setChat(null);
    try { history.replaceState(null, '', `/studio?item=${item.id}`); } catch { /* keep the address */ }
  }
  function openItem(id: string) {
    return api<Item>(`/api/studio/items/${encodeURIComponent(id)}`).then(r => { setUndo([]); setCanvas(true); show(r); }, err => showToast(errorText(err)));
  }
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (initialItem) void openItem(initialItem); else void loadList();
  });   // runs once (booted)
  useEffect(() => { const t = thread.current; if (t) t.scrollTop = t.scrollHeight; }, [it?.messages.length, chat?.msgs.length, busy]);

  /* ─── Saving what the person types ─── */
  async function flush(): Promise<boolean> {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current || !it) return true;
    dirty.current = false; setSaving('Saving…');
    try {
      const r = await api<{ rev: number; backToDraft: boolean; checks: CheckResult }>(`/api/studio/items/${it.id}`, { method: 'PUT', body: { blocks: blocks.current, rev: rev.current } });
      rev.current = r.rev; setChecks(r.checks); setSaving('Saved');
      if (r.backToDraft) { showToast('A check fails now: it is back to draft, out of the Content library'); setIt(x => x && { ...x, status: 'Draft' }); }
      return true;
    } catch (err) {
      setSaving('Not saved'); showToast(errorText(err));
      if (err instanceof ApiError && err.status === 409) void openItem(it.id);
      return false;
    }
  }
  function typed(b: Block) {
    blocks.current = blocks.current.map(x => (x.id === b.id ? b : x));
    dirty.current = true; setSaving('Saving…');
    setLive({ title: titleOf(blocks.current, it?.title || ''), words: wordsOf(blocks.current) });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 600);
  }

  /* ─── Sending: a new piece, a question back, or a change to the piece in the canvas ─── */
  async function create(text: string, type: ContentType, prior: Msg[]) {
    setBusy('Thinking');
    try {
      const r = await api<Created>('/api/studio/items', { body: { text, type } });
      if (r.created) { setUndo([]); setCanvas(true); show(r.item); void loadList(); }
      else setChat({ type, pending: text, msgs: [...prior, { who: 'ai', text: r.question }] });
    } catch (err) { showToast(errorText(err)); }
    finally { setBusy(null); }
  }
  function start(text: string) {
    const q = text.trim(); if (!q) return;
    const type: ContentType = /white\s?-?paper/i.test(q) ? 'whitepaper' : /blog|article/i.test(q) ? 'blog' : kind;
    setIt(null); setChat({ type, pending: null, msgs: [{ who: 'me', text: q }] });
    void create(q, type, [{ who: 'me', text: q }]);
  }
  async function change(op: ChangeOp, said?: string) {
    if (!it || busy) return;
    if (!(await flush())) return;
    const before = blocks.current;
    setBusy(said ?? 'Working');
    try {
      const r = await api<{ item: Item; reply: string; select: string | null }>(`/api/studio/items/${it.id}/change`, { body: { ...op, target: op.target === undefined ? target : op.target, rev: rev.current } });
      if (op.op !== 'restore' && r.item.rev !== rev.current) setUndo(u => [...u.slice(-19), before]);
      show(r.item, r.select);
    } catch (err) {
      showToast(errorText(err));
      if (err instanceof ApiError && err.status === 409) void openItem(it.id);
    } finally { setBusy(null); }
  }
  function send(text?: string) {
    const q = (text ?? input).trim(); if (!q || busy) return;
    if (text === undefined) setInput('');
    if (chat && !it) {
      const msgs = [...chat.msgs, { who: 'me', text: q }];
      setChat({ ...chat, msgs });
      void create(chat.pending ? `${chat.pending} about ${q}` : q, chat.type, msgs);
      return;
    }
    if (it && NEW_RE.test(q)) { void flush().then(() => start(q)); return; }
    void change({ op: 'ask', q }, q);
  }
  function chip(e: React.MouseEvent<HTMLButtonElement>) { send(e.currentTarget.dataset.q); }
  function undoLast() {
    const prev = undo.at(-1); if (!prev) return;
    setUndo(u => u.slice(0, -1));
    void change({ op: 'restore', blocks: prev, target: null });
  }
  async function setReady(ready: boolean) {
    if (!it || !(await flush())) return;
    try { const r = await api<{ item: Item; message: string }>(`/api/studio/items/${it.id}/status`, { body: { ready } }); show(r.item, target); showToast(ready ? 'Added to the Content library' : 'Taken out of the Content library: back to draft'); void loadList(); }
    catch (err) { showToast(errorText(err)); setChkOpen(true); }
  }
  async function download(kind2: 'docx' | 'md' | 'copy') {
    setDd(false);
    if (!it || !(await flush())) return;
    if (kind2 === 'copy') { navigator.clipboard?.writeText(textOf(blocks.current)).then(() => showToast('Copied'), () => showToast("Couldn't copy here")); return; }
    const a = document.createElement('a');
    a.href = `/api/studio/items/${it.id}/${kind2}`; a.download = '';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function removeClaim(text: string) {
    const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\s*' + esc + '[.?!]?');
    let done = false;
    const next = blocks.current.map(b => {
      if (done || Array.isArray(b.text) || !b.text.includes(text)) return b;
      done = true; return { ...b, text: b.text.replace(re, '').trim(), edited: true };
    });
    if (!done) return;
    setUndo(u => [...u.slice(-19), blocks.current]);
    blocks.current = next; dirty.current = true; setDocSeq(s => s + 1); setIt(x => x && { ...x, blocks: next });
    void flush().then(ok => { if (ok) showToast(`Removed “${text.slice(0, 60)}”: no approved source backs it`); });
  }
  function leave() { void flush().then(() => { setIt(null); setChat(null); setTab('new'); try { history.replaceState(null, '', '/studio'); } catch { /* keep */ } void loadList(); }); }

  /* ─── Home ─── */
  function homeView(): ReactNode {
    const list = items ?? [];
    const top = <div className="topbar"><div className="topbar-l"><span className="tb-title">Content studio</span><span className="sub" style={sx('margin-left:10px')}>Blogs and whitepapers in the Client&apos;s brand voice</span></div>
      <div className="topbar-r">{tab === 'saved' ? <button className="btn btn-primary btn-sm" onClick={() => setTab('new')}>+ New blog or whitepaper</button> : null}</div></div>;
    const ft = (id: 'new' | 'saved', label: string, n?: number) => <Tab active={tab === id} onSelect={() => setTab(id)}>{label}{n !== undefined ? <> <span className="ftab-cnt">{n}</span></> : null}</Tab>;
    if (tab === 'new') return <>{top}<Tabs label="Content studio">{ft('new', 'Write')}{ft('saved', 'Saved content', list.length)}</Tabs>
      <div className="cs"><div className="home"><div className="home-in">
        <h1>What should we write?</h1>
        <p className="lead">Any topic, for any reader: describe it in your own words. It&apos;s written in a canvas beside the chat, and you change it by talking to it.</p>
        <div className="composer-big">
          <textarea aria-label="What should we write?" value={home} onChange={e => setHome(e.target.value)} placeholder="e.g. A blog on how AI can help sales teams plan their week, for sales managers"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start(home); setHome(''); } }} />
          <div className="cb-row"><div className="kind" role="radiogroup" aria-label="Kind">{(Object.keys(TYPES) as ContentType[]).map(t => <button key={t} role="radio" aria-checked={kind === t} className={kind === t ? 'on' : ''} onClick={() => setKind(t)}>{TYPES[t].ic} {TYPES[t].label}</button>)}</div>
            <span style={sx('flex:1')} /><button className="send" aria-label="Send" disabled={!home.trim()} onClick={() => { start(home); setHome(''); }}>↑</button></div>
        </div>
        <div className="sugg">{SUGGESTIONS[kind].map(s => <button key={s} onClick={() => start(s)}>{s}</button>)}</div>
      </div></div></div></>;
    const ready = list.filter(x => x.status === 'Ready').length, fix = list.filter(x => x.issues).length, used = list.reduce((n, x) => n + x.usage, 0);
    const rows = list.filter(x => !libF || (libF === 'ready' ? x.status === 'Ready' : libF === 'draft' ? x.status !== 'Ready' : libF === 'fix' ? x.issues : libF === 'used' ? x.usage : libF === x.type));
    const tile = (f: string, lbl: string, v: number, sub: string, tone: string) => <a key={f || 'all'} className={'stat stat-link' + (libF === f || (!libF && !f) ? ' on' : '')} href="#"
      onClick={e => { e.preventDefault(); setLibF(libF === f || !f ? null : f); }}><div className="stat-lbl">{lbl}</div><div className="stat-val" style={sx(`color:${tone}`)}>{v}</div><div className="stat-sub">{sub}</div></a>;
    const label: Record<string, string> = { ready: 'In Content library', draft: 'Drafts', fix: 'Checks to fix', used: 'In messages', blog: 'Blogs', whitepaper: 'Whitepapers' };
    return <>{top}<Tabs label="Content studio">{ft('new', 'Write')}{ft('saved', 'Saved content', list.length)}</Tabs>
      <div className="cs"><div className="canvas2-saved">
        <div className="sv-k">What your content led to</div>
        <div className="stats" style={sx('grid-template-columns:repeat(5,1fr)')}>
          {tile('', 'Pieces', list.length, `${list.filter(i => i.type === 'blog').length} blogs · ${list.filter(i => i.type === 'whitepaper').length} whitepapers`, 'var(--i1)')}
          {tile('ready', 'In Content library', ready, 'checks pass, added to the library', 'var(--pos)')}
          {tile('draft', 'Drafts', list.length - ready, 'not ready for reps yet', 'var(--i2)')}
          {tile('fix', 'Checks to fix', fix, 'a brand or claim check failed', fix ? 'var(--neg)' : 'var(--i1)')}
          {tile('used', 'In messages', used, 'added by reps to email or LinkedIn', 'var(--brand)')}
        </div>
        {libF ? <div style={sx('display:flex;gap:8px;align-items:center;margin:0 0 10px;font-size:12px;color:var(--i2)')}>Showing <span className="seg-pill-a" role="button" onClick={() => setLibF(null)}>{label[libF] || libF} ✕</span></div> : null}
        <div className="sv-list"><table className="sv-tbl"><colgroup><col style={sx('width:32%')} /><col style={sx('width:11%')} /><col style={sx('width:18%')} /><col style={sx('width:13%')} /><col style={sx('width:11%')} /><col style={sx('width:15%')} /></colgroup>
          <thead><tr><th>Content</th><th>Type</th><th>Audience</th><th>Brand checks</th><th>Saved</th><th /></tr></thead>
          <tbody>{!items ? <tr><td colSpan={6} className="sv-empty">Loading…</td></tr> : rows.length ? rows.map(x => <tr key={x.id} onClick={() => void openItem(x.id)}>
            <td><div className="sv-name"><div className="sv-ic">{TYPES[x.type].ic}</div><div style={sx('min-width:0')}><div className="sv-t" title={x.title}>{x.title}</div><div className="sv-s">{statusTag(x.status)}</div></div></div></td>
            <td><span className="sv-link" onClick={e => { e.stopPropagation(); setLibF(x.type); }}>{TYPES[x.type].label}</span><div className="sv-s">{x.length} · {x.tone}</div></td>
            <td><div className="sv-v">{audienceLabel(x.audience)}</div></td>
            <td>{x.issues ? <span className="tag tag-red">{x.issues} to fix</span> : <span className="tag tag-green">All pass</span>}<div className="sv-s">Brand v{x.brandVersionNo}</div>{x.ai ? <div style={sx('margin-top:4px')}><AiTag confidence={x.ai.confidence} /></div> : null}</td>
            <td><div className="sv-v">{fmtWhen(x.updatedAt)}</div><div className="sv-s">{x.updatedBy}</div></td>
            <td style={sx('text-align:right;white-space:nowrap')}><button className="btn btn-sec btn-sm" onClick={e => { e.stopPropagation(); void openItem(x.id); }}>Open</button>{' '}
              <a className="btn btn-ghost btn-sm" title="Download as Word" href={`/api/studio/items/${x.id}/docx`} onClick={e => e.stopPropagation()} style={sx('text-decoration:none')}>.docx</a></td>
          </tr>) : <tr><td colSpan={6} className="sv-empty">{list.length ? 'Nothing matches this filter.' : <>Nothing saved yet. <a href="#" onClick={e => { e.preventDefault(); setTab('new'); }} style={sx('color:var(--brand);font-weight:600')}>Write a blog or whitepaper</a>.</>}</td></tr>}</tbody></table></div>
      </div></div></>;
  }

  /* ─── Conversation: chat on the left, the canvas on the right ─── */
  function convView(): ReactNode {
    const msgs: Msg[] = it ? it.messages : chat?.msgs ?? [];
    const title = live?.title ?? it?.title ?? 'New chat';
    const tgt = it && target ? (it.blocks as Block[]).find(b => b.id === target) ?? null : null;
    const tgtText = tgt ? (Array.isArray(tgt.text) ? tgt.text.join(' ') : tgt.text).replace(/\s+/g, ' ') : '';
    const tgtKind = tgt ? (tgt.tag === 'h1' ? 'title' : tgt.tag === 'h2' ? 'heading' : tgt.tag === 'ul' || tgt.tag === 'ol' ? 'list' : 'paragraph') : '';
    const chips = !it || busy ? [] : tgt ? ['Regenerate this', 'Make it shorter', 'Add more detail', 'Add proof', 'More formal'] : ['Make it shorter', 'Add proof', 'More formal', 'Rewrite the intro', 'Add a section on lifecycle planning'];
    const card = it ? <div className={'card' + (canvas ? ' on' : '')} role="button" onClick={() => setCanvas(true)}><div className="ci">{TYPES[it.type].ic}</div>
      <div style={sx('flex:1;min-width:0')}><div className="ct">{title}</div><div className="cs2">{TYPES[it.type].label} · {canvas ? 'Open in the canvas' : 'Click to open'}</div></div></div> : null;
    return <>
      <div className="topbar"><div className="topbar-l"><button className="btn btn-ghost btn-sm" onClick={leave}>← Content studio</button><span className="tb-title">{title}</span></div>
        <div className="topbar-r"><button className="btn btn-sec btn-sm" onClick={leave}>+ New chat</button></div></div>
      <div className="cs"><div className={'conv' + (it && canvas ? ' split' : '')}>
        <div className="chat"><div className="thread" ref={thread}><div className="thread-in">
          {msgs.map((m, i) => <div key={i} style={sx('display:contents')}>
            {m.who === 'me' ? <div className="m-me">{m.text}</div> : <div className="m-ai"><div className="av">AI</div><div className="tx">{rich(m.text)}</div></div>}
            {i === 1 && card ? card : null}</div>)}
          {msgs.length < 2 && card ? card : null}
          {busy ? <div className="m-ai"><div className="av">AI</div><div className="tx"><span className="dots">Thinking</span></div></div> : null}
        </div></div>
          {tgt ? <div className="target"><span>Changing only this {tgtKind}: “{tgtText.slice(0, 50)}{tgtText.length > 50 ? '…' : ''}”</span><button title="Change the whole piece instead" aria-label="Change the whole piece instead" onClick={() => setTarget(null)}>✕</button></div> : null}
          <div className="chips">{chips.map(o => <button key={o} className="chip" data-q={o} onClick={chip}>{o}</button>)}{undo.length && !busy ? <button className="chip" style={sx('background:#fff')} onClick={undoLast}>↶ Undo last change</button> : null}</div>
          <div className="composer"><div className="box"><textarea aria-label={it ? 'Ask for a change' : 'Reply'} rows={1} value={input} placeholder={tgt ? 'What should change in this part?' : it ? 'Ask for a change…' : 'Reply…'}
            onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="send" aria-label="Send" disabled={!input.trim() || !!busy} onClick={() => send()}>↑</button></div>
            <div className="sub" style={sx('text-align:center;margin-top:6px;font-size:11px')}>Only approved claims are used, word for word. Every change runs the brand checks.</div></div>
        </div>
        {it && canvas ? canvasView(it) : null}
      </div></div></>;
  }

  function canvasView(item: Item): ReactNode {
    const chk = checks ?? (item.checks as CheckResult), n = issues(chk), ver = chk.claims.filter(c => c.verified);
    const words = live?.words ?? item.words;
    return <div className="canvas2">
      <div className="cv-h"><span style={sx('font-size:16px')}>{TYPES[item.type].ic}</span><span className="cv-t">{live?.title ?? item.title}</span>{statusTag(item.status)}<span className="saved" aria-live="polite">{saving}</span><span className="sp" />
        {item.type === 'whitepaper' ? <button className="btn btn-sec btn-sm" onClick={() => void download('docx')} title="Whitepapers download as Word">↓ Word</button>
          : <div className="dd"><button className="btn btn-sec btn-sm" aria-expanded={dd} onClick={() => setDd(o => !o)}>Download ▾</button>
            <div className={'ddm' + (dd ? ' open' : '')}><div className="h">Download</div><button onClick={() => void download('docx')}>Word document (.docx)</button><button onClick={() => void download('md')}>Markdown (.md), for the website</button><button onClick={() => void download('copy')}>Copy text</button></div></div>}
        <button className="btn btn-primary btn-sm" onClick={() => void setReady(item.status !== 'Ready')}>{item.status === 'Ready' ? 'Take out of the library' : 'Add to Content library'}</button>
        <button className="tbtn" title="Close the canvas" aria-label="Close the canvas" onClick={() => { void flush(); setCanvas(false); }}>✕</button></div>
      <div className="cv-tools">
        <span className="lab">Tone</span><select aria-label="Tone" value={item.tone} onChange={e => void change({ op: 'tone', value: e.target.value, target: null }, `Tone: ${e.target.value}`)}>{TONES.map(t => <option key={t}>{t}</option>)}</select>
        <span className="lab">Length</span><select aria-label="Length" value={item.length} onChange={e => {
          const l = e.target.value;
          if ((blocks.current.some(b => b.edited)) && !window.confirm(`Rewrite the piece at ${l} length? Your own edits are replaced; Undo brings them back.`)) return;
          void change({ op: 'length', value: l, target: null }, `Length: ${l}`);
        }}>{LENGTHS.map(l => <option key={l}>{l}</option>)}</select>
        <span style={sx('flex:1')} /><span className="sub">{words} words · {Math.max(1, Math.round(words / 220))} min read</span></div>
      <div className="cv-scroll">
        <div className="att"><span className="tag tag-grey" title="Written for">{audienceLabel(item.audience)}</span><span className="tag tag-blue">Brand v{item.brandVersionNo}</span>{item.ai ? <AiTag confidence={item.ai.confidence} title="Parts of this piece were written with AI from the brief and the brand pack. Any proof is an approved claim, word for word; every part goes through the same brand and claim checks." /> : null}{item.usage ? <span className="tag tag-blue">In {item.usage} message{item.usage > 1 ? 's' : ''}</span> : null}</div>
        <div className="paper"><div className="doc" key={docSeq}>
          {(item.blocks as Block[]).map(b => <div key={b.id} style={sx('position:relative')}>
            {target === b.id && !busy ? <div className="gutter" style={sx('display:flex;top:-28px;right:0')}>
              <button onClick={() => void change({ op: 'regenerate', target: b.id }, 'Regenerate this')}>↻ Regenerate</button>
              <button onClick={() => (document.querySelector('.composer textarea') as HTMLTextAreaElement | null)?.focus()}>✎ Ask to change</button>
              <button aria-label="Remove this part" onClick={() => void change({ op: 'remove', target: b.id }, 'Remove this part')}>✕</button></div> : null}
            <BlockView b={b} sel={target === b.id} onInput={typed} onSelect={() => { if (!busy) setTarget(b.id); }} /></div>)}
        </div></div>
        <div className="checks"><div className="chk-row"><b style={sx('font-size:12.5px;margin-right:4px')}>Brand checks</b>
          {n ? <span className="tag tag-red">{n} to fix before it can go in the library</span> : <span className="tag tag-green">All checks pass</span>}
          <span className="tag tag-grey">Voice: {item.tone}</span><span className={'tag ' + (ver.length ? 'tag-blue' : 'tag-grey')}>{ver.length} claim{ver.length === 1 ? '' : 's'} verified</span>
          <span style={sx('flex:1')} /><a href="#" style={sx('color:var(--brand);font-size:12px')} onClick={e => { e.preventDefault(); setChkOpen(o => !o); }}>{chkOpen ? 'Hide details' : 'Details'}</a></div>
          {chkOpen || n ? <div className="chk-detail">
            {chk.flags.map((f, i) => <div key={'f' + i}><span className="badc">✕ {f.rule}</span> · {f.detail}</div>)}
            {chk.unsupported.map((c, i) => <div key={'u' + i}><span className="badc">✕ Claim with no approved source</span> · “{c.text}”{c.reason ? ` (${c.reason})` : ''} <a href="#" style={sx('color:var(--brand)')} onClick={e => { e.preventDefault(); removeClaim(c.text); }}>Remove it</a></div>)}
            {ver.map((c, i) => <div key={'v' + i}><span className="okc">✓ Verified claim</span> · “{c.text}” <span className="sub">— {c.source}</span></div>)}
            {chkOpen ? <div className="sub" style={sx('margin-top:4px')}>The brand pack&apos;s rules: no banned words or competitor names, no exclamation marks, sentences within the voice&apos;s length, no pricing, sensitive topics go to compliance. A claim is verified only when it matches an approved source word for word.</div> : null}
          </div> : null}</div>
      </div></div>;
  }

  return <main className="main studio" id="mainArea" onClick={() => { if (dd) setDd(false); }}>{it || chat ? convView() : homeView()}</main>;
}
