// The AI classifier inside the lead job (spec 3.4, G-021, D-5): the accounts whose industry the mapping table can't
// match are asked about once per industry text, unit and model, the answers kept (ai_verticals) so every rebuild of
// the list agrees, and the list is then built again with them. Off, unanswered or failing, the rules stand: "Other, for review".
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { classifyIndustries, CLASSIFY_TEMPLATE, type IndustryText } from '../../ai/classify.ts';
import type { AiGateway } from '../../ai/gateway.ts';
import { industryKey, lookupDecides, type AiVertical, type LeadResult } from '../../demandai-engine.ts';
import { aiVerticals } from '../db/schema.ts';
import { withTenant, type Db, type TenantContext } from '../db/tenant.ts';
import { callContext } from '../ai.ts';
import { logger } from '../logger.ts';

const chunks = <T>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** The industry texts the classifier may decide: accounts held for review that the table (or an exclusion) doesn't
 *  decide and no person has set. */
export function unmatchedIndustries(result: Pick<LeadResult, 'accounts'>): IndustryText[] {
  const out = new Map<string, IndustryText>();
  for (const a of result.accounts) {
    if (!a.needsReview || a.aiAssisted || lookupDecides(a.industry, a.siteProcess)) continue;
    const key = industryKey(a.industry, a.siteProcess);
    if (!out.has(key)) out.set(key, { key, industry: a.industry, siteProcess: a.siteProcess });
  }
  return [...out.values()];
}

export type ClassifyStep = { verticals: Map<string, AiVertical>; asked: number; cached: number; answered: number; fallbacks: Record<string, number> };

/** Answers for the list's unmatched industries: kept ones first, the rest from the model within `budgetMs`. Never
 *  holds a database transaction while the model works. */
export async function classifyStep(db: Db, ctx: TenantContext, ai: AiGateway, result: Pick<LeadResult, 'accounts'>, budgetMs: number): Promise<ClassifyStep | null> {
  if (!ai.enabled('classify')) return null;
  const ask = unmatchedIndustries(result);
  if (!ask.length) return null;
  // Keyed by the deployment classification goes to (D-44: it can be the small model), so another model asks again.
  const keys = ask.map(a => a.key), model = `${ai.describe().provider}:${ai.deploymentFor('classify') ?? ''}`;
  const kept = await withTenant(db, ctx, async s => {
    const rows: { key: string; vertical: string; confidence: string; reason: string }[] = [];
    for (const part of chunks(keys, 500)) {
      rows.push(...await s.tx.select({ key: aiVerticals.industryKey, vertical: aiVerticals.vertical, confidence: aiVerticals.confidence, reason: aiVerticals.reason })
        .from(aiVerticals).where(and(eq(aiVerticals.businessUnitId, ctx.businessUnitId), eq(aiVerticals.templateVersion, CLASSIFY_TEMPLATE.version), eq(aiVerticals.model, model),
          inArray(aiVerticals.industryKey, part))));
    }
    return rows;
  }, { label: 'ai.verticals.read' });
  const verticals = new Map<string, AiVertical>(kept.map(r => [r.key, { vertical: r.vertical, confidence: r.confidence as AiVertical['confidence'], reason: r.reason }]));
  const missing = ask.filter(a => !verticals.has(a.key));
  const step: ClassifyStep = { verticals, asked: ask.length, cached: kept.length, answered: 0, fallbacks: {} };
  if (missing.length && budgetMs >= 5_000) {
    const fresh = await classifyIndustries(ai, callContext(ctx, { deadlineMs: budgetMs }), missing);
    step.answered = fresh.answers.size;
    step.fallbacks = fresh.fallbacks as Record<string, number>;
    if (fresh.answers.size) {
      const rows = [...fresh.answers].map(([key, a]) => ({ businessUnitId: ctx.businessUnitId, industryKey: key, templateVersion: CLASSIFY_TEMPLATE.version, model,
        vertical: a.vertical, confidence: a.confidence, reason: a.reason, aiCallId: a.callId, createdBy: ctx.userId }));
      await withTenant(db, ctx, async s => {
        for (const part of chunks(rows, 500)) await s.tx.insert(aiVerticals).values(part).onConflictDoNothing();
      }, { label: 'ai.verticals.keep' });
      for (const [key, a] of fresh.answers) verticals.set(key, { vertical: a.vertical, confidence: a.confidence, reason: a.reason });
    }
  } else if (missing.length) {
    step.fallbacks = { busy: missing.length };
  }
  logger.info({ event: 'ai.classify.step', asked: step.asked, cached: step.cached, answered: step.answered, fallbacks: step.fallbacks }, 'Industries classified');
  return step;
}
