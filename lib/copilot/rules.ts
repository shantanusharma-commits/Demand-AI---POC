// Copilot's rule answers (G-013; legacy demandai-copilot.js, 14-review.html, 10-prospecting.html, 11-scoring.html):
// the common questions answered exactly and at once from the data on the screen, before any model is asked. Pure
// functions over the facts the server loads for the caller (owner-scoped as everywhere). A question these don't
// match returns null and may go to the model. Copilot reads; people decide: nothing here changes data, and a request
// to approve goes to an Autopilot plan the person confirms.
import { REASON_CATS, REJECT, SEG_MEANS } from '../engine/review.ts';
import type { AutopilotPlan, CopilotBlock } from './types.ts';

export type TR = { n: number; a: number; pct: number | null; early: boolean };

/** One item that needs a person, as Copilot sees it. `due` is epoch ms; `bucket` is worked out in the viewer's zone. */
export type QItem = {
  id: string; who: string; title: string; account: string; segment: string; cats: string[]; status: string; spot: string | null; why: string | null;
  action: string; runnerUp: { action: string; reason: string } | null; owner: string; ownerEmail: string | null; due: number; bucket: string; dueText: string;
  sensitive: boolean; reasons: string[]; runName: string;
};
export type QueueFacts = { manager: boolean; queue: QItem[]; approvals: QItem[]; mineHeld: QItem[]; track: TR; bySegment: [string, TR][]; reps: { email: string; name: string }[] };

const pl = (n: number, one: string, many?: string) => `${n} ${n === 1 ? one : many || one + 's'}`;
/** "Overdue since Thu 23 Oct" inside a sentence: only the first letter changes. */
const mid = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const P = (text: string): CopilotBlock => ({ t: 'p', text });
const NOTE = (text: string): CopilotBlock => ({ t: 'note', text });
const reviewHref = (id: string) => `/review?item=${encodeURIComponent(id)}`;
const rowsOf = (xs: QItem[], manager: boolean, max = 6): CopilotBlock => ({
  t: 'items', more: Math.max(0, xs.length - max),
  rows: xs.slice(0, max).map(x => ({ id: x.id, label: `${x.who} · ${x.account}`, sub: [x.status === 'Awaiting approval' ? 'Approval' : REASON_CATS[x.cats[0]] || x.status, x.dueText, manager ? x.owner : ''].filter(Boolean).join(' · '), href: reviewHref(x.id) })),
});

/* ─── Reading a question ─── */

export type Filter = { seg: string | null; rep: string | null; due: string | null; reason: string | null; kind: string | null };
export function parseQueue(text: string, segments: string[], reps: { email: string; name: string }[]): Filter & { t: string } {
  const t = text.toLowerCase();
  const seg = segments.find(s => t.includes(s.toLowerCase())) || (/moderni[sz]ation/.test(t) ? 'Modernisation' : null);
  const rep = reps.find(r => { const first = r.name.split(' ')[0].toLowerCase(); return first.length > 2 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t); })?.email ?? null;
  const due = /overdue|late\b/.test(t) ? 'overdue' : /today/.test(t) ? 'today' : /tomorrow/.test(t) ? 'tomorrow' : null;
  const reason = /sensitive/.test(t) ? 'sensitive' : /claim/.test(t) ? 'claim' : /low confidence|confidence/.test(t) ? 'low' : /too small|small segment/.test(t) ? 'small'
    : /deal/.test(t) ? 'deal' : /brand|rule/.test(t) ? 'brand' : /alternative/.test(t) ? 'alternative' : /sent back/.test(t) ? 'sentback' : null;
  const kind = /spot/.test(t) ? 'spot' : /approval/.test(t) ? 'approvals' : /exception/.test(t) ? 'exception' : null;
  return { t, seg, rep, due, reason, kind };
}
const DUE_WORDS: Record<string, string> = { overdue: 'overdue', today: 'due today', tomorrow: 'due tomorrow' };
function describe(f: Filter, reps: { email: string; name: string }[]): string {
  return [f.kind === 'spot' ? 'spot-checks' : f.kind === 'exception' ? 'exceptions' : f.kind === 'approvals' ? 'approvals' : 'items', f.seg && `in ${f.seg}`,
    f.rep && `for ${reps.find(r => r.email === f.rep)?.name ?? f.rep}`, f.reason && `with ${REASON_CATS[f.reason].toLowerCase()}`, f.due && DUE_WORDS[f.due]].filter(Boolean).join(' ');
}
export function matchQueue(list: QItem[], f: Filter): QItem[] {
  return list.filter(x => (!f.seg || x.segment === f.seg) && (!f.rep || x.ownerEmail === f.rep) && (!f.due || x.bucket === f.due) && (!f.reason || x.cats.includes(f.reason))
    && (!f.kind || f.kind === 'approvals' || (f.kind === 'spot' ? x.spot === 'pending' : x.spot !== 'pending')));
}
const filterHref = (f: Filter) => '/review?' + Object.entries({ due: f.due, reason: f.reason, kind: f.kind === 'approvals' ? null : f.kind, seg: f.seg, rep: f.rep })
  .filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');

export function trackLine(f: Pick<QueueFacts, 'track' | 'bySegment'>, seg?: string | null): string {
  const all = f.track, s = seg ? f.bySegment.find(([k]) => k === seg)?.[1] : null;
  if (!all.n) return 'No first-time decisions yet, so there is no track record to show.';
  return (s && s.n ? `In ${seg}, reps agreed with the system's first recommendation **${s.a} of ${s.n}** times (${s.pct}%). ` : seg ? `No decisions in ${seg} yet. ` : '')
    + `Across everything: **${all.a} of ${all.n}** (${all.pct}%).` + (all.early ? ` Early days: only ${pl(all.n, 'decision')} so far, so read it as a hint.` : '');
}

/* ─── Autopilot: a plan the person confirms (legacy contract; never for sensitive content) ─── */

