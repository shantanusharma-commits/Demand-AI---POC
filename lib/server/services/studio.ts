// Content studio on the server (D-36; legacy 15-content-studio.html and demandai-content.js): blogs and whitepapers
// written by the rules in lib/content/studio.ts with the unit's live brand pack, checked by the same brand and claim
// checks as outreach drafts (as of today, so a lapsed claim fails), changed through the chat or by hand, and added to
// the Content library once every check passes. Reps then add a piece to an email or LinkedIn message. Pieces are
// shared in the business unit; each one keeps the conversation that wrote it. Nothing is published or sent.
import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import * as W from '../../content/studio.ts';
import { checkContent, type CheckResult, type Rec } from '../../engine/nba.ts';
import * as R from '../../engine/review.ts';
import { recommendations, studioItems, studioMessages, users } from '../db/schema.ts';
import { withTenant, type Db, type TenantContext, type TenantScope } from '../db/tenant.ts';
import { pieceTimeoutMs, readBrief, rewritePiece, writePiece, BRIEF_TEMPLATE, PIECE_TEMPLATE, REWRITE_TEMPLATE } from '../../ai/studio.ts';
import { aiGateway, callContext } from '../ai.ts';
import { recordAudit } from '../db/audit.ts';
import { badRequest, conflict, notFound } from '../http/errors.ts';
import { zipFiles } from '../http/zip-writer.ts';
import { logger } from '../logger.ts';
import { liveBrand } from './brand.ts';
import type { Actor } from './lists.ts';
import { loadItem, logItem, pausedSegments, segKey, stateOf } from './recommendations.ts';
import { todayUtc } from './scoring.ts';

type Row = typeof studioItems.$inferSelect;
const byName = sql<string>`coalesce(${users.displayName}, 'A former member')`;
const pieceOf = (r: Row): W.Piece => ({ type: r.type as W.ContentType, topic: r.topic, audience: r.audience, tone: r.tone as W.Tone, length: r.length as W.Length,
  sources: r.sources, title: r.title, blocks: r.blocks as W.Block[] });

/** How many outreach messages each piece was added to (the caller's own messages, for a rep). */
async function usageOf(scope: TenantScope, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const { rows } = await scope.tx.execute<{ id: string; n: number }>(sql`select c.id::text as id, count(*)::int as n
    from recommendations r cross join lateral unnest(r.content) as c(id) where r.business_unit_id = ${scope.ctx.businessUnitId} group by 1`);
  return new Map(rows.filter(r => ids.includes(r.id)).map(r => [r.id, r.n]));
}

export type ItemSummary = {
  /** `audience`: who it is for in the person's words, empty for a general reader (D-45). */
  id: string; type: W.ContentType; title: string; topic: string; audience: string; tone: string; length: string; status: string; brandVersionNo: number;
  issues: number; cited: string[]; usage: number; words: number; createdBy: string; updatedAt: Date; updatedBy: string;
  /** Some part was written by the AI writer (Phase 6), and how far to trust it: High when every check passes and it
   *  cites an approved claim, Medium when it passes with no claim, Low while a check fails. */
  ai: { confidence: 'High' | 'Medium' | 'Low' } | null;
};
export type ItemView = ItemSummary & { sources: string[]; blocks: W.Block[]; rev: number; checks: CheckResult; createdAt: Date; messages: { who: string; text: string; at: Date; by: string }[] };

function summarise(r: Row & { createdByName: string; updatedByName: string }, chk: CheckResult, usage: number): ItemSummary {
  return { id: r.id, type: r.type as W.ContentType, title: r.title, topic: r.topic, audience: r.audience, tone: r.tone, length: r.length, status: r.status, brandVersionNo: r.brandVersionNo,
    issues: W.issuesOf(chk), cited: W.citedIn(chk), usage, words: W.wordsOf(r.blocks as W.Block[]), createdBy: r.createdByName, updatedAt: r.updatedAt, updatedBy: r.updatedByName,
    ai: (r.blocks as W.Block[]).some(b => b.ai) ? { confidence: W.issuesOf(chk) ? 'Low' : W.citedIn(chk).length ? 'High' : 'Medium' } : null };
}
const creator = sql<string>`(select coalesce(display_name, 'A former member') from users u where u.id = "studio_items"."created_by")`;
const updater = sql<string>`(select coalesce(display_name, 'A former member') from users u where u.id = "studio_items"."updated_by")`;

