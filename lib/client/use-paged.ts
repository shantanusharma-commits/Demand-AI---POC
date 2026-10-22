'use client';

// A server list read a page at a time (keyset): the first page loads when the address changes (filters, search),
// "Show more" appends the next one. A stale answer for an address no longer shown is dropped.
import { useEffect, useState } from 'react';
import { api, errorText } from './api';
import { showToast } from '../ui';

export function usePaged<T>(url: string | null) {
  const [state, setState] = useState<{ url: string; rows: T[]; next: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!url) return;
    let live = true;
    api<{ rows: T[]; next: number | null }>(url)
      .then(p => { if (live) setState({ url, rows: p.rows, next: p.next }); })
      .catch(e => { if (live) showToast(errorText(e)); });
    return () => { live = false; };
  }, [url]);
  const current = state && state.url === url ? state : null;
  async function more() {
    if (!url || !current || current.next === null) return;
    setBusy(true);
    try {
      const p = await api<{ rows: T[]; next: number | null }>(`${url}${url.includes('?') ? '&' : '?'}after=${current.next}`);
      setState(s => (s && s.url === url ? { url, rows: [...s.rows, ...p.rows], next: p.next } : s));
    } catch (e) { showToast(errorText(e)); }
    setBusy(false);
  }
  return { rows: current ? current.rows : null, next: current ? current.next : null, busy, more };
}
