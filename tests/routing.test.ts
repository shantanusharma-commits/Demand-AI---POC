// Lead routing rules (D-34): the first active rule whose lists all match wins; an empty list matches anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRule, matchRule, ruleProblem, type RoutingRule } from '../lib/engine/routing.ts';

const rule = (p: Partial<RoutingRule>): RoutingRule => ({ id: p.name ?? 'r', position: 1, name: 'r', countries: [], verticals: [], tiers: [], assignOwner: null,
  targetBusinessUnitId: 'bu-x', active: true, ...p });

test('D-34: rules are tried in order; the first whose countries, verticals and tiers all match routes the account', () => {
  const rules = [
    rule({ name: 'thai refining A', position: 2, countries: ['Thailand'], verticals: ['Refining'], tiers: ['A'] }),
    rule({ name: 'all of Thailand', position: 3, countries: ['thailand'] }),
    rule({ name: 'switched off', position: 1, countries: ['Thailand'], active: false }),
  ];
  assert.equal(matchRule(rules, { country: 'Thailand', vertical: 'Refining' }, 'A')!.name, 'thai refining A');
  assert.equal(matchRule(rules, { country: 'Thailand', vertical: 'Refining' }, 'B')!.name, 'all of Thailand', 'case-insensitive, an empty list matches anything');
  assert.equal(matchRule(rules, { country: 'Vietnam', vertical: 'Refining' }, 'A'), null);
  assert.equal(matchRule(rules, { country: '', vertical: 'Refining' }, 'A'), null, 'a blank country matches only an empty country list');
  assert.equal(matchRule([rule({ name: 'catch all' })], { country: null, vertical: null }, null)!.name, 'catch all');
});

test('D-34: a rule says who owns the accounts or where they belong, and only real tiers', () => {
  assert.match(ruleProblem(rule({ name: ' ' }))!, /name/);
  assert.match(ruleProblem(rule({ targetBusinessUnitId: null }))!, /who owns|business unit/);
  assert.match(ruleProblem(rule({ tiers: ['A', 'Excluded'] }))!, /"Excluded" is not a tier/);
  assert.equal(ruleProblem(rule({ assignOwner: 'rep@x.test', targetBusinessUnitId: null })), null);
  assert.equal(describeRule(rule({ countries: ['Thailand', 'Vietnam'], tiers: ['A'] })), 'in Thailand or Vietnam, tier A');
  assert.equal(describeRule(rule({})), 'every account');
});