/** The only reasons Autopilot may clear an exception for (legacy AUTOPILOT_LOW_RISK): below deal size. */
export const AUTOPILOT_LOW_RISK = ['deal'];
/** Why Autopilot would leave an item for a person, or null when it would take it. */
export function blockedWhy(x: QItem): string | null {
  if (x.spot === 'pending') return x.reasons.length ? `fails a check now: ${x.reasons.join('; ')}` : null;
  if (x.status !== 'Waiting') return 'already decided';
  const risky = x.cats.filter(c => !AUTOPILOT_LOW_RISK.includes(c));
  if (risky.length) return `${risky.map(c => (REASON_CATS[c] || c).toLowerCase()).join(', ')} needs a person`;
  if (x.sensitive) return 'sensitive content needs a person';
  return null;
}
export function autopilotPlan(f: QueueFacts, text: string, q: Filter): CopilotBlock[] {
  if (q.kind === 'approvals' || (q.reason === 'sensitive' && q.kind !== 'spot')) {
    return [P("Autopilot won't approve sensitive content. Each one is held because the draft mentions something sensitive, so a person reads it before it's released."),
      rowsOf(matchQueue(f.approvals, { ...q, reason: null }), f.manager), { t: 'link', label: 'Open the approvals →', href: '/review?view=approvals' }];
  }
  if (q.reason && !AUTOPILOT_LOW_RISK.includes(q.reason) && q.kind !== 'spot') {
    const m = matchQueue(f.queue, q);
    return [P(`Autopilot won't accept items with ${REASON_CATS[q.reason].toLowerCase()}; a person decides those. It can accept exceptions whose only reason is below deal size.`),
      ...(m.length ? [rowsOf(m, f.manager), { t: 'link' as const, label: 'Show these in For Review →', href: filterHref(q) }] : [])];
  }
  const wantsExc = q.kind === 'exception' || (!!q.reason && AUTOPILOT_LOW_RISK.includes(q.reason));
  const pool = wantsExc ? matchQueue(f.queue.filter(x => x.spot !== 'pending'), { ...q, kind: 'exception' }) : matchQueue(f.queue.filter(x => x.spot === 'pending'), { ...q, kind: 'spot', reason: null });
  const assumed = q.kind || q.reason ? [] : [NOTE('You didn\'t say which items, so this covers spot-checks only. To clear exceptions, name them, for example "accept all below deal size items".')];
  if (!pool.length) return [P(`Nothing for Autopilot to do: no ${wantsExc ? 'exceptions' : 'spot-checks'} waiting${q.seg || q.rep || q.due ? ` (${describe({ ...q, kind: wantsExc ? 'exception' : 'spot' }, f.reps)})` : ' for you'}.`), ...assumed];
  const plan: AutopilotPlan = { instruction: text.slice(0, 300), kind: wantsExc ? 'exception' : 'spot', will: [], left: [] };
  for (const x of pool) { const why = blockedWhy(x); if (why) plan.left.push({ id: x.id, label: `${x.who} · ${x.account}`, why }); else plan.will.push({ id: x.id, label: `${x.who} · ${x.account}` }); }
  return [P(`That changes data, so I'm handing it to **Autopilot**. Before it runs, here is exactly what it will do:`), { t: 'plan', plan },
    NOTE(`Autopilot checks every item again before it acts${wantsExc ? ', and accepts an exception only when its sole reason is below deal size' : ''}. Each one is logged under your name as "Accepted by Autopilot" with your instruction. These don't count toward G2, because nobody judged each one. You can undo the run.`), ...assumed];
}

/* ─── The queue: Today and For Review ─── */

