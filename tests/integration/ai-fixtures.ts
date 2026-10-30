// A gateway with a fake model behind it, recording to the test database as the app does.
import { AiGateway } from '../../lib/ai/gateway.ts';
import type { Capability } from '../../lib/ai/types.ts';
import { recordAiCall } from '../../lib/server/ai.ts';
import type { Db } from '../../lib/server/db/tenant.ts';
import type { FakeModel } from '../helpers/fake-model.ts';

// The NBA segment and action steps and the guideline reader stay off unless a test switches them on.
export const ALL_ON: Record<Capability, boolean> = { classify: true, why_now: true, draft_message: true, draft_content: true, copilot: true, healthcheck: true,
  segment: false, next_action: false, read_guideline: false };

export function fakeGateway(db: Db, client: FakeModel, flags: Partial<Record<Capability, boolean>> = ALL_ON): AiGateway {
  return new AiGateway({ client, flags, timeoutMs: 5_000, maxConcurrency: 4, prices: { inputPerMTok: 5, outputPerMTok: 15 },
    record: r => recordAiCall(db, r), sleep: async () => {} });
}
