import { z } from 'zod';
import { withApi } from '@/lib/server/http/api';
import { forbidden } from '@/lib/server/http/errors';
import { uuidField } from '@/lib/server/http/schemas';
import { setActiveBusinessUnit } from '@/lib/server/auth/sessions';
import { logger } from '@/lib/server/logger';

const Body = z.object({ businessUnitId: uuidField });

export const POST = withApi({ route: 'POST /api/session/business-unit', auth: 'user', body: Body }, async ({ body, session, deps }) => {
  const ok = await setActiveBusinessUnit(deps.db, session!.sessionId, session!.user.id, body.businessUnitId);
  if (!ok) throw forbidden('You are not an active member of that business unit.');
  logger.info({ event: 'session.business_unit_switched', businessUnitId: body.businessUnitId }, 'Switched business unit');
  return { ok: true };
});
