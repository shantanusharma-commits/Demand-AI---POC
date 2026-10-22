'use client';

/* A table that draws only the rows in view (plus a buffer), whatever the page size. Same markup and classes as the
   Prospecting Table (.dt-wrap / .dt), so the rows look the same; the rows' heights are measured, not assumed, because
   a row with a two-line issue is taller than one without. Rows above and below the window are two spacer rows. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { SortDir } from '@/types/prospecting-runs';

export interface VCol { label: ReactNode; width: number; cls?: string; sortKey?: string }

const ROW_ESTIMATE = 64;   // until a row has been measured
const BUFFER_PX = 360;     // drawn above and below the visible area

export function VirtualTable<T>({ cols, rows, rowKey, renderRow, empty, sort, onSort, loading, resetKey, maxHeight = 'max(340px, calc(100vh - 380px))' }: {
  cols: VCol[]; rows: T[]; rowKey: (t: T) => string | number; renderRow: (t: T) => ReactNode; empty: ReactNode;
  sort?: { key: string; dir: SortDir }; onSort?: (key: string) => void; loading?: boolean;
  /** Changes when a different set of rows arrives (another page, a new search): the table scrolls back to the top. */
  resetKey?: string | number; maxHeight?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null), body = useRef<HTMLTableSectionElement>(null);
  const heights = useRef(new Map<string | number, number>());
  const [scrollTop, setScrollTop] = useState(0), [viewH, setViewH] = useState(600), [, bump] = useState(0);
  const w = cols.reduce((n, c) => n + c.width, 0);

  // Offsets of every row from the top of the body, from measured heights where known.
  const offsets: number[] = [0];
  rows.forEach((r, i) => offsets.push(offsets[i] + (heights.current.get(rowKey(r)) ?? ROW_ESTIMATE)));
  const total = offsets[rows.length];
  let start = 0; while (start < rows.length - 1 && offsets[start + 1] < scrollTop - BUFFER_PX) start++;
  let end = start; while (end < rows.length && offsets[end] < scrollTop + viewH + BUFFER_PX) end++;
  const shown = rows.slice(start, end);

  useLayoutEffect(() => {
    // Measure what is drawn; if anything differs from what the offsets assumed, draw once more with the real heights.
    const tb = body.current; if (!tb) return;
    let changed = false;
    shown.forEach((r, j) => {
      const el = tb.children[1 + j] as HTMLElement | undefined;
      if (!el) return;
      const h = el.getBoundingClientRect().height, k = rowKey(r), old = heights.current.get(k);
      if (h > 0 && (old === undefined || Math.abs(old - h) > 1)) { heights.current.set(k, h); changed = true; }
    });
    if (changed) bump(n => n + 1);
  });

  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const read = () => setViewH(el.clientHeight || 600);
    read();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  useEffect(() => { if (wrap.current) wrap.current.scrollTop = 0; setScrollTop(0); }, [resetKey]);

  const spacer = (h: number, key: string) => (
    <tr key={key} aria-hidden="true" style={{ height: h }}><td colSpan={cols.length} style={{ padding: 0, border: 0, height: h, lineHeight: 0, fontSize: 0 }} /></tr>
  );
  return (
    <div className="dt-wrap" ref={wrap} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      style={{ maxHeight, overflowY: 'auto', opacity: loading ? 0.55 : 1, transition: 'opacity .12s' }}>
      <table className="dt" style={{ minWidth: w + 'px' }}>
        <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c.width + 'px' }} />)}</colgroup>
        <thead><tr>{cols.map((c, i) => {
          const active = sort && c.sortKey && sort.key === c.sortKey;
          return (
            <th key={i} className={c.cls || ''} onClick={c.sortKey && onSort ? () => onSort(c.sortKey!) : undefined}
              aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
              style={{ position: 'sticky', top: 0, zIndex: 2, cursor: c.sortKey ? 'pointer' : undefined, userSelect: c.sortKey ? 'none' : undefined }}>
              {c.label}{active ? <span style={{ marginLeft: 4, color: 'var(--brand)' }}>{sort!.dir === 'asc' ? '▲' : '▼'}</span> : null}
            </th>
          );
        })}</tr></thead>
        <tbody ref={body}>
          {spacer(offsets[start], 'top')}
          {shown.map(r => renderRow(r))}
          {spacer(total - offsets[end], 'bottom')}
          {rows.length ? null : <tr><td colSpan={cols.length} className="dt-empty">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
