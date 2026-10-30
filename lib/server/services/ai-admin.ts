// The AI service as an Admin sees it (Phase 6; plan §8; D-44): where calls go (provider, the main and small
// deployments and which capabilities use the small one, API version; never a key), which capabilities are switched
// on, whether a circuit breaker has opened, the last 30 days of calls from the metadata record (with the models that
// answered), and a health check that makes one tiny call to each model.
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
  { key: 'segment', label: 'Micro-segments', flag: 'AI_FEATURE_SEGMENTS', what: 'Which micro-segment each account joins, or a new one (Micro-segments & NBA), 10 accounts a call' },
  { key: 'next_action', label: 'Next best action', flag: 'AI_FEATURE_NEXT_ACTION', what: 'The action and runner-up for each account, guided by the action library (Micro-segments & NBA), 10 accounts a call' },
  { key: 'read_guideline', label: 'Reading a brand guideline', flag: 'AI_FEATURE_GUIDELINE', what: 'Rules, writing guidance, plays and frameworks suggested from an uploaded guideline (Content library)' },
];

export async function aiStatus(scope: TenantScope, gw: AiGateway) {
  const d = gw.describe(), e = env();
  const rows = await scope.tx.select({
    capability: aiCalls.capability, outcome: aiCalls.outcome, reason: aiCalls.fallbackReason, n: sql<number>`count(*)::int`,
    tokens: sql<number>`coalesce(sum(${aiCalls.promptTokens} + ${aiCalls.completionTokens}), 0)::int`, cost: sql<number>`coalesce(sum(${aiCalls.estCostUsd}), 0)::float8`,
    latency: sql<number>`coalesce(avg(${aiCalls.latencyMs}), 0)::int`,
    models: sql<string[]>`coalesce(array_agg(distinct ${aiCalls.model}) filter (where ${aiCalls.model} is not null), '{}')`,
  }).from(aiCalls).where(and(eq(aiCalls.businessUnitId, scope.ctx.businessUnitId), gt(aiCalls.createdAt, sql`now() - interval '30 days'`)))
    .groupBy(aiCalls.capability, aiCalls.outcome, aiCalls.fallbackReason);
  const capabilities = [...AI_CAPABILITY_LABELS, { key: 'healthcheck' as Capability, label: 'Health checks', flag: '', what: 'This panel' }].map(c => {
    const mine = rows.filter(r => r.capability === c.key), sum = (k: 'n' | 'tokens' | 'cost') => mine.reduce((t, r) => t + Number(r[k]), 0);
    const by = (o: string) => mine.filter(r => r.outcome === o).reduce((t, r) => t + Number(r.n), 0);
    const reasons: Record<string, number> = {};
    for (const r of mine) if (r.reason) reasons[r.reason] = (reasons[r.reason] ?? 0) + Number(r.n);
    const calls = sum('n');
    const models = [...new Set(mine.flatMap(r => r.models ?? []))].sort();
    return { ...c, deployment: c.key === 'healthcheck' ? null : gw.deploymentFor(c.key), models, on: c.key === 'healthcheck' ? d.provider !== 'none' : gw.enabled(c.key), calls, ok: by('ok'), fallback: by('fallback'), filtered: by('filtered'), error: by('error'),
      tokens: sum('tokens'), costUsd: Math.round(sum('cost') * 100) / 100, avgLatencyMs: calls ? Math.round(mine.reduce((t, r) => t + Number(r.latency) * Number(r.n), 0) / calls) : null,
      reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, n, words: fallbackWords(reason) })) };
  });
  return {
    provider: d.provider, deployment: d.deployment, breaker: d.breaker, small: d.small, reasoning: d.reasoning,
    apiVersion: d.provider === 'azure-openai' ? e.AZURE_OPENAI_API_VERSION : null, authHeader: d.provider === 'azure-openai' ? e.AZURE_OPENAI_AUTH_HEADER : null,
    region: d.provider === 'bedrock' ? e.AWS_REGION ?? null : null, timeoutMs: e.AI_TIMEOUT_MS, maxConcurrency: e.AI_MAX_CONCURRENCY,
    prices: { inputPerMTok: e.AI_PRICE_INPUT_PER_MTOK, outputPerMTok: e.AI_PRICE_OUTPUT_PER_MTOK },
    smallPrices: d.small ? { inputPerMTok: e.AI_PRICE_SMALL_INPUT_PER_MTOK, outputPerMTok: e.AI_PRICE_SMALL_OUTPUT_PER_MTOK } : null, capabilities, days: 30,
  };
}

/** One tiny call to a model: whether it answers, and how fast. */
async function ping(gw: AiGateway, tenant: TenantContext, route: 'main' | 'small', deployment: string) {
  const started = Date.now();
  const r = await gw.text('healthcheck', HEALTH_TEMPLATE, { system: 'You are a connectivity check. Reply with the single word OK.', messages: [{ role: 'user', content: 'Reply with OK.' }],
    maxTokens: 16, temperature: 0, reasoning: 'none', route }, callContext(tenant, { deadlineMs: 20_000 }),
  t => (/\bok\b/i.test(t) ? null : { reason: 'unusable', problems: ['Reply with the single word OK.'] }));
  const latencyMs = Date.now() - started;
  return r.ok === true
    ? { ok: true as const, deployment, latencyMs, message: `The model answered in ${latencyMs} ms.` }
    : { ok: false as const, deployment, latencyMs, reason: r.reason, message: `The model did not answer: ${fallbackWords(r.reason)}.` };
}

/** One tiny call to each configured model through the gateway: whether it answers, and how fast. Never shows the key.
 *  The calls run with no transaction open; the audit entry is written after them. */
export async function healthCheck(db: Db, tenant: TenantContext, actor: Actor, gw: AiGateway) {
  const d = gw.describe();
  if (d.provider === 'none' || !d.deployment) return { ok: false, provider: 'none', deployment: null, latencyMs: null, small: null, message: 'No AI provider is configured (AI_PROVIDER=none), so every capability uses its rules.' };
  const main = await ping(gw, tenant, 'main', d.deployment);
  const small = d.small ? await ping(gw, tenant, 'small', d.small.deployment) : null;
  const ok = main.ok && (small?.ok ?? true);
  await withTenant(db, tenant, s => recordAudit(s, { action: 'ai.healthcheck', actorRole: actor.role, targetType: 'ai', details: {
    provider: d.provider, ok, latencyMs: main.latencyMs, ...(main.ok === false ? { reason: main.reason } : {}),
    ...(small ? { small: { ok: small.ok, latencyMs: small.latencyMs, ...(small.ok === false ? { reason: small.reason } : {}) } } : {}) } }));
  logger.info({ event: 'ai.healthcheck', provider: d.provider, ok, latencyMs: main.latencyMs, ...(small ? { smallOk: small.ok, smallLatencyMs: small.latencyMs } : {}) }, 'AI health check');
  const message = small ? `${main.deployment}: ${main.message} ${small.deployment}: ${small.message}` : main.message;
  return { ...main, ok, provider: d.provider, small, message };
}
