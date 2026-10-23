// The AI service as an Admin sees it (Phase 6; plan §8): where calls go (provider, deployment, API version; never a
// key), which capabilities are switched on, whether the circuit breaker has opened, the last 30 days of calls from
// the metadata record, and a health check that makes one tiny call.
import 'server-only';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { AiGateway } from '../../ai/gateway.ts';
import type { Capability, Template } from '../../ai/types.ts';
import { fallbackWords } from '../../ai/words.ts';
import { aiCalls } from '../db/schema.ts';
import { withTenant, type Db, type TenantContext, type TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { env } from '../env.ts';
import { callContext } from '../ai.ts';
import { logger } from '../logger.ts';
import type { Actor } from './lists.ts';

export const HEALTH_TEMPLATE: Template = { id: 'healthcheck', version: 1 };
export const AI_CAPABILITY_LABELS: { key: Capability; label: string; flag: string; what: string }[] = [
  { key: 'classify', label: 'Industry classification', flag: 'AI_FEATURE_CLASSIFY', what: 'Accounts whose industry the mapping table does not match (Prospecting)' },
  { key: 'why_now', label: 'Why-now line', flag: 'AI_FEATURE_WHY_NOW', what: 'Tier A and B prospects, from their own signal rows (Scoring)' },
  { key: 'draft_message', label: 'First messages', flag: 'AI_FEATURE_DRAFTING', what: 'Emails and connection notes with an approved claim (Micro-segments & NBA)' },
  { key: 'draft_content', label: 'Content studio writing', flag: 'AI_FEATURE_CONTENT_STUDIO', what: 'New pieces and changes the rules do not understand (Content studio)' },
  { key: 'copilot', label: 'Copilot free-text answers', flag: 'AI_FEATURE_COPILOT', what: 'Questions the rule answers do not cover (every working screen)' },
];

export async function aiStatus(scope: TenantScope, gw: AiGateway) {
  const d = gw.describe(), e = env();
  const rows = await scope.tx.select({
    capability: aiCalls.capability, outcome: aiCalls.outcome, reason: aiCalls.fallbackReason, n: sql<number>`count(*)::int`,
    tokens: sql<number>`coalesce(sum(${aiCalls.promptTokens} + ${aiCalls.completionTokens}), 0)::int`, cost: sql<number>`coalesce(sum(${aiCalls.estCostUsd}), 0)::float8`,
    latency: sql<number>`coalesce(avg(${aiCalls.latencyMs}), 0)::int`,
  }).from(aiCalls).where(and(eq(aiCalls.businessUnitId, scope.ctx.businessUnitId), gt(aiCalls.createdAt, sql`now() - interval '30 days'`)))
    .groupBy(aiCalls.capability, aiCalls.outcome, aiCalls.fallbackReason);
  const capabilities = [...AI_CAPABILITY_LABELS, { key: 'healthcheck' as Capability, label: 'Health checks', flag: '', what: 'This panel' }].map(c => {
    const mine = rows.filter(r => r.capability === c.key), sum = (k: 'n' | 'tokens' | 'cost') => mine.reduce((t, r) => t + Number(r[k]), 0);
    const by = (o: string) => mine.filter(r => r.outcome === o).reduce((t, r) => t + Number(r.n), 0);
    const reasons: Record<string, number> = {};
    for (const r of mine) if (r.reason) reasons[r.reason] = (reasons[r.reason] ?? 0) + Number(r.n);
    const calls = sum('n');
    return { ...c, on: c.key === 'healthcheck' ? d.provider !== 'none' : gw.enabled(c.key), calls, ok: by('ok'), fallback: by('fallback'), filtered: by('filtered'), error: by('error'),
      tokens: sum('tokens'), costUsd: Math.round(sum('cost') * 100) / 100, avgLatencyMs: calls ? Math.round(mine.reduce((t, r) => t + Number(r.latency) * Number(r.n), 0) / calls) : null,
      reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, n, words: fallbackWords(reason) })) };
  });
  return {
    provider: d.provider, deployment: d.deployment, breaker: d.breaker,
    apiVersion: d.provider === 'azure-openai' ? e.AZURE_OPENAI_API_VERSION : null, authHeader: d.provider === 'azure-openai' ? e.AZURE_OPENAI_AUTH_HEADER : null,
    region: d.provider === 'bedrock' ? e.AWS_REGION ?? null : null, timeoutMs: e.AI_TIMEOUT_MS, maxConcurrency: e.AI_MAX_CONCURRENCY,
    prices: { inputPerMTok: e.AI_PRICE_INPUT_PER_MTOK, outputPerMTok: e.AI_PRICE_OUTPUT_PER_MTOK }, capabilities, days: 30,
  };
}

/** One tiny call through the gateway: whether the configured model answers, and how fast. Never shows the key. The
 *  call runs with no transaction open; the audit entry is written after it. */
export async function healthCheck(db: Db, tenant: TenantContext, actor: Actor, gw: AiGateway) {
  const d = gw.describe();
  if (d.provider === 'none') return { ok: false, provider: 'none', deployment: null, latencyMs: null, message: 'No AI provider is configured (AI_PROVIDER=none), so every capability uses its rules.' };
  const started = Date.now();
  const r = await gw.text('healthcheck', HEALTH_TEMPLATE, { system: 'You are a connectivity check. Reply with the single word OK.', messages: [{ role: 'user', content: 'Reply with OK.' }], maxTokens: 5, temperature: 0 },
    callContext(tenant, { deadlineMs: 20_000 }), t => (/\bok\b/i.test(t) ? null : { reason: 'unusable', problems: ['Reply with the single word OK.'] }));
  const latencyMs = Date.now() - started;
  await withTenant(db, tenant, s => recordAudit(s, { action: 'ai.healthcheck', actorRole: actor.role, targetType: 'ai', details: { provider: d.provider, ok: r.ok, latencyMs, ...(r.ok === false ? { reason: r.reason } : {}) } }));
  logger.info({ event: 'ai.healthcheck', provider: d.provider, ok: r.ok, latencyMs }, 'AI health check');
  return r.ok === true
    ? { ok: true, provider: d.provider, deployment: d.deployment, latencyMs, message: `The model answered in ${latencyMs} ms.` }
    : { ok: false, provider: d.provider, deployment: d.deployment, latencyMs, reason: r.reason, message: `The model did not answer: ${fallbackWords(r.reason)}.` };
}
