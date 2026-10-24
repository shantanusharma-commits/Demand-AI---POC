/* Content studio's writer (D-36; legacy demandai-content.js and 15-content-studio.html): blogs and whitepapers in the
   brand voice, built by rules from the brief and the unit's brand pack. One writer picks the layout for the content
   type and length; the outreach drafts' brand and claim checks run on every piece; a product claim only ever comes
   from an approved claim, word for word with its citation. Pure functions on a block model shared by the server and
   the screen. Changes from the original, each deliberate:
   - a piece is a list of blocks of plain text (headings, paragraphs, lists, quotes), never stored HTML: nothing a
     person types can run in another person's browser. Inline bold, italic and links are not ported;
   - every change a person asks for in the chat is worked out here, on the server, so the stored piece is the one
     source of truth. With AI on (lib/ai/studio.ts) the model words a new piece's parts and the requests these rules
     don't understand; the proof stays the approved claims, the checks stay these, and these rules are the fallback. */
import { approvedClaims, checkContent, PLAYBOOK, type BrandPack, type CheckResult, type Claim, type Play } from '../engine/nba.ts';

export const TYPES = {
  blog: { label: 'Blog', ic: '📝', skill: 'blog-post', about: 'A headline, short sections and one call to action' },
  whitepaper: { label: 'Whitepaper', ic: '📄', skill: 'whitepaper', about: 'Executive summary, the problem, a sequence, evidence and next steps' },
} as const;
export type ContentType = keyof typeof TYPES;
export const CONTENT_TYPES = Object.keys(TYPES) as ContentType[];
export const TONES = ['Direct', 'Formal', 'Warm'] as const;
export type Tone = (typeof TONES)[number];

const NOT = String.raw`\b(?:less|not(?: so| too)?)\s+`;
/** The tone a request asks for, with "less formal", "informal" or "not so warm" read the right way round; null for none.
 *  (The original page matched "formal" first, so "warmer and less formal" came out formal.) */
export function toneAsked(text: string): Tone | null {
  const t = text.toLowerCase();
  if (new RegExp(`${NOT}(?:formal|professional)|\\binformal|\\bcasual|\\brelaxed|\\bconversational`).test(t)) return 'Warm';
  if (new RegExp(`${NOT}(?:warm|friendl)`).test(t)) return 'Direct';
  if (/\b(?:formal|professional)/.test(t)) return 'Formal';
  if (/\b(?:warm|friendl)/.test(t)) return 'Warm';
  if (/\b(?:direct|crisp|punch)/.test(t)) return 'Direct';
  return null;
}
export const LENGTHS = ['Short', 'Medium', 'Long'] as const;
export type Length = (typeof LENGTHS)[number];
export const AUDIENCE: Record<string, string> = {
  Modernisation: 'Sites planning a control system migration', Inquiry: 'Accounts that asked us a question',
  'Service renewal': 'Customers with a renewal coming up', Project: 'Teams starting a new project',
  Leadership: 'Newly appointed plant leaders', Engagement: 'Accounts reading our content',
};
const PERSONA: Record<string, string> = { Modernisation: 'plant and automation managers', Inquiry: 'engineering teams', 'Service renewal': 'site maintenance leads',
  Project: 'project and design leads', Leadership: 'new plant leaders', Engagement: 'operations teams' };
// Words in a request that point at a micro-segment's audience.
const SEG_WORDS: [string, RegExp][] = [['Modernisation', /migrat|legacy|moderni[sz]|end of support|end-of-support|upgrade|obsolete/i],
  ['Service renewal', /renew|service contract|support contract|lifecycle|cover/i], ['Project', /project|expansion|greenfield|front-end design|new plant|design/i],
  ['Leadership', /new (plant )?(leader|manager|director)|first 100|appointed|priorit/i], ['Inquiry', /inquir|enquir|quote|asked/i],
  ['Engagement', /webinar|newsletter|engag|content/i]];
export const SUGGESTIONS: Record<ContentType, string[]> = {
  blog: ['A blog on planning a control system migration for plant managers', 'A short blog for customers with a service renewal coming up', 'A blog on settling control scope early in a new project'],
  whitepaper: ['A whitepaper on legacy control system modernisation for plant managers', 'A detailed whitepaper on lifecycle planning for site maintenance leads', 'A whitepaper on front-end design decisions for project leads'],
};

export type BlockTag = 'h1' | 'h2' | 'p' | 'ul' | 'ol' | 'blockquote';
export const BLOCK_TAGS: BlockTag[] = ['h1', 'h2', 'p', 'ul', 'ol', 'blockquote'];
/** One block of a piece. `role` names what the writer made it for (title, intro, h:why for its heading, free when a
 *  person wrote it), `v` which wording, `edited` whether a person changed it, `ai` whether the AI wrote it (Phase 6);
 *  a list's text is its items. */
export type Block = { id: string; tag: BlockTag; role: string; v: number; edited?: boolean; text: string | string[]; ai?: boolean };
/** What the writer needs to know about a piece. */
export type Piece = { type: ContentType; topic: string; seg: string; tone: Tone; length: Length; sources: string[]; title: string; blocks: Block[] };

