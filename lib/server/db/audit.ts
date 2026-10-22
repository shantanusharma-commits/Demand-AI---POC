// Audit entries are written inside the same transaction as the change they describe, so a change and its audit
// row commit or roll back together (the RFP service's auditedTransaction pattern). `details` must not hold
// personal data: IDs, counts, field names and codes only.
import 'server-only';
import { auditLog } from './schema.ts';
import { currentLogContext } from '../logger.ts';
import type { TenantScope, UserScope } from './tenant.ts';

export type AuditEntry = {
  action: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

/** Records an action in the current business unit. */
export async function recordAudit(scope: TenantScope, entry: AuditEntry): Promise<void> {
  await scope.tx.insert(auditLog).values({
    actorUserId: scope.ctx.userId,
    actorRole: entry.actorRole,
    businessUnitId: scope.ctx.businessUnitId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    requestId: currentLogContext().requestId,
    details: entry.details ?? {},
  });
}

/** Records a platform-level action (no business unit), such as creating a unit. */
export async function recordPlatformAudit(scope: UserScope, entry: AuditEntry): Promise<void> {
  await scope.tx.insert(auditLog).values({
    actorUserId: scope.ctx.userId,
    actorRole: entry.actorRole,
    businessUnitId: null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    requestId: currentLogContext().requestId,
    details: entry.details ?? {},
  });
}
