'use client';

/* A row of tabs (G-035): a tablist of buttons, so tabs are reached and switched with the keyboard as well as the
   pointer. Only the selected tab is in the Tab order; the arrow keys, Home and End move to another tab and select it
   (the ARIA tabs pattern). It keeps the original .ftab look. */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export function Tabs({ label, children }: { label: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tabs = [...(row.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const to = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    tabs[to].focus();
    tabs[to].click();
  };
  return <div ref={row} className="ftabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>{children}</div>;
}

export function Tab({ active, onSelect, children }: { active: boolean; onSelect: () => void; children: ReactNode }) {
  return <button type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} className={'ftab' + (active ? ' active' : '')} onClick={onSelect}>{children}</button>;
}
