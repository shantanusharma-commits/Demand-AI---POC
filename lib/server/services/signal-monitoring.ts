// Signal monitoring (G-023; legacy monitorView): what has come in, per signal type. In the POC signals arrive as
// files, so this counts the rows of every signal file scored so far, each file once, through its latest finished run.
// Reps count the rows about the accounts they own (D-33); the file list is the unit's, as uploads are shared.
import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { CONFIG } from '../../demandai-engine.ts';
import { scoringRuns, signals, uploads } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { ownerOnly } from './lists.ts';
import { activeSignalSettings } from './scoring.ts';

export type SignalTypeStatus = 'On' | 'Off' | 'Knock-out' | 'Not scored' | 'Not a known tag';

export type MonitoredType = {
  type: string; segment: string | null; added: boolean; status: SignalTypeStatus;
  /** Rows with this tag; size is the text of those rows as read (template columns joined by commas). */
  records: number; size: number; files: number; latestEvent: string | null; lastReceived: Date | null;
};
export type MonitoredFile = { uploadId: string; fileName: string; usedIn: 'Account Scoring'; rows: number; byteSize: number; receivedAt: Date; sandbox: boolean };
export type SignalMonitoring = {
  scope: 'all' | 'own';
  types: MonitoredType[];
  files: MonitoredFile[];
  totals: { records: number; size: number; files: number; knownSeen: number; known: number; unknownRecords: number; unknownTypes: string[] };
  /** Set when the active signal settings can't be used: statuses then follow the starting configuration. */
  settingsProblem: string | null;
};

const ISO_DATE = '^\\d{4}-\\d{2}-\\d{2}$';

export async function signalMonitoring(scope: TenantScope): Promise<SignalMonitoring> {
  const settings = await activeSignalSettings(scope);
  const latest = scope.tx.selectDistinctOn([scoringRuns.signalUploadId], { runId: scoringRuns.id, uploadId: scoringRuns.signalUploadId }).from(scoringRuns)
    .where(and(eq(scoringRuns.businessUnitId, scope.ctx.businessUnitId), sql`(${scoringRuns.stats}->>'prospects') is not null`))
    .orderBy(scoringRuns.signalUploadId, desc(scoringRuns.createdAt)).as('latest');
  const typeOf = sql<string>`${signals.data}->>'type'`;
  const field = (k: string) => sql`coalesce(${signals.data}->>${k}, '')`;
  const rows = await scope.tx.select({
    uploadId: latest.uploadId, type: typeOf, n: sql<number>`count(*)::int`,
    size: sql<number>`sum(char_length(concat_ws(',', ${sql.join(['company', 'personRef', 'type', 'date', 'detail', 'source', 'product'].map(field), sql`, `)})) + 1)::int`,
    latestEvent: sql<string | null>`max(${signals.data}->>'date') filter (where ${signals.data}->>'date' ~ ${ISO_DATE})`,
  }).from(latest).innerJoin(signals, eq(signals.runId, latest.runId))
    .where(and(sql`coalesce(${typeOf}, '') <> ''`, ownerOnly(scope, signals.ownerEmail)))
    .groupBy(latest.uploadId, typeOf);
  const fileRows = await scope.tx.select({ uploadId: uploads.id, fileName: uploads.fileName, byteSize: uploads.byteSize, receivedAt: uploads.createdAt, sandbox: uploads.sandbox })
    .from(latest).innerJoin(uploads, eq(uploads.id, latest.uploadId)).orderBy(desc(uploads.createdAt));

  // The tags a file can use: the starting types and those added in Setup. A row's tag is read as the scoring reads it
  // (any case, and the D-14 synonyms); anything else is "Not a known tag".
  const catalog = { ...CONFIG.signalTypes, ...Object.fromEntries(settings.custom.map(c => [c.name, { segment: c.segment, added: true }])) } as Record<string, { segment?: string; knockout?: boolean; reject?: string; added?: boolean }>;
  const names = Object.keys(catalog);
  const canonical = (t: string) => catalog[t] ? t : names.find(k => k.toLowerCase() === t.toLowerCase()) ?? CONFIG.synonyms.signalTypes[t.toLowerCase().replace(/\s+/g, ' ')] ?? t;
  const received = new Map(fileRows.map(f => [f.uploadId, f.receivedAt]));
  const by = new Map<string, { records: number; size: number; files: Set<string>; latestEvent: string | null; lastReceived: Date | null }>();
  const perFile = new Map<string, number>();
  for (const r of rows) {
    const k = canonical(r.type);
    const o = by.get(k) ?? { records: 0, size: 0, files: new Set<string>(), latestEvent: null, lastReceived: null };
    o.records += r.n; o.size += r.size; o.files.add(r.uploadId);
    if (r.latestEvent && (!o.latestEvent || r.latestEvent > o.latestEvent)) o.latestEvent = r.latestEvent;
    const at = received.get(r.uploadId) ?? null;
    if (at && (!o.lastReceived || at > o.lastReceived)) o.lastReceived = at;
    by.set(k, o);
    perFile.set(r.uploadId, (perFile.get(r.uploadId) ?? 0) + r.n);
  }
  const off = new Set(settings.off);
  const statusOf = (t: string): SignalTypeStatus => {
    const c = catalog[t];
    return !c ? 'Not a known tag' : c.knockout ? 'Knock-out' : c.reject ? 'Not scored' : off.has(t) ? 'Off' : 'On';
  };
  const unknown = [...by.keys()].filter(k => !catalog[k]).sort((a, b) => by.get(b)!.records - by.get(a)!.records || a.localeCompare(b));
  const types = [...names, ...unknown].map(t => {
    const o = by.get(t);
    return {
      type: t, segment: catalog[t]?.segment ?? null, added: !!catalog[t]?.added, status: statusOf(t),
      records: o?.records ?? 0, size: o?.size ?? 0, files: o?.files.size ?? 0, latestEvent: o?.latestEvent ?? null, lastReceived: o?.lastReceived ?? null,
    };
  });
  const sum = (f: (t: MonitoredType) => number, list = types) => list.reduce((n, t) => n + f(t), 0);
  return {
    scope: scope.ctx.scope,
    types,
    files: fileRows.map(f => ({ ...f, usedIn: 'Account Scoring' as const, rows: perFile.get(f.uploadId) ?? 0 })),
    totals: {
      records: sum(t => t.records), size: sum(t => t.size), files: fileRows.length,
      knownSeen: names.filter(t => by.has(t)).length, known: names.length,
      unknownRecords: sum(t => t.records, types.filter(t => t.status === 'Not a known tag')), unknownTypes: unknown,
    },
    settingsProblem: settings.problem,
  };
}
