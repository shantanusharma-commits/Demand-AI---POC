// For Review rules ported from legacy/demandai-nba.js (lib/engine/review.ts): what each rejection brings back (with R3,
// D-18 / G-062), the edit rating, why an item needs a person and by when, the integrity flags and the measures.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../lib/demandai-engine.ts';
import * as S from '../lib/demandai-sample-data.ts';
import * as N from '../lib/engine/nba.ts';
import * as R from '../lib/engine/review.ts';
import { REC_STATUSES, REC_WHY, REC_OUTCOMES, REJECT_CODES } from '../lib/server/db/schema.ts';

const brand = N.defaultBrand();
function recs() {
  const r = N.processScoredProspects(S.nbaScenarioGrid(S.SAMPLE_AS_OF), { asOf: S.SAMPLE_AS_OF });
  return N.buildSegments(r.results).recs;
}
const st = (p: Partial<R.RecState> = {}): R.RecState => ({ ...R.initialState(), ...p });

test('the database checks and the rules name the same statuses, outcomes and rejection codes', () => {
  assert.deepEqual([...REC_STATUSES], [...R.REC_STATUSES]);
  assert.deepEqual([...REC_WHY], [...R.REC_WHY]);
  assert.deepEqual([...REC_OUTCOMES], [...R.OUTCOMES]);
  assert.deepEqual([...REJECT_CODES].sort(), [...R.REJECT_CODES].sort());
});

test('G-062 / D-18: R3 "Wrong company or site" is offered; it sets the account aside and flags the data for its owner', () => {
  const r3 = R.REJECT.find(x => x[0] === 'R3')!;
  assert.deepEqual(r3, ['R3', 'Wrong company or site', 'The account is set aside and the data is flagged for its owner']);
  assert.equal(R.causeOf('R3'), 'data');
  const r = recs()[0];
  const f = R.rejectFollowUp('R3', r, st(), { channel: 'Email' });
  assert.deepEqual([f.patch.status, f.patch.rejectCode, f.outcome, f.redraft], ['Set aside', 'R3', 'The account is set aside and the data is flagged for its owner', null]);
  assert.equal(R.REJECT.length, 12, 'R1 to R12');
});

test('step 6–7: a rejection brings back one alternative (runner-up, next contact, next channel, a new draft); a second closes the account', () => {
  const all = recs();
  const withRunner = all.find(r => r.runnerUp)!;
  const r6 = R.rejectFollowUp('R6', withRunner, st(), { channel: 'Email' });
  assert.deepEqual([r6.patch.useRunnerUp, r6.patch.status, r6.patch.why, r6.patch.alternativeUsed], [true, 'Waiting', 'alternative', true]);
  assert.match(r6.patch.alternativeOf!, /\(Email\)$/);
  for (const [code, variant] of [['R9', 'alt'], ['R10', 'tone'], ['R11', 'short']] as const) assert.equal(R.rejectFollowUp(code, withRunner, st(), { channel: 'Email' }).patch.variant, variant);
  const second = R.rejectFollowUp('R9', withRunner, st({ alternativeUsed: true }), { channel: 'Email' });
  assert.deepEqual([second.patch.status, second.outcome], ['Closed', 'Second rejection: the account is closed for the pilot']);
  // R7: the next contact who isn't opted out, primary persona first; none left closes it.
  const many = all.find(r => (r.result.people || []).filter(p => p.contact.row !== r.contact.row && !p.contact.optOut).length > 0);
  if (many) {
    const r7 = R.rejectFollowUp('R7', many, st(), { channel: 'Email' });
    assert.notEqual(r7.patch.contactRow, many.contact.row);
    assert.match(r7.outcome, /^The next contact comes back: /);
  }
  const alone = all.find(r => (r.result.people || []).every(p => p.contact.row === r.contact.row))!;
  assert.deepEqual([R.rejectFollowUp('R7', alone, st(), { channel: 'Email' }).patch.status], ['Closed']);
  // R8 only moves to a channel the contact allows (G-007); a task has none.
  assert.equal(R.rejectFollowUp('R8', withRunner, st(), { channel: 'Task' }).patch.status, 'Closed');
  for (const [code, status] of [['R1', 'Set aside'], ['R2', 'Set aside'], ['R4', 'Closed'], ['R5', 'Watch list'], ['R12', 'Closed']] as const) {
    assert.equal(R.rejectFollowUp(code, withRunner, st(), { channel: 'Email' }).patch.status, status, code);
  }
});

