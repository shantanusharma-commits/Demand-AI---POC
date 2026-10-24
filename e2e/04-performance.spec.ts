// Performance at volume (plan §9 item 5; prompt §9 item 5): lead files of 7,500 and 20,000 rows (fictional, made
// from the sample's own rows by tests/helpers/volume.ts) are checked on the server, then the list opens with its first
// rows on screen in under 2 s, and each keystroke in its search is handled in under 200 ms (Event Timing: from the key
// to the next frame). Also recorded: the server's time to check the file, the search request's time on the server,
// and the time from the last keystroke to the matching rows (that one includes the 250 ms debounce).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { expect, test } from '@playwright/test';
import { scaledLeadCsv } from '../tests/helpers/volume';
import { as, REPO, SAMPLE, waitForJob } from './helpers';
import { E2E_STATE } from './people';

const FIRST_RENDER_MS = 2_000;
const KEYSTROKE_MS = 200;
const leadGrid = XLSX.utils.sheet_to_json(XLSX.readFile(SAMPLE).Sheets['Lead template'], { header: 1, raw: true, defval: '' }) as unknown[][];
const results: Record<string, unknown> = {};

test.afterAll(() => {
  mkdirSync(join(REPO, E2E_STATE), { recursive: true });
  writeFileSync(join(REPO, E2E_STATE, 'performance.json'), JSON.stringify(results, null, 2));
});

for (const rows of [7_500, 20_000]) {
  test(`${rows.toLocaleString('en-US')} rows: checked on the server, first rows on screen under 2 s, each search keystroke under 200 ms`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { context, page } = await as(browser, 'admin');
    await page.goto('/prospecting');
    const origin = new URL(page.url()).origin;
    const csv = scaledLeadCsv(leadGrid as never, rows);
    const up = await page.request.post('/api/uploads', { headers: { origin }, multipart: { kind: 'lead', file: { name: `volume-${rows}.csv`, mimeType: 'text/csv', buffer: csv } } });
    expect(up.status(), await up.text()).toBe(201);
    const { jobId } = await up.json();
    const job = await waitForJob(page, jobId, 240_000) as { status: string; createdAt: string; finishedAt: string; progress: { result: { listId: string } } };
    expect(job.status).toBe('succeeded');
    const serverCheckMs = Date.parse(job.finishedAt) - Date.parse(job.createdAt);
    const listId = job.progress.result.listId;

    // First render: from the start of navigation to the first rows of the list on screen.
    await page.goto(`/prospecting?list=${listId}`, { waitUntil: 'commit' });
    await expect(page.locator('#rows tbody tr').first()).toBeVisible();
    const firstRenderMs = Math.round(await page.evaluate(() => performance.now()));

    // A search, typed: every keystroke's handling time as the browser measures it (only those over 16 ms are reported).
    // In the page: the time of the last key, and when every row on screen matches the search after it.
    await page.evaluate(() => {
      const w = window as unknown as { __events: { name: string; duration: number }[]; __lastKey: number; __rowsAt: number };
      w.__events = []; w.__lastKey = 0; w.__rowsAt = 0;
      new PerformanceObserver(list => { for (const e of list.getEntries()) w.__events.push({ name: e.name, duration: e.duration }); })
        .observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
      document.addEventListener('keyup', () => { w.__lastKey = performance.now(); w.__rowsAt = 0; }, true);
      new MutationObserver(() => {
        const rows = [...document.querySelectorAll('#rows tbody tr')];
        if (w.__lastKey && !w.__rowsAt && rows.length && rows.every(r => /petro/i.test(r.textContent ?? ''))) w.__rowsAt = performance.now();
      })
        .observe(document.querySelector('#rows')!, { childList: true, subtree: true, characterData: true });
    });
    const search = page.locator('.sl-srch input');
    await search.click();
    const searched = page.waitForResponse(r => r.url().includes(`/api/lists/${listId}/contacts?`) && r.url().includes('q=petro'));
    await search.pressSequentially('petro', { delay: 60 });
    const response = await searched;
    await expect(page.locator('#rows tbody tr').first()).toContainText(/petro/i);
    const toResultsMs = Math.round(await page.evaluate(() => { const w = window as unknown as { __lastKey: number; __rowsAt: number }; return w.__rowsAt - w.__lastKey; }));
    const serverSearchMs = Math.round(response.request().timing().responseEnd);
    const events = await page.evaluate(() => (window as unknown as { __events: { name: string; duration: number }[] }).__events);
    const keys = events.filter(e => /^key|^input|^beforeinput/.test(e.name));
    const slowestKeystrokeMs = keys.length ? Math.max(...keys.map(e => e.duration)) : 16;

    results[rows] = { rows, serverCheckMs, firstRenderMs, slowestKeystrokeMs: keys.length ? slowestKeystrokeMs : '< 16', serverSearchMs, toResultsMs };
    console.log(`performance ${rows} rows: ${JSON.stringify(results[rows])}`);
    expect(firstRenderMs).toBeLessThan(FIRST_RENDER_MS);
    expect(slowestKeystrokeMs).toBeLessThan(KEYSTROKE_MS);
    expect(serverSearchMs).toBeLessThan(KEYSTROKE_MS);
    await context.close();
  });
}
