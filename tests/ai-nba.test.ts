// Micro-segments and the next best action chosen by AI (sections A, B, C, G and H of the 30 Oct 2026 change request):
// the checks on each answer, the 3-account rule and the rules' actions applied to the result, the properties every build
// must have, and both steps against a fake model (one repair, then the rules; segments one batch after another, so a
// later batch can join a segment an earlier one proposed). Run with --conditions=react-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AiGateway } from '../lib/ai/gateway.ts';
import type { ModelResponse } from '../lib/ai/types.ts';
import {
  actionProblems, actionStep, applyAiPlan, factsOf, genericAction, NBA_BATCH, planProperties, segmentProblems, segmentStep,
  type ActionChoice, type ActionContext, type KnownSegment, type SegmentChoice,
} from '../lib/ai/nba.ts';
import { CONFIG } from '../lib/demandai-engine.ts';
import * as S from '../lib/demandai-sample-data.ts';
import { DEFAULT_ACTIONS, libraryBySegment } from '../lib/engine/actions.ts';
import * as N from '../lib/engine/nba.ts';
import { FakeModel, json, type StepFn } from './helpers/fake-model.ts';
import { actionChooser, segmenter, type NbaItem } from './helpers/ai-fakes.ts';

const CTX = { businessUnitId: '00000000-0000-4000-8000-0000000000b1', userId: '00000000-0000-4000-8000-0000000000a1' };
const gateway = (client: FakeModel, flags: { segment?: boolean; next_action?: boolean } = { segment: true, next_action: true }) =>
  new AiGateway({ client, flags, timeoutMs: 5_000, maxConcurrency: 4, sleep: async () => {} });
