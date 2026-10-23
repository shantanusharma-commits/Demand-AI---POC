// Copilot on the server (G-013; legacy demandai-copilot.js contract): a question about the screen in front of the
// person is answered from the data they can see (owner-scoped as everywhere), by the rule answers first, and only a
// question they don't cover goes to the model, with the screen's data within row budgets and the last 8 turns, people
// as tokens. It never changes data: a request to approve becomes an Autopilot plan the person confirms. Chats are not
// stored (retention is not approved); the browser keeps the conversation for the page, and sends its last turns.
import 'server-only';
import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { Aliases, answerCopilot, budget, MAX_TURNS, type CopilotContext } from '../../ai/copilot.ts';
import { CONFIG } from '../../demandai-engine.ts';
import { draftText, type Draft, type Rec } from '../../engine/nba.ts';
import * as R from '../../engine/review.ts';
import { bucketIn, dueIn, labelIn } from '../../copilot/due.ts';
import * as C from '../../copilot/rules.ts';
import { CHIPS, type CopilotAnswer, type CopilotBlock, type CopilotRef, type CopilotScreen, type CopilotTurn } from '../../copilot/types.ts';
import { CHECK_HELP, CHECKS, type CheckKey } from '../../prospecting/checks.ts';
import type { Account, Contact, Signal } from '../../../types/demandai';
import { accounts, contacts, drafts, issues, nbaRuns, recommendations, signals } from '../db/schema.ts';
import { withTenant, type Db, type TenantContext, type TenantScope } from '../db/tenant.ts';
import { badRequest } from '../http/errors.ts';
import { aiGateway, callContext } from '../ai.ts';
import { fallbackWords } from '../../ai/words.ts';
import { logger } from '../logger.ts';
import { getList, isManager, ownerOnly, type Actor } from './lists.ts';
import { activeValidation } from './measures.ts';
import { getNbaRun } from './nba.ts';
import { itemDetail, logFacts, pausedSegments } from './recommendations.ts';
import { needsPersonSql } from './review.ts';
import { getProspect, getRun, listProspects } from './scoring.ts';
import { ownerNames, unitReps } from './users.ts';

export type CopilotInput = { screen: CopilotScreen; ref: CopilotRef; question: string; turns: CopilotTurn[]; chip: boolean; offset: number };

/** Row budgets per kind of data sent to the model (remediation prompt §7.6). */
export const BUDGET = { queue: 60, approvals: 40, recs: 80, accounts: 40, contacts: 40, findings: 60, prospects: 40, people: 10 };

/* ─── Loading what the person can see ─── */

const trOf = (logs: R.LogFacts[], min: number, seg?: string): C.TR => R.trackRecord(logs, seg, min);

