/* Sandbox sample data: the fictional D1 lead sample and D2 signal sample from the templates.
   Fictional companies and people only. Never mixed with customer data: lists built from it
   are marked sandbox, and Scoring only accepts the sample signals for a sandbox list. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DemandAISample = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const SAMPLE_AS_OF = '2026-09-30';

const H = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url', 'company_name',
  'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count', 'account_type', 'existing_customer',
  'managed_separately', 'site_name', 'site_process_type', 'site_capacity', 'capacity_unit', 'consent_basis', 'opt_out', 'owner_email'];
const li = slug => `https://www.linkedin.com/in/${slug}-sample`;
const A = 'rep.a@client-sample.com', B = 'rep.b@client-sample.com';
const NW = ['Northwind Refining', 'northwindrefining.com', 'Singapore', 'Singapore', 'Oil & Gas - Refining', '2400000000', '3800', 'Owner-operator', 'N', 'N', 'Jurong Refinery', 'Crude refining', '140000', 'barrels/day'];
const MP = ['Meridian Petrochem', 'meridianpetro.com', 'Malaysia', 'Johor', 'Petrochemicals', '850000000', '1600', 'Owner-operator', 'Y', 'N', 'Pasir Gudang Plant', 'Petrochemicals, continuous', '180000', 'tonnes/year'];
const CB = ['Coral Bay Refinery', 'coralbayrefinery.com', 'Philippines', 'Bataan', 'Refining', '', '2200', 'Owner-operator', 'N', 'N', 'Bataan Refinery', 'Crude refining', '180000', 'barrels/day'];
const AP = ['Andaman Petroleum', 'andamanpetroleum.co.th', 'Thailand', 'Rayong', 'Oil & Gas - Refining', '1500000000', '3100', 'Owner-operator', 'Y', 'N', 'Map Ta Phut Refinery', 'Crude refining', '145000', 'barrels/day'];
const BG = ['Borneo Gas Processing', 'borneogas.com.my', 'Malaysia', 'Bintulu', 'Gas processing', '700000000', '1400', 'Owner-operator', 'N', 'N', 'Bintulu Gas Plant', 'Gas processing', '1200', 'MMscfd'];

const LEADS = [
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

const SIGNALS = [
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

return { SAMPLE_AS_OF, LEADS, SIGNALS, LEAD_FILE: 'lead_file.csv', SIGNAL_FILE: 'signal_file.csv' };
});
