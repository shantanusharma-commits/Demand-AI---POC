'use client';

/* Content studio pieces in an outreach message (legacy demandai-content.js messageBar and pickForMessage): the bar at
   the top of an email or LinkedIn message, and the screen that adds pieces from the Content library, to this message
   or to every message with the same action in its micro-segment. Used by Micro-segments & NBA and For Review. The
   message text doesn't change: an email attaches the pieces as Word files, a LinkedIn note shares them as links. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { audienceLabel, TYPES, type Block, type ContentType } from '@/lib/content/studio';
import { sx } from '@/lib/sx';
import { api, errorText, type WireDeep } from '@/lib/client/api';
import { showToast } from '@/lib/ui';
import type { ItemSummary, ItemView } from '@/lib/server/services/studio';

type Summary = WireDeep<ItemSummary>;
type Piece = { id: string; title: string; type: string; status: string };
const fileName = (title: string) => ((title || 'content').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'content') + '.docx';

export function MessageBar({ recId, channel, content, canEdit, seg, action, sameAction, who, onChanged }: {
  recId: string; channel: string; content: Piece[]; canEdit: boolean; seg: string; action: string; sameAction: number; who: string; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  async function remove(id: string) {
    try { await api(`/api/recommendations/${encodeURIComponent(recId)}/content`, { body: { ids: content.filter(c => c.id !== id).map(c => c.id), scope: 'one' } }); showToast('Removed from the message'); onChanged(); }
    catch (err) { showToast(errorText(err)); }
  }
  return <>
    <div style={sx('display:flex;align-items:center;gap:8px;margin:-2px 0 8px')}>
      <span style={sx('font-size:11px;color:var(--i3);flex:1')}>{content.length ? (channel === 'LinkedIn' ? 'Shared as a link in the note' : 'Attached to the email') : 'No content added'}</span>
      {canEdit ? <button className="btn btn-sec btn-sm" onClick={() => setOpen(true)}>📎 Add content</button> : null}</div>
    {content.length ? <div style={sx('display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px')}>{content.map(c => <span key={c.id} className="cp-chip">
      <span>{channel === 'LinkedIn' ? '🔗' : '📎'}</span><a href={`/studio?item=${c.id}`} target="_blank" rel="noopener">{channel === 'LinkedIn' ? c.title : fileName(c.title)}</a>
      <span style={sx('color:var(--i3)')}>{TYPES[c.type as ContentType]?.label ?? c.type}</span>
      {canEdit ? <button title="Remove" aria-label={`Remove ${c.title}`} onClick={() => void remove(c.id)}>✕</button> : null}</span>)}</div> : null}
    {open ? <ContentPicker recId={recId} channel={channel} seg={seg} action={action} current={content.map(c => c.id)} sameAction={sameAction} who={who}
      onClose={() => setOpen(false)} onApplied={() => { setOpen(false); onChanged(); }} /> : null}
  </>;
}

export function ContentPicker({ recId, channel, seg, action, current, sameAction, who, onClose, onApplied }: {
  recId: string; channel: string; seg: string; action: string; current: string[]; sameAction: number; who: string; onClose: () => void; onApplied: () => void;
}) {
  const [items, setItems] = useState<Summary[] | null>(null);
  const [sel, setSel] = useState<string[]>(current);
  const [cur, setCur] = useState<string | null>(current[0] ?? null);
  const [preview, setPreview] = useState<Record<string, WireDeep<ItemView>>>({});
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [busy, setBusy] = useState(false);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    let gone = false;
    api<{ items: Summary[] }>('/api/studio/items').then(r => {
      if (gone) return;
      setItems(r.items);
      setCur(c => c ?? r.items.find(x => x.status === 'Ready')?.id ?? null);
    }, err => { if (!gone) showToast(errorText(err)); });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => { gone = true; document.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => {
    if (!cur || preview[cur]) return;
    let gone = false;
    api<WireDeep<ItemView>>(`/api/studio/items/${encodeURIComponent(cur)}`).then(r => { if (!gone) setPreview(p => ({ ...p, [r.id]: r })); }, () => { /* the list still shows it */ });
    return () => { gone = true; };
  }, [cur, preview]);

  // A piece is for any reader, not a micro-segment (D-45): the library is searched by title, topic and reader.
  const all = (items ?? []).slice().sort((a, b) => (a.status === 'Ready' ? 0 : 1) - (b.status === 'Ready' ? 0 : 1) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const list = all.filter(it => (!q || `${it.title} ${it.topic} ${it.audience}`.toLowerCase().includes(q.toLowerCase())) && (!type || it.type === type));
  const toggle = (id: string, on: boolean) => { setSel(s => (on ? [...new Set([...s, id])] : s.filter(x => x !== id))); setCur(id); };
  const pv = cur ? preview[cur] : null, curSum = cur ? all.find(x => x.id === cur) : null;
  const paras = pv ? (pv.blocks as Block[]).filter(b => b.tag === 'p').slice(0, 2).map(b => String(b.text)) : [];
  const chosen = sel.map(id => all.find(x => x.id === id)).filter((x): x is Summary => !!x);
  const targets = scope === 'all' ? sameAction + 1 : 1;
  async function apply() {
    setBusy(true);
    try {
      const r = await api<{ messages: number }>(`/api/recommendations/${encodeURIComponent(recId)}/content`, { body: { ids: sel, scope } });
      showToast(sel.length ? (r.messages > 1 ? `Added to ${r.messages} messages in ${seg}` : 'Added to the message') : 'Content removed from the message');
      onApplied();
    } catch (err) { showToast(errorText(err)); }
    finally { setBusy(false); }
  }
  // A portal: the NBA drawer is transformed, which would make a fixed overlay inside it cover only the drawer.
  return createPortal(<div className="cp-ov" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cp-w" role="dialog" aria-label="Add content to the message">
      <div className="cp-h"><b>Add content to the message</b><span>{who} · {channel}{seg ? ` · ${seg}` : ''}</span><button className="cp-x" aria-label="Close" onClick={onClose}>✕</button></div>
      <div className="cp-b">
        <div className="cp-col"><div className="cp-ch">Content library</div>
          <div className="cp-tools"><input aria-label="Search content" placeholder="Search content" value={q} onChange={e => setQ(e.target.value)} />
            {[['', 'All'], ['blog', 'Blogs'], ['whitepaper', 'Whitepapers']].map(([k, l]) => <button key={k || 'all'} className={'cp-pill' + (type === k ? ' on' : '')} onClick={() => setType(k)}>{l}</button>)}</div>
          <div className="cp-sc">{!items ? <div className="cp-none">Loading…</div> : list.length ? list.map(it => it.status === 'Ready'
            ? <div key={it.id} className={'cp-it' + (cur === it.id ? ' cur' : '')} onClick={() => setCur(it.id)}>
              <input type="checkbox" checked={sel.includes(it.id)} aria-label={`Add ${it.title}`} onClick={e => e.stopPropagation()} onChange={e => toggle(it.id, e.target.checked)} />
              <div><b>{it.title}</b><small>{TYPES[it.type].label} · {audienceLabel(it.audience)} · in {it.usage} message{it.usage === 1 ? '' : 's'}</small></div></div>
            : <div key={it.id} className="cp-it off" title="Not in the library yet"><input type="checkbox" disabled aria-label={`${it.title} is a draft`} /><div><b>{it.title}</b><small>Draft: add it to the Content library first, from Content studio</small></div></div>)
            : <div className="cp-none">Nothing matches. <a href="/studio" target="_blank" rel="noopener">Write it in Content studio</a>.</div>}</div></div>
        <div className="cp-col cp-pv"><div className="cp-ch">Preview</div><div className="cp-sc">{curSum ? <>
          <small className="cp-sub">{TYPES[curSum.type].label} · {curSum.createdBy}</small><h3>{curSum.title}</h3>
          {pv ? paras.map((t, i) => <p key={i}>{t}</p>) : <p className="cp-sub">Loading the preview…</p>}
          <div className="cp-kv"><span>Written for</span><b>{audienceLabel(curSum.audience)}</b></div>
          <div className="cp-kv"><span>Approved claims</span><b>{curSum.cited.length ? curSum.cited.map(id => <span key={id} className="cp-cl">{id}</span>) : 'No product claims'}</b></div>
          <div className="cp-kv"><span>Brand checks</span><b>{curSum.issues ? `${curSum.issues} to fix` : 'All pass'} · Brand v{curSum.brandVersionNo}</b></div>
          <div className="cp-kv"><span>Already in</span><b>{curSum.usage} message{curSum.usage === 1 ? '' : 's'}</b></div>
          <div style={sx('margin-top:10px;display:flex;gap:6px')}>{sel.includes(curSum.id) ? <button className="btn btn-sec btn-sm" onClick={() => toggle(curSum.id, false)}>Remove from the message</button>
            : curSum.status === 'Ready' ? <button className="btn btn-primary btn-sm" onClick={() => toggle(curSum.id, true)}>Add to the message</button> : null}
            <a className="btn btn-ghost btn-sm" href={`/studio?item=${curSum.id}`} target="_blank" rel="noopener" style={sx('text-decoration:none')}>Open in Content studio ↗</a></div>
        </> : <div className="cp-none">Pick a piece on the left to preview it.</div>}</div></div>
        <div className="cp-col"><div className="cp-ch">Where it goes</div><div className="cp-sc">
          <div className="cp-scope">
            <label className={'cp-opt' + (scope === 'one' ? ' on' : '')}><input type="radio" name="cpScope" checked={scope === 'one'} onChange={() => setScope('one')} /><span>Only this message<small>{who}</small></span></label>
            {sameAction ? <label className={'cp-opt' + (scope === 'all' ? ' on' : '')}><input type="radio" name="cpScope" checked={scope === 'all'} onChange={() => setScope('all')} /><span>Every message with this action in {seg}<small>{sameAction + 1} accounts get “{action}”; those keep what they had and gain these</small></span></label>
              : <div className="cp-sub">No other account in {seg || 'this list'} gets the same action, so only this message changes.</div>}
          </div>
          <div className="cp-ch" style={sx('padding:4px 0 2px')}>{targets} message{targets === 1 ? '' : 's'} will change</div>
          <div className="cp-ch" style={sx('padding:12px 0 2px')}>In the {channel === 'LinkedIn' ? 'LinkedIn note' : 'email'}</div>
          <div className="cp-msg">{chosen.length ? chosen.map(it => (channel === 'LinkedIn' ? `Link: ${it.title}` : `Attached: ${fileName(it.title)}`)).join('\n') : 'Nothing added yet.'}</div>
        </div></div>
      </div>
      <div className="cp-f"><span>{chosen.length ? <><b>{chosen.length}</b> piece{chosen.length === 1 ? '' : 's'} · <b>{targets}</b> message{targets === 1 ? '' : 's'}</> : 'No content selected'}</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void apply()}>{scope === 'all' ? `Apply to ${targets} messages` : 'Apply to this message'}</button></div>
    </div></div>, document.body);
}
