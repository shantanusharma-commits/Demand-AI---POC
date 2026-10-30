// The text of a PDF, for reading a brand guideline (30 Oct 2026). No dependency: the objects (and object streams) are
// parsed, Flate streams inflated with a hard cap, the pages walked in order, and each page's text operators read
// through its fonts' ToUnicode maps (two-byte codes for composite fonts, WinAnsi for simple ones). Enough for the
// PDFs Word, PowerPoint, LibreOffice and browsers write; a scanned PDF has no text and says so. Every size is capped:
// the file is uploaded by a person and is never trusted.
import 'server-only';
import { inflateRawSync, inflateSync } from 'node:zlib';

const MAX_STREAM = 8 * 1024 * 1024, MAX_OBJECTS = 60_000, MAX_PAGES = 400, MAX_TEXT = 400_000;

type Ref = { ref: number };
type Dict = { [k: string]: Val } & { ref?: undefined; str?: undefined };
type Val = number | string | boolean | null | Ref | { str: Buffer } | Val[] | Dict;
type Obj = { value: Val; stream: Buffer | null };

const isStr = (v: unknown): v is { str: Buffer } => !!v && typeof v === 'object' && Buffer.isBuffer((v as { str?: unknown }).str);
const isRef = (v: unknown): v is Ref => !!v && typeof v === 'object' && 'ref' in (v as object);
const isDict = (v: unknown): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v) && !('ref' in (v as object)) && !('str' in (v as object));
const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set('()<>[]{}/%'.split('').map(c => c.charCodeAt(0)));

/** A small reader for PDF syntax over a latin1 string (one char per byte). */
class Lexer {
  i = 0;
  readonly s: string;
  constructor(s: string) { this.s = s; }
  skip() {
    for (;;) {
      while (this.i < this.s.length && WS.has(this.s.charCodeAt(this.i))) this.i++;
      if (this.s[this.i] !== '%') return;
      while (this.i < this.s.length && this.s[this.i] !== '\n' && this.s[this.i] !== '\r') this.i++;
    }
  }
  word(): string {
    const st = this.i;
    while (this.i < this.s.length && !WS.has(this.s.charCodeAt(this.i)) && !DELIM.has(this.s.charCodeAt(this.i))) this.i++;
    return this.s.slice(st, this.i);
  }
  literal(): Buffer {
    const out: number[] = [];
    let depth = 1;
    this.i++;
    while (this.i < this.s.length) {
      const c = this.s[this.i++];
      if (c === '\\') {
        const n = this.s[this.i++];
        const esc: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
        if (n in esc) out.push(esc[n]);
        else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(this.s[this.i])) o += this.s[this.i++]; out.push(parseInt(o, 8) & 255); }
        else if (n === '\r') { if (this.s[this.i] === '\n') this.i++; }
        else if (n !== '\n') out.push(n.charCodeAt(0));
      } else if (c === '(') { depth++; out.push(40); }
      else if (c === ')') { if (--depth === 0) break; out.push(41); }
      else out.push(c.charCodeAt(0));
    }
    return Buffer.from(out);
  }
  hex(): Buffer {
    const end = this.s.indexOf('>', this.i);
    const h = this.s.slice(this.i + 1, end < 0 ? this.s.length : end).replace(/[^0-9a-fA-F]/g, '');
    this.i = end < 0 ? this.s.length : end + 1;
    return Buffer.from(h.length % 2 ? h + '0' : h, 'hex');
  }
  /** One value; `ops` collects bare words (content-stream operators) instead of treating them as values. */
  value(): Val | undefined {
    this.skip();
    const c = this.s[this.i];
    if (c === undefined) return undefined;
    if (c === '<' && this.s[this.i + 1] === '<') {
      this.i += 2;
      const d = {} as Dict;
      for (;;) {
        this.skip();
        if (this.s.startsWith('>>', this.i)) { this.i += 2; return d; }
        if (this.s[this.i] !== '/') { if (this.i >= this.s.length) return d; this.i++; continue; }
        this.i++;
        const k = this.word();
        const v = this.value();
        if (v !== undefined) d[k] = v;
      }
    }
    if (c === '[') {
      this.i++;
      const a: Val[] = [];
      for (;;) {
        this.skip();
        if (this.s[this.i] === ']') { this.i++; return a; }
        if (this.i >= this.s.length) return a;
        const v = this.value();
        if (v !== undefined) a.push(v);
      }
    }
    if (c === '(') return { str: this.literal() };
    if (c === '<') return { str: this.hex() };
    if (c === '/') { this.i++; return '/' + this.word(); }
    if (c === ']' || c === '>' || c === ')' || c === '{' || c === '}') { this.i++; return null; }
    const w = this.word();
    if (!w) { this.i++; return null; }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) {
      // "12 0 R" is a reference.
      const save = this.i;
      this.skip();
      const g = this.word();
      this.skip();
      if (/^\d+$/.test(w) && /^\d+$/.test(g) && this.s[this.i] === 'R') { this.i++; return { ref: +w }; }
      this.i = save;
      return Number(w);
    }
    if (w === 'true' || w === 'false') return w === 'true';
    if (w === 'null') return null;
    return w; // an operator or keyword
  }
}