/** The unit's pieces, newest first (only those in the Content library with `ready`). */
export async function listItems(scope: TenantScope, opts: { ready?: boolean } = {}): Promise<ItemSummary[]> {
  const rows = await scope.tx.select({ row: studioItems, createdByName: creator, updatedByName: updater }).from(studioItems)
    .where(and(eq(studioItems.businessUnitId, scope.ctx.businessUnitId), opts.ready ? eq(studioItems.status, 'Ready') : undefined)).orderBy(desc(studioItems.updatedAt));
  const { pack } = await liveBrand(scope), today = todayUtc();
  const usage = await usageOf(scope, rows.map(r => r.row.id));
  return rows.map(({ row, createdByName, updatedByName }) => summarise({ ...row, createdByName, updatedByName }, W.checksOf(row.blocks as W.Block[], pack, today), usage.get(row.id) ?? 0));
}

async function rowOf(scope: TenantScope, id: string, lock = false): Promise<Row> {
  const q = scope.tx.select().from(studioItems).where(and(eq(studioItems.id, id), eq(studioItems.businessUnitId, scope.ctx.businessUnitId)));
  const [r] = lock ? await q.for('update') : await q;
  if (!r) throw notFound('That piece is not there.');
  return r;
}

export async function getItem(scope: TenantScope, id: string): Promise<ItemView> {
  const [r] = await scope.tx.select({ row: studioItems, createdByName: creator, updatedByName: updater }).from(studioItems)
    .where(and(eq(studioItems.id, id), eq(studioItems.businessUnitId, scope.ctx.businessUnitId)));
  if (!r) throw notFound('That piece is not there.');
  const { pack } = await liveBrand(scope);
  const checks = W.checksOf(r.row.blocks as W.Block[], pack, todayUtc());
  const messages = await scope.tx.select({ who: studioMessages.who, text: studioMessages.text, at: studioMessages.createdAt, by: byName }).from(studioMessages)
    .leftJoin(users, eq(users.id, studioMessages.createdBy)).where(eq(studioMessages.itemId, id)).orderBy(asc(studioMessages.seq));
  const usage = (await usageOf(scope, [id])).get(id) ?? 0;
  return { ...summarise({ ...r.row, createdByName: r.createdByName, updatedByName: r.updatedByName }, checks, usage), sources: r.row.sources, blocks: r.row.blocks as W.Block[],
    rev: r.row.rev, checks, createdAt: r.row.createdAt, messages };
}

async function say(scope: TenantScope, actor: Actor, itemId: string, msgs: { who: 'me' | 'ai'; text: string }[]): Promise<void> {
  const rows = msgs.filter(m => m.text.trim()).map(m => ({ businessUnitId: scope.ctx.businessUnitId, itemId, who: m.who, text: m.text.slice(0, 4000), createdBy: actor.userId }));
  if (rows.length) await scope.tx.insert(studioMessages).values(rows);
}

/** What the AI writer made of a request before the piece is stored (D-45): the brief it read, a question to ask back
 *  instead of the rules' one, and the piece it wrote. Each is optional: the rules fill the gaps. */
export type StudioAi = { brief?: W.Brief; question?: string | null; written?: { blocks: W.Block[]; sources: string[] } };

/** A new piece from what the person asked for. A request that doesn't say what the piece is about gets a question back
 *  and stores nothing; who it is for is never asked (D-45). */
