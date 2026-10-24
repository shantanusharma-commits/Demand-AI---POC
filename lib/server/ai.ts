// The process's AI gateway, built once from the validated configuration (D-5, D-35, D-40, D-44), and the metadata record
// of each call (D-6). Kept on globalThis: Next bundles server code into several chunks, and the circuit breaker and the
// concurrency limit must be one per process. Services take the gateway from here; tests put a fake client behind it.
import 'server-only';
import { AiGateway, createModelClient, type AiCallRecord, type CallContext, type GatewayOptions, type ProviderConfig } from '../ai/gateway.ts';
import type { Capability } from '../ai/types.ts';
import { env, type Env } from './env.ts';
import { getPool } from './db/pool.ts';
import { aiCalls } from './db/schema.ts';
import { createDb, withTenant, type Db, type TenantContext } from './db/tenant.ts';
import { currentLogContext } from './logger.ts';

const holder = globalThis as typeof globalThis & { __demandaiAi?: AiGateway };

/** Each capability's flag from the environment; every one is off unless set. */
export function aiFlags(e: Env): Record<Capability, boolean> {
  return {
    classify: e.AI_FEATURE_CLASSIFY, why_now: e.AI_FEATURE_WHY_NOW, draft_message: e.AI_FEATURE_DRAFTING, draft_content: e.AI_FEATURE_CONTENT_STUDIO,
    copilot: e.AI_FEATURE_COPILOT, healthcheck: true,
  };
}

/** Which capabilities would reach a model (a provider is configured and the switch is on), for the screens' words.
 *  Reads the configuration only: no client, no pool. */
export function aiOn(): Record<Capability, boolean> {
  const e = env(), configured = providerConfig(e).provider !== 'none', f = aiFlags(e);
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, configured && v])) as Record<Capability, boolean>;
}

/** Where calls go, from the environment. The key stays inside the provider client. */
export function providerConfig(e: Env): ProviderConfig {
  if (e.AI_PROVIDER === 'azure-openai' && e.AZURE_OPENAI_ENDPOINT && e.AZURE_OPENAI_API_KEY && e.AZURE_OPENAI_DEPLOYMENT) {
    return { provider: 'azure-openai', endpoint: e.AZURE_OPENAI_ENDPOINT, apiKey: e.AZURE_OPENAI_API_KEY, deployment: e.AZURE_OPENAI_DEPLOYMENT,
      apiVersion: e.AZURE_OPENAI_API_VERSION, authHeader: e.AZURE_OPENAI_AUTH_HEADER };
  }
  if (e.AI_PROVIDER === 'bedrock' && e.AWS_REGION && e.BEDROCK_MODEL_ID) return { provider: 'bedrock', region: e.AWS_REGION, modelId: e.BEDROCK_MODEL_ID };
  return { provider: 'none' };
}

/** The small model (D-44): the same provider and settings with the small deployment or model ID, if one is set. */
export function smallProviderConfig(e: Env): ProviderConfig {
  const main = providerConfig(e);
  if (main.provider === 'azure-openai' && e.AZURE_OPENAI_DEPLOYMENT_SMALL) return { ...main, deployment: e.AZURE_OPENAI_DEPLOYMENT_SMALL };
  if (main.provider === 'bedrock' && e.BEDROCK_MODEL_ID_SMALL) return { ...main, modelId: e.BEDROCK_MODEL_ID_SMALL };
  return { provider: 'none' };
}

/** Everything the gateway is built from, read from the configuration (the app, the evaluation and the smoke test). */
export function gatewayOptions(e: Env): GatewayOptions {
  return {
    client: createModelClient(providerConfig(e)), small: createModelClient(smallProviderConfig(e)), smallFor: e.AI_SMALL_MODEL_FOR, reasoning: e.AI_REASONING_EFFORT ?? {},
    flags: aiFlags(e), timeoutMs: e.AI_TIMEOUT_MS, maxConcurrency: e.AI_MAX_CONCURRENCY,
    prices: { inputPerMTok: e.AI_PRICE_INPUT_PER_MTOK, outputPerMTok: e.AI_PRICE_OUTPUT_PER_MTOK },
    smallPrices: { inputPerMTok: e.AI_PRICE_SMALL_INPUT_PER_MTOK, outputPerMTok: e.AI_PRICE_SMALL_OUTPUT_PER_MTOK },
  };
}

/** Stores one call's metadata in its business unit, in a transaction of its own (never the caller's). */
export async function recordAiCall(db: Db, rec: AiCallRecord): Promise<void> {
  const ctx: TenantContext = { userId: rec.userId, businessUnitId: rec.businessUnitId, scope: 'all', ownerEmails: [] };
  await withTenant(db, ctx, s => s.tx.insert(aiCalls).values({
    id: rec.id, businessUnitId: rec.businessUnitId, capability: rec.capability, templateId: rec.templateId, templateVersion: rec.templateVersion,
    provider: rec.provider, deployment: rec.deployment, model: rec.model, reasoningEffort: rec.reasoningEffort, latencyMs: rec.latencyMs, promptTokens: rec.promptTokens, completionTokens: rec.completionTokens,
    attempts: rec.attempts, outcome: rec.outcome, fallbackReason: rec.fallbackReason, filterCategories: rec.filterCategories, estCostUsd: rec.estCostUsd,
    requestId: rec.requestId, providerRequestId: rec.providerRequestId, createdBy: rec.userId,
  }), { label: 'ai.record' });
}

export function createAppGateway(e: Env, db: Db | null): AiGateway {
  return new AiGateway({ ...gatewayOptions(e), record: db ? rec => recordAiCall(db, rec) : undefined });
}

/** The process-wide gateway. */
export function aiGateway(): AiGateway {
  if (holder.__demandaiAi) return holder.__demandaiAi;
  const e = env();
  holder.__demandaiAi = createAppGateway(e, e.DATABASE_URL ? createDb(getPool()) : null);
  return holder.__demandaiAi;
}

/** Tests put their own gateway (a fake client behind it) in place, or clear it. */
export function setAiGatewayForTests(g: AiGateway | undefined): void {
  holder.__demandaiAi = g;
}

/** The call context for work done for someone in their business unit (a request, or a job as the System user). */
export function callContext(tenant: Pick<TenantContext, 'businessUnitId' | 'userId'>, extra: Pick<CallContext, 'signal' | 'deadlineMs'> = {}): CallContext {
  return { businessUnitId: tenant.businessUnitId, userId: tenant.userId, requestId: currentLogContext().requestId ?? null, ...extra };
}
