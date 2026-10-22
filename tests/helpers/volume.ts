// Fictional lead files of any size for volume tests, made from the sample's own rows (test-data/): each copy gets its
// own company, domain, email and LinkedIn URL, so nothing merges across copies. Written as CSV verbatim.
import type { Grid } from '../../types/demandai';

export function scaledLeadCsv(leadGrid: Grid, rows: number): Buffer {
  const headerAt = leadGrid.findIndex(r => (r || []).some(c => String(c).replace(/\*/g, '').trim() === 'company_name'));
  const header = leadGrid[headerAt].map(c => String(c).replace(/\*/g, '').trim());
  const col = (name: string) => header.indexOf(name);
  const [company, domain, email, linkedin] = ['company_name', 'company_domain', 'email', 'linkedin_url'].map(col);
  const data = leadGrid.slice(headerAt + 1).filter(r => r.some(c => String(c ?? '').trim()) && !r.some(c => /\*/.test(String(c ?? ''))));
  const out: string[][] = [header];
  for (let i = 0; out.length <= rows; i++) {
    const k = Math.floor(i / data.length);
    const src = data[i % data.length].map(c => (c === null || c === undefined ? '' : String(c)));
    if (k) {
      src[company] = src[company] && `${src[company]} ${k}`;
      src[domain] = src[domain] && `v${k}.${src[domain]}`;
      src[email] = src[email] && src[email].replace('@', `+v${k}@`);
      src[linkedin] = src[linkedin] && `${src[linkedin].replace(/\/+$/, '')}-v${k}`;
    }
    out.push(src);
  }
  const csv = out.map(r => r.map(s => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)).join(',')).join('\r\n');
  return Buffer.from(csv, 'utf8');
}
