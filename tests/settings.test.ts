// Editable scoring settings (Setup › ICP and rubric, 30 Oct 2026): the starting values score exactly as before (the
// answer-key test holds that on the whole sample); a changed rubric, an added part, vertical levels, personas, knock-outs
// and signal weights change the score as Setup says; a body that breaks the rules is refused with the reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../lib/demandai-engine.ts';
import { ScoringSettingsInput, editableCopy, newPart, scoringChanges, scoringSettingsOf } from '../lib/engine/settings.ts';
import { DemandAISample as S } from '../lib/demandai-sample-data.ts';

const leads = E.processLeads(S.LEADS, { file: 'sample', sheet: 'Lead template' });
const list = { accounts: leads.accounts, contacts: leads.contacts };
const contactsOf = (a: E.Account) => leads.contacts.filter(c => c.accountId === a.id);
const scorable = leads.accounts.filter(a => !a.excluded);

test('settings: the starting values give the same fit as before, part for part', () => {
  const copy = editableCopy(E.DEFAULT_SCORING);
  assert.notEqual(copy, E.DEFAULT_SCORING, 'an editable copy, never the defaults themselves');
  for (const a of scorable) assert.deepEqual(E.fitFor(a, contactsOf(a), copy), E.fitFor(a, contactsOf(a)), a.name);
  assert.equal(scoringSettingsOf({}), E.DEFAULT_SCORING, 'a body without settings scores with the starting values');
  assert.equal(scoringSettingsOf(null), E.DEFAULT_SCORING);
});

test('settings: weights, level points and an added part change the fit as Setup says', () => {
  const a = scorable[0], cs = contactsOf(a);
  const s = editableCopy(E.DEFAULT_SCORING);
  // Size counts for nothing; vertical takes its weight. Owner-operators score 50 instead of 100.
  s.parts.find(p => p.key === 'size')!.weight = 0;
  s.parts.find(p => p.key === 'vertical')!.weight = 50;
  s.parts.find(p => p.key === 'accountType')!.levels!['owner-operator'] = 50;
  const f = E.fitFor(a, cs, s);
  const v = f.breakdown.find(r => r.key === 'vertical')!, size = f.breakdown.find(r => r.key === 'size')!;
  assert.equal(size.points, 0);
  assert.equal(v.points, v.level * 50 / 100);
  assert.equal(f.fit, E.round1(f.breakdown.reduce((t, r) => t + r.points, 0)));
  // An added part reads a lead-file column: Singapore 100 points, else 20.
  const t = editableCopy(E.DEFAULT_SCORING);
  t.parts.find(p => p.key === 'contacts')!.weight = 0;
  t.parts.push({ ...newPart(t.parts, 'Home market'), weight: 5, column: 'country', rules: [{ when: 'is', value: 'singapore', points: 100 }], otherwise: 20 });
  const sg = scorable.find(x => x.country === 'Singapore'), other = scorable.find(x => x.country && x.country !== 'Singapore');
  assert.ok(sg && other, 'the sample has both');
  const row = (x: E.Account) => E.fitFor(x, contactsOf(x), t).breakdown.find(r => r.key === 'x-home-market')!;
  assert.deepEqual([row(sg).level, row(sg).levelLabel, row(sg).why], [100, 'is singapore', 'Country: Singapore']);
  assert.deepEqual([row(other).level, row(other).levelLabel], [20, 'No rule matched']);
  assert.equal(row(sg).points, 5);
});

test('settings: number rules, yes and blank; a vertical made core and a tier cut-off moved', () => {
  const a = scorable.find(x => x.revenue !== null)!;
  const part = (rules: E.PartRule[]) => ({ key: 'x-r', label: 'R', weight: 100, column: 'annual_revenue_usd', rules, otherwise: 7 });
  assert.equal(E.partRuleLevel(part([{ when: 'atLeast', value: String(a.revenue), points: 90 }]), a).level, 90);
  assert.equal(E.partRuleLevel(part([{ when: 'below', value: String(a.revenue), points: 90 }]), a).level, 7);
  assert.equal(E.partRuleLevel({ ...part([{ when: 'no', value: '', points: 55 }]), column: 'existing_customer' }, { ...a, existingCustomer: false }).level, 55);
  assert.equal(E.partRuleLevel({ ...part([{ when: 'blank', value: '', points: 66 }]), column: 'city' }, { ...a, city: '' }).level, 66);
  const petro = scorable.find(x => x.vertical === 'Petrochemicals')!;
  const s = editableCopy(E.DEFAULT_SCORING);
  s.verticals.find(v => v.name === 'Petrochemicals')!.level = 'core';
  assert.equal(E.fitFor(petro, contactsOf(petro), s).breakdown[0].level, 100, 'Petrochemicals now counts as core');
  assert.equal(E.tierFor(30, true), 'B');
  assert.equal(E.tierFor(30, true, { A: 30, B: 10 }), 'A');
});

