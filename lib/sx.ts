/* Turns an inline CSS string, as written in the original markup, into a React style object.
   Lets the original style="…" strings carry over character for character, so the look stays identical.
   sx('font-size:11px;color:var(--i3)') → { fontSize: '11px', color: 'var(--i3)' } */
import type { CSSProperties } from 'react';

const cache = new Map<string, CSSProperties>();

export function sx(css: string): CSSProperties {
  const hit = cache.get(css);
  if (hit) return hit;
  const out: Record<string, string> = {};
  // Split on semicolons that are not inside parentheses (url(), var(), rgba() …).
  let depth = 0, start = 0;
  const decls: string[] = [];
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) { decls.push(css.slice(start, i)); start = i + 1; }
  }
  decls.push(css.slice(start));
  for (const d of decls) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const prop = d.slice(0, i).trim();
    const value = d.slice(i + 1).trim();
    if (!prop) continue;
    const key = prop.startsWith('--') ? prop
      : prop.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[key] = value;
  }
  const style = out as CSSProperties;
  cache.set(css, style);
  return style;
}
