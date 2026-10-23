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
