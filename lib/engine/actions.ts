// The action library an Admin edits in Setup (product owner, 30 Oct 2026; was the read-only CONFIG.segmentLibrary):
// what the team typically does. Each action has a name, what it means and when to use it, the signals or situations it
// suits, an optional micro-segment, and whether it is active or retired. It guides the AI's next best action (an action
// outside it is allowed but goes to For Review), and the rules' fallback takes the active actions linked to a segment,
// in order, as before. Kept in the configuration version's body (`actions`); absent means the starting library.
import { z } from 'zod';
import { CONFIG } from '../demandai-engine.ts';

export type LibraryAction = { id: string; name: string; about: string; suits: string[]; segment: string; status: 'active' | 'retired' };

// What each starting action means and when to use it (the process flows' proposed library).
const ABOUT: Record<string, string> = {
  'Call to follow up on the inquiry': 'A short call with a specialist while their question is live. Use when someone asked for information, a quote or a call.',
  'Route the inquiry to the sales owner': 'Hand the question to the account owner, who answers for their site. Use when the owner already knows the account well.',
  'Propose a migration-path discussion': 'Compare the options for moving off an ageing system, planned around a shutdown. Use when a system nears end of support.',
  'Offer a site assessment': 'Two days on site that end with a prioritised upgrade list. Use when they need to see what to replace first.',
  'Offer a lifecycle service review': 'Map what needs attention before support ends. Use for an installed base that is ageing but not yet urgent.',
  'Offer a renewal review': 'Check the cover still fits how the site runs, before they renew. Use when a service contract is coming up for renewal.',
  'Route to the service owner': 'Hand the renewal to the service owner. Use when the contract is routine and the service team owns it.',
  'Share a comparable case study and offer a technical session': 'Show how a similar site decided, then offer a technical session. Use while a capital project is still at design stage.',
  'Offer a reference-site visit': 'Let them see a similar site running. Use when a project team needs proof before deciding.',
  'Offer an early design workshop': 'Shape the control scope while the design is open. Use at front-end engineering design.',
  'Introduce Client to the new leader': 'A short introduction of what their team already runs with us. Use when a new person takes a buying role.',
  'Share a peer case study from their sector': 'Something useful from a peer for their first months. Use with a new leader who is setting priorities.',
  'Invite to a short briefing': 'A short briefing on what changed and what it means for their site. Use with a new leader once they have settled in.',
  'Follow up on the topic they engaged with': 'Go one level deeper on the topic they read or watched. Use after a webinar, a download or a click.',
  'Invite to a related session': 'Invite them to a session on the same topic. Use when they engaged but are not ready to talk.',
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'action';

export function defaultActions(): LibraryAction[] {
  const suits = (seg: string) => Object.entries(CONFIG.signalTypes).filter(([, c]) => c.segment === seg).map(([n]) => n);
  return Object.entries(CONFIG.segmentLibrary).flatMap(([segment, list]) => list.map(name => ({
    id: slug(name), name, about: ABOUT[name] ?? '', suits: suits(segment), segment, status: 'active' as const,
  })));
}
export const DEFAULT_ACTIONS: LibraryAction[] = defaultActions();

const Action = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/), name: z.string().trim().min(3, 'Name the action.').max(120),
  about: z.string().trim().min(10, 'Say what it means and when to use it, so the AI can choose it.').max(600),
  suits: z.array(z.string().trim().min(1).max(120)).max(30), segment: z.string().trim().max(80), status: z.enum(['active', 'retired']),
});
export const ActionsInput = z.array(Action).max(200).superRefine((a, ctx) => {
  const names = a.map(x => x.name.toLowerCase()), ids = a.map(x => x.id);
  if (new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', message: 'Two actions have the same name.' });
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Two actions have the same ID.' });
  if (!a.some(x => x.status === 'active')) ctx.addIssue({ code: 'custom', message: 'Keep at least one action active.' });
});

/** The library in a configuration body; the starting library when it has none. Throws when it can't be used. */
export function actionsOf(body: unknown): LibraryAction[] {
  const raw = body && typeof body === 'object' ? (body as { actions?: unknown }).actions : undefined;
  if (raw === undefined || raw === null) return DEFAULT_ACTIONS;
  const r = ActionsInput.safeParse(raw);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? 'the action library is not valid');
  return r.data;
}

/** An ID for a new action that no other action uses. */
export function newActionId(actions: LibraryAction[], name: string): string {
  const base = slug(name);
  let id = base, n = 2;
  while (actions.some(a => a.id === id)) id = `${base}-${n++}`;
  return id;
}

/** The active actions per micro-segment, in order: what the rules' fallback recommends from (first, then runner-up). */
export function libraryBySegment(actions: LibraryAction[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const a of actions) if (a.status === 'active' && a.segment) (out[a.segment] ??= []).push(a.name);
  return out;
}

/** Whether an action is in the library (active), by name, whatever the capitals. */
export const inLibrary = (actions: LibraryAction[], name: string) => actions.some(a => a.status === 'active' && a.name.toLowerCase() === name.trim().toLowerCase());

/** What changed in the library, in words. */
export function actionChanges(a: LibraryAction[], b: LibraryAction[]): string[] {
  const out: string[] = [];
  for (const x of b) {
    const y = a.find(z => z.id === x.id);
    if (!y) { out.push(`Action added: ${x.name}${x.segment ? ` (${x.segment})` : ''}`); continue; }
    if (y.name !== x.name) out.push(`Action renamed: ${y.name} → ${x.name}`);
    if (y.status !== x.status) out.push(`${x.name}: ${x.status === 'retired' ? 'retired' : 'active again'}`);
    if (y.about !== x.about) out.push(`${x.name}: what it means edited`);
    if (y.segment !== x.segment) out.push(`${x.name}: micro-segment ${y.segment || 'none'} → ${x.segment || 'none'}`);
    if (JSON.stringify(y.suits) !== JSON.stringify(x.suits)) out.push(`${x.name}: suits ${x.suits.join(', ') || 'nothing named'}`);
  }
  for (const y of a) if (!b.some(z => z.id === y.id)) out.push(`Action removed: ${y.name}`);
  return out;
}