async function queueFacts(scope: TenantScope, actor: Actor, offset: number, where = needsPersonSql): Promise<C.QueueFacts> {
  const rows = await scope.tx.select({ row: recommendations, draft: drafts.draft, checks: drafts.checks, runName: nbaRuns.name })
    .from(recommendations).innerJoin(drafts, and(eq(drafts.recommendationId, recommendations.id), eq(drafts.version, recommendations.draftVersion)))
    .innerJoin(nbaRuns, eq(nbaRuns.id, recommendations.nbaRunId))
    .where(and(eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail), where));
  const paused = new Map<string, Set<string>>();
  for (const id of new Set(rows.map(r => r.row.nbaRunId))) paused.set(id, new Set((await pausedSegments(scope, id)).keys()));
  const names = await ownerNames(scope, rows.map(r => r.row.ownerEmail ?? ''));
  const now = Date.now();
  const items = rows.filter(r => !paused.get(r.row.nbaRunId)!.has(r.row.segment || '')).map(({ row, draft, checks, runName }): C.QItem => {
    const rec = row.rec as Rec, st = { status: row.status as R.RecStatus, spot: row.spot as R.RecState['spot'], why: row.why as R.RecState['why'], reasons: row.reasons, fixed: row.fixed,
      contactRow: row.contactRow, useRunnerUp: row.useRunnerUp, manualAction: row.manualAction, assignedSegment: row.assignedSegment };
    const d = draft as Draft, chk = checks as Parameters<typeof R.isSensitive>[0];
    const reasons = R.exceptionReasons(R.liveRec(rec, st), d, chk), cats = R.reasonCats(st, { reasons, unreachable: d.unreachable });
    const c = R.liveRec(rec, st).contact, segment = R.segOf(rec, st);
    const due = dueIn({ cats, segment: segment || null, spot: row.spot, routedAt: +row.routedAt }, offset);
    return { id: row.id, who: c.name, title: c.jobTitle || '', account: rec.account.name, segment, cats, status: row.status, spot: row.spot, why: row.why,
      action: R.chosenAction(rec, st), runnerUp: rec.runnerUp ? { action: rec.runnerUp.action, reason: rec.runnerUp.reason } : null,
      owner: row.ownerEmail ? names.get(row.ownerEmail) ?? row.ownerEmail : 'Unassigned', ownerEmail: row.ownerEmail, due,
      bucket: R.inQueue(st) ? bucketIn(due, now, offset) : '', dueText: R.inQueue(st) ? labelIn(due, now, offset) : '', sensitive: R.isSensitive(chk), reasons, runName };
  });
  const manager = isManager(actor.role);
  const logs = await logFacts(scope, { ownerEmails: scope.ctx.scope === 'own' ? scope.ctx.ownerEmails : undefined });
  const min = (await activeValidation(scope)).settings.minDecisions;
  const segs = [...new Set(items.map(x => x.segment).concat(logs.map(l => l.segment ?? '')).filter(Boolean))];
  return {
    manager, queue: items.filter(x => R.inQueue({ status: x.status as R.RecStatus, spot: x.spot as R.RecState['spot'] })),
    approvals: manager ? items.filter(x => x.status === 'Awaiting approval') : [], mineHeld: manager ? [] : items.filter(x => x.status === 'Awaiting approval'),
    track: trOf(logs, min), bySegment: segs.map(s => [s, trOf(logs, min, s)] as [string, C.TR]), reps: manager ? (await unitReps(scope)).map(r => ({ email: r.email, name: r.name })) : [],
  };
}

async function itemFacts(scope: TenantScope, actor: Actor, id: string, offset: number): Promise<C.ItemFacts> {
  const it = await itemDetail(scope, actor, id);
  const text = draftText(it.draft as Partial<Draft>);
  const lines = text.split(/(?<=[.?!])\s+|\n+/).filter(z => R.SENSITIVE_RE.test(z));
  const outcomes = await scope.tx.select({ outcome: recommendations.outcome, n: sql<number>`count(*)::int` }).from(recommendations)
    .where(and(eq(recommendations.nbaRunId, it.run.id), eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail),
      it.segment ? eq(recommendations.segment, it.segment) : sql`${recommendations.segment} is null`, isNotNull(recommendations.outcome))).groupBy(recommendations.outcome);
  const st = it.state, due = R.inQueue(st) ? dueIn({ cats: it.cats, segment: it.segOf || null, spot: st.spot, routedAt: +new Date(st.routedAt ?? Date.now()) }, offset) : 0;
  const body = it.draft.channel === 'Email' ? (it.draft.body ?? '') : it.draft.channel === 'LinkedIn' ? (it.draft.note ?? '') : (it.draft.task ?? '');
  return {
    id, who: it.contact.name, title: it.contact.jobTitle, persona: it.contact.persona, account: it.account, tier: it.person.tier, segment: it.segOf || '',
    status: st.status, spot: st.spot, why: st.why, reasons: it.reasons, cats: it.cats, fourChecks: it.fourChecks, whyNow: it.reason, action: it.chosenAction,
    options: it.options, confidence: it.confidence, claimsTotal: it.checks.claims.length, claimsUnsupported: it.checks.unsupported.length, flags: it.checks.flags.map(f => f.rule),
    signalWeight: Number((it.signal as { weight?: number }).weight) || 0, primaryPersona: it.resultConfidence !== 'low', channel: it.draft.channel, channelWhy: it.draft.why,
    subject: it.draft.subject ?? '', opening: (it.draft.channel === 'Email' ? body.split(/\n+/).filter(Boolean)[1] : body.split(/\n+/)[0])?.slice(0, 180) ?? '',
    words: text.split(/\s+/).filter(Boolean).length, sensitiveLines: lines, aiDraft: !!(it.draft as Draft).ai, track: it.trackRecord,
    outcomes: Object.fromEntries(outcomes.map(o => [o.outcome!, Number(o.n)])), deal: it.deal, dealThreshold: it.dealThreshold, owner: it.owner.name ?? it.owner.email ?? '',
    people: it.people.map(p => ({ name: p.name, jobTitle: p.jobTitle, persona: p.persona, reach: p.reach })),
    reach: { email: !!it.contact.email, verified: it.contact.emailVerified, linkedin: !!it.contact.linkedin },
    history: it.history.map(h => ({ decision: h.decision, note: h.note, who: h.who })), claims: it.claims.map(c => ({ id: c.id, title: c.title })),
    brief: { angle: it.brief.angle, proof: it.brief.proof ? it.brief.proof.title : '', objection: it.brief.objection, ask: it.brief.ask },
    dueText: due ? labelIn(due, Date.now(), offset) : '', manager: isManager(actor.role),
    signals: (it.person.signals as Signal[]).map(s => ({ type: s.type, date: s.date, detail: s.detail, source: s.source })),
  };
}

