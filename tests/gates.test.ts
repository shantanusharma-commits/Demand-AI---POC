// The success gates and their settings (lib/engine/gates.ts, D-21): a seeded decision log gives the expected weighted
// G2 and G1, flagged decisions count only once checked, below the agreed number of decisions a gate is "too early to
// call", the settings come from the configuration (out-of-range values read as the starting ones), and the readiness
// checks before measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../lib/demandai-engine.ts';
import * as G from '../lib/engine/gates.ts';
import * as R from '../lib/engine/review.ts';
import { AREA_VERDICTS, SPONSOR_DECISIONS } from '../lib/server/db/schema.ts';

const log = (p: Partial<R.LogFacts>): R.LogFacts => ({
  decisive: true, firstPass: true, accepted: true, kind: 'exception', flag: null, checked: false, segment: 'Inquiry', reason: '', cause: null,
  compliance: false, intervention: false, editRating: 'none', seconds: 60, ...p,
});
const times = (n: number, p: Partial<R.LogFacts>) => Array.from({ length: n }, () => log(p));
// 40 items went ahead on their own, 10 needed a person; 45 are released.
const items = [
  ...Array.from({ length: 40 }, () => ({ passed: true, status: 'Released', outcome: null })),
  ...Array.from({ length: 5 }, () => ({ passed: false, status: 'Released', outcome: null })),
  ...Array.from({ length: 5 }, () => ({ passed: false, status: 'Waiting', outcome: null })),
];
const settings = G.validationOf({});

test('a seeded log gives the expected G2: first pass, weighted by how many items took each path', () => {
  const logs = [
    ...times(4, { kind: 'spot', accepted: true }), ...times(1, { kind: 'spot', accepted: false, reason: 'Wrong action', cause: 'system' }),
    ...times(3, { kind: 'exception', accepted: true }), ...times(2, { kind: 'exception', accepted: false, reason: 'Wrong fit', cause: 'data' }),
    // Not first-pass: an alternative accepted after a rejection is reported apart.
    log({ kind: 'alternative', firstPass: false, accepted: true }),
    // Flagged and not checked: left out until a manager checks it.
    log({ kind: 'exception', accepted: false, flag: 'Decided in under 5 seconds', seconds: 2 }),
    // Not decisive: a system line never counts.
    log({ decisive: false, kind: 'system', firstPass: null, accepted: null, seconds: null }),
  ];
  const m = R.measure(items, logs, settings.g1BaselineMinutes);
  assert.deepEqual([m.autoN, m.excN], [40, 10]);
  assert.deepEqual([m.auto.a, m.auto.n, m.exc.a, m.exc.n, m.pooled.a, m.pooled.n], [4, 5, 3, 5, 7, 10]);
  assert.equal(m.weighted, 80 * 40 / 50 + 60 * 10 / 50);            // 76
  assert.deepEqual([m.alternatives.a, m.alternatives.n, m.flagged], [1, 1, 1]);
  const g = G.gates(m, settings);
  assert.deepEqual([g.g2.state, Math.round(g.g2.value!), g.g2.threshold, g.g2.n, g.g2.min], ['met', 76, 70, 10, 10]);
  assert.equal(G.gateLabel(g.g2), 'On track');
  // G1 (30 Oct 2026): 11 decisive decisions × 60 s + 2 s = 662 s over the 12 items a person handled (no longer over the
  // 45 released items, most of which nobody touched), against the 38-minute baseline.
  assert.equal(m.handled, 12);
  assert.equal(m.minutes, 662 / 60 / 12);
  assert.equal(Math.round(g.g1.value! * 100) / 100, Math.round((1 - 662 / 60 / 12 / 38) * 100 * 100) / 100);
  assert.equal(g.g1.state, 'met');
});

test('below the agreed number of counted decisions a gate is "too early to call"; a checked flag then counts', () => {
  const flagged = log({ kind: 'exception', accepted: true, flag: 'Run of identical decisions' });
  const nine = [...times(2, { kind: 'spot' }), ...times(3, { kind: 'spot', accepted: false }), ...times(4, { kind: 'exception', accepted: false }), flagged];
  const early = G.gates(R.measure(items, nine), settings);
  assert.deepEqual([early.g2.state, early.g2.n, early.g1.state], ['early', 9, 'early']);
  assert.equal(G.gateLabel(early.g2), 'Too early to call: 9 of 10');
  const checked = nine.map(l => (l === flagged ? { ...l, checked: true } : l));
  const ten = G.gates(R.measure(items, checked), settings);
  assert.deepEqual([ten.g2.state, ten.g2.n], ['below', 10]);
  // 40% on the spot path, 20% on the exceptions, weighted 40:10.
  assert.equal(ten.g2.value, 40 * 40 / 50 + 20 * 10 / 50);
  assert.equal(G.gateLabel(ten.g2), 'Below the threshold');
  // The unit's own minimum decides it.
  assert.equal(G.gates(R.measure(items, nine), { ...settings, minDecisions: 9 }).g2.state, 'below');
});

