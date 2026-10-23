/* Micro-segments and next best action (spec 5.1–5.19): the port of legacy/demandai-engine.js stage 9 and the
   draft and check rules (G-053). Rules only: the brief, proof, draft, checks and confidence come from the Client's own
   signal data and the approved collateral in the brand pack; AI drafting (Phase 6) replaces the templates, the
   checks stay. Changes from the original, each deliberate:
   - the brand pack is an argument (from the Content library, Phase 5a), never read from browser storage;
   - G-007: a channel is open only to someone who passes canContact (an unconfirmed opt-out blocks both);
   - D-10 (G-051): with no approved, unexpired proof point, the action becomes a task for the account owner instead of a
     draft that goes out without proof. */
import {
  CONFIG, classify, clean, daysBetween, decayFactor, emailProblem, LINKEDIN_RE, lowerFirst, normEmail, normKey, normLinkedIn,
  parseIsoDate, parseNumber, personaOf, readTable, round1, stack, tierFor, yesNo, type CustomSignalType,
} from '../demandai-engine.ts';
import type { Confidence, Grid, Issue, Severity, SignalTypeConfig, Tier, VerticalLevel } from '../../types/demandai';

/* ─── Shapes (loose where the original was: a result can come from scoring or from a micro-segment file) ─── */
export interface NbaSignal {
  id?: string; row?: number; type: string; weight: number; detail?: string; date?: string; age?: number; source?: string;
  segment?: string; tier?: number; strength?: number; decay?: number; personName?: string; status?: string;
}
export interface NbaContact {
  row?: number; name: string; firstName?: string; lastName?: string; jobTitle?: string; persona?: string; email?: string; emailRaw?: string;
  emailVerified?: boolean; linkedin?: string; linkedinRaw?: string; consent?: string; consentOk?: boolean; optOut?: boolean; optOutUnknown?: boolean;
  takenOut?: string; owner?: string; country?: string; accountId?: string; reachableBy?: string;
}
export interface NbaAccount {
  id: string; name: string; key?: string; vertical?: string; verticalLevel?: VerticalLevel; country?: string; existingCustomer?: boolean;
  revenue?: number | string | null; employees?: number | string | null; accountType?: string; owner?: string;
}
export interface NbaPerson { contact: NbaContact; signals: NbaSignal[]; final?: number; raw?: number; score?: number; timing?: number; tier?: Tier; whyNow?: string; scoreFrom?: string }
export interface NbaResult {
  account: NbaAccount; people?: NbaPerson[]; contacts?: NbaContact[]; signalCount?: number; score?: number; tier?: Tier | string;
  confidence?: Confidence; confidenceWhy?: string;
}
export interface RunnerUp { action: string; reason: string; fromStrongest?: boolean }
export interface Rec {
  key: string; contact: NbaContact; account: NbaAccount; result: NbaResult; person: NbaPerson; segment: string | null; prominent: string;
  prominentSignal: NbaSignal; groupedOn: NbaSignal; fallback: boolean; action: string; runnerUp: RunnerUp | null; signal: NbaSignal;
  exception: string; reason: string; status: string; persona: string;
}
export interface Segmentation {
  segments: { name: string; accountIds: string[]; recs?: Rec[] }[]; recs: Rec[]; exceptions: Rec[];
  engagedOnce: { result: NbaResult; account: NbaAccount; label: string; prominent: { segment: string; signal: NbaSignal } }[];
  accountsConsidered: number;
}

const segmentOf = (sg: NbaSignal): string | undefined => sg.segment || CONFIG.signalTypes[sg.type]?.segment;

/* ─── Estimated deal size, for the proceed criteria ───
   A rough first-deal estimate: a base by how core the vertical is, scaled by company size and account type.
   Null when there's nothing to go on (no revenue and no headcount), so the rule isn't applied. */
export function estimateDealSize(account: Partial<NbaAccount>): { value: number; below: boolean; basis: string } | null {
  const d = CONFIG.dealSize, b = CONFIG.sizeBands;
  const rev = parseNumber(account.revenue ?? '').value, emp = parseNumber(account.employees ?? '').value;
  if (rev === null && emp === null) return null;
  const base = d.base[account.verticalLevel ?? 'other'] || d.base.other;
  const size = rev !== null ? (rev >= b.revenueAbove ? 1 : rev >= b.revenueIn ? 0.6 : 0.35)
    : (emp! >= b.employeesAbove ? 1 : emp! >= b.employeesIn ? 0.6 : 0.35);
  const type = (CONFIG.accountTypes[normKey(account.accountType) as keyof typeof CONFIG.accountTypes] || CONFIG.accountTypes.other).level;
  const value = Math.round(base * size * (0.4 + 0.6 * type / 100) / 1000) * 1000;
  return { value, below: value < d.threshold, basis: `${account.verticalLevel || 'other'} vertical, ${rev !== null ? 'revenue' : 'headcount'} band, ${account.accountType || 'account type unknown'}` };
}

/* ─── Micro-segments straight from a file: prospects with their signals, one row per signal ───
   For lists scored outside the platform. The score column is optional: without it, a prospect's score is their
   timing alone (signals weighted and stacked as in Scoring), since there's no fit rubric to apply. */
export const SEGMENT_COLUMNS = ['first_name', 'last_name', 'job_title', 'email', 'email_verified', 'linkedin_url', 'company_name',
  'industry', 'country', 'existing_customer', 'consent_basis', 'score', 'signal_type', 'event_date', 'detail', 'source', 'owner_email',
  'annual_revenue_usd', 'employee_count', 'account_type'];
export const SEGMENT_REQUIRED = ['first_name', 'company_name', 'signal_type', 'event_date'];