async function nbaFacts(scope: TenantScope, id: string): Promise<C.NbaFacts> {
  const r = await getNbaRun(scope, id);
  return { name: r.name, segments: r.segments, recs: r.recs.map(x => ({ id: x.id, who: x.contact.name, account: x.account.name, segment: x.segment || x.assignedSegment || '', action: x.chosenAction, status: x.status, released: x.released, outcome: x.outcome })) };
}

async function listFacts(scope: TenantScope, actor: Actor, id: string): Promise<C.ListFacts> {
  const l = await getList(scope, actor, id);
  const accs = (await scope.tx.select({ data: accounts.data }).from(accounts).where(and(eq(accounts.listId, l.id), ownerOnly(scope, accounts.ownerEmail))).orderBy(accounts.seq)).map(a => a.data as Account);
  const cons = (await scope.tx.select({ data: contacts.data }).from(contacts).where(and(eq(contacts.listId, l.id), ownerOnly(scope, contacts.ownerEmail))).orderBy(contacts.rowNo)).map(c => c.data as Contact);
  const iss = await scope.tx.select({ check: issues.checkKey, row: issues.rowNo, data: issues.data }).from(issues).where(and(eq(issues.listId, l.id), ownerOnly(scope, issues.ownerEmail))).orderBy(issues.seq);
  const byAcc = new Map<string, Contact[]>();
  for (const c of cons) byAcc.set(c.accountId, [...(byAcc.get(c.accountId) ?? []), c]);
  const reach = (c: Contact) => (c.email && c.emailVerified ? 'verified email' : c.linkedin ? 'LinkedIn only' : 'no way to reach them');
  const personas: Record<string, number> = {};
  for (const c of cons) personas[c.persona || 'None'] = (personas[c.persona || 'None'] ?? 0) + 1;
  const q = l.quality as { clean?: number } | null;
  return {
    fileName: l.sourceFile, rowsRead: l.stats?.rowsRead ?? 0, clean: q && typeof q.clean === 'number' ? q.clean : null, accounts: accs.length, accountsPass: accs.filter(a => !a.excluded).length,
    contacts: cons.length, inFinalList: cons.filter(c => c.status === 'In the final list').length,
    checks: CHECKS.map(([k, name]) => { const xs = iss.filter(i => i.check === k); return { key: k, name, fix: CHECK_HELP[k as CheckKey][1], findings: xs.length, rows: [...new Set(xs.map(i => i.row).filter((r): r is number => r !== null))] }; }),
    excluded: accs.filter(a => a.excluded).map(a => ({ name: a.name, reason: a.excludedReason || 'a knock-out rule' })),
    unreachable: cons.filter(c => c.reachableBy === 'none').map(c => ({ name: c.name, company: c.company, row: c.row })),
    duplicates: iss.filter(i => i.check === 'dupes').map(i => ({ row: i.row ?? 0, issue: (i.data as { issue: string }).issue })), personas,
    accountsByName: accs.map(a => ({ name: a.name, vertical: a.vertical, country: a.country, excluded: a.excluded ? a.excludedReason : '', contacts: (byAcc.get(a.id) ?? []).map(c => ({ name: c.name, title: c.jobTitle, reach: reach(c) })) })),
  };
}

