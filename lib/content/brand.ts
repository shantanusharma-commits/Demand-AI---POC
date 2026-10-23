// The brand pack in the Content library (G-009; legacy 07-content.html): what a new version changes, in words; a
// claim's status as the library shows it; rules read from a plain-text guideline. Shared by the screen and the server
// (the server records the changes with each version).
import { CONFIG } from '../demandai-engine.ts';
import { FRAMEWORK_ACTIONS, FRAMEWORKS, type BrandPack, type Claim } from '../engine/nba.ts';

export type BrandDiff = { section: string; lines: string[] };
export type ClaimStatus = 'Approved' | 'Expired' | 'Draft' | 'Retired';

/** Expired wins: a claim past its date is not used, whatever its status says. `today` is YYYY-MM-DD. */
export function claimStatus(c: Pick<Claim, 'status' | 'expiry'>, today: string): ClaimStatus {
  return c.expiry < today ? 'Expired' : c.status === 'approved' ? 'Approved' : c.status === 'retired' ? 'Retired' : 'Draft';
}

/** The next claim ID: CL- and one more than the highest number used (never below CL-07, after the starting six). */
export function nextClaimId(claims: Pick<Claim, 'id'>[]): string {
  const n = Math.max(6, ...claims.map(c => +String(c.id).replace(/\D/g, '') || 0)) + 1;
  return 'CL-' + String(n).padStart(2, '0');
}

export const CLAIM_TYPES = ['Case study', 'One-pager', 'Brochure', 'Webinar recording', 'Peer story', 'Datasheet'];
const SEGS = Object.keys(CONFIG.segmentLibrary);
const CLAIM_TOPICS: [string, RegExp][] = [['Modernisation', /migrat|legacy|moderni[sz]|end of support|upgrade|assessment|platform/i], ['Service renewal', /renew|service|support|lifecycle|contract/i],
  ['Project', /project|expansion|design|schedule/i], ['Leadership', /priorit|first 100|new (plant )?(leader|manager)|role/i], ['Inquiry', /inquir|question|quote/i], ['Engagement', /webinar|recording|session|guide/i]];
/** Where a claim can be used is read from its words; a claim that names no topic can be used anywhere. */
export function claimFits(text: string): string[] {
  const m = CLAIM_TOPICS.filter(([, re]) => re.test(text)).map(([k]) => k);
  return m.length ? m : SEGS.slice();
}