export function processScoredProspects(grid: Grid, { file = 'prospect file', sheet = 'Sheet1', asOf, off = [], custom = [] }: { file?: string; sheet?: string; asOf: string; off?: string[]; custom?: CustomSignalType[] }) {
  const table = readTable(grid, { file, sheet, columns: SEGMENT_COLUMNS, required: SEGMENT_REQUIRED, anchor: 'signal_type' });
  const issues: Issue[] = table.issues.slice();
  const at = (row: number, field: string, issue: string, outcome: string, code: Issue['code'], fix: string, severity: Severity = 'flag') =>
    issues.push({ file, sheet, row, field, issue, outcome, code, fix, severity });
  const types: Record<string, SignalTypeConfig> = { ...CONFIG.signalTypes };
  for (const c of custom) if (!types[c.name]) types[c.name] = { code: 'C', segment: c.segment, full: +c.full, zero: +c.zero, ...(CONFIG.customStrength[c.level] ?? CONFIG.customStrength.Medium) };
  const accounts = new Map<string, NbaAccount>(), people = new Map<string, { contact: NbaContact; account: NbaAccount; signals: NbaSignal[]; given: number | null }>(), seen = new Set<string>();
  let rejected = 0;
  for (const r of table.records) {
    const row = r.__row, company = clean(r.company_name), first = clean(r.first_name);
    if (!company || !first) { at(row, !company ? 'company_name' : 'first_name', 'Company or first name missing', 'Row not used', 'D3', 'Fill in both'); rejected++; continue; }
    const type = clean(r.signal_type), date = clean(r.event_date);
    const cfg = types[type];
    const bad = (field: string, issue: string, code: Issue['code'], fix: string) => { at(row, field, issue, 'Signal not used', code, fix); rejected++; };
    if (!cfg) { bad('signal_type', `Signal type "${type}" isn't on the list`, 'D3', 'Choose the type from the template list'); continue; }
    if (cfg.reject || cfg.knockout) { bad('signal_type', `"${type}" isn't used for segments`, 'D1', 'Nothing to fix'); continue; }
    if (off.includes(type)) { bad('signal_type', `${type} is switched off in Setup`, 'OFF', 'Switch it back on in Setup to use it'); continue; }
    if (parseIsoDate(date) === null) { bad('event_date', `Event date "${date}" isn't YYYY-MM-DD`, 'D3', 'Write the date as YYYY-MM-DD'); continue; }
    const age = daysBetween(date, asOf);
    if (age < 0) { bad('event_date', `Event date ${date} is after ${asOf}`, 'D3', 'Check the date'); continue; }
    if (age >= (cfg.zero as number)) { bad('event_date', `${age} days old; ${type} counts for ${cfg.zero} days`, 'D2', 'Nothing to fix: past its window'); continue; }
    const accKey = normKey(company);
    if (!accounts.has(accKey)) {
      const cls = classify(clean(r.industry), '');
      accounts.set(accKey, { id: 'acc-' + (accounts.size + 1), key: accKey, name: company, vertical: cls.vertical, verticalLevel: cls.level,
        country: clean(r.country), existingCustomer: yesNo(r.existing_customer) === 'Y',
        revenue: clean(r.annual_revenue_usd), employees: clean(r.employee_count), accountType: clean(r.account_type) });
    }
    const acc = accounts.get(accKey)!;
    const email = emailProblem(clean(r.email)) === null ? normEmail(r.email) : '', li = LINKEDIN_RE.test(clean(r.linkedin_url)) ? clean(r.linkedin_url) : '';
    const pKey = acc.id + '|' + (email || normLinkedIn(li) || normKey(first + ' ' + clean(r.last_name)));
    if (!people.has(pKey)) {
      const consent = clean(r.consent_basis);
      const consentAs = CONFIG.synonyms.consentBases[consent.toLowerCase()];
      const c: NbaContact = { row, firstName: first, lastName: clean(r.last_name), jobTitle: clean(r.job_title), email, emailRaw: clean(r.email),
        emailVerified: !!email && yesNo(r.email_verified) === 'Y', linkedin: li, linkedinRaw: clean(r.linkedin_url), country: clean(r.country),
        consent, consentOk: CONFIG.consentBases.includes(consentAs ?? consent.toLowerCase()), optOut: false, owner: clean(r.owner_email).toLowerCase(),
        accountId: acc.id, name: '' };
      c.name = [c.firstName, c.lastName].filter(Boolean).join(' ');
      c.persona = personaOf(c.jobTitle);
      if (!c.consentOk) at(row, 'consent_basis', consent ? `"${consent}" isn't a recognised basis` : 'No consent basis', 'Call only', 'D3', 'Use legitimate interest, existing customer or opted in', 'info');
      const sc = parseNumber(r.score);
      people.set(pKey, { contact: c, account: acc, signals: [], given: sc.value !== null && sc.value >= 0 && sc.value <= 100 ? sc.value : null });
      if (clean(r.score) && (sc.value === null || sc.value < 0 || sc.value > 100)) at(row, 'score', `Score "${clean(r.score)}" isn't 0–100`, 'Score worked out from the signals', 'D3', 'Use a number from 0 to 100', 'info');
    }
    const p = people.get(pKey)!;
    const dup = [pKey, type, date].join('|');
    if (seen.has(dup)) { bad('signal_type', 'Same event already in the file', 'D5', 'Remove the repeated row'); continue; }
    seen.add(dup);
    const decay = decayFactor(cfg as { full: number; zero: number }, age);
    p.signals.push({ id: 'SIG-' + row, row, type, date, age, detail: clean(r.detail), source: clean(r.source), segment: cfg.segment,
      tier: cfg.tier, strength: cfg.strength, decay, weight: (cfg.tier as number) * (cfg.strength as number) * decay, personName: p.contact.name, status: 'Qualified' });
  }
  const results: NbaResult[] = [...accounts.values()].map(account => {
    const ps: NbaPerson[] = [...people.values()].filter(p => p.account === account && p.signals.length).map(p => {
      p.signals.sort((x, y) => y.weight - x.weight);
      const raw = stack(p.signals.map(s => s.weight)), timing = round1(raw / CONFIG.timingMax * 100);
      const final = p.given !== null ? p.given : timing;
      return { contact: p.contact, signals: p.signals, raw: round1(raw), score: timing, timing, final, scoreFrom: p.given !== null ? 'file' : 'signals',
        tier: tierFor(final, true), whyNow: p.signals.slice(0, 2).map((s, i) => `${i ? 'also ' : ''}${lowerFirst(s.detail || s.type)}`).join('; ') };
    }).sort((a, b) => (b.final ?? 0) - (a.final ?? 0));
    const signalCount = ps.reduce((t, p) => t + p.signals.length, 0);
    const hasPrimary = ps.some(p => p.contact.persona === 'Primary');
    const best = ps[0];
    return { account, contacts: ps.map(p => p.contact), people: ps, signalCount, score: best ? best.final : undefined, tier: best ? best.tier : 'Watch list',
      confidence: (!hasPrimary ? 'low' : signalCount >= 2 ? 'high' : 'medium') as Confidence, confidenceWhy: !hasPrimary ? 'No contact in the primary persona' : '' };
  }).filter(r => r.people!.length);
  return { results, issues, stats: { rowsRead: table.records.length, rejected, prospects: results.reduce((t, r) => t + r.people!.length, 0), accounts: results.length } };
}