async function scoringFacts(scope: TenantScope, actor: Actor, id: string): Promise<C.ScoringFacts> {
  const r = await getRun(scope, actor, id);
  const top = await listProspects(scope, id, { limit: BUDGET.prospects });
  const unused = await scope.tx.select({ code: sql<string>`${signals.data}->>'code'`, reason: sql<string>`min(${signals.data}->>'reason')`, n: sql<number>`count(*)::int` }).from(signals)
    .where(and(eq(signals.runId, id), eq(signals.businessUnitId, scope.ctx.businessUnitId), ne(signals.status, 'Qualified'), ownerOnly(scope, signals.ownerEmail)))
    .groupBy(sql`${signals.data}->>'code'`).orderBy(desc(sql`count(*)`));
  return { name: r.name || r.listName, tiers: r.visible.tiers, prospects: r.visible.prospects, unused: unused.map(u => ({ code: u.code || '—', reason: u.reason || '', n: Number(u.n) })),
    weights: Object.entries(CONFIG.signalTypes).filter(([, v]) => typeof (v as { full?: number }).full === 'number').map(([type, v]) => ({ type, full: (v as { full: number }).full })),
    top: top.rows.map(p => ({ who: p.summary.name, account: p.summary.company, tier: p.tier, score: p.score, whyNow: p.summary.whyNowAi ?? p.summary.whyNow })) };
}

async function prospectFacts(scope: TenantScope, runId: string, contactId: string): Promise<C.ProspectFacts> {
  const p = await getProspect(scope, runId, contactId);
  const T = CONFIG.tierThresholds, s = p.score;
  const next = s === null ? null : s < T.B ? `${Math.round((T.B - s) * 10) / 10} points short of tier B (${T.B}) and ${Math.round((T.A - s) * 10) / 10} short of tier A (${T.A}). A fresher or stronger signal for this person raises the timing part of the score.`
    : s < T.A ? `${Math.round((T.A - s) * 10) / 10} points short of tier A (${T.A}). A fresher or stronger signal for this person raises the timing part of the score.` : null;
  return { who: p.contact.name, title: p.contact.jobTitle, account: p.account.name, tier: p.tier, score: p.score, fit: p.fit, timing: p.timing,
    fitWhy: (p.result.breakdown ?? []).map(b => `${b.label}: ${b.levelLabel} (${Math.round(b.points * 10) / 10} of ${b.weight} points) · ${b.why}`),
    whyNow: p.person?.whyNow ?? '', whyNowAi: p.person?.whyNowAi?.line ?? null, next,
    signals: (p.person?.signals ?? []).map(sg => ({ type: sg.type, date: sg.date, detail: sg.detail, weight: Number(sg.weight) || 0 })) };
}

/* ─── What the model is sent: the facts as lines, people as tokens, within row budgets ─── */

function queueData(f: C.QueueFacts, al: Aliases): { data: string; partial: string[] } {
  const line = (x: C.QItem) => `${al.token(x.who)} (${x.title || 'no title'}) · ${x.account} · ${x.status === 'Awaiting approval' ? 'approval' : R.REASON_CATS[x.cats[0]] || x.status} · action: ${x.action}${x.dueText ? ` · ${x.dueText}` : ''}${f.manager ? ` · owner ${al.token(x.owner, 'R')}` : ''}${x.segment ? ` · ${x.segment}` : ''}`;
  const by: Record<string, number> = {};
  f.queue.forEach(x => x.cats.forEach(c => { by[R.REASON_CATS[c] || c] = (by[R.REASON_CATS[c] || c] ?? 0) + 1; }));
  const q = budget('items in the queue', f.queue.slice().sort((a, b) => a.due - b.due), BUDGET.queue, line);
  const a = budget('approvals waiting', f.approvals, BUDGET.approvals, line);
  return { data: [`Viewer: ${f.manager ? 'sales manager' : 'sales rep'}.`, `Queue by reason: ${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}.`, q.text,
    ...(f.manager ? [a.text] : [`Your messages waiting for the sales manager: ${f.mineHeld.length}.`]),
    `Track record (first-time decisions agreeing with the system): ${f.track.n ? `${f.track.a} of ${f.track.n}` : 'none yet'}.`].join('\n'), partial: [q.partial, a.partial].filter((p): p is string => !!p) };
}