const newId = () => globalThis.crypto.randomUUID().slice(0, 8);
const cap = (s: string) => { s = String(s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
const lc = (s: string) => { s = String(s || '').trim(); return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; };
const noDot = (s: string) => String(s || '').trim().replace(/[.?!]+$/, '');
export const cited = (c: Claim) => `${c.claim} [${c.type}, ${c.year}]`;
const plain = (b: Block) => (Array.isArray(b.text) ? b.text.join('\n') : b.text);

/* ─── The writer's instructions per type: sections by length, headings, and the words for each part ─── */
export const LAYOUT: Record<ContentType, Record<Length, string[]>> = {
  blog: { Short: ['title', 'intro', 'why', 'proof', 'cta'], Medium: ['title', 'intro', 'why', 'questions', 'proof', 'objection', 'cta'],
    Long: ['title', 'intro', 'why', 'steps', 'questions', 'proof', 'objection', 'pitfalls', 'cta'] },
  whitepaper: { Short: ['title', 'summary', 'challenge', 'steps', 'proof', 'cta'], Medium: ['title', 'summary', 'challenge', 'good', 'steps', 'proof', 'questions', 'cta'],
    Long: ['title', 'summary', 'challenge', 'good', 'steps', 'pitfalls', 'proof', 'questions', 'objection', 'cta'] },
};
export const HEAD: Record<string, string[]> = {
  why: ['Why it matters now', 'Why now, not later'], questions: ['Questions worth asking', 'Questions for your team'],
  proof: ['What comparable sites did', 'Evidence from comparable sites'], objection: ['A common concern', 'What we often hear'],
  cta: ['Next step', 'Where to start'], steps: ['A practical sequence', 'How to sequence the work'], pitfalls: ['Where plans slip', 'What to watch for'],
  summary: ['Executive summary', 'In brief'], challenge: ['The challenge', 'What makes it hard'], good: ['What good looks like', 'The outcome to aim for'],
};
const LIST_ROLES: Record<string, BlockTag> = { questions: 'ul', steps: 'ol' };
type Ctx = { title: string; topic: string; persona: string; fw: Play; claims: Claim[]; tone: Tone };
const GEN: Record<string, (c: Ctx, v: number) => string | string[]> = {
  title: (c, v) => [c.title, `${cap(c.topic)}: what to settle first`, `What comparable sites learned about ${lc(c.topic)}`][v % 3],
  intro: (c, v) => [
    `Most ${c.persona} we work with know the moment is coming. The question is whether they set the timing, or the timing is set for them. This post covers what to settle first, and what comparable sites did.`,
    `${cap(c.topic)} rarely starts as a project. It starts as a question someone on site asks, and it's easier to answer while there's still time to plan. Here is how we'd approach it.`,
    `If ${lc(c.topic)} is on your list this year, you're not alone. The sites that handled it well made a few decisions early. This post walks through them.`][v % 3],
  why: (_c, v) => [
    'Timing is the hidden cost. Decide early, and the decision stays in your hands: the work fits a window you choose, the people you need are booked, and nothing is rushed.',
    'Waiting rarely makes the decision easier. The options narrow as dates get closer, and the work ends up scheduled around constraints rather than around the plant.',
    'The earlier the question is asked, the more options there are. Planning early turns a forced change into a planned one.'][v % 3],
  questions: (c, v) => [c.fw.questions.slice(), c.fw.questions.concat(['Who else needs to be part of the decision?']),
    ['What has changed on site in the last two years?'].concat(c.fw.questions.slice(0, 2))][v % 3],
  proof: (c, v) => { const cl = c.claims.map(cited);
    return [cl.join(' '), 'One example says more than a list of features. ' + cl.join(' '), cl.slice().reverse().join(' ') + ' Your account team can share the full story.'][v % 3]; },
  objection: (c, v) => [`"${noDot(c.fw.objection)}." ${c.fw.response}`, `We often hear: "${noDot(c.fw.objection)}." ${c.fw.response}`,
    `It's fair to ask whether now is the time. ${c.fw.response}`][v % 3],
  cta: (_c, v) => [
    'If this is on your list, a short conversation is a good place to start. We can share how comparable sites sequenced the work, and what they would do differently.',
    'Start with one question: what would we need to know to plan this properly? If it helps, we can walk through it with your team.',
    'Talk to your account team about where to start. A short call is usually enough to see whether it is worth planning now.'][v % 3],
  steps: (_c, v) => [
    ['Agree the window you want to work in.', 'List what has to keep running, and what can stop.', 'Settle the scope with the people who will run it.', 'Plan the cutover, and the way back if something goes wrong.'],
    ['Write down the date you cannot move.', 'Work back from it to the decisions you need.', 'Name one owner for each decision.'],
    ['Start with what the site needs to keep doing.', 'Agree the scope before the design is fixed.', 'Book the people who know the current system.', 'Choose the window, then plan backwards.']][v % 3],
  pitfalls: (_c, v) => [
    'Plans slip in predictable places. The scope grows after the design is fixed, the people who know the old system are not in the room, or the window is agreed before the work is understood. Naming these early is most of the cure.',
    'Most delays trace back to one of three things: a scope that keeps moving, missing knowledge of the current system, or a window agreed too late.'][v % 2],
  summary: (c, v) => [
    `${cap(c.topic)} is a decision most ${c.persona} will face. This paper sets out what to decide first, a practical sequence, and what comparable sites did.`,
    `This paper is for ${c.persona} looking at ${lc(c.topic)}. It covers the decisions to make early and how comparable sites approached them.`][v % 2],
  challenge: (_c, v) => [
    "The difficulty is rarely technical. It's timing, scope and people: deciding before the date is forced, agreeing what is in and out, and keeping the people who know the site involved.",
    'Every site has a version of the same problem. The current setup still runs, the people who know it are busy, and the next window is closer than it looks.'][v % 2],
  good: (_c, v) => [
    'A good outcome looks ordinary. The work fits a window the site chose, the team knows the plan, and nothing surprises operations.',
    'The aim is a change that operations barely notice: planned, scoped with the people who run the plant, and finished inside the window.'][v % 2],
};
// Extra sentences when asked for more detail (no product claims).
const MORE = ['That is usually where the real decisions sit.', 'It helps to write the answer down and share it with the people who run the plant.',
  'Comparable sites found it easier once one person owned the plan.', 'None of this needs a decision today, only a date to decide by.'];
const CONTRACT: [RegExp, string][] = [[/\bI'm\b/g, 'I am'], [/\bit's\b/g, 'it is'], [/\bIt's\b/g, 'It is'], [/\byou're\b/g, 'you are'], [/\bYou're\b/g, 'You are'],
  [/\bdon't\b/g, 'do not'], [/\bcan't\b/g, 'cannot'], [/\bwon't\b/g, 'will not'], [/\bwe'll\b/g, 'we will'], [/\bwe'd\b/g, 'we would'],
  [/\byou'd\b/g, 'you would'], [/\bWhat's\b/g, 'What is'], [/\bthat's\b/g, 'that is'], [/\bthere's\b/g, 'there is'], [/\bwe're\b/g, 'we are'],
  [/\baren't\b/g, 'are not'], [/\bisn't\b/g, 'is not'], [/\bThey're\b/g, 'They are'], [/\bthey're\b/g, 'they are']];

function toneize(text: string | string[], tone: Tone, role: string): string | string[] {
  if (Array.isArray(text)) return text.map(t => toneize(t, tone, role) as string);
  let t = String(text);
  if (tone === 'Formal') for (const [a, b] of CONTRACT) t = t.replace(a, b);
  if (tone === 'Warm') { if (role === 'intro' || role === 'summary') t += ' We hope it helps.'; if (role === 'cta') t += ' We would be glad to help.'; }
  return t;
}
function ctxOf(p: Pick<Piece, 'title' | 'topic' | 'seg' | 'sources' | 'tone'>, pack: BrandPack): Ctx {
  const fw = pack.framework?.[p.seg] || PLAYBOOK[p.seg] || PLAYBOOK.Engagement;
  return { title: p.title, topic: p.topic || p.title, persona: PERSONA[p.seg] || 'teams', fw, claims: approvedClaims(pack).filter(c => p.sources.includes(c.id)), tone: p.tone };
}
function genBlock(c: Ctx, role: string, v: number): Block {
  return { id: newId(), tag: role === 'title' ? 'h1' : LIST_ROLES[role] || 'p', role, v, text: toneize(GEN[role](c, v), c.tone, role) };
}
/** What each part of a piece is for, as the AI writer is told (Phase 6). */
export const ROLE_PURPOSE: Record<string, string> = {
  title: 'the headline, under 12 words', intro: 'the opening paragraph: the situation the reader is in, and what the piece covers',
  why: 'why acting early matters', questions: 'a list of 3 to 5 questions the reader should ask their team', objection: 'a common concern, quoted, and a calm answer to it',
  cta: 'the close: one easy next step with the account team', steps: 'a numbered list of 3 to 5 practical steps', pitfalls: 'where plans usually slip, and how to avoid it',
  summary: 'an executive summary: who it is for and what it covers', challenge: 'what makes the problem hard in practice', good: 'what a good outcome looks like',
};
/** The parts the AI may word for a piece (the proof is always the approved claims, word for word). */
export const aiRoles = (type: ContentType, length: Length): string[] => LAYOUT[type][length].filter(r => r !== 'proof');
export const isListRole = (role: string) => !!LIST_ROLES[role];

/** The piece laid out for its type and length with the given wording per part, each marked as the AI's; the proof
 *  comes from the approved claims word for word, and a part without usable wording keeps the rules' text. */
export function layoutWith(p: Pick<Piece, 'type' | 'length' | 'title' | 'topic' | 'seg' | 'sources' | 'tone'>, pack: BrandPack, parts: Record<string, string | string[]>): Block[] {
  const c = ctxOf(p, pack), out: Block[] = [];
  for (const role of LAYOUT[p.type][p.length]) {
    if (role === 'proof' && !c.claims.length) continue;
    if (HEAD[role]) out.push({ id: newId(), tag: 'h2', role: 'h:' + role, v: 0, text: HEAD[role][0] });
    const tag: BlockTag = role === 'title' ? 'h1' : LIST_ROLES[role] || 'p', given = role === 'proof' ? undefined : parts[role];
    out.push(given !== undefined && Array.isArray(given) === (tag === 'ul' || tag === 'ol') ? { id: newId(), tag, role, v: 0, text: given, ai: true } : genBlock(c, role, 0));
  }
  return out;
}

/** The piece as the writer lays it out for its type and length; no approved source, no proof section. */
export function generate(p: Pick<Piece, 'type' | 'length' | 'title' | 'topic' | 'seg' | 'sources' | 'tone'>, pack: BrandPack): Block[] {
  const c = ctxOf(p, pack), out: Block[] = [];
  for (const role of LAYOUT[p.type][p.length]) {
    if (role === 'proof' && !c.claims.length) continue;
    if (HEAD[role]) out.push({ id: newId(), tag: 'h2', role: 'h:' + role, v: 0, text: HEAD[role][0] });
    out.push(genBlock(c, role, 0));
  }
  return out;
}

/* ─── Reading a request: type, topic, audience, tone and length ─── */

export type Brief = { type: ContentType; topic: string; seg: string; tone: Tone; length: Length; audienceText: string; ok: boolean };
export function parseBrief(q: string, typeHint: ContentType, brandTone: string): Brief {
  const s = String(q || '').trim();
  const type: ContentType = /white\s?-?paper/i.test(s) ? 'whitepaper' : /\b(blog|article|post)\b/i.test(s) ? 'blog' : typeHint;
  const forM = s.match(/\bfor\s+(.+?)(?:[,.;]|\s+(?:in|with|that|and keep|keep it)\b|$)/i);
  let topic = '';
  const onM = s.match(/\b(?:on|about|covering|around)\s+(.+?)(?:\s+for\s+|[,.;]|\s+(?:in a|with a|keep it)\b|$)/i);
  if (onM) topic = onM[1];
  else topic = s.replace(/\b(please|can you|could you|write|draft|create|generate|make|me|us|a|an|the|new|short|long|detailed|formal|warm|friendly|blog|post|article|white\s?-?paper)\b/gi, ' ')
    .replace(forM ? forM[0] : '', ' ').replace(/\s+/g, ' ').trim();
  topic = topic.replace(/^(on|about)\s+/i, '').replace(/[.?!]+$/, '').trim();
  const hay = s + ' ' + (forM ? forM[1] : '');
  const seg = (SEG_WORDS.find(([, re]) => re.test(hay)) || ['Modernisation'])[0];
  // Only Formal or Warm from the brief's words: "direct" is as likely to be part of the topic (direct digital control).
  const asked = toneAsked(s);
  const tone: Tone = asked === 'Formal' || asked === 'Warm' ? asked : ((TONES as readonly string[]).includes(brandTone) ? brandTone as Tone : 'Direct');
  const length: Length = /\b(short|brief|quick)\b/i.test(s) ? 'Short' : /\b(long|detailed|in-depth|comprehensive|thorough)\b/i.test(s) ? 'Long' : 'Medium';
  return { type, topic, seg, tone, length, audienceText: forM ? forM[1].trim() : '', ok: topic.split(/\s+/).filter(w => w.length > 2).length >= 2 };
}
/** What to ask back when a request doesn't say what the piece is about. */
export const briefQuestion = (type: ContentType) =>
  `Happy to write a ${TYPES[type].label.toLowerCase()}. What should it be about, and who is it for? For example: “${SUGGESTIONS[type][0].replace(/^A (short |detailed )?(blog|whitepaper) /i, '')}”.`;

/** A new piece from a brief: the approved claims for its audience are its sources. */
export function newPiece(b: Pick<Brief, 'type' | 'topic' | 'seg' | 'tone' | 'length'>, pack: BrandPack): Piece {
  const sources = approvedClaims(pack).filter(c => (c.segments || []).includes(b.seg)).map(c => c.id);
  const base = { type: b.type, topic: b.topic, seg: b.seg, tone: b.tone, length: b.length, sources, title: cap(b.topic) };
  return { ...base, blocks: generate(base, pack) };
}
export function planLine(p: Piece, pack: BrandPack, brandV: number): string {
  const srcs = approvedClaims(pack).filter(c => p.sources.includes(c.id)).map(c => c.id);
  return `I'll write a ${p.length.toLowerCase()} ${TYPES[p.type].label.toLowerCase()} on **${p.topic}** for ${lc(AUDIENCE[p.seg] || p.seg)}, in a ${p.tone.toLowerCase()} voice, using the ${TYPES[p.type].skill} instructions and Brand v${brandV}.` +
    (srcs.length ? ` It can cite ${srcs.join(', ')}, the approved sources for this audience.` : ' There is no approved source for this audience, so it will make no product claims.');
}

/* ─── Text, checks and what a piece cites ─── */

export const textOf = (blocks: Block[]) => blocks.map(plain).join('\n');
export const checksOf = (blocks: Block[], pack: BrandPack, asOf?: string): CheckResult => checkContent(textOf(blocks), pack, asOf);
export const issuesOf = (chk: CheckResult) => chk.flags.length + chk.unsupported.length;
export const citedIn = (chk: CheckResult) => [...new Set(chk.claims.filter(c => c.verified).map(c => c.source.split(' · ')[0]))];
export const wordsOf = (blocks: Block[]) => textOf(blocks).split(/\s+/).filter(Boolean).length;
export function summaryFor(p: Piece, chk: CheckResult, brandV: number): string {
  const used = citedIn(chk), n = issuesOf(chk);
  return `Done. I used the ${TYPES[p.type].skill} instructions and Brand v${brandV} (${p.tone} voice). ` +
    (used.length ? `It cites ${used.join(', ')} word for word from the approved sources. ` : 'It makes no product claims. ') +
    (n ? `${n} brand check${n > 1 ? 's' : ''} need a look.` : 'All brand checks pass.') +
    '\n\nTell me what to change, or click a paragraph in the canvas to change just that one. Add it to the Content library when it\'s right; reps can then add it to an email or LinkedIn message in Micro-segments & NBA.';
}
export const titleOf = (blocks: Block[], fallback: string) => {
  const h = blocks.find(b => b.tag === 'h1'); const t = h ? plain(h).trim() : '';
  return t || fallback;
};

/* ─── Changes: one block or the whole piece. Each returns the new blocks and what to say. ─── */

/** `unknown`: the rules didn't understand the request (not a refusal); the AI writer may take it (Phase 6). */
export type Change = { blocks: Block[]; reply: string; tone?: Tone; length?: Length; sources?: string[]; select?: string | null; changed: boolean; unknown?: boolean };
const sentences = (t: string) => String(t).split(/(?<=[.?!])\s+(?!\[)/).filter(Boolean);
const CLAIMY = /(\d+\s?%|\b(reduces?|reduced|improves?|improved|increases?|increased|cuts? (downtime|costs?)|savings|uptime|faster|proven|guarantee\w*)\b)/i;
const kindOf = (b: Block) => (b.tag === 'h1' ? 'title' : b.tag === 'h2' ? 'heading' : 'paragraph');

/** The block with its next generated wording (or the same wording in a new tone); null when a person wrote it. */
function regenBlock(b: Block, p: Piece, pack: BrandPack, toneOnly = false): Block | null {
  if (b.role.startsWith('h:')) { const h = HEAD[b.role.slice(2)]; if (!h) return null; const v = (b.v + 1) % h.length; return { ...b, v, text: h[v] }; }
  const c = ctxOf(p, pack);
  if (!GEN[b.role] || (b.role === 'proof' && !c.claims.length)) return null;
  const v = toneOnly ? b.v : b.v + 1, g = genBlock(c, b.role, v);
  return { ...b, v, text: g.text, edited: false };
}
function shorten(b: Block): Block | null {
  if (Array.isArray(b.text)) return b.text.length <= 2 ? null : { ...b, text: b.text.slice(0, -1), edited: true };
  const s = sentences(b.text); if (s.length < 2) return null;
  const keep = s.filter(x => /\[[^\]]+, \d{4}\]$/.test(x)), rest = s.filter(x => !keep.includes(x));   // never drop a cited claim
  return { ...b, text: rest.slice(0, Math.max(1, Math.ceil(rest.length / 2))).concat(keep).join(' '), edited: true };
}
function lengthen(b: Block): Block | null {
  if (Array.isArray(b.text)) return { ...b, text: b.text.concat('Who else needs to be part of the decision?'), edited: true };
  const m = MORE.find(x => !(b.text as string).includes(x)); if (!m) return null;
  return { ...b, text: (b.text as string).trim() + ' ' + m, edited: true };
}
function retone(b: Block, tone: Tone, p: Piece, pack: BrandPack): Block {
  if (!b.edited && GEN[b.role]) return regenBlock(b, { ...p, tone }, pack, true) ?? b;
  if (tone !== 'Formal') return b;
  const fix = (t: string) => CONTRACT.reduce((s, [a, r]) => s.replace(a, r), t);
  return { ...b, text: Array.isArray(b.text) ? b.text.map(fix) : fix(b.text) };
}
/** An approved claim that fits the request (words from its title or text), or, when proof is asked for, one this
 *  piece's audience may cite that it doesn't cite yet. */
function claimFor(q: string, p: Piece, pack: BrandPack): Claim | null {
  const words = String(q).toLowerCase().match(/[a-z]{4,}/g) || [];
  const stop = new Set(['mention', 'include', 'talk', 'about', 'with', 'that', 'this', 'from', 'proof', 'source', 'example', 'evidence', 'case', 'study', 'some', 'more', 'please']);
  const pool = approvedClaims(pack);
  const scored = pool.map(c => ({ c, s: words.filter(w => !stop.has(w) && (c.title + ' ' + c.claim).toLowerCase().includes(w)).length })).filter(x => x.s).sort((a, b) => b.s - a.s);
  if (scored.length) return scored[0].c;
  if (/proof|example|case|evidence|source/i.test(q)) {
    const used = textOf(p.blocks);
    return pool.find(c => p.sources.includes(c.id) && !used.includes(c.claim)) || pool.find(c => (c.segments || []).includes(p.seg) && !used.includes(c.claim)) || null;
  }
  return null;
}
/** New blocks go before the closing section (its heading), or at the end. */
function beforeClose(blocks: Block[], add: Block[]): Block[] {
  const i = blocks.findIndex(b => b.role === 'h:cta');
  return i < 0 ? blocks.concat(add) : [...blocks.slice(0, i), ...add, ...blocks.slice(i)];
}
const replace = (blocks: Block[], b: Block) => blocks.map(x => (x.id === b.id ? b : x));

/** Regenerate one block, or say why not. */
export function regenerate(p: Piece, target: string, pack: BrandPack): Change {
  const b = p.blocks.find(x => x.id === target);
  if (!b) return { blocks: p.blocks, reply: 'That part is not in the piece any more.', changed: false };
  const n = regenBlock(b, p, pack);
  if (!n) return { blocks: p.blocks, reply: "You wrote that one yourself, so there's no generated version to swap in. Tell me what to change in it.", changed: false };
  return { blocks: replace(p.blocks, n), reply: `Rewrote that ${kindOf(b)}. Nothing else changed.`, select: target, changed: true };
}
export function removeBlock(p: Piece, target: string): Change {
  const blocks = p.blocks.filter(x => x.id !== target);
  return blocks.length === p.blocks.length ? { blocks, reply: 'That part is not in the piece any more.', changed: false } : { blocks, reply: 'Removed that part.', select: null, changed: true };
}
export function setTone(p: Piece, tone: Tone, pack: BrandPack, target?: string | null): Change {
  const b = target ? p.blocks.find(x => x.id === target) : null;
  if (b) return { blocks: replace(p.blocks, retone(b, tone, p, pack)), reply: `Made that part ${tone.toLowerCase()}. The rest is still ${p.tone.toLowerCase()}.`, select: target, changed: true };
  return { blocks: p.blocks.map(x => retone(x, tone, p, pack)), tone, changed: true,
    reply: `Switched the piece to a ${tone.toLowerCase()} tone. Paragraphs you edited yourself keep your wording${tone === 'Formal' ? ', with contractions written out' : ''}.` };
}
/** The whole piece rewritten at another length (people's own edits are replaced; the screen asks first). */
export function setLength(p: Piece, length: Length, pack: BrandPack): Change {
  return { blocks: generate({ ...p, length }, pack), length, reply: `Rewrote it at ${length.toLowerCase()} length: ${LAYOUT[p.type][length].length} parts.`, select: null, changed: true };
}

/** A change asked for in the chat, to the selected block (`target`) or the whole piece. */
export function change(p: Piece, q: string, pack: BrandPack, target?: string | null): Change {
  const el = target ? p.blocks.find(x => x.id === target) ?? null : null;
  const low = q.toLowerCase(), same: Change = { blocks: p.blocks, reply: '', changed: false };
  // A request that would add a product claim is checked against the approved sources first.
  const said = q.match(/\b(?:say|claim|mention|add|write|include)\b\s+(?:that\s+)?(.+)/i);
  if (said && CLAIMY.test(said[1]) && !claimFor(said[1], p, pack)) {
    return { ...same, reply: `I can't add “${said[1].trim()}”. It reads like a product claim and there's no approved source for it. If it's true, add the source to the Content library and I'll cite it word for word.` };
  }
  if (/^(regenerate|rewrite|try again|another version|redo)( this| it)?$/i.test(q.trim()) && el) return regenerate(p, el.id, pack);
  let m: RegExpMatchArray | null;
  if ((m = q.match(/(?:change|set|make|call) (?:the )?(?:title|headline)(?: to| into)? (.+)/i)) || (m = q.match(/^(?:title|headline):\s*(.+)/i))) {
    const text = m[1].replace(/^["“]|["”]$/g, '');
    const h = p.blocks.find(b => b.tag === 'h1');
    const blocks = h ? replace(p.blocks, { ...h, text, edited: true }) : [{ id: newId(), tag: 'h1' as BlockTag, role: 'title', v: 0, text, edited: true }, ...p.blocks];
    return { blocks, reply: 'Title changed.', changed: true };
  }
  if (/\b(title|headline)\b/.test(low) && !el) {
    const h = p.blocks.find(b => b.tag === 'h1'), n = h && regenBlock(h, p, pack);
    if (h && n) return { blocks: replace(p.blocks, n), reply: `New title: “${n.text}”. Ask again for another option.`, changed: true };
  }
  if (/\b(intro|opening|first paragraph|summary)\b/.test(low) && !el) {
    const o = p.blocks.find(b => b.role === 'intro' || b.role === 'summary'), n = o && regenBlock(o, p, pack);
    if (o && n) return { blocks: replace(p.blocks, n), reply: 'Rewrote the opening. It stays selected, so you can ask for another version or a specific change.', select: o.id, changed: true };
  }
  if ((m = q.match(/add (?:a )?(?:section|paragraph|part|chapter) (?:on|about) (.+)/i))) {
    const topic = noDot(m[1]), formal = p.tone === 'Formal';
    const add: Block[] = [{ id: newId(), tag: 'h2', role: 'free', v: 0, text: cap(topic), edited: true },
      { id: newId(), tag: 'p', role: 'free', v: 0, edited: true, text: `${cap(topic)} is worth its own conversation. ${formal ? 'It is' : "It's"} usually where plans differ most from site to site, so start with how your site handles it today and what you would want to change.` }];
    return { blocks: beforeClose(p.blocks, add), reply: `Added a section on ${topic} before the close. It makes no product claims; edit it, or ask me to add proof from an approved source.`, select: add[1].id, changed: true };
  }
  const mention = q.match(/\b(?:mention|include|talk about)\b\s+(?:the\s+)?(.+)/i);
  if (/proof|case study|example|evidence|source|cite/.test(low) || mention) {
    const c = claimFor(q, p, pack);
    if (c) {
      const sources = p.sources.includes(c.id) ? p.sources : [...p.sources, c.id];
      let blocks: Block[], at: string;
      const proof = p.blocks.find(b => b.role === 'proof');
      if (el && el.tag === 'p') { blocks = replace(p.blocks, { ...el, text: (el.text as string).trim() + ' ' + cited(c), edited: true }); at = el.id; }
      else if (proof) { blocks = (proof.text as string).includes(c.claim) ? p.blocks : replace(p.blocks, { ...proof, text: (proof.text as string).trim() + ' ' + cited(c), edited: true }); at = proof.id; }
      else { const add: Block[] = [{ id: newId(), tag: 'h2', role: 'h:proof', v: 0, text: HEAD.proof[0] }, { id: newId(), tag: 'p', role: 'proof', v: 0, edited: true, text: cited(c) }]; blocks = beforeClose(p.blocks, add); at = add[1].id; }
      return { blocks, sources, reply: `Added an approved claim, word for word with its citation: ${c.id} · ${c.title} [${c.type}, ${c.year}].`, select: at, changed: true };
    }
    if (mention) {
      const what = noDot(mention[1]), b = el && el.tag === 'p' ? el : p.blocks.find(x => x.role === 'cta') ?? p.blocks.filter(x => !Array.isArray(x.text)).at(-1);
      if (b) return { blocks: replace(p.blocks, { ...b, text: (b.text as string).trim() + ` Is ${lc(what)} part of your plans?`, edited: true }), reply: `There's no approved source on ${what}, so I added it as a question rather than a claim.`, changed: true };
    }
    return { ...same, reply: "Every approved source for this audience is already cited. Add another one in the Content library and I'll use it word for word." };
  }
  const tone = toneAsked(low);
  if (tone) return setTone(p, tone, pack, el?.id);
  if (/short|concise|\bcut\b|trim|tighten/.test(low)) {
    const targets = el ? [el] : p.blocks.filter(b => b.tag === 'p' || b.tag === 'ul' || b.tag === 'ol');
    let n = 0, blocks = p.blocks;
    for (const t of targets) { const s = shorten(t); if (s) { blocks = replace(blocks, s); n++; } }
    if (!n) return { ...same, reply: el ? 'That part is already as short as it can go without losing its point.' : 'Everything is already short. Try a shorter length from the canvas toolbar.' };
    return { blocks, reply: el ? 'Shortened it. Cited claims are kept as they are.' : `Shortened ${n} part${n > 1 ? 's' : ''}. Cited claims are kept as they are.`, changed: true, select: el?.id };
  }
  if (/long|detail|expand|elaborate|\bmore\b/.test(low)) {
    if (el) { const l = lengthen(el); return l ? { blocks: replace(p.blocks, l), reply: 'Added a line. No new claims.', select: el.id, changed: true } : { ...same, reply: "I've added all I can without making claims. Ask me to add proof from an approved source." }; }
    const c = ctxOf(p, pack);
    const missing = LAYOUT[p.type].Long.filter(r => !p.blocks.some(b => b.role === r) && !(r === 'proof' && !c.claims.length));
    if (!missing.length) return { ...same, reply: 'It already has every section for this type. Ask me to add a section on a specific topic.' };
    const r = missing[0], add = [...(HEAD[r] ? [{ id: newId(), tag: 'h2' as BlockTag, role: 'h:' + r, v: 0, text: HEAD[r][0] }] : []), genBlock(c, r, 0)];
    return { blocks: beforeClose(p.blocks, add), reply: `Added “${HEAD[r] ? HEAD[r][0] : r}”.`, select: add.at(-1)!.id, changed: true };
  }
  if (/regenerate|rewrite|again|another|different/.test(low)) {
    if (el) { const r = regenerate(p, el.id, pack); return r.changed ? { ...r, reply: 'Here is another version.' } : r; }
    return { blocks: generate(p, pack), reply: 'Rewrote the whole piece from the brief. Your earlier version is one Undo away.', select: null, changed: true };
  }
  if (/remove|delete|drop/.test(low) && el) return { ...removeBlock(p, el.id), reply: 'Removed it.' };
  return { ...same, unknown: true, reply: `I can change ${el ? 'that part' : 'the piece'}: make it shorter or longer, change the tone (direct, formal, warm), rewrite it, change the title, add a section on a topic, or add proof from an approved source. To start something new, ask for another blog or whitepaper. I won't add claims that aren't in the approved sources.` };
}

/* ─── Files: Markdown for the website, and Word (.docx) with minimal branding ─── */

export function toMarkdown(blocks: Block[]): string {
  return blocks.map(b => {
    if (Array.isArray(b.text)) return b.text.map((t, i) => (b.tag === 'ol' ? `${i + 1}. ` : '- ') + t.trim()).join('\n');
    const t = b.text.trim();
    return b.tag === 'h1' ? '# ' + t : b.tag === 'h2' ? '## ' + t : b.tag === 'blockquote' ? '> ' + t : t;
  }).join('\n\n') + '\n';
}
export const fileName = (title: string, ext: string) => ((title || 'content').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'content') + '.' + ext;

const BRAND_HEX = '7D52A2';
const xmlEsc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
type Run = { t: string; b?: boolean; i?: boolean; u?: boolean; color?: string; sz?: number };
const rXml = (r: Run) => `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.u ? `<w:u w:val="single" w:color="${BRAND_HEX}"/>` : ''}<w:color w:val="${r.color || '1D242C'}"/><w:sz w:val="${r.sz || 22}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(r.t)}</w:t></w:r>`;
const pXml = (runs: Run[], ppr = '') => `<w:p><w:pPr>${ppr}</w:pPr>${runs.map(rXml).join('')}</w:p>`;
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** The parts of a Word file: a rule under the title, underlined headings, "Client" in the header, page numbers. */
export function docxParts(p: { type: ContentType; title: string; blocks: Block[] }, dateLabel: string): Record<string, string> {
  const sp = (b: number, a: number) => `<w:spacing w:before="${b}" w:after="${a}" w:line="300" w:lineRule="auto"/>`;
  const body: string[] = [];
  for (const b of p.blocks) {
    if (b.tag === 'h1') {
      body.push(pXml([{ t: plain(b), b: true, sz: 44, color: '141A21' }], sp(0, 80) + `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="${BRAND_HEX}"/></w:pBdr>`));
      body.push(pXml([{ t: `${TYPES[p.type].label} · Client · ${dateLabel}`, sz: 18, color: '7A8592' }], sp(60, 240)));
    } else if (b.tag === 'h2') body.push(pXml([{ t: plain(b), b: true, sz: 28, color: '141A21', u: true }], sp(280, 100) + '<w:keepNext/>'));
    else if (Array.isArray(b.text)) b.text.forEach((li, i) => body.push(pXml([{ t: b.tag === 'ol' ? `${i + 1}.  ` : '•  ', color: BRAND_HEX, b: true }, { t: li }], sp(0, 80) + '<w:ind w:left="567" w:hanging="340"/>')));
    else if (b.tag === 'blockquote') body.push(pXml([{ t: b.text, i: true, color: '4A5664' }], sp(60, 160) + `<w:ind w:left="400"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="${BRAND_HEX}"/></w:pBdr>`));
    else if (b.text.trim()) body.push(pXml([{ t: b.text }], sp(0, 160)));
  }
  const grey = '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="7A8592"/><w:sz w:val="16"/></w:rPr>';
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEsc(p.title)}</dc:title><dc:creator>Client</dc:creator></cp:coreProperties>`,
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1300" w:bottom="1300" w:left="1300" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    'word/header1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}>${pXml([{ t: 'Client', b: true, sz: 18, color: BRAND_HEX }], '<w:jc w:val="right"/>')}</w:hdr>`,
    'word/footer1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${grey}<w:t xml:space="preserve">${xmlEsc(p.title)} · Page </w:t></w:r><w:r>${grey}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${grey}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>${grey}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${grey}<w:t>1</w:t></w:r><w:r>${grey}<w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`,
  };
}

/** Blocks as a person may send them (manual edits): known tags, plain text, bounded sizes. */
export function blocksProblem(input: unknown): string | null {
  if (!Array.isArray(input)) return 'The piece must be a list of blocks.';
  if (input.length > 400) return 'The piece is too long (more than 400 blocks).';
  let total = 0;
  for (const b of input as Block[]) {
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !/^[\w-]{1,40}$/.test(b.id)) return 'A block has no valid id.';
    if (!BLOCK_TAGS.includes(b.tag)) return `"${String(b.tag)}" is not a block type.`;
    if (typeof b.role !== 'string' || b.role.length > 40 || typeof b.v !== 'number') return 'A block is malformed.';
    const parts = Array.isArray(b.text) ? b.text : [b.text];
    if ((b.tag === 'ul' || b.tag === 'ol') !== Array.isArray(b.text)) return 'Only lists hold several items.';
    if (parts.some(t => typeof t !== 'string')) return 'A block holds something that is not text.';
    total += parts.reduce((n, t) => n + t.length, 0);
  }
  return total > 200_000 ? 'The piece is too long.' : null;
}