/* ─── Stage 9: micro-segments and next best action ───
   Each account goes to the segment of its strongest signal. A segment forms only with at least
   CONFIG.minSegmentAccounts distinct accounts; an account whose strongest signal doesn't reach that falls back to its
   next signal. No account appears in two segments. Accounts left over are exceptions. */
export function segmentRanks(r: NbaResult): { segment: string; signal: NbaSignal }[] {
  const best = new Map<string, NbaSignal>();
  for (const p of r.people || []) for (const sg of p.signals) {
    const seg = segmentOf(sg);
    if (seg && (!best.has(seg) || sg.weight > best.get(seg)!.weight)) best.set(seg, sg);
  }
  return [...best.entries()].sort((a, b) => b[1].weight - a[1].weight).map(([segment, signal]) => ({ segment, signal }));
}

export function buildSegments(results: NbaResult[], opts: { min?: number; keys?: string[]; engaged?: Map<string, string> } = {}): Segmentation {
  const min = opts.min || CONFIG.minSegmentAccounts;
  const keep = opts.keys ? new Set(opts.keys) : null;
  const accounts = results.filter(r => r.people && (r.signalCount ?? 0) > 0)
    .map(r => ({ r, ranks: segmentRanks(r) }))
    .filter(a => a.ranks.length && (!keep || a.r.people!.some(p => keep.has(a.r.account.id + '|' + p.contact.row))));
  // 5.9 Engage-once: an account already recommended in this pilot is set aside as a process rule, not a low score.
  const engaged = opts.engaged || new Map<string, string>();
  const engagedOnce: Segmentation['engagedOnce'] = [];
  for (let i = accounts.length - 1; i >= 0; i--) {
    const label = engaged.get(accounts[i].r.account.name.toLowerCase());
    if (label) { engagedOnce.unshift({ result: accounts[i].r, account: accounts[i].r.account, label, prominent: accounts[i].ranks[0] }); accounts.splice(i, 1); }
  }
  const assigned = new Map<string, { segment: string; rank: number }>();
  const formed = new Map<string, string[]>();
  const maxK = Math.max(0, ...accounts.map(a => a.ranks.length));
  for (let k = 1; k <= maxK; k++) {
    for (;;) {
      const open = accounts.filter(a => !assigned.has(a.r.account.id));
      const support = new Map<string, { a: (typeof accounts)[number]; i: number }[]>();
      for (const a of open) a.ranks.slice(0, k).forEach((x, i) => {
        if (!support.has(x.segment)) support.set(x.segment, []);
        support.get(x.segment)!.push({ a, i });
      });
      // A segment qualifies with enough accounts counting those already in it; most support first, then total weight.
      // A new micro-segment forms only on accounts' strongest signals; an account falls back to its next signal only
      // to join one that already formed. Accounts left over go to For Review, where a person assigns them.
      const qualifying = [...support.entries()]
        .map(([segment, list]) => ({ segment, list, n: list.length + (formed.get(segment) || []).length, w: list.reduce((t, x) => t + x.a.ranks[x.i].signal.weight, 0) }))
        .filter(q => (k === 1 ? q.n >= min : formed.has(q.segment)))
        .sort((x, y) => y.n - x.n || y.w - x.w);
      if (!qualifying.length) break;
      const q = qualifying[0];
      if (!formed.has(q.segment)) formed.set(q.segment, []);
      for (const { a, i } of q.list) { assigned.set(a.r.account.id, { segment: q.segment, rank: i }); formed.get(q.segment)!.push(a.r.account.id); }
    }
  }
  const segments: Segmentation['segments'] = [...formed.entries()].map(([name, ids]) => ({ name, accountIds: ids }));
  const recs: Rec[] = [];
  for (const a of accounts) {
    const r = a.r, as = assigned.get(r.account.id), prominent = a.ranks[0];
    const segment = as ? as.segment : null;
    const lib = CONFIG.segmentLibrary[segment || prominent.segment] || ['Follow up'];
    const fallback = !!as && as.rank > 0;
    const action = lib[0];
    let runnerUp: RunnerUp | null;
    if (!segment) runnerUp = lib[1] ? { action: lib[1], reason: 'Second option for its strongest signal' } : null;
    else if (fallback) {
      runnerUp = { action: CONFIG.segmentLibrary[prominent.segment][0], fromStrongest: true,
        reason: `Its strongest signal is ${prominent.signal.type} (${prominent.segment}), but fewer than ${min} accounts share it, so it is grouped under ${segment} on its next signal. This is the offering for that strongest signal.` };
    } else runnerUp = lib[1] ? { action: lib[1], reason: `Second option in the ${segment} library` } : null;
    // One recommendation per account: the person with the strongest signals (people are already in that order).
    const people = r.people!.filter(p => p.signals.length && (!keep || keep.has(r.account.id + '|' + p.contact.row))).slice(0, 1);
    for (const p of people) {
      // The message speaks to this person's own evidence: their strongest signal in the segment, else their strongest.
      const inSeg = p.signals.find(sg => segmentOf(sg) === (segment || prominent.segment));
      const signal = inSeg || p.signals[0];
      const exception = !segment ? `No micro-segment: fewer than ${min} accounts share its strongest signal`
        : r.confidence === 'low' ? 'Low confidence: no contact in the primary persona' : '';
      const ago = signal.age !== undefined ? ` (${signal.age} days ago)` : '';
      recs.push({ key: r.account.id + '|' + p.contact.row, contact: p.contact, account: r.account, result: r, person: p,
        segment, prominent: prominent.segment, prominentSignal: prominent.signal, groupedOn: (as ? a.ranks[as.rank] : prominent).signal,
        fallback, action, runnerUp, signal, exception, reason: `${signal.type}${ago}: ${lowerFirst(clean(signal.detail) || signal.type)}`,
        status: r.account.existingCustomer ? 'Existing customer' : 'Net-new', persona: p.contact.persona || '' });
    }
  }
  const order = (s: string) => segments.findIndex(x => x.name === s);
  recs.sort((x, y) => (x.segment ? order(x.segment) : 99) - (y.segment ? order(y.segment) : 99) || (y.person.final || 0) - (x.person.final || 0));
  segments.forEach(sg => { sg.recs = recs.filter(r => r.segment === sg.name); });
  return { segments, recs, exceptions: recs.filter(r => !r.segment), engagedOnce, accountsConsidered: accounts.length + engagedOnce.length };
}

