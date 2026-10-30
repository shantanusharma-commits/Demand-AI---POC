// Why the AI chose an item's micro-segment and next best action (F2, product owner 30 Oct 2026): the segment (new or
// not, its theme, why, confidence) and the action (in the library or not, why, the signal rows it cited, the approved
// claims it would use, confidence, runner-up). Shown in the For Review workspace and the NBA drawer; nothing when the
// rules chose both.
import type { ReactNode } from 'react';
import { sx } from '@/lib/sx';
import type { WireDeep } from '@/lib/client/api';
import type { ItemDetail } from '@/lib/server/services/recommendations';
import { AiTag } from '@/components/AiTag';

type Why = NonNullable<WireDeep<ItemDetail>['ai']>;

const k = (t: string) => <div style={sx('font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--i3);margin:10px 0 4px')}>{t}</div>;
const sub = (t: ReactNode) => <div style={sx('font-size:11.5px;color:var(--i2);line-height:1.5')}>{t}</div>;

/** `segment` and `action` are what the item uses now, so a change by a person shows beside the AI's choice. */
export function AiWhy({ ai, segment, action }: { ai: Why; segment: string | null; action: string }) {
  const s = ai.segment, a = ai.action;
  return <div style={sx('font-size:12px;color:var(--i1);line-height:1.5')}>
    {s ? <>{k('Micro-segment')}
      <div><b>{s.name}</b> <AiTag confidence={s.confidence} />{s.isNew ? <> <span className="tag tag-amber">New: waits for approval</span></> : null}</div>
      {sub(<>Theme: {s.theme}</>)}{sub(s.why)}
      {segment && segment !== s.name ? sub(<>Now in <b>{segment}</b>: renamed, merged or changed by a person.</>) : null}</> : null}
    {a ? <>{k('Next best action')}
      <div><b>{a.action}</b> <AiTag confidence={a.confidence} /> <span className={`tag ${a.inLibrary ? 'tag-grey' : 'tag-amber'}`}>{a.inLibrary ? 'In the action library' : 'Not in the action library'}</span></div>
      {sub(a.why)}
      {action !== a.action ? sub(<>Now: <b>{action}</b>, chosen by a person.</>) : null}
      {a.signals.length ? <>{k('Signals it cited')}{a.signals.map(g => <div key={g.row ?? g.type + g.date} style={sx('padding:3px 0;border-top:1px solid var(--s75)')}>
        <b>{g.type}</b> <span style={sx('color:var(--i3)')}>{g.date ? `· ${g.date}` : ''}{g.row !== null ? ` · row ${g.row}` : ''}</span>{g.detail ? sub(g.detail) : null}</div>)}</> : null}
      {k('Claims it would use')}{a.claims.length ? a.claims.map(c => <div key={c.id}>{c.id}{c.title ? ` · ${c.title}` : ''}</div>) : sub('None: no approved claim fits')}
      {a.runnerUp ? <>{k('Runner-up')}<div><b>{a.runnerUp.action}</b>{a.runnerUp.inLibrary ? null : <> <span className="tag tag-amber">Not in the action library</span></>}</div>{sub(a.runnerUp.why)}</> : null}</> : null}
    {!a ? sub('The rules chose the action, from the action library for its micro-segment.') : null}
  </div>;
}
