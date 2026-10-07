/* Saving a generated file. On claude.ai the page can't start a download itself: the viewer confirms a save.
   Opened as a normal web page, it downloads directly. Same behaviour as the original pages. */
import { showToast } from './ui';

export function fallbackDownload(name: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

export async function download(name: string, text: string): Promise<void> {
  let dl: ClaudeDownloads | null = null;
  try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (!dl) { fallbackDownload(name, text); return; }
  try { await dl.save({ filename: name, data: text }); showToast(name + ' saved'); }
  catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'declined') return;
    showToast(code === 'rate_limited' ? 'A save is already open' : "This view can't save files");
  }
}