/* ─── 5.10–5.19: from the action to a checked first engagement ─── */
export interface Play { angle: string; objection: string; response: string; questions: string[] }
export const PLAYBOOK: Record<string, Play> = {
  Inquiry:          { angle: 'Answer the question they asked while it is live', objection: 'We are only gathering information for now.',
                      response: 'Understood. A short call now usually saves a round of back-and-forth later, and there is no commitment.',
                      questions: ['What prompted the question now?', 'What does the timeline look like, and who else is involved?', 'What would a good answer look like for you?'] },
  Modernisation:    { angle: 'Plan the migration before end of support forces the timing', objection: 'The current system still runs fine.',
                      response: 'It does today. Planning early is what lets the cutover fit a planned shutdown instead of an unplanned one.',
                      questions: ['When is your next planned shutdown?', 'What would you need to see to start planning the migration?', 'Who else would be part of that decision?'] },
  'Service renewal':{ angle: 'Check the cover still fits how the site runs today', objection: 'We will just renew as is.',
                      response: 'That is an option. A short review first makes sure you are not paying for cover you no longer use, or missing what you need.',
                      questions: ['What has changed on site since the contract was signed?', 'Where did support work well, and where not?'] },
  Project:          { angle: 'Settle the control scope while the design is still open', objection: 'It is too early to talk about control systems.',
                      response: 'That is when the scope is easiest to shape. Later it tends to be fixed by the design.',
                      questions: ['Where is the project in front-end design?', 'When is the control-system decision due?', 'Who is leading the design?'] },
  Leadership:       { angle: 'Be useful to a new leader setting priorities', objection: 'I am still settling in.',
                      response: 'Of course. A short overview now can save time when priorities are set.',
                      questions: ['What are your first priorities in the role?', 'Where does automation sit among them?'] },
  Engagement:       { angle: 'Follow up on the topic they chose to engage with', objection: 'I was just browsing.',
                      response: 'No problem. If it becomes relevant, I can share how comparable sites approached it.',
                      questions: ['What made the topic relevant for you?', 'Is it something your site is looking at this year?'] },
};

export interface Claim { id: string; type: string; year: number; title: string; segments: string[]; expiry: string; claim: string; status?: string; owner?: string }
// Approved collateral the drafts may cite (fictional, for the POC; the Client's knowledge base replaces it).
export const COLLATERAL: Claim[] = [
  { id: 'CS-01', type: 'Case study', year: 2025, title: 'Legacy control system migration in one planned shutdown', segments: ['Modernisation', 'Inquiry', 'Engagement'], expiry: '2027-06-30',
    claim: 'A comparable refinery moved its legacy control system to a current platform within one planned shutdown.' },
  { id: 'OP-02', type: 'One-pager', year: 2026, title: 'Site assessment overview', segments: ['Modernisation'], expiry: '2027-03-31',
    claim: 'A site assessment takes two days on site and ends with a prioritised upgrade list.' },
  { id: 'BR-03', type: 'Brochure', year: 2026, title: 'Lifecycle services overview', segments: ['Service renewal', 'Modernisation'], expiry: '2027-01-31',
    claim: 'Lifecycle service plans can cover planned upgrades as well as support.' },
  { id: 'CS-04', type: 'Case study', year: 2024, title: 'Gas plant expansion: control scope fixed at front-end design', segments: ['Project'], expiry: '2027-12-31',
    claim: 'On a comparable gas plant expansion, settling the control scope at front-end design kept the project on schedule.' },
  { id: 'WB-05', type: 'Webinar recording', year: 2026, title: 'Modernising legacy control systems', segments: ['Engagement'], expiry: '2027-09-30',
    claim: 'The session recording walks through how comparable sites sequenced their migration.' },
  { id: 'PS-06', type: 'Peer story', year: 2023, title: 'First 100 days: setting automation priorities', segments: ['Leadership'], expiry: '2026-06-30',
    claim: 'A plant manager in a similar role set automation priorities within the first hundred days.' },
];
export const BRAND_RULES = {
  banned: ['guarantee', 'guaranteed', 'best-in-class', 'best in class', 'world-class', 'cheapest', 'risk-free', 'no-brainer', '100%'],
  pricing: /(\$\s?\d|\bUSD\b|\bprice|\bpricing\b|\bdiscount|\bfree of charge\b)/i,
  // A plant incident, security or regulation needs a person's judgement.
  sensitive: /\b(incident|accident|explosion|fatalit|injur|lawsuit|security|cyber|breach|vulnerab|regulat|compliance|emission)/i,
  maxWords: 120,
};
const cite = (item: Pick<Claim, 'type' | 'year'>) => `[${item.type}, ${item.year}]`;