test('step 4: an edit to wording is minor; a change to the facts or the ask is major', () => {
  const base: Partial<N.Draft> = { channel: 'Email', subject: 'your question', body: 'Hi Ana,\n\nThanks for your question about the DCS upgrade at Siam Refining.\n\nWould a 20-minute call this week help?\n\nBest,\nClient Team' };
  assert.equal(R.editRating(base, { ...base, body: base.body!.replace('Thanks for', 'Thank you for') }).rating, 'minor');
  assert.deepEqual(R.editRating(base, { ...base, body: base.body!.replace('20-minute', '45-minute') }), { changed: 1, rating: 'major', why: 'facts and the ask changed' });
  assert.equal(R.editRating(base, { ...base, body: base.body!.replace('this week help?', 'next week help?') }).why, 'the ask changed');
  assert.equal(R.editRating(base, { ...base, body: base.body!.replace('Siam Refining', 'Andaman Petroleum') }).why, 'facts changed');
  const edited = R.withEdits(base as N.Draft, { body: 'Hi Ana, short.', note: 'ignored for email' });
  assert.deepEqual([edited.body, edited.words, edited.note], ['Hi Ana, short.', 3, undefined]);
});

test('why it needs a person: reasons become categories, a fixed reason drops out, a contact found clears "can’t reach"', () => {
  const rs = ['Segment too small', 'Low confidence: no contact in the primary persona', "Can't reach them: Opt-out not confirmed"];
  assert.deepEqual(R.reasonCats(st({ reasons: rs }), { reasons: rs, unreachable: true }), ['small', 'low', 'reach']);
  assert.deepEqual(R.reasonCats(st({ reasons: rs, fixed: ['small', 'low'] }), { reasons: rs, unreachable: false }), ['fixed']);
  assert.deepEqual(R.reasonCats(st({ spot: 'pending', reasons: rs }), { reasons: rs, unreachable: true }), ['spot']);
  assert.deepEqual(R.reasonCats(st({ why: 'alternative' }), { reasons: [], unreachable: false }), ['alternative']);
  assert.deepEqual(R.fourChecks(['Sensitive content']).filter(([, ok]) => !ok).map(([k]) => k), ['Sensitive content']);
});

test('the exception check: sensitive content, a claim with no source and an unreachable contact each stop an item', () => {
  const r = recs().find(x => x.segment)!;
  const d = R.generatedDraft(r, st(), brand, S.SAMPLE_AS_OF);
  const sensitive = { ...d, body: (d.body || '') + '\n\nThis follows the recent incident on site.' };
  assert.ok(R.exceptionReasons(r, sensitive, N.checkDraft(sensitive, brand, S.SAMPLE_AS_OF)).includes('Sensitive content'));
  const claim = { ...d, body: (d.body || '') + '\n\nIt reduces downtime by 40%.' };
  assert.ok(R.exceptionReasons(r, claim, N.checkDraft(claim, brand, S.SAMPLE_AS_OF)).includes("A claim can't be verified"));
  const unreachable = { ...d, unreachable: true, why: 'Opt-out not confirmed: a person must confirm before anything is sent.' };
  assert.ok(R.exceptionReasons(r, unreachable, N.checkDraft(d, brand, S.SAMPLE_AS_OF)).some(t => t === "Can't reach them: Opt-out not confirmed: a person must confirm before anything is sent"));
});

