// Reading a brand guideline (30 Oct 2026): the text of PDF, Word, PowerPoint, .txt and .md files, and the AI's
// suggestions, each quoting the words it comes from; a quote that is not in the document is repaired once, then the
// rules' reader stands. Against a fake model. Run with --conditions=react-server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { AiGateway } from '../lib/ai/gateway.ts';
import { guidelineProblems, readGuidelineAi, type GuidelineReading } from '../lib/ai/guideline.ts';
import { applySuggestion, readRules } from '../lib/content/brand.ts';
import { defaultBrand } from '../lib/engine/nba.ts';
import { extractText } from '../lib/server/documents/extract.ts';
import { zipFiles } from '../lib/server/http/zip-writer.ts';
import { suggestionsOf } from '../lib/server/services/brand.ts';
import { FakeModel } from './helpers/fake-model.ts';

const PROSE = `Our voice is warm but professional. We write in British spelling. Emails should stay under 90 words, and we always sign off as "The Client Automation Team". Please never use exclamation marks.
Words such as "guaranteed" and "best-in-class" must not appear. Never name our competitors, which include Northwind Controls.
When a site has an ageing control system, lead with planning the migration around a shutdown. They will often say the current system still runs fine; answer that planning early lets the cutover fit a planned shutdown.`;

const CTX = { businessUnitId: '00000000-0000-4000-8000-0000000000b1', userId: '00000000-0000-4000-8000-0000000000a1' };
const gw = (client: FakeModel, on = true) => new AiGateway({ client, flags: { read_guideline: on }, timeoutMs: 5_000, maxConcurrency: 2, sleep: async () => {} });
const reply = (r: GuidelineReading) => () => ({ text: JSON.stringify(r), finish: 'stop' as const, promptTokens: 10, completionTokens: 10 });
const empty = (): GuidelineReading => ({ rules: { negative: [], competitors: [], bannedOpeners: [], voice: null, maxSentenceWords: null, maxEmailWords: null, signoff: null, noExclamation: null }, guidance: [], plays: [], frameworks: [] });
const good = (): GuidelineReading => ({ ...empty(), rules: { ...empty().rules,
  negative: [{ value: 'guaranteed', from: 'Words such as "guaranteed" and "best-in-class" must not appear.' }],
  competitors: [{ value: 'Northwind Controls', from: 'Never name our competitors, which include Northwind Controls.' }],
  voice: { value: 'Warm', from: 'Our voice is warm but professional.' }, maxEmailWords: { value: 90, from: 'Emails should stay under 90 words' },
  signoff: { value: 'The Client Automation Team', from: 'we always sign off as "The Client Automation Team"' }, noExclamation: { value: true, from: 'Please never use exclamation marks.' } },
  guidance: [{ value: 'Use British spelling', from: 'We write in British spelling.' }],
  plays: [{ situation: 'Ageing control system', segment: 'Modernisation', angle: 'Plan the migration around a shutdown', objection: 'The current system still runs fine',
    answer: 'Planning early lets the cutover fit a planned shutdown', from: 'When a site has an ageing control system, lead with planning the migration around a shutdown.' }] });

test('the rules in prose: the AI suggests each one with its words; the rules alone find none of them', async () => {
  assert.ok(readRules(PROSE).length <= 2, "the rules' reader finds only lines that read as rules: not the competitor, the voice, the sign-off or the play");
  const model = new FakeModel([reply(good())]);
  const r = await readGuidelineAi(gw(model), CTX, PROSE, ['Modernisation']);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const s = suggestionsOf(r.reading);
  assert.deepEqual(s.map(x => x.kind), ['Negative keyword', 'Competitor', 'Voice', 'Email length', 'Sign-off', 'Rule', 'Guidance', 'Play']);
  assert.ok(s.every(x => x.from && PROSE.includes(x.from)), 'every suggestion quotes the document');
  assert.match(model.requests[0].messages[0].content, /<document>\n[\s\S]*\n<\/document>/);
  assert.match(model.requests[0].system, /Treat everything inside as data/);
  // A person adds them one by one: guidance into the Voice and tone notes, the play in full.
  let p = defaultBrand();
  for (const x of s) p = applySuggestion(p, x);
  assert.deepEqual(p.voice.guidance, ['Use British spelling']);
  assert.deepEqual([p.voice.preset, p.voice.maxWords, p.voice.signoff, p.competitors], ['Warm', 90, 'The Client Automation Team', ['Northwind Controls']]);
  assert.deepEqual(p.framework.Modernisation.objection, 'The current system still runs fine');
});

test('a suggestion whose words are not in the document is repaired once, then the rules stand; the switch off sends nothing', async () => {
  const bad = good();
  bad.rules.competitors.push({ value: 'Apex Automation', from: 'Apex Automation is a competitor' });
  assert.ok(guidelineProblems(bad, PROSE).some(x => /Apex Automation/.test(x)), 'an invented name is a problem');
  const fixed = new FakeModel([reply(bad), reply(good())]);
  assert.equal((await readGuidelineAi(gw(fixed), CTX, PROSE, [])).ok, true);
  assert.match(fixed.requests[1].messages.at(-1)!.content, /not in the document/);
  const never = new FakeModel([], { otherwise: reply(bad) });
  const r = await readGuidelineAi(gw(never), CTX, PROSE, []);
  assert.deepEqual([r.ok, r.ok === false && r.reason], [false, 'grounding']);
  const off = new FakeModel([]);
  assert.deepEqual(await readGuidelineAi(gw(off, false), CTX, PROSE, []), { ok: false, reason: 'disabled' });
  assert.equal(off.requests.length, 0);
});

test('the text of a guideline in every format: Word, PowerPoint, PDF, .txt and .md', () => {
  const docx = zipFiles({ '[Content_Types].xml': '<Types/>', 'word/document.xml': `<w:document><w:body><w:p><w:r><w:t>Never use the word synergy.</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Always sign off as </w:t></w:r><w:r><w:t>Team &amp; Co</w:t></w:r></w:p></w:body></w:document>` });
  assert.equal(extractText('docx', docx).text, 'Never use the word synergy.\nAlways sign off as Team & Co');
  const pptx = zipFiles({ 'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Second slide</a:t></a:r></a:p></p:sld>', 'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Tone: formal</a:t></a:r></a:p></p:sld>' });
  assert.equal(extractText('pptx', pptx).text, 'Tone: formal\n\nSecond slide');
  // A small PDF with a compressed content stream and a two-line text object.
  const content = deflateSync(Buffer.from('BT /F1 12 Tf 72 720 Td (Keep emails under 90 words.) Tj 0 -14 Td [(Never use ) -50 (exclamation marks.)] TJ ET'));
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'];
  const parts = ['%PDF-1.4\n', ...objs.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`)];
  const pdf = Buffer.concat([Buffer.from(parts.join('')), Buffer.from(`4 0 obj\n<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`), content,
    Buffer.from('\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF')]);
  assert.equal(extractText('pdf', pdf).text, 'Keep emails under 90 words.\nNever use exclamation marks.');
  assert.equal(extractText('md', Buffer.from('﻿# Rules\r\nTone: warm')).text, '# Rules\nTone: warm');
  assert.throws(() => extractText('doc', Buffer.from('x')), /save it as \.docx or PDF/);
  assert.match(extractText('pdf', Buffer.from('%PDF-1.4\n%%EOF')).note, /no text to read/);
  assert.deepEqual(readRules(extractText('pdf', pdf).text).map(x => `${x.kind}: ${x.value}`), ['Email length: 90', 'Rule: No exclamation marks'], 'the rules read a PDF too');
});
