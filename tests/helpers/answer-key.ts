// Measures the engine against the sample dataset's answer key (Row key, Account key) in test-data/.
// Never reads reference_content/. Shared by tests/answer-key.test.ts and later phases' rule tests.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as E from '../../lib/demandai-engine.ts';
import { buildProspects, handoffSelection } from '../../lib/engine/prospects.ts';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

export const DATASET = fileURLToPath(new URL('../../test-data/Lead_Research_Sample_Dataset.xlsx', import.meta.url));
export const AS_OF = '2026-09-30';

type Row = Record<string, unknown>;
type Tally = { caught: number; rows: number };

const split = (v: unknown) => String(v ?? '').split(/[;,]\s*/).map(s => s.trim()).filter(Boolean);
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function loadDataset() {
  // Read as the original browser reader did (cellDates: true); the sample's dates are text, so the server reader
  // gives the same grid (tests/uploads.test.ts proves it).
  const wb = XLSX.readFile(DATASET, { cellDates: true });
  const grid = (n: string) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
  const rows = (n: string): Row[] => XLSX.utils.sheet_to_json(wb.Sheets[n], { range: 1, defval: '' });
  return { leadGrid: grid('Lead template'), signalGrid: grid('Signal template'), rowKey: rows('Row key'), accountKey: rows('Account key') };
}