function inflate(data: Buffer): Buffer | null {
  for (const f of [inflateSync, inflateRawSync]) {
    try { return f(data, { maxOutputLength: MAX_STREAM }); } catch { /* try the other, or give up */ }
  }
  return null;
}

/** All objects, the later definition of a number winning (incremental updates), then those inside object streams. */
function readObjects(buf: Buffer): Map<number, Obj> {
  const s = buf.toString('latin1'), objs = new Map<number, Obj>();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) && objs.size < MAX_OBJECTS) {
    const lx = new Lexer(s);
    lx.i = m.index + m[0].length;
    const value = lx.value() ?? null;
    lx.skip();
    let stream: Buffer | null = null;
    if (s.startsWith('stream', lx.i)) {
      let st = lx.i + 6;
      if (s[st] === '\r') st++;
      if (s[st] === '\n') st++;
      // The stated length when it lands on "endstream"; otherwise (an indirect or wrong length) the next "endstream".
      const len = isDict(value) && typeof value.Length === 'number' ? value.Length : -1;
      const end = len >= 0 && /^\s*endstream/.test(s.slice(st + len, st + len + 16)) ? st + len : s.indexOf('endstream', st);
      stream = buf.subarray(st, end < 0 ? buf.length : end);
      re.lastIndex = end < 0 ? s.length : end;
    }
    objs.set(+m[1], { value, stream });
  }
  for (const o of [...objs.values()]) {
    if (!isDict(o.value) || o.value.Type !== '/ObjStm' || !o.stream) continue;
    const data = decode(o);
    if (!data) continue;
    const t = data.toString('latin1'), n = Number(o.value.N) || 0, first = Number(o.value.First) || 0;
    const head = t.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < n && objs.size < MAX_OBJECTS; k++) {
      const num = head[2 * k], off = head[2 * k + 1];
      if (!Number.isFinite(num) || objs.has(num)) continue;
      const lx = new Lexer(t);
      lx.i = first + off;
      objs.set(num, { value: lx.value() ?? null, stream: null });
    }
  }
  return objs;
}

function decode(o: Obj): Buffer | null {
  if (!o.stream) return null;
  const d = isDict(o.value) ? o.value : {};
  const filters = Array.isArray(d.Filter) ? d.Filter : d.Filter ? [d.Filter] : [];
  if (!filters.length) return o.stream;
  if (filters.length === 1 && filters[0] === '/FlateDecode') return inflate(o.stream);
  return null; // images and other encodings carry no text
}

