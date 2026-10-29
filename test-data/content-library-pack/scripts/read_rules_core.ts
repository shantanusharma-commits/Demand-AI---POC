

/** Plain statements of the rules in a text guideline (legacy readRules). Anything else stays in the document. */
export function readRules(text: string): RuleSuggestion[] {
  const out: RuleSuggestion[] = [];
  const split = (v: string) => v.split(/[,;|]| or | and /).map(x => x.replace(/["“”'‘’.]/g, '').replace(/^(?:the )?(?:words?|phrases?|terms?)\s+/i, '').trim()).filter(x => x && x.length < 40);
  const clean = (v: string) => v.replace(/["“”'‘’]/g, '').replace(/[.\s]+$/, '').trim();
  for (const line of text.split(/\r?\n/)) {
    const l = line.replace(/^[\s*\-•#\d.)]+/, '').trim();
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^competitors?\s*(?:are|include)?\s*[:-]?\s*(.+)$/i)) || (m = l.match(/^(?:do not|don't|never)\s+(?:mention|name|reference)\s+(?:competitors?\s*(?:such as|like|:)?\s*)?(.+)$/i))) split(m[1]).forEach(v => out.push({ kind: 'Competitor', value: v }));
    else if ((m = l.match(/^(?:avoid|never (?:say|use|write)|do not (?:say|use|write)|don't (?:say|use|write)|banned(?: words| phrases)?|negative keywords?)\s*[:-]?\s*(.+)$/i))) split(m[1]).forEach(v => out.push({ kind: 'Negative keyword', value: v }));
    else if ((m = l.match(/^(?:always\s+)?sign[\s-]?off(?:\s+(?:as|with))?\s*[:-]?\s*(.+)$/i))) out.push({ kind: 'Sign-off', value: clean(m[1]) });
    else if ((m = l.match(/(?:emails?|messages?|drafts?).*?(?:under|below|at most|no more than|max(?:imum)?(?: of)?)\s+(\d+)\s+words/i))) out.push({ kind: 'Email length', value: m[1] });
    else if ((m = l.match(/sentences?.*?(?:under|below|at most|no more than|max(?:imum)?(?: of)?|no longer than)\s+(\d+)\s+words/i))) out.push({ kind: 'Sentence length', value: m[1] });
    else if ((m = l.match(/^(?:tone|voice)\b\s*(?:should be|is|:|-)?\s*(.+)$/i)) || (m = l.match(/^(?:be|write|sound)\s+(formal|warm|friendly|direct|concise)\b(.*)$/i))) {
      const p = /formal/i.test(m[1]) ? 'Formal' : /warm|friendly/i.test(m[1]) ? 'Warm' : /direct|concise/i.test(m[1]) ? 'Direct' : null;
      if (p) out.push({ kind: 'Voice', value: p });
    } else if ((m = l.match(/^(?:never open with|don't open with|do not open with|avoid opening with)\s*[:-]?\s*(.+)$/i))) split(m[1]).forEach(v => out.push({ kind: 'Banned opener', value: v }));
    else if (/no exclamation|exclamation marks?.*(?:never|avoid|not)|(?:never|avoid|don't|do not) use exclamation/i.test(l)) out.push({ kind: 'Rule', value: 'No exclamation marks' });
  }
  const seen = new Set<string>();
  return out.filter(x => { const k = x.kind + '|' + x.value.toLowerCase(); return !seen.has(k) && !!seen.add(k); });
}