export const VOICE_PRESETS: Record<string, { greeting: string; closing: string; about: string }> = {
  Direct: { greeting: 'Hi {first},', closing: 'Best,', about: "Short sentences, the prospect's own trigger first, one point, one question." },
  Formal: { greeting: 'Dear {first},', closing: 'Kind regards,', about: 'Complete sentences, a courteous ask, no slang or contractions.' },
  Warm:   { greeting: 'Hi {first},', closing: 'All the best,', about: 'Friendly and personal, still one point and one ask.' },
};
// What a message can ask the reader to do, and the tool behind each (connected after the pilot).
export const FRAMEWORK_ACTIONS: Record<string, { label: string; how: string; tools: string[] }> = {
  meeting: { label: 'Book a meeting', how: 'Calendar link', tools: ['Google Calendar', 'Calendly', 'Microsoft Teams'] },
  call:    { label: 'Request a call', how: 'Call or video call link', tools: ['Microsoft Teams', 'Zoom', 'Google Meet'] },
  ticket:  { label: 'Raise a support ticket', how: 'Ticket link', tools: ['Zendesk', 'Jira Service Management'] },
  form:    { label: 'Fill in a short form', how: 'Short web form', tools: ['HubSpot', 'Google Forms', 'Typeform'] },
  content: { label: 'Read or download content', how: 'Tracked link to a guide or case study from the Content library', tools: [] },
  event:   { label: 'Register for a session', how: 'Webinar or event sign-up link', tools: ['Zoom', 'Webex', 'Microsoft Teams'] },
  reply:   { label: 'Reply to the email', how: 'No link needed', tools: [] },
};
export interface Framework { objective: string; name: string; steps: string[]; use: string; actions: string[] }
export const FRAMEWORKS: Framework[] = [
  { objective: 'Book a first meeting', name: 'Trigger, insight, ask', steps: ['Their trigger: the signal that makes it timely', 'One insight or approved proof', 'One clear ask'], use: 'Often', actions: ['meeting', 'reply'] },
  { objective: 'Answer an inquiry', name: 'Question, answer, next step', steps: ['Restate what they asked', 'Answer it briefly', 'Offer a short call with a specialist'], use: 'Often', actions: ['ticket', 'form', 'call'] },
  { objective: 'Start a migration conversation', name: 'Problem, agitate, solve', steps: ['The problem they face', 'What waiting costs them', 'The approach that solves it'], use: 'Sometimes', actions: ['meeting', 'content'] },
  { objective: 'Review a renewal', name: 'Before, after, bridge', steps: ['Where they are today', 'Where they could be', 'How a short review gets them there'], use: 'Sometimes', actions: ['meeting', 'form'] },
  { objective: 'Introduce ourselves to a new leader', name: 'Give, then ask', steps: ['Something useful for their first months', 'A light ask'], use: 'Sometimes', actions: ['content', 'meeting'] },
  { objective: 'Re-engage after they read our content', name: 'Attention, interest, desire, action', steps: ['Refer to what they read', 'Why it matters for their site', 'What comparable sites gained', 'One next step'], use: 'Rarely', actions: ['content', 'event'] },
  { objective: 'Blogs and whitepapers', name: 'Problem, approach, evidence, next step', steps: ['The problem in their words', 'A practical approach', 'Approved evidence', 'One next step'], use: 'Often', actions: ['content', 'form'] },
];

/* ─── The brand pack: voice and tone, negative keywords, approved claims and the messaging framework ───
   Maintained in the Content library (Phase 5a), versioned there; every list records the version it was drafted with.
   Here it is just an argument; defaultBrand() is the starting pack. */
export interface BrandPack {
  v: number;
  voice: { preset: string; signoff: string; maxWords: number; maxSentenceWords: number; noExclamation: boolean; bannedOpeners: string[]; notes: string };
  negative: string[]; competitors: string[]; claims: Claim[]; framework: Record<string, Play>; frameworks: Framework[];
  guideline: unknown; history: { v: number; at: string | number | null; by: string; note: string }[];
}
export function defaultBrand(): BrandPack {
  return { v: 1, voice: { preset: 'Direct', signoff: 'Client Team', maxWords: BRAND_RULES.maxWords, maxSentenceWords: 35, noExclamation: true,
      bannedOpeners: ['I hope this email finds you well', 'Just checking in', 'Hope you are well'], notes: 'Direct, specific, no hype. Lead with the account\'s own signal, not a generic pitch.' },
    negative: BRAND_RULES.banned.slice(), competitors: [], claims: COLLATERAL.map(c => ({ ...c, status: 'approved', owner: 'Marketing' })),
    framework: JSON.parse(JSON.stringify(PLAYBOOK)), frameworks: JSON.parse(JSON.stringify(FRAMEWORKS)), guideline: null, history: [{ v: 1, at: null, by: '', note: 'Starting brand pack' }] };
}
export const approvedClaims = (brand: BrandPack) => brand.claims.filter(c => c.status === 'approved');
const framework = (brand: BrandPack, seg: string) => brand.framework[seg] || PLAYBOOK[seg] || PLAYBOOK.Engagement;