/** What differs between the live pack and the draft, section by section, in words (legacy diffSummary). */
export function diffSummary(live: BrandPack, d: BrandPack): BrandDiff[] {
  const out: BrandDiff[] = [];
  const list = (a: string[] = [], b: string[] = [], what: string) => {
    const A = new Set(a.map(x => String(x).toLowerCase())), B = new Set(b.map(x => String(x).toLowerCase()));
    const add = b.filter(x => !A.has(String(x).toLowerCase())), rem = a.filter(x => !B.has(String(x).toLowerCase())), l: string[] = [];
    if (add.length) l.push(`Added ${what}: ${add.join(', ')}`);
    if (rem.length) l.push(`Removed ${what}: ${rem.join(', ')}`);
    return l;
  };
  const g: string[] = [];
  const lg = live.guideline as { documentId?: string; name?: string } | null, dg = d.guideline as { documentId?: string; name?: string } | null;
  if ((lg?.documentId ?? lg?.name ?? null) !== (dg?.documentId ?? dg?.name ?? null)) g.push(dg ? `New document: ${dg.name}` : 'Document removed');
  if (live.voice.notes !== d.voice.notes) g.push('Key rules edited');
  if (g.length) out.push({ section: 'Brand guidelines', lines: g });
  const v: string[] = [], lv = live.voice, dv = d.voice;
  if (lv.preset !== dv.preset) v.push(`Voice: ${lv.preset} → ${dv.preset}`);
  if (lv.signoff !== dv.signoff) v.push(`Sign-off: “${lv.signoff}” → “${dv.signoff}”`);
  if (lv.maxWords !== dv.maxWords) v.push(`Email length: ${lv.maxWords} → ${dv.maxWords} words`);
  if (lv.maxSentenceWords !== dv.maxSentenceWords) v.push(`Sentence length: ${lv.maxSentenceWords} → ${dv.maxSentenceWords} words`);
  if (!!lv.noExclamation !== !!dv.noExclamation) v.push(dv.noExclamation ? 'No exclamation marks' : 'Exclamation marks allowed');
  v.push(...list(lv.bannedOpeners, dv.bannedOpeners, 'openers to avoid'));
  if (v.length) out.push({ section: 'Voice and tone', lines: v });
  const n = [...list(live.negative, d.negative, 'keywords'), ...list(live.competitors, d.competitors, 'competitors')];
  if (n.length) out.push({ section: 'Negative keywords', lines: n });
  const lc = live.claims, dc = d.claims, c: string[] = [];
  dc.filter(x => !lc.some(y => y.id === x.id)).forEach(x => c.push(`Added ${x.id}: ${x.title}`));
  lc.filter(x => !dc.some(y => y.id === x.id)).forEach(x => c.push(`Removed ${x.id}`));
  dc.forEach(x => {
    const y = lc.find(z => z.id === x.id);
    if (!y) return;
    if (y.status !== x.status) c.push(`${x.id}: ${y.status} → ${x.status}`);
    if (y.expiry !== x.expiry) c.push(`${x.id}: expires ${x.expiry} (was ${y.expiry})`);
  });
  if (c.length) out.push({ section: 'Approved claims', lines: c });
  const lf = live.frameworks || FRAMEWORKS, df = d.frameworks || lf, f: string[] = [];
  df.filter(x => !lf.some(y => y.objective === x.objective)).forEach(x => f.push(`Added “${x.objective}”`));
  lf.filter(x => !df.some(y => y.objective === x.objective)).forEach(x => f.push(`Removed “${x.objective}”`));
  df.forEach(x => {
    const y = lf.find(z => z.objective === x.objective);
    // Field by field: the same framework can arrive with its keys in another order.
    const sameSet = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every(k => b.includes(k));
    if (!y || (y.name === x.name && JSON.stringify(y.steps) === JSON.stringify(x.steps) && y.use === x.use && sameSet(y.actions, x.actions))) return;
    const ya = y.actions || [], xa = x.actions || [], what: string[] = [];
    xa.filter(k => !ya.includes(k)).forEach(k => what.push(`added ${FRAMEWORK_ACTIONS[k]?.label || k}`));
    ya.filter(k => !xa.includes(k)).forEach(k => what.push(`removed ${FRAMEWORK_ACTIONS[k]?.label || k}`));
    if (y.name !== x.name) what.push(`framework “${x.name}”`);
    if (JSON.stringify(y.steps) !== JSON.stringify(x.steps)) what.push('structure edited');
    if (y.use !== x.use) what.push(`used ${x.use.toLowerCase()}`);
    f.push(`“${x.objective}”: ${what.join(', ') || 'edited'}`);
  });
  if (f.length) out.push({ section: 'Messaging frameworks', lines: f });
  return out;
}

export type RuleSuggestion = { kind: 'Competitor' | 'Negative keyword' | 'Sign-off' | 'Email length' | 'Sentence length' | 'Voice' | 'Banned opener' | 'Rule'; value: string };

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

/** Applies one suggestion to a draft pack (legacy addSuggestion); returns the changed pack. */
export function applySuggestion(d: BrandPack, x: RuleSuggestion): BrandPack {
  const p: BrandPack = JSON.parse(JSON.stringify(d));
  if (x.kind === 'Negative keyword' && !p.negative.some(w => w.toLowerCase() === x.value.toLowerCase())) p.negative.push(x.value.toLowerCase());
  if (x.kind === 'Competitor' && !p.competitors.includes(x.value)) p.competitors.push(x.value);
  if (x.kind === 'Sign-off') p.voice.signoff = x.value;
  if (x.kind === 'Voice') p.voice.preset = x.value;
  if (x.kind === 'Banned opener' && !p.voice.bannedOpeners.includes(x.value)) p.voice.bannedOpeners.push(x.value);
  if (x.kind === 'Rule') p.voice.noExclamation = true;
  if (x.kind === 'Email length') p.voice.maxWords = +x.value;
  if (x.kind === 'Sentence length') p.voice.maxSentenceWords = +x.value;
  return p;
}
