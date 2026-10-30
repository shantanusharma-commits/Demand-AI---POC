// Content library on the server (G-009; legacy 07-content.html): the brand pack every draft is checked against —
// voice and tone, negative keywords, approved claims with an owner and an expiry, messaging frameworks and the
// guideline document. Changes wait in the unit's draft; saving makes the next version (append-only), and an earlier
// version can be restored as a new one. Admin and Sales manager maintain it; everyone with Content library sees it.
import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { and, desc, eq, max, sql } from 'drizzle-orm';
import { CONFIG } from '../../demandai-engine.ts';
import { defaultBrand, FRAMEWORK_ACTIONS, VOICE_PRESETS, type BrandPack, type CheckResult, type Rec } from '../../engine/nba.ts';
import { diffSummary, readRules, type BrandDiff, type RuleSuggestion } from '../../content/brand.ts';
import { readGuidelineAi, type GuidelineReading } from '../../ai/guideline.ts';
import { fallbackWords } from '../../ai/words.ts';
import { DocumentReadError, extractText } from '../documents/extract.ts';
import { aiGateway, callContext } from '../ai.ts';
import { brandDocuments, brandDrafts, brandVersions, drafts, nbaRuns, recommendations, SYSTEM_USER_ID, users } from '../db/schema.ts';
import { withTenant, type Db, type TenantContext, type TenantScope } from '../db/tenant.ts';
import { recordAudit } from '../db/audit.ts';
import { badRequest, conflict, HttpError, notFound } from '../http/errors.ts';
import { logger } from '../logger.ts';
import { ownerOnly, type Actor } from './lists.ts';

/* ─── What a pack may contain (the server keeps the playbook, the version and the history itself) ─── */

const oneOf = (values: string[], message: string) => z.string().refine(v => values.includes(v), message);
const str = (maxLen: number) => z.string().trim().max(maxLen);
const list = (maxItems: number, maxLen: number) => z.array(z.string().trim().min(1).max(maxLen)).max(maxItems);
const SEGMENTS = Object.keys(CONFIG.segmentLibrary);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const ClaimInput = z.object({
  id: z.string().regex(/^[A-Z]{2}-\d{2,4}$/, 'A claim ID looks like CL-07.'),
  type: str(60).min(1, 'Say what kind of source it is.'), year: z.number().int().min(1990).max(2100),
  title: str(200).min(1, 'Give the source title.'), segments: z.array(oneOf(SEGMENTS, 'Not a micro-segment.')).min(1).max(SEGMENTS.length),
  expiry: z.string().regex(ISO_DAY, 'Give the expiry as a date.'), claim: str(600).min(1, 'Write the claim.'),
  status: z.enum(['approved', 'draft', 'retired']), owner: str(120).default(''),
});
const FrameworkInput = z.object({
  objective: str(200).min(1, 'Say what the message is for.'), name: str(120).min(1, 'Name the framework.'), steps: list(12, 300).min(1, 'Give its structure.'), ask: str(200).optional(),
  use: z.enum(['Often', 'Sometimes', 'Rarely', 'Not used']), actions: z.array(oneOf(Object.keys(FRAMEWORK_ACTIONS), 'Not a call to action.')).max(10).default([]),
});
export const PackInput = z.object({
  voice: z.object({
    preset: oneOf(Object.keys(VOICE_PRESETS), 'Pick a voice.'), signoff: str(80), maxWords: z.number().int().min(20).max(1000),
    maxSentenceWords: z.number().int().min(5).max(200), noExclamation: z.boolean(), bannedOpeners: list(50, 200), notes: str(5000), guidance: list(100, 300).optional(),
  }),
  negative: list(500, 100), competitors: list(200, 100),
  claims: z.array(ClaimInput).max(500).refine(cs => new Set(cs.map(c => c.id)).size === cs.length, 'Two claims have the same ID.'),
  frameworks: z.array(FrameworkInput).max(60).refine(fs => new Set(fs.map(f => f.objective.toLowerCase())).size === fs.length, 'Two frameworks have the same objective.'),
  guideline: z.object({ documentId: z.uuid() }).nullable(),
  // The plays per situation or micro-segment (30 Oct 2026; were kept by the server, out of reach).
  plays: z.record(str(80).min(1), z.object({ angle: str(300).min(1, 'Give the angle.'), objection: str(300), response: str(400), questions: list(10, 200).default([]) }))
    .refine(p => Object.keys(p).length <= 60, 'At most 60 plays.').optional(),
});
export type PackInput = z.infer<typeof PackInput>;