test('no decisions: neither gate has a value; G1 is not read off items that went ahead on their own', () => {
  const m = R.measure(items, []);
  assert.equal(m.saved, null, 'nobody handled anything: no G1 reading at all, whatever went ahead on its own');
  const g = G.gates(m, settings);
  assert.deepEqual([g.g1.value, g.g1.state, g.g2.value, g.g2.state], [null, 'none', null, 'none']);
  assert.equal(G.gateLabel(g.g1), 'No data yet');
});

test('the baseline and thresholds come from the configuration: a slower baseline moves G1, a higher bar moves G2', () => {
  const logs = [...times(6, { kind: 'spot', seconds: 600 }), ...times(4, { kind: 'exception', seconds: 600 })];
  const at38 = G.gates(R.measure(items, logs, 38), settings);
  const at2 = G.gates(R.measure(items, logs, 2), { ...settings, g1BaselineMinutes: 2 });
  assert.equal(at38.g1.state, 'met');
  assert.equal(at2.g1.state, 'below');                                   // 100 min / 10 items handled = 10 min against 2
  assert.equal(G.gates(R.measure(items, logs), { ...settings, g2Threshold: 100 }).g2.state, 'met');
  assert.equal(G.gates(R.measure(items, [...logs.slice(1), log({ kind: 'spot', accepted: false })]), { ...settings, g2Threshold: 100 }).g2.state, 'below');
  assert.deepEqual(R.trackRecord(logs, undefined, 20), { n: 10, a: 10, pct: 100, early: true });
});

test('settings: read from the configuration body, out-of-range values fall back, problems named per field, changes in words', () => {
  assert.deepEqual(G.validationOf({}), {
    g1BaselineMinutes: CONFIG.g1BaselineMinutes, g1BaselineTimed: false, g1Threshold: CONFIG.g1Threshold, g2Threshold: CONFIG.g2Threshold,
    minDecisions: CONFIG.minDecisions, spotCheckShare: CONFIG.spotCheckShare, dealSizeThreshold: CONFIG.dealSize.threshold,
  });
  // The deal-size threshold is a setting too (30 Oct 2026; was fixed for the pilot).
  const body = { g1BaselineMinutes: 42, g1BaselineTimed: true, g1Threshold: 55, g2Threshold: 75, minDecisions: 12, spotCheckShare: 0.25, dealSizeThreshold: 200_000 };
  assert.deepEqual(G.validationOf(body), body);
  assert.deepEqual(G.validationOf({ g1BaselineMinutes: 0, g2Threshold: 140, minDecisions: 2.5, spotCheckShare: 3, g1BaselineTimed: 'yes' }), G.validationOf({}));
  assert.equal(G.validationProblem({ g2Threshold: 75, minDecisions: 12 }), null);
  assert.deepEqual(Object.keys(G.validationProblem({ g1BaselineMinutes: -1, minDecisions: 1.5, spotCheckShare: 0 })!).sort(), ['g1BaselineMinutes', 'minDecisions', 'spotCheckShare']);
  assert.deepEqual(G.validationChanges(G.validationOf({}), G.validationOf(body)), [
    'G1 baseline 38 → 42 min per usable first action', 'Baseline marked as timed by the Client', 'G1 threshold 50% → 55% less',
    'G2 threshold 70% → 75% accepted', 'Too early to call below 10 → 12 decisions', 'Weekly spot-check 20% → 25% of items that proceeded',
    'Deal-size threshold USD 250k → 200k',
  ]);
  assert.deepEqual(G.validationChanges(settings, settings), []);
});

test('readiness before measurement: each check against its agreed level; the baseline passes only once the Client timed it', () => {
  const facts: G.PilotFacts = { accounts: 40, contactable: 30, covered: 10, qualified: 20, recent: 15, noProof: ['Offer a renewal review'], actions: 15 };
  const checks = G.pilotReadiness(facts, settings);
  assert.deepEqual(checks.map(c => [c.k, c.ok]), [
    ['Contactability', true], ['Signal coverage', false], ['Recency', true], ['Collateral', false], ['Baseline', false],
  ]);
  assert.equal(checks[0].show, '75% of accounts');
  assert.equal(checks[3].fix, 'Proof for: Offer a renewal review');
  assert.equal(G.pilotVerdict(checks), 'Not yet sufficient');
  assert.equal(G.pilotReadiness(facts, { ...settings, g1BaselineTimed: true }).at(-1)!.ok, true);
  assert.equal(G.pilotReadiness({ ...facts, qualified: 0, recent: 0 }, settings)[2].ok, false, 'no qualified signals: recency fails');
  // No minimum number of accounts (27 Oct 2026): a handful of well-covered accounts is ready on every data check.
  const few = G.pilotReadiness({ accounts: 4, contactable: 4, covered: 4, qualified: 4, recent: 4, noProof: [], actions: 15 }, { ...settings, g1BaselineTimed: true });
  assert.ok(few.every(c => c.ok), JSON.stringify(few.filter(c => !c.ok)));
  assert.equal(G.pilotVerdict(G.pilotReadiness({ ...facts, covered: 30, noProof: [] }, settings)), 'Sufficient with gaps');
});

test('the readout verdicts the screens offer are the ones the database accepts', () => {
  assert.deepEqual([...G.AREA_VERDICTS], [...AREA_VERDICTS]);
  assert.deepEqual([...G.SPONSOR_DECISIONS], [...SPONSOR_DECISIONS]);
});
