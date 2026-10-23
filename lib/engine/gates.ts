/* The success gates and what they are judged by (D-21, spec 3.3 and 7.1; legacy 13-analytics.html gateState and
   renderValidation, 00-today.html gateStatus, demandai-nba.js readiness). Pure functions, shared by the server, the
   screens and the tests:
   - the validation settings live in the unit's configuration version (the same keys as CONFIG), so changing them
     makes a new version and every reading names the version it was judged by;
   - G2 is first-pass acceptance weighted by path and G1 is review minutes per usable first action against the
     Client's baseline (R.measure); both read "too early to call" below the agreed number of counted first-pass
     decisions (D-21; the original Analytics page used released items for G1, Today used decisions);
   - the readiness checks say whether there is enough data to measure the pilot at all. */
import { CONFIG } from '../demandai-engine.ts';
import type { measure } from './review.ts';

export type ValidationSettings = {
  g1BaselineMinutes: number; g1BaselineTimed: boolean; g1Threshold: number; g2Threshold: number; minDecisions: number; spotCheckShare: number;
};
type NumericKey = 'g1BaselineMinutes' | 'g1Threshold' | 'g2Threshold' | 'minDecisions' | 'spotCheckShare';

/** The range each setting may take; minDecisions is a whole number. spotCheckShare is a fraction (0.2 = 20%). */
export const VALIDATION_LIMITS: Record<NumericKey, [number, number]> = {
  g1BaselineMinutes: [1, 600], g1Threshold: [1, 100], g2Threshold: [1, 100], minDecisions: [1, 1000], spotCheckShare: [0.01, 1],
};
const NUMERIC = Object.keys(VALIDATION_LIMITS) as NumericKey[];