export type BrandVersionRow = { versionNo: number; note: string; sections: string[]; changes: string[]; restoredFrom: number | null; at: Date; by: string };
export type BrandState = {
  live: BrandVersionRow & { id: string; pack: BrandPack };
  draft: { pack: BrandPack; baseVersionNo: number; updatedAt: Date; updatedBy: string; changes: BrandDiff[] } | null;
  versions: BrandVersionRow[];
};

const byName = sql<string>`coalesce(${users.displayName}, 'A former member')`;
const versionColumns = { versionNo: brandVersions.versionNo, note: brandVersions.note, sections: brandVersions.sections, changes: brandVersions.changes, restoredFrom: brandVersions.restoredFrom, at: brandVersions.createdAt, by: byName };

/** The live version: the newest. A unit without one starts from the starting pack (version 1). */
export async function liveBrand(scope: TenantScope): Promise<BrandVersionRow & { id: string; pack: BrandPack }> {
  const read = () => scope.tx.select({ ...versionColumns, id: brandVersions.id, pack: brandVersions.pack }).from(brandVersions).leftJoin(users, eq(users.id, brandVersions.createdBy))
    .where(eq(brandVersions.businessUnitId, scope.ctx.businessUnitId)).orderBy(desc(brandVersions.versionNo)).limit(1);
  let [v] = await read();
  if (!v) {
    await scope.tx.insert(brandVersions).values({ businessUnitId: scope.ctx.businessUnitId, versionNo: 1, pack: defaultBrand(), note: 'Starting brand pack', createdBy: SYSTEM_USER_ID }).onConflictDoNothing();
    [v] = await read();
  }
  return { ...v, pack: v.pack as BrandPack };
}

export async function getBrand(scope: TenantScope): Promise<BrandState> {
  const live = await liveBrand(scope);
  const [d] = await scope.tx.select({ pack: brandDrafts.pack, baseVersionNo: brandDrafts.baseVersionNo, updatedAt: brandDrafts.updatedAt, updatedBy: byName })
    .from(brandDrafts).leftJoin(users, eq(users.id, brandDrafts.updatedBy)).where(eq(brandDrafts.businessUnitId, scope.ctx.businessUnitId));
  const versions = await scope.tx.select(versionColumns).from(brandVersions).leftJoin(users, eq(users.id, brandVersions.createdBy))
    .where(eq(brandVersions.businessUnitId, scope.ctx.businessUnitId)).orderBy(desc(brandVersions.versionNo));
  return {
    live, versions,
    draft: d ? { ...d, pack: d.pack as BrandPack, changes: diffSummary(live.pack, d.pack as BrandPack) } : null,
  };
}

