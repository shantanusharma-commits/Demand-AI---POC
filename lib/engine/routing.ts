/* Lead routing (D-34, success area 4): a unit's rules, in order, say who should own an account the lead file gives no
   owner, and which business unit it belongs to. The first active rule whose countries, verticals and tiers all match
   wins; an empty list matches anything. Matching is by the names the checks produce (countries after the D-14
   synonyms, verticals from the industry table), ignoring case. */
import type { Tier } from '../../types/demandai';

export const ROUTING_TIERS: Tier[] = ['A', 'B', 'C', 'Watch list'];

export interface RoutingRule {
  id: string; position: number; name: string; countries: string[]; verticals: string[]; tiers: string[];
  assignOwner: string | null; targetBusinessUnitId: string | null; active: boolean;
}

const has = (list: string[], value: string | null | undefined) => !list.length || (!!value && list.some(x => x.toLowerCase() === value.toLowerCase()));

/** The rule that routes an account, or null when none matches. */
export function matchRule<T extends RoutingRule>(rules: T[], account: { country?: string | null; vertical?: string | null }, tier: string | null | undefined): T | null {
  return rules.slice().sort((a, b) => a.position - b.position)
    .find(r => r.active && has(r.countries, account.country) && has(r.verticals, account.vertical) && has(r.tiers, tier)) ?? null;
}

/** What a rule says, in words, for the screens and the audit trail. */
export function describeRule(r: Pick<RoutingRule, 'countries' | 'verticals' | 'tiers'>): string {
  const part = (label: string, xs: string[]) => (xs.length ? `${label} ${xs.join(' or ')}` : '');
  return [part('in', r.countries), part('in', r.verticals), part('tier', r.tiers)].filter(Boolean).join(', ') || 'every account';
}

/** Null when the rule can be saved, otherwise what is wrong. */
export function ruleProblem(r: Pick<RoutingRule, 'name' | 'assignOwner' | 'targetBusinessUnitId' | 'tiers'>): string | null {
  if (!r.name.trim()) return 'Give the rule a name.';
  if (!r.assignOwner && !r.targetBusinessUnitId) return 'Say who owns the accounts it matches, or which business unit they belong to.';
  const bad = r.tiers.find(t => !(ROUTING_TIERS as string[]).includes(t));
  if (bad) return `"${bad}" is not a tier.`;
  return null;
}
