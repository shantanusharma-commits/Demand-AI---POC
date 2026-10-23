// The "AI-assisted" label every AI-made item carries, with its confidence (remediation prompt §7.8). The title says
// what the label means and how a person overrides it.
const WORDS: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low', High: 'High', Medium: 'Medium', Low: 'Low' };

export function AiTag({ confidence, title }: { confidence?: string | null; title?: string }) {
  const c = confidence ? WORDS[confidence] ?? confidence : '';
  return <span className="tag tag-violet" title={title ?? 'Made with AI from the data shown; checked by the same rules as everything else.'}>{c ? `AI-assisted · ${c}` : 'AI-assisted'}</span>;
}

/** A fallback reason in plain words, for "the rest use the rules because …". */
export function fallbackWords(reason: string): string {
  if (['busy', 'timeout', 'rate_limited'].includes(reason)) return 'the AI service was busy or slow';
  if (reason === 'circuit_open') return 'the AI service kept failing, so the rules took over for a while';
  if (reason === 'grounding') return 'the line named something its signal rows do not say';
  if (reason === 'checks_failed') return 'the draft failed the brand or claim checks';
  if (reason === 'content_filter') return 'the content policy filtered it';
  if (reason === 'schema' || reason === 'invalid_json' || reason === 'unusable') return 'the answer could not be used';
  return 'the AI service failed';
}

/** "X of Y …; the rest …" for a job's AI step. */
export function aiShare(what: string, s: { asked: number; worded?: number; answered?: number; fallbacks: Record<string, number> }): string {
  const done = s.worded ?? s.answered ?? 0, rest = s.asked - done;
  const why = Object.entries(s.fallbacks).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([r]) => fallbackWords(r));
  return `${what}: ${done} of ${s.asked} by AI.${rest > 0 ? ` The other ${rest} use the rules${why.length ? ` (${[...new Set(why)].join('; ')})` : ''}.` : ''}`;
}
