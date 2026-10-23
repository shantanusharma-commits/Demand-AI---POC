// What Today and Analytics both measure by (G-010, G-011, D-21): the unit's validation settings, read from its active
// configuration version, and the readiness checks on the data behind its micro-segment builds (spec 3.3). The
// readiness counts go through the row-level security policies, so a rep's are their own accounts.
import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { CONFIG } from '../../demandai-engine.ts';
import { approvedClaims } from '../../engine/nba.ts';
import * as G from '../../engine/gates.ts';
import { configVersions, nbaRuns } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { liveBrand } from './brand.ts';
import { todayUtc } from './scoring.ts';

export type ActiveValidation = { versionId: string | null; versionNo: number | null; body: Record<string, unknown>; settings: G.ValidationSettings };

/** The active configuration version and the gate settings it holds (the starting values when a unit has none). */
export async function activeValidation(scope: TenantScope): Promise<ActiveValidation> {
  const [v] = await scope.tx.select({ id: configVersions.id, versionNo: configVersions.versionNo, body: configVersions.body }).from(configVersions)
    .where(and(eq(configVersions.businessUnitId, scope.ctx.businessUnitId), eq(configVersions.status, 'active')));
  const body = (v?.body ?? {}) as Record<string, unknown>;
  return { versionId: v?.id ?? null, versionNo: v?.versionNo ?? null, body, settings: G.validationOf(body) };
}

/** The facts the readiness checks read, over the scoring runs behind the unit's builds; null before the first build. */
export async function pilotFacts(scope: TenantScope): Promise<G.PilotFacts | null> {
  const bu = scope.ctx.businessUnitId;
  const builds = await scope.tx.select({ runId: nbaRuns.scoringRunId, asOf: nbaRuns.asOf }).from(nbaRuns)
    .where(eq(nbaRuns.businessUnitId, bu)).orderBy(desc(nbaRuns.createdAt));
  if (!builds.length) return null;
  const runs = sql`string_to_array(${[...new Set(builds.map(b => b.runId))].join(',')}, ',')::uuid[]`;
  // An account counts once by name across the runs; reachable means a primary-persona contact who isn't opted out or
  // taken out, with a verified email or a LinkedIn URL.
  const { rows: [a] } = await scope.tx.execute<{ accounts: number; contactable: number; covered: number }>(sql`
    select count(distinct lower(a.name))::int as accounts,
      count(distinct lower(a.name)) filter (where exists (
        select 1 from contacts c where c.account_id = a.id and c.data->>'persona' = 'Primary'
          and coalesce((c.data->>'optOut')::boolean, false) = false and coalesce((c.data->>'takenOut')::boolean, false) = false
          and ((coalesce(c.data->>'email', '') <> '' and coalesce((c.data->>'emailVerified')::boolean, false)) or coalesce(c.data->>'linkedin', '') <> '')))::int as contactable,
      count(distinct lower(a.name)) filter (where coalesce((s.data->>'signalCount')::int, 0) > 0)::int as covered
    from account_scores s join accounts a on a.id = s.account_id
    where s.business_unit_id = ${bu} and s.run_id = any(${runs}) and not a.excluded`);
  const { rows: [g] } = await scope.tx.execute<{ qualified: number; recent: number }>(sql`
    select count(*) filter (where status = 'Qualified')::int as qualified,
      count(*) filter (where status = 'Qualified' and (data->>'age')::numeric <= ${CONFIG.readiness.recencyDays})::int as recent
    from signals where business_unit_id = ${bu} and run_id = any(${runs})`);
  // Every action in the agreed library needs approved proof for its segment, unexpired on the later of the newest
  // build's as-of date and today (the date drafts are checked on).
  const pack = (await liveBrand(scope)).pack, today = todayUtc(), when = today > builds[0].asOf ? today : builds[0].asOf;
  const lib = CONFIG.segmentLibrary, claims = approvedClaims(pack);
  const actions = [...new Set(Object.values(lib).flat())];
  const noProof = actions.filter(act => {
    const seg = Object.keys(lib).find(k => lib[k].includes(act))!;
    return !claims.some(c => (c.segments || []).includes(seg) && (!c.expiry || c.expiry >= when));
  });
  return { accounts: a.accounts, contactable: a.contactable, covered: a.covered, qualified: g.qualified, recent: g.recent, noProof, actions: actions.length };
}