// Every action goes out as an email or a LinkedIn connection note. 'bridge' ties their signal to why the action
// matters; it makes no product claim (the proof line carries the only claim).
const COPY: Record<string, { cta: string; alt: string; bridge: string }> = {
  'Call to follow up on the inquiry':        { cta: 'Would a 20-minute call this week help?', alt: 'Shall I set up a short call?', bridge: 'The quickest way to answer it properly is a short call with a specialist.' },
  'Route the inquiry to the sales owner':    { cta: 'Shall I connect you with them?', alt: 'Would an introduction help?', bridge: 'Your account owner can give you a specific answer for your site.' },
  'Propose a migration-path discussion':     { cta: 'Worth comparing the options?', alt: 'Would a short call to compare options help?', bridge: 'Most sites plan the move around one shutdown, so the order of work matters early.' },
  'Offer a site assessment':                 { cta: 'Worth a look?', alt: 'Would that be useful before the date?', bridge: 'A short assessment shows what to replace first and what can wait.' },
  'Offer a lifecycle service review':        { cta: 'Worth exploring?', alt: 'Would a short review help?', bridge: 'A lifecycle review maps what needs attention before support ends.' },
  'Offer a renewal review':                  { cta: 'Would a short review before the renewal help?', alt: 'Worth a quick review?', bridge: 'A review before renewing makes sure the cover still matches how the site runs.' },
  'Route to the service owner':              { cta: 'Shall I connect you with them?', alt: 'Would an introduction help?', bridge: 'Your service owner can walk you through the options for your site.' },
  'Share a comparable case study and offer a technical session': { cta: 'Worth a look?', alt: 'Would a short technical session help?', bridge: 'A team with a similar setup went through the same decision recently.' },
  'Offer a reference-site visit':            { cta: 'Would that be useful?', alt: 'Worth arranging?', bridge: 'Seeing a similar site running can answer questions a document cannot.' },
  'Offer an early design workshop':          { cta: 'Worth exploring?', alt: 'Would an early workshop help?', bridge: 'Decisions made at the design stage are the cheapest ones to change.' },
  'Introduce Client to the new leader':      { cta: 'Worth a conversation once you have settled in?', alt: 'Would a short intro be useful?', bridge: 'Happy to share what your team already runs with us, so you have the full picture.' },
  'Share a peer case study from their sector': { cta: 'Would that be useful?', alt: 'Worth a look?', bridge: 'A peer in your sector faced the same question this year.' },
  'Invite to a short briefing':              { cta: 'Worth scheduling?', alt: 'Would a short briefing help?', bridge: 'A short briefing covers what has changed and what it means for your site.' },
  'Follow up on the topic they engaged with': { cta: 'Worth a short conversation?', alt: 'Would it help to compare notes?', bridge: 'Happy to go one level deeper on how it would apply at your site.' },
  'Invite to a related session':             { cta: 'Interested?', alt: 'Shall I send the invite?', bridge: 'We have a related session coming up that goes into the practical side.' },
};
// Subject lines come from the signal: short, specific to them, no hype, no punctuation tricks.
const SUBJECT_BY_SIGNAL: Record<string, string> = { 'Inquiry or RFQ': 'your question', 'Installed system near end of support': 'end-of-support planning',
  'Service contract renewal': 'your upcoming renewal', 'Capital project': 'your project timeline', 'Leadership change': 'your new role',
  'Webinar attended': 'after the session', 'Webinar registered': 'before the session', 'Content download': 'your download',
  'Email clicked': 'following up' };
const GENERIC = { cta: 'Worth a conversation?', alt: 'Would that be useful?', bridge: '' };

function opener(sg: NbaSignal, account: NbaAccount): string {
  const d = clean(sg.detail).replace(/\.$/, '');
  const low = d ? lowerFirst(d) : '';   // keeps an acronym ("RFQ for …") or a name as written
  switch (sg.type) {
    case 'Inquiry or RFQ': {
      const about = low.replace(/^asked (about|for) /, '');
      return !d ? 'Thanks for your question.' : about !== low ? `Thanks for your question about ${about}.` : `Thanks for your question: ${low}.`;
    }
    case 'Installed system near end of support': return d ? `I understand ${low}.` : `I understand a control system at ${account.name} is nearing end of support.`;
    case 'Service contract renewal': return d ? `I see the ${low.replace(/^the /, '')}.` : 'I see your service contract is coming up for renewal.';
    case 'Capital project': return d ? `Noticed the update on your project: ${low}.` : 'Noticed the update on your project.';
    case 'Leadership change': return 'Congratulations on the new role.';
    case 'Webinar attended': return d ? `Thanks for joining our session on ${low}.` : 'Thanks for joining our session.';
    case 'Webinar registered': return d ? `Saw you registered for our session on ${low}.` : 'Saw you registered for our session.';
    case 'Content download': return d ? `Saw you downloaded the ${low.replace(/^the /, '')}.` : 'Saw you downloaded one of our guides.';
    case 'Email clicked': return d ? `Saw you opened ${low.replace(/^clicked /, '')}.` : 'Saw you opened our last note.';
    default: return d ? `Noticed ${low}.` : '';
  }
}

export const segmentOfAction = (action: string, rec?: Pick<Rec, 'segment' | 'prominent'>) =>
  Object.keys(CONFIG.segmentLibrary).find(k => CONFIG.segmentLibrary[k].includes(action)) || (rec && (rec.segment || rec.prominent)) || 'Engagement';
// The evidence behind an action: the prospect's own signal in the action's segment, else the one they were grouped on.
function evidenceFor(rec: Rec, action: string): NbaSignal {
  const seg = segmentOfAction(action, rec);
  const own = rec.person && rec.person.signals.find(sg => segmentOf(sg) === seg);
  return own || rec.signal;
}
export function proofFor(action: string, rec: Rec, asOf?: string, brand: BrandPack = defaultBrand()) {
  const seg = segmentOfAction(action, rec);
  const fits = approvedClaims(brand).filter(c => (c.segments || []).includes(seg));
  const live = fits.filter(c => !asOf || c.expiry >= asOf).sort((a, b) => Number(b.segments[0] === seg) - Number(a.segments[0] === seg));
  return { item: live[0] || null, expired: fits.filter(c => asOf && c.expiry < asOf) };
}

/* 5.10 Channel within hard limits: email only if verified, LinkedIn only with a URL, and only for someone who can be
   contacted at all (G-007: a recognised consent basis and an opt-out confirmed N; not taken out by a reviewer). */