function itemData(f: C.ItemFacts, al: Aliases): { data: string; partial: string[] } {
  const ppl = budget('other people at the account', f.people, BUDGET.people, p => `${al.token(p.name)} (${p.jobTitle || 'no title'}, ${p.persona} persona, reach: ${p.reach})`);
  return { data: [
    `Account: ${f.account.name} · ${f.account.vertical} · ${f.account.existingCustomer ? 'existing customer' : 'net-new'}${f.account.country ? ` · ${f.account.country}` : ''}${f.tier ? ` · tier ${f.tier}` : ''}`,
    `Contact: ${al.token(f.who)}, ${f.title || 'no title'}, ${f.persona} persona. Email: ${f.reach.email ? (f.reach.verified ? 'verified' : 'not verified') : 'none'}. LinkedIn: ${f.reach.linkedin ? 'yes' : 'none'}.`,
    ppl.text, `Micro-segment: ${f.segment || 'none'}. Status: ${f.status}${f.spot === 'pending' ? ' (spot-check)' : ''}.`, `Why now: ${f.whyNow}`,
    `Signals: ${f.signals.map(s => `${s.type} ${s.date}: ${s.detail} (source: ${s.source})`).join('; ') || 'none'}`,
    `Recommended action: ${f.options.recommended.action} (${f.options.recommended.channel}, confidence ${f.options.recommended.conf}). Chosen: ${f.action}.`,
    f.options.runnerUp ? `Runner-up: ${f.options.runnerUp.action} (${f.options.runnerUp.channel}, confidence ${f.options.runnerUp.conf}). Why: ${f.options.runnerUp.reason}` : 'No runner-up.',
    f.cats.length ? `Why it needs a person: ${f.cats.map(c => R.REASON_CATS[c] || c).join(', ')}. Detail: ${f.reasons.join(' · ') || '—'}` : '',
    f.dueText ? `${f.dueText}.` : '', `Checks: ${f.fourChecks.map(c => `${c.name} ${c.ok ? 'pass' : 'FAIL'}`).join(', ')}.`, `Confidence: ${f.confidence.reason}.`,
    f.deal ? `Estimated deal size: about USD ${Math.round(f.deal.value / 1000)}k (threshold ${Math.round(f.dealThreshold / 1000)}k; basis: ${f.deal.basis}).` : '',
    `Message (${f.channel}): ${f.subject ? `subject "${f.subject}"; ` : ''}${f.words} words; opens with "${al.hide(f.opening)}". Written by ${f.aiDraft ? 'AI, then checked' : 'the rules'}.`,
    `Brief: angle ${f.brief.angle}; proof ${f.brief.proof || 'none approved'}; objection ${f.brief.objection}; ask ${f.brief.ask}.`,
    `History: ${f.history.slice(0, 10).map(h => `${h.decision}${h.note ? ` (${al.hide(h.note)})` : ''}`).join('; ') || 'none'}. Owner: ${f.owner ? al.token(f.owner, 'R') : 'nobody'}.`,
  ].filter(Boolean).join('\n'), partial: [ppl.partial].filter((p): p is string => !!p) };
}

function nbaData(f: C.NbaFacts, al: Aliases): { data: string; partial: string[] } {
  const r = budget('recommendations', f.recs, BUDGET.recs, x => `${al.token(x.who)} · ${x.account} · ${x.segment || 'no micro-segment'} · ${x.action} · ${x.status}${x.outcome ? ` · outcome ${x.outcome}` : ''}`);
  return { data: [`Build: ${f.name}. Micro-segments: ${f.segments.map(s => `${s.name} (${s.accounts} accounts)`).join(', ') || 'none'}.`, r.text].join('\n'), partial: r.partial ? [r.partial] : [] };
}

