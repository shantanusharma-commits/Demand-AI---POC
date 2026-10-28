// Copilot's rule answers (G-013; legacy demandai-copilot.js, 14-review.html, 10-prospecting.html, 11-scoring.html):
// the common questions answered exactly and at once from the data on the screen, before any model is asked. Pure
// functions over the facts the server loads for the caller (owner-scoped as everywhere). A question these don't
// match returns null and may go to the model. Copilot reads; people decide: nothing here changes data, and a request
// to approve goes to an Autopilot plan the person confirms.
import { REASON_CATS, REJECT, SEG_MEANS, SENSITIVE_RE } from '../engine/review.ts';
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

/* Answers a rep reads at a glance: whole sentences in plain words, what a term means the first time it comes up, and the
   button to press. Testers found "Below deal size: Decide whether it is worth it anyway" and "net-new · tier B" hard
   to act on (28 Oct 2026). */
const usd = (n: number) => `USD ${Math.round(n / 1000)}k`;
const firstOf = (who: string) => who.split(' ')[0] || who;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const quoted = (xs: string[]) => xs.map(x => `"${x}"`).join(', ');
const dateOf = (d: string) => { const t = Date.parse(d); return Number.isNaN(t) ? d : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
export const TIER_MEANS: Record<string, string> = { A: 'top priority: a strong fit with a recent signal', B: 'second priority: a good fit with a signal', C: 'lower priority: a weaker fit or an older signal',
  'Watch list': 'a good fit with no recent signal yet' };
/** Who a micro-segment's prospects are, to finish "prospects …". */
const SEG_WHO: Record<string, string> = { Inquiry: 'who asked a question or for a quote', Modernisation: 'whose installed system is nearing end of support',
  'Service renewal': 'whose service contract is coming up for renewal', Project: 'with a capital project under way', Leadership: 'with a new leader in a buying role',
  Engagement: 'who engaged with our content or events' };
/** The engine's reason for an option, in plain words. */
export function optionWhy(reason: string): string {
  const lib = reason.match(/^Second option in the (.+) library$/);
  if (lib) return `it is the system's second choice for prospects ${SEG_WHO[lib[1]] || `in ${lib[1]}`}`;
  if (/^Second option for its strongest signal$/.test(reason)) return "it is the system's second choice for this prospect's strongest signal";
  return lower(String(reason || 'it is the other option').replace(/^[^:]{3,40}:\s*/, ''));
}
const sensitiveWords = (lines: string[]) => [...new Set(lines.flatMap(l => l.match(new RegExp(SENSITIVE_RE.source, 'gi')) ?? []).map(w => w.toLowerCase()))];
const SIGNAL_SAYS: Record<string, string> = { 'Inquiry or RFQ': 'they sent an inquiry', 'Installed system near end of support': 'their installed system is nearing end of support',
  'Service contract renewal': 'their service contract is coming up for renewal', 'Capital project': 'a capital project was announced', 'Leadership change': 'a new leader took up the role',
  'Webinar attended': 'they attended a webinar', 'Webinar registered': 'they registered for a webinar', 'Content download': 'they downloaded our content', 'Email clicked': 'they clicked a link in our email' };
/** Why the signal makes it timely, as a sentence: "What made it timely: they attended a webinar on 17 Oct 2026: Cybersecurity …". */
function whyNowLine(f: ItemFacts): string {
  const s = f.signals.find(x => f.whyNow.includes(x.type)) ?? f.signals[0];
  if (!s) return `What made it timely: ${f.whyNow}.`;
  return `What made it timely: ${SIGNAL_SAYS[s.type] || lower(s.type)}${s.date ? ` on ${dateOf(s.date)}` : ''}${s.detail ? `: ${s.detail.replace(/\.$/, '')}` : ''}.`;
}

/** For each reason an item needs a person: what is wrong, in plain words, and what to do about it on the screen. */
function reasonOf(f: ItemFacts, c: string): { what: string; todo: string } {
  const first = firstOf(f.who), words = sensitiveWords(f.sensitiveLines);
  switch (c) {
    case 'sensitive': return { what: `The message mentions ${words.length ? quoted(words) : 'a sensitive topic'}. A plant incident, security or regulation always needs a person's judgement.`,
      todo: `Read the red highlights in the message and keep, edit or remove them ("Remove that sentence" takes the whole sentence out). ${f.manager ? 'Then approve it.' : 'The sales manager still approves it before it goes out.'}` };
    case 'claim': return { what: 'A sentence reads like a product claim, but it is not one of the approved claims in the Content library.',
      todo: 'Under "How to fix it", pick "Replace with an approved claim", or click "Remove it".' };
    case 'low': return { what: `Nobody at ${f.account.name} is in the primary persona (the roles the system contacts first). ${first} is ${f.title || 'in another role'}.`,
      todo: `If ${first} is still the right person, click "Yes, ${first} is the right person". If not, switch to someone else listed there.` };
    case 'reach': return { what: `There is no verified email and no LinkedIn URL for ${f.who}.`, todo: 'Add one in Prospecting (it is kept when the list is rebuilt), and put this item on hold until then.' };
    case 'small': return { what: 'The system could not put it in a micro-segment: fewer than 3 accounts share its kind of signal.',
      todo: 'Under "How to fix it", pick a micro-segment from the list, or create a new one.' };
    case 'deal': return { what: f.deal ? `The first deal is estimated at about ${usd(f.deal.value)}, below the ${usd(f.dealThreshold)} threshold.` : 'The deal looks below the size threshold.',
      todo: `If ${f.account.name} is worth contacting anyway, click "It's worth it anyway". If not, reject it.` };
    case 'brand': { const rules = f.flags.filter(x => x !== 'Sensitive term').map(x => x.toLowerCase());
      return { what: `The message breaks a brand rule${rules.length ? `: ${rules.join(', ')}` : ''}.`, todo: 'Edit the highlighted words in the message.' }; }
    case 'spot': return { what: 'It passed every check and went ahead on its own. It was picked at random for this week\'s spot-check.', todo: 'Approve it if you would have sent it; reject it if not.' };
    case 'alternative': return { what: 'You rejected the first suggestion, so this is the one alternative.', todo: 'Approve it if it fits. Rejecting it closes the account for the pilot.' };
    case 'sentback': { const n = f.history.find(h => /sent back/i.test(h.decision))?.note;
      return { what: `The sales manager sent it back${n ? `: "${n}"` : ''}.`, todo: 'Make that change in the message, then approve it again.' }; }
    case 'intervention': return { what: 'You stepped in after it went ahead on its own.', todo: 'Edit it, or reject it.' };
    default: return { what: 'The system could not decide it on its own.', todo: 'Approve it, change it, or reject it.' };
  }
}

export function itemAnswer(f: ItemFacts, text: string): CopilotBlock[] | null {
  const t = text.toLowerCase();
  const is = (re: RegExp) => re.test(t);
  const first = firstOf(f.who);
  if (is(/spot.?check|why was it picked/)) return [P(f.spot === 'pending' ? 'It passed every check and went ahead on its own. It was picked at random for this week\'s spot-check, so a person rates it: approve it if you would have sent it, reject it if not.' : 'It is not a spot-check.')];
  if (is(/rejected before|manager (say|said|want)|sent back|what did .* say/)) {
    const h = f.history.filter(x => /reject|sent back|send back/i.test(x.decision));
    return [h.length ? { t: 'list', items: h.slice(0, 5).map(x => `${x.decision}, by ${x.who}${x.note ? `: "${x.note}"` : ''}`) } : P('Nobody has rejected it or sent it back.')];
  }
  if (is(/sensitiv|incident|security|cyber|which (word|part|bit)|what.*(flag|highlight)/)) {
    const words = sensitiveWords(f.sensitiveLines);
    return f.sensitiveLines.length ? [P(`The message mentions ${quoted(words)}, which counts as a sensitive topic. These sentences have it:`), { t: 'list', items: f.sensitiveLines.slice(0, 5) },
      NOTE('A plant incident, security or regulation always needs a person, so it never goes out on its own. Edit or remove the red highlights, or keep them; the sales manager approves it before it goes out.')]
      : [P(f.cats.includes('sensitive') ? 'The message no longer has a sensitive word in it. It still waits for the sales manager, who approves it before it goes out.' : 'Nothing in the message reads as sensitive.')];
  }
  if (is(/approved claim|claims? (fit|instead)|replace .*claim/)) return [f.claims.length ? P('These approved claims fit this case. Pick one under "How to fix it" to put it in word for word:') : P('No approved claim fits this case yet. Marketing can add one in the Content library.'),
    ...(f.claims.length ? [{ t: 'list' as const, items: f.claims.map(c => `${c.title} (${c.id})`) }] : [])];
  if (is(/claim|source|unsourced|cite|citation/)) return [P(f.claimsTotal ? `${f.claimsTotal - f.claimsUnsupported} of the ${pl(f.claimsTotal, 'claim')} in the message ${f.claimsTotal === 1 ? 'is' : 'are'} approved, word for word.${f.claimsUnsupported ? ' Replace the other with an approved claim, or remove it.' : ''}` : 'The message makes no product claim.')];
  if (is(/e-?mail|linkedin|phone|reach (them|him|her)|contact (detail|info)|how (do|can|should) i (reach|contact)/)) {
    const has = [f.reach.email ? `an email address${f.reach.verified ? ' that is verified' : ' that is not verified yet'}` : 'no email address', f.reach.linkedin ? 'a LinkedIn URL' : 'no LinkedIn URL'];
    return [P(`For ${f.who} we have ${has.join(' and ')}. The message goes by **${f.channel}**: ${lower(f.channelWhy)}`)];
  }
  if (is(/who else|other (contact|people|person)|someone else|colleague|anyone else|right person|decision maker/)) {
    return [f.people.length ? P(`Other people at ${f.account.name} in the list:`) : P(`Nobody else at ${f.account.name} is in the list.`),
      ...(f.people.length ? [{ t: 'table' as const, head: ['Person', 'Role', 'Persona', 'Reach'], rows: f.people.slice(0, 8).map(p => [p.name, p.jobTitle, p.persona, p.reach]) }] : [])];
  }
  if (is(/\bfix|correct|resolve|clear (it|this)|what (do|should) i (need to )?do|next step|how do i get/)) {
    if (f.cats[0] === 'fixed') return [P('Everything that held it back is fixed. Click **Approve** to release it, or reject it.')];
    const rs = f.cats.map(c => ({ c, ...reasonOf(f, c) }));
    return [P(rs.length === 1 ? 'One thing to sort out:' : `${rs.length} things to sort out, in this order:`),
      { t: 'list', ordered: rs.length > 1, items: rs.map(r => `**${REASON_CATS[r.c] || r.c}**: ${r.what} ${r.todo}`) },
      NOTE(f.status === 'Awaiting approval' ? 'Then click **Approve** at the bottom right, or send it back to the rep.' : 'Then click **Approve** at the bottom right. Nothing is sent by DemandAI: the owner sends it from their own mailbox or LinkedIn.')];
  }
  if (is(/confiden|how sure|certain|why (low|medium|high)/)) {
    const w = f.signalWeight;
    return [P(`Confidence is **${f.confidence.level}**. It comes from four things; each ✗ lowers it:`), { t: 'checks', checks: [
      { name: f.claimsTotal ? `${f.claimsTotal - f.claimsUnsupported} of ${f.claimsTotal} claims are approved` : 'The message makes no product claim', ok: !f.claimsUnsupported },
      { name: f.flags.length ? `${pl(f.flags.length, 'brand or rule check')} failing` : 'Every brand and rule check passes', ok: !f.flags.length },
      { name: `The signal is ${w >= 60 ? 'strong' : w >= 30 ? 'moderate' : 'weak'}`, ok: w >= 30 },
      { name: f.primaryPersona ? `${first} is in the primary persona (the roles the system contacts first)` : `Nobody at ${f.account.name} is in the primary persona`, ok: f.primaryPersona }] }];
  }
  if (is(/deal|size|worth|revenue|budget|money|value/)) {
    return [P(f.deal ? `The first deal with ${f.account.name} is estimated at about **${usd(f.deal.value)}** (from ${lower(f.deal.basis)}). ${f.deal.below ? `That is below the ${usd(f.dealThreshold)} threshold, so a person decides whether it is worth contacting them anyway.` : `That is above the ${usd(f.dealThreshold)} threshold.`}`
      : `There is not enough company data to estimate a deal size for ${f.account.name}.`)];
  }
  if (is(/runner|differ|alternative|compare|other option|second option/)) {
    const A = f.options.recommended, B = f.options.runnerUp;
    if (!B) return [P('There is no runner-up for this one: the system had only one suitable action.')];
    const diff: string[] = [];
    if (A.channel !== B.channel) diff.push(`it goes by ${B.channel} instead of ${A.channel}`);
    if (A.conf !== B.conf) diff.push(`confidence goes from ${A.conf} to ${B.conf}`);
    if (A.proof !== B.proof) diff.push(B.proof ? `it uses "${B.proof}" as proof` : 'it has no approved proof');
    if (A.ok !== B.ok) diff.push(B.ok ? 'it passes every check' : `it fails ${B.flags.join(', ')}`);
    return [P(`The recommended action is **${A.action}**. The runner-up is **${B.action}**: ${optionWhy(B.reason)}.`),
      P(diff.length ? `If you switch, ${diff.join('; ')}.` : `Both go by ${A.channel}, with the same confidence (${A.conf}) and the same checks. Only the action and the message change.`),
      NOTE('To switch, click "Use this →" on the runner-up card. The message is rewritten for it, and it still waits for your approval.')];
  }
  if (is(/similar|track record|agree|how did|past|worked before/)) {
    const s = f.track.segment, where = f.segment ? `in the ${f.segment} micro-segment` : 'with no micro-segment';
    return [P(s && s.n ? `For items ${where}, reps agreed with the system's first suggestion **${s.a} of ${s.n}** times (${s.pct}%).${s.early ? ' It is early days, so read it as a hint.' : ''}` : `Nobody has decided an item ${where} yet, so there is no track record.`),
      P(Object.keys(f.outcomes).length ? `What happened after they went out: ${Object.entries(f.outcomes).map(([k, n]) => `${k.toLowerCase()} ${n}`).join(', ')}.` : 'No outcomes have been marked for them yet.')];
  }
  if (is(/signal|why now|when did|trigger|event|happened at/)) {
    return [P(whyNowLine(f)), ...(f.signals.length > 1 ? [P(`Everything we know ${first} did recently:`), { t: 'table' as const, head: ['Date', 'Signal', 'Details', 'Source'], rows: f.signals.slice(0, 6).map(s => [dateOf(s.date), s.type, s.detail, s.source]) }] : [])];
  }
  if (is(/brief|proof|angle|objection|case study|pitch/)) {
    return [P('What the message is built on:'), { t: 'list', items: [`**The approach**: ${f.brief.angle}`, `**Proof**: ${f.brief.proof || 'no approved claim fits'}`, `**What they may say**: "${f.brief.objection.replace(/^"|"$/g, '')}"`, `**The ask**: ${f.brief.ask}`] }];
  }
  if (is(/history|log|version|changed|who (did|edited|touched)/)) return [f.history.length ? { t: 'list', items: f.history.slice(0, 8).map(x => `${x.decision}, by ${x.who}${x.note ? `: ${x.note}` : ''}`) } : P('Nothing has happened to it yet.')];
  if (is(/reject|say no|decline/)) return [P('Rejecting asks you for a reason, and the reason decides what comes back:'), { t: 'list', items: REJECT.slice(0, 8).map(([, l, o]) => `**${l}**: ${lower(o)}`) }];
  if (is(/approve|accept|what happens|send it|release/)) {
    return [P(`Approving releases the message to ${f.owner || 'its owner'}, who sends it from their own mailbox or LinkedIn. DemandAI sends nothing itself.${f.cats.includes('sensitive') && f.status !== 'Awaiting approval' && !f.manager ? ' Because it mentions a sensitive topic, the sales manager approves it first.' : ''}`)];
  }
  if (is(/\bdue|deadline|by when|how long|urgent/)) return [P(f.dueText ? `It is ${mid(f.dueText)}. The most urgent reason it is here sets the deadline.` : 'It is not waiting for anyone.')];
  if (is(/owner|whose|assigned|which rep|who owns/)) return [P(`It belongs to **${f.owner || 'nobody yet'}**.${f.manager ? ' You can give it to another rep from the item.' : ''}`)];
  if (is(/message|draft|subject|wording|summar|what does it say|email say/)) {
    return [{ t: 'table', head: ['', ''], rows: [['Goes by', f.channel], ...(f.subject ? [['Subject', f.subject]] : []), ['Length', `${f.words} words`], ['Opens with', f.opening], ['Written by', f.aiDraft ? 'AI, then the same checks' : 'the rules']] }];
  }
  if (is(/account|company|about (them|this|the account)|who (is|are) they|industry|customer|employees|country/)) {
    const v = String(f.account.vertical || '').trim();
    return [P(`**${f.account.name}** is ${v ? `a ${v.toLowerCase()} company` : 'a company'}${f.account.country ? ` in ${f.account.country}` : ''}, and ${f.account.existingCustomer ? 'already a customer' : 'not a customer yet'}.`
      + `${f.tier ? ` ${first} is in tier ${f.tier}${TIER_MEANS[f.tier] ? ` (${TIER_MEANS[f.tier]})` : ''}.` : ''}`
      + `${f.deal ? ` The first deal is estimated at about ${usd(f.deal.value)}${f.deal.below ? `, below the ${usd(f.dealThreshold)} threshold` : ''}.` : ''}`),
      ...(f.signals.length ? [P(`What ${first} did recently:`), { t: 'table' as const, head: ['Date', 'Signal', 'Details'], rows: f.signals.slice(0, 6).map(s => [dateOf(s.date), s.type, s.detail]) }] : [])];
  }
  if (is(/why|reason|here|need me|stuck|problem|wrong|issue/)) {
    const head = f.spot === 'pending' ? 'It passed every check and went ahead on its own. It was picked at random for this week\'s spot-check, so a person rates it.'
      : f.status === 'Awaiting approval' ? `The message mentions ${sensitiveWords(f.sensitiveLines).length ? quoted(sensitiveWords(f.sensitiveLines)) : 'a sensitive topic'}, so the sales manager approves it before anything goes out.`
      : f.cats.length && f.cats[0] !== 'fixed' ? 'The system could not decide it on its own:' : f.reasons.length ? `The system could not decide it on its own: ${f.reasons.join('; ')}.` : `It is ${f.status.toLowerCase()}.`;
    const list = f.spot !== 'pending' && f.status !== 'Awaiting approval' && f.cats.length && f.cats[0] !== 'fixed' ? [{ t: 'list' as const, items: f.cats.map(c => reasonOf(f, c).what) }] : [];
    return [P(head), ...list, { t: 'checks', checks: f.fourChecks }, NOTE(`${whyNowLine(f)} Ask "How do I fix it?" for the steps.`)];
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
