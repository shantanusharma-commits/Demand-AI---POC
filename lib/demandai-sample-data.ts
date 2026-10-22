/* Sandbox sample data: the fictional D1 lead sample and D2 signal sample from the templates.
   Fictional companies and people only. Never mixed with customer data: lists built from it
   are marked sandbox, and Scoring only accepts the sample signals for a sandbox list. */
import type { Grid } from '../types/demandai';

export const SAMPLE_AS_OF = '2026-09-30';

const H = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url', 'company_name',
  'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count', 'account_type', 'existing_customer',
  'managed_separately', 'site_name', 'site_process_type', 'site_capacity', 'capacity_unit', 'consent_basis', 'opt_out', 'owner_email'];
const li = (slug: string) => `https://www.linkedin.com/in/${slug}-sample`;
const A = 'rep.a@client-sample.com', B = 'rep.b@client-sample.com';
const NW = ['Northwind Refining', 'northwindrefining.com', 'Singapore', 'Singapore', 'Oil & Gas - Refining', '2400000000', '3800', 'Owner-operator', 'N', 'N', 'Jurong Refinery', 'Crude refining', '140000', 'barrels/day'];
const MP = ['Meridian Petrochem', 'meridianpetro.com', 'Malaysia', 'Johor', 'Petrochemicals', '850000000', '1600', 'Owner-operator', 'Y', 'N', 'Pasir Gudang Plant', 'Petrochemicals, continuous', '180000', 'tonnes/year'];
const CB = ['Coral Bay Refinery', 'coralbayrefinery.com', 'Philippines', 'Bataan', 'Refining', '', '2200', 'Owner-operator', 'N', 'N', 'Bataan Refinery', 'Crude refining', '180000', 'barrels/day'];
const AP = ['Andaman Petroleum', 'andamanpetroleum.co.th', 'Thailand', 'Rayong', 'Oil & Gas - Refining', '1500000000', '3100', 'Owner-operator', 'Y', 'N', 'Map Ta Phut Refinery', 'Crude refining', '145000', 'barrels/day'];
const BG = ['Borneo Gas Processing', 'borneogas.com.my', 'Malaysia', 'Bintulu', 'Gas processing', '700000000', '1400', 'Owner-operator', 'N', 'N', 'Bintulu Gas Plant', 'Gas processing', '1200', 'MMscfd'];

