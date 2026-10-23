// Fake model answers per capability: they read the request the way a model would (the items between the
// delimiters) and answer in the capability's format, so tests exercise the real prompts and checks.
import type { ModelRequest } from '../../lib/ai/types.ts';
import { json, type Step } from './fake-model.ts';

export type ClassifyItem = { ref: number; industry: string; siteProcess: string };

/** The items of a classification request, as sent. */
export function classifyItems(req: ModelRequest): ClassifyItem[] {
  const block = req.messages.at(-1)!.content.match(/<items>\n([\s\S]*?)\n<\/items>/)?.[1] ?? '';
  const first = req.messages.find(m => m.role === 'user')!.content.match(/<items>\n([\s\S]*?)\n<\/items>/)?.[1] ?? block;
  return first.split('\n').map(l => l.match(/^(\d+)\. industry: (".*?"); site process: (".*")$/)).filter((m): m is RegExpMatchArray => !!m)
    .map(m => ({ ref: Number(m[1]), industry: JSON.parse(m[2]), siteProcess: JSON.parse(m[3]) }));
}

/** A classifier that answers every item with `pick`. */
export function classifier(pick: (it: ClassifyItem) => { vertical: string; confidence?: string; reason?: string }): Step {
  return req => json({ items: classifyItems(req).map(it => { const p = pick(it); return { ref: it.ref, vertical: p.vertical, confidence: p.confidence ?? 'high', reason: p.reason ?? `From "${it.industry}".` }; }) });
}

/** A plausible model: firms that serve the industry are Other, plain refining is Refining, everything else is out. */
export const sensibleClassifier = classifier(it => {
  const t = `${it.industry} ${it.siteProcess}`.toLowerCase();
  if (/engineer|construct|integrat|epc|automation|instrument|electrical|controls/.test(t)) return { vertical: 'Other', reason: 'Serves the industry rather than running a plant.' };
  if (/crude|refiner/.test(t)) return { vertical: 'Refining', confidence: 'medium' };
  return { vertical: 'Out of ICP', reason: 'Not one of the pilot verticals.' };
});

export type WhyNowItem = { ref: number; role: string; rows: { row: number; type: string; date: string; detail: string }[] };

/** The prospects of a why-now request, as sent. */
export function whyNowItems(req: ModelRequest): WhyNowItem[] {
  const block = req.messages.find(m => m.role === 'user')!.content.match(/<prospects>\n([\s\S]*?)\n<\/prospects>/)?.[1] ?? '';
  const out: WhyNowItem[] = [];
  for (const line of block.split('\n')) {
    const head = line.match(/^(\d+)\. role: (".*?") \(/);
    if (head) { out.push({ ref: Number(head[1]), role: JSON.parse(head[2]), rows: [] }); continue; }
    const r = line.match(/^ {3}row (\d+) · (".*?") · (".*?") · (".*?") · source/);
    if (r && out.length) out.at(-1)!.rows.push({ row: Number(r[1]), type: JSON.parse(r[2]), date: JSON.parse(r[3]), detail: JSON.parse(r[4]) });
  }
  return out;
}

/** A writer that words each line from its strongest row, or with `line` when given. */
export function whyNowWriter(line?: (it: WhyNowItem) => { line: string; rows?: number[] } | null): Step {
  return req => json({ items: whyNowItems(req).map(it => {
    const own = line?.(it);
    const top = it.rows[0];
    return own ? { ref: it.ref, line: own.line, rows: own.rows ?? [top.row] }
      : { ref: it.ref, line: `${top.detail === '(no detail)' ? top.type : top.detail} on ${top.date}.`, rows: [top.row] };
  }) });
}

/** What a drafting request offered: its channel and the claim IDs it may pick. */
export function draftAsk(req: ModelRequest): { channel: string; claimIds: string[]; signal: string } {
  const u = req.messages.find(m => m.role === 'user')!.content;
  return { channel: u.match(/^Channel: (\w+)/m)?.[1] ?? '', claimIds: [...u.matchAll(/^- ([A-Z]{2}-\d{2}): /gm)].map(m => m[1]), signal: u.match(/^Signal: (".*")$/m)?.[1] ?? '' };
}

/** A drafter that writes plain, grounded copy and picks the first approved claim, or answers with `over`. */
export function draftWriter(over?: (ask: ReturnType<typeof draftAsk>, n: number) => Record<string, unknown> | null): Step {
  return (req, n) => {
    const a = draftAsk(req);
    const own = over?.(a, n);
    if (own) return json(own);
    return json(a.channel === 'LinkedIn' ? { note: 'thanks for the interest in this topic; it would be good to compare notes on how sites approach it.' }
      : { subject: 'about your question', opening: 'Thanks for getting in touch about this.', bridge: 'A short conversation is usually the quickest way to work out what fits your site.',
        ask: 'Would a short call next week help?', claimId: a.claimIds[0] });
  };
}

/** The parts a piece request asks for, from its format line. */
export function pieceRoles(req: ModelRequest): { role: string; list: boolean }[] {
  const fmt = req.system.slice(req.system.lastIndexOf('Format:'));
  return [...fmt.matchAll(/"(\w+)": (\[|")/g)].filter(m => m[1] !== 'parts').map(m => ({ role: m[1], list: m[2] === '[' }));
}
/** A piece writer: plain wording for every part, or `over` for some. */
export function pieceWriter(over: Record<string, string | string[]> = {}): Step {
  return req => json({ parts: Object.fromEntries(pieceRoles(req).map(({ role, list }) => [role, over[role] ?? (list
    ? ['What does the site need to keep running?', 'Who owns the decision?', 'When is the next window?']
    : role === 'title' ? 'Planning the change before the date is set for you' : `A plain paragraph for the ${role} part, with no claims in it.`)])) });
}
/** The part IDs a rewrite request offers. */
export const rewriteIds = (req: ModelRequest) => [...req.messages[0].content.matchAll(/^\[([\w-]+)\] \(/gm)].map(m => m[1]);