/** The pack as stored: the validated parts from the person, the rest (playbook) from the version it starts from. */
async function buildPack(scope: TenantScope, input: PackInput, base: BrandPack): Promise<BrandPack> {
  let guideline: BrandPack['guideline'] = null;
  if (input.guideline) {
    const prev = base.guideline as { documentId?: string } | null;
    if (prev?.documentId === input.guideline.documentId) guideline = prev;
    else {
      const [doc] = await scope.tx.select({ id: brandDocuments.id, name: brandDocuments.fileName, size: brandDocuments.byteSize, at: brandDocuments.createdAt, by: byName })
        .from(brandDocuments).leftJoin(users, eq(users.id, brandDocuments.createdBy))
        .where(and(eq(brandDocuments.id, input.guideline.documentId), eq(brandDocuments.businessUnitId, scope.ctx.businessUnitId)));
      if (!doc) throw badRequest('That guideline document is not there any more. Upload it again.', { guideline: ['Upload the document again.'] });
      guideline = { documentId: doc.id, name: doc.name, size: doc.size, at: doc.at.toISOString(), by: doc.by };
    }
  }
  return {
    v: base.v, voice: input.voice, negative: input.negative, competitors: input.competitors,
    claims: input.claims.map(c => ({ ...c, claim: /[.!?]$/.test(c.claim) ? c.claim : c.claim + '.' })),
    framework: input.plays ?? base.framework, frameworks: input.frameworks, guideline, history: [],
  };
}

/* ─── The draft ─── */

export async function saveDraft(scope: TenantScope, actor: Actor, input: { pack: PackInput; baseVersionNo: number }): Promise<{ changes: BrandDiff[] }> {
  const live = await liveBrand(scope);
  if (input.baseVersionNo !== live.versionNo) throw conflict(`Brand v${live.versionNo} was saved since these changes were started. Reload to see it; these changes were not kept.`);
  const pack = await buildPack(scope, input.pack, live.pack);
  const changes = diffSummary(live.pack, pack);
  if (!changes.length) {
    await scope.tx.delete(brandDrafts).where(eq(brandDrafts.businessUnitId, scope.ctx.businessUnitId));
    return { changes };
  }
  await scope.tx.insert(brandDrafts).values({ businessUnitId: scope.ctx.businessUnitId, baseVersionNo: live.versionNo, pack, updatedBy: actor.userId })
    .onConflictDoUpdate({ target: brandDrafts.businessUnitId, set: { baseVersionNo: live.versionNo, pack, updatedBy: actor.userId, updatedAt: sql`now()` } });
  return { changes };
}

export async function discardDraft(scope: TenantScope, actor: Actor): Promise<void> {
  const gone = await scope.tx.delete(brandDrafts).where(eq(brandDrafts.businessUnitId, scope.ctx.businessUnitId)).returning({ bu: brandDrafts.businessUnitId });
  if (!gone.length) throw conflict('There are no unsaved changes to discard.');
  await recordAudit(scope, { action: 'brand.draft_discarded', actorRole: actor.role, targetType: 'brand_pack' });
}

/* ─── Versions: saving the draft, and restoring an earlier one ─── */

async function addVersion(scope: TenantScope, actor: Actor, pack: BrandPack, note: string, changes: BrandDiff[], restoredFrom: number | null): Promise<number> {
  const [{ top }] = await scope.tx.select({ top: max(brandVersions.versionNo) }).from(brandVersions).where(eq(brandVersions.businessUnitId, scope.ctx.businessUnitId));
  const versionNo = (top ?? 0) + 1;
  try {
    await scope.tx.insert(brandVersions).values({
      businessUnitId: scope.ctx.businessUnitId, versionNo, pack: { ...pack, v: versionNo, history: [] }, note,
      sections: changes.map(c => c.section), changes: changes.flatMap(c => c.lines.map(l => `${c.section}: ${l}`)), restoredFrom, createdBy: actor.userId,
    });
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code === '23505') throw conflict('Someone saved a brand version at the same moment. Reload and try again.');
    throw err;
  }
  return versionNo;
}