test('review by when: same day for sensitive content and inquiries (next working day after 3 pm); spot-checks by Friday', () => {
  const at = (y: number, m: number, d: number, h: number) => +new Date(y, m - 1, d, h, 0, 0);
  // Wednesday 21 Oct 2026, 10:00 local.
  assert.equal(R.dueOf({ cats: ['sensitive'], segment: null, spot: null, routedAt: at(2026, 10, 21, 10) }), at(2026, 10, 21, 17));
  assert.equal(R.dueOf({ cats: ['sensitive'], segment: null, spot: null, routedAt: at(2026, 10, 21, 16) }), at(2026, 10, 22, 17));
  assert.equal(R.dueOf({ cats: ['deal'], segment: 'Inquiry', spot: null, routedAt: at(2026, 10, 21, 10) }), at(2026, 10, 21, 17));
  // Two working days from Thursday skips the weekend: Monday.
  assert.equal(R.dueOf({ cats: ['claim'], segment: null, spot: null, routedAt: at(2026, 10, 22, 10) }), at(2026, 10, 26, 17));
  assert.equal(R.dueOf({ cats: ['other'], segment: null, spot: 'pending', routedAt: at(2026, 10, 20, 9) }), at(2026, 10, 23, 17));
  assert.equal(R.dueBucket(at(2026, 10, 21, 17), at(2026, 10, 21, 18)), 'overdue');
  assert.equal(R.dueBucket(at(2026, 10, 22, 17), at(2026, 10, 21, 9)), 'tomorrow');
});

test('integrity flags: a decision in under 5 seconds, and the fifth identical decision in a row', () => {
  assert.equal(R.integrityFlag(3, 'Accepted', []), 'Decided in under 5 seconds');
  assert.equal(R.integrityFlag(30, 'Accepted with a minor edit', ['Accepted', 'Accepted', 'Accepted with a major edit', 'Accepted']), 'Run of identical decisions');
  assert.equal(R.integrityFlag(2, 'Rejected: Wrong fit', Array(4).fill('Rejected: Wrong fit')), 'Decided in under 5 seconds · run of identical decisions');
  assert.equal(R.integrityFlag(30, 'Accepted', ['Accepted', 'Rejected: Wrong fit', 'Accepted', 'Accepted']), '');
  assert.equal(R.integrityFlag(null, 'Accepted', []), '');
});

test('G2 weighted by path and the track record count a flagged decision only once a manager has checked it', () => {
  const l = (p: Partial<R.LogFacts>): R.LogFacts => ({ decisive: true, firstPass: true, accepted: true, kind: 'exception', flag: null, checked: false, segment: 'Inquiry',
    reason: '', cause: null, compliance: false, intervention: false, editRating: 'none', seconds: 120, ...p });
  const logs = [l({}), l({ accepted: false, reason: 'Wrong fit', cause: 'data' }), l({ kind: 'spot' }), l({ flag: 'Decided in under 5 seconds' }), l({ flag: 'Run of identical decisions', checked: true })];
  const items = [{ passed: true, status: 'Released', outcome: null }, { passed: false, status: 'Released', outcome: 'Replied' }, { passed: false, status: 'Closed', outcome: null }, { passed: false, status: 'Waiting', outcome: null }];
  const m = R.measure(items, logs);
  assert.deepEqual([m.exc.n, m.exc.a, m.auto.n, m.flagged], [3, 2, 1, 1]);
  assert.equal(Math.round(m.weighted!), Math.round(100 * 1 / 4 + (2 / 3 * 100) * 3 / 4));
  assert.deepEqual(m.causes, { data: 1, system: 0, other: 0 });
  assert.equal(m.minutes, (120 * 5) / 60 / 2);
  assert.deepEqual(R.trackRecord(logs, 'Inquiry'), { n: 4, a: 3, pct: 75, early: true });
});