export const LEADS: Grid = [
  ['Lead research template: one row per contact · * = required'],
  H,
  ['Aditi', 'Rao', 'Head of Instrumentation', 'Director', 'aditi.rao@northwindrefining.com', 'Y', li('aditi-rao'), ...NW, 'Legitimate interest', 'N', A],
  ['Wei', 'Lim', 'Plant Manager', 'Director', 'wei.lim@northwindrefining.com', 'Y', li('wei-lim'), ...NW, 'Legitimate interest', 'N', A],
  ['Farah', 'Aziz', 'Procurement Lead', 'Manager', '', '', li('farah-aziz'), ...MP, 'Existing customer', 'N', B],
  ['Hassan', 'Idris', 'Operations Director', 'Director', 'hassan.idris@meridianpetro.com', 'Y', li('hassan-idris'), ...MP, 'Existing customer', 'N', B],
  ['Somchai', 'Wong', 'Project Director', 'Director', 'somchai.w@harbourline-epc.com', 'Y', li('somchai-wong'), 'Harbourline EPC', 'harbourline-epc.com', 'Thailand', 'Bangkok', 'Engineering services', '620000000', '2100', 'EPC contractor', 'N', 'N', '', '', '', '', 'Legitimate interest', 'N', A],
  ['Maria', 'Santos', 'I&C Manager', 'Manager', 'maria.santos@coralbayrefinery.com', 'Y', li('maria-santos'), ...CB, 'Legitimate interest', 'N', B],
  ['Jose', 'Cruz', 'Plant Manager', 'Director', 'jose.cruz@coralbayrefinery.com', 'N', li('jose-cruz'), ...CB, 'Legitimate interest', 'N', B],
  ['Kiet', 'Pham', 'Maintenance Manager', 'Manager', 'kiet.pham@coralbayrefinery', 'N', li('kiet-pham'), ...CB, 'Legitimate interest', 'N', B],
  ['Budi', 'Santoso', 'Head of Automation', 'Director', 'budi.santoso@straitsenergy.co.id', 'Y', li('budi-santoso'), 'Straits Energy', 'straitsenergy.co.id', 'Indonesia', 'Jakarta', 'Oil & Gas', '5000000000', '9000', 'Owner-operator', 'N', 'Y', '', '', '', '', 'Legitimate interest', 'N', A],
  ['Linh', 'Nguyen', 'Process Control Engineer', 'Engineer', 'linh.nguyen@lotuschem.vn', 'Y', '', 'Lotus Chemicals', 'lotuschem.vn', 'Vietnam', 'Ho Chi Minh City', 'Specialty Chemicals', '', '700', 'Owner-operator', 'N', 'N', 'Lotus Binh Duong Plant', 'Specialty chemicals, batch', '20000', 'tonnes/year', 'Legitimate interest', 'N', B],
  ['Tom', 'Barker', 'Control Systems Lead', 'Manager', 'tom.barker@pacificrimfuels.com.au', 'Y', li('tom-barker'), 'Pacific Rim Fuels', 'pacificrimfuels.com.au', 'Australia', 'Brisbane', 'Refining', '1800000000', '2600', 'Owner-operator', 'N', 'N', 'Brisbane Refinery', 'Crude refining', '110000', 'barrels/day', 'Legitimate interest', 'N', A],
  ['Dewi', 'Lestari', 'Head of Instrumentation', 'Director', 'dewi.lestari@sundarefining.co.id', 'Y', li('dewi-lestari'), 'Sunda Refining', 'sundarefining.co.id', 'Indonesia', 'Cilacap', 'Refining', '1200000000', '1900', 'Owner-operator', 'Y', 'N', 'Cilacap Refinery', 'Crude refining', '120000', 'barrels/day', 'Existing customer', 'N', A],
  ['Quang', 'Tran', 'Managing Director', 'C-level', 'quang.tran@mekongps.vn', 'Y', li('quang-tran'), 'Mekong Process Systems', 'mekongps.vn', 'Vietnam', 'Hanoi', 'Industrial automation', '', '300', 'System integrator', 'N', 'N', '', '', '', '', 'Legitimate interest', 'N', B],
  ['Anong', 'Chai', 'Head of Instrumentation', 'Director', 'anong.chai@andamanpetroleum.co.th', 'Y', li('anong-chai'), ...AP, 'Existing customer', 'N', A],
  ['Niran', 'Suk', 'Reliability Engineer', 'Engineer', 'niran.suk@andamanpetroleum.co.th', 'Y', li('niran-suk'), ...AP, 'Existing customer', 'N', A],
  ['Aisha', 'Rahman', 'Plant Manager', 'Director', 'aisha.rahman@palmdelta.com.my', 'Y', li('aisha-rahman'), 'Palm Delta Oleochem', 'palmdelta.com.my', 'Malaysia', 'Port Klang', 'Oleochemicals', '', '900', 'Owner-operator', 'N', 'N', '', '', '', '', 'Legitimate interest', 'Y', B],
  ['Rizal', 'Hamid', 'Head of Instrumentation', 'Director', 'rizal.hamid@borneogas.com.my', 'Y', li('rizal-hamid'), ...BG, 'Legitimate interest', 'N', B],
  ['Rizal', 'Hamid', 'Head of Instrumentation', 'Director', 'rizal.hamid@borneogas.com.my', 'Y', li('rizal-hamid'), ...BG, 'Legitimate interest', 'N', B],
];

