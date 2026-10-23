// Content studio's writer (lib/content/studio.ts, D-36; legacy demandai-content.js): the layout per type and length,
// tone, reading a brief, a new piece's approved sources and its checks, the changes asked for in the chat (a product
// claim only from an approved source, word for word), and the Markdown and Word files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultBrand, type BrandPack } from '../lib/engine/nba.ts';
import * as S from '../lib/content/studio.ts';

const pack: BrandPack = defaultBrand();
const brief = (q: string, hint: S.ContentType = 'blog') => S.parseBrief(q, hint, pack.voice.preset);
const piece = (q: string, hint: S.ContentType = 'blog') => S.newPiece(brief(q, hint), pack);
const roles = (bs: S.Block[]) => bs.map(b => b.role);
const text = (bs: S.Block[]) => S.textOf(bs);

test('reading a brief: type, topic, audience, tone and length; too vague to write asks back', () => {
  assert.deepEqual(brief('A short whitepaper on legacy control system modernisation for plant managers'),
    { type: 'whitepaper', topic: 'legacy control system modernisation', seg: 'Modernisation', tone: pack.voice.preset, length: 'Short', audienceText: 'plant managers', ok: true });
  const b = brief('Write a detailed, formal blog about service contract renewal');
  assert.deepEqual([b.type, b.seg, b.tone, b.length, b.ok], ['blog', 'Service renewal', 'Formal', 'Long', true]);
  assert.equal(brief('write a blog').ok, false);
  assert.match(S.briefQuestion('whitepaper'), /^Happy to write a whitepaper\. What should it be about, and who is it for\?/);
});

test('the layout follows the type and length; without an approved source there is no proof section', () => {
  const p = piece('A blog on planning a control system migration for plant managers');
  assert.deepEqual(roles(p.blocks), ['title', 'h:intro', 'intro', 'h:why', 'why', 'h:questions', 'questions', 'h:proof', 'proof', 'h:objection', 'objection', 'h:cta', 'cta'].filter(r => r !== 'h:intro'));
  assert.equal(p.blocks[0].tag, 'h1');
  assert.equal(p.blocks.find(b => b.role === 'questions')!.tag, 'ul');
  const wp = S.generate({ ...p, type: 'whitepaper', length: 'Long' }, pack);
  assert.deepEqual(roles(wp).filter(r => !r.startsWith('h:')), S.LAYOUT.whitepaper.Long);
  assert.ok(!roles(S.generate({ ...p, sources: [] }, pack)).includes('proof'), 'no approved source, no proof section');
});

test('a new piece cites only its audience’s approved claims, word for word, and passes the brand checks', () => {
  const p = piece('A blog on planning a control system migration for plant managers');
  const expected = pack.claims.filter(c => c.status === 'approved' && c.segments.includes('Modernisation')).map(c => c.id);
  assert.deepEqual(p.sources, expected);
  const chk = S.checksOf(p.blocks, pack, '2026-10-23');
  assert.deepEqual([S.issuesOf(chk), S.citedIn(chk).sort()], [0, [...expected].sort()]);
  assert.match(S.summaryFor(p, chk, 1), /^Done\. I used the blog-post instructions and Brand v1 \(Direct voice\)\. It cites .+ word for word from the approved sources\. All brand checks pass\./);
  assert.equal(p.title, 'Planning a control system migration');
});

test('tone: formal writes contractions out; warm adds a line to the opening and the close', () => {
  const p = piece('A blog on planning a control system migration for plant managers');
  const formal = S.setTone(p, 'Formal', pack);
  assert.equal(formal.tone, 'Formal');
  assert.doesNotMatch(text(formal.blocks), /\b(it's|you're|don't|we'd)\b/i);
  const warm = S.setTone(p, 'Warm', pack);
  assert.match(String(warm.blocks.find(b => b.role === 'intro')!.text), / We hope it helps\.$/);
  const one = S.setTone(p, 'Formal', pack, p.blocks.find(b => b.role === 'intro')!.id);
  assert.equal(one.tone, undefined, 'one part changed: the piece keeps its tone');
  assert.match(one.reply, /^Made that part formal\. The rest is still direct\.$/);
});

test('a product claim only from an approved source: an unbacked claim is refused; asked-for proof is cited word for word', () => {
  const p = piece('A blog on settling control scope early in a new project');
  const refused = S.change(p, 'say it reduces downtime by 30%', pack);
  assert.equal(refused.changed, false);
  assert.match(refused.reply, /^I can't add “it reduces downtime by 30%”\. It reads like a product claim and there's no approved source for it\./);
  const noProof = { ...p, sources: [], blocks: S.generate({ ...p, sources: [] }, pack) };
  const added = S.change(noProof, 'add proof', pack);
  assert.ok(added.changed && added.sources!.length === 1);
  const c = pack.claims.find(x => x.id === added.sources![0])!;
  assert.ok(text(added.blocks).includes(S.cited(c)), 'word for word, with its citation');
  assert.equal(S.issuesOf(S.checksOf(added.blocks, pack, '2026-10-23')), 0);
  assert.deepEqual(roles(added.blocks).slice(-4), ['h:proof', 'proof', 'h:cta', 'cta'], 'the proof goes before the close');
  // A claim waiting for approval is never cited, even when the request names it.
  const pending = { ...pack, claims: [...pack.claims, { id: 'CL-99', type: 'Case study', year: 2026, title: 'Turbine overhaul shortened by planning', segments: ['Project'], expiry: '2027-12-31', claim: 'A turbine overhaul finished early.', status: 'draft' }] };
  const notYet = S.change({ ...p, sources: [] }, 'mention the turbine overhaul', pending);
  assert.ok(!S.textOf(notYet.blocks).includes('A turbine overhaul finished early.') && !(notYet.sources ?? []).includes('CL-99'));
  const q = S.change(p, 'mention cybersecurity training', pack);
  assert.match(q.reply, /no approved source on cybersecurity training, so I added it as a question rather than a claim/);
});