test('a booked meeting brings a call script built from what was sent, why now and the proof', () => {
  const r = recs().find(x => x.segment)!;
  const d = R.generatedDraft(r, st(), brand, S.SAMPLE_AS_OF);
  const s = R.meetingScript(r, st(), d, brand, S.SAMPLE_AS_OF);
  assert.match(s.opener, /^Hi \S+, thanks for making the time\. We reached out with /);
  assert.equal(s.agenda.length, 3);
  assert.match(s.ask, /^Close on a next step: .*, with a date in the next two weeks\.$/);
  assert.ok(E.CONFIG.reviewDue.sensitive === 0 && E.CONFIG.spotCheckShare === 0.2);
});

// Testers (28 Oct 2026): "Show me" and "Remove that sentence" did nothing on a message about "cybersecurity": the
// check matched "cyber" at the start of the word, the highlight wanted "cyber" as a whole word, so nothing was found.
test('the sensitive words For Review highlights are the ones the check flags, as whole words', () => {
  assert.equal(R.SENSITIVE_RE, N.BRAND_RULES.sensitive, 'one rule');
  const body = 'Thanks for joining our session on cybersecurity for refinery control systems. Happy to go one level deeper.';
  assert.ok(N.checkDraft({ channel: 'Email', subject: 'after the session', body }).flags.some(f => f.rule === 'Sensitive term'));
  assert.deepEqual(body.match(new RegExp(R.SENSITIVE_RE.source, 'gi')), ['cybersecurity']);
  assert.deepEqual('An incident, new regulations and emissions.'.match(new RegExp(R.SENSITIVE_RE.source, 'gi')), ['incident', 'regulations', 'emissions']);
  assert.equal(R.SENSITIVE_RE.test('Secure your site'), false, '"secure" is not "security"');
  const r = R.stuck(recs()[0], st(), { channel: 'Email', subject: 'hi', body, why: '', proof: null, noProof: false, unreachable: false } as N.Draft,
    N.checkDraft({ channel: 'Email', subject: 'hi', body }), ['sensitive']);
  assert.match(r.line, /mentions “cybersecurity”/);
});

// Since 28 Oct 2026 an approved claim goes out word for word without a citation; older drafts keep theirs.
test('an approved claim is verified word for word with no citation; an old citation is still read; anything else is unsupported', () => {
  const c = N.COLLATERAL.find(x => x.id === 'CS-01')!, wrap = (mid: string) => ({ channel: 'Email', subject: 'your question', body: `Hi Pat,\n\nThanks for asking.\n\n${mid}\n\nWorth a call?\n\nBest,\nClient Team` });
  const plain = N.checkDraft(wrap(c.claim), brand, S.SAMPLE_AS_OF);
  assert.deepEqual([plain.claims.length, plain.unsupported.length, plain.claims[0].source], [1, 0, `${c.id} · ${c.title}`]);
  const old = N.checkDraft(wrap(`${c.claim} [${c.type}, ${c.year}]`), brand, S.SAMPLE_AS_OF);
  assert.deepEqual([old.claims.length, old.unsupported.length], [1, 0], 'the citation is part of the claim, not a claim of its own');
  const expired = N.checkDraft(wrap(c.claim), brand, '2099-01-01');
  assert.match(expired.unsupported[0].reason!, /expired on/);
  const made = N.checkDraft(wrap('Our platform cuts downtime by 30%.'), brand, S.SAMPLE_AS_OF);
  assert.deepEqual(made.unsupported.map(u => u.text), ['Our platform cuts downtime by 30%.']);
  const cited = N.checkDraft(wrap('A refinery did well. [Case study, 2025]'), brand, S.SAMPLE_AS_OF);
  assert.deepEqual(cited.unsupported.map(u => u.text), ['A refinery did well.'], 'a citation on words that are not an approved claim');
});