export function allowedChannels(c: NbaContact): ('Email' | 'LinkedIn')[] {
  const ok = c.consentOk !== false && !c.optOut && !c.optOutUnknown && !c.takenOut;
  const out: ('Email' | 'LinkedIn')[] = [];
  if (ok && c.email && c.emailVerified) out.push('Email');
  if (ok && c.linkedin) out.push('LinkedIn');
  return out;
}
export function recommendChannel(rec: Pick<Rec, 'contact'>, _action: string, prefer?: string): { channel: string; why: string; unreachable?: boolean } {
  void _action;
  const c = rec.contact, allowed = allowedChannels(c);
  if (prefer && (allowed as string[]).includes(prefer)) return { channel: prefer, why: `${prefer} chosen by the reviewer, within the limits.` };
  if (allowed[0] === 'Email') return { channel: 'Email', why: c.linkedin ? 'Verified email, so email first; LinkedIn is the fallback.' : 'Verified, sendable email.' };
  if (allowed[0] === 'LinkedIn') return { channel: 'LinkedIn', why: 'No verified email, but a LinkedIn URL: one connection note.' };
  // Neither is allowed: drafted as an email, but held for a person.
  return { channel: 'Email', unreachable: true, why: c.takenOut ? 'Taken out of the list by a reviewer: nothing is sent.' : c.optOut || c.optOutUnknown ? "Opt-out not confirmed: a person must confirm before anything is sent."
    : c.consentOk === false ? 'No recognised consent basis: a person must confirm before anything is sent.' : 'No verified email and no LinkedIn URL: a person must find a way to reach them.' };
}
// 5.14 Call script: opener, discovery questions, objection handling, the ask.
export function callScript(rec: Rec, action: string, open: string, brand: BrandPack = defaultBrand()) {
  const first = rec.contact.firstName || rec.contact.name.split(' ')[0];
  const pb = framework(brand, segmentOfAction(action, rec));
  const copy = COPY[action] || GENERIC;
  return { opener: `Hi ${first}, it's [name] from Client. ${open}`, questions: pb.questions, objection: pb.objection, response: pb.response,
    ask: copy.cta || 'Would a follow-up conversation with the right specialist help?' };
}
// 5.11 The brief: who, why now, angle, proof, objection, ask and constraints.
export function briefFor(rec: Rec, action: string, opts: { asOf?: string; channel?: string; brand?: BrandPack } = {}) {
  const brand = opts.brand ?? defaultBrand();
  const sg = evidenceFor(rec, action), pb = framework(brand, segmentOfAction(action, rec));
  const proof = proofFor(action, rec, opts.asOf, brand);
  const ch = recommendChannel(rec, action, opts.channel);
  return {
    who: `${rec.contact.name}, ${rec.contact.jobTitle || 'no title'} (${rec.contact.persona || 'persona unknown'}) at ${rec.account.name} · ${rec.account.existingCustomer ? 'existing customer' : 'net-new'}`,
    whyNow: `${sg.type}: ${clean(sg.detail) || sg.type}${sg.date ? ` (${sg.date})` : ''}`,
    angle: pb.angle, proof: proof.item, expired: proof.expired, objection: pb.objection,
    ask: (COPY[action] || GENERIC).cta || 'A conversation with the right specialist',
    constraints: ch.channel === 'Email' ? `Subject of ${CONFIG.brand.maxSubjectWords} words or fewer, under 80 words, one proof point, one ask, no pricing`
      : ch.channel === 'LinkedIn' ? `One connection note under ${CONFIG.brand.maxNote} characters: their signal and a reason to connect; no follow-up message`
      : 'For a person on the account team',
    channel: ch,
  };
}

export interface Draft {
  channel: string; why: string; proof: Claim | null; noProof: boolean; unreachable: boolean;
  subject?: string; body?: string; words?: number; note?: string; task?: string; text?: string; script?: ReturnType<typeof callScript>;
  /** Written with AI (Phase 6): the call and the prompt template; absent for the rules' drafts. */
  ai?: { callId: string; template: string };
}

/* 5.12–5.15 The draft. D-10: with no approved, unexpired proof point for the case, the action is a task for the account
   owner instead of a draft that goes out without proof. */
export function draftFor(rec: Rec, action: string, opts: { asOf?: string; channel?: string; variant?: string; brand?: BrandPack } = {}): Draft {
  const brand = opts.brand ?? defaultBrand();
  const first = rec.contact.firstName || rec.contact.name.split(' ')[0];
  const copy = COPY[action] || GENERIC;
  const ch = recommendChannel(rec, action, opts.channel);
  const variant = opts.variant || '';
  // 'clean' is the one automatic regeneration after a failed brand or rule check: the opener drops the source wording.
  const ev = evidenceFor(rec, action);
  const open = opener(variant === 'clean' ? { ...ev, detail: '' } : ev, rec.account);
  const proofs = proofFor(action, rec, opts.asOf, brand), proof = proofs.item, proofLine = proof ? `${proof.claim} ${cite(proof)}` : '';
  const cta = variant === 'tone' || variant === 'alt' ? copy.alt || copy.cta : copy.cta;
  const base = { why: ch.why, proof, noProof: !proof, unreachable: !!ch.unreachable };
  if (!proof) {
    const seg = segmentOfAction(action, rec);
    const lapsed = proofs.expired.length ? ` (${proofs.expired.map(c => `${c.id} expired ${c.expiry}`).join(', ')})` : '';
    return { ...base, channel: 'Task', why: 'No approved proof point for this case, so a person on the account team takes it (D-10).',
      task: `${action} for ${rec.contact.name} at ${rec.account.name}: no approved, unexpired proof point for ${seg}${lapsed}. Contact them directly, or add an approved claim to the Content library first.` };
  }
  // LinkedIn: one connection note, no follow-up message. Their signal, then a reason to connect.
  if (ch.channel === 'LinkedIn') {
    const hook = open ? lowerFirst(open) + ' ' : '';
    const tries = [`Hi ${first}, ${hook}${copy.bridge} Would be good to connect.`, `Hi ${first}, ${hook}Would be good to connect.`, `Hi ${first}, would be good to connect.`];
    return { ...base, channel: 'LinkedIn', note: tries.find(t => t.length <= CONFIG.brand.maxNote)!.replace(/\s+/g, ' ') };
  }
  // Email: a subject from their signal; their signal first, why it matters, one proof point, one easy question.
  const vc = brand.voice, pre = VOICE_PRESETS[vc.preset] || VOICE_PRESETS.Direct;
  const hello = pre.greeting.replace('{first}', first), bye = `${pre.closing}\n${vc.signoff || 'Client Team'}`;
  const lead = `${open} ${copy.bridge}`.trim();
  const lines = variant === 'short' ? [lead] : [lead, proofLine].filter(Boolean);
  const body = `${hello}\n\n${lines.join('\n\n')}\n\n${cta}\n\n${bye}`;
  const subject = SUBJECT_BY_SIGNAL[ev && ev.type] || 'quick question';
  return { ...base, channel: 'Email', subject, body, words: body.split(/\s+/).filter(Boolean).length };
}

export function draftText(d: Partial<Draft>): string {
  if (d.channel === 'Email') return `${d.subject}\n${d.body}`;
  if (d.channel === 'LinkedIn') return d.note || '';
  if (d.channel === 'Content') return d.text || '';
  const s = d.script;
  return [d.task, s && s.opener, s && s.questions.join(' '), s && s.response, s && s.ask].filter(Boolean).join('\n');
}