const EMAIL = /[A-Z0-9._%+'-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;

/** The scenario build: 12 accounts, the rules form Modernisation (3), Inquiry (3) and Engagement (4). */
function build(): N.Segmentation {
  const asOf = '2026-10-05';
  return N.buildSegments(N.processScoredProspects(S.nbaScenarioGrid(asOf), { asOf }).results);
}
const KNOWN: KnownSegment[] = Object.keys(CONFIG.segmentLibrary).map(name => ({ name, theme: name, status: 'approved', origin: 'rules' }));
const LIBRARY = libraryBySegment(DEFAULT_ACTIONS);
const CLAIM = N.approvedClaims(N.defaultBrand())[0].id;
const CONTEXT: ActionContext = { library: DEFAULT_ACTIONS, history: ['Rejected: Wrong action (R6) · Engagement · Follow up on the topic they engaged with'],
  claims: N.approvedClaims(N.defaultBrand()), competitors: ['Rival Automation'] };

/** A step that answers as `good` would, with the first account citing a row it does not have. */
const withForeignRow = (good: StepFn): StepFn => async (req, n) => {
  const v = JSON.parse((await good(req, n) as ModelResponse).text);
  v.items[0].rows = [99999];
  return json(v);
};

test('segmentProblems: every account once, rows of its own, an existing segment that is one, a name that says something', () => {
  const facts = build().recs.slice(0, 3).map(r => factsOf(r));
  const item = (ref: number, over: Record<string, unknown> = {}) => ({ ref, segment: 'Leadership', isNew: false, theme: 'New people in buying roles', why: 'Its signals say so.',
    rows: [facts[ref - 1]?.signals[0].row ?? 0], confidence: 'High' as const, ...over });
  assert.deepEqual(segmentProblems({ items: [item(1), item(2), item(3)] }, facts, KNOWN), []);
  assert.deepEqual(segmentProblems({ items: [item(1, { rows: [99999] }), item(2, { segment: 'Plant expansion' }), item(2, { segment: 'Other', isNew: true }), item(9)] }, facts, KNOWN), [
    'ref 1 cites row 99999, which is not one of its signals.',
    'ref 2: "Plant expansion" is not an existing micro-segment: pick one from the list, or set isNew true with its theme.',
    'ref 2 is answered twice.',
    'ref 2: "Other" says nothing: name what the accounts have in common.',
    'ref 9 is not an account in this batch.',
    'ref 3 is missing.',
  ]);
});

test('actionProblems: rows of its own, approved claims only, library names exact, a different runner-up, no pricing or competitor', () => {
  const facts = build().recs.slice(0, 2).map(r => factsOf(r));
  const item = (ref: number, over: Record<string, unknown> = {}) => ({ ref, action: 'Offer a site assessment', inLibrary: true, why: 'Their system nears end of support.',
    rows: [facts[ref - 1].signals[0].row], claims: [CLAIM], confidence: 'High' as const,
    runnerUp: { action: 'Invite them to the plant tour', inLibrary: false, why: 'A lighter first step.' }, ...over });
  assert.deepEqual(actionProblems({ items: [item(1), item(2)] }, facts, CONTEXT), []);
  const two = item(2), foreign = facts[0].signals[0].row;
  assert.deepEqual(actionProblems({ items: [item(1, { claims: ['XX-99'], action: 'Offer a site visit' }),
    item(2, { rows: [foreign], why: 'Beat Rival Automation on price.', runnerUp: { ...two.runnerUp, action: two.action, inLibrary: true } })] }, facts, CONTEXT), [
    'ref 1 cites XX-99, which is not an approved claim on the list.',
    'ref 1: the action "Offer a site visit" is not in the library: use a library action\'s exact name, or set inLibrary false.',
    `ref 2 cites row ${foreign}, which is not one of its signals.`,
    'ref 2: the action mentions pricing or commercial terms.',
    'ref 2: the action mentions the competitor "Rival Automation".',
    'ref 2: the runner-up must differ from the action.',
  ]);
});

test('applyAiPlan: the AI\'s segments and actions, the 3-account rule on the result, the library\'s or a generic action where the AI chose none', () => {
  const seg = build(), rec = (id: string) => seg.recs.find(r => r.account.id === id)!;
  const segChoice = (id: string, name: string, isNew: boolean): [string, SegmentChoice] =>
    [id, { name, isNew, theme: 'Plants adding capacity', why: 'Its signals say it is adding capacity.', rows: [factsOf(rec(id)).signals[0].row], confidence: 'High', callId: 'call-s' }];
  const six = rec('acc-6');
  const action: ActionChoice = { action: 'Offer a site assessment', inLibrary: true, why: 'They engaged with the upgrade topic.', rows: [six.signal.row!], claims: [CLAIM],
    confidence: 'Medium', callId: 'call-a', runnerUp: { action: 'Invite them to the plant tour', inLibrary: false, why: 'A lighter first step.' } };
  const out = applyAiPlan(seg, {
    segments: new Map([segChoice('acc-1', 'Plant expansion', true), segChoice('acc-2', 'Plant expansion', true), segChoice('acc-8', 'Plant expansion', true),
      segChoice('acc-9', 'Engagement', false), segChoice('acc-11', 'Lonely pair', true), segChoice('acc-12', 'Lonely pair', true)]),
    actions: new Map([[six.key, action]]),
  }, { min: CONFIG.minSegmentAccounts, library: LIBRARY });
  const got = (id: string) => out.recs.find(r => r.account.id === id)!;
  // Plant expansion forms with 3; Engagement gains one; Modernisation and Inquiry each keep one account, so they don't form.
  assert.deepEqual(out.segments.map(s => [s.name, s.accountIds.length]).sort(), [['Engagement', 5], ['Plant expansion', 3]]);
  for (const id of ['acc-1', 'acc-2', 'acc-8']) {
    const r = got(id);
    assert.deepEqual([r.segment, r.ai?.segment?.isNew, r.signal.row, r.action, r.runnerUp], ['Plant expansion', true, factsOf(rec(id)).signals[0].row, genericAction(r.signal), null]);
  }
  assert.deepEqual([got('acc-9').segment, got('acc-9').action, got('acc-9').runnerUp], ['Engagement', LIBRARY.Engagement[0], { action: LIBRARY.Engagement[1], reason: 'Second option in the Engagement library' }]);
  for (const id of ['acc-11', 'acc-12', 'acc-3', 'acc-10']) {
    assert.deepEqual([got(id).segment, got(id).exception], [null, `No micro-segment: fewer than ${CONFIG.minSegmentAccounts} accounts share it`]);
  }
  assert.equal(got('acc-11').prominent, 'Lonely pair');
  assert.equal(got('acc-3').action, rec('acc-3').action, 'the rules\' action stays where the AI chose neither');
  assert.deepEqual([got('acc-6').action, got('acc-6').runnerUp, got('acc-6').ai?.action?.claims], ['Offer a site assessment', { action: 'Invite them to the plant tour', reason: 'A lighter first step.' }, [CLAIM]]);
  assert.deepEqual(out.exceptions.map(r => r.account.id).sort(), ['acc-10', 'acc-11', 'acc-12', 'acc-3']);
});

test('planProperties: segments of 3 or more, a signal of its own, approved claims only, nobody who can\'t be contacted', () => {
  const seg = build(), approved = new Set(N.approvedClaims(N.defaultBrand()).map(c => c.id));
  assert.deepEqual(planProperties(seg, { min: CONFIG.minSegmentAccounts, approved, contactable: () => true }), [], 'the rules\' build has them all');
  const broken: N.Segmentation = { ...seg, segments: [...seg.segments, { name: 'Pair', accountIds: ['acc-11', 'acc-12'] }],
    recs: seg.recs.map(r => (r.account.id === 'acc-6' ? { ...r, signal: { ...r.signal, row: 999 }, ai: { action: { inLibrary: true, why: 'x', signals: [999], claims: ['XX-99'], confidence: 'Low', callId: 'c', runnerUp: null } } } : r)) };
  assert.deepEqual(planProperties(broken, { min: CONFIG.minSegmentAccounts, approved, contactable: r => !N.recommendChannel(r, r.action).unreachable }), [
    'Pair formed with 2 accounts',
    'acc-3|7 is for someone who can\'t be contacted',
    'acc-10|19 is for someone who can\'t be contacted',
    'acc-6|12 cites a signal that is not its own',
    'acc-6|12 cites XX-99, not an approved claim',
    'acc-12|21 is for someone who can\'t be contacted',
  ]);
});

test('segmentStep: ten accounts a call, one batch after another; a later batch joins a segment an earlier one proposed; a known name is a reuse', async () => {
  const seg = build(), facts = seg.recs.map(r => factsOf(r));
  assert.ok(facts.length > NBA_BATCH, 'two batches');
  const first = segmenter((it: NbaItem) => (it.ref <= 3 ? { segment: 'Plant expansion', isNew: true } : it.ref === 4 ? { segment: 'leadership', isNew: true } : { segment: 'Engagement', isNew: false }));
  const fake = new FakeModel([first, segmenter(() => ({ segment: 'plant EXPANSION', isNew: false }))]);
  const { choices, stats } = await segmentStep(gateway(fake), CTX, facts, KNOWN);
  assert.equal(fake.requests.length, 2);
  assert.match(fake.requests[1].messages[0].content, /^- "Plant expansion" · "Plants adding capacity" · new, waiting for approval$/m, 'the second batch is offered what the first proposed');
  assert.deepEqual(stats, { asked: 12, answered: 12, fallbacks: {} });
  const by = (i: number) => choices.get(facts[i].accountId)!;
  assert.deepEqual([by(0).name, by(0).isNew, by(10).name, by(10).isNew, by(11).name], ['Plant expansion', true, 'Plant expansion', true, 'Plant expansion']);
  assert.deepEqual([by(3).name, by(3).isNew, by(3).theme], ['Leadership', false, 'Leadership'], 'a "new" name that is a known one reuses it');
  assert.deepEqual([by(4).name, by(4).isNew], ['Engagement', false]);
  for (const req of fake.requests) {
    const sent = FakeModel.sent(req);
    assert.ok(!EMAIL.test(sent) && seg.recs.every(r => !sent.includes(r.account.name) && !sent.includes(r.contact.name)), 'no names or email addresses');
  }
});

test('segmentStep: one repair with what was wrong, then the rules; off, it asks nothing', async () => {
  const facts = build().recs.slice(0, 3).map(r => factsOf(r));
  const good = segmenter(() => ({ segment: 'Engagement', isNew: false }));
  const repaired = new FakeModel([withForeignRow(good), good]);
  const r1 = await segmentStep(gateway(repaired), CTX, facts, KNOWN);
  assert.deepEqual([repaired.requests.length, r1.stats.answered, r1.choices.size], [2, 3, 3]);
  assert.match(repaired.requests[1].messages.at(-1)!.content, /That reply could not be used:\n- ref 1 cites row 99999, which is not one of its signals\./);
  const stubborn = new FakeModel([withForeignRow(good), withForeignRow(good)]);
  const r2 = await segmentStep(gateway(stubborn), CTX, facts, KNOWN);
  assert.deepEqual([r2.choices.size, r2.stats], [0, { asked: 3, answered: 0, fallbacks: { grounding: 3 } }]);
  const off = new FakeModel([]);
  const r3 = await segmentStep(gateway(off, { segment: false }), CTX, facts, KNOWN);
  assert.deepEqual([off.requests.length, r3.stats.fallbacks], [0, { disabled: 3 }]);
});

test('actionStep: batches in parallel; a library action by its exact name; a new one stays outside the library; the library and the team\'s decisions are sent', async () => {
  const facts = build().recs.map(r => factsOf(r));
  const fake = new FakeModel([], { otherwise: actionChooser(it => (it.ref === 1
    ? { action: 'offer a SITE assessment', inLibrary: false, claims: [CLAIM], runnerUp: { action: 'Invite them to the plant tour', inLibrary: false } }
    : { action: 'Call to follow up on the inquiry', inLibrary: true })) });
  const { choices, stats } = await actionStep(gateway(fake), CTX, facts, CONTEXT);
  assert.deepEqual([fake.requests.length, stats], [2, { asked: 12, answered: 12, fallbacks: {} }]);
  for (const i of [0, NBA_BATCH]) {
    const c = choices.get(facts[i].key)!;
    assert.deepEqual([c.action, c.inLibrary, c.claims, c.runnerUp], ['Offer a site assessment', true, [CLAIM], { action: 'Invite them to the plant tour', inLibrary: false, why: 'The next best fit for its signals.' }]);
  }
  const sent = fake.requests[0].messages[0].content;
  assert.match(sent, /^- "Offer a site assessment" · means: /m);
  assert.match(sent, /^- "Rejected: Wrong action \(R6\) · Engagement · Follow up on the topic they engaged with"$/m);
  assert.match(sent, new RegExp(`^- ${CLAIM}: `, 'm'));
});

test('actionStep: a claim that is not approved is repaired once, then the rules choose; off, it asks nothing', async () => {
  const facts = build().recs.slice(0, 3).map(r => factsOf(r));
  const bad = actionChooser(() => ({ action: 'Call to follow up on the inquiry', inLibrary: true, claims: ['XX-99'] }));
  const fake = new FakeModel([bad, bad]);
  const r = await actionStep(gateway(fake), CTX, facts, CONTEXT);
  assert.deepEqual([fake.requests.length, r.choices.size, r.stats.fallbacks], [2, 0, { grounding: 3 }]);
  assert.match(fake.requests[1].messages.at(-1)!.content, /ref 1 cites XX-99, which is not an approved claim on the list\./);
  const off = new FakeModel([]);
  const r2 = await actionStep(gateway(off, { next_action: false }), CTX, facts, CONTEXT);
  assert.deepEqual([off.requests.length, r2.stats.fallbacks], [0, { disabled: 3 }]);
});
