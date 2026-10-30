'use client';

/* The (i) beside a measure (30 Oct 2026): what it means, how it is worked out with the reader's own numbers, the
   target, why it may read "Too early to call", and an example. Opens on click, closes on Escape, a click elsewhere, a
   scroll or a resize. It is placed against the window, not the card, so a card that clips its content can't cut it off. */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

const WIDTH = 320, GAP = 8;
import type { Explain } from '@/lib/analytics/explain';

export function Info({ x, align = 'right' }: { x: Explain; align?: 'left' | 'right' }) {
  const [at, setAt] = useState<CSSProperties | null>(null);
  const id = useId(), ref = useRef<HTMLSpanElement>(null);
  const open = !!at;
  useEffect(() => {
    if (!open) return;
    const close = () => setAt(null);
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key);
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close);
    };
  }, [open]);
  /** Below the button, lined up with it on the side `align` says, kept inside the window. */
  function place(): CSSProperties | null {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    const w = Math.min(WIDTH, window.innerWidth * 0.8), want = align === 'right' ? r.left - GAP : r.right + GAP - w;
    const top = r.bottom + 6;
    return { top, left: Math.max(GAP, Math.min(want, window.innerWidth - w - GAP)), width: w, maxHeight: Math.max(160, window.innerHeight - top - GAP) };
  }
  return <span className="info" ref={ref}>
    <button type="button" className="info-btn" aria-expanded={open} aria-controls={id} aria-label={`About ${x.title}`}
      onClick={e => { e.preventDefault(); e.stopPropagation(); setAt(a => (a ? null : place())); }}>i</button>
    {at ? <span id={id} role="dialog" aria-label={x.title} className="info-pop" style={at} onClick={e => e.stopPropagation()}>
      <b className="info-t">{x.title}</b>
      <span className="info-r"><em>What it means</em>{x.means}</span>
      <span className="info-r"><em>How it is worked out</em>{x.how}</span>
      {x.target ? <span className="info-r"><em>Target</em>{x.target}</span> : null}
      {x.early ? <span className="info-r"><em>Too early to call</em>{x.early}</span> : null}
      {x.example ? <span className="info-r"><em>Example</em>{x.example}</span> : null}
    </span> : null}
  </span>;
}
