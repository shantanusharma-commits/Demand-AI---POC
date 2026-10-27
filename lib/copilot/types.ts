// Copilot's answers as data (G-013): the server builds them, the browser renders them as React elements, so nothing a
// file, a person or a model wrote is ever run as markup. Shared by the server and the panel.

export const COPILOT_SCREENS = ['today', 'review', 'nba', 'prospecting', 'scoring'] as const;
export type CopilotScreen = (typeof COPILOT_SCREENS)[number];

/** What the question is about: the screen, and the record open on it (a recommendation, a build, a list, a run, a
 *  prospect in a run). */
export type CopilotRef = { itemId?: string; nbaRunId?: string; listId?: string; runId?: string; contactId?: string };

/** `text` may hold **bold** spans; nothing else is interpreted. */
export type CopilotBlock =
  | { t: 'p'; text: string }
  | { t: 'list'; items: string[]; ordered?: boolean }
  | { t: 'items'; rows: { id: string; label: string; sub: string; href: string }[]; more: number }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'checks'; checks: { name: string; ok: boolean }[] }
  | { t: 'note'; text: string }
  | { t: 'link'; label: string; href: string }
  | { t: 'plan'; plan: AutopilotPlan };

export type AutopilotPlan = {
  instruction: string; kind: 'spot' | 'exception';
  /** What Autopilot would do, re-checked again before it acts. */
  will: { id: string; label: string }[];
  left: { id: string; label: string; why: string }[];
};

export type CopilotAnswer = {
  blocks: CopilotBlock[];
  /** rules: an exact answer from the data; ai: the model's, from the data shown; none: nothing could answer. */
  source: 'rules' | 'ai' | 'none';
  /** When the data sent to the model was cut to a row budget: "Answered from 60 of 312 items in your queue." */
  partial?: string;
  /** Why the model didn't answer, when it was asked and couldn't (shown in plain words). */
  fallback?: string;
  suggestions: string[];
  /** The saved chat the question and its answer went into. */
  chatId?: string;
};

export type CopilotTurn = { role: 'you' | 'copilot'; text: string };

/** A prospect (Scoring) or recommendation (NBA) picked on the screen while the chat is about the run or build: the
 *  questions are about them until the person picks someone else or clears it. */
export type CopilotFocus = { ref: Pick<CopilotRef, 'contactId' | 'itemId'>; label: string };

/** A saved chat (G-013, the legacy panel's saved chats): private to the person who had it. */
export type CopilotChatSummary = { id: string; screen: CopilotScreen; refKey: string; title: string; first: string; questions: number; updatedAt: string };
/** `focus`: the prospect (contact) or item picked when the question was asked, and how the panel showed it. */
export type CopilotMessage = { role: 'you'; text: string; focus: { id: string; label: string } | null } | { role: 'copilot'; answer: CopilotAnswer };
export type CopilotChat = CopilotChatSummary & { messages: CopilotMessage[] };

/** The record a chat is about, as one key: the conversation carries on while the same record is open. A prospect or
 *  item picked on the way (the focus) is not part of it. */
export function chatKey(screen: CopilotScreen, ref: CopilotRef): string {
  return ref.listId ? `list:${ref.listId}` : ref.runId ? `run:${ref.runId}` : ref.nbaRunId ? `nba:${ref.nbaRunId}` : ref.itemId ? `item:${ref.itemId}` : `queue:${screen}`;
}

/** An answer as plain text: the earlier turn sent with the next question. */
export function plainOf(a: Pick<CopilotAnswer, 'blocks'>): string {
  return a.blocks.map(b => b.t === 'p' || b.t === 'note' ? b.text : b.t === 'list' ? b.items.join('; ') : b.t === 'items' ? b.rows.map(r => r.label).join('; ')
    : b.t === 'table' ? b.rows.map(r => r.join(' · ')).join('; ') : b.t === 'checks' ? b.checks.map(c => `${c.ok ? '✓' : '✗'} ${c.name}`).join(', ') : '').filter(Boolean).join('\n').replace(/\*\*/g, '').slice(0, 600);
}

/** The panel's opening suggestions per context. */
export const CHIPS: Record<string, string[]> = {
  queue: ['What should I do first?', "What's due today?", 'Group my queue by the most common reason', 'Show the runner-ups', 'How often do reps agree with the system?'],
  queueManager: ['What should I do first?', 'Show the approvals', 'Group my queue by the most common reason', 'How often do reps agree with the system?', 'Approve all spot-checks that passed every check'],
  item: ['Why is it here?', 'How does the runner-up differ?', 'How did similar items go?', 'What do we know about this account?', 'How do I fix it?', 'Why is the confidence what it is?'],
  nba: ['Summarise my micro-segments', 'Group what is waiting by reason', 'Show the runner-ups', 'How often do reps agree with the system?'],
  prospecting: ["What's wrong with this file?", "Who can't be reached?", 'Which accounts were excluded, and why?', 'How do I get a cleaner file next time?'],
  scoring: ['How many prospects are in each tier?', 'Who are the top prospects?', 'Which signal rows were not used, and why?', 'Which signals count most?'],
  prospect: ['Why is this score what it is?', 'What would move it up a tier?', 'Which signals were used?', 'Why now?'],
};
