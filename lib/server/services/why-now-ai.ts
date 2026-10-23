// The why-now line worded by AI inside the scoring job (spec 4.14, G-025, D-5): for the tier A and B prospects with a
// live signal (the ones handed off by default; the row budget), from their own strongest signal rows. Off, failing or
// out of time, the rules' line stands; the run records how many lines the AI wrote and why the rest didn't.
import 'server-only';
import { wordWhyNow, type WhyNowInput } from '../../ai/why-now.ts';
import type { AiGateway } from '../../ai/gateway.ts';
import type { Prospect } from '../../engine/prospects.ts';
import type { TenantContext } from '../db/tenant.ts';
import { callContext } from '../ai.ts';
import { logger } from '../logger.ts';

export type WhyNowStats = { asked: number; worded: number; fallbacks: Record<string, number> };

/** Adds `whyNowAi` to the prospects it words, and returns the counts (null when the capability is off). */
export async function whyNowStep(ai: AiGateway, ctx: TenantContext, prospects: Prospect[], budgetMs: number): Promise<WhyNowStats | null> {
  if (!ai.enabled('why_now')) return null;
  const chosen = prospects.filter(x => (x.tier === 'A' || x.tier === 'B') && x.p && x.p.signals.length);
  if (!chosen.length) return null;
  const stats: WhyNowStats = { asked: chosen.length, worded: 0, fallbacks: {} };
  if (budgetMs < 5_000) { stats.fallbacks = { busy: chosen.length }; return stats; }
  const inputs: WhyNowInput[] = chosen.map(x => ({ key: String(x.c.row), jobTitle: x.c.jobTitle, persona: x.c.persona,
    signals: x.p!.signals.map(s => ({ row: s.row, type: s.type, date: s.date, detail: s.detail, source: s.source, weight: Number(s.weight) || 0 })) }));
  const out = await wordWhyNow(ai, callContext(ctx, { deadlineMs: budgetMs }), inputs);
  for (const x of chosen) {
    const l = out.lines.get(String(x.c.row));
    if (l) x.p!.whyNowAi = l;
  }
  stats.worded = out.lines.size;
  stats.fallbacks = out.fallbacks as Record<string, number>;
  logger.info({ event: 'ai.why_now.step', ...stats }, 'Why-now lines worded');
  return stats;
}
