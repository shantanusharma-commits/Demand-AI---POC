// Answer-key regression (G-057): the engine against test-data/Lead_Research_Sample_Dataset.xlsx, scoring date
// 2026-09-30. Each case's floor is its result on 22 Oct 2026; a fix raises the floor in the same commit, and a
// snapshot change must be deliberate and explained in the commit message. Never reads reference_content/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { measure } from './helpers/answer-key.ts';

// [caught, rows in the key]. Target is every row (the "gap" comment says which gap closes it).
const CASE_FLOORS: Record<string, [number, number]> = {
  'MF-FIRST': [70, 70], 'MF-LAST': [115, 115], 'MF-TITLE': [140, 140], 'MF-COMPANY': [45, 45], 'MF-DOMAIN': [90, 90],
  'MF-CHANNEL': [140, 140], 'MF-CONSENT': [110, 110], 'MF-OPTOUT': [80, 80], 'MF-VERIFIED': [160, 160],
  'MF-COUNTRY': [70, 70], 'MF-INDUSTRY': [90, 90], 'MF-EXISTING': [75, 75], 'MF-MANAGED': [75, 75], 'MF-OWNER': [70, 70], // G-037 closed
  'EM-NO-AT': [45, 45], 'EM-DOUBLE-AT': [30, 30], 'EM-NO-TLD': [40, 40], 'EM-SPACE': [35, 35], 'EM-PLACEHOLDER': [45, 45],
  'EM-DOUBLE-DOT': [0, 30], 'EM-TRAILING-DOT': [0, 30], 'EM-BAD-CHAR': [0, 35], // G-019
  'EM-PERSONAL': [0, 90], 'EM-ROLE': [0, 55], 'EM-DOMAIN-MISMATCH': [0, 70], 'EM-TYPO-DOMAIN': [0, 40], // G-019
  'DUP-EXACT': [140, 140], 'DUP-EMAIL-CASE': [80, 80], 'DUP-UPDATED': [60, 60], 'DUP-CROSS-COMPANY': [30, 30],
  'DUP-LINKEDIN': [59, 70], // G-039
  'DUP-FUZZY': [3, 70], // G-041 (target: listed for review)
  'FMT-YN-BAD': [67, 70], 'FMT-CONSENT': [60, 60], 'FMT-INCONSISTENT': [57, 60], 'FMT-LINKEDIN': [70, 70], 'FMT-OWNER': [50, 50],
  'FMT-TITLE-NOISE': [25, 120], // G-020
  'SUP-OPTOUT-CONFLICT': [25, 25], // G-060: suppressed and the conflict flagged (duplicates in both row orders: tests/rules.test.ts)
  // D-16 (22 Oct): a signal with no person is auto-assigned only to someone who can be contacted. 13 rows whose
  // primary contact had no channel or no consent now go to a contactable colleague; 1 is rejected (no one at the
  // account can be contacted). The key predates D-16, so SIG-AUTOASSIGN and SIG-QUALIFIED drop by design.
  'SIG-QUALIFIED': [677, 679], 'SIG-AUTOASSIGN': [79, 115], 'SIG-KNOCKOUT': [45, 45], 'SIG-NEWSLETTER': [55, 59],
  'SIG-STALE': [145, 145], 'SIG-NO-COMPANY': [15, 15], 'SIG-UNKNOWN-COMPANY': [45, 45], 'SIG-UNKNOWN-PERSON': [40, 40],
  'SIG-NO-DATE': [25, 25], 'SIG-BAD-DATE': [35, 35], 'SIG-FUTURE': [20, 20], 'SIG-BAD-TYPE': [35, 35], 'SIG-TYPE-CASE': [30, 30],
  'SIG-DUP': [40, 40], 'SIG-NO-DETAIL': [30, 30], 'SIG-OPTED-OUT-PERSON': [63, 63], 'SIG-EXCLUDED-ACCOUNT': [198, 198],
  'SIG-NAME-VARIANT': [5, 35], // G-044
};

const ACCOUNT_CASE_FLOORS: Record<string, [number, number]> = {
  'ICP-REGION': [152, 152], 'ICP-INSTALLED': [45, 45], 'ACC-ALL-OPTED-OUT': [12, 12],
  'ICP-MANAGED': [45, 46], // G-018
  'FMT-COUNTRY': [49, 49], // G-016 closed: 46 kept in scope + 3 excluded for their own knock-outs
};