function listData(f: C.ListFacts, al: Aliases): { data: string; partial: string[] } {
  const ex = budget('excluded accounts', f.excluded, BUDGET.accounts, a => `${a.name}: ${a.reason}`);
  const un = budget("contacts who can't be reached", f.unreachable, BUDGET.contacts, c => `${al.token(c.name)} · ${c.company} (row ${c.row})`);
  return { data: [`File: ${f.fileName}. Rows read ${f.rowsRead}. ${f.clean !== null ? `Clean rows ${f.clean}%. ` : ''}Accounts ${f.accounts}, pass knock-outs ${f.accountsPass}. Contacts ${f.contacts}, in the final list ${f.inFinalList}.`,
    `Checks: ${f.checks.map(c => `${c.name} ${c.findings} finding${c.findings === 1 ? '' : 's'}`).join('; ')}.`, ex.text, un.text,
    `Personas: ${Object.entries(f.personas).map(([k, n]) => `${k} ${n}`).join(', ')}.`].join('\n'), partial: [ex.partial, un.partial].filter((p): p is string => !!p) };
}

function scoringData(f: C.ScoringFacts, al: Aliases): { data: string; partial: string[] } {
  const t = budget('top prospects', f.top, BUDGET.prospects, x => `${al.token(x.who)} · ${x.account} · tier ${x.tier} · score ${x.score ?? '—'} · why now: ${x.whyNow || 'no live signal'}`);
  return { data: [`Run: ${f.name}. ${f.prospects} prospects; tiers: ${Object.entries(f.tiers).map(([k, n]) => `${k} ${n}`).join(', ')}.`, t.text,
    `Signal rows not used: ${f.unused.map(u => `${u.code} ${u.n} (${u.reason})`).join('; ') || 'none'}.`].join('\n'), partial: f.prospects > f.top.length ? [`${f.top.length} of ${f.prospects} prospects (the highest-ranked)`] : [] };
}

function prospectData(f: C.ProspectFacts, al: Aliases): { data: string; partial: string[] } {
  return { data: [`Prospect: ${al.token(f.who)}, ${f.title || 'no title'}, at ${f.account}. Tier ${f.tier}; score ${f.score ?? '—'} = fit ${f.fit ?? '—'} × timing ${f.timing ?? '—'} ÷ 100.`,
    `Fit: ${f.fitWhy.join('; ') || '—'}.`, `Why now: ${f.whyNowAi ?? f.whyNow ?? 'no live signal'}.`, f.next ?? 'In the top tier.',
    `Signals: ${f.signals.map(s => `${s.type} ${s.date}: ${s.detail} (${Math.round(s.weight)} points)`).join('; ') || 'none'}.`].join('\n'), partial: [] };
}

/* ─── Answering ─── */

const SCREEN_NAME: Record<CopilotScreen, string> = { today: 'Today', review: 'For Review', nba: 'Micro-segments & NBA', prospecting: 'Prospecting', scoring: 'Account Scoring' };
const UNKNOWN: CopilotBlock[] = [{ t: 'p', text: "I can't answer that from the data on this screen yet." }, { t: 'note', text: 'Try one of the suggested questions, or ask about the reason it is here, the message, the contact, the signals or the confidence.' }];

type Loaded = { kind: keyof typeof CHIPS; about: string; rules: () => CopilotBlock[] | null; data: (al: Aliases) => { data: string; partial: string[] } };

