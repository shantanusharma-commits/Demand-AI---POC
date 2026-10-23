/* For Review and the next best action's life after it is built (spec 5.16–5.19, 6.1–6.8, 8.1): the port of the rules
   in legacy/demandai-nba.js. Pure functions over a recommendation (the engine's Rec, frozen when micro-segments are
   built), its current decision state and its current draft; the server stores the state and the log, the screens
   show it. Changes from the original, each deliberate:
   - R3 "Wrong company or site" is offered (D-18): the account is set aside and the data is flagged for its owner;
   - nothing is sent or decided in bulk, and a message to someone who can't be contacted is never released (G-007):
     the server refuses to release a draft marked unreachable;
   - due dates are worked out where they are shown (the browser's time zone), from when the item reached For Review. */
import { CONFIG, clean, lowerFirst } from '../demandai-engine.ts';
import {
  allowedChannels, briefFor, callScript, draftFor, estimateDealSize, type BrandPack, type CheckResult, type Draft, type Rec,
} from './nba.ts';

export const SEG_MEANS: Record<string, string> = {
  Inquiry: 'Asked a question or for a quote', Modernisation: 'Installed system nearing end of support', 'Service renewal': 'Service contract coming up for renewal',
  Project: 'Capital project under way', Leadership: 'New leader in a buying role', Engagement: 'Engaged with our content or events',
};