/** A font's code → text map: its ToUnicode CMap, and how many bytes a code takes. */
type Font = { bytes: 1 | 2; map: Map<number, string> };
const WIN_ANSI: Record<number, string> = { 0x80: '€', 0x82: '‚', 0x84: '„', 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x99: '™' };
const utf16 = (b: Buffer) => { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b.readUInt16BE(i)); return s; };

function readCmap(text: string, map: Map<number, string>): number {
  let width = 0;
  for (const block of text.match(/begincodespacerange([\s\S]*?)endcodespacerange/g) ?? []) {
    const h = /<([0-9a-fA-F]+)>/.exec(block);
    if (h) width = Math.max(width, h[1].length / 2);
  }
  const hexes = (s: string) => [...s.matchAll(/<([0-9a-fA-F]*)>/g)].map(x => Buffer.from(x[1].length % 2 ? x[1] + '0' : x[1], 'hex'));
  for (const block of text.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    const hs = hexes(block);
    for (let i = 0; i + 1 < hs.length; i += 2) map.set(hs[i].readUIntBE(0, Math.min(4, hs[i].length) || 1), utf16(hs[i + 1]));
  }
  for (const block of text.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const line of block.split(/\r?\n/)) {
      const arr = /\[(.*)\]/.exec(line), hs = hexes(arr ? line.slice(0, arr.index) : line);
      if (hs.length < 2) continue;
      const lo = hs[0].readUIntBE(0, hs[0].length || 1), hi = hs[1].readUIntBE(0, hs[1].length || 1);
      if (hi - lo > 65535) continue;
      if (arr) hexes(arr[1]).forEach((d, k) => map.set(lo + k, utf16(d)));
      else if (hs[2]) { const base = utf16(hs[2]); for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + c - lo)); }
    }
  }
  return width;
}

function fontOf(objs: Map<number, Obj>, v: Val | undefined): Font {
  const get = (x: Val | undefined): Val | undefined => (isRef(x) ? objs.get(x.ref)?.value : x);
  const f = get(v);
  const map = new Map<number, string>();
  let bytes: 1 | 2 = 1;
  if (isDict(f)) {
    if (f.Subtype === '/Type0') bytes = 2;
    const tu = isRef(f.ToUnicode) ? objs.get(f.ToUnicode.ref) : undefined;
    const data = tu ? decode(tu) : null;
    if (data) { const w = readCmap(data.toString('latin1'), map); if (w === 1 || w === 2) bytes = w; }
  }
  return { bytes, map };
}

function show(b: Buffer, font: Font): string {
  let out = '';
  if (font.bytes === 2) for (let i = 0; i + 1 < b.length; i += 2) { const c = b.readUInt16BE(i); out += font.map.get(c) ?? (c > 31 && c < 0xd800 ? String.fromCharCode(c) : ''); }
  else for (const c of b) out += font.map.get(c) ?? WIN_ANSI[c] ?? (c >= 32 ? String.fromCharCode(c) : '');
  return out;
}