test('settings: added vertical words, persona phrases and knock-outs apply when a lead file is processed', () => {
  const s = editableCopy(E.DEFAULT_SCORING);
  s.verticals.push({ name: 'Pharmaceuticals', level: 'core', words: ['pharma'] });
  assert.deepEqual([E.classify('Pharma manufacturing', '', undefined, s).vertical, E.classify('Pharma manufacturing', '', undefined, s).level], ['Pharmaceuticals', 'core']);
  assert.equal(E.classify('Pharma manufacturing', '').vertical, 'Other', 'not without the setting');
  s.personas.primary.push('process engineer');
  assert.equal(E.personaOf('Senior Process Engineer', s.personas), 'Primary');
  assert.equal(E.personaOf('Senior Process Engineer'), 'None');
  // Starting terms overlap ("Instrumentation" and "Instr."): switched off, every term the title matches.
  s.personas.off.push(...E.CONFIG.personas.primary.filter(re => re.test('Head of Instrumentation')).map(re => re.source));
  assert.equal(E.personaOf('Head of Instrumentation', s.personas), 'None', 'starting terms switched off');
  const outside = leads.accounts.filter(a => a.excluded && /pilot region/.test(a.excludedReason));
  assert.ok(outside.length, 'the sample has accounts outside the region');
  s.knockouts.region = false;
  const again = E.processLeads(S.LEADS, { file: 'sample', sheet: 'Lead template', settings: s });
  for (const a of outside) {
    const b = again.accounts.find(x => x.key === a.key)!;
    assert.ok(!/pilot region/.test(b.excludedReason), `${a.name}: no longer knocked out for its region`);
    assert.match(b.checks[0].why, /switched off in Setup/);
  }
});

test('settings: a starting signal type counts as Setup says; the installed-base knock-out can be switched off', () => {
  const s = editableCopy(E.DEFAULT_SCORING);
  s.signals['Leadership change'] = { tier: 100, strength: 1, full: 60, zero: 400 };
  const sig = E.processSignals(S.SIGNALS, list, { asOf: S.SAMPLE_AS_OF, settings: s });
  const before = E.processSignals(S.SIGNALS, list, { asOf: S.SAMPLE_AS_OF });
  const lead = (r: E.SignalResult) => r.signals.find(x => x.type === 'Leadership change' && x.status === 'Qualified')!;
  assert.ok(lead(sig).weight! > lead(before).weight!, 'weighs more');
  assert.ok(before.knockouts.size > 0);
  s.knockouts.installed = false;
  const off = E.processSignals(S.SIGNALS, list, { asOf: S.SAMPLE_AS_OF, settings: s });
  assert.equal(off.knockouts.size, 0);
  assert.ok(off.signals.some(x => x.status === 'Not used' && /switched off in Setup/.test(x.reason)));
  assert.equal(E.CONFIG.signalTypes['Leadership change'].tier, 60, 'the shared configuration is never changed');
});

test('settings: a body that breaks the rules is refused, with the reason a person can act on', () => {
  const ok = editableCopy(E.DEFAULT_SCORING);
  assert.ok(ScoringSettingsInput.safeParse(ok).success);
  const bad = (f: (s: E.ScoringSettings) => void, re: RegExp) => {
    const s = editableCopy(E.DEFAULT_SCORING); f(s);
    assert.throws(() => scoringSettingsOf({ scoring: s }), re);
  };
  bad(s => { s.parts[0].weight = 25; }, /add up to 95%/);
  bad(s => { s.tiers = { A: 20, B: 30 }; }, /Tier B must start below tier A/);
  bad(s => { s.parts.push({ ...newPart(s.parts, 'Plant age'), weight: 0, column: 'nope', rules: [{ when: 'is', value: 'x', points: 10 }] }); }, /lead-file column/);
  bad(s => { s.parts.push({ ...newPart(s.parts, 'Plant age'), weight: 0 }); }, /what value the rule looks for/);
  bad(s => { s.parts.push({ ...newPart(s.parts, 'Plant age'), weight: 0, rules: [{ when: 'atLeast', value: 'big', points: 10 }] }); }, /need a number/);
  bad(s => { s.signals['Newsletter sign-up'] = { tier: 50, strength: 1, full: 10, zero: 20 }; }, /not a starting signal type/);
  bad(s => { s.knockouts.region = true; s.countries = []; }, /at least one country/);
  bad(s => { s.verticals.push({ name: 'Other', level: 'core', words: [] }); }, /kept by the system/);
});

test('settings: what changed between two versions, in words', () => {
  const a = editableCopy(E.DEFAULT_SCORING), b = editableCopy(E.DEFAULT_SCORING);
  b.parts.find(p => p.key === 'size')!.weight = 10;
  b.parts.push({ ...newPart(b.parts, 'Plant age'), weight: 10, column: 'site_capacity', rules: [{ when: 'atLeast', value: '100', points: 80 }], otherwise: 0 });
  b.fitFloor = 45; b.tiers.A = 40; b.knockouts.managed = false; b.countries.push('Brunei');
  b.verticals.find(v => v.name === 'Refining')!.level = 'adjacent';
  b.personas.primary.push('Process engineer');
  b.signals['Inquiry or RFQ'] = { tier: 80, strength: 1, full: 45, zero: 90 };
  const words = scoringChanges(a, b);
  for (const w of ['Company size weight: 20% → 10%', 'Part added: Plant age (10%, reads Site capacity)', 'Fit floor: 50 → 45', 'Tier A from: 35 → 40',
    'Knock-out "Managed separately" switched off', 'Country added: Brunei', 'Refining: core → adjacent', 'Primary persona phrase added: Process engineer',
    'Inquiry or RFQ: weight 100 → 80, full weight for 30 → 45 days']) assert.ok(words.includes(w), `${w}\n${words.join('\n')}`);
  assert.deepEqual(scoringChanges(a, a), []);
});