export const SIGNALS: Grid = [
  ['Signal template: one row per signal event · * = required'],
  ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product'],
  ['Northwind Refining', 'aditi.rao@northwindrefining.com', 'Capital project', '2026-09-01', 'New crude unit at front-end engineering design stage; control-system decision due Q2 2027', 'Account plan', ''],
  ['Northwind Refining', 'wei.lim@northwindrefining.com', 'Leadership change', '2026-07-15', 'Wei Lim took over as plant manager in July', 'Customer meeting notes', ''],
  ['Northwind Refining', 'wei.lim@northwindrefining.com', 'Webinar attended', '2026-09-10', 'Modernising legacy control systems', 'Event platform export', ''],
  ['Northwind Refining', 'aditi.rao@northwindrefining.com', 'Email clicked', '2026-09-05', 'Clicked "Migration planning guide"', 'Campaign tool export', ''],
  ['Northwind Refining', 'aditi.rao@northwindrefining.com', 'Inquiry or RFQ', '2026-09-18', 'Asked about migrating a legacy control system during the 2027 turnaround', 'CRM leads', ''],
  ['Meridian Petrochem', 'hassan.idris@meridianpetro.com', 'Installed system near end of support', '2026-09-30', 'Control system X R5 at Pasir Gudang reaches end of support', 'Installed base', 'Control system X R5'],
  ['Meridian Petrochem', li('farah-aziz'), 'Content download', '2026-08-28', 'Case study: refinery migration in one shutdown', 'Marketing automation', ''],
  ['Meridian Petrochem', li('farah-aziz'), 'Service contract renewal', '2026-09-30', 'Lifecycle service contract ends 31 Dec 2026', 'Service records', ''],
  ['Coral Bay Refinery', 'maria.santos@coralbayrefinery.com', 'Webinar registered', '2026-09-20', 'Cybersecurity for refinery control systems', 'Event platform export', ''],
  ['Coral Bay Refinery', 'maria.santos@coralbayrefinery.com', 'Webinar registered', '2026-09-20', 'Cybersecurity for refinery control systems', 'Event platform export', ''],
  ['Coral Bay Refinery', '', 'Capital project', '2026-06-10', 'Hydrotreater revamp announced; front-end design under way', 'Account plan', ''],
  ['Sunda Refining', 'dewi.lestari@sundarefining.co.id', 'Installed system (current)', '2026-09-30', 'Control system X R7 running at Cilacap', 'Installed base', 'Control system X R7'],
  ['Andaman Petroleum', 'anong.chai@andamanpetroleum.co.th', 'Installed system near end of support', '2026-09-30', 'Control system X R4 at Map Ta Phut reaches end of support in 2027', 'Installed base', 'Control system X R4'],
  ['Andaman Petroleum', 'anong.chai@andamanpetroleum.co.th', 'Email clicked', '2026-09-12', 'Clicked "Lifecycle services overview"', 'Campaign tool export', ''],
  ['Lotus Chemicals', 'linh.nguyen@lotuschem.vn', 'Newsletter sign-up', '2026-09-02', 'Subscribed to the process automation newsletter', 'Marketing automation', ''],
  ['Lotus Chemicals', 'linh.nguyen@lotuschem.vn', 'Leadership change', '2025-11-02', 'New plant director appointed', 'Customer meeting notes', ''],
  ['Borneo Gas Processing', 'rizal.hamid@borneogas.com.my', 'Content download', '2026-09-15', 'Whitepaper: gas plant control modernisation', 'Marketing automation', ''],
  ['Borneo Gas Processing', 'rizal.hamid@borneogas.com.my', 'Capital project', '', 'Train 2 expansion under study', 'Account plan', ''],
  ['Harbourline EPC', 'somchai.w@harbourline-epc.com', 'Inquiry or RFQ', '2026-09-02', 'Asked for a quote on a control package for a client project', 'CRM leads', ''],
  ['Northwind Refining', 'k.tan@northwindrefining.com', 'Webinar attended', '2026-09-10', 'Modernising legacy control systems', 'Event platform export', ''],
  ['Kestrel Marine Services', 'ops@kestrelmarine.com', 'Capital project', '2026-09-01', 'New vessel maintenance yard', 'Account plan', ''],
];

/* ─── Micro-segments & NBA: one test scenario set ───
   Twelve fictional accounts, each built to trigger specific rules, in the micro-segment CSV format (one row per
   signal). Dates are days before the "as of" date, so the set works on any day. */
export const NBA_COLUMNS = ['first_name', 'last_name', 'job_title', 'email', 'email_verified', 'linkedin_url', 'company_name', 'industry',
  'country', 'existing_customer', 'consent_basis', 'score', 'signal_type', 'event_date', 'detail', 'source', 'owner_email',
  'annual_revenue_usd', 'employee_count', 'account_type'];
