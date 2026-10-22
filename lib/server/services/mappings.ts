// Saved column mappings (G-040): a person picks the template column for a source's own column names once; later files
// from the same source are read with it. Shared within the business unit. Names and column names only, no row data.
import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';
import { LEAD_COLUMNS, SIGNAL_COLUMNS, type ColumnMapping } from '../../demandai-engine.ts';
import { columnMappings } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { badRequest } from '../http/errors.ts';
import type { Actor } from './lists.ts';
import type { UploadKind } from './uploads.ts';

export type MappingView = { id: string; kind: UploadKind; name: string; mapping: ColumnMapping; updatedAt: Date };

export async function listMappings(scope: TenantScope, kind: UploadKind): Promise<MappingView[]> {
  const rows = await scope.tx.select({ id: columnMappings.id, kind: columnMappings.kind, name: columnMappings.name, mapping: columnMappings.mapping, updatedAt: columnMappings.updatedAt })
    .from(columnMappings).where(and(eq(columnMappings.businessUnitId, scope.ctx.businessUnitId), eq(columnMappings.kind, kind))).orderBy(asc(columnMappings.name));
  return rows.map(r => ({ ...r, kind: r.kind as UploadKind, mapping: r.mapping as ColumnMapping }));
}

export async function getMapping(scope: TenantScope, id: string): Promise<ColumnMapping | null> {
  const [m] = await scope.tx.select({ mapping: columnMappings.mapping }).from(columnMappings)
    .where(and(eq(columnMappings.id, id), eq(columnMappings.businessUnitId, scope.ctx.businessUnitId)));
  return m ? (m.mapping as ColumnMapping) : null;
}

/** Saves (or replaces, by name) a mapping. Each target must be a template column, used once. */
export async function saveMapping(scope: TenantScope, actor: Actor, input: { kind: UploadKind; name: string; mapping: ColumnMapping }): Promise<{ id: string }> {
  const columns = input.kind === 'lead' ? LEAD_COLUMNS : SIGNAL_COLUMNS;
  const entries = Object.entries(input.mapping).filter(([from, to]) => from.trim() && to);
  const bad = entries.filter(([, to]) => !columns.includes(to)).map(([, to]) => to);
  if (bad.length) throw badRequest(`Not template columns: ${bad.join(', ')}.`, { mapping: [`Choose from the ${input.kind} template's columns.`] });
  const targets = entries.map(([, to]) => to);
  const twice = targets.filter((t, i) => targets.indexOf(t) !== i);
  if (twice.length) throw badRequest(`Each template column can be chosen once (${[...new Set(twice)].join(', ')} twice).`, { mapping: ['A template column is chosen twice.'] });
  if (!entries.length) throw badRequest('Choose at least one column.', { mapping: ['Nothing is mapped.'] });
  const mapping = Object.fromEntries(entries.map(([from, to]) => [from.trim(), to]));
  const [row] = await scope.tx.insert(columnMappings).values({
    businessUnitId: scope.ctx.businessUnitId, kind: input.kind, name: input.name, mapping, createdBy: actor.userId, updatedBy: actor.userId,
  }).onConflictDoUpdate({
    target: [columnMappings.businessUnitId, columnMappings.kind, columnMappings.name],
    set: { mapping, updatedAt: sql`now()`, updatedBy: actor.userId },
  }).returning({ id: columnMappings.id });
  await recordAudit(scope, { action: 'mapping.saved', actorRole: actor.role, targetType: 'column_mapping', targetId: row.id, details: { kind: input.kind, columns: entries.length } });
  return { id: row.id };
}