export const REC_STATUSES = ['Waiting', 'Awaiting approval', 'Released', 'Closed', 'Set aside', 'Watch list'] as const;
export type RecStatus = (typeof REC_STATUSES)[number];
export const REC_WHY = ['exception', 'sensitive', 'alternative', 'sent back', 'stepped in'] as const;
export const OUTCOMES = ['Sent', 'Replied', 'Meeting booked', 'No response'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** A recommendation's decision state: where it is, and what people changed about it. */
export interface RecState {
  status: RecStatus;
  why: (typeof REC_WHY)[number] | null;
  released: 'auto' | 'accepted' | 'approved' | null;
  /** Went ahead on its own when the micro-segments were built. */
  passed: boolean;
  /** Why it needed a person when it was routed. */
  reasons: string[];
  /** Reason categories a person fixed on the account. */
  fixed: string[];
  useRunnerUp: boolean;
  manualAction: string | null;
  channelPref: string | null;
  variant: string | null;
  /** The contact a "wrong contact" alternative or a reviewer switched to (their row in the list). */
  contactRow: number | null;
  assignedSegment: string | null;
  alternativeUsed: boolean;
  alternativeOf: string | null;
  rejectCode: string | null;
  sentBackNote: string | null;
  spot: 'pending' | 'accepted' | 'rejected' | null;
  holdWhy: string | null;
  outcome: Outcome | null;
}

export function initialState(): RecState {
  return { status: 'Waiting', why: null, released: null, passed: false, reasons: [], fixed: [], useRunnerUp: false, manualAction: null, channelPref: null,
    variant: null, contactRow: null, assignedSegment: null, alternativeUsed: false, alternativeOf: null, rejectCode: null, sentBackNote: null, spot: null,
    holdWhy: null, outcome: null };
}

/* ─── Per item: the prospect, the action and the draft as they are now ─── */

/** The recommendation after any "wrong contact" alternative or contact switch. */
export function liveRec(r: Rec, st: Pick<RecState, 'contactRow'>): Rec {
  if (st.contactRow === null || st.contactRow === undefined) return r;
  const p = (r.result.people || []).find(x => x.contact.row === st.contactRow);
  return p ? { ...r, contact: p.contact, person: p } : r;
}
export function chosenAction(r: Pick<Rec, 'action' | 'runnerUp'>, st: Pick<RecState, 'manualAction' | 'useRunnerUp'>): string {
  return st.manualAction ? st.manualAction : st.useRunnerUp && r.runnerUp ? r.runnerUp.action : r.action;
}
/** The draft the rules produce for the item as it stands (the run's brand pack and as-of date). */
export function generatedDraft(r: Rec, st: RecState, brand: BrandPack, asOf: string): Draft {
  return draftFor(liveRec(r, st), chosenAction(r, st), { asOf, channel: st.channelPref || undefined, variant: st.variant || undefined, brand });
}
/** The micro-segment an item is in: the one it was grouped into, or the one a reviewer assigned when there was none. */
export const segOf = (r: Pick<Rec, 'segment'>, st: Pick<RecState, 'assignedSegment'>): string => r.segment || st.assignedSegment || '';

export const isSensitive = (chk: CheckResult): boolean => chk.flags.some(f => f.rule === 'Sensitive term');

/* Step 1 · Exception check. Anything that passes goes ahead on its own; anything else waits for a person. */
export function exceptionReasons(r: Rec, draft: Pick<Draft, 'unreachable' | 'why'>, chk: CheckResult): string[] {
  const out: string[] = [];
  if (!r.segment) out.push('Segment too small');
  const deal = estimateDealSize(r.account);
  if (deal && deal.below) out.push(`Below the deal-size threshold: about USD ${Math.round(deal.value / 1000)}k against ${Math.round(CONFIG.dealSize.threshold / 1000)}k`);
  if (r.result.confidence === 'low') out.push('Low confidence: no contact in the primary persona');
  if (isSensitive(chk)) out.push('Sensitive content');
  if (draft.unreachable) out.push("Can't reach them: " + draft.why.replace(/\.$/, ''));
  if (chk.unsupported.length) out.push("A claim can't be verified");
  const brand = chk.flags.filter(f => f.rule !== 'Sensitive term');
  if (brand.length) out.push(`Brand or rule check: ${brand.map(f => f.rule.toLowerCase()).join(', ')}`);
  return out;
}

/** The checks every recommendation goes through, pass or fail, for the evidence card. */
export function fourChecks(reasons: string[]): [string, boolean][] {
  const has = (re: RegExp) => reasons.some(t => re.test(t));
  const out: [string, boolean][] = [['Segment size', !has(/^Segment too small/)], ['Confidence', !has(/^Low confidence/)], ['Sensitive content', !has(/^Sensitive/)], ['Claims', !has(/claim/)]];
  if (has(/deal-size/)) out.push(['Deal size', false]);
  if (has(/^Brand/)) out.push(['Brand and rules', false]);
  if (has(/^Can't reach/)) out.push(['Reachable', false]);
  return out;
}

/* Why an item needs a person, in a few fixed categories (used by Today and For Review). */
export const REASON_CATS: Record<string, string> = {
  sensitive: 'Sensitive content', claim: 'Unsupported claim', low: 'Low confidence', small: 'Segment too small', deal: 'Below deal size', brand: 'Brand or rule check',
  reach: "Can't reach them", fixed: 'Reasons fixed', spot: 'Spot-check', alternative: 'Alternative offered', sentback: 'Sent back', intervention: 'Stepped in', other: 'Other',
};
export function reasonCats(st: Pick<RecState, 'spot' | 'why' | 'reasons' | 'fixed'>, live: { reasons: string[]; unreachable: boolean }): string[] {
  if (st.spot === 'pending') return ['spot'];
  if (st.why === 'alternative') return ['alternative'];
  if (st.why === 'sent back') return ['sentback'];
  if (st.why === 'stepped in') return ['intervention'];
  const out: string[] = [];
  (st.reasons.length ? st.reasons : live.reasons).forEach(t => {
    const c = /^Sensitive/.test(t) ? 'sensitive' : /claim/.test(t) ? 'claim' : /^Low confidence/.test(t) ? 'low'
      : /^Segment too small/.test(t) ? 'small' : /deal-size/.test(t) ? 'deal' : /^Brand/.test(t) ? 'brand' : /^Can't reach/.test(t) ? 'reach' : 'other';
    if (!out.includes(c)) out.push(c);
  });
  if (!out.length) return ['other'];
  // Reasons a person fixed on the account: a confirmed contact, a way to reach them, a micro-segment.
  const left = out.filter(c => !st.fixed.includes(c) && !(c === 'reach' && !live.unreachable));
  return left.length ? left : ['fixed'];
}

/* ─── Review by when (shown in the viewer's own time zone) ─── */

const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
function addWorkDays(t: number, n: number): number {
  const d = new Date(dayStart(t));
  while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n--; }
  while (!(d.getDay() % 6)) d.setDate(d.getDate() + 1);
  return +d;
}
/** 5 pm on the due working day; spot-checks are due by Friday of the week they were drawn. */
export function dueOf(item: { cats: string[]; segment: string | null; spot: string | null; routedAt: number }): number {
  const D = CONFIG.reviewDue, start = item.routedAt;
  if (item.spot === 'pending') { const f = new Date(dayStart(start)); f.setDate(f.getDate() + ((5 - f.getDay() + 7) % 7)); return +f + 17 * 36e5; }
  let days = Math.min(...item.cats.map(c => D[c] ?? D.other));
  if (item.segment === 'Inquiry') days = Math.min(days, D.inquiry);
  if (days === 0 && new Date(start).getHours() >= 15) days = 1;      // arrived late in the day: due the next working day
  return (days ? addWorkDays(start, days) : dayStart(start)) + 17 * 36e5;
}
export const DUE_BUCKETS: [string, string][] = [['overdue', 'Overdue'], ['today', 'Due today'], ['tomorrow', 'Due tomorrow'], ['2days', 'Due within two days'], ['later', 'Due later']];
export function dueBucket(t: number, now = Date.now()): string {
  if (t < now) return 'overdue';
  const n = Math.round((dayStart(t) - dayStart(now)) / 864e5);
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : n <= 2 ? '2days' : 'later';
}
export function dueLabel(t: number, now = Date.now()): string {
  const b = dueBucket(t, now), hm = new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (b === 'overdue') return 'Overdue since ' + new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  if (b === 'today') return 'By ' + hm + ' today';
  if (b === 'tomorrow') return 'By ' + hm + ' tomorrow';
  return 'By ' + new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ─── Where an item stands ─── */

export const inQueue = (st: Pick<RecState, 'status' | 'spot'>): boolean => st.status === 'Waiting' || st.spot === 'pending';
export const needsPerson = (st: Pick<RecState, 'status' | 'spot'>): boolean => inQueue(st) || st.status === 'Awaiting approval';
export const kindOfItem = (st: Pick<RecState, 'spot' | 'why'>): 'spot' | 'alternative' | 'intervention' | 'exception' =>
  st.spot === 'pending' ? 'spot' : st.why === 'alternative' ? 'alternative' : st.why === 'stepped in' ? 'intervention' : 'exception';
/** The tag a queue row carries: why it is in the queue. */
export const whyHere = (st: Pick<RecState, 'spot' | 'why'>): string =>
  st.spot === 'pending' ? 'Spot-check' : ({ exception: 'Exception', alternative: 'Alternative', 'sent back': 'Sent back', 'stepped in': 'Intervention' } as Record<string, string>)[st.why || ''] || 'Exception';

/** The status a rep sees on the next best action screen, with its tag tone. */
export function statusLabel(st: Pick<RecState, 'status' | 'spot' | 'released'> & { meeting?: { seen: boolean } | null }, paused: boolean): [string, string] {
  if (paused) return ['Paused by the sales manager', 'tag-grey'];
  if (st.spot === 'pending') return ['Proceeded · spot-check', 'tag-blue'];
  if (st.status === 'Waiting') return ['Waiting for you in the exception queue', 'tag-amber'];
  if (st.status === 'Awaiting approval') return ['Waiting for the sales manager', 'tag-violet'];
  if (st.meeting) return [st.meeting.seen ? 'Meeting booked · call script ready' : 'New: call script for the meeting', 'tag-violet'];
  if (st.status === 'Released') return [st.released === 'auto' ? 'Proceeded' : st.released === 'approved' ? 'Approved' : 'Accepted', 'tag-green'];
  return [st.status, st.status === 'Closed' ? 'tag-red' : 'tag-grey'];
}

/* Why it needs you, in plain words: what is stuck, and the call the reviewer has to make. */
export const SENSITIVE_RE = /\b(incident|accident|explosion|fatalit\w*|injur\w*|lawsuit|security|cyber|breach\w*|vulnerab\w*|regulat\w*|compliance|emission\w*)\b/i;
const firstOf = (c: { firstName?: string; name: string }) => (c.firstName || String(c.name || '').split(' ')[0] || 'them');
export type Stuck = { cat: string; label: string; line: string; call: string; also: string[]; missing: string };
export function stuck(r: Rec, st: RecState, draft: Draft, chk: CheckResult, cats: string[]): Stuck {
  const c = liveRec(r, st).contact, cat = cats[0];
  const term = (draftText(draft).match(SENSITIVE_RE) || [])[0];
  const L: Record<string, [string, string]> = {
    sensitive: [`The message mentions “${term || 'a sensitive topic'}”, a sensitive topic.`, `Should this go to ${firstOf(c)} as it is, or change first?`],
    claim: [`The message makes a claim with no approved source: “${(chk.unsupported[0] || { text: 'a claim' }).text}”.`, 'Remove or replace the claim, or reject the draft.'],
    low: [`No contact in the primary persona. ${c.name} is ${c.jobTitle || 'in another role'}.`, `Is ${firstOf(c)} the right person to approach at ${r.account.name}?`],
    small: [`No micro-segment: fewer than ${CONFIG.minSegmentAccounts} accounts share its signal.`, 'Pick the micro-segment to release it into, then accept.'],
    deal: [(() => { const ds = estimateDealSize(r.account); return ds ? `The deal looks small: about USD ${Math.round(ds.value / 1000)}k against a ${Math.round(CONFIG.dealSize.threshold / 1000)}k threshold.` : 'The deal looks below the size threshold.'; })(), `Is ${r.account.name} worth this outreach anyway?`],
    brand: [`The message breaks a brand rule: ${chk.flags.filter(f => f.rule !== 'Sensitive term').map(f => f.rule.toLowerCase() + ' (' + f.detail + ')').join(', ') || 'brand rules'}.`, 'Edit the message, or reject it for a new one.'],
    reach: [`No way to reach ${firstOf(c)}: ${lowerFirst(String(draft.why || 'No verified email or LinkedIn').split(':')[0].replace(/\.$/, ''))}.`, 'Find a way to reach them, or put it on hold until the data is fixed.'],
    spot: ['It passed every check and went ahead on its own. It was picked for this week\'s spot-check.', 'Would you have sent this? Rate it.'],
    alternative: [`You rejected “${st.alternativeOf || 'the first recommendation'}”. This is the one alternative.`, 'Use this alternative, or reject it to close the account for the pilot.'],
    sentback: [`Sent back by the sales manager: “${st.sentBackNote || ''}”.`, 'Change what they asked, then accept again.'],
    intervention: ['You stepped in after it went ahead on its own.', 'Edit it, or reject it.'],
    fixed: ['Every reason it was here is fixed.', 'Approve it to send it out, or reject it.'],
    other: [st.reasons[0] || 'The system could not decide it alone.', 'Accept, change or reject it.'],
  };
  const l = L[cat] || ['The system could not decide it alone.', 'Accept, change or reject it.'];
  const missing = cats.includes('reach') ? 'A way to reach the contact' : cats.includes('small') ? 'A micro-segment' : '';
  return { cat, label: REASON_CATS[cat] || 'Exception', line: l[0], call: l[1], also: cats.slice(1).map(k => REASON_CATS[k]).filter(Boolean), missing };
}

/* ═══════════════ DECISIONS: one item at a time, no bulk ═══════════════ */

/** Step 6 · Rejection reasons, shown as words. Each decides what comes back. R3 is D-18. */
export const REJECT: [string, string, string][] = [
  ['R6', 'Wrong action', 'The runner-up action comes back, once'],
  ['R7', 'Wrong contact', 'The next contact comes back'],
  ['R8', 'Wrong channel', 'The same action on the next channel'],
  ['R9', 'Something in the draft is wrong', 'A new draft for the same action'],
  ['R10', 'Tone or brand', 'A new draft for the same action'],
  ['R11', 'Length or format', 'A shorter draft for the same action'],
  ['R1', 'Wrong fit', 'The account is set aside for the pilot'],
  ['R2', 'Signal too weak', 'The account is set aside for the pilot'],
  ['R3', 'Wrong company or site', 'The account is set aside and the data is flagged for its owner'],
  ['R5', 'Not the right time', 'The account moves to the watch list'],
  ['R4', 'Already engaged', 'Engage-once applies'],
  ['R12', 'Other', 'A comment is needed; nothing changes'],
];
export const REJECT_CODES = REJECT.map(x => x[0]);
/** Rejections split by cause: a gap in the Client's data, or the system's own judgement. Compliance send-backs apart. */
const CAUSE: Record<string, string> = { R7: 'data', R1: 'data', R2: 'data', R3: 'data', R4: 'data', R6: 'system', R8: 'system', R9: 'system', R10: 'system', R11: 'system', R5: 'system', R12: 'other' };
export const causeOf = (code: string): string => CAUSE[code] || 'other';
export const ACCEPT_TAGS = ['Accurate reasoning', 'Right timing', 'Right action', 'Ready to use', 'Saved research time'];
export const WRONG_TAGS = ['Wrong action', 'Wrong person', 'Wrong channel', 'Message off', 'Bad timing'];
export const HOLD_WHY = ['Missing contact details', 'Missing account data', 'Waiting for someone to confirm', 'Other'];

export type FollowUp = { patch: Partial<RecState>; outcome: string; redraft: string | null };

/** What a rejection does: the alternative that comes back (once), or where the account goes. `redraft` names the change
 *  when the draft has to be made again for the alternative. */
export function rejectFollowUp(code: string, r: Rec, st: RecState, current: Pick<Draft, 'channel'>): FollowUp {
  const second = st.alternativeUsed;
  let alt: { patch: Partial<RecState>; outcome: string; redraft: string } | null = null;
  if (!second) {
    if (code === 'R6' && r.runnerUp && !st.useRunnerUp && !st.manualAction) alt = { patch: { useRunnerUp: true }, outcome: 'The runner-up action comes back, once', redraft: 'Wrong action: the runner-up' };
    if (code === 'R7') {
      const tried = new Set<number | undefined>([r.contact.row, st.contactRow ?? undefined]);
      const pr: Record<string, number> = { Primary: 0 };
      const nx = (r.result.people || []).filter(p => !tried.has(p.contact.row) && !p.contact.optOut)
        .sort((a, b) => (pr[a.contact.persona || ''] ?? 1) - (pr[b.contact.persona || ''] ?? 1))[0];
      if (nx) alt = { patch: { contactRow: nx.contact.row ?? null, channelPref: null }, outcome: `The next contact comes back: ${nx.contact.name}`, redraft: 'Wrong contact: the next contact' };
    }
    if (code === 'R8' && current.channel !== 'Task') {
      const al = allowedChannels(liveRec(r, st).contact) as string[];
      const nx = al[al.indexOf(current.channel) + 1];
      if (nx) alt = { patch: { channelPref: nx }, outcome: `The same action comes back on ${nx}`, redraft: 'Wrong channel: the next channel' };
    }
    if (code === 'R9') alt = { patch: { variant: 'alt' }, outcome: 'A new draft comes back for the same action', redraft: 'Draft issue: a new draft' };
    if (code === 'R10') alt = { patch: { variant: 'tone' }, outcome: 'A new draft comes back for the same action', redraft: 'Tone or brand: a new draft' };
    if (code === 'R11') alt = { patch: { variant: 'short' }, outcome: 'A shorter draft comes back for the same action', redraft: 'Length or format: a shorter draft' };
  }
  const prev = `${chosenAction(r, st)} (${current.channel})`;
  // Step 7 · The alternative goes back to the same rep's queue, marked "alternative", once.
  if (alt) return { patch: { ...alt.patch, status: 'Waiting', why: 'alternative', alternativeUsed: true, alternativeOf: prev, spot: null, rejectCode: code }, outcome: alt.outcome, redraft: alt.redraft };
  const base = { spot: null, rejectCode: code } as Partial<RecState>;
  if (code === 'R1' || code === 'R2') return { patch: { ...base, status: 'Set aside' }, outcome: 'The account is set aside for the pilot', redraft: null };
  if (code === 'R3') return { patch: { ...base, status: 'Set aside' }, outcome: 'The account is set aside and the data is flagged for its owner', redraft: null };
  if (code === 'R4') return { patch: { ...base, status: 'Closed' }, outcome: 'Engage-once applies', redraft: null };
  if (code === 'R5') return { patch: { ...base, status: 'Watch list' }, outcome: 'The account moves to the watch list', redraft: null };
  if (code === 'R12' && !second) return { patch: { ...base, status: 'Closed' }, outcome: 'Nothing changes automatically', redraft: null };
  return { patch: { ...base, status: 'Closed' }, outcome: second ? 'Second rejection: the account is closed for the pilot' : 'No alternative left: closed', redraft: null };
}

/* ─── Drafts as text, and how much an edit changed ─── */

export function draftText(x: Partial<Draft>): string {
  if (x.channel === 'Email') return `Subject: ${x.subject}\n\n${x.body}`;
  if (x.channel === 'LinkedIn') return x.note || '';
  const s = x.script;
  return [x.task, s && `Opener: ${s.opener}`, s && `Questions: ${s.questions.join(' / ')}`, s && `Objection: ${s.objection} → ${s.response}`, s && `Ask: ${s.ask}`].filter(Boolean).join('\n');
}

/** Step 4 · An edit is rated automatically. Minor: wording, tone or length only. Major: a change to the facts (numbers,
 *  names, dates, claims), the ask, the action or the person. */
export function editRating(before: Partial<Draft>, after: Partial<Draft>): { changed: number; rating: 'minor' | 'major'; why: string } {
  const t1 = draftText(before), t2 = draftText(after);
  const facts = (t: string) => new Set((t.match(/\b\d[\d.,%]*\b|(?<![.?!]\s|^|\n)\b[A-Z][a-zA-Z&-]{2,}\b|\[[^\]]+\]/g) || []).map(x => x.toLowerCase()));
  const ask = (t: string) => (t.match(/[^.?!\n]*\?/g) || []).map(x => x.trim().toLowerCase()).join('|');
  const f1 = facts(t1), f2 = facts(t2);
  const factChange = [...f1].some(x => !f2.has(x)) || [...f2].some(x => !f1.has(x));
  const askChange = ask(t1) !== ask(t2);
  const w1 = t1.split(/\s+/).filter(Boolean), w2 = t2.split(/\s+/).filter(Boolean);
  const left = new Map<string, number>(); w1.forEach(w => left.set(w, (left.get(w) || 0) + 1));
  let common = 0; w2.forEach(w => { const n = left.get(w); if (n) { common++; left.set(w, n - 1); } });
  const changed = Math.max(w1.length, w2.length) - common;
  const why = factChange && askChange ? 'facts and the ask changed' : factChange ? 'facts changed' : askChange ? 'the ask changed' : 'wording, tone or length only';
  return { changed, rating: factChange || askChange ? 'major' : 'minor', why };
}

/** A person's edit applied to the draft: only the fields of its channel, the rest kept. */
export function withEdits(d: Draft, edit: { subject?: string; body?: string; note?: string; task?: string }): Draft {
  const x = { ...d };
  if (x.channel === 'Email') {
    if (edit.subject !== undefined) x.subject = edit.subject;
    if (edit.body !== undefined) { x.body = edit.body; x.words = edit.body.split(/\s+/).filter(Boolean).length; }
  } else if (x.channel === 'LinkedIn') { if (edit.note !== undefined) x.note = edit.note; }
  else if (edit.task !== undefined) x.task = edit.task;
  return x;
}
export const sameDraft = (a: Partial<Draft>, b: Partial<Draft>): boolean => draftText(a) === draftText(b);

/* ─── A booked meeting brings the account back: a call script built from what was sent ─── */

export type MeetingScript = { opener: string; agenda: string[]; questions: string[]; objection: string; response: string; ask: string; context: string; proof: string };
export function meetingScript(r: Rec, st: RecState, x: Partial<Draft>, brand: BrandPack, asOf: string): MeetingScript {
  const lr = liveRec(r, st), action = chosenAction(r, st), brief = briefFor(lr, action, { asOf, brand });
  const base = callScript(lr, action, brief.whyNow, brand), first = (lr.contact.name || '').split(' ')[0];
  const sent = x.channel === 'Email' ? `the email "${x.subject}"` : x.channel === 'LinkedIn' ? 'the LinkedIn message' : 'the follow-up';
  return {
    opener: `Hi ${first}, thanks for making the time. We reached out with ${sent} because of your ${lowerFirst(r.reason.replace(/\s*\([^)]*\)/g, '').replace(/:\s*/, ' (').replace(/\.?$/, ')'))}. Is that still the priority on your side?`,
    agenda: ['Confirm the situation and who else is involved', 'Share what similar sites did' + (brief.proof ? ` (${brief.proof.title})` : ''), 'Agree a next step and a date'],
    questions: base.questions, objection: base.objection, response: base.response,
    ask: `Close on a next step: ${base.ask.replace(/\?$/, '')}, with a date in the next two weeks.`,
    context: brief.whyNow, proof: brief.proof ? brief.proof.title : '',
  };
}

/* ═══════════════ MEASUREMENT: G2 from first-pass decisions, G1 against the baseline ═══════════════ */

/** The parts of a decision-log entry the measures read. */
export interface LogFacts {
  decisive: boolean; firstPass: boolean | null; accepted: boolean | null; kind: string | null; flag: string | null; checked: boolean;
  segment: string; reason: string; cause: string | null; compliance: boolean; intervention: boolean; editRating: string | null; seconds: number | null;
}
const counts = (l: LogFacts) => !l.flag || l.checked;
const rate = (ls: LogFacts[]) => { const n = ls.length, a = ls.filter(l => l.accepted).length; return { n, a, pct: n ? a / n * 100 : null }; };

/** Trust: how often people agreed with the system's first recommendation (optionally in one micro-segment); early
 *  below the unit's "too early to call" number. */
export function trackRecord(logs: LogFacts[], seg?: string, min = CONFIG.minDecisions): { n: number; a: number; pct: number | null; early: boolean } {
  const ls = logs.filter(l => l.decisive && l.firstPass && counts(l) && (seg === undefined || l.segment === seg));
  const a = ls.filter(l => l.accepted).length;
  return { n: ls.length, a, pct: ls.length ? Math.round(a / ls.length * 100) : null, early: ls.length < min };
}

/** G2 weighted across the two paths, and G1 against the baseline (the unit's, from its configuration), over the items
 *  and the log in view. */
export function measure(items: { passed: boolean; status: string; outcome: string | null }[], logs: LogFacts[], base = CONFIG.g1BaselineMinutes) {
  const decisive = logs.filter(l => l.decisive);
  const first = decisive.filter(l => l.firstPass && counts(l));
  const autoN = items.filter(x => x.passed).length, excN = items.length - autoN;
  const auto = rate(first.filter(l => l.kind === 'spot')), exc = rate(first.filter(l => l.kind === 'exception'));
  let weighted: number | null;
  if (auto.pct !== null && exc.pct !== null) weighted = auto.pct * autoN / (autoN + excN) + exc.pct * excN / (autoN + excN);
  else weighted = auto.pct !== null ? auto.pct : exc.pct;
  const rejections = decisive.filter(l => !l.accepted);
  const reasons: Record<string, number> = {}; rejections.forEach(l => { reasons[l.reason] = (reasons[l.reason] || 0) + 1; });
  const released = items.filter(x => x.status === 'Released').length;
  const secs = decisive.reduce((t, l) => t + (l.seconds || 0), 0);
  const minutes = released ? secs / 60 / released : null;
  return {
    items: items.length, autoN, excN, auto, exc, weighted, pooled: rate(first),
    partial: auto.pct === null || exc.pct === null,
    alternatives: rate(decisive.filter(l => l.kind === 'alternative' && counts(l))),
    flagged: decisive.filter(l => l.flag && !l.checked).length,
    interventions: logs.filter(l => l.intervention).length,
    reasons, causes: { data: rejections.filter(l => l.cause === 'data').length, system: rejections.filter(l => l.cause === 'system').length, other: rejections.filter(l => l.cause === 'other').length },
    compliance: logs.filter(l => l.compliance).length,
    edits: { none: decisive.filter(l => l.accepted && l.editRating === 'none').length, minor: decisive.filter(l => l.editRating === 'minor').length, major: decisive.filter(l => l.editRating === 'major').length },
    outcomes: items.reduce((o: Record<string, number>, x) => { if (x.outcome) o[x.outcome] = (o[x.outcome] || 0) + 1; return o; }, {}),
    released, minutes, base, saved: minutes !== null ? (1 - minutes / base) * 100 : null,
  };
}

/** Integrity flags on a decisive decision: decided in under 5 seconds, or the fifth identical decision in a row. */
export function integrityFlag(seconds: number | null, decision: string, recent: string[]): string {
  let flag = '';
  if (seconds !== null && seconds < 5) flag = 'Decided in under 5 seconds';
  const kindOf = (s: string) => s.startsWith('Accepted') ? 'Accepted' : s;
  if (recent.length === 4 && recent.every(d => kindOf(d) === kindOf(decision))) flag = flag ? flag + ' · run of identical decisions' : 'Run of identical decisions';
  return flag;
}

/** The text a reviewer's own action or a decision log line can carry. */
export const cleanNote = (s: unknown, max = 1000): string => clean(s).slice(0, max);