const inRange = (k: NumericKey, v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= VALIDATION_LIMITS[k][0] && v <= VALIDATION_LIMITS[k][1] && (k !== 'minDecisions' || Number.isInteger(v));

/** The settings a configuration body holds; anything missing or out of range reads as the starting value. */
export function validationOf(body: unknown): ValidationSettings {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const num = (k: NumericKey) => (inRange(k, b[k]) ? b[k] as number : CONFIG[k]);
  return { g1BaselineMinutes: num('g1BaselineMinutes'), g1BaselineTimed: b.g1BaselineTimed === true, g1Threshold: num('g1Threshold'),
    g2Threshold: num('g2Threshold'), minDecisions: num('minDecisions'), spotCheckShare: num('spotCheckShare') };
}

const FIELD_HELP: Record<NumericKey, string> = {
  g1BaselineMinutes: 'Minutes per usable first action, between 1 and 600.', g1Threshold: 'A percentage between 1 and 100.',
  g2Threshold: 'A percentage between 1 and 100.', minDecisions: 'A whole number of decisions, between 1 and 1000.', spotCheckShare: 'A share between 1% and 100%.',
};
/** What is wrong with a change, per field, or null. */
export function validationProblem(input: Partial<ValidationSettings>): Record<string, string[]> | null {
  const out: Record<string, string[]> = {};
  for (const k of NUMERIC) if (input[k] !== undefined && !inRange(k, input[k])) out[k] = [FIELD_HELP[k]];
  if (input.g1BaselineTimed !== undefined && typeof input.g1BaselineTimed !== 'boolean') out.g1BaselineTimed = ['Yes or no.'];
  return Object.keys(out).length ? out : null;
}

const pc = (v: number) => `${Math.round(v * 100)}%`;
/** The change from one set of settings to the next, in words, for the version history. */
export function validationChanges(a: ValidationSettings, b: ValidationSettings): string[] {
  const out: string[] = [];
  if (a.g1BaselineMinutes !== b.g1BaselineMinutes) out.push(`G1 baseline ${a.g1BaselineMinutes} → ${b.g1BaselineMinutes} min per usable first action`);
  if (a.g1BaselineTimed !== b.g1BaselineTimed) out.push(b.g1BaselineTimed ? 'Baseline marked as timed by the Client' : 'Baseline marked as a placeholder again');
  if (a.g1Threshold !== b.g1Threshold) out.push(`G1 threshold ${a.g1Threshold}% → ${b.g1Threshold}% less`);
  if (a.g2Threshold !== b.g2Threshold) out.push(`G2 threshold ${a.g2Threshold}% → ${b.g2Threshold}% accepted`);
  if (a.minDecisions !== b.minDecisions) out.push(`Too early to call below ${a.minDecisions} → ${b.minDecisions} decisions`);
  if (a.spotCheckShare !== b.spotCheckShare) out.push(`Weekly spot-check ${pc(a.spotCheckShare)} → ${pc(b.spotCheckShare)} of items that proceeded`);
  return out;
}

/* ─── The two gates ─── */

export type GateState = 'none' | 'early' | 'met' | 'below';
export type Gate = { value: number | null; threshold: number; n: number; min: number; state: GateState };

export function gateState(value: number | null, threshold: number, n: number, min: number): GateState {
  return value === null ? 'none' : n < min ? 'early' : value >= threshold ? 'met' : 'below';
}
/** The badge a gate shows. */
export function gateLabel(g: Pick<Gate, 'state' | 'n' | 'min'>): string {
  return g.state === 'none' ? 'No data yet' : g.state === 'early' ? `Too early to call: ${g.n} of ${g.min}` : g.state === 'met' ? 'On track' : 'Below the threshold';
}

/** G1 and G2 from the measures, judged by the settings. G1 has no value until someone has decided something: review
 *  minutes over items that went ahead on their own alone would read as all effort saved. */
export function gates(m: ReturnType<typeof measure>, s: ValidationSettings): { g1: Gate; g2: Gate } {
  const n = m.pooled.n;
  const g1 = n && m.saved !== null ? m.saved : null;
  return {
    g1: { value: g1, threshold: s.g1Threshold, n, min: s.minDecisions, state: gateState(g1, s.g1Threshold, n, s.minDecisions) },
    g2: { value: m.weighted, threshold: s.g2Threshold, n, min: s.minDecisions, state: gateState(m.weighted, s.g2Threshold, n, s.minDecisions) },
  };
}

/* ─── 3.3 Data sufficiency: the readiness checks before measurement ─── */

export type PilotFacts = {
  /** Distinct accounts in scope (not excluded) across the scored lists behind the builds. */
  accounts: number;
  /** Of those, with a primary-persona contact who can be reached (verified email or LinkedIn) and isn't suppressed. */
  contactable: number;
  /** Of those, with at least one qualified signal. */
  covered: number;
  qualified: number;
  /** Qualified signals no older than CONFIG.readiness.recencyDays on the run's as-of date. */
  recent: number;
  /** Actions in the agreed library that have no approved, unexpired proof for their segment. */
  noProof: string[];
  actions: number;
};
export type PilotCheck = { k: string; ok: boolean; show: string; need: string; fix: string };

export function pilotReadiness(f: PilotFacts, s: ValidationSettings): PilotCheck[] {
  const R = CONFIG.readiness;
  const p = (a: number, b: number) => (b ? a / b * 100 : 0);
  const pct = (v: number) => Math.round(v) + '%';
  return [
    { k: 'Accounts in scope', ok: f.accounts >= R.accounts, show: `${f.accounts}`, need: `${R.accounts} or more`, fix: 'More accounts in the selected vertical and region' },
    { k: 'Contactability', ok: p(f.contactable, f.accounts) >= R.contactable, show: `${pct(p(f.contactable, f.accounts))} of accounts`,
      need: `${R.contactable}%+ with a primary-persona contact who has a verified email or LinkedIn URL`, fix: 'Verified emails or LinkedIn URLs for the primary-persona contacts' },
    { k: 'Signal coverage', ok: p(f.covered, f.accounts) >= R.coverage, show: `${pct(p(f.covered, f.accounts))} of accounts`,
      need: `${R.coverage}%+ with at least one qualified signal`, fix: 'More of the signal data the Client holds: installed base, inquiries, service records, events' },
    { k: 'Recency', ok: f.qualified > 0 && p(f.recent, f.qualified) >= R.recency, show: `${pct(p(f.recent, f.qualified))} of qualified signals`,
      need: `${R.recency}%+ from the last ${R.recencyDays} days`, fix: 'A fresher signal export' },
    { k: 'Collateral', ok: !f.noProof.length, show: `${f.actions - f.noProof.length} of ${f.actions} actions`, need: 'Approved, unexpired proof for every action in the set',
      fix: f.noProof.length ? `Proof for: ${f.noProof.join('; ')}` : '' },
    { k: 'Baseline', ok: s.g1BaselineTimed, show: `${s.g1BaselineMinutes} min per usable first action`, need: 'A timed baseline from the Client on the same data',
      fix: 'The Client\'s timed baseline (the current figure is a placeholder)' },
  ];
}

/** The verdict on the readiness checks as a whole. */
export function pilotVerdict(checks: PilotCheck[]): 'Sufficient' | 'Sufficient with gaps' | 'Not yet sufficient' {
  const gaps = checks.filter(x => !x.ok).length;
  return !gaps ? 'Sufficient' : gaps <= 2 ? 'Sufficient with gaps' : 'Not yet sufficient';
}
