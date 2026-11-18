/* Engine tests. Run: node --test prototype/tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const CFG = require('../js/config.js');

const NOW = '2026-11-18T06:00:00';
const daysAgo = d => new Date(new Date(NOW).getTime() - d * E.DAY).toISOString().slice(0, 10);
const sig = (o) => Object.assign({ id: 'x' + Math.random(), code: 'Co1', tier: 1, strength: 5, observable: true, predictive: true, timeBound: true, eventDate: daysAgo(1), sourceName: 'Source', sourceUrl: 'https://example.com' }, o);

test('worked example: timing 38.15 and rank 3,052', () => {
  const timing = E.stack([6.25, 34.5, 2.1]);
  assert.equal(timing, 38.15);
  assert.equal(E.rankOf(80, timing), 3052);
});

test('fit 95 with no live signal ranks 0', () => {
  assert.equal(E.rankOf(95, E.stack([])), 0);
});

test('signal tier 1: full for 3 days, near zero by day 14', () => {
  assert.equal(E.decayFactor(1, 2, CFG), 1);
  assert.equal(E.decayFactor(1, 3, CFG), 1);
  assert.ok(E.decayFactor(1, 13, CFG) < 0.1);
  assert.equal(E.decayFactor(1, 14, CFG), 0);
});

test('signal tier 3 still counts at day 60', () => {
  assert.equal(E.decayFactor(3, 60, CFG), 1);
  assert.ok(E.decayFactor(3, 75, CFG) > 0);
});

test('strength maps 1..5 to 0.6..1.0, default 3 is 0.8', () => {
  assert.equal(E.strengthFactor(1, CFG), 0.6);
  assert.equal(E.strengthFactor(5, CFG), 1);
  assert.equal(E.strengthFactor(undefined, CFG), 0.8);
});

test('a date in the text overrides the window ("budget frozen to April")', () => {
  const s = sig({ tier: 3, eventDate: daysAgo(10), expiresOn: '2027-04-30' });
  assert.ok(E.signalValue(s, NOW, CFG).value > 0);
  assert.equal(E.signalValue(s, '2027-05-01T06:00:00', CFG).value, 0);
});

test('qualification filter records the failed test', () => {
  assert.equal(E.qualify(sig({ timeBound: false })).failed, 'Time-bound');
  assert.equal(E.qualify(sig({ observable: false })).failed, 'Observable');
  assert.equal(E.qualify(sig({})).ok, true);
});

test('two sources reporting one event give one signal', () => {
  const r = E.scoreSignals([sig({ id: 'a', eventId: 'e1' }), sig({ id: 'b', eventId: 'e1', sourceName: 'Other' })], NOW, CFG);
  assert.equal(r.live.length, 1);
  assert.equal(r.live[0].sources.length, 2);
});

test('entry gate: repeats within 30 days count 0.5, 0.25, then less', () => {
  const s = [0, 1, 2, 3, 4].map(i => sig({ id: 'r' + i, eventId: 'r' + i, code: 'Co2', tier: 2, eventDate: daysAgo(10 - i) }));
  const f = E.repeatFactors(s, CFG);
  assert.deepEqual(s.map(x => f.get(x.id).factor), [1, 0.5, 0.25, 0.15, 0.1]);
});

test('stacking: one strong signal outweighs a pile of weak ones', () => {
  assert.ok(E.stack([100]) > E.stack([20, 20, 20, 20, 20, 20]));
});

test('account tiers by percentile: A top 15%, B next 25%', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: 'a' + i, rank: 100 - i }));
  const t = E.assignTiers(rows, CFG);
  const count = k => [...t.tiers.values()].filter(v => v.tier === k).length;
  assert.equal(count('A'), 3); assert.equal(count('B'), 5); assert.equal(count('C'), 12);
});

test('missing key attribute holds the account unranked', () => {
  const icp = { criteria: [{ label: 'Niche', attr: 'niche', type: 'in', values: ['LNG terminal'], weight: 1, key: true }] };
  assert.equal(E.fitScore({ attributes: {} }, icp).fit, null);
  assert.equal(E.fitScore({ attributes: { niche: 'LNG terminal' } }, icp).fit, 100);
});

test('NBC rule: 11 in one microsegment within 7 days raise a flag; 9 do not', () => {
  const mk = (n, seg) => Array.from({ length: n }, (_, i) => ({ id: seg + i, rank: 10, microsegment: seg, top: { eventDate: daysAgo(2) } }));
  const r = E.nbcFlags(mk(11, 'A').concat(mk(9, 'B')), NOW, CFG);
  assert.equal(r.flags.length, 1);
  assert.equal(r.flags[0].microsegment, 'A');
});

const base = { protective: { ran: true, ok: true }, identityTier: 'I1', conf: { band: 'High', value: 0.8 }, verify: { ok: true, issues: [] }, policy: 'assisted', hasDraft: true, channel: 'Email' };
test('all five criteria met: ready to send, no card', () => {
  assert.equal(E.evaluate(base).route, 'ready');
});
test('identity tier I3: approval card naming the identity criterion', () => {
  const r = E.evaluate(Object.assign({}, base, { identityTier: 'I3' }));
  assert.equal(r.route, 'card'); assert.equal(r.escalation, 3);
  assert.match(r.reason, /Identity tier/);
});
test('low confidence: nurture, not an escalation', () => {
  const r = E.evaluate(Object.assign({}, base, { conf: { band: 'Low', value: 0.4 } }));
  assert.equal(r.route, 'nurture'); assert.equal(r.escalation, null);
});
test('protective check cannot run: held with the reason (fail closed)', () => {
  const r = E.evaluate(Object.assign({}, base, { protective: { ran: false, ok: false, reason: 'CRM unreachable' } }));
  assert.equal(r.route, 'held'); assert.equal(r.escalation, 5);
});
test('message verification blocks a banned phrase and an unsupported figure', () => {
  const lib = { banned: ['best-in-class'], claims: [{ id: 'C1' }] };
  assert.equal(E.verifyDraft('We are best-in-class.', lib, []).ok, false);
  assert.equal(E.verifyDraft('It cut downtime by 30%.', lib, []).ok, false);
  assert.equal(E.verifyDraft('It cut downtime by 30% [C1].', lib, []).ok, true);
});
test('an edit is stored as a diff', () => {
  const d = E.wordDiff('Hello there Anna', 'Hello Anna');
  assert.ok(d.some(p => p.op === '-' && /there/.test(p.text)));
});
