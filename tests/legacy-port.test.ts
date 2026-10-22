// The legacy engine's own tests (legacy/engine.test.js), ported to the TypeScript engine as each part is ported
// (G-053). Where the legacy test drove browser storage, the TypeScript engine takes the same settings as arguments;
// storing them (who switched what, when and why) is the server's job (Setup, Phase 5a).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../lib/demandai-engine.ts';
import * as S from '../lib/demandai-sample-data.ts';

const leads = () => E.processLeads(S.LEADS, { file: 'l', sheet: 's' });
const list = (L = leads()) => ({ accounts: L.accounts, contacts: JSON.parse(JSON.stringify(L.contacts)) });

// legacy engine.test.js:425
test('a signal switched off in Setup is not scored in new runs (OFF code)', () => {
  const sig = E.processSignals(S.SIGNALS, list(), { asOf: S.SAMPLE_AS_OF, off: ['Leadership change'] });
  const off = sig.signals.filter(s => s.code === 'OFF');
  assert.ok(off.length > 0 && off.every(s => s.type === 'Leadership change' && s.status === 'Rejected'));
  assert.ok(sig.issues.some(i => i.code === 'OFF'));
  assert.equal(E.CODES.OFF, 'Switched off in Setup');
  const on = E.processSignals(S.SIGNALS, list(), { asOf: S.SAMPLE_AS_OF });
  assert.equal(on.signals.filter(s => s.code === 'OFF').length, 0, 'switched back on: scored again');
});

// legacy engine.test.js:443
test('a signal type added in Setup is scored in runs that include it, and only those', () => {
  const grid = S.SIGNALS.concat([['Northwind Refining', 'aditi.rao@northwindrefining.com', 'Trade show visit', '2026-09-20', 'Visited the stand', 'Events team', '']]);
  const added: E.CustomSignalType = { name: 'Trade show visit', segment: 'Engagement', level: 'Light', full: 30, zero: 120 };
  assert.match(E.customSignalProblem({ ...added, segment: 'Nope' }) ?? '', /micro-segment/);
  assert.match(E.customSignalProblem({ ...added, name: 'webinar ATTENDED' }) ?? '', /already a signal type/);
  assert.match(E.customSignalProblem({ ...added, full: 30, zero: 10 }) ?? '', /longer/);
  assert.equal(E.customSignalProblem(added), null);
  const old = E.processSignals(grid, list(), { asOf: S.SAMPLE_AS_OF });
  assert.equal(old.signals.find(s => s.type === 'Trade show visit')!.code, 'D3');
  const now = E.processSignals(grid, list(), { asOf: S.SAMPLE_AS_OF, custom: [added] });
  const t = now.signals.find(s => s.type === 'Trade show visit')!;
  assert.equal(t.status, 'Qualified');
  assert.equal(t.segment, 'Engagement');
  assert.equal(t.tier, 30);
  assert.equal(E.CONFIG.signalTypes['Trade show visit'], undefined, 'the shared configuration is never changed');
});