type CheckedClaim = { text: string; source: string; verified: boolean; reason?: string };
export type CheckResult = { flags: { rule: string; detail: string }[]; claims: CheckedClaim[]; unsupported: CheckedClaim[] };

// 5.16 Brand and rule checks, 5.17 claim verification. With `asOf` (YYYY-MM-DD), an approved claim counts only up to
// its expiry date (G-009): cited after it, the sentence is unsupported, with the reason.
export function checkDraft(d: Partial<Draft>, brand: BrandPack = defaultBrand(), asOf?: string): CheckResult {
  const text = draftText(d), low = text.toLowerCase(), flags: CheckResult['flags'] = [];
  const vc = brand.voice;
  for (const w of brand.negative) if (w && low.includes(w.toLowerCase())) flags.push({ rule: 'Banned claim', detail: `"${w}"` });
  for (const w of brand.competitors.concat(CONFIG.brand.competitors || [])) if (w && low.includes(w.toLowerCase())) flags.push({ rule: 'Competitor name', detail: `"${w}"` });
  // Voice and tone: the measurable rules from the brand pack.
  if (vc.noExclamation && /!/.test(text)) flags.push({ rule: 'Tone of voice', detail: 'Exclamation marks' });
  for (const o of vc.bannedOpeners || []) if (o && low.includes(o.toLowerCase())) flags.push({ rule: 'Tone of voice', detail: `"${o}"` });
  const longest = Math.max(0, ...text.split(/(?<=[.?!])\s+|\n+/).map(x => x.split(/\s+/).filter(Boolean).length));
  if (vc.maxSentenceWords && longest > vc.maxSentenceWords) flags.push({ rule: 'Tone of voice', detail: `A sentence of ${longest} words (limit ${vc.maxSentenceWords})` });
  if (BRAND_RULES.pricing.test(text)) flags.push({ rule: 'Pricing or commercial terms', detail: 'Pricing is left to the account team' });
  if (BRAND_RULES.sensitive.test(text)) flags.push({ rule: 'Sensitive term', detail: 'Needs compliance approval' });
  if (d.channel === 'Email') {
    const sw = (d.subject || '').split(/\s+/).filter(Boolean).length, bw = (d.body || '').split(/\s+/).filter(Boolean).length;
    if (sw > CONFIG.brand.maxSubjectWords) flags.push({ rule: 'Length', detail: `Subject is ${sw} words (limit ${CONFIG.brand.maxSubjectWords})` });
    if (bw > (vc.maxWords || BRAND_RULES.maxWords)) flags.push({ rule: 'Length', detail: `Body is ${bw} words (limit ${vc.maxWords || BRAND_RULES.maxWords})` });
  }
  if (d.channel === 'LinkedIn' && (d.note || '').length > CONFIG.brand.maxNote) flags.push({ rule: 'Length', detail: `Connection note is ${d.note!.length} characters (limit ${CONFIG.brand.maxNote})` });
  // Claims: anything citing a source, or that reads like a product claim. A claim is verified only when it is an
  // approved, unexpired item's claim, word for word, with that item's citation.
  const sentences = text.split(/\n+/).flatMap(l => l.split(/(?<=[.?!]|\d{4}\])\s+(?!\[)/)).map(s => s.trim()).filter(Boolean);
  const claimLike = /(\d+\s?%|\b(reduces?|reduced|improves?|improved|increases?|increased|cuts? (downtime|costs?)|savings|uptime|faster|proven|within one|guarantee\w*)\b)/i;
  const claims: CheckResult['claims'] = [];
  for (const s of sentences) {
    const m = s.match(/\[([^\]]+, \d{4})\]\s*$/);
    if (!m && !claimLike.test(s)) continue;
    const bare = s.replace(/\s*\[[^\]]+, \d{4}\]\s*$/, '');
    const src = approvedClaims(brand).find(c => cite(c) === `[${m ? m[1] : ''}]` && c.claim === bare);
    const expired = !!(src && asOf && src.expiry < asOf);
    claims.push({ text: bare, source: src ? `${src.id} · ${src.title}` : '', verified: !!src && !expired, ...(expired ? { reason: `${src!.id} expired on ${src!.expiry}` } : {}) });
  }
  const seen = new Set<string>();
  const uniq = claims.filter(c => !seen.has(c.text) && !!seen.add(c.text));
  return { flags, claims: uniq, unsupported: uniq.filter(c => !c.verified) };
}
// The same brand and claim checks for long-form content from the Content studio (blogs, whitepapers, posts).
export function checkContent(text: string, brand: BrandPack = defaultBrand(), asOf?: string): CheckResult { return checkDraft({ channel: 'Content', text: String(text || '') }, brand, asOf); }

// 5.18 Confidence from grounding, open flags and signal strength.
export function confidenceFor(rec: Rec, _d: Partial<Draft>, chk: CheckResult, action?: string): { level: 'High' | 'Medium' | 'Low'; reason: string } {
  void _d;
  const w = ((action ? evidenceFor(rec, action) : rec.signal) || { weight: 0 }).weight || 0;
  const strength = w >= 60 ? 'strong' : w >= 30 ? 'moderate' : 'weak';
  const n = chk.claims.length, ok = n - chk.unsupported.length;
  const grounding = n ? `${ok} of ${n} claim${n === 1 ? '' : 's'} verified` : 'no product claims';
  const flags = chk.flags.length ? `${chk.flags.length} open flag${chk.flags.length === 1 ? '' : 's'}` : 'no open flags';
  const level = chk.unsupported.length || chk.flags.length || rec.result.confidence === 'low' || strength === 'weak' ? 'Low'
    : strength === 'strong' && rec.result.confidence === 'high' ? 'High' : 'Medium';
  const extra = rec.result.confidence === 'low' ? ', no contact in the primary persona' : '';
  return { level, reason: `${level}: ${grounding}, ${flags}, ${strength} signal${extra}` };
}

/** The configuration label stamped on runs (legacy configVersion); versions live in config_versions (Phase 5a). */
export function configVersion(v = 1): string {
  return `Config v${v}${v === 1 ? ' · starting values' : ''} · scoring weights fixed`;
}