const RA = 'rep.a@client-sample.com', RB = 'rep.b@client-sample.com';
type ScenarioCompany = { name: string; industry: string; country: string; existing: string; revenue: string; employees: string; owner: string };
const co = (name: string, industry: string, country: string, existing: string, revenue: string, employees: string, owner: string): ScenarioCompany => ({ name, industry, country, existing, revenue, employees, owner });
const AURORA = co('Aurora Refining', 'Refining', 'Thailand', 'Y', '2100000000', '4200', RA);
const BLUEWATER = co('Bluewater Refinery', 'Refining', 'Philippines', 'N', '900000000', '2300', RB);
const CEDAR = co('Cedar Petrochemicals', 'Petrochemicals', 'Malaysia', 'Y', '1200000000', '2600', RA);
const DELTA = co('Delta Coast Refining', 'Refining', 'Vietnam', 'Y', '650000000', '1500', RB);
const EASTGATE = co('Eastgate Refinery', 'Refining', 'Indonesia', 'N', '1500000000', '3000', RA);
const FERNHILL = co('Fernhill Refining', 'Refining', 'Singapore', 'N', '2800000000', '5100', RA);
const GRANITE = co('Granite Gas Processing', 'Gas processing', 'Malaysia', 'N', '120000000', '400', RB);
const HARBOR = co('Harbor Point Refinery', 'Refining', 'Thailand', 'N', '1100000000', '2500', RA);
const IRONWOOD = co('Ironwood Refining', 'Refining', 'Philippines', 'Y', '1300000000', '2700', RA);
const JUNIPER = co('Juniper Petrochem', 'Petrochemicals', 'Indonesia', 'Y', '1700000000', '3300', RB);
const KINGFISHER = co('Kingfisher Refining', 'Refining', 'Vietnam', 'N', '800000000', '1900', RA);
const LANTERN = co('Lantern Petrochemicals', 'Petrochemicals', 'Thailand', 'N', '1400000000', '2900', RB);
// person: [first, last, title, email, verified, linkedin, consent, score]
type ScenarioSignal = { c: ScenarioCompany; p: string[]; type: string; ago: number | string; detail: string; source: string };
const sig = (c: ScenarioCompany, p: string[], type: string, ago: number | string, detail: string, source: string): ScenarioSignal => ({ c, p, type, ago, detail, source });
const P: Record<string, string[]> = {
  auroraHead:   ['Niran', 'Wattana', 'Head of Instrumentation', 'niran.w@aurora-refining.example', 'Y', '', 'Existing customer', '78'],
  auroraPlant:  ['Ploy', 'Siri', 'Plant Manager', 'ploy.s@aurora-refining.example', 'Y', '', 'Existing customer', ''],
  bluewater:    ['Carlo', 'Reyes', 'I&C Manager', 'carlo.reyes@bluewater.example', 'Y', 'https://www.linkedin.com/in/carlo-reyes-sample', 'Legitimate interest', '64'],
  cedar:        ['Mei', 'Tan', 'Procurement Lead', '', '', '', 'Existing customer', ''],
  delta:        ['Bao', 'Tran', 'Head of Automation', 'bao.tran@deltacoast.example', 'Y', '', 'Existing customer', '55'],
  eastgate:     ['Dian', 'Putri', 'I&C Manager', 'dian.putri@eastgate.example', 'N', 'https://www.linkedin.com/in/dian-putri-sample', 'Legitimate interest', ''],
  fernhill:     ['Wei', 'Chen', 'Control Systems Lead', 'wei.chen@fernhill.example', 'Y', '', 'Legitimate interest', '71'],
  granite:      ['Hafiz', 'Rahman', 'Control Systems Lead', 'hafiz.r@granitegas.example', 'Y', '', 'Legitimate interest', 'high'],
  harbor:       ['Somsak', 'Chai', 'Head of Instrumentation', 'somsak.c@harborpoint.example', 'Y', '', 'Legitimate interest', '82'],
  ironwood:     ['Ana', 'Cruz', 'Automation Manager', 'ana.cruz@ironwood.example', 'Y', '', 'Existing customer', '80'],
  juniper:      ['Budi', 'Hartono', 'DCS Engineer', '', '', '', 'Existing customer', '67'],
  kingfisher:   ['Linh', 'Pham', 'Head of Instrumentation', 'linh.pham@kingfisher.example', 'Y', '', 'Legitimate interest', ''],
  lantern:      ['Kanya', 'Boon', 'Automation Manager', 'kanya.b@lantern.example', 'Y', '', '', '58'],
};
const NBA_SIGNALS = [
  sig(AURORA, P.auroraHead, 'Installed system near end of support', 10, 'Control system X R4 at the Map Ta Phut site reaches end of support next year', 'Installed base'),
  sig(AURORA, P.auroraPlant, 'Webinar attended', 12, 'Modernising legacy control systems', 'Event platform export'),
  sig(AURORA, P.auroraHead, 'Trade show visit', 8, 'Visited the stand', 'Events team'),
  sig(BLUEWATER, P.bluewater, 'Installed system near end of support', 15, 'Control system X R5 reaches end of support in 2027', 'Installed base'),
  sig(BLUEWATER, P.bluewater, 'Installed system near end of support', 15, 'Control system X R5 reaches end of support in 2027', 'Installed base'),
  sig(CEDAR, P.cedar, 'Installed system near end of support', 20, 'Control system X R3 at the Johor plant reaches end of support', 'Installed base'),
  sig(DELTA, P.delta, 'Service contract renewal', 5, 'Lifecycle service contract ends in three months', 'Service records'),
  sig(DELTA, P.delta, 'Content download', 60, 'Case study: refinery migration in one shutdown', 'Marketing automation'),
  sig(EASTGATE, P.eastgate, 'Webinar attended', 10, 'Alarm management for refineries', 'Event platform export'),
  sig(EASTGATE, P.eastgate, 'Email clicked', 90, 'Clicked "Spring newsletter"', 'Campaign tool export'),
  sig(FERNHILL, P.fernhill, 'Content download', 10, 'Pricing guide for control system upgrades', 'Marketing automation'),
  sig(FERNHILL, P.fernhill, 'Newsletter sign-up', 9, 'Subscribed to the automation newsletter', 'Marketing automation'),
  sig(GRANITE, P.granite, 'Webinar attended', 8, 'Gas plant control modernisation', 'Event platform export'),
  sig(HARBOR, P.harbor, 'Inquiry or RFQ', 4, 'Asked about upgrading the crude unit controls during the next shutdown', 'CRM leads'),
  sig(HARBOR, P.harbor, 'Webinar attended', 30, 'Modernising legacy control systems', 'Event platform export'),
  sig(HARBOR, P.harbor, 'Capital project', 'not a date', 'Hydrotreater revamp', 'Account plan'),
  sig(IRONWOOD, P.ironwood, 'Inquiry or RFQ', 3, 'Asked about control options after the compressor incident in August', 'CRM leads'),
  sig(JUNIPER, P.juniper, 'Inquiry or RFQ', 6, 'Asked for a technical call on batch control', 'CRM leads'),
  sig(KINGFISHER, P.kingfisher, 'Leadership change', 10, 'A new plant director took over in September', 'Customer meeting notes'),
  sig(LANTERN, P.lantern, 'Capital project', 20, 'New aromatics unit at front-end design', 'Account plan'),
];
function isoMinus(asOf: string, days: number): string { const d = new Date(asOf + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); }
/** The scenario set as a micro-segment file, dated relative to `asOf` so it works on any day. */
export function nbaScenarioGrid(asOf: string): Grid {
  return [NBA_COLUMNS].concat(NBA_SIGNALS.map(x => {
    const [first, last, title, email, verified, linkedin, consent, score] = x.p;
    return [first, last, title, email, verified, linkedin, x.c.name, x.c.industry, x.c.country, x.c.existing, consent, score,
      x.type, typeof x.ago === 'number' ? isoMinus(asOf, x.ago) : x.ago, x.detail, x.source, x.c.owner, x.c.revenue, x.c.employees, 'Owner-operator'];
  }));
}
// A pilot week in progress: the same accounts, two of them now mentioning a security audit or an emissions regulation,
// so more items carry sensitive content. Micro-segments & NBA applies a few decisions on top (see seedWeek there).
export function nbaWeekGrid(asOf: string): Grid {
  const g = nbaScenarioGrid(asOf), co = g[0].indexOf('company_name'), det = g[0].indexOf('detail');
  // Sensitive wording on a few more accounts, so the pilot week has a real list of approvals for the sales manager.
  const extra: Record<string, string> = { 'Granite Gas Processing':' ahead of the site security audit', 'Lantern Petrochemicals':' to meet the new emissions regulation',
    'Bluewater Refinery':' after a cyber security review', 'Delta Coast Refining':' following a compliance finding', 'Fernhill Refining':' after a near-miss incident' };
  return g.map((row, i) => i && extra[String(row[co])] ? row.map((v, j) => j === det ? String(v).replace(/\.?$/, '') + extra[String(row[co])] : v) : row);
}

export const LEAD_FILE = 'lead_file.csv';
export const SIGNAL_FILE = 'signal_file.csv';

export const NBA_SCENARIO_FILE = 'nba_test_scenarios.csv';

/** The sample as one object, the shape the original exposed as window.DemandAISample. */
export const DemandAISample = { SAMPLE_AS_OF, LEADS, SIGNALS, LEAD_FILE, SIGNAL_FILE, NBA_COLUMNS, nbaScenarioGrid, nbaWeekGrid, NBA_SCENARIO_FILE };
export default DemandAISample;
