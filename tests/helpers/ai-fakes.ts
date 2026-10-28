// Fake model answers per capability: they read the request the way a model would (the items between the
// delimiters) and answer in the capability's format, so tests exercise the real prompts and checks.
import type { ModelRequest } from '../../lib/ai/types.ts';
import { json, type StepFn } from './fake-model.ts';

export type ClassifyItem = { ref: number; industry: string; siteProcess: string };

/** The items of a classification request, as sent. */
export function classifyItems(req: ModelRequest): ClassifyItem[] {
  const block = req.messages.at(-1)!.content.match(/<items>\n([\s\S]*?)\n<\/items>/)?.[1] ?? '';
  const first = req.messages.find(m => m.role === 'user')!.content.match(/<items>\n([\s\S]*?)\n<\/items>/)?.[1] ?? block;
  return first.split('\n').map(l => l.match(/^(\d+)\. industry: (".*?"); site process: (".*")$/)).filter((m): m is RegExpMatchArray => !!m)
    .map(m => ({ ref: Number(m[1]), industry: JSON.parse(m[2]), siteProcess: JSON.parse(m[3]) }));
}

/** A classifier that answers every item with `pick`. */
export function classifier(pick: (it: ClassifyItem) => { vertical: string; confidence?: string; reason?: string }): StepFn {
  return req => json({ items: classifyItems(req).map(it => { const p = pick(it); return { ref: it.ref, vertical: p.vertical, confidence: p.confidence ?? 'high', reason: p.reason ?? `From "${it.industry}".` }; }) });
}

/** A plausible model: firms that serve the industry are Other, plain refining is Refining, everything else is out. */
export const sensibleClassifier: StepFn = classifier(it => {
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
export function whyNowWriter(line?: (it: WhyNowItem) => { line: string; rows?: number[] } | null): StepFn {
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
export function draftWriter(over?: (ask: ReturnType<typeof draftAsk>, n: number) => Record<string, unknown> | null): StepFn {
  return (req, n) => {
    const a = draftAsk(req);
    const own = over?.(a, n);
    if (own) return json(own);
    return json(a.channel === 'LinkedIn' ? { note: 'thanks for the interest in this topic; it would be good to compare notes on how sites approach it.' }
      : { subject: 'about your question', opening: 'Thanks for getting in touch about this.', bridge: 'A short conversation is usually the quickest way to work out what fits your site.',
        ask: 'Would a short call next week help?', claimId: a.claimIds[0] });
  };
}

/** What a piece request (content.piece v2) asks for: its word target, the topic, and the approved claim IDs offered. */
export function pieceAsk(req: ModelRequest): { min: number; max: number; topic: string; claimIds: string[] } {
  const body = req.messages[0].content, m = body.match(/: (\d+) to (\d+) words in all/);
  return { min: Number(m?.[1] ?? 300), max: Number(m?.[2] ?? 500), topic: body.match(/^Topic: "(.*)"$/m)?.[1] ?? '',
    claimIds: [...body.slice(body.indexOf('<claims>')).matchAll(/^([A-Z]+-\d+) \(/gm)].map(x => x[1]) };
}
// A paragraph of plain words that passes every brand and claim check (38 words, no numbers, no claim words).
const PARA = 'Start with the people who will do the work and agree what matters most to them. Write the answer down, then share it with everyone it affects. A short plan agreed early keeps the decision in your hands.';
const HEADINGS = ['Where to begin', 'Who to involve', 'What to settle first', 'Where plans slip', 'How to keep it moving', 'What good looks like', 'Questions for your team',
  'Keeping people informed', 'Choosing the moment', 'Checking progress', 'Learning as you go', 'Making it stick'];
/** A piece writer: a plan of plain paragraphs that reaches the word target and cites the first approved claim offered;
 *  `over` replaces any part of it. */
export function pieceWriter(over: Record<string, unknown> = {}): StepFn {
  return req => {
    const a = pieceAsk(req), n = Math.ceil((a.min + a.max) / 2 / 38), count = Math.min(12, Math.max(2, Math.ceil((n - 2) / 5))), per = Math.min(6, Math.max(1, Math.ceil((n - 2) / count)));
    return json({ title: 'Planning the change before the date is set for you', intro: [PARA],
      sections: HEADINGS.slice(0, count).map((heading, i) => ({ heading, paragraphs: Array(per).fill(PARA), list: i === 0 ? ['Who owns the decision?', 'What has to keep working?', 'When is the next window?'] : [], numbered: false })),
      claims: a.claimIds.slice(0, 1), close: { heading: 'Where to start', text: 'A short conversation is a good place to start, with the people it affects.' }, ...over });
  };
}
/** A request reader (content.brief): the topic from "on …" or "about …" and the reader from "for …", or `over`. */
export function briefReader(over: Record<string, unknown> = {}): StepFn {
  return req => {
    const r = req.messages[0].content.match(/<request>\n"(.*)"\n<\/request>/s)?.[1] ?? '';
    const topic = r.match(/\b(?:on|about)\s+(.+?)(?:\s+for\s+|$)/i)?.[1] ?? '', audience = r.match(/\bfor\s+(.+)$/i)?.[1] ?? '';
    return json({ topic, audience, tone: null, length: null, ...over });
  };
}
/** The part IDs a rewrite request offers. */
export const rewriteIds = (req: ModelRequest) => [...req.messages[0].content.matchAll(/^\[([\w-]+)\] \(/gm)].map(m => m[1]);
/** A rewrite's parts as content.rewrite v2 and v3 answer: every offered part, null where it stays as it is. */
export const rewriteParts = (req: ModelRequest, changes: Record<string, string | string[]>) => Object.fromEntries(rewriteIds(req).map(id => [id, changes[id] ?? null]));
