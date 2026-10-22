'use client';

// The inline rename box of the Saved lists and Scored lists tables: Enter or Save keeps the name, Escape cancels.
import { useState } from 'react';
import { sx } from '@/lib/sx';

export function RenameField({ initial, onDone, onCancel }: { initial: string; onDone: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div style={sx('display:flex;gap:6px;align-items:center')}>
      <input id="renameInput" autoFocus onFocus={e => e.currentTarget.select()} value={value} aria-label="New name" onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onDone(value.trim()); if (e.key === 'Escape') onCancel(); }}
        style={sx('flex:1;min-width:0;padding:6px 9px;border:1px solid var(--brand-mid);border-radius:var(--rsm);font-size:12.5px')} />
      <button className="btn btn-primary btn-sm" onClick={() => onDone(value.trim())}>Save</button>
    </div>
  );
}
