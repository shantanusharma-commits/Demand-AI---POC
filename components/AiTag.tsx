// The "AI-assisted" label every AI-made item carries, with its confidence (remediation prompt §7.8). The title says
// what the label means and how a person overrides it.
const WORDS: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low', High: 'High', Medium: 'Medium', Low: 'Low' };

export function AiTag({ confidence, title }: { confidence?: string | null; title?: string }) {
  const c = confidence ? WORDS[confidence] ?? confidence : '';
  return <span className="tag tag-violet" title={title ?? 'Made with AI from the data shown; checked by the same rules as everything else.'}>{c ? `AI-assisted · ${c}` : 'AI-assisted'}</span>;
}