test('changes: shorter keeps cited claims; longer adds the next section; title, a new section, regenerate and remove', () => {
  const p = piece('A long blog on planning a control system migration for plant managers');
  const short = S.change(p, 'make it shorter', pack);
  assert.ok(short.changed && S.wordsOf(short.blocks) < S.wordsOf(p.blocks));
  for (const id of p.sources) { const c = pack.claims.find(x => x.id === id)!; assert.ok(text(short.blocks).includes(S.cited(c)), `${id} kept`); }
  // A claim added to an ordinary paragraph survives shortening that paragraph.
  const bare = { ...p, blocks: S.generate({ ...p, sources: [] }, pack) };
  const why0 = bare.blocks.find(b => b.role === 'why')!;
  const withClaim = S.change(bare, 'add a case study', pack, why0.id);
  const cited = pack.claims.find(c => String(withClaim.blocks.find(b => b.id === why0.id)!.text).includes(S.cited(c)))!;
  assert.ok(cited, 'a claim was added to the paragraph');
  const shorter = S.change({ ...bare, blocks: withClaim.blocks }, 'shorter', pack, why0.id);
  assert.ok(shorter.changed && String(shorter.blocks.find(b => b.id === why0.id)!.text).endsWith(S.cited(cited)));
  const medium = piece('A blog on planning a control system migration for plant managers');
  const longer = S.change(medium, 'add more detail', pack);
  assert.match(longer.reply, /^Added “A practical sequence”\.$/);
  const t = S.change(p, 'change the title to Plan the cutover first', pack);
  assert.deepEqual([t.blocks[0].text, t.blocks[0].edited, t.reply], ['Plan the cutover first', true, 'Title changed.']);
  const sec = S.change(p, 'add a section on lifecycle planning', pack);
  const i = sec.blocks.findIndex(b => b.text === 'Lifecycle planning');
  assert.ok(i > 0 && sec.blocks[i + 2].role === 'h:cta', 'before the close');
  const why = p.blocks.find(b => b.role === 'why')!;
  const re = S.regenerate(p, why.id, pack);
  assert.ok(re.changed && re.blocks.find(b => b.id === why.id)!.text !== why.text);
  const own = { ...p, blocks: p.blocks.map(b => (b.id === why.id ? { ...b, role: 'free', edited: true } : b)) };
  assert.match(S.regenerate(own, why.id, pack).reply, /^You wrote that one yourself/);
  assert.equal(S.removeBlock(p, why.id).blocks.length, p.blocks.length - 1);
  assert.match(S.change(p, 'do something clever', pack).reply, /^I can change the piece: make it shorter or longer/);
  const len = S.setLength(p, 'Short', pack);
  assert.deepEqual([len.length, roles(len.blocks).filter(r => !r.startsWith('h:'))], ['Short', S.LAYOUT.blog.Short]);
});

test('files: Markdown for the website and the parts of a Word file, escaped, with "Client" in the header', () => {
  const p = piece('A blog on planning a control system migration for plant managers');
  const md = S.toMarkdown(p.blocks);
  assert.match(md, /^# Planning a control system migration\n\n/);
  assert.match(md, /\n## Questions worth asking\n\n- /);
  const tricky = [{ id: 'a1', tag: 'h1' as const, role: 'title', v: 0, text: 'R&D <plans> "now"' }, { id: 'a2', tag: 'ol' as const, role: 'steps', v: 0, text: ['One', 'Two'] }];
  const parts = S.docxParts({ type: 'whitepaper', title: 'R&D <plans>', blocks: tricky }, '23 October 2026');
  assert.deepEqual(Object.keys(parts).sort(), ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/footer1.xml', 'word/header1.xml']);
  assert.ok(parts['word/document.xml'].includes('R&amp;D &lt;plans&gt; &quot;now&quot;') && !parts['word/document.xml'].includes('<plans>'));
  assert.ok(parts['word/document.xml'].includes('Whitepaper · Client · 23 October 2026'));
  assert.ok(parts['word/header1.xml'].includes('>Client<'));
  assert.equal(S.fileName('Plan the cutover: first!', 'docx'), 'plan-the-cutover-first.docx');
});

test('blocks a person sends are checked: known types, text only, lists hold items, bounded', () => {
  const ok = [{ id: 'x1', tag: 'p', role: 'free', v: 0, text: '<script>alert(1)</script> is shown as text' }];
  assert.equal(S.blocksProblem(ok), null);
  assert.match(S.blocksProblem([{ ...ok[0], tag: 'script' }])!, /not a block type/);
  assert.match(S.blocksProblem([{ ...ok[0], text: { html: 'x' } }])!, /not text/);
  assert.match(S.blocksProblem([{ ...ok[0], tag: 'ul' }])!, /Only lists/);
  assert.match(S.blocksProblem([{ ...ok[0], id: 'bad id!' }])!, /valid id/);
  assert.match(S.blocksProblem('nope')!, /list of blocks/);
});