export async function createItem(scope: TenantScope, actor: Actor, input: { text: string; type: W.ContentType }, ai: StudioAi = {}): Promise<{ created: false; question: string } | { created: true; item: ItemView }> {
  const text = R.cleanNote(input.text, 1000);
  if (!text) throw badRequest('Say what to write.', { text: ['Say what to write.'] });
  const live = await liveBrand(scope);
  const brief = ai.brief ?? W.parseBrief(text, input.type, live.pack.voice.preset);
  if (!brief.ok) return { created: false, question: ai.question || W.briefQuestion(brief.type) };
  const rules = W.newPiece(brief, live.pack, todayUtc()), written = ai.written;
  const p = written ? { ...rules, blocks: written.blocks, sources: written.sources, title: W.titleOf(written.blocks, rules.title) } : rules;
  const [row] = await scope.tx.insert(studioItems).values({
    businessUnitId: scope.ctx.businessUnitId, type: p.type, title: p.title, topic: p.topic, audience: p.audience, tone: p.tone, length: p.length, sources: p.sources,
    blocks: p.blocks, brandVersionNo: live.versionNo, createdBy: actor.userId, updatedBy: actor.userId,
  }).returning({ id: studioItems.id });
  await say(scope, actor, row.id, [{ who: 'me', text }, { who: 'ai', text: W.planLine(p, live.pack, live.versionNo) },
    ...(written ? [{ who: 'ai' as const, text: 'Written with AI from the brief and the brand pack. Any proof is an approved claim, word for word, and every part went through the same brand and claim checks.' }] : []),
    { who: 'ai', text: W.summaryFor(p, W.checksOf(p.blocks, live.pack, todayUtc()), live.versionNo) }]);
  await recordAudit(scope, { action: 'studio.created', actorRole: actor.role, targetType: 'studio_item', targetId: row.id, details: { type: p.type, length: p.length } });
  logger.info({ event: 'studio.created', type: p.type, blocks: p.blocks.length, ai: !!written }, 'Content piece written');
  return { created: true, item: await getItem(scope, row.id) };
}