export async function publishDraft(scope: TenantScope, actor: Actor, note = ''): Promise<{ versionNo: number }> {
  const live = await liveBrand(scope);
  const [d] = await scope.tx.select().from(brandDrafts).where(eq(brandDrafts.businessUnitId, scope.ctx.businessUnitId)).for('update');
  if (!d) throw conflict('Nothing to save: there are no unsaved changes.');
  if (d.baseVersionNo !== live.versionNo) throw conflict(`Brand v${live.versionNo} was saved since these changes were started. Discard them and start again from v${live.versionNo}.`);
  const changes = diffSummary(live.pack, d.pack as BrandPack);
  if (!changes.length) throw conflict('Nothing to save: the draft is the same as the version in use.');
  const versionNo = await addVersion(scope, actor, d.pack as BrandPack, note.trim() || changes.map(c => c.section).join(', '), changes, null);
  await scope.tx.delete(brandDrafts).where(eq(brandDrafts.businessUnitId, scope.ctx.businessUnitId));
  await recordAudit(scope, { action: 'brand.published', actorRole: actor.role, targetType: 'brand_pack', details: { versionNo, sections: changes.map(c => c.section) } });
  logger.info({ event: 'brand.published', versionNo }, 'Brand version saved');
  return { versionNo };
}

export async function restoreVersion(scope: TenantScope, actor: Actor, from: number): Promise<{ versionNo: number }> {
  const live = await liveBrand(scope);
  const [pending] = await scope.tx.select({ bu: brandDrafts.businessUnitId }).from(brandDrafts).where(eq(brandDrafts.businessUnitId, scope.ctx.businessUnitId));
  if (pending) throw conflict('Save or discard the unsaved changes first.');
  if (from === live.versionNo) throw conflict(`Brand v${from} is already the version in use.`);
  const [old] = await scope.tx.select({ pack: brandVersions.pack }).from(brandVersions)
    .where(and(eq(brandVersions.businessUnitId, scope.ctx.businessUnitId), eq(brandVersions.versionNo, from)));
  if (!old) throw notFound(`There is no Brand v${from}.`);
  const changes = diffSummary(live.pack, old.pack as BrandPack);
  const versionNo = await addVersion(scope, actor, old.pack as BrandPack, `Restored v${from}`, changes, from);
  await recordAudit(scope, { action: 'brand.restored', actorRole: actor.role, targetType: 'brand_pack', details: { versionNo, from } });
  logger.info({ event: 'brand.restored', versionNo, from }, 'Brand version restored');
  return { versionNo };
}

/* ─── Guideline documents: kept as the reference; served back only as a download ─── */

export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const DOC_TYPES: Record<string, (b: Buffer) => boolean> = {
  pdf: b => b.subarray(0, 5).toString('latin1') === '%PDF-',
  docx: b => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])), pptx: b => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  doc: b => b.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')), ppt: b => b.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')),
  txt: isText, md: isText,
};
function isText(b: Buffer): boolean {
  if (b.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); return true; } catch { return false; }
}

export async function addDocument(scope: TenantScope, actor: Actor, file: { fileName: string; bytes: Buffer }): Promise<{ id: string; name: string; size: number }> {
  const ext = (/\.([a-z]+)$/i.exec(file.fileName)?.[1] ?? '').toLowerCase();
  const check = DOC_TYPES[ext];
  if (!check) throw new HttpError(415, 'unsupported_type', 'Upload a PDF, Word, PowerPoint, .txt or .md file.');
  if (!file.bytes.length) throw badRequest('The file is empty.');
  if (file.bytes.length > DOCUMENT_MAX_BYTES) throw new HttpError(413, 'too_large', 'The document is larger than 5 MB.');
  if (!check(file.bytes)) throw new HttpError(415, 'unsupported_type', `The file's contents don't match a .${ext} file.`);
  const name = file.fileName.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
  const [doc] = await scope.tx.insert(brandDocuments).values({
    businessUnitId: scope.ctx.businessUnitId, fileName: name, mediaType: ext, byteSize: file.bytes.length,
    sha256: createHash('sha256').update(file.bytes).digest('hex'), bytes: file.bytes, createdBy: actor.userId,
  }).returning({ id: brandDocuments.id });
  await recordAudit(scope, { action: 'brand.document_added', actorRole: actor.role, targetType: 'brand_document', targetId: doc.id, details: { bytes: file.bytes.length, type: ext } });
  return { id: doc.id, name, size: file.bytes.length };
}

