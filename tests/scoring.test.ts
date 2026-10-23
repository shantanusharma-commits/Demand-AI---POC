// Scoring screen helpers (Phase 4c, G-023): what would move a prospect up a tier is computed with the engine's own
// scoring, so the drawer never promises a tier a new signal would not reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../lib/demandai-engine.ts';
import { MOVE_TYPES, nextTierMoves, personScore } from '../lib/engine/prospects.ts';
import { AS_OF, loadDataset } from './helpers/answer-key.ts';

test('personScore is scoreList’s own sum for every scored person in the full sample', () => {
  const data = loadDataset();
  const list = E.processLeads(data.leadGrid, { file: 'f', sheet: 'Lead template' });
  const scored = E.scoreList(list, E.processSignals(data.signalGrid, list, { file: 'f', sheet: 'Signal template', asOf: AS_OF }));
  let n = 0;
  for (const r of scored) for (const p of r.people ?? []) {
    assert.deepEqual(personScore(r.fit as number, p.signals.map(s => s.weight as number)), { timing: p.timing, score: p.final, tier: p.tier });
    n++;
  }
  assert.ok(n > 1000, String(n));
});

test('nextTierMoves: one new strong signal today, worked out; a low fit can keep it below tier A', () => {
  // Fit 70 with one Webinar attended at full weight (60): timing 30, score 21 (B). An inquiry stacks 100 + 60/2.
  assert.deepEqual(personScore(70, [60]), { timing: 30, score: 21, tier: 'B' });
  assert.deepEqual(nextTierMoves(70, [60]).map(m => [m.type, m.score, m.tier]), [
    ['Inquiry or RFQ', 45.5, 'A'], ['Installed system near end of support', 45.5, 'A'], ['Capital project', 38.5, 'A']]);
  // At the fit floor (50) the same inquiry gives 32.5: tier B, not A. The original said any of them would reach A.
  assert.deepEqual(nextTierMoves(50, [60]).map(m => [m.score, m.tier]), [[32.5, 'B'], [32.5, 'B'], [27.5, 'B']]);
  assert.deepEqual(nextTierMoves(70, [60], ['Inquiry or RFQ']).map(m => m.type), MOVE_TYPES.slice(1), 'types they already have are left out');
  assert.deepEqual(nextTierMoves(80, []).map(m => m.tier), ['A', 'A', 'B'], 'from the watch list: the first strong signal puts it in a tier');
});
