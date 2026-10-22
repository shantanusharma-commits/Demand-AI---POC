'use client';

/* Setup → Integrations: the Hunter.io API key for email verification. The key goes to the server and is stored
   encrypted; this panel only ever learns whether one is set, never the key itself. */
import { useEffect, useRef, useState } from 'react';
import { getHunterStatus, removeHunterApiKey, saveHunterApiKey } from '@/lib/email-verification/client';
import { showToast } from '@/lib/ui';
import { sx } from '@/lib/sx';
import type { HunterSettingsStatus } from '@/types/email-verification';

export function HunterSettingsPanel() {
  const [status, setStatus] = useState<HunterSettingsStatus | null | undefined>(undefined); // undefined = loading, null = unreachable
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { void getHunterStatus().then(setStatus); }, []);

  async function save() {
    const key = input.current?.value.trim() || '';
    if (!key) { setError('Paste the API key first'); return; }
    setBusy(true); setError('');
    const r = await saveHunterApiKey(key);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    if (input.current) input.current.value = '';
    setStatus(r.status); showToast('Hunter.io key saved');
  }
  async function remove() {
    setBusy(true);
    const s = await removeHunterApiKey();
    setBusy(false);
    if (s) { setStatus(s); showToast('Hunter.io key removed'); } else showToast('Could not remove the key');
  }

  const badge = status === undefined ? <span className="sc sc-l">Checking…</span>
    : status === null ? <span className="sc sc-l">Unavailable</span>
    : status.configured ? <span className="sc sc-h">Connected</span> : <span className="sc sc-m">Not connected</span>;

  return (
    <div className="panel" style={sx('margin-bottom:12px')}>
      <div className="panel-hdr"><span className="panel-ttl">Integrations · Email verification (Hunter.io)</span>{badge}</div>
      <div className="panel-body">
        <div style={sx('font-size:11.5px;color:var(--i2);margin-bottom:12px;line-height:1.6')}>
          Prospecting uses Hunter.io to check whether each lead&apos;s email can receive mail. The key is stored encrypted on the server and is never shown again.
          {status?.configured && status.source === 'env' ? ' It is currently read from the HUNTER_API_KEY environment variable; a key saved here takes precedence.' : ''}
        </div>
        <div style={sx('display:flex;gap:8px;align-items:center;flex-wrap:wrap')}>
          <input ref={input} type="password" autoComplete="off" spellCheck={false} placeholder={status?.configured ? 'Paste a new key to replace the current one' : 'Hunter.io API key'}
            onKeyDown={e => { if (e.key === 'Enter') void save(); }}
            style={sx('flex:1;min-width:240px;border:1px solid var(--bdk);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:var(--fb);outline:none')} />
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>Save key</button>
          {status?.configured && status.source === 'settings' ? <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void remove()}>Remove</button> : null}
        </div>
        {error ? <div style={sx('font-size:11px;color:var(--neg);margin-top:8px')}>{error}</div> : null}
      </div>
    </div>
  );
}
