// The ranked prospects of a scoring run: one row per person who hasn't opted out, in the order the Scoring screen
// shows them (tier, then score, then fit). Same rules as the original page's prospects(); the server stores the
// result so every screen and the hand-off read one ranking.
import { CONFIG, canContact, suppressed } from '../demandai-engine.ts';
import type { Contact, PersonScore, ScoreResult, Signal, SignalResult, Tier } from '../../types/demandai';

export interface Prospect {
  /** The engine's own reference within the run: account ID | contact row. */
  key: string;
  c: Contact;
  r: ScoreResult;
  p: PersonScore | null;
  tier: Tier;
  score?: number;
  fit?: number;
  timing?: number;
}

export const TIER_ORDER: Record<Tier, number> = { A: 0, B: 1, C: 2, 'Watch list': 3, 'Below fit floor': 4, Excluded: 5 };

export function buildProspects(scored: ScoreResult[]): Prospect[] {
  const out: Prospect[] = [];
  for (const r of scored) {
    if (r.people) {
      r.people.forEach(p => {
        const live = p.signals.length > 0;
        out.push({ key: r.account.id + '|' + p.contact.row, c: p.contact, r, p, tier: p.tier as Tier, score: live ? p.final : undefined, fit: r.fit, timing: live ? p.timing : undefined });
      });
    } else {
      r.contacts.filter(c => !suppressed(c)).forEach(c => out.push({ key: r.account.id + '|' + c.row, c, r, p: null, tier: r.tier as Tier, fit: r.fit }));
    }
  }
  out.sort((x, y) => TIER_ORDER[x.tier] - TIER_ORDER[y.tier] || (y.score || 0) - (x.score || 0) || (y.fit || 0) - (x.fit || 0));
  return out;
}

/** A prospect with a live signal can be handed off. */
export const sendable = (x: Pick<Prospect, 'score'>): boolean => x.score !== undefined;

/** Who goes to NBA: the chosen prospects (by key), or every tier A and B prospect, with a live signal; of those, only
 *  people who can be contacted (G-005). The rest stay in Scoring and are counted as held back. */
export function handoffSelection(prospects: Prospect[], keys?: Set<string>): { items: Prospect[]; heldBack: number } {
  const candidates = prospects.filter(x => sendable(x) && (keys ? keys.has(x.key) : x.tier === 'A' || x.tier === 'B'));
  const items = candidates.filter(x => canContact(x.c));
  return { items, heldBack: candidates.length - items.length };
}

/* ─── The signal checks pop-up: the same ten steps and wording as the original page ─── */
export const SIG_STEPS: [string, string, string][] = [
  ['columns', 'Columns match the template', 'company_name, contact, signal_type, event_date, detail'],
  ['company', 'Company is on the list', 'Every row names an account from the prospect list'],
  ['person', 'Person is in the lead file', 'Matched by email or LinkedIn URL; blank goes to the primary persona'],
  ['date', 'Event date present and valid', 'YYYY-MM-DD, not after the scoring date'],
  ['type', 'Signal type is a known tag', 'From the template list; newsletter sign-ups are not scored'],
  ['dupes', 'Duplicates', 'The same event recorded twice'],
  ['window', 'Within its time window', 'Older than the tag counts for: stale'],
  ['knockout', 'Installed base', 'Pilot product already installed excludes the account'],
  ['fit', 'Fit', `Rubric score; below ${CONFIG.fitFloor} the account is dropped`],
  ['score', 'Timing and score', 'Each prospect\'s signals weighted and stacked; score 0–100 and tier'],
];

export interface SignalStepResult { sev: '' | 'warn' | 'info' | 'stop'; label: string; rows?: string }

const FILE_NOTE = /Required column|isn't in the template|header row|format hints|^File (encoding|delimiter)|^Column ".*" read as/;

export function signalStepResults(sig: Pick<SignalResult, 'signals' | 'issues'>, scored: ScoreResult[], prospects: Prospect[]): SignalStepResult[] {
  const is = sig.issues;
  const rowsLabel = (rowsIn: (number | string)[]): string => { const rows = [...new Set(rowsIn)]; return rows.length ? (rows.length === 1 && rows[0] === '—' ? 'Whole file' : 'Row' + (rows.length > 1 ? 's ' : ' ') + rows.slice(0, 5).join(', ') + (rows.length > 5 ? '…' : '')) : ''; };
  const rej = (test: (s: Signal) => boolean) => sig.signals.filter(s => s.status === 'Rejected' && test(s));
  const out = (list: { row: number | string }[], sev: SignalStepResult['sev'], label?: string | null): SignalStepResult => list.length ? { sev, label: label || `${list.length} found`, rows: rowsLabel(list.map(x => x.row)) } : { sev: '', label: 'Passed' };
  const step = (k: string): SignalStepResult => {
    switch (k) {
      case 'columns': return out(is.filter(i => FILE_NOTE.test(i.issue)), 'warn');
      case 'company': return out(rej(s => s.code === 'D4' && !/^Person/.test(s.reason) || (s.code === 'D3' && /company/i.test(s.reason))), 'warn', null);
      case 'person': {
        const r = rej(s => s.code === 'D4' && /^Person/.test(s.reason)), auto = sig.signals.filter(s => s.assigned && s.assigned !== 'Named in the file');
        if (r.length) return { sev: 'warn', label: `${r.length} not found`, rows: rowsLabel(r.map(x => x.row)) + (auto.length ? ` · ${auto.length} auto-assigned` : '') };
        return auto.length ? { sev: 'info', label: `${auto.length} auto-assigned`, rows: rowsLabel(auto.map(x => x.row)) } : { sev: '', label: 'Passed' };
      }
      case 'date': return out(rej(s => s.code === 'D3' && /date/i.test(s.reason)), 'warn');
      case 'type': return out(rej(s => s.code === 'D1' || (s.code === 'D3' && /signal type/i.test(s.reason))), 'warn');
      case 'dupes': return out(rej(s => s.code === 'D5'), 'warn');
      case 'window': return out(rej(s => s.code === 'D2'), 'info', null);
      case 'knockout': { const k2 = sig.signals.filter(s => s.status === 'Used for a knock-out'); return k2.length ? { sev: 'info', label: `${k2.length} excluded`, rows: rowsLabel(k2.map(x => x.row)) } : { sev: '', label: 'None installed' }; }
      case 'fit': { const n = scored.filter(r => r.belowFloor).length; return n ? { sev: 'info', label: `${n} below the floor` } : { sev: '', label: 'All above the floor' }; }
      case 'score': { const n = prospects.filter(x => x.score !== undefined).length, a = prospects.filter(x => x.tier === 'A').length; return { sev: '', label: `${n} prospects scored · ${a} in tier A` }; }
    }
    return { sev: '', label: '' };
  };
  return SIG_STEPS.map(s => step(s[0]));
}