export function measure(data = loadDataset()) {
  const leads = E.processLeads(data.leadGrid, { file: 'dataset', sheet: 'Lead template' });
  const list = JSON.parse(JSON.stringify({ accounts: leads.accounts, contacts: leads.contacts }));
  const sig = E.processSignals(data.signalGrid, list, { file: 'dataset', sheet: 'Signal template', asOf: AS_OF });
  const scored = E.scoreList(list, sig);

  // ── Lead rows: one predicate per case (true = the engine handled the row as the key expects) ──
  const issuesByRow = new Map<number, E.Issue[]>();
  for (const i of leads.issues) if (typeof i.row === 'number') issuesByRow.set(i.row, [...(issuesByRow.get(i.row) || []), i]);
  const has = (r: number, f: (i: E.Issue) => boolean) => (issuesByRow.get(r) || []).some(f);
  const contactByRow = new Map(leads.contacts.map(c => [c.row, c]));
  const malformed = (r: number) => has(r, i => i.field === 'email' && /malformed/.test(i.issue));
  const field = (name: string) => (r: number) => has(r, i => i.field === name);
  const dup = (r: number) => has(r, i => i.code === 'D5');
  const leadChecks: Record<string, (r: number) => boolean> = {
    'MF-FIRST': field('first_name'), 'MF-LAST': field('last_name'), 'MF-TITLE': field('job_title'),
    'MF-COMPANY': r => has(r, i => i.severity === 'stop'), 'MF-DOMAIN': field('company_domain'),
    'MF-COUNTRY': field('country'), 'MF-INDUSTRY': field('industry'), 'MF-EXISTING': field('existing_customer'),
    'MF-MANAGED': field('managed_separately'), 'MF-CONSENT': field('consent_basis'), 'MF-OPTOUT': field('opt_out'),
    'MF-OWNER': field('owner_email'), 'MF-CHANNEL': r => has(r, i => i.issue === 'No email and no LinkedIn URL'),
    'MF-VERIFIED': r => has(r, i => i.field === 'email_verified') || dup(r),
    'EM-NO-AT': malformed, 'EM-DOUBLE-AT': malformed, 'EM-NO-TLD': malformed, 'EM-SPACE': malformed, 'EM-PLACEHOLDER': malformed,
    'EM-DOUBLE-DOT': malformed, 'EM-TRAILING-DOT': malformed, 'EM-BAD-CHAR': malformed,
    'EM-PERSONAL': field('email'), 'EM-ROLE': field('email'), 'EM-DOMAIN-MISMATCH': field('email'), 'EM-TYPO-DOMAIN': field('email'),
    'DUP-EXACT': dup, 'DUP-EMAIL-CASE': dup, 'DUP-LINKEDIN': dup, 'DUP-FUZZY': dup, 'DUP-UPDATED': dup, 'DUP-CROSS-COMPANY': dup,
    // FMT-CONSENT: flagged as unrecognised, or (D-14) read through an agreed synonym with a note ("Opt-in").
    'FMT-YN-BAD': r => has(r, i => /isn't Y or N/.test(i.issue)), 'FMT-CONSENT': r => has(r, i => /recognised/.test(i.issue) || (i.field === 'consent_basis' && /read as/.test(i.issue))),
    'FMT-LINKEDIN': r => has(r, i => /profile URL/.test(i.issue)), 'FMT-OWNER': r => has(r, i => /isn't an email/.test(i.issue)),
    'FMT-INCONSISTENT': r => has(r, i => /^Differs from row/.test(i.issue)) || dup(r),
    'FMT-TITLE-NOISE': r => !!contactByRow.get(r) && contactByRow.get(r)!.persona !== 'None',
    // Opted out while the row (or a duplicate of it) says otherwise: the person must end up suppressed, and the
    // conflict flagged (G-060).
    'SUP-OPTOUT-CONFLICT': r => {
      const c = contactByRow.get(r) ?? leads.contacts.find(x => has(r, i => i.code === 'D5' && i.outcome === `Merged into row ${x.row}`));
      if (!c || !c.optOut) return false;
      const rows = [c.row, ...leads.issues.filter(i => i.code === 'D5' && i.outcome === `Merged into row ${c.row}`).map(i => i.row as number)];
      return rows.some(x => has(x, i => i.field === 'opt_out' && i.severity === 'flag' && /^Differs from row|says opted in/.test(i.issue)));
    },
  };

  // ── Signal rows (after scoring, which marks qualified signals on excluded or below-floor accounts "Not used") ──
  const signalByRow = new Map(sig.signals.map(s => [s.row, s]));
  const excludedAccounts = new Set(scored.filter(r => r.excluded).map(r => r.account.id));
  const contactByRowAll = new Map(list.contacts.map((c: E.Contact) => [c.row, c]));
  const rejected = (code: string, re?: RegExp) => (s: E.Signal) => s.status === 'Rejected' && s.code === code && (!re || re.test(s.reason));
  const signalChecks: Record<string, (s: E.Signal) => boolean> = {
    'SIG-QUALIFIED': s => s.status === 'Qualified' || s.status === 'Not used',
    'SIG-AUTOASSIGN': s => s.assigned.startsWith('Auto-assigned to the primary-persona contact'),
    'SIG-KNOCKOUT': s => s.status === 'Used for a knock-out',
    'SIG-NEWSLETTER': rejected('D1'),
    'SIG-STALE': rejected('D2'),
    'SIG-NO-COMPANY': rejected('D3', /^No company name/),
    'SIG-UNKNOWN-COMPANY': rejected('D4', /^Company is not in the target universe/),
    'SIG-NAME-VARIANT': s => !rejected('D4', /^Company is not in the target universe/)(s),
    'SIG-UNKNOWN-PERSON': rejected('D4', /^Person /),
    'SIG-NO-DATE': rejected('D3', /^No event date/),
    'SIG-BAD-DATE': rejected('D3', /isn't YYYY-MM-DD/),
    'SIG-FUTURE': rejected('D3', /after the scoring date/),
    // D-14 (provisional, key expectation updated deliberately): RFQ and Inquiry read as "Inquiry or RFQ" with a note.
    'SIG-BAD-TYPE': s => rejected('D3', /isn't on the list/)(s) || sig.issues.some(i => i.row === s.row && i.field === 'signal_type' && /read as/.test(i.issue)),
    'SIG-TYPE-CASE': s => !rejected('D3', /isn't on the list/)(s),
    'SIG-DUP': rejected('D5'),
    'SIG-NO-DETAIL': s => sig.issues.some(i => i.row === s.row && i.field === 'detail'),
    'SIG-OPTED-OUT-PERSON': s => s.contactRow !== null && !!(contactByRowAll.get(s.contactRow) as E.Contact | undefined)?.optOut,
    // The account is excluded and the signal does not count towards anything.
    'SIG-EXCLUDED-ACCOUNT': s => s.accountId !== null && excludedAccounts.has(s.accountId) && s.status !== 'Qualified',
  };

  const cases: Record<string, Tally> = {};
  const tally = (c: string, ok: boolean) => {
    const t = (cases[c] ||= { caught: 0, rows: 0 });
    t.rows++;
    if (ok) t.caught++;
  };
  for (const k of data.rowKey) {
    const row = Number(k.row);
    if (k.sheet === 'Lead template') {
      for (const c of split(k.row_cases)) if (leadChecks[c]) tally(c, leadChecks[c](row));
    } else if (k.sheet === 'Signal template') {
      const s = signalByRow.get(row);
      for (const c of split(k.row_cases)) if (signalChecks[c]) tally(c, !!s && signalChecks[c](s));
    }
  }

  // ── Accounts against the Account key ──
  const accByKey = new Map(leads.accounts.map(a => [a.key, a]));
  const resultById = new Map(scored.map(r => [r.account.id, r]));
  let wrongful = 0, missed = 0;
  const accountCases: Record<string, Tally> = {};
  const accTally = (c: string, ok: boolean) => {
    const t = (accountCases[c] ||= { caught: 0, rows: 0 });
    t.rows++;
    if (ok) t.caught++;
  };
  for (const a of data.accountKey) {
    const e = accByKey.get(norm(a.company_name));
    const out = !!e && (e.excluded || sig.knockouts.has(e.id));
    const expectedOut = a.expected_status === 'Excluded';
    if (e && out && !expectedOut) wrongful++;
    if (e && !out && expectedOut) missed++;
    // FMT-COUNTRY: the account is kept unless the key expects it excluded for another reason.
    if (split(a.other_account_cases).includes('FMT-COUNTRY')) accTally('FMT-COUNTRY', !!e && out === expectedOut);
    for (const ko of split(a.knock_out_cases)) accTally(ko, !!e && out);
  }

  // ── Classification and personas ──
  const inIcp = (v: unknown) => /^(Refining|Petrochemicals|Gas processing)/.test(String(v));
  let inIcpLost = 0, outOfIcpCore = 0;
  for (const a of data.accountKey) {
    const e = accByKey.get(norm(a.company_name));
    if (!e) continue;
    if (inIcp(a.true_vertical) && e.verticalLevel === 'other') inIcpLost++;
    if (!inIcp(a.true_vertical) && !/^Influencer/.test(String(a.true_vertical)) && e.verticalLevel === 'core') outOfIcpCore++;
  }
  const noPersona = leads.contacts.filter(c => c.persona === 'None').length;
  const instrumentEngineers = leads.contacts.filter(c => /instrument engineer/i.test(c.jobTitle));

  // ── Tiers, signals and the default hand-off (tier A and B prospects with a live signal) ──
  const tiers: Record<string, number> = {};
  for (const r of scored) tiers[r.tier as string] = (tiers[r.tier as string] || 0) + 1;
  const prospects = scored.flatMap(r => r.people || []).filter(p => p.signals.length > 0);
  const handoff = handoffSelection(buildProspects(scored));
  const signalOutcomes: Record<string, number> = {};
  for (const s of sig.signals) {
    const k = s.status === 'Rejected' ? `Rejected ${s.code}` : s.status;
    signalOutcomes[k] = (signalOutcomes[k] || 0) + 1;
  }

  return {
    cases,
    accountCases,
    accounts: { built: leads.accounts.length, trueAccounts: data.accountKey.length, wrongful, missed, needsReview: leads.accounts.filter(a => a.needsReview).length, inIcpLost, outOfIcpCore },
    contacts: { total: leads.contacts.length, noPersona, instrumentEngineers: instrumentEngineers.length, instrumentEngineersPrimary: instrumentEngineers.filter(c => c.persona === 'Primary').length },
    tiers,
    prospectsWithSignal: prospects.length,
    handoff: { prospects: handoff.items.length, notContactable: handoff.items.filter(p => !p.c.contactable).length, heldBack: handoff.heldBack },
    signalOutcomes,
    resultById,
  };
}
