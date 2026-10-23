// Content library (Phase 5a, G-009): an approved claim stops counting the day after it expires, in the draft checks
// themselves; what a new brand version changes, in words; rules read from a plain-text guideline.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../lib/engine/nba.ts';
import { claimStatus, diffSummary, nextClaimId, readRules } from '../lib/content/brand.ts';

const PS06 = N.COLLATERAL.find(c => c.id === 'PS-06')!; // expires 2026-06-30
const cited = `${PS06.claim} [${PS06.type}, ${PS06.year}]`;
const email = (line: string): Partial<N.Draft> => ({ channel: 'Email', subject: 'your new role', body: `Hi Ann,\n\n${line}\n\nWorth a chat?\n\nClient Team` });

test('an expired claim fails the check: cited word for word from an approved item, but after its expiry date', () => {
  const before = N.checkDraft(email(cited), N.defaultBrand(), '2026-06-30');
  assert.deepEqual(before.unsupported, [], 'on its expiry day it still counts');
  assert.equal(before.claims[0].verified, true);
  const after = N.checkDraft(email(cited), N.defaultBrand(), '2026-07-01');
  assert.equal(after.unsupported.length, 1, 'the day after, it is unsupported');
  assert.equal(after.unsupported[0].source, 'PS-06 · First 100 days: setting automation priorities');
  assert.match(String(after.unsupported[0].reason), /expired on 2026-06-30/);
  assert.equal(N.checkDraft(email(cited)).unsupported.length, 0, 'without a date the check is as before (legacy ports)');
  assert.equal(N.checkContent(cited, N.defaultBrand(), '2026-07-01').unsupported.length, 1, 'Content studio checks the same way');
  const retired = { ...N.defaultBrand(), claims: N.defaultBrand().claims.map(c => c.id === 'PS-06' ? { ...c, status: 'retired' } : c) };
  assert.equal(N.checkDraft(email(cited), retired, '2026-06-01').unsupported.length, 1, 'a retired claim is not approved');
});

test('claim status reads as the library shows it: expired wins over approved', () => {
  assert.equal(claimStatus({ status: 'approved', expiry: '2026-06-30' }, '2026-07-01'), 'Expired');
  assert.equal(claimStatus({ status: 'approved', expiry: '2026-06-30' }, '2026-06-30'), 'Approved');
  assert.equal(claimStatus({ status: 'draft', expiry: '2030-01-01' }, '2026-07-01'), 'Draft');
  assert.equal(claimStatus({ status: 'retired', expiry: '2030-01-01' }, '2026-07-01'), 'Retired');
  assert.equal(nextClaimId(N.defaultBrand().claims), 'CL-07');
  assert.equal(nextClaimId([...N.defaultBrand().claims, { ...PS06, id: 'CL-12' }]), 'CL-13');
});

test('diffSummary says what a new brand version changes, section by section', () => {
  const live = N.defaultBrand();
  const draft: N.BrandPack = JSON.parse(JSON.stringify(live));
  assert.deepEqual(diffSummary(live, draft), [], 'nothing changed');
  draft.voice.preset = 'Formal';
  draft.voice.maxWords = 100;
  draft.negative.push('synergy');
  draft.competitors.push('Rivalco');
  draft.claims.find(c => c.id === 'PS-06')!.status = 'retired';
  draft.claims.push({ ...PS06, id: 'CL-07', title: 'New one' });
  draft.frameworks = draft.frameworks.slice(1);
  assert.deepEqual(diffSummary(live, draft), [
    { section: 'Voice and tone', lines: ['Voice: Direct → Formal', `Email length: ${live.voice.maxWords} → 100 words`] },
    { section: 'Negative keywords', lines: ['Added keywords: synergy', 'Added competitors: Rivalco'] },
    { section: 'Approved claims', lines: ['Added CL-07: New one', 'PS-06: approved → retired'] },
    { section: 'Messaging frameworks', lines: [`Removed “${live.frameworks[0].objective}”`] },
  ]);
});

test('diffSummary compares frameworks field by field: the same framework with its keys in another order is no change', () => {
  const live = N.defaultBrand();
  const reordered = { ...live, frameworks: live.frameworks.map(f => ({ actions: f.actions, use: f.use, steps: f.steps, name: f.name, objective: f.objective })) };
  assert.deepEqual(diffSummary(live, reordered), []);
});

test('readRules picks plain rules out of a text guideline, once each', () => {
  const rules = readRules(['## Words we never use', 'Never use: synergy, world-class', 'Competitors: Rivalco, Acmetrol', 'Never open with: Just checking in',
    'No exclamation marks.', 'Keep emails under 120 words.', 'Keep sentences under 25 words.', 'Always sign off as: Client Sales Team', 'Tone: Direct', 'Never use: synergy'].join('\n'));
  assert.deepEqual(rules.map(r => `${r.kind}=${r.value}`), [
    'Negative keyword=synergy', 'Negative keyword=world-class', 'Competitor=Rivalco', 'Competitor=Acmetrol', 'Banned opener=Just checking in',
    'Rule=No exclamation marks', 'Email length=120', 'Sentence length=25', 'Sign-off=Client Sales Team', 'Voice=Direct']);
});
