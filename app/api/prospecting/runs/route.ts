/* POST a lead file (multipart "file") or { "sample": true }: screen it once, keep the result on the server, answer with a summary.
   Everything after that is read a page at a time from /api/prospecting/runs/[id]/... */
import { gridsFromFile } from '@/lib/server/file-grids';
import { createRun } from '@/lib/server/prospecting-runs';
import { pickSheet } from '@/lib/file-reader';
import { DemandAISample } from '@/lib/demandai-sample-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const MAX_BYTES = 30 * 1024 * 1024;
const fail = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  try {
    if ((request.headers.get('content-type') || '').includes('application/json')) {
      const body = await request.json().catch(() => ({})) as { sample?: unknown };
      if (body.sample !== true) return fail('Send a file, or { "sample": true }');
      return Response.json(await createRun({ grid: DemandAISample.LEADS, fileName: DemandAISample.LEAD_FILE, sheet: 'Lead template', sandbox: true }));
    }
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return fail('Choose a file to upload');
    if (file.size > MAX_BYTES) return fail('That file is over 30 MB. Split it and upload the parts', 413);
    const g = pickSheet(gridsFromFile(file.name, await file.arrayBuffer()), 'company_name', /lead template/i);
    if (!g) return fail('That file has no sheets');
    return Response.json(await createRun({ grid: g.grid, fileName: file.name, sheet: g.sheet, sandbox: false }));
  } catch (e) {
    return fail((e as Error).message || 'Could not read that file');
  }
}
