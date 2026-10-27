// Copilot's saved chats (G-013, the legacy panel's saved chats): each question and its answer go into the person's
// chat about the record open on the screen, so the conversation is there when they come back, carries on where it
// stopped, and can be read again from the history. A chat is the person's own (row-level security and the filters
// here); they may delete it. A chat about a list, run, build or item goes with that record, and the end-of-pilot purge
// removes the rest by date.
import 'server-only';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { chatKey, plainOf, type CopilotAnswer, type CopilotChat, type CopilotChatSummary, type CopilotMessage, type CopilotRef, type CopilotScreen, type CopilotTurn } from '../../copilot/types.ts';
import { copilotChats, copilotMessages } from '../db/schema.ts';
import type { TenantScope } from '../db/tenant.ts';
import { notFound } from '../http/errors.ts';

/** How many chats the history shows per screen, newest first. */
export const HISTORY_MAX = 50;

/** The record a chat is about: what is open on the screen, without the prospect or item picked on the way. On For
 *  Review an item is its own page, so it is the record; on Micro-segments & NBA it is picked within the build. */
export function chatRef(screen: CopilotScreen, ref: CopilotRef): CopilotRef {
  const { listId, runId, nbaRunId, itemId } = ref;
  return Object.fromEntries(Object.entries({ listId, runId, nbaRunId, itemId: screen === 'nba' && nbaRunId ? undefined : itemId }).filter(([, v]) => v)) as CopilotRef;
}

const mine = (scope: TenantScope) => and(eq(copilotChats.businessUnitId, scope.ctx.businessUnitId), eq(copilotChats.createdBy, scope.ctx.userId));
const summaryColumns = {
  id: copilotChats.id, screen: copilotChats.screen, refKey: copilotChats.refKey, title: copilotChats.title, updatedAt: copilotChats.updatedAt,
  // Written out in full: inside the subquery a bare "id" would be the message's.
  first: sql<string>`coalesce((SELECT m.text FROM copilot_messages m WHERE m.chat_id = copilot_chats.id AND m.role = 'you' ORDER BY m.seq LIMIT 1), '')`,
  questions: sql<number>`(SELECT count(*)::int FROM copilot_messages m WHERE m.chat_id = copilot_chats.id AND m.role = 'you')`,
};
const toSummary = (r: { id: string; screen: string; refKey: string; title: string; updatedAt: Date; first: string; questions: number }): CopilotChatSummary =>
  ({ id: r.id, screen: r.screen as CopilotScreen, refKey: r.refKey, title: r.title, first: r.first, questions: Number(r.questions), updatedAt: r.updatedAt.toISOString() });

/** The person's chats on a screen, newest first; with `key`, only those about that record. */
export async function listChats(scope: TenantScope, screen: CopilotScreen, key?: string): Promise<CopilotChatSummary[]> {
  const rows = await scope.tx.select(summaryColumns).from(copilotChats)
    .where(and(mine(scope), eq(copilotChats.screen, screen), key ? eq(copilotChats.refKey, key) : undefined))
    .orderBy(desc(copilotChats.updatedAt)).limit(HISTORY_MAX);
  return rows.map(toSummary);
}

/** One of the person's chats with every message, in order. 404 for anyone else's. */
export async function getChat(scope: TenantScope, id: string): Promise<CopilotChat> {
  const [c] = await scope.tx.select(summaryColumns).from(copilotChats).where(and(mine(scope), eq(copilotChats.id, id)));
  if (!c) throw notFound('That chat is not there any more.');
  const msgs = await scope.tx.select({ role: copilotMessages.role, text: copilotMessages.text, answer: copilotMessages.answer, focus: copilotMessages.focus })
    .from(copilotMessages).where(and(eq(copilotMessages.chatId, id), eq(copilotMessages.createdBy, scope.ctx.userId))).orderBy(asc(copilotMessages.seq));
  const messages: CopilotMessage[] = msgs.map(m => m.role === 'you'
    ? { role: 'you', text: m.text, focus: (m.focus as { id: string; label: string } | null) ?? null }
    : { role: 'copilot', answer: m.answer as CopilotAnswer });
  return { ...toSummary(c), messages };
}

export async function deleteChat(scope: TenantScope, id: string): Promise<void> {
  const gone = await scope.tx.delete(copilotChats).where(and(mine(scope), eq(copilotChats.id, id))).returning({ id: copilotChats.id });
  if (!gone.length) throw notFound('That chat is not there any more.');
}

/** The last turns of a chat, oldest first: what the model is sent with the next question. Null when it isn't theirs. */
export async function chatTurns(scope: TenantScope, id: string, max: number): Promise<CopilotTurn[] | null> {
  const [c] = await scope.tx.select({ id: copilotChats.id }).from(copilotChats).where(and(mine(scope), eq(copilotChats.id, id)));
  if (!c) return null;
  const rows = await scope.tx.select({ role: copilotMessages.role, text: copilotMessages.text }).from(copilotMessages)
    .where(eq(copilotMessages.chatId, id)).orderBy(desc(copilotMessages.seq)).limit(max);
  return rows.reverse().map(r => ({ role: r.role as CopilotTurn['role'], text: r.text }));
}

export type Exchange = {
  chatId?: string; screen: CopilotScreen; ref: CopilotRef; title: string;
  question: string; focus: { id: string; label: string } | null; answer: CopilotAnswer;
};

/** A question and its answer, added to the person's chat (a new one when there is none yet, or it was deleted).
 *  Returns the chat's id. */
export async function saveExchange(scope: TenantScope, x: Exchange): Promise<string> {
  const bu = scope.ctx.businessUnitId, me = scope.ctx.userId;
  let id = x.chatId;
  if (id) {
    const [c] = await scope.tx.update(copilotChats).set({ updatedAt: sql`now()` }).where(and(mine(scope), eq(copilotChats.id, id))).returning({ id: copilotChats.id });
    id = c?.id;
  }
  if (!id) {
    const ref = chatRef(x.screen, x.ref);
    const [c] = await scope.tx.insert(copilotChats).values({
      businessUnitId: bu, screen: x.screen, refKey: chatKey(x.screen, ref), ref, title: x.title.trim().slice(0, 200) || 'Copilot',
      listId: ref.listId ?? null, runId: ref.runId ?? null, nbaRunId: ref.nbaRunId ?? null, itemId: ref.itemId ?? null, createdBy: me,
    }).returning({ id: copilotChats.id });
    id = c.id;
  }
  const { chatId: _c, ...answer } = x.answer;
  void _c;
  await scope.tx.insert(copilotMessages).values([
    { businessUnitId: bu, chatId: id, role: 'you', text: x.question, focus: x.focus, createdBy: me },
    { businessUnitId: bu, chatId: id, role: 'copilot', text: plainOf(answer), answer, createdBy: me },
  ]);
  return id;
}