export async function getDocument(scope: TenantScope, id: string): Promise<{ fileName: string; bytes: Buffer }> {
  const [doc] = await scope.tx.select({ fileName: brandDocuments.fileName, bytes: brandDocuments.bytes }).from(brandDocuments)
    .where(and(eq(brandDocuments.id, id), eq(brandDocuments.businessUnitId, scope.ctx.businessUnitId)));
  if (!doc) throw notFound('That document is not there any more.');
  return doc;
}

/* ─── Reading a guideline (30 Oct 2026): the AI suggests, a person adds each suggestion to the draft ─── */

/** The AI's reading as suggestions the screen offers one by one, each with the words it comes from. */
export function suggestionsOf(r: GuidelineReading): RuleSuggestion[] {
  const out: RuleSuggestion[] = [];
  r.rules.negative.forEach(x => out.push({ kind: 'Negative keyword', value: x.value, from: x.from }));
  r.rules.competitors.forEach(x => out.push({ kind: 'Competitor', value: x.value, from: x.from }));
  r.rules.bannedOpeners.forEach(x => out.push({ kind: 'Banned opener', value: x.value, from: x.from }));
  if (r.rules.voice) out.push({ kind: 'Voice', value: r.rules.voice.value, from: r.rules.voice.from });
  if (r.rules.maxSentenceWords) out.push({ kind: 'Sentence length', value: String(r.rules.maxSentenceWords.value), from: r.rules.maxSentenceWords.from });
  if (r.rules.maxEmailWords) out.push({ kind: 'Email length', value: String(r.rules.maxEmailWords.value), from: r.rules.maxEmailWords.from });
  if (r.rules.signoff) out.push({ kind: 'Sign-off', value: r.rules.signoff.value, from: r.rules.signoff.from });
  if (r.rules.noExclamation?.value) out.push({ kind: 'Rule', value: 'No exclamation marks', from: r.rules.noExclamation.from });
  r.guidance.forEach(x => out.push({ kind: 'Guidance', value: x.value, from: x.from }));
  r.plays.forEach(x => out.push({ kind: 'Play', value: `${x.segment || x.situation}: ${x.angle}`, from: x.from,
    play: { key: x.segment || x.situation, angle: x.angle, objection: x.objection, response: x.answer } }));
  r.frameworks.forEach(x => out.push({ kind: 'Framework', value: `${x.objective}: ${x.name} (${x.steps.join(' → ')}; ask: ${x.ask})`, from: x.from,
    framework: { objective: x.objective, name: x.name, steps: x.steps, ask: x.ask } }));
  const seen = new Set<string>();
  return out.filter(x => { const k = `${x.kind}|${x.value.toLowerCase()}`; return !seen.has(k) && !!seen.add(k); });
}

export type GuidelineSuggestions = { name: string; source: 'ai' | 'rules'; why: string; note: string; chars: number; suggestions: RuleSuggestion[] };

/** What a stored guideline suggests for the brand pack: read by the AI when it is on (any format, rules in prose
 *  too), else by the rules' reader (lines written as rules). Nothing changes until a person adds a suggestion and the
 *  version is saved. The document is read in one transaction and the audit kept in another; the model is called with
 *  none open (it can take a minute). */