// Gap measures that may only move towards their target.
const CEILINGS = {
  wrongfulExclusions: 14, // G-016 closed (46 back in scope); G-017 → 0
  missedExclusions: 1, // G-018 → 0
  accountsBuiltOver: 43, // G-038 → 1,400 accounts
  needsReview: 854, // G-021
  inIcpClassifiedOther: 100, // G-021
  outOfIcpClassifiedCore: 22, // G-021 → 0
  contactsWithoutPersona: 3271, // G-020
  handoffNotContactable: 0, // G-005 closed: the hand-off takes only people who pass canContact
};

// Changes only with a deliberate rule fix; say which gap moved it in the commit.
const SNAPSHOT = {
  // History: D-16 moved one account from B to C (G-050). D-14 synonyms (G-016, G-042, G-045): 47 accounts whose
  // country was a code or variant are back in scope (Excluded 315 → 268) and RFQ/Inquiry signals now score, so
  // every tier grows: A 51 → 58, B 48 → 51, C 75 → 78, Watch 356 → 374, Below floor 598 → 614.
  tiers: { A: 58, B: 51, C: 78, 'Watch list': 374, 'Below fit floor': 614, Excluded: 268 },
  prospectsWithSignal: 289,
  // G-005: contactable tier A/B prospects go to NBA; those who can't be contacted stay in Scoring.
  handoffProspects: 120,
  handoffHeldBack: 8,
  signalOutcomes: { Qualified: 413, 'Not used': 550, 'Used for a knock-out': 45, 'Rejected D1': 55, 'Rejected D2': 149, 'Rejected D3': 118, 'Rejected D4': 121, 'Rejected D5': 41 },
};

const m = measure();

test('every answer-key case is at or above its floor, and the key itself is unchanged', t => {
  const below: string[] = [];
  const gaps: string[] = [];
  for (const [c, [floor, rows]] of Object.entries(CASE_FLOORS)) {
    const got = m.cases[c];
    assert.ok(got, `case ${c} missing from the Row key`);
    assert.equal(got.rows, rows, `${c}: the Row key has ${got.rows} rows, expected ${rows}`);
    if (got.caught < floor) below.push(`${c} ${got.caught}/${rows} (floor ${floor})`);
    if (got.caught > floor) below.push(`${c} improved to ${got.caught}/${rows}: raise its floor in this commit`);
    if (got.caught < rows) gaps.push(`${c} ${got.caught}/${rows}`);
  }
  assert.deepEqual(Object.keys(m.cases).filter(c => !(c in CASE_FLOORS)), [], 'a case has no floor');
  t.diagnostic(`open lead and signal gaps: ${gaps.join(', ') || 'none'}`);
  assert.deepEqual(below, []);
});

test('account knock-out and country cases are at or above their floors', () => {
  const off: string[] = [];
  for (const [c, [floor, rows]] of Object.entries(ACCOUNT_CASE_FLOORS)) {
    const got = m.accountCases[c];
    assert.equal(got.rows, rows, `${c} rows`);
    if (got.caught !== floor) off.push(`${c} ${got.caught}/${rows} (floor ${floor})`);
  }
  assert.deepEqual(off, [], 'an improvement must raise the floor in the same commit');
});

test('gap measures do not get worse', () => {
  const now = {
    wrongfulExclusions: m.accounts.wrongful,
    missedExclusions: m.accounts.missed,
    accountsBuiltOver: m.accounts.built - m.accounts.trueAccounts,
    needsReview: m.accounts.needsReview,
    inIcpClassifiedOther: m.accounts.inIcpLost,
    outOfIcpClassifiedCore: m.accounts.outOfIcpCore,
    contactsWithoutPersona: m.contacts.noPersona,
    handoffNotContactable: m.handoff.notContactable,
  };
  assert.deepEqual(now, CEILINGS, 'a change in either direction must update CEILINGS deliberately');
});

test('full-sample snapshot: tiers, prospects and signal outcomes', () => {
  assert.deepEqual(m.tiers, SNAPSHOT.tiers);
  assert.equal(m.prospectsWithSignal, SNAPSHOT.prospectsWithSignal);
  assert.equal(m.handoff.prospects, SNAPSHOT.handoffProspects);
  assert.equal(m.handoff.heldBack, SNAPSHOT.handoffHeldBack);
  assert.deepEqual(m.signalOutcomes, SNAPSHOT.signalOutcomes);
});