/** The text of one page's content: lines follow the text operators' moves; wide gaps in TJ become spaces. */
function pageText(content: string, fonts: Record<string, Font>): string {
  const lx = new Lexer(content), args: Val[] = [];
  let font: Font = { bytes: 1, map: new Map() }, out = '', y: number | null = null, size = 10, scale = 1, drawn = 0;
  const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; drawn = 0; };
  const put = (t: string) => { out += t; drawn += t.length; };
  // A move along the line is a space only when it is clearly wider than the letters just drawn: some writers (browsers)
  // place every glyph with its own move and draw spaces as glyphs.
  const gap = (tx: number) => { if (tx * scale > drawn * size * scale + size * scale * 0.3 && !out.endsWith(' ') && !out.endsWith('\n')) out += ' '; drawn = 0; };
  for (let guard = 0; guard < 2_000_000; guard++) {
    const v = lx.value();
    if (v === undefined) break;
    if (typeof v !== 'string' || v.startsWith('/')) { args.push(v); continue; }
    switch (v) {
      case 'Tf': font = fonts[String(args[0])] ?? font; size = Math.abs(Number(args[1])) || size; break;
      case 'Tj': { const s = args[0]; if (isStr(s)) put(show(s.str, font)); break; }
      case "'": case '"': { nl(); const s = args[args.length - 1]; if (isStr(s)) put(show(s.str, font)); break; }
      case 'TJ': for (const p of (Array.isArray(args[0]) ? args[0] : [])) {
        if (typeof p === 'number') { if (p < -180 && !out.endsWith(' ')) out += ' '; }
        else if (isStr(p)) put(show(p.str, font));
      } break;
      case 'T*': nl(); break;
      case 'Td': case 'TD': { const ty = Number(args[1]) || 0, tx = Number(args[0]) || 0; if (Math.abs(ty) > 0.5) nl(); else gap(tx); break; }
      case 'Tm': { const ny = Number(args[5]); scale = Math.abs(Number(args[0])) || 1; if (y !== null && Math.abs(ny - y) > 0.5) nl(); else if (y !== null && !out.endsWith(' ')) out += ' '; y = ny; drawn = 0; break; }
      case 'ET': if (!out.endsWith(' ') && !out.endsWith('\n')) out += ' '; break;
      case 'BI': { const e = content.indexOf('EI', lx.i); lx.i = e < 0 ? content.length : e + 2; break; } // inline image data
    }
    args.length = 0;
    if (out.length > MAX_TEXT) break;
  }
  return out;
}

/** The text of a PDF, page by page in reading order; empty when it has none (a scan). Throws when it isn't a PDF. */
export function pdfText(buf: Buffer): { text: string; pages: number } {
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('not a PDF');
  if (/\/Encrypt\s/.test(buf.subarray(Math.max(0, buf.length - 4096)).toString('latin1')) || /\/Encrypt\s/.test(buf.subarray(0, 4096).toString('latin1'))) throw new Error('the PDF is password-protected');
  const objs = readObjects(buf);
  const get = (x: Val | undefined): Val | undefined => (isRef(x) ? objs.get(x.ref)?.value : x);
  const root = [...objs.values()].find(o => isDict(o.value) && o.value.Type === '/Catalog')?.value as Dict | undefined;
  const pages: { page: Dict; resources: Dict }[] = [];
  const seen = new Set<Val>();
  const walk = (node: Val | undefined, inherited: Dict) => {
    const n = get(node);
    if (!isDict(n) || seen.has(n) || pages.length >= MAX_PAGES) return;
    seen.add(n);
    const res = (get(n.Resources) as Dict | undefined) ?? inherited;
    if (n.Type === '/Pages' || Array.isArray(n.Kids)) (get(n.Kids) as Val[] ?? []).forEach(k => walk(k, res));
    else pages.push({ page: n, resources: res });
  };
  if (root) walk(root.Pages, {});
  if (!pages.length) for (const o of objs.values()) if (isDict(o.value) && o.value.Type === '/Page') pages.push({ page: o.value, resources: (get(o.value.Resources) as Dict) ?? {} });
  let text = '';
  for (const { page, resources } of pages) {
    const fontDict = (get(resources.Font) as Dict | undefined) ?? {};
    const fonts: Record<string, Font> = {};
    for (const [name, ref] of Object.entries(fontDict)) fonts['/' + name] = fontOf(objs, ref);
    const contents = get(page.Contents);
    const parts = (Array.isArray(contents) ? contents : [page.Contents]).map(c => (isRef(c) ? objs.get(c.ref) : undefined)).filter((o): o is Obj => !!o);
    const content = parts.map(o => decode(o)?.toString('latin1') ?? '').join('\n');
    text += pageText(content, fonts).replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim() + '\n\n';
    if (text.length > MAX_TEXT) break;
  }
  return { text: text.trim(), pages: pages.length };
}
