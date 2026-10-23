/* Saving a file the browser builds itself: only the empty upload templates (column headers, nothing else). Every data
   export comes from a server route; nothing here depends on the claude.ai runtime (N-03). */
export function download(name: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