/** Saves the blocks and bumps the revision; a Ready piece whose checks now fail goes back to draft. */
async function store(scope: TenantScope, actor: Actor, row: Row, next: Partial<Pick<Row, 'tone' | 'length' | 'sources'>> & { blocks: W.Block[] }): Promise<{ backToDraft: boolean }> {
  const { pack } = await liveBrand(scope);
  const fails = W.issuesOf(checkContent(W.textOf(next.blocks), pack, todayUtc())) > 0;
  const backToDraft = row.status === 'Ready' && fails;
  await scope.tx.update(studioItems).set({ ...next, title: W.titleOf(next.blocks, row.title), rev: row.rev + 1, ...(backToDraft ? { status: 'Draft' } : {}),
    updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(studioItems.id, row.id));
  return { backToDraft };
}
function checkRev(row: Row, rev: number) {
  if (rev !== row.rev) throw conflict('Someone else changed this piece since you opened it. Reload to see their version; your last change was not saved.');
}
const DRAFT_NOTE = ' A check fails now, so it is back to draft and out of the Content library until it is fixed.';

/** A person's own edits, saved as they type; the checks come back with the new revision. */
export async function saveBlocks(scope: TenantScope, actor: Actor, id: string, input: { blocks: unknown; rev: number }): Promise<{ rev: number; backToDraft: boolean; checks: CheckResult }> {
  const problem = W.blocksProblem(input.blocks);
  if (problem) throw badRequest(problem, { blocks: [problem] });
  const row = await rowOf(scope, id, true);
  checkRev(row, input.rev);
  const r = await store(scope, actor, row, { blocks: input.blocks as W.Block[] });
  const { pack } = await liveBrand(scope);
  return { rev: row.rev + 1, backToDraft: r.backToDraft, checks: W.checksOf(input.blocks as W.Block[], pack, todayUtc()) };
}

export type ChangeInput = { op: 'ask' | 'tone' | 'length' | 'regenerate' | 'remove' | 'restore'; q?: string; value?: string; target?: string | null; blocks?: unknown; rev: number };

/** What the AI writer made of a change, before it is stored: the blocks, what to say, the part to select, and for a
 *  piece rewritten at another length, the claims it now cites. */
export type ChangeAi = { blocks: W.Block[]; reply?: string; select?: string | null; sources?: string[] };

/** A change asked for in the chat, or from the canvas (tone, length, regenerate or remove a part, undo). With `ai`, a
 *  change the rules didn't understand, or one that needs new wording, is the AI writer's (D-45). */
export async function changeItem(scope: TenantScope, actor: Actor, id: string, input: ChangeInput, ai?: ChangeAi): Promise<{ item: ItemView; reply: string; select: string | null }> {
  const row = await rowOf(scope, id, true);
  checkRev(row, input.rev);
  const { pack } = await liveBrand(scope), p = pieceOf(row);
  let c: W.Change, asked = '';
  switch (input.op) {
    case 'ask': {
      asked = R.cleanNote(input.q, 1000);
      if (!asked) throw badRequest('Say what to change.', { q: ['Say what to change.'] });
      c = W.change(p, asked, pack, input.target);
      break;
    }
    case 'tone':
      if (!(W.TONES as readonly string[]).includes(input.value ?? '')) throw badRequest('Pick a tone.', { value: [W.TONES.join(', ')] });
      asked = `Tone: ${input.value}`; c = W.setTone(p, input.value as W.Tone, pack, input.target); break;
    case 'length':
      if (!(W.LENGTHS as readonly string[]).includes(input.value ?? '')) throw badRequest('Pick a length.', { value: [W.LENGTHS.join(', ')] });
      asked = `Length: ${input.value}`; c = W.setLength(p, input.value as W.Length, pack); break;
    case 'regenerate':
      if (!input.target) throw badRequest('Pick the part to regenerate.');
      c = W.regenerate(p, input.target, pack); break;
    case 'remove':
      if (!input.target) throw badRequest('Pick the part to remove.');
      c = W.removeBlock(p, input.target); break;
    case 'restore': {
      const problem = W.blocksProblem(input.blocks);
      if (problem) throw badRequest(problem, { blocks: [problem] });
      c = { blocks: input.blocks as W.Block[], reply: 'Undone. The piece is back to how it was before my last change.', select: null, changed: true };
      break;
    }
    default: throw badRequest('Not a change the studio makes.');
  }
  // The AI writer's version (checked before it got here) of a change the rules didn't understand or need new wording
  // for; the tone or length it was asked for still goes on the piece.
  if (ai && (c.unknown || c.ai || input.op === 'length')) {
    c = { ...c, blocks: ai.blocks, reply: `${ai.reply || 'Done.'} (Written with AI; every check was run again.)`, select: ai.select !== undefined ? ai.select : input.target ?? null,
      changed: true, ...(ai.sources ? { sources: ai.sources } : {}) };
  }
  let reply = c.reply;
  if (c.changed) {
    const r = await store(scope, actor, row, { blocks: c.blocks, ...(c.tone ? { tone: c.tone } : {}), ...(c.length ? { length: c.length } : {}), ...(c.sources ? { sources: c.sources } : {}) });
    if (r.backToDraft) reply += DRAFT_NOTE;
  }
  await say(scope, actor, id, [{ who: 'me', text: asked }, { who: 'ai', text: reply }]);
  logger.info({ event: 'studio.changed', op: input.op, changed: c.changed }, 'Content piece changed');
  return { item: await getItem(scope, id), reply, select: c.select === undefined ? input.target ?? null : c.select };
}

/* ─── With the AI writer on (D-36, Phase 6): read, write with no transaction open, then store ─── */

/** A new piece with the AI writer on (D-45): the small model reads the request (a question back when it doesn't say
 *  what the piece is about, or when the provider's filter stops it), then the writer plans and words the piece.
 *  Whatever fails falls back to the rules. */
export async function createItemWithAi(db: Db, tenant: TenantContext, actor: Actor, input: { text: string; type: W.ContentType }) {
  const gw = aiGateway(), ai: StudioAi = {};
  if (gw.enabled('draft_content')) {
    const text = R.cleanNote(input.text, 1000);
    const live = text ? await withTenant(db, tenant, s => liveBrand(s), { label: 'studio.brand' }) : null;
    if (live) {
      const read = await readBrief(gw, callContext(tenant, { deadlineMs: 20_000 }), text, input.type, live.pack.voice.preset);
      if (read.ok === true) ai.brief = read.brief;
      else if (read.reason === 'content_filter') {
        // The provider's filter stopped the request itself (one that tries to change the rules, say): nothing is written.
        ai.brief = { ...W.parseBrief(text, input.type, live.pack.voice.preset), ok: false };
        ai.question = `I can't write from that request. ${W.briefQuestion(ai.brief.type)}`;
      } else logger.info({ event: 'studio.ai_fallback', template: BRIEF_TEMPLATE.id, reason: read.reason }, 'Request read by the rules');
      const brief = ai.brief ?? W.parseBrief(text, input.type, live.pack.voice.preset);
      if (brief.ok) {
        const w = await writePiece(gw, callContext(tenant, { deadlineMs: 2 * pieceTimeoutMs(brief.type, brief.length) + 5_000 }), brief, live.pack, todayUtc());
        if (w.ok === true) ai.written = { blocks: w.blocks, sources: w.sources ?? [] };
        else logger.info({ event: 'studio.ai_fallback', template: PIECE_TEMPLATE.id, reason: w.reason }, 'Content piece written by the rules');
      }
    }
  }
  return withTenant(db, tenant, s => createItem(s, actor, input, ai));
}

/** A change with the AI writer on: one the rules don't understand, or that needs new wording (another version, a new
 *  section, longer, another tone), is rewritten by the AI; another length is a new piece from the same brief. */
export async function changeItemWithAi(db: Db, tenant: TenantContext, actor: Actor, id: string, input: ChangeInput) {
  const gw = aiGateway();
  let done: ChangeAi | undefined;
  if (['ask', 'tone', 'regenerate', 'length'].includes(input.op) && gw.enabled('draft_content')) {
    const look = await withTenant(db, tenant, async s => {
      const row = await rowOf(s, id);
      checkRev(row, input.rev);
      const { pack } = await liveBrand(s), p = pieceOf(row), asked = R.cleanNote(input.q, 1000);
      if (input.op === 'length') return (W.LENGTHS as readonly string[]).includes(input.value ?? '') ? { p: { ...p, length: input.value as W.Length }, pack, whole: true as const } : null;
      const c = input.op === 'ask' ? (asked ? W.change(p, asked, pack, input.target) : null)
        : input.op === 'tone' ? ((W.TONES as readonly string[]).includes(input.value ?? '') ? W.setTone(p, input.value as W.Tone, pack, input.target) : null)
        : input.target ? W.regenerate(p, input.target, pack) : null;
      if (!c || !(c.unknown || c.ai)) return null;
      return { p: c.ai ? { ...p, blocks: c.ai.blocks } : p, pack, ask: c.ai?.ask ?? asked, target: c.ai ? c.ai.target : input.target ?? null, whole: false as const };
    }, { label: 'studio.look' });
    if (look?.whole) {
      const w = await writePiece(gw, callContext(tenant, { deadlineMs: 2 * pieceTimeoutMs(look.p.type, look.p.length) + 5_000 }), look.p, look.pack, todayUtc());
      if (w.ok === true) done = { blocks: w.blocks, sources: w.sources, select: null, reply: `Rewrote it at ${look.p.length.toLowerCase()} length.` };
      else logger.info({ event: 'studio.ai_fallback', template: PIECE_TEMPLATE.id, reason: w.reason }, 'Content piece rewritten by the rules');
    } else if (look) {
      const w = await rewritePiece(gw, callContext(tenant, { deadlineMs: 45_000 }), look.p, look.ask, look.target, look.pack, todayUtc());
      if (w.ok === true) done = { blocks: w.blocks, reply: w.reply, select: look.target };
      else logger.info({ event: 'studio.ai_fallback', template: REWRITE_TEMPLATE.id, reason: w.reason }, 'Content change left to the rules');
    }
  }
  // The second transaction checks the revision again: an edit made while the AI wrote wins, and nothing is lost.
  return withTenant(db, tenant, s => changeItem(s, actor, id, input, done));
}

/** In or out of the Content library. In only when every brand and claim check passes. */
export async function setReady(scope: TenantScope, actor: Actor, id: string, ready: boolean): Promise<{ item: ItemView; message: string }> {
  const row = await rowOf(scope, id, true);
  if (ready === (row.status === 'Ready')) throw conflict(ready ? 'It is in the Content library already.' : 'It is not in the Content library.');
  if (ready) {
    const { pack } = await liveBrand(scope);
    const n = W.issuesOf(W.checksOf(row.blocks as W.Block[], pack, todayUtc()));
    if (n) throw conflict(`Fix ${n} check${n > 1 ? 's' : ''} first: only a piece whose brand and claim checks pass goes into the Content library.`);
  }
  await scope.tx.update(studioItems).set({ status: ready ? 'Ready' : 'Draft', updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(studioItems.id, id));
  const message = ready ? 'Added to the Content library, under Content. Reps can now add it to an email or LinkedIn message in Micro-segments & NBA, and it shows which approved claims it cites.'
    : 'Taken out of the Content library: back to draft. Messages it was added to keep it.';
  await say(scope, actor, id, [{ who: 'ai', text: message }]);
  await recordAudit(scope, { action: ready ? 'studio.ready' : 'studio.draft', actorRole: actor.role, targetType: 'studio_item', targetId: id });
  return { item: await getItem(scope, id), message };
}

/** The piece as a file: Word (blogs and whitepapers) or Markdown (for the website). */
export async function exportItem(scope: TenantScope, actor: Actor, id: string, kind: 'docx' | 'md'): Promise<{ fileName: string; body: Buffer | string }> {
  const row = await rowOf(scope, id), blocks = row.blocks as W.Block[];
  await recordAudit(scope, { action: 'studio.exported', actorRole: actor.role, targetType: 'studio_item', targetId: id, details: { kind } });
  if (kind === 'md') return { fileName: W.fileName(row.title, 'md'), body: W.toMarkdown(blocks) };
  const date = row.updatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { fileName: W.fileName(row.title, 'docx'), body: zipFiles(W.docxParts({ type: row.type as W.ContentType, title: row.title, blocks }, date)) };
}

/** A rep adds pieces from the Content library to an outreach message, or to every message with the same action in its
 *  micro-segment (those keep what they had and gain these). Logged on the item. */
export async function setContent(scope: TenantScope, actor: Actor, recId: string, input: { ids: string[]; scope: 'one' | 'all' }): Promise<{ content: string[]; messages: number }> {
  const item = await loadItem(scope, recId, { lock: true });
  if ((await pausedSegments(scope, item.run.id)).has(segKey(item.rec))) throw conflict('Its micro-segment is paused: nothing can be changed until it is resumed.');
  if (item.draft.draft.channel !== 'Email' && item.draft.draft.channel !== 'LinkedIn') throw conflict('Content goes with an email or a LinkedIn message; this one is a task.');
  const ids = [...new Set(input.ids)];
  if (ids.length > 10) throw badRequest('Add at most 10 pieces to one message.');
  if (ids.length) {
    const ready = await scope.tx.select({ id: studioItems.id }).from(studioItems)
      .where(and(eq(studioItems.businessUnitId, scope.ctx.businessUnitId), eq(studioItems.status, 'Ready'), inArray(studioItems.id, ids)));
    if (ready.length !== ids.length) throw badRequest('Only pieces in the Content library can be added to a message.', { ids: ['Pick pieces from the Content library.'] });
  }
  await scope.tx.update(recommendations).set({ content: ids, updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(recommendations.id, recId));
  let others = 0;
  if (input.scope === 'all' && ids.length) {
    const seg = R.segOf(item.rec, item.state), action = R.chosenAction(item.rec, item.state);
    if (seg) {
      const rows = await scope.tx.select().from(recommendations)
        .where(and(eq(recommendations.nbaRunId, item.run.id), eq(recommendations.businessUnitId, scope.ctx.businessUnitId), sql`${recommendations.id} <> ${recId}`));
      for (const r of rows) {
        const st = stateOf(r), rec = r.rec as Rec;
        if (R.segOf(rec, st) !== seg || R.chosenAction(rec, st) !== action) continue;
        await scope.tx.update(recommendations).set({ content: [...new Set([...(r.content ?? []), ...ids])], updatedAt: sql`now()`, updatedBy: actor.userId }).where(eq(recommendations.id, r.id));
        others++;
      }
    }
  }
  await logItem(scope, item, actor, { decision: ids.length ? 'Content added to the message' : 'Content removed from the message',
    note: others ? `${ids.length} piece(s), also added to ${others} other message(s) with the same action in ${R.segOf(item.rec, item.state)}` : `${ids.length} piece(s)` });
  return { content: ids, messages: 1 + others };
}
