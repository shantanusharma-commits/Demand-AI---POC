/* A lead list's data quality and readiness (G-015). Computed once over the whole file when the list is built and
   stored with it, because a rep only sees their own rows. % clean is the original 10-prospecting.html dqScore; the
   readiness checks are the original demandai-nba.js readiness() rules that a lead list can answer (contactability;
   signal coverage and recency need a signal file), with contactability through canContact (N-07: an unconfirmed
   opt-out is not reachable). There is no minimum number of accounts: a list of any size counts (27 Oct 2026). */
import { CONFIG, canContact } from '../demandai-engine.ts';
import type { DqCode, Issue, LeadResult } from '../../types/demandai';

export type ListQuality = {
  /** Data rows read, and those with a finding that is more than information. */
  rowsRead: number;
  uncleanRows: number;
  /** % of rows clean, 0–100. */
  clean: number;
  /** Findings per D-code over the whole file: the validation report's counts. */
  byCode: Partial<Record<DqCode, number>>;
  /** Accounts that pass the knock-outs, and those with a primary-persona contact who can be contacted. */
  inScope: number;
  primaryReachable: number;
};

/** The original dqScore: rows with a stop or flag finding, over rows read. Whole-file notes ('—') don't count. */
export function dqScore(issues: Pick<Issue, 'row' | 'severity'>[], rows: number): number {
  const bad = new Set(issues.filter(i => i.severity !== 'info' && typeof i.row === 'number').map(i => i.row));
  return rows ? Math.max(0, Math.round((rows - bad.size) / rows * 100)) : 0;
}

/** `dataRows` are the sheet rows read as data: a finding on the header row is about the whole file. */
export function listQuality(result: LeadResult, dataRows: ReadonlySet<number>): ListQuality {
  const onData = result.issues.filter(i => typeof i.row === 'number' && dataRows.has(i.row));
  const uncleanRows = new Set(onData.filter(i => i.severity !== 'info').map(i => i.row)).size;
  const byCode: Partial<Record<DqCode, number>> = {};
  for (const i of result.issues) if (i.code !== '—') byCode[i.code] = (byCode[i.code] ?? 0) + 1;
  return { rowsRead: result.stats.rowsRead, uncleanRows, clean: dqScore(onData, result.stats.rowsRead), byCode, ...readinessCounts(result) };
}

/** Accounts in scope, and those with a primary-persona contact who passes canContact. */
export function readinessCounts({ accounts, contacts }: Pick<LeadResult, 'accounts' | 'contacts'>): Pick<ListQuality, 'inScope' | 'primaryReachable'> {
  const reachable = new Set(contacts.filter(c => c.persona === 'Primary' && canContact(c)).map(c => c.accountId));
  const inScope = accounts.filter(a => !a.excluded);
  return { inScope: inScope.length, primaryReachable: inScope.filter(a => reachable.has(a.id)).length };
}

export type ReadinessCheck = { k: string; ok: boolean; show: string; need: string; fix: string };

export function readinessChecks(q: Pick<ListQuality, 'inScope' | 'primaryReachable'>): ReadinessCheck[] {
  const R = CONFIG.readiness;
  const pct = q.inScope ? q.primaryReachable / q.inScope * 100 : 0;
  return [
    { k: 'Contactability', ok: pct >= R.contactable, show: `${Math.round(pct)}% of accounts`,
      need: `${R.contactable}%+ with a primary-persona contact who can be contacted`,
      fix: 'Verified emails or LinkedIn URLs, a consent basis and a confirmed opt-out for the primary-persona contacts' },
  ];
}
