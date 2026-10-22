// What an uploaded file must be before anything parses it (plan §4 item 9): a .csv, .xlsx or .xls under the size
// cap, whose bytes match its name, with no macros, no password and no zip bomb. Refusals carry a status and a
// message written for the person uploading; nothing about a refused file is stored.
import 'server-only';
import { inspectXlsx, type ZipLimits, type ZipProblem } from './zip.ts';

export type UploadFormat = 'xlsx' | 'xls' | 'csv';
export type Inspection =
  | { ok: true; format: UploadFormat; mediaType: string }
  | { ok: false; status: 413 | 415 | 422; code: string; message: string };
export type InspectLimits = { maxBytes: number; zip: ZipLimits };

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MACRO_EXT = /\.(xlsm|xltm|xlsb|xlam|xla|xlm)$/i;
const FORMATS: Record<string, UploadFormat> = { '.xlsx': 'xlsx', '.xls': 'xls', '.csv': 'csv' };
// Browsers label files inconsistently (Windows often calls a CSV application/vnd.ms-excel), so each format accepts
// its own types plus the generic ones; anything else is refused as a mismatch.
const GENERIC = ['', 'application/octet-stream'];
const MEDIA_TYPES: Record<UploadFormat, string[]> = {
  xlsx: [...GENERIC, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/x-zip-compressed'],
  xls: [...GENERIC, 'application/vnd.ms-excel', 'application/msexcel', 'application/x-msexcel'],
  csv: [...GENERIC, 'text/csv', 'text/plain', 'application/csv', 'text/x-csv', 'application/vnd.ms-excel', 'text/comma-separated-values'],
};

const refuse = (status: 413 | 415 | 422, code: string, message: string): Inspection => ({ ok: false, status, code, message });
const MACROS = () => refuse(415, 'macro_file', "Macro-enabled workbooks aren't accepted. Save it as .xlsx (Excel Workbook) and upload that.");
const PROTECTED = () => refuse(422, 'protected', 'This workbook is password-protected. Remove the password in Excel and upload it again.');
const NOT_WORKBOOK = () => refuse(422, 'not_workbook', "This isn't a readable Excel workbook. Open it in Excel and save it as .xlsx, or as CSV.");
const BOMB = () => refuse(422, 'zip_bomb', "This workbook expands to far more data than a lead file holds, so it wasn't opened. Save only the template sheet and try again.");

const ZIP_REFUSALS: Record<ZipProblem, () => Inspection> = {
  macros: MACROS, encrypted: PROTECTED, not_zip: NOT_WORKBOOK, zip64: NOT_WORKBOOK, corrupt: NOT_WORKBOOK, not_workbook: NOT_WORKBOOK,
  too_many_entries: BOMB, too_large_unzipped: BOMB, ratio: BOMB,
};

function utf16le(s: string): Buffer { return Buffer.from(s, 'utf16le'); }

export function extensionOf(fileName: string): string {
  const m = /\.[A-Za-z0-9]+$/.exec(fileName.trim());
  return m ? m[0].toLowerCase() : '';
}

export function inspectUpload(input: { fileName: string; mediaType: string; bytes: Buffer }, limits: InspectLimits): Inspection {
  const { fileName, bytes } = input;
  const mediaType = input.mediaType.split(';')[0].trim().toLowerCase();
  if (MACRO_EXT.test(fileName)) return MACROS();
  const format = FORMATS[extensionOf(fileName)];
  if (!format) return refuse(415, 'unsupported_type', 'Use a .csv, .xlsx or .xls file.');
  if (bytes.length === 0) return refuse(422, 'empty_file', 'The file is empty.');
  if (bytes.length > limits.maxBytes) {
    return refuse(413, 'too_large', `The file is larger than ${Math.floor(limits.maxBytes / (1024 * 1024))} MB. Split it, or keep only the template sheet.`);
  }
  if (!MEDIA_TYPES[format].includes(mediaType)) return refuse(415, 'unsupported_type', "The file's type doesn't match its name. Use a .csv, .xlsx or .xls file.");
  const head = bytes.subarray(0, 8);
  if (format === 'xlsx') {
    if (head.subarray(0, 8).equals(OLE)) return PROTECTED(); // an encrypted .xlsx is stored as an OLE container
    if (!head.subarray(0, 4).equals(ZIP)) return NOT_WORKBOOK();
    const verdict = inspectXlsx(bytes, limits.zip);
    if (verdict.ok === false) return ZIP_REFUSALS[verdict.problem]();
  } else if (format === 'xls') {
    if (head.subarray(0, 4).equals(ZIP)) return refuse(422, 'not_workbook', 'This file is an .xlsx workbook named .xls. Rename it to .xlsx and upload it again.');
    if (!head.equals(OLE)) return NOT_WORKBOOK();
    if (bytes.includes(utf16le('_VBA_PROJECT'))) return MACROS();
    if (bytes.includes(utf16le('EncryptedPackage'))) return PROTECTED();
  } else {
    if (head.subarray(0, 4).equals(ZIP) || head.equals(OLE)) return refuse(422, 'not_text', 'This file is an Excel workbook, not a CSV. Rename it to .xlsx, or save it as CSV.');
    const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
    if (!utf16 && bytes.subarray(0, 65536).includes(0)) return refuse(422, 'not_text', "This file isn't text, so it can't be read as CSV.");
  }
  return { ok: true, format, mediaType };
}