export async function readGuideline(db: Db, ctx: TenantContext, actor: Actor, documentId: string): Promise<GuidelineSuggestions> {
  const { doc, segments } = await withTenant(db, ctx, async scope => {
    const [d] = await scope.tx.select({ name: brandDocuments.fileName, type: brandDocuments.mediaType, bytes: brandDocuments.bytes }).from(brandDocuments)
      .where(and(eq(brandDocuments.id, documentId), eq(brandDocuments.businessUnitId, scope.ctx.businessUnitId)));
    if (!d) throw notFound('That document is not there any more.');
    return { doc: d, segments: [...new Set([...Object.keys(CONFIG.segmentLibrary), ...Object.keys((await liveBrand(scope)).pack.framework ?? {})])] };
  }, { label: 'brand.read.load' });
  let text: string, note: string;
  try { ({ text, note } = extractText(doc.type, doc.bytes)); }
  catch (err) { if (err instanceof DocumentReadError) throw badRequest(err.message); throw err; }
  const ai = await readGuidelineAi(aiGateway(), callContext(ctx, { deadlineMs: 120_000 }), text, segments);
  const suggestions = ai.ok ? suggestionsOf(ai.reading) : readRules(text);
  const why = ai.ok === true ? 'Read by the AI: every suggestion quotes the words it comes from.'
    : ai.reason === 'disabled' ? 'Read by the rules: lines written as rules only (the AI reader is switched off).'
      : `Read by the rules: lines written as rules only (${ai.reason === 'grounding' ? 'the AI quoted words that are not in the document' : fallbackWords(ai.reason)}).`;
  await withTenant(db, ctx, scope => recordAudit(scope, { action: 'brand.guideline_read', actorRole: actor.role, targetType: 'brand_document', targetId: documentId,
    details: { source: ai.ok ? 'ai' : 'rules', suggestions: suggestions.length, chars: text.length, ...(ai.ok === true ? { aiCallId: ai.callId } : { reason: ai.reason }) } }), { label: 'brand.read.audit' });
  return { name: doc.name, source: ai.ok ? 'ai' : 'rules', why, note, chars: text.length, suggestions };
}

/* ─── Where each claim was used, and what For Review approved that isn't a claim yet ─── */

export type ClaimUse = { who: string; account: string; at: Date; out: boolean; list: string };
export type FromReview = { text: string; account: string; by: string; at: Date };

/** Every message drafted in the unit's micro-segment builds (the caller's own, for a rep): the approved claims each
 *  current draft cites, whether it went out, and the learning loop's candidates: sentences a person edited into a
 *  message that was then released, which read like a claim but are not an approved one. */
export async function claimUsage(scope: TenantScope): Promise<{ use: Record<string, ClaimUse[]>; fromReview: FromReview[] }> {
  const rows = await scope.tx.select({ rec: recommendations.rec, contactRow: recommendations.contactRow, status: recommendations.status, edited: recommendations.edited,
    decidedAt: recommendations.decidedAt, checks: drafts.checks, list: nbaRuns.name, built: nbaRuns.createdAt, by: sql<string>`coalesce(${users.displayName}, '')` })
    .from(recommendations).innerJoin(drafts, and(eq(drafts.recommendationId, recommendations.id), eq(drafts.version, recommendations.draftVersion)))
    .innerJoin(nbaRuns, eq(nbaRuns.id, recommendations.nbaRunId)).leftJoin(users, eq(users.id, recommendations.decidedBy))
    .where(and(eq(recommendations.businessUnitId, scope.ctx.businessUnitId), ownerOnly(scope, recommendations.ownerEmail)));
  const use: Record<string, ClaimUse[]> = {}, fromReview: FromReview[] = [];
  for (const r of rows) {
    const rec = r.rec as Rec, chk = r.checks as CheckResult, at = r.decidedAt ?? r.built, out = r.status === 'Released';
    const who = ((rec.result.people || []).find(p => p.contact.row === r.contactRow)?.contact ?? rec.contact).name;
    for (const cl of chk.claims.filter(c => c.verified)) (use[cl.source.split(' · ')[0]] ??= []).push({ who, account: rec.account.name, at, out, list: r.list });
    if (out && r.edited) for (const u of chk.unsupported) if (!fromReview.some(f => f.text === u.text)) fromReview.push({ text: u.text, account: rec.account.name, by: r.by, at });
  }
  for (const k of Object.keys(use)) use[k].sort((a, b) => +b.at - +a.at);
  return { use, fromReview };
}
