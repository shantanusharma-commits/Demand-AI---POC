// Checks an .xlsx (a zip archive) before SheetJS opens it: no zip bomb, no macros, really a workbook.
// Every entry is inflated once with a hard output cap, so a central directory that lies about sizes can't slip a
// bomb through; the declared sizes must also match what inflates. ZIP64 and encrypted entries are refused: a
// 25 MB upload never needs them.
import 'server-only';
import { inflateRawSync } from 'node:zlib';

export type ZipLimits = { maxUnzippedBytes: number; maxEntries: number; maxRatio: number };
export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxUnzippedBytes: 200 * 1024 * 1024, maxEntries: 5000, maxRatio: 100 };

export type ZipProblem = 'not_zip' | 'zip64' | 'encrypted' | 'too_many_entries' | 'too_large_unzipped' | 'ratio' | 'corrupt' | 'macros' | 'not_workbook';
export type ZipVerdict = { ok: true; entries: number; unzippedBytes: number } | { ok: false; problem: ZipProblem; detail?: string };

const EOCD = 0x06054b50, ZIP64_LOCATOR = 0x07064b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50;
// Ratio is only judged on entries big enough for it to mean something.
const RATIO_MIN_BYTES = 1024 * 1024;
// VBA projects and Excel 4.0 macro or dialog sheets. Other .bin parts (printer settings) are ordinary.
const MACRO_PARTS = [/(^|\/)vbaProject\.bin$/i, /^xl\/macrosheets\//i, /^xl\/dialogsheets\//i];

function findEocd(b: Buffer): number {
  const stop = Math.max(0, b.length - 22 - 0xffff);
  for (let i = b.length - 22; i >= stop; i--) if (b.readUInt32LE(i) === EOCD) return i;
  return -1;
}

type Entry = { name: string; flags: number; method: number; compSize: number; size: number; localOffset: number };

function centralDirectory(b: Buffer): Entry[] | ZipProblem {
  const eocd = findEocd(b);
  if (eocd < 0) return 'not_zip';
  if (eocd >= 20 && b.readUInt32LE(eocd - 20) === ZIP64_LOCATOR) return 'zip64';
  const count = b.readUInt16LE(eocd + 10), cdSize = b.readUInt32LE(eocd + 12), cdOffset = b.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return 'zip64';
  if (cdOffset + cdSize > eocd) return 'corrupt';
  const entries: Entry[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== CENTRAL) return 'corrupt';
    const compSize = b.readUInt32LE(p + 20), size = b.readUInt32LE(p + 24);
    if (compSize === 0xffffffff || size === 0xffffffff) return 'zip64';
    const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), commentLen = b.readUInt16LE(p + 32);
    entries.push({
      name: b.toString('utf8', p + 46, p + 46 + nameLen), flags: b.readUInt16LE(p + 8), method: b.readUInt16LE(p + 10),
      compSize, size, localOffset: b.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Inflates one entry, refusing to produce more than `cap` bytes. */
function inflateEntry(b: Buffer, e: Entry, cap: number): Buffer | ZipProblem {
  const at = e.localOffset;
  if (at + 30 > b.length || b.readUInt32LE(at) !== LOCAL) return 'corrupt';
  const start = at + 30 + b.readUInt16LE(at + 26) + b.readUInt16LE(at + 28);
  if (start + e.compSize > b.length) return 'corrupt';
  const data = b.subarray(start, start + e.compSize);
  if (e.method === 0) return data.length > cap ? 'too_large_unzipped' : data;
  if (e.method !== 8) return 'corrupt';
  try {
    return inflateRawSync(data, { maxOutputLength: Math.max(1, cap) });
  } catch (err) {
    return (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE' || err instanceof RangeError ? 'too_large_unzipped' : 'corrupt';
  }
}

export function inspectXlsx(b: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipVerdict {
  const cd = centralDirectory(b);
  if (typeof cd === 'string') return { ok: false, problem: cd };
  if (cd.length > limits.maxEntries) return { ok: false, problem: 'too_many_entries' };
  const names = new Set(cd.map(e => e.name));
  if (cd.some(e => MACRO_PARTS.some(re => re.test(e.name)))) return { ok: false, problem: 'macros' };
  if (!names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) return { ok: false, problem: 'not_workbook' };
  let total = 0;
  for (const e of cd) {
    if (e.flags & 1) return { ok: false, problem: 'encrypted' };
    if (e.size >= RATIO_MIN_BYTES && e.size > e.compSize * limits.maxRatio) return { ok: false, problem: 'ratio', detail: e.name };
    const budget = limits.maxUnzippedBytes - total;
    if (e.size > budget) return { ok: false, problem: 'too_large_unzipped' };
    // One byte over the declared size is enough to prove the header lied.
    const out = inflateEntry(b, e, Math.min(budget, e.size + 1));
    if (typeof out === 'string') return { ok: false, problem: out, detail: e.name };
    if (out.length !== e.size) return { ok: false, problem: out.length > e.size ? 'too_large_unzipped' : 'corrupt', detail: e.name };
    if (e.size >= RATIO_MIN_BYTES && out.length > Math.max(1, e.compSize) * limits.maxRatio) return { ok: false, problem: 'ratio', detail: e.name };
    if (e.name === '[Content_Types].xml' && /macroEnabled/i.test(out.toString('utf8'))) return { ok: false, problem: 'macros' };
    total += out.length;
  }
  return { ok: true, entries: cd.length, unzippedBytes: total };
}