export function queueAnswer(f: QueueFacts, text: string): CopilotBlock[] | null {
  const q = parseQueue(text, f.bySegment.map(([s]) => s).concat(Object.keys(SEG_MEANS)), f.reps), t = q.t, queue = f.queue;
  if (/\b(reject|close|delete|send back|remove)\b/.test(t)) {
    const m = matchQueue(queue, q);
    return [P("Autopilot doesn't reject or send back. A rejection needs a reason from a person, so it stays with you."), ...(m.length ? [rowsOf(m, f.manager), { t: 'link' as const, label: 'Show these in For Review →', href: filterHref(q) }] : [])];
  }
  if (/\b(approve|accept|rate|release|clear)\b/.test(t)) return autopilotPlan(f, text, q);
  if (/\b(instead|my own|own action)\b/.test(t)) return [P('Open the item in For Review and choose "Write your own": your action is redrafted and still waits for you to approve it.')];
  if (/runner/.test(t)) {
    const m = matchQueue(queue, q).filter(x => x.runnerUp);
    if (!m.length) return [P(`None of your items has a runner-up${q.seg || q.reason ? ` (${describe(q, f.reps)})` : ''}.`)];
    return [P(`The recommended action and the runner-up for ${pl(m.length, 'item')}:`),
      { t: 'table', head: ['Prospect', 'Recommended', 'Runner-up'], rows: m.slice(0, 8).map(x => [`${x.who} · ${x.account}`, x.action, `${x.runnerUp!.action}: ${x.runnerUp!.reason}`]) },
      NOTE('Using the runner-up redrafts the message; the item still waits for you to approve it. Open an item to switch.')];
  }
  if (/group|common|most (frequent|often)|by reason|reasons|stuck/.test(t)) {
    const m = matchQueue(queue, { ...q, reason: null });
    if (!m.length) return [P('Nothing is waiting for you, so there is nothing to group.')];
    const by = new Map<string, QItem[]>();
    for (const x of m) { const c = x.cats[0] || 'other'; by.set(c, [...(by.get(c) ?? []), x]); }
    const groups = [...by].sort((a, b) => b[1].length - a[1].length);
    return [P(`Your ${pl(m.length, 'item')} grouped by why the system needs you, most common first:`),
      { t: 'table', head: ['Why', 'Items', 'For example'], rows: groups.map(([c, xs]) => [REASON_CATS[c] || c, String(xs.length), xs.slice(0, 2).map(x => `${x.who} · ${x.account}`).join('; ')]) },
      ...groups.slice(0, 3).map(([c, xs]) => ({ t: 'link' as const, label: `Review the ${xs.length} with ${(REASON_CATS[c] || c).toLowerCase()} →`, href: filterHref({ ...q, reason: c === 'spot' ? null : c, kind: c === 'spot' ? 'spot' : null }) }))];
  }
  if (/why/.test(t)) {
    const words = t.split(/[^a-z0-9]+/).filter(w => w.length >= 4);
    const hit = queue.concat(f.approvals).find(x => words.some(w => x.who.toLowerCase().includes(w) || x.account.toLowerCase().includes(w)));
    if (hit) {
      return [P(`**${hit.who} · ${hit.account}**: ${hit.spot === 'pending' ? 'it went ahead on its own after passing every check, and was picked at random for this week\'s spot-check.'
        : hit.status === 'Awaiting approval' ? 'the draft has sensitive content, so it waits for the sales manager\'s approval before anything goes out.'
        : `it needs a person: ${hit.reasons.join('; ') || (REASON_CATS[hit.cats[0]] || 'a check failed').toLowerCase()}.`}`), rowsOf([hit], f.manager), NOTE(trackLine(f, hit.segment))];
    }
  }
  if (/first|start|begin|next|what should/.test(t)) {
    if (!queue.length) return [P('Nothing is waiting for you. Released messages waiting for an outcome are on Today.')];
    const x = queue.slice().sort((a, b) => a.due - b.due)[0];
    return [P(`Start with **${x.who} · ${x.account}**. It's ${mid(x.dueText)}, the earliest in your queue, and it's here because of ${(REASON_CATS[x.cats[0]] || 'a check').toLowerCase()}.`),
      rowsOf([x], f.manager), NOTE(`After it, ${pl(queue.length - 1, 'more item')} in the order they're due.`)];
  }
  if (/agree|trust|track record|how (are|is) (we|it)|g2|accept(ed|ance) rate|how often/.test(t)) {
    const segRows = f.bySegment.filter(([, r]) => r.n);
    return [P(trackLine(f, q.seg)), ...(segRows.length && !q.seg ? [{ t: 'table' as const, head: ['Micro-segment', 'Agreed', 'Share'], rows: segRows.map(([s, r]) => [s, `${r.a} of ${r.n}`, `${r.pct}%`]) }] : []),
      NOTE('A first-time decision is the first accept or reject on an item. Flagged decisions count only once a manager has checked them; Autopilot approvals never count.')];
  }
  if (q.kind === 'approvals') {
    if (!f.manager) return [P(f.mineHeld.length ? `${pl(f.mineHeld.length, 'message')} of yours ${f.mineHeld.length === 1 ? 'is' : 'are'} waiting for the sales manager's approval.` : 'Nothing of yours is waiting for the sales manager.'), ...(f.mineHeld.length ? [rowsOf(f.mineHeld, false)] : [])];
    const a = matchQueue(f.approvals, q);
    return [P(a.length ? `${pl(a.length, 'approval')} waiting for you${q.seg || q.rep ? ` (${describe(q, f.reps)})` : ''}.` : 'No approvals are waiting for you.'), ...(a.length ? [rowsOf(a, true), { t: 'link' as const, label: 'Open the approvals →', href: '/review?view=approvals' }] : [])];
  }
  if (q.due || q.reason || q.kind || q.seg || q.rep) {
    const m = matchQueue(queue, q);
    return [P(m.length ? `${pl(m.length, 'item')} in your queue: ${describe(q, f.reps)}.` : `Nothing in your queue matches: ${describe(q, f.reps)}.`), ...(m.length ? [rowsOf(m, f.manager), { t: 'link' as const, label: 'Show these in For Review →', href: filterHref(q) }] : [])];
  }
  if (/\bhow many\b|\bcount\b|what('|’)?s waiting|\bsummary\b|\boverview\b|\bdue\b/.test(t)) {
    const spot = queue.filter(x => x.spot === 'pending').length, soon = queue.filter(x => x.bucket === 'overdue' || x.bucket === 'today').length;
    return [P(`You have **${pl(queue.length, 'item')}** in For Review: ${pl(queue.length - spot, 'exception')} and ${pl(spot, 'spot-check')}${f.manager ? `, plus ${pl(f.approvals.length, 'approval')}` : ''}. ${queue.length ? `${soon} ${soon === 1 ? 'is' : 'are'} due today or overdue.` : ''}`.trim())];
  }
  return null;
}

/* ─── One recommendation (the For Review workspace, the NBA drawer) ─── */

export type Option = { action: string; reason: string; channel: string; proof: string; ok: boolean; flags: string[]; conf: string };
export type ItemFacts = {
  id: string; who: string; title: string; persona: string; account: { name: string; vertical: string; existingCustomer: boolean; country: string };
  tier: string | null; segment: string; status: string; spot: string | null; why: string | null; reasons: string[]; cats: string[];
  fourChecks: { name: string; ok: boolean }[]; whyNow: string; action: string; options: { recommended: Option; runnerUp: Option | null };
  confidence: { level: string; reason: string }; claimsTotal: number; claimsUnsupported: number; flags: string[]; signalWeight: number; primaryPersona: boolean;
  channel: string; channelWhy: string; subject: string; opening: string; words: number; sensitiveLines: string[]; aiDraft: boolean;
  track: { segment: TR | null; all: TR }; outcomes: Record<string, number>; deal: { value: number; below: boolean; basis: string } | null; dealThreshold: number;
  owner: string; people: { name: string; jobTitle: string; persona: string; reach: string }[]; reach: { email: boolean; verified: boolean; linkedin: boolean };
  history: { decision: string; note: string | null; who: string }[]; claims: { id: string; title: string }[]; brief: { angle: string; proof: string; objection: string; ask: string };
  dueText: string; signals: { type: string; date: string; detail: string; source: string }[]; manager: boolean;
};

const HOW: Record<string, string> = {
  sensitive: 'Check the red highlights in the message: keep, edit or remove them. A manager still approves it.', claim: 'Swap the claim for an approved one, or remove it.',
  low: 'Confirm the contact is the right person, or switch to someone else at the account.', reach: 'Add a verified email or a LinkedIn URL in Prospecting (a correction); it is saved everywhere the contact appears.',
  small: 'Pick the micro-segment to release it into.', deal: 'Decide whether it is worth it anyway.', brand: 'Edit the highlighted words.', spot: 'Rate it: approve if you would have sent it, reject if not.',
  alternative: 'Use this alternative, or reject it to close the account for the pilot.', sentback: 'Change what the manager asked, then approve again.', intervention: 'Edit or reject it: you stepped in on it.',
};

export function itemAnswer(f: ItemFacts, text: string): CopilotBlock[] | null {
  const t = text.toLowerCase();
  const is = (re: RegExp) => re.test(t);
  if (is(/spot.?check|why was it picked/)) return [P(f.spot === 'pending' ? 'It passed every check and went ahead on its own; it was picked at random for this week\'s spot-check, so a person rates it.' : 'It is not a spot-check.')];
  if (is(/rejected before|manager (say|said|want)|sent back|what did .* say/)) {
    const h = f.history.filter(x => /reject|sent back|send back/i.test(x.decision));
    return [h.length ? { t: 'list', items: h.slice(0, 5).map(x => `${x.decision} · ${x.who}${x.note ? `: ${x.note}` : ''}`) } : P('Nobody has rejected it or sent it back.')];
  }
  if (is(/sensitiv|incident|security|cyber|which (word|part|bit)|what.*(flag|highlight)/)) {
    return f.sensitiveLines.length ? [P('Lines that mention a sensitive topic:'), { t: 'list', items: f.sensitiveLines.slice(0, 5) }, NOTE('A plant incident, security or regulation needs a person, so it never goes out on its own.')]
      : [P(f.cats.includes('sensitive') ? 'The signal behind it touches a sensitive topic, even though the message does not name it.' : 'Nothing in the message reads as sensitive.')];
  }
  if (is(/approved claim|claims? (fit|instead)|replace .*claim/)) return [f.claims.length ? { t: 'list', items: f.claims.map(c => `${c.id} · ${c.title}`) } : P('No approved claim fits this case yet. Add one in the Content library.')];
  if (is(/claim|source|unsourced|cite|citation/)) return [P(f.claimsTotal ? `${f.claimsTotal - f.claimsUnsupported} of ${f.claimsTotal} claims in the message have an approved source.${f.claimsUnsupported ? ' Swap the unsupported one for an approved claim, or remove it.' : ''}` : 'The message makes no product claim.')];
  if (is(/e-?mail|linkedin|phone|reach (them|him|her)|contact (detail|info)|how (do|can|should) i (reach|contact)/)) {
    return [P(`${f.who}: ${f.reach.email ? `email ${f.reach.verified ? 'verified' : 'not verified'}` : 'no email'}, ${f.reach.linkedin ? 'a LinkedIn URL' : 'no LinkedIn URL'}. The message goes by **${f.channel}**: ${f.channelWhy}`)];
  }
  if (is(/who else|other (contact|people|person)|someone else|colleague|anyone else|right person|decision maker/)) {
    return [f.people.length ? { t: 'table', head: ['Person', 'Role', 'Persona', 'Reach'], rows: f.people.slice(0, 8).map(p => [p.name, p.jobTitle, p.persona, p.reach]) } : P(`Nobody else at ${f.account.name} is in the list.`)];
  }
  if (is(/\bfix|correct|resolve|clear (it|this)|what (do|should) i (need to )?do|next step|how do i get/)) {
    if (f.cats[0] === 'fixed') return [P('Everything that held it back is fixed. Approve it to release it, or reject it.')];
    return [P('Here is what to do, in order:'), { t: 'list', ordered: true, items: f.cats.map(c => `**${REASON_CATS[c] || c}**: ${HOW[c] || 'Approve, change or reject it.'}`) }];
  }
  if (is(/confiden|how sure|certain|why (low|medium|high)/)) {
    const w = f.signalWeight;
    return [P(`Confidence is **${f.confidence.level}**. It is worked out from four things:`), { t: 'checks', checks: [
      { name: f.claimsTotal ? `${f.claimsTotal - f.claimsUnsupported} of ${f.claimsTotal} claims have an approved source` : 'No product claims in the message', ok: !f.claimsUnsupported },
      { name: f.flags.length ? `${pl(f.flags.length, 'brand or rule flag')} open` : 'No brand or rule flags', ok: !f.flags.length },
      { name: `${w >= 60 ? 'Strong' : w >= 30 ? 'Moderate' : 'Weak'} signal (weight ${Math.round(w)})`, ok: w >= 30 },
      { name: f.primaryPersona ? 'Someone in the primary persona' : `No one in the primary persona at ${f.account.name}`, ok: f.primaryPersona }] }];
  }
  if (is(/deal|size|worth|revenue|budget|money|value/)) {
    return [P(f.deal ? `Estimated deal size: about **USD ${Math.round(f.deal.value / 1000)}k** (threshold ${Math.round(f.dealThreshold / 1000)}k; basis: ${f.deal.basis}).${f.deal.below ? ' It is below the deal-size threshold, so a person decides whether it is worth it.' : ''}` : 'There is not enough company data to estimate the deal size.')];
  }
  if (is(/runner|differ|alternative|compare|other option|second option/)) {
    const A = f.options.recommended, B = f.options.runnerUp;
    if (!B) return [P('There is no runner-up for this one.')];
    const diff: string[] = [];
    if (A.channel !== B.channel) diff.push(`the channel changes from ${A.channel} to ${B.channel}`);
    if (A.conf !== B.conf) diff.push(`confidence goes from ${A.conf} to ${B.conf}`);
    if (A.proof !== B.proof) diff.push(B.proof ? `it cites "${B.proof}"` : 'it has no approved proof');
    if (A.ok !== B.ok) diff.push(B.ok ? 'it passes every check' : `it fails ${B.flags.join(', ')}`);
    return [P(`Switching to **${B.action}**: ${diff.length ? diff.join('; ') : 'same channel, confidence and checks; only the action and the message change'}.`), NOTE(`Why the runner-up: ${B.reason}`)];
  }
  if (is(/similar|track record|agree|how did|past|worked before/)) {
    const s = f.track.segment;
    return [P(s && s.n ? `In ${f.segment || 'items with no micro-segment'}, reps accepted the first recommendation **${s.a} of ${s.n}** times (${s.pct}%)${s.early ? '; early days, so read it as a hint' : ''}.` : `No decisions yet in ${f.segment || 'this group'}.`),
      P(Object.keys(f.outcomes).length ? `Outcomes marked so far: ${Object.entries(f.outcomes).map(([k, n]) => `${k} ${n}`).join(' · ')}.` : 'No outcomes marked in this group yet.')];
  }
  if (is(/signal|why now|when did|trigger|event|happened at/)) {
    return [P(`Why now: ${f.whyNow}`), ...(f.signals.length ? [{ t: 'table' as const, head: ['Signal', 'Date', 'What happened', 'Source'], rows: f.signals.slice(0, 6).map(s => [s.type, s.date, s.detail, s.source]) }] : [])];
  }
  if (is(/brief|proof|angle|objection|case study|pitch/)) {
    return [{ t: 'list', items: [`**Angle**: ${f.brief.angle}`, `**Proof**: ${f.brief.proof || 'none approved'}`, `**Objection to expect**: ${f.brief.objection}`, `**The ask**: ${f.brief.ask}`] }];
  }
  if (is(/history|log|version|changed|who (did|edited|touched)/)) return [f.history.length ? { t: 'list', items: f.history.slice(0, 8).map(x => `${x.decision} · ${x.who}${x.note ? `: ${x.note}` : ''}`) } : P('Nothing has happened to it yet.')];
  if (is(/reject|say no|decline/)) return [P('Rejecting asks you for a reason, and the reason decides what comes back:'), { t: 'list', items: REJECT.slice(0, 8).map(([, l, o]) => `**${l}**: ${o}`) }];
  if (is(/approve|accept|what happens|send it|release/)) {
    return [P(`Approving releases the message to ${f.owner || 'the owner'} to send from their own mailbox or LinkedIn${f.cats.includes('sensitive') ? '; because it is sensitive, the sales manager approves it first' : ''}. Nothing is sent by DemandAI.`)];
  }
  if (is(/\bdue|deadline|by when|how long|urgent/)) return [P(`It is ${f.dueText ? mid(f.dueText) : 'not waiting for anyone'}. The deadline comes from why it is here: the most urgent reason sets it.`)];
  if (is(/owner|whose|assigned|which rep|who owns/)) return [P(`It belongs to **${f.owner || 'nobody yet'}**.${f.manager ? ' You can reassign it from the item.' : ''}`)];
  if (is(/message|draft|subject|wording|summar|what does it say|email say/)) {
    return [{ t: 'table', head: ['', ''], rows: [['Channel', f.channel], ...(f.subject ? [['Subject', f.subject]] : []), ['Length', `${f.words} words`], ['Opens with', f.opening], ['Written by', f.aiDraft ? 'AI, then the same checks' : 'the rules']] }];
  }
  if (is(/account|company|about (them|this|the account)|who (is|are) they|industry|customer|employees|country/)) {
    return [P(`**${f.account.name}** · ${f.account.vertical} · ${f.account.existingCustomer ? 'existing customer' : 'net-new'}${f.account.country ? ` · ${f.account.country}` : ''}${f.tier ? ` · tier ${f.tier}` : ''}${f.deal ? ` · deal about USD ${Math.round(f.deal.value / 1000)}k` : ''}`),
      ...(f.signals.length ? [{ t: 'table' as const, head: ['Signal', 'Date', 'What happened'], rows: f.signals.slice(0, 6).map(s => [s.type, s.date, s.detail]) }] : [])];
  }
  if (is(/why|reason|here|need me|stuck|problem|wrong|issue/)) {
    return [P(f.spot === 'pending' ? 'It passed every check and went ahead on its own; it was picked at random for this week\'s spot-check.'
      : f.status === 'Awaiting approval' ? 'The draft has sensitive content, so it waits for the sales manager\'s approval before anything goes out.'
      : f.reasons.length ? `The system couldn't decide it alone: ${f.reasons.join('; ')}.` : `It is ${f.status.toLowerCase()}.`), { t: 'checks', checks: f.fourChecks }, NOTE(`Why now: ${f.whyNow}`)];
  }
  return null;
}

/* ─── A build of micro-segments (NBA) ─── */

export type NbaFacts = { name: string; segments: { name: string; accounts: number }[]; recs: { id: string; who: string; account: string; segment: string; action: string; status: string; released: string | null; outcome: string | null }[] };
export function nbaAnswer(f: NbaFacts, text: string, queue: QueueFacts | null): CopilotBlock[] | null {
  const t = text.toLowerCase();
  const seg = f.segments.find(s => t.includes(s.name.toLowerCase()))?.name ?? (/moderni[sz]ation/.test(t) ? 'Modernisation' : null);
  if (/segment|summar|overview|accounts in/.test(t) || seg) {
    if (seg) {
      const xs = f.recs.filter(x => x.segment === seg);
      return [P(`**${seg}**: ${pl(new Set(xs.map(x => x.account)).size, 'account')}. ${SEG_MEANS[seg] || ''}`.trim()),
        { t: 'table', head: ['Prospect', 'Action', 'Status'], rows: xs.slice(0, 10).map(x => [`${x.who} · ${x.account}`, x.action, x.status]) }];
    }
    if (!f.segments.length) return [P('No micro-segments were formed in this build.')];
    return [P(`${pl(f.segments.length, 'micro-segment')} in ${f.name}:`), { t: 'table', head: ['Micro-segment', 'Accounts', 'Ready', 'Waiting', 'Meetings'], rows: f.segments.map(s => {
      const xs = f.recs.filter(x => x.segment === s.name);
      return [s.name, String(s.accounts), String(xs.filter(x => x.status === 'Released').length), String(xs.filter(x => x.status === 'Waiting' || x.status === 'Awaiting approval').length), String(xs.filter(x => x.outcome === 'Meeting booked').length)];
    }) }, NOTE('Ask about one, for example "show the accounts in Modernisation".')];
  }
  return queue ? queueAnswer(queue, text) : null;
}

/* ─── People listed more than once (Prospecting, Scoring) ─── */

/** A person in a list or run, with what tells two people of the same name apart. */
export type Person = { id: string; who: string; row: number; title: string; account: string; reach: string; tier?: string; score?: number | null };
/** A duplicates finding: `row` repeats `of`; merged into it, or kept as a possible duplicate for a person to decide. */
export type Dupe = { row: number; of: number; possible: boolean; outcome: string };

const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whether the text names this person: the whole name, or the first name ("Ivan", "Ivans", "Ivan's"). */
export function names(text: string, who: string): boolean {
  const full = nameKey(who), first = full.split(' ')[0];
  if (!full) return false;
  const re = (n: string) => new RegExp(`(^|[^\\p{L}])${esc(n)}(?:'?s)?(?![\\p{L}])`, 'iu');
  return re(full).test(text) || (first.length > 2 && first !== full && re(first).test(text));
}
/** The people who share a name, two or more to a group, the largest group first. */
export function sameName(people: Person[]): Person[][] {
  const by = new Map<string, Person[]>();
  for (const p of people) { const k = nameKey(p.who); if (k && k !== '(no name)') by.set(k, [...(by.get(k) ?? []), p]); }
  return [...by.values()].filter(g => g.length > 1).map(g => g.slice().sort((a, b) => a.row - b.row)).sort((a, b) => b.length - a.length || a[0].row - b[0].row);
}
const TWINS = /\btwo\b|\btwice\b|\bboth\b|duplicat|same (name|person|people|contact|guy)|different (people|persons?|contacts?|prospects?)|more than once|\brepeat/;

/** Two or more prospects with the same name: who each one is, and whether the file's checks think they are one person. */
export function twinsAnswer(people: Person[], dupes: Dupe[], text: string, focus?: string): CopilotBlock[] | null {
  const t = text.toLowerCase();
  const groups = sameName(people);
  const plural = groups.filter(g => new RegExp(`(^|[^\\p{L}])${esc(nameKey(g[0].who).split(' ')[0])}s(?![\\p{L}])`, 'iu').test(text));
  let hit = plural.length ? plural : TWINS.test(t) ? groups.filter(g => names(text, g[0].who)) : [];
  if (!hit.length && focus && TWINS.test(t)) hit = groups.filter(g => g.some(p => p.id === focus));
  const general = /same name|listed (twice|more than once)|\btwice\b|duplicate (people|prospects|contacts|names)|(people|prospects|contacts) .*(twice|more than once)/.test(t);
  if (!hit.length && general) hit = groups;
  if (!hit.length) return general ? [P('Nobody is listed twice under the same name.')] : null;
  const out: CopilotBlock[] = [];
  for (const g of hit.slice(0, 3)) {
    const accs = [...new Set(g.map(p => p.account))], rows = new Set(g.map(p => p.row));
    out.push(P(`**${g.length} prospects are called ${g[0].who}**${accs.length === 1 ? `, ${g.length === 2 ? 'both' : 'all'} at ${accs[0]}` : ''}. Each is its own row in the file, so each is ${g[0].tier !== undefined ? 'scored' : 'checked'} on its own:`));
    out.push({ t: 'table', head: ['Row', 'Title', 'Reach', ...(g[0].tier !== undefined ? ['Tier · score'] : [])],
      rows: g.map(p => [String(p.row), p.title || 'no title', p.reach, ...(p.tier !== undefined ? [`${p.tier} · ${p.score ?? '—'}`] : [])]) });
    const link = dupes.filter(d => rows.has(d.row) && rows.has(d.of));
    const possible = link.filter(d => d.possible);
    if (possible.length) {
      out.push(P(possible.map(d => `Row ${d.row} is flagged as a **possible duplicate** of row ${d.of}: same name and company, but not the same email or LinkedIn URL, so it was ${mid(d.outcome)}.`).join(' ')));
      out.push(NOTE(`If it is the same person, open row ${possible[0].row} in Prospecting and take them out of the list (or give both rows the same email), then score the list again, so they are contacted once.`));
    } else if (link.length) {
      out.push(P(link.map(d => `Row ${d.row} repeats row ${d.of} (same email or LinkedIn URL): ${mid(d.outcome)}.`).join(' ')));
    } else {
      out.push(P('Prospecting did not flag them as duplicates: they share no email or LinkedIn URL, so DemandAI keeps them as different people.'));
    }
  }
  if (hit.length > 3) out.push(NOTE(`and ${pl(hit.length - 3, 'more name')} shared by two or more prospects.`));
  return out;
}

/* ─── A lead list (Prospecting) ─── */

/** One check over the rows the caller can see: findings by severity, the rows with any, and the rows it holds back
 *  (a stop or flag finding: what % clean counts). */
export type ListCheck = { key: string; name: string; why: string; fix: string; findings: number; stop: number; flag: number; info: number; rows: number[]; badRows: number[] };
export type ListFacts = {
  fileName: string; rowsRead: number; clean: number | null; unclean: number | null; own: boolean; accounts: number; accountsPass: number; contacts: number; inFinalList: number;
  checks: ListCheck[];
  /** The stop and flag findings on rows, in file order, people's names beside the rows they mention. */
  bad: { row: number; check: string; text: string }[];
  /** For information only: how many, and the most common kinds. */
  info: { n: number; kinds: [string, number][] };
  /** The person on each row (a merged repeat's: the person it went into), and a merged repeat's row → that person's. */
  rowNames: Record<string, string>; mergedInto: Record<string, number>;
  excluded: { name: string; reason: string }[]; unreachable: { name: string; company: string; row: number }[]; duplicates: { row: number; issue: string }[];
  personas: Record<string, number>; accountsByName: { name: string; vertical: string; country: string; excluded: string; contacts: { name: string; title: string; reach: string }[] }[];
  people: Person[]; dupes: Dupe[];
};

/** "Grace Teh (row 3)", or "row 3" when the row has no person the caller can see. */
const rowOf = (f: Pick<ListFacts, 'rowNames'>, r: number) => (f.rowNames[r] ? `${f.rowNames[r]} (row ${r})` : `row ${r}`);
const rowsOf2 = (f: Pick<ListFacts, 'rowNames'>, rows: number[], max = 4) => {
  const s = rows.slice().sort((a, b) => a - b);
  return s.slice(0, max).map(r => rowOf(f, r)).join(', ') + (s.length > max ? ` and ${s.length - max} more` : '');
};
const NOT_WORDS = new Set(['the', 'list', 'file', 'this', 'that', 'what', 'which', 'with', 'from', 'about', 'group', 'company', 'global', 'international', 'industries', 'industrial']);
/** The account a question is about: its whole name, or a distinctive first word of it. */
function accountIn<A extends { name: string }>(accs: A[], t: string): A | undefined {
  const word = (w: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, 'iu').test(t);
  return accs.find(a => a.name.length > 3 && word(a.name.toLowerCase())) ?? accs.find(a => { const w = a.name.toLowerCase().split(/\s+/)[0]; return w.length > 3 && !NOT_WORDS.has(w) && word(w); });
}

function cleanLine(f: ListFacts): string {
  if (f.clean === null) return '';
  const u = f.unclean ?? 0, ok = Math.max(0, f.rowsRead - u);
  return `**${f.clean}%** of the ${f.rowsRead} rows are clean: ${pl(ok, 'row has', 'rows have')} no finding that stops or flags ${ok === 1 ? 'it' : 'them'}, and ${pl(u, 'row has', 'rows have')} at least one.`;
}
const infoNote = (f: ListFacts) => f.info.n ? [NOTE(`${pl(f.info.n, 'finding is', 'findings are')} for information only (${f.info.kinds.slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ')}): ${f.info.n === 1 ? 'it doesn\'t' : 'they don\'t'} count against % clean.`)] : [];
const ownNote = (f: ListFacts) => f.own ? [NOTE('You see the findings on your own rows; % clean counts the whole file.')] : [];

/** Checks that hold rows back, the most rows first (a stop before a flag). */
const ranked = (f: ListFacts) => f.checks.filter(c => c.badRows.length).sort((a, b) => (b.stop ? 1 : 0) - (a.stop ? 1 : 0) || b.badRows.length - a.badRows.length || b.findings - a.findings);

function biggest(f: ListFacts, max = 5): CopilotBlock[] {
  const r = ranked(f);
  if (!r.length) return [P(f.checks.some(c => c.findings) ? 'Nothing holds a row back: every finding is for information only.' : 'Every check passed: there are no issues in this file.'), ...infoNote(f)];
  return [P(`The biggest issues in ${f.fileName}, by how many rows they hold back:`),
    { t: 'list', ordered: true, items: r.slice(0, max).map(c => `**${c.name}**: ${pl(c.badRows.length, 'row')}${c.stop ? ` (${c.stop} stop the row)` : ''}, ${rowsOf2(f, c.badRows, 3)}. ${c.why} Fix: ${c.fix}`) },
    ...infoNote(f), ...ownNote(f)];
}

function whyClean(f: ListFacts): CopilotBlock[] {
  const byRow = new Map<number, string[]>();
  for (const b of f.bad) byRow.set(b.row, [...(byRow.get(b.row) ?? []), b.text.length > 140 ? b.text.slice(0, 137) + '…' : b.text]);
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  return [P(cleanLine(f) || 'This list was saved before % clean was kept with it.'),
    ...(rows.length ? [P(rows.length === 1 ? 'The row held back, and why:' : `The rows held back, and why${rows.length > 8 ? ' (the first 8)' : ''}:`),
      { t: 'list' as const, items: rows.slice(0, 8).map(r => `**${rowOf(f, r)}**: ${[...new Set(byRow.get(r))].join('; ')}`) }] : []),
    ...infoNote(f), ...ownNote(f)];
}

export function listAnswer(f: ListFacts, text: string): CopilotBlock[] | null {
  const t = text.toLowerCase(), found = f.checks.filter(c => c.findings);
  const twins = twinsAnswer(f.people, f.dupes, text);
  if (twins) return twins;
  const acc = accountIn(f.accountsByName, t);
  if (acc) return [P(`**${acc.name}**: ${acc.vertical}${acc.country ? `, ${acc.country}` : ''}. ${acc.excluded ? `Excluded: ${acc.excluded}.` : 'Passes the knock-outs.'}`), { t: 'list', items: acc.contacts.map(c => `${c.name}, ${c.title || 'no title'} · ${c.reach}`) }];
  if (/next (time|upload|file)|cleaner|better (file|list|data)|template|avoid|prevent/.test(t)) return found.length ? [P('For the next upload, fix these at the source:'), { t: 'list', items: [...ranked(f), ...found.filter(c => !c.badRows.length)].map(c => `**${c.name}**: ${c.fix}`) }] : [P('This file is clean. Keep using the lead template as it is.')];
  const big = /biggest|major|\bmain\b|\btop\b|worst|most (common|important|serious|frequent)|key (issue|problem|gap)|\bgaps?\b|priorit|focus on|fix first/.test(t);
  if (/\bclean\b|%|percent|dq score|quality score/.test(t) && /\bwhy\b|\bonly\b|\blow\b|how (is|was|are|do|does)|calculat|\bmean|worked out|\bso\b/.test(t)) {
    const why = whyClean(f);
    return big && ranked(f).length ? [...why.filter(b => b.t !== 'note'), ...biggest(f, 3)] : why;
  }
  if (big) return biggest(f);
  if (/wrong|issue|problem|quality|\bclean\b|check|finding|error/.test(t)) {
    const r = ranked(f), infoOnly = found.filter(c => !c.badRows.length);
    return [P(found.length ? cleanLine(f) || `${pl(found.reduce((n, c) => n + c.findings, 0), 'finding')} in ${pl(found.length, 'check')}.` : 'Every check passed.'),
      ...(r.length ? [{ t: 'list' as const, items: r.map(c => `**${c.name}**: ${pl(c.badRows.length, 'row')} held back, ${rowsOf2(f, c.badRows)}`) }] : []),
      ...(infoOnly.length ? [NOTE(`For information only, not counted against % clean: ${infoOnly.map(c => `${c.name} ${c.findings}`).join(' · ')}.`)] : []),
      ...(found.length ? [NOTE('Click a check above the list to see every finding and how to fix it.')] : [])];
  }
  if (/reach|no email|linkedin|channel|contact them/.test(t)) {
    return f.unreachable.length ? [P(`${pl(f.unreachable.length, 'contact')} in the list can't be reached by email or LinkedIn:`), { t: 'list', items: f.unreachable.slice(0, 12).map(c => `${c.name} · ${c.company} (row ${c.row})`) },
      ...(f.unreachable.length > 12 ? [NOTE(`and ${f.unreachable.length - 12} more.`)] : []), NOTE('Add a verified email or a LinkedIn URL; contacts are kept on the account until then.')] : [P('Every contact can be reached by a verified email or LinkedIn.')];
  }
  if (/exclud|knock|drop|removed|out of/.test(t)) return f.excluded.length ? [P(`${pl(f.excluded.length, 'account')} excluded by the knock-out rules:`), { t: 'list', items: f.excluded.slice(0, 12).map(a => `**${a.name}**: ${a.reason}`) }, ...(f.excluded.length > 12 ? [NOTE(`and ${f.excluded.length - 12} more.`)] : [])] : [P('No account was excluded.')];
  if (/duplicate|twice|same person/.test(t)) return f.duplicates.length ? [P(`${pl(f.duplicates.length, 'duplicate')} found:`), { t: 'list', items: f.duplicates.slice(0, 12).map(d => `**${rowOf(f, d.row)}**: ${d.issue}`) }] : [P('No duplicates.')];
  if (/how many|summary|overview|total|final list/.test(t)) return [P(`${f.rowsRead} rows read. ${f.accountsPass} of ${f.accounts} accounts pass the knock-outs; **${f.inFinalList}** of ${f.contacts} contacts are in the final list.`)];
  if (/persona|primary|role|title/.test(t)) return [{ t: 'table', head: ['Persona', 'Contacts'], rows: Object.entries(f.personas).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, String(n)]) }];
  return null;
}

