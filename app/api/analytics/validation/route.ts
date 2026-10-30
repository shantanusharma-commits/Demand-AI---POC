import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { withTenant } from '@/lib/server/db/tenant';
import { saveValidation, validationView } from '@/lib/server/services/analytics';

// Validation: each gate's method, baseline, sample and threshold, the configuration versions and the readiness checks.
export const GET = withApi({ route: 'GET /api/analytics/validation', auth: 'unit', permission: 'analytics.view' }, async ({ deps, tenant, role }) => {
  return withTenant(deps.db, tenant!, s => validationView(s, { userId: tenant!.userId, role: role! }), { label: 'analytics.validation', slowMs: 3_000 });
});

const Body = z.object({
  g1BaselineMinutes: z.number().optional(), g1BaselineTimed: z.boolean().optional(), g1Threshold: z.number().optional(), g2Threshold: z.number().optional(),
  minDecisions: z.number().optional(), spotCheckShare: z.number().optional(), dealSizeThreshold: z.number().optional(),
}).strict();

// A manager changes the measurement and proceed criteria (Setup, 30 Oct 2026; were set here from Analytics): a new
// configuration version, dated, with what changed (D-21).
export const PATCH = withApi<z.infer<typeof Body>>({ route: 'PATCH /api/analytics/validation', auth: 'unit', permission: 'validation.edit', body: Body }, async ({ deps, tenant, role, body }) => {
  return withTenant(deps.db, tenant!, s => saveValidation(s, { userId: tenant!.userId, role: role! }, body));
});