async function load(scope: TenantScope, actor: Actor, input: CopilotInput): Promise<Loaded> {
  const { screen, ref } = input;
  if ((screen === 'review' || screen === 'nba' || screen === 'today') && ref.itemId) {
    const f = await itemFacts(scope, actor, ref.itemId, input.offset);
    return { kind: 'item', about: `${f.who} · ${f.account.name}`, rules: () => C.itemAnswer(f, input.question), data: al => itemData(f, al) };
  }
  if (screen === 'nba' && ref.nbaRunId) {
    const f = await nbaFacts(scope, ref.nbaRunId);
    const q = await queueFacts(scope, actor, input.offset, and(needsPersonSql, eq(recommendations.nbaRunId, ref.nbaRunId)));
    return { kind: 'nba', about: f.name, rules: () => C.nbaAnswer(f, input.question, q), data: al => { const a = nbaData(f, al), b = queueData(q, al); return { data: `${a.data}\n${b.data}`, partial: [...a.partial, ...b.partial] }; } };
  }
  if (screen === 'prospecting' && ref.listId) {
    const f = await listFacts(scope, actor, ref.listId);
    return { kind: 'prospecting', about: f.fileName, rules: () => C.listAnswer(f, input.question), data: al => listData(f, al) };
  }
  if (screen === 'scoring' && ref.runId && ref.contactId) {
    const f = await prospectFacts(scope, ref.runId, ref.contactId);
    return { kind: 'prospect', about: `${f.who} · ${f.account}`, rules: () => C.prospectAnswer(f, input.question), data: al => prospectData(f, al) };
  }
  if (screen === 'scoring' && ref.runId) {
    const f = await scoringFacts(scope, actor, ref.runId);
    return { kind: 'scoring', about: f.name, rules: () => C.scoringAnswer(f, input.question), data: al => scoringData(f, al) };
  }
  if (screen === 'today' || screen === 'review') {
    const f = await queueFacts(scope, actor, input.offset);
    return { kind: f.manager ? 'queueManager' : 'queue', about: '', rules: () => C.queueAnswer(f, input.question), data: al => queueData(f, al) };
  }
  throw badRequest('Open something on this screen first: Copilot answers about what is in front of you.');
}

/** One question: the rules' answer when they have one, the model's (with the AI on) when they don't. The data is read
 *  in one transaction; none is open while the model answers. */
export async function askCopilot(db: Db, tenant: TenantContext, actor: Actor, input: CopilotInput, signal?: AbortSignal): Promise<CopilotAnswer> {
  const question = R.cleanNote(input.question, 1000);
  if (!question) throw badRequest('Ask a question.', { question: ['Ask a question.'] });
  const turns = input.turns.slice(-MAX_TURNS);
  const prepared = await withTenant(db, tenant, async s => {
    const l = await load(s, actor, { ...input, question });
    const rules = l.rules();
    return { l, rules, chips: CHIPS[l.kind], ctx: rules ? null : (() => { const al = new Aliases(), d = l.data(al); return { al, d }; })() };
  }, { label: 'copilot.load' });
  const { l, rules, chips } = prepared;
  if (rules) {
    logger.info({ event: 'copilot.answered', source: 'rules', kind: l.kind, chip: input.chip }, 'Copilot answered from the rules');
    return { blocks: rules, source: 'rules', suggestions: chips.filter(c => c.toLowerCase() !== question.toLowerCase()).slice(0, 3) };
  }
  const ai = aiGateway();
  const { al, d } = prepared.ctx!;
  if (!ai.enabled('copilot')) return { blocks: UNKNOWN, source: 'none', suggestions: chips.slice(0, 4) };
  const c: CopilotContext = { screen: SCREEN_NAME[input.screen], about: l.about ? al.hide(l.about) : '', data: d.data, partial: d.partial };
  const r = await answerCopilot(ai, callContext(tenant, { signal, deadlineMs: 25_000 }), c, al, question, turns);
  logger.info({ event: 'copilot.answered', source: r.ok ? 'ai' : 'none', kind: l.kind, partial: d.partial.length > 0, ...(r.ok === false ? { reason: r.reason } : {}) }, 'Copilot answered');
  if (r.ok === false) {
    const why = r.reason === 'disabled' ? undefined : r.reason === 'checks_failed' ? "the AI's answer broke Copilot's rules, so it was not shown" : fallbackWords(r.reason);
    return { blocks: UNKNOWN, source: 'none', ...(why ? { fallback: why } : {}), suggestions: chips.slice(0, 4) };
  }
  return { blocks: r.blocks, source: 'ai', ...(d.partial.length ? { partial: `Answered from ${d.partial.join(' and ')}.` } : {}), suggestions: chips.slice(0, 3) };
}