/* ─── A scoring run, and one prospect in it (Account Scoring) ─── */

export type ScoringFacts = { name: string; tiers: Record<string, number>; top: { id: string; who: string; row: number; account: string; tier: string; score: number | null; whyNow: string }[];
  unused: { code: string; reason: string; n: number }[]; weights: { type: string; full: number }[]; prospects: number; people: Person[]; dupes: Dupe[] };
export function scoringAnswer(f: ScoringFacts, text: string, focus?: string): CopilotBlock[] | null {
  const t = text.toLowerCase();
  const twins = twinsAnswer(f.people, f.dupes, text, focus);
  if (twins) return twins;
  const label = (x: { who: string; row: number; account: string }) => `${x.who}${f.people.filter(p => nameKey(p.who) === nameKey(x.who)).length > 1 ? ` (row ${x.row})` : ''} · ${x.account}`;
  if (/\btiers?\b|\bhow many\b|\bsummary\b|\boverview\b|\bcount\b/.test(t)) return [P(`${f.prospects} prospects in ${f.name}:`), { t: 'table', head: ['Tier', 'Prospects'], rows: Object.entries(f.tiers).map(([k, n]) => [k, String(n)]) }];
  if (/top|best|highest|first|priority/.test(t)) return [P('The highest-scoring prospects:'), { t: 'table', head: ['Prospect', 'Tier', 'Score', 'Why now'], rows: f.top.slice(0, 10).map(x => [label(x), x.tier, x.score === null ? '—' : String(x.score), x.whyNow]) }];
  if (/unused|not used|reject|weren'?t used|ignored|why .*rows/.test(t)) return f.unused.length ? [P('Signal rows that did not count, by reason:'), { t: 'table', head: ['Code', 'Why', 'Rows'], rows: f.unused.map(u => [u.code, u.reason, String(u.n)]) }] : [P('Every signal row counted.')];
  if (/weight|count most|strong|which signals|signal types/.test(t)) return [P('What each signal type is worth when fresh (it fades with age):'), { t: 'table', head: ['Signal', 'Points'], rows: f.weights.slice().sort((a, b) => b.full - a.full).map(w => [w.type, String(w.full)]) }];
  return null;
}

export type ProspectFacts = { id: string; who: string; row: number; title: string; account: string; tier: string; score: number | null; fit: number | null; timing: number | null;
  fitWhy: string[]; whyNow: string; whyNowAi: string | null; signals: { type: string; date: string; detail: string; weight: number }[]; next: string | null };
export function prospectAnswer(f: ProspectFacts, text: string): CopilotBlock[] | null {
  const t = text.toLowerCase();
  if (/move|next tier|tier a|up a tier|improve|higher/.test(t)) return [P(f.next ?? `${f.who} is already in the top tier.`)];
  if (/why now/.test(t)) return [P(f.whyNowAi ?? f.whyNow ?? 'No live signal for this person.'), ...(f.whyNowAi ? [NOTE('Worded with AI from the signal rows; the rules\' line is in the prospect panel.')] : [])];
  if (/signal|which .*used|evidence/.test(t)) return f.signals.length ? [{ t: 'table', head: ['Signal', 'Date', 'What happened', 'Points'], rows: f.signals.map(s => [s.type, s.date, s.detail, String(Math.round(s.weight * 10) / 10)]) }] : [P('No live signal for this person.')];
  if (/why|score|fit|how .*(made|worked)|rank/.test(t)) {
    return [P(`**${f.who}** (row ${f.row}, ${f.title || 'no title'}) at ${f.account}: score ${f.score ?? '—'} (tier ${f.tier}) = company fit ${f.fit ?? '—'} × timing ${f.timing ?? '—'} ÷ 100.`), ...(f.fitWhy.length ? [{ t: 'list' as const, items: f.fitWhy }] : [])];
  }
  return null;
}
