// A generated file sent as a download. The name is kept readable for the browser (RFC 6266 with an RFC 5987
// UTF-8 form for names that aren't plain ASCII); the byte-order mark lets spreadsheet programs read UTF-8.
import 'server-only';
import type { CsvText } from '../../demandai-engine.ts';

/** A CSV file. It takes only toCSV's output, so every CSV the server sends has its formulas neutralised (G-052). */
export function csvDownload(fileName: string, csv: CsvText): Response {
  return download(fileName, '\ufeff' + csv, 'text/csv; charset=utf-8');
}

/** A JSON file to save (the configuration export). */
export function jsonDownload(fileName: string, json: string): Response {
  return download(fileName, json, 'application/json; charset=utf-8');
}

/** A Markdown report (the weekly summary, the pilot readout). */
export function markdownDownload(fileName: string, text: string): Response {
  return download(fileName, text, 'text/markdown; charset=utf-8');
}

/** A Word document (Content studio). */
export function docxDownload(fileName: string, bytes: Buffer): Response {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return download(fileName, body, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

function download(fileName: string, body: string | ArrayBuffer, type: string): Response {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return new Response(body, {
    headers: {
      'content-type': type,
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'x-content-type-options': 'nosniff',
    },
  });
}
