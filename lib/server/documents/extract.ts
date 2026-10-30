// The text of an uploaded brand guideline (30 Oct 2026): PDF, Word (.docx), PowerPoint (.pptx), .txt and .md. Older
// binary Word and PowerPoint files (.doc, .ppt) are kept as the reference but can't be read: the person is asked to
// save them in the newer format. Paragraphs stay on their own lines, so the rules' reader (readRules) and the AI see
// the same text. The text is capped; the person is told when only the first part was read.
import 'server-only';
import { readZipEntries } from '../uploads/zip.ts';
import { pdfText } from './pdf.ts';

export const GUIDELINE_MAX_CHARS = 60_000;
export type Extracted = { text: string; truncated: boolean; note: string };
export class DocumentReadError extends Error {}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITY[e] ?? m);

/** Paragraphs of Office XML: `para` closes a paragraph, `run` holds text, tabs and breaks become white space. */
function officeText(xml: string, para: string, run: string): string {
  return xml.split(new RegExp(`</${para}>`)).map(p => {
    const bits = p.replace(/<w:tab\/>|<a:tab\/>/g, '\t').replace(/<w:br\/>|<a:br\/>/g, '\n');
    return [...bits.matchAll(new RegExp(`<${run}(?:\\s[^>]*)?>([^<]*)</${run}>|(\\t)|(\\n)`, 'g'))].map(m => (m[1] !== undefined ? unescape(m[1]) : m[2] ?? m[3])).join('');
  }).map(l => l.replace(/[ \t]+$/, '')).filter((l, i, a) => l || (i && a[i - 1])).join('\n');
}

function zipped(bytes: Buffer, want: (n: string) => boolean, what: string): Map<string, Buffer> {
  const entries = readZipEntries(bytes, want, { maxUnzippedBytes: 40 * 1024 * 1024, maxEntries: 5000, maxRatio: 200 });
  if (typeof entries === 'string') throw new DocumentReadError(entries === 'encrypted' ? `The ${what} is password-protected: save a copy without the password.` : `The ${what} can't be opened (${entries.replace(/_/g, ' ')}).`);
  return entries;
}

export function extractText(ext: string, bytes: Buffer): Extracted {
  let text = '', note = '';
  switch (ext) {
    case 'txt': case 'md': text = bytes.toString('utf8').replace(/^﻿/, ''); break;
    case 'docx': {
      const e = zipped(bytes, n => /^word\/(document|footnotes|endnotes)\.xml$/.test(n), 'Word file');
      const doc = e.get('word/document.xml');
      if (!doc) throw new DocumentReadError('This is not a Word document (.docx).');
      text = officeText(doc.toString('utf8'), 'w:p', 'w:t');
      break;
    }
    case 'pptx': {
      const e = zipped(bytes, n => /^ppt\/(slides|notesSlides)\/(slide|notesSlide)\d+\.xml$/.test(n), 'PowerPoint file');
      const num = (n: string) => +(/(\d+)\.xml$/.exec(n)?.[1] ?? 0);
      const slides = [...e.keys()].filter(n => n.startsWith('ppt/slides/')).sort((a, b) => num(a) - num(b));
      if (!slides.length) throw new DocumentReadError('This PowerPoint file has no slides to read.');
      text = slides.map(n => {
        const notes = e.get(`ppt/notesSlides/notesSlide${num(n)}.xml`);
        return [officeText(e.get(n)!.toString('utf8'), 'a:p', 'a:t'), notes ? officeText(notes.toString('utf8'), 'a:p', 'a:t').replace(/^\d+\s*$/m, '') : ''].filter(s => s.trim()).join('\n');
      }).join('\n\n');
      break;
    }
    case 'pdf': {
      try { text = pdfText(bytes).text; } catch (err) { throw new DocumentReadError(`The PDF can't be read: ${(err as Error).message}.`); }
      if (!text.trim()) note = 'The PDF has no text to read (it may be a scan): upload the original Word or PowerPoint file, or a text version.';
      break;
    }
    case 'doc': case 'ppt': throw new DocumentReadError(`An older .${ext} file is kept as the reference but can't be read: save it as .${ext}x or PDF and upload that.`);
    default: throw new DocumentReadError('Upload a PDF, Word, PowerPoint, .txt or .md file.');
  }
  text = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const truncated = text.length > GUIDELINE_MAX_CHARS;
  if (truncated) {
    text = text.slice(0, GUIDELINE_MAX_CHARS);
    note = `Only the first ${GUIDELINE_MAX_CHARS.toLocaleString('en-US')} characters were read; split a longer guideline into parts.`;
  }
  return { text, truncated, note };
}
