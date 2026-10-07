/* Small browser helpers the original pages each defined inline. Client-side only. */

/** The bottom toast: one at a time, gone after 2.6 s. Same element and class as the original. */
export function showToast(msg: string): void {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export function initials(n: string): string { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

export function avColor(id: unknown): string {
  const c = ['#7D52A2', '#0094DA', '#FF8820', '#2E7D5A', '#B23F3F'];
  let h = 0;
  for (const ch of String(id)) h += ch.charCodeAt(0);
  return c[h % c.length];
}
