/* Demand AI prototype: seed generator.
   Writes seed/*.json and seed/seed.js (the same data as one script, so the app also opens from disk).
   Deterministic: the same run always gives the same demo. Every company and person is invented.
   Run: node prototype/tools/gen-seed.cjs */
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
const CFG = require('../js/config.js');

const OUT = path.join(__dirname, '..', 'seed');
const SRC = path.join(__dirname, 'source');
const NOW = new Date(CFG.baseNow);
const DAY = E.DAY;

/* ─── Deterministic random ─── */
let seedN = 20261118;
const rnd = () => { seedN |= 0; seedN = seedN + 0x6D2B79F5 | 0; let t = Math.imul(seedN ^ seedN >>> 15, 1 | seedN); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const iso = d => new Date(d).toISOString().slice(0, 10);
const ago = d => iso(NOW.getTime() - d * DAY);
const agoTs = (d, h = 9) => { const t = new Date(NOW.getTime() - d * DAY); t.setHours(h, 0, 0, 0); return t.toISOString().slice(0, 19); };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ─── CSV ─── */
function csv(file) {
  const txt = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\r/g, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"' && txt[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

/* ─── People ─── */
const USERS = {
  sofia: { id: 'sofia', name: 'Sofia Ahlgren', role: 'rep', title: 'Sales rep · UK, Ireland and Nordics', color: '#0094DA', territory: ['UK & Ireland', 'Nordics'] },
  marco: { id: 'marco', name: 'Marco Lindqvist', role: 'rep', title: 'Sales rep · Benelux', color: '#2E8B57', territory: ['Benelux'] },
  aisha: { id: 'aisha', name: 'Aisha Rahman', role: 'rep', title: 'Sales rep · Middle East and South East Asia', color: '#C2410C', territory: ['Middle East', 'South East Asia'] },
  kenji: { id: 'kenji', name: 'Kenji Mori', role: 'rep', title: 'Sales rep · DACH', color: '#B42318', territory: ['DACH'] },
  daniel: { id: 'daniel', name: 'Daniel Brooks', role: 'manager', title: 'Sales manager', color: '#7D52A2' },
  helen: { id: 'helen', name: 'Helen Varga', role: 'leader', title: 'Sales leader', color: '#191020' },
  rajiv: { id: 'rajiv', name: 'Rajiv Nair', role: 'admin', title: 'Admin (RevOps)', color: '#5E3A80' }
};
const TENANT = { id: 't-vantor', name: 'Vantor Controls', note: 'The seller using Demand AI (invented). Sells control-system modernisation and safety systems to process plants.' };
const REGION_REP = { 'UK & Ireland': 'sofia', Nordics: 'sofia', Benelux: 'marco', 'Middle East': 'aisha', 'South East Asia': 'aisha', DACH: 'kenji' };
const COUNTRY = { 'UK & Ireland': ['United Kingdom', 'Ireland'], Nordics: ['Norway', 'Sweden', 'Denmark', 'Finland'], Benelux: ['Netherlands', 'Belgium'], DACH: ['Germany', 'Austria', 'Switzerland'], 'Middle East': ['United Arab Emirates', 'Oman', 'Qatar'], 'South East Asia': ['Singapore', 'Malaysia', 'Thailand'] };

/* ─── ICP ─── */
const ICP = {
  version: 'ICP v3 · confirmed 4 Nov 2026', status: 'confirmed', path: 'A',
  text: 'We modernise control and safety systems for refineries, petrochemical complexes, LNG terminals and gas processing plants in the UK and Ireland, the Nordics, Benelux and DACH. Best fit: 500 to 10,000 staff, a control system older than 12 years, two or more sites.',
  criteria: [
    { label: 'Niche (plant type)', attr: 'niche', type: 'in', values: ['Refinery', 'Petrochemical complex', 'LNG terminal', 'Gas processing plant', 'Specialty chemicals plant'], partial: ['Tank storage terminal', 'Hydrogen project', 'Power station'], weight: 30, key: true },
    { label: 'Region', attr: 'region', type: 'in', values: ['UK & Ireland', 'Nordics', 'Benelux', 'DACH'], partial: ['Middle East', 'South East Asia'], weight: 15, key: true },
    { label: 'Staff', attr: 'employees', type: 'range', min: 500, max: 10000, weight: 15 },
    { label: 'Control system age (years)', attr: 'controlAge', type: 'min', min: 12, weight: 25, key: true },
    { label: 'Sites', attr: 'sites', type: 'min', min: 2, weight: 15 }
  ],
  closedWon: { field: null, value: null, note: 'Not set yet: the CRM field and value that mean closed-won' },
  weightsSource: 'Category research (reference set, 4 Nov 2026)'
};
const ICP_PROPOSAL = {
  website: 'vantor-controls.example',
  read: ['Products: distributed control systems, safety instrumented systems, migration services', 'Industries served: refining, petrochemicals, LNG, gas processing, water', 'Case studies: 6, all brownfield migrations at sites with 1,000+ staff'],
  interview: ['Who signs off a migration? Usually the plant director with the head of automation.', 'What triggers a project? A turnaround, a new plant head, or end-of-support on the old system.'],
  criteria: [
    { label: 'Niche (plant type)', attr: 'niche', type: 'in', values: ['Refinery', 'Petrochemical complex', 'LNG terminal', 'Gas processing plant'], partial: ['Water treatment works', 'Specialty chemicals plant'], weight: 30, key: true },
    { label: 'Region', attr: 'region', type: 'in', values: ['UK & Ireland', 'Nordics', 'Benelux', 'DACH'], partial: [], weight: 15, key: true },
    { label: 'Staff', attr: 'employees', type: 'range', min: 1000, max: 10000, weight: 20 },
    { label: 'Control system age (years)', attr: 'controlAge', type: 'min', min: 10, weight: 25, key: true },
    { label: 'Sites', attr: 'sites', type: 'min', min: 1, weight: 10 }
  ]
};

/* ─── Accounts ─── */
const NICHE_SUFFIX = { Refinery: ['Refining', 'Refinery'], 'Petrochemical complex': ['Petrochemicals', 'Olefins'], 'LNG terminal': ['LNG', 'Gas Terminal'], 'Gas processing plant': ['Gas Processing', 'Midstream'], 'Specialty chemicals plant': ['Chemicals', 'Speciality Chemicals'], 'Tank storage terminal': ['Terminals', 'Storage'], 'Hydrogen project': ['Hydrogen', 'Green Hydrogen'], 'Power station': ['Power', 'Energy'], 'Water treatment works': ['Water', 'Water Services'], 'Offshore platform': ['Offshore', 'Subsea'] };
const PREFIX = ['Northgate', 'Ashby', 'Corrin', 'Westmere', 'Brackley', 'Fenwick', 'Larchmont', 'Morrow', 'Penhallow', 'Quarrybank', 'Saltire', 'Ullswater', 'Vexford', 'Yarrow', 'Aldermoor', 'Birchfield', 'Caldbeck', 'Dunmore', 'Elsworth', 'Farrowdale', 'Harcastle', 'Ingleby', 'Juniper Point', 'Kingsmere', 'Lowther', 'Marlow Bay', 'Norland', 'Oakhurst', 'Pellworth', 'Redcliffe', 'Silverdale', 'Tarnbrook', 'Upwood', 'Varney', 'Wexcombe', 'Arden', 'Bramwell', 'Coldharbour', 'Deverell', 'Eastwick', 'Fallowfield', 'Greyhaven', 'Holloway', 'Ironbridge', 'Jarrow', 'Kestrel', 'Langholm', 'Merrow', 'Nethercott', 'Orwell', 'Pembury', 'Rushmere', 'Stoneleigh', 'Thorne', 'Ulverston', 'Vale', 'Whitlock', 'Ainsley', 'Bexmoor', 'Castleford', 'Driftwood', 'Edgecombe', 'Fernhill', 'Glenmoor', 'Hartwell', 'Ivydale', 'Kirkby', 'Linton', 'Maddox', 'Newhaven', 'Ormsby', 'Prestwick', 'Rookwood', 'Sedgemoor', 'Trent Vale', 'Underhill', 'Wardle', 'Amberley', 'Blackwater', 'Carrick', 'Dalton', 'Eskdale', 'Foxley', 'Gilling', 'Hexley', 'Ingram', 'Knowle', 'Leyburn', 'Mallory', 'Netherby', 'Otterburn', 'Penrose', 'Ravenscar', 'Skelton', 'Tolland', 'Wyvern', 'Brightwell', 'Harrowgate', 'Halden', 'Ravensworth', 'Thornbury', 'Mistral', 'Calloway', 'Fairhaven', 'Glaston', 'Hollins', 'Lindale', 'Mereford', 'Norcross', 'Pinewood', 'Quillon', 'Ribston'];
const used = new Set();
function makeName(prefix, niche) { let n = prefix + ' ' + pick(NICHE_SUFFIX[niche]); if (used.has(n)) n = prefix + ' ' + NICHE_SUFFIX[niche][0] + ' Group'; used.add(n); return n; }
const freePrefixes = PREFIX.filter(p => !['Brightwell', 'Harrowgate', 'Halden', 'Ravensworth', 'Thornbury', 'Mistral', 'Kestrel', 'Whitlock', 'Caldbeck', 'Saltire', 'Ingleby', 'Glenmoor', 'Oakhurst', 'Pellworth', 'Upwood', 'Varney', 'Elsworth', 'Dunmore', 'Fenwick', 'Northgate'].includes(p));
let pi = 0; const nextPrefix = () => freePrefixes[pi++ % freePrefixes.length];

const accounts = [];
function addAccount(o) {
  const region = o.region, owner = o.owner || REGION_REP[region];
  const a = {
    id: o.id || 'a' + String(accounts.length + 1).padStart(3, '0'),
    name: o.name || makeName(nextPrefix(), o.niche),
    niche: o.niche === undefined ? null : o.niche, nicheConfidence: o.nicheConfidence != null ? o.nicheConfidence : Number((0.75 + rnd() * 0.24).toFixed(2)),
    region, country: o.country || pick(COUNTRY[region]), owner,
    attributes: Object.assign({ niche: o.niche, region, employees: o.employees || pick([700, 1200, 1800, 2400, 3500, 4800, 6200, 8500, 320, 12500]), controlAge: o.controlAge !== undefined ? o.controlAge : int(6, 22), sites: o.sites || int(1, 5) }, o.attrs || {}),
    crm: o.crm || {}, description: o.description || '', scenario: o.scenario || null, segmentPolicy: null
  };
  if (o.niche) used.add(a.name);
  a.domain = slug(a.name) + '.example';
  accounts.push(a); return a;
}

/* Scenario accounts first, so their ids are stable. */
const SC = {};
SC.ready = addAccount({ id: 'harrowgate', name: 'Harrowgate Refining', niche: 'Refinery', region: 'UK & Ireland', country: 'United Kingdom', employees: 2400, controlAge: 18, sites: 3, scenario: 3, description: 'Coastal refinery, 210,000 barrels a day, control system installed 2008.' });
SC.idcard = addAccount({ id: 'halden', name: 'Halden Process Systems', niche: 'Specialty chemicals plant', region: 'UK & Ireland', country: 'United Kingdom', employees: 1800, controlAge: 16, sites: 2, scenario: 4, description: 'Speciality chemicals producer, two sites in the north of England.' });
SC.customer = addAccount({ id: 'brightwell', name: 'Brightwell Chemicals', niche: 'Petrochemical complex', region: 'UK & Ireland', country: 'United Kingdom', employees: 4800, controlAge: 15, sites: 4, scenario: 5, crm: { status: 'Customer', since: '2023-03-14', field: 'Stage = Closed won' }, description: 'Existing customer (closed won, 2023).' });
SC.linkedin = addAccount({ id: 'kestrel', name: 'Kestrel Gas Processing', niche: 'Gas processing plant', region: 'Nordics', country: 'Norway', employees: 1200, controlAge: 17, sites: 2, scenario: 8 });
SC.optout = addAccount({ id: 'fenwick', name: 'Fenwick Refining', niche: 'Refinery', region: 'Nordics', country: 'Sweden', employees: 3500, controlAge: 19, sites: 2, scenario: 9 });
SC.timeout = addAccount({ id: 'caldbeck', name: 'Caldbeck Petrochemicals', niche: 'Petrochemical complex', region: 'UK & Ireland', country: 'United Kingdom', employees: 6200, controlAge: 14, sites: 3, scenario: 10 });
SC.recent = addAccount({ id: 'whitlock', name: 'Whitlock Refining', niche: 'Refinery', region: 'UK & Ireland', country: 'Ireland', employees: 1800, controlAge: 20, sites: 2 });
SC.verify = addAccount({ id: 'ravensworth', name: 'Ravensworth Chemicals', niche: 'Specialty chemicals plant', region: 'Nordics', country: 'Denmark', employees: 2400, controlAge: 13, sites: 3 });
SC.policy = addAccount({ id: 'saltire', name: 'Saltire Hydrogen', niche: 'Hydrogen project', region: 'UK & Ireland', country: 'United Kingdom', employees: 900, controlAge: 14, sites: 2 });
SC.nodraft = addAccount({ id: 'thornbury', name: 'Thornbury Power', niche: 'Power station', region: 'UK & Ireland', country: 'United Kingdom', employees: 1200, controlAge: 21, sites: 2 });
SC.nochannel = addAccount({ id: 'ingleby', name: 'Ingleby Terminals', niche: 'Tank storage terminal', region: 'Nordics', country: 'Finland', employees: 800, controlAge: 16, sites: 3 });
SC.i4 = addAccount({ id: 'glenmoor', name: 'Glenmoor Gas Processing', niche: 'Gas processing plant', region: 'UK & Ireland', country: 'United Kingdom', employees: 1200, controlAge: 15, sites: 2 });
SC.niche = addAccount({ id: 'oakhurst', name: 'Oakhurst Industrial', niche: null, nicheConfidence: 0.41, region: 'UK & Ireland', country: 'United Kingdom', employees: 1800, controlAge: 17, sites: 2, attrs: { niche: 'Refinery' }, description: 'Website describes "industrial services"; the classifier could not tell the plant type.' });
SC.missing = addAccount({ id: 'pellworth', name: 'Pellworth Energy', niche: 'Gas processing plant', region: 'Nordics', country: 'Norway', employees: 2400, controlAge: null, sites: 2, description: 'Control system age not found in any source.' });
SC.opendeal = addAccount({ id: 'upwood', name: 'Upwood Refining', niche: 'Refinery', region: 'Benelux', country: 'Netherlands', employees: 3500, controlAge: 18, sites: 2, crm: { openDeal: { name: 'Upwood DCS migration phase 1', stage: 'Proposal', owner: 'marco', value: 'GBP 1.4M' } } });
SC.champOld = addAccount({ id: 'varney', name: 'Varney Chemicals', niche: 'Specialty chemicals plant', region: 'Benelux', country: 'Belgium', employees: 1800, controlAge: 14, sites: 2 });
SC.champNew = addAccount({ id: 'elsworth', name: 'Elsworth Refining', niche: 'Refinery', region: 'Benelux', country: 'Netherlands', employees: 2400, controlAge: 17, sites: 3 });
SC.nameonly = addAccount({ id: 'dunmore', name: 'Dunmore Chemicals', niche: 'Specialty chemicals plant', region: 'DACH', country: 'Germany', employees: 1200, controlAge: 15, sites: 2, crm: { nameOnlyMatch: 'Dunmore Chemical Holdings (no domain on the CRM record)' } });

/* The campaign group: 11 LNG terminals with the same compliance deadline inside 7 days. */
const LNG_OWNERS = ['sofia', 'sofia', 'sofia', 'marco', 'marco', 'marco', 'aisha', 'aisha', 'aisha', 'kenji', 'kenji'];
const LNG_REGION = { sofia: 'UK & Ireland', marco: 'Benelux', aisha: 'Middle East', kenji: 'DACH' };
const lng = LNG_OWNERS.map((o, i) => addAccount({ id: i === 0 ? 'northgate' : undefined, name: i === 0 ? 'Northgate Terminals' : undefined, niche: 'LNG terminal', region: LNG_REGION[o], owner: o, employees: pick([900, 1400, 2100, 2800]), controlAge: int(13, 20), sites: int(2, 3), scenario: 6 }));
/* Nine refineries with a hiring surge in the same 7 days: one short of the threshold, so no flag. */
const REF_REGIONS = ['Benelux', 'DACH', 'Middle East', 'South East Asia', 'DACH', 'Benelux', 'Middle East', 'DACH', 'South East Asia'];
const nine = REF_REGIONS.map(r => addAccount({ niche: 'Refinery', region: r, employees: pick([1200, 2400, 3500]), controlAge: int(12, 19), sites: int(1, 3) }));

/* The rest of the list. */
const NICHES = ['Refinery', 'Petrochemical complex', 'LNG terminal', 'Gas processing plant', 'Specialty chemicals plant', 'Tank storage terminal', 'Power station', 'Water treatment works', 'Hydrogen project', 'Offshore platform'];
const REGIONS = Object.keys(REGION_REP);
const regionWeights = ['UK & Ireland', 'UK & Ireland', 'Nordics', 'Benelux', 'Benelux', 'DACH', 'DACH', 'Middle East', 'South East Asia'];
while (accounts.length < 100) addAccount({ niche: pick(NICHES.filter(n => n !== 'LNG terminal')), region: pick(regionWeights) });
/* Sofia keeps a reasonable territory: move two UK accounts so each rep owns a share. */

/* ─── Contacts ─── */
const FIRST = ['James', 'Anna', 'Lars', 'Emma', 'Pieter', 'Sara', 'Tom', 'Nadia', 'Jonas', 'Claire', 'Henrik', 'Laura', 'Matthias', 'Fiona', 'Omar', 'Mei', 'Rahul', 'Ingrid', 'Paul', 'Elena', 'Sean', 'Katrin', 'David', 'Leila', 'Erik', 'Hannah', 'Felix', 'Grace', 'Yusuf', 'Siti', 'Niall', 'Annika', 'Ruben', 'Chloe', 'Tariq', 'Wei', 'Oliver', 'Maja', 'Karim', 'Joanna'];
const LAST = ['Carter', 'Lindgren', 'de Vries', 'Hughes', 'Becker', 'Nilsen', 'Walsh', 'Haddad', 'Janssen', 'Murphy', 'Schmidt', 'Okafor', 'Tan', 'Lim', 'Kaur', 'Berg', 'Moreau', 'Doyle', 'Fischer', 'Hassan', 'Holm', 'Peeters', 'Brennan', 'Wagner', 'Rahman', 'Chen', 'Andersen', 'Kelly', 'Vogel', 'Ismail'];
const TITLES = {
  buyer: ['Plant Director', 'Site Director', 'VP Engineering', 'Chief Operating Officer', 'Head of Capital Projects'],
  'technical lead': ['Head of Automation', 'Control Systems Lead', 'Principal Instrument Engineer', 'DCS Engineering Manager'],
  operations: ['Operations Manager', 'Maintenance Manager', 'Reliability Manager', 'Shift Operations Lead'],
  procurement: ['Procurement Manager', 'Category Manager, Automation', 'Head of Procurement']
};
/* Persona from the title: rules first; an unknown title gets a generic persona and a flag. */
const PERSONA_RULES = [[/director|vp |chief|head of capital/i, 'buyer'], [/automation|control systems|instrument|dcs/i, 'technical lead'], [/operations|maintenance|reliability/i, 'operations'], [/procurement|category manager/i, 'procurement']];
const personaOf = t => { for (const [re, p] of PERSONA_RULES) if (re.test(t)) return { persona: p, flagged: false }; return { persona: 'generic', flagged: true }; };
const FOUND = { I1: 'Apollo, first try', I2: 'ZoomInfo after Apollo missed; Lusha agrees', I3: 'ZoomInfo after Apollo missed; Lusha silent', I4: 'ZoomInfo after Apollo missed; Lusha disagrees', I5: 'Lusha only (single source)' };
const contacts = []; const cUsed = new Set();
function addContact(acc, o) {
  let name = o.name; while (!name || cUsed.has(name + acc.id)) name = pick(FIRST) + ' ' + pick(LAST);
  cUsed.add(name + acc.id);
  const title = o.title || pick(TITLES[o.persona || pick(['buyer', 'technical lead', 'operations', 'procurement', 'buyer', 'technical lead'])]);
  const p = personaOf(title), idt = o.identityTier || pick(['I1', 'I1', 'I1', 'I1', 'I1', 'I2', 'I2', 'I2', 'I3', 'I5']);
  const first = name.split(' ')[0].toLowerCase(), last = name.split(' ').slice(1).join('').toLowerCase().replace(/[^a-z]/g, '');
  const c = {
    id: 'c' + String(contacts.length + 1).padStart(3, '0'), accountId: acc.id, name, title, persona: p.persona, personaFlagged: p.flagged,
    identityTier: idt, foundBy: FOUND[idt], email: o.noEmail ? null : first + '.' + last + '@' + acc.domain, emailVerified: o.noEmail ? false : o.emailVerified !== false,
    linkedin: o.noLinkedin ? null : 'https://www.linkedin.com/in/' + first + '-' + last + '-' + acc.id.slice(0, 4), phone: rnd() > 0.5 ? '+44 20 7946 0' + int(100, 999) : null,
    stale: !!o.stale, staleReason: o.stale || null, heldCycles: o.heldCycles || 0, mergedFrom: o.mergedFrom || null, failedChannels: o.failedChannels || [], enrichedAt: ago(int(10, 60))
  };
  contacts.push(c); return c;
}
/* Scenario contacts. */
addContact(SC.ready, { name: 'Anna Lindgren', title: 'Plant Director', identityTier: 'I1', mergedFrom: [{ field: 'email', source: 'Apollo' }, { field: 'title', source: 'ZoomInfo' }, { field: 'LinkedIn URL', source: 'Apollo (tiebreaker)' }] });
addContact(SC.ready, { name: 'Tom Walsh', title: 'Head of Automation', identityTier: 'I2' });
addContact(SC.idcard, { name: 'Claire Hughes', title: 'VP Engineering', identityTier: 'I3' });
addContact(SC.customer, { name: 'Paul Doyle', title: 'Plant Director', identityTier: 'I1' });
addContact(SC.linkedin, { name: 'Henrik Holm', title: 'Head of Automation', identityTier: 'I1' });
addContact(SC.linkedin, { name: 'Maja Berg', title: 'Maintenance Manager', identityTier: 'I2' });
addContact(SC.optout, { name: 'Ingrid Nilsen', title: 'Site Director', identityTier: 'I1' });
addContact(SC.timeout, { name: 'David Kelly', title: 'Head of Capital Projects', identityTier: 'I2' });
addContact(SC.recent, { name: 'Niall Brennan', title: 'Plant Director', identityTier: 'I1' });
addContact(SC.verify, { name: 'Erik Andersen', title: 'VP Engineering', identityTier: 'I1' });
addContact(SC.policy, { name: 'Fiona Murphy', title: 'Head of Capital Projects', identityTier: 'I1' });
addContact(SC.nodraft, { name: 'Sean Carter', title: 'Plant Director', identityTier: 'I1' });
addContact(SC.nochannel, { name: 'Annika Holm', title: 'Operations Manager', identityTier: 'I2', noEmail: true, noLinkedin: true });
addContact(SC.i4, { name: 'Oliver Hughes', title: 'Plant Director', identityTier: 'I4', heldCycles: 3 });
addContact(SC.niche, { name: 'Laura Walsh', title: 'Transformation Champion', identityTier: 'I1' });
addContact(SC.missing, { name: 'Jonas Berg', title: 'Head of Automation', identityTier: 'I1' });
addContact(SC.opendeal, { name: 'Ruben Janssen', title: 'Plant Director', identityTier: 'I1' });
const champ = addContact(SC.champOld, { name: 'Katrin Peeters', title: 'Head of Automation', identityTier: 'I1', stale: 'Job change: moved to Elsworth Refining on ' + ago(4) });
addContact(SC.champOld, { name: 'Felix Vogel', title: 'Operations Manager', identityTier: 'I1' });
addContact(SC.champNew, { name: 'Katrin Peeters', title: 'VP Engineering', identityTier: 'I1' });
addContact(SC.nameonly, { name: 'Matthias Fischer', title: 'Plant Director', identityTier: 'I1' });
addContact(SC.nameonly, { name: 'James Carter', title: 'Procurement Manager', identityTier: 'I2' });
addContact(SC.nameonly, { name: 'James Carter', title: 'Procurement Manager', identityTier: 'I1' }); /* same name, different LinkedIn URL: two people */
/* Everyone else: 2 or 3 contacts per account, a bounce here and there. */
accounts.forEach(a => {
  const have = contacts.filter(c => c.accountId === a.id).length;
  const want = a === SC.optout ? 1 : Object.values(SC).includes(a) ? Math.max(have, 2) : int(2, 3);
  for (let i = have; i < want; i++) addContact(a, { persona: i === 0 ? 'buyer' : undefined });
});
const lngFirst = contacts.find(c => c.accountId === 'northgate'); lngFirst.identityTier = 'I1'; lngFirst.foundBy = FOUND.I1;
contacts.filter(c => c.accountId === 'northgate').forEach(c => { c.identityTier = 'I1'; c.foundBy = FOUND.I1; });
const bounce = contacts.find(c => c.accountId === nine[2].id); bounce.stale = 'Email bounced on ' + ago(6); bounce.staleReason = bounce.stale;
/* One contact whose email bounced before: the next action must not choose email again. */
const failed = contacts.find(c => c.accountId === nine[4].id); failed.failedChannels = ['Email'];

/* ─── Signals ─── */
const REG = Object.fromEntries(csv('signals.csv').map(r => [r.code, r]));
const tierOf = code => parseInt(REG[code].signal_tier, 10) || 3;
const PUB = { Co1: ['Capital Markets Wire', 'Crunchbase'], Co2: ['Industry Jobs Monitor', 'PredictLeads'], Co3: ['Incident Filings Tracker', 'SEC EDGAR'], Co4: ['Deal Flow Daily', 'Crunchbase'], Co5: ['Stack Change Monitor', 'BuiltWith'], Co6: ['Public Tenders Portal', 'Tender portals'], Co7: ['Filings Search', 'SEC EDGAR'], Co8: ['Process Industry Wire', 'NewsCatcher'], Co9: ['Plant People News', 'PredictLeads'], Cm1: ['Contract Intelligence Feed', 'HG Insights'], Cm2: ['Technographics Feed', 'HG Insights'], Cm3: ['Buyer Intent Feed', 'G2 (Buyer Intent, reviews)'], Cm4: ['Industry Jobs Monitor', 'Apollo'], Cm5: ['Rival Watch', 'Verid'], P1: ['Executive Moves', 'Apollo'], P2: ['Executive Moves', 'Apollo'], P3: ['Executive Moves', 'PredictLeads'], P5: ['LinkedIn engagement (seeded)', 'Common Room'], P6: ['LinkedIn engagement (seeded)', 'Common Room'], P7: ['LinkedIn engagement (seeded)', 'Common Room'], M1: ['Energy Regulation Bulletin', 'GDELT'], M2: ['Energy Markets Daily', 'NewsCatcher'], M3: ['Energy Markets Daily', 'NewsCatcher'], M4: ['Regulatory Calendar', 'Regulatory calendars'] };
const RIVALS = ['Orrin Automation', 'Calder Process Systems', 'Brennick Controls'];
const TEXT = {
  Co1: a => [`${a.name} raises new funding`, `${a.name} closed a GBP ${int(40, 220)}M financing round to modernise operations at its main site.`, 'buyer'],
  Co2: a => [`${a.name} posts ${int(6, 14)} automation roles`, `${a.name} is hiring ${int(6, 14)} control and instrument engineers ahead of a site upgrade programme.`, 'technical lead'],
  Co3: a => [`Process safety incident reported at ${a.name}`, `A trip on the main unit at ${a.name} caused an unplanned shutdown of ${int(2, 6)} days, according to a regulatory filing.`, 'operations'],
  Co4: a => [`${a.name} agrees acquisition`, `${a.name} agreed to acquire a neighbouring site and plans to integrate its control systems within 18 months.`, 'buyer'],
  Co5: a => [`${a.name} changes its historian platform`, `Job posts and stack data show ${a.name} replacing its plant historian this year.`, 'technical lead'],
  Co6: a => [`${a.name} publishes a control system tender`, `${a.name} published a tender for distributed control system migration, closing in ${int(4, 8)} weeks.`, 'procurement'],
  Co7: a => [`Filing language shift at ${a.name}`, `${a.name}'s latest report mentions "ageing control infrastructure" as a risk for the first time.`, 'buyer'],
  Co8: a => [`${a.name} announces a turnaround plan`, `${a.name} announced a major turnaround next year, with automation upgrades in scope.`, 'operations'],
  Co9: a => [`New plant head at ${a.name}`, `${a.name} appointed a new plant director, previously responsible for a control system migration elsewhere.`, 'buyer'],
  Cm1: a => [`Rival contract renewal window at ${a.name}`, `${a.name}'s support contract with ${pick(RIVALS)} ends within 90 days, according to contract data.`, 'procurement'],
  Cm2: a => [`Declining rival use at ${a.name}`, `Usage of ${pick(RIVALS)} modules at ${a.name} fell for three quarters in a row.`, 'technical lead'],
  Cm3: a => [`${a.name} researching a rival`, `People at ${a.name} compared ${pick(RIVALS)} with alternatives on a review site this week.`, 'technical lead'],
  Cm4: a => [`Rival named in ${a.name} job posts`, `${a.name} job posts ask for experience with ${pick(RIVALS)} migration projects.`, 'technical lead'],
  Cm5: a => [`Rival changes affect ${a.name}`, `${pick(RIVALS)} raised support prices for the platform ${a.name} runs.`, 'procurement'],
  P1: a => [`New executive at ${a.name}`, `${a.name} hired a new chief operating officer who led a digital plant programme at a peer.`, 'buyer'],
  P3: a => [`Buyer role change at ${a.name}`, `The head of automation at ${a.name} now also owns capital projects.`, 'technical lead'],
  M1: a => [`New process safety guidance for ${a.niche || 'plants'}`, `The regulator published new guidance on safety instrumented systems for ${(a.niche || 'plant').toLowerCase()}s.`, 'technical lead'],
  M3: a => [`Energy price shift`, `Gas prices rose ${int(12, 30)} per cent this month, raising pressure on plant efficiency.`, 'buyer'],
  M4: a => [`Methane monitoring and reporting deadline`, `LNG terminals must report continuous methane monitoring data from ${iso(NOW.getTime() + 120 * DAY)}, under the new emissions rules.`, 'operations']
};
const signals = []; let sigN = 0;
function addSignal(acc, code, o) {
  o = o || {};
  const [title, evidence, persona] = (o.text || TEXT[code])(acc);
  const [pub, conn] = o.pub || PUB[code];
  const age = o.age != null ? o.age : 0;
  const s = {
    id: 'S' + (++sigN), accountId: acc.id, code, level: REG[code] ? REG[code].level : 'Company', type: REG[code] ? REG[code].signal : code,
    tier: o.tier || tierOf(code), strength: o.strength || int(2, 5), title, evidence: o.evidence || evidence, persona: o.persona || persona,
    eventDate: ago(age), capturedAt: o.captured || agoTs(Math.max(0, age - (o.lag != null ? o.lag : int(0, 1))), 5),
    sourceName: pub, sourceUrl: 'https://example.org/' + slug(pub) + '/' + slug(acc.name) + '-' + sigN, connector: conn,
    eventId: o.eventId || null, observable: o.observable !== false, predictive: o.predictive !== false, timeBound: o.timeBound !== false,
    relevance: o.relevance || null, post: o.post || null, comment: o.comment || null, expiresOn: o.expiresOn || null, removedBy: o.removedBy || null, contactId: o.contactId || null
  };
  signals.push(s); return s;
}
/* Scenario 3: funding, reported by three sources, plus a hiring surge. */
addSignal(SC.ready, 'Co1', { age: 1, strength: 5, eventId: 'ev-harrow-funding' });
addSignal(SC.ready, 'Co1', { age: 1, strength: 5, eventId: 'ev-harrow-funding', pub: ['Energy Markets Daily', 'NewsCatcher'] });
addSignal(SC.ready, 'Co1', { age: 1, strength: 4, eventId: 'ev-harrow-funding', pub: ['Regional Business Journal', 'Firecrawl (monitor, scrape)'] });
addSignal(SC.ready, 'Co2', { age: 5, strength: 4 });
addSignal(SC.ready, 'Co9', { age: 30, strength: 4 });
/* Scenario 4: the same picture, contact found as I3. */
addSignal(SC.idcard, 'Co1', { age: 2, strength: 5, eventId: 'ev-halden-funding' });
addSignal(SC.idcard, 'Co1', { age: 2, strength: 5, eventId: 'ev-halden-funding', pub: ['Regional Business Journal', 'Firecrawl (monitor, scrape)'] });
addSignal(SC.idcard, 'Co1', { age: 2, strength: 4, eventId: 'ev-halden-funding', pub: ['Energy Markets Daily', 'NewsCatcher'] });
addSignal(SC.idcard, 'Cm1', { age: 6, strength: 4 });
/* Scenario 5: a customer with strong signals. */
addSignal(SC.customer, 'Co6', { age: 1, strength: 5 }); addSignal(SC.customer, 'P1', { age: 2, strength: 5 });
/* Scenario 8: a question in a comment on a relevant post, and a like on an unrelated one. */
addSignal(SC.linkedin, 'P5', { age: 1, strength: 5, tier: 2, persona: 'technical lead', contactId: null,
  text: a => ['Comment asking a question on our migration post', `"How did you keep the units running during the cut-over? We face the same with our 2009 system."`, 'technical lead'],
  pub: ['Vantor Controls company page (LinkedIn, seeded)', 'Common Room'],
  post: 'Vantor Controls: how a gas plant migrated its control system without a shutdown (case study).',
  comment: 'How did you keep the units running during the cut-over? We face the same with our 2009 system.',
  relevance: 'Relevant: a question about our category from the head of automation, naming the age of their own system. Strong.' });
addSignal(SC.linkedin, 'P7', { age: 2, strength: 1, tier: 3, predictive: false,
  text: a => ['Like on an unrelated post', 'Liked a post about a charity cycling event.', 'operations'],
  pub: ['LinkedIn engagement (seeded)', 'Common Room'], post: 'Our team cycled 300 km for charity this weekend.', comment: null,
  relevance: 'Not relevant: a passive like on a post with no link to the category. Discarded at the qualification filter.' });
addSignal(SC.linkedin, 'Co2', { age: 9, strength: 3 });
/* Scenario 9 and the rest of Sofia's scenario accounts. */
addSignal(SC.optout, 'Co9', { age: 2, strength: 5 }); addSignal(SC.optout, 'Co8', { age: 20, strength: 3 });
addSignal(SC.timeout, 'Cm1', { age: 3, strength: 2 });
addSignal(SC.recent, 'Co6', { age: 2, strength: 5 }); addSignal(SC.recent, 'Co2', { age: 8, strength: 4 });
addSignal(SC.verify, 'Co4', { age: 2, strength: 5 }); addSignal(SC.verify, 'Co9', { age: 6, strength: 4 });
addSignal(SC.policy, 'Co1', { age: 1, strength: 5 }); addSignal(SC.policy, 'Co6', { age: 7, strength: 4 });
addSignal(SC.nodraft, 'Co3', { age: 1, strength: 5 }); addSignal(SC.nodraft, 'Co2', { age: 10, strength: 3 });
addSignal(SC.nochannel, 'Co6', { age: 2, strength: 5 }); addSignal(SC.nochannel, 'Cm1', { age: 5, strength: 4 });
addSignal(SC.i4, 'P1', { age: 2, strength: 5 }); addSignal(SC.i4, 'Co2', { age: 12, strength: 3 });
addSignal(SC.niche, 'Co1', { age: 3, strength: 4 });
addSignal(SC.missing, 'Co6', { age: 2, strength: 5 });
addSignal(SC.opendeal, 'Co6', { age: 1, strength: 5 }); addSignal(SC.opendeal, 'Co2', { age: 6, strength: 4 });
addSignal(SC.nameonly, 'Co9', { age: 2, strength: 4 });
/* Champion move: the old-role signal is removed and a new one is created at the new company. */
addSignal(SC.champOld, 'P2', { age: 40, strength: 4, contactId: champ.id, removedBy: 'Champion moved to Elsworth Refining on ' + ago(4) + '; the old-role signal no longer applies',
  text: a => ['Champion active at ' + a.name, 'Katrin Peeters (head of automation) led the 2025 control review at ' + a.name + '.', 'technical lead'], pub: ['Executive Moves', 'Apollo'] });
addSignal(SC.champNew, 'P2', { age: 4, strength: 5, tier: 1, text: a => ['Champion joins ' + a.name, 'Katrin Peeters, who led a control review at Varney Chemicals, joined ' + a.name + ' as VP Engineering.', 'buyer'], pub: ['Executive Moves', 'Apollo'] });
addSignal(SC.champNew, 'Co8', { age: 15, strength: 3 });
/* Campaign group: the same compliance deadline, captured inside 7 days, strongest signal for each. */
lng.forEach((a, i) => addSignal(a, 'M4', { age: 1 + (i % 4), strength: 4, eventId: 'ev-methane-' + a.id }));
/* Nine refineries with a hiring surge inside 7 days. */
nine.forEach((a, i) => addSignal(a, 'Co2', { age: 1 + (i % 5), strength: 4 }));

/* The rest: about 60 of 100 accounts carry at least one live signal; ages spread so decay and expiry show. */
const POOL = ['Co1', 'Co2', 'Co3', 'Co4', 'Co5', 'Co6', 'Co7', 'Co8', 'Co9', 'Cm1', 'Cm2', 'Cm3', 'Cm4', 'Cm5', 'P1', 'P3', 'M1', 'M3'];
const AGE = { 1: [0, 25], 2: [3, 75], 3: [5, 110] };
const rest = accounts.filter(a => !Object.values(SC).includes(a) && !lng.includes(a) && !nine.includes(a));
rest.forEach((a, i) => {
  const n = i % 3 === 0 || i % 11 === 5 ? 0 : i % 7 === 1 ? -1 : int(2, 4);
  if (n === -1) { addSignal(a, pick(['Co1', 'Co9', 'P1']), { age: int(20, 40) }); addSignal(a, 'Co8', { age: int(95, 130) }); return; }
  for (let k = 0; k < n; k++) {
    const code = pick(POOL), t = tierOf(code);
    /* Keep the nine refineries the only ones with a hiring surge inside 7 days, and LNG the only compliance group. */
    let age = int(AGE[t][0], AGE[t][1]);
    if (code === 'Co2' && a.niche === 'Refinery' && age <= 8) age = 9 + int(0, 20);
    addSignal(a, code, { age });
  }
});
/* A date in the text overrides the window. */
addSignal(rest[3], 'Co8', { age: 12, strength: 3, tier: 3, expiresOn: '2027-04-30', text: a => [`${a.name} freezes capital budget to April`, `${a.name} said its automation budget is frozen to April 2027, then reopens for the 2027 turnaround.`, 'buyer'] });
/* 15 signals that fail a filter test, for the debug view. */
const DISCARD = [
  ['Headquartered in a new office', 'The company lists a new headquarters address.', { timeBound: false }],
  ['Company size inferred from photos', 'Staff count estimated from office photos on a careers page.', { observable: false }],
  ['Sponsors a local football club', 'The company sponsors a youth football team.', { predictive: false }],
  ['Award for workplace culture', 'Named a great place to work in a regional survey.', { predictive: false }],
  ['Long-standing quality certificate', 'Holds an ISO 9001 certificate since 2004.', { timeBound: false }],
  ['Rumoured restructuring', 'A forum post claims a restructuring is coming.', { observable: false }],
  ['Christmas party pictures', 'Posted pictures from the staff party.', { predictive: false }],
  ['Generic mission statement update', 'Changed the wording of its mission statement.', { predictive: false, timeBound: false }],
  ['Unverified tender chatter', 'A supplier newsletter mentions a possible tender.', { observable: false }],
  ['Founded in 1974', 'Company history page lists its founding year.', { timeBound: false }],
  ['New logo', 'The company refreshed its logo and colours.', { predictive: false }],
  ['Office move within the same city', 'Moved its sales office two streets away.', { predictive: false }],
  ['Estimated revenue band', 'A data site guesses revenue in a broad band.', { observable: false }],
  ['Evergreen careers page', 'Careers page says "always hiring talented people".', { timeBound: false }]
];
DISCARD.forEach((d, i) => addSignal(rest[(i * 7) % rest.length], 'Co8', Object.assign({ age: int(2, 20), strength: 2, text: () => [d[0], d[1], 'buyer'] }, d[2])));

/* ─── Exclusions ─── */
const competitors = rest.slice(-3);
competitors[0].name = 'Orrin Automation'; competitors[1].name = 'Calder Process Systems'; competitors[2].name = 'Brennick Controls';
competitors.forEach(c => { c.niche = 'Specialty chemicals plant'; c.attributes.niche = c.niche; c.domain = slug(c.name) + '.example'; c.crm = { competitor: true }; c.description = 'A competitor of Vantor Controls.'; });
contacts.filter(c => competitors.some(a => a.id === c.accountId)).forEach(c => { const a = accounts.find(x => x.id === c.accountId); c.email = c.email.replace(/@.*/, '@' + a.domain); });
const customers = [SC.customer].concat(rest.filter(a => !competitors.includes(a)).filter((_, i) => i % 9 === 2).slice(0, 7));
customers.forEach(a => { a.crm = Object.assign({ status: 'Customer', since: ago(int(200, 900)), field: 'Stage = Closed won' }, a.crm); });
const PAUSED = ['Offshore platform', 'Water treatment works'];
const dnc = contacts.find(c => c.accountId === rest[10].id);
const exclusions = [].concat(
  customers.map(a => ({ id: 'X-' + a.id, kind: 'Customer', accountId: a.id, reason: 'Closed-won in the CRM (' + (a.crm.since || '') + ')', source: 'CRM (read-only)', date: a.crm.since || ago(300) })),
  competitors.map(a => ({ id: 'X-' + a.id, kind: 'Competitor', accountId: a.id, reason: 'Named competitor', source: 'Admin list', date: '2026-10-02' })),
  PAUSED.map(n => ({ id: 'X-seg-' + slug(n), kind: 'Paused segment', segment: n, reason: 'Paused by the sales leader until the 2027 plan', source: 'Admin', date: '2026-10-20' })),
  [{ id: 'X-' + dnc.id, kind: 'Do not contact', contactId: dnc.id, accountId: dnc.accountId, reason: 'Asked not to be contacted (legal request)', source: 'Admin', date: '2026-09-12' }],
  [{ id: 'X-open-upwood', kind: 'Open deal', accountId: 'upwood', reason: 'Open opportunity "Upwood DCS migration phase 1" (Proposal), owned by Marco Lindqvist', source: 'CRM (read-only)', date: '2026-10-28' }]
);

/* ─── Content Library ─── */
const content = {
  voice: ['Plain, specific and short. One idea per sentence.', 'Lead with what changed at their site, never with us.', 'One ask per message, easy to say no to.', 'British English. No exclamation marks. No em dashes.', 'Name the source of every figure.'],
  claims: [
    ['Cut-overs completed inside the planned turnaround on 14 of 15 migration projects since 2021.', 'Project close-out reports 2021 to 2026', '2026-09-30'],
    ['Average unplanned downtime fell 31% in the first year after migration at five refineries.', 'Customer outcome study, May 2026', '2026-06-15'],
    ['Hot cut-over method keeps units running during the switch.', 'Migration method guide v4', '2026-08-01'],
    ['Certified to IEC 61511 for safety instrumented systems.', 'Certificate TUV-61511-2025', '2026-07-01'],
    ['Supports controllers from the three main legacy platforms.', 'Compatibility matrix 2026', '2026-10-01'],
    ['Typical migration of one process unit takes 10 to 14 weeks from design freeze.', 'Delivery playbook 2026', '2026-09-01'],
    ['Operators retrain in under two weeks with the side-by-side console.', 'Training records 2025', '2026-05-20'],
    ['Lifecycle cost over 15 years was 22% lower than staying on extended support, in a published peer case.', 'Peer case study, Northern LNG (anonymised)', '2026-04-10'],
    ['Continuous methane monitoring integrates with the control system without new cabling.', 'Emissions module datasheet v2', '2026-10-15'],
    ['Remote support from UK and Rotterdam centres, 24 hours a day.', 'Service catalogue 2026', '2026-09-01'],
    ['Fixed-price migration assessment in four weeks.', 'Offer sheet Q4 2026', '2026-10-01'],
    ['Cyber security certified to IEC 62443-3-3.', 'Certificate 62443-2026', '2026-07-12'],
    ['Alarm floods reduced by 40% after rationalisation at a gas plant.', 'Case study K3', '2026-03-30'],
    ['Historian migration keeps 20 years of process data.', 'Historian migration guide', '2026-06-01'],
    ['Over 120 control system migrations delivered in Europe.', 'Company fact sheet 2026', '2026-10-01'],
    ['Engineering tools convert 85% of legacy logic automatically.', 'Conversion tool benchmark 2025', '2026-02-14'],
    ['A dedicated safety case manager on every project.', 'Delivery playbook 2026', '2026-09-01'],
    ['Spare parts guaranteed for 15 years after go-live.', 'Lifecycle agreement template', '2026-08-20'],
    ['Pilot on one unit before committing to a site-wide plan.', 'Offer sheet Q4 2026', '2026-10-01'],
    ['Average payback of 3.2 years on efficiency gains across eight sites.', 'Customer outcome study, May 2026', '2026-06-15']
  ].map((c, i) => ({ id: 'C' + (i + 1), text: c[0], source: c[1], reviewDate: c[2] })),
  banned: ['best-in-class', 'world-class', 'game-changer', 'revolutionary', 'cutting-edge', 'synergy', 'guaranteed results', 'no-brainer', 'act now', 'once-in-a-lifetime', 'leading provider', 'seamless'],
  toneRules: [{ pattern: '!', label: 'No exclamation marks' }, { pattern: '—', label: 'No em dashes' }],
  templates: [
    { name: 'Signal-led first touch', structure: 'What changed at their site → one proof point → one easy ask', status: 'Provisional (unproven)' },
    { name: 'Campaign touch 2', structure: 'Reinforce the shared trigger → one statistic or asset from the Knowledge Hub → soft ask', status: 'Provisional (unproven)' },
    { name: 'Campaign touch 3', structure: 'Direct ask referencing the trigger and the proof', status: 'Provisional (unproven)' }
  ],
  badExamples: ['"We are the best-in-class partner for all your automation needs!" (generic, banned phrase, exclamation)', '"Our platform cuts costs by 50%." (a figure without a source)'],
  cases: [
    ['K1', 'Northern LNG terminal migration', 'The terminal migrated two process units during a planned outage and restarted on schedule; methane data now flows to the control room.', 'p. 3'],
    ['K2', 'Coastal refinery hot cut-over', 'Units stayed online while 1,400 loops moved to the new system over nine weekends.', 'p. 2'],
    ['K3', 'Gas plant alarm rationalisation', 'Alarm floods fell sharply after rationalisation, and operators handled upsets with fewer manual overrides.', 'p. 4'],
    ['K4', 'Speciality chemicals safety upgrade', 'The safety instrumented system was replaced and certified without extending the turnaround.', 'p. 2'],
    ['K5', 'Petrochemical historian migration', 'Twenty years of process history moved to the new historian with no data loss.', 'p. 5']
  ].map(c => ({ id: c[0], title: c[1], passage: c[2], page: c[3], doc: c[1] + ' (case study, PDF)' }))
};

/* ─── Drafts (pre-written; the brief's default) ─── */
const repFirst = id => USERS[id].name.split(' ')[0];
const PROOF = { Refinery: ['C1', 'K2'], 'Petrochemical complex': ['C14', 'K5'], 'LNG terminal': ['C9', 'K1'], 'Gas processing plant': ['C13', 'K3'], 'Specialty chemicals plant': ['C4', 'K4'], 'Tank storage terminal': ['C3', 'K2'], 'Power station': ['C3', 'K2'], 'Hydrogen project': ['C12', 'K4'], 'Water treatment works': ['C6', 'K2'], 'Offshore platform': ['C3', 'K2'] };
const drafts = {};
function draftFor(a, contact, top) {
  const first = contact ? contact.name.split(' ')[0] : 'there';
  const [claim, kase] = PROOF[a.niche] || PROOF.Refinery;
  const c = content.claims.find(x => x.id === claim), k = content.cases.find(x => x.id === kase);
  const hook = top ? top.evidence.replace(/^"|"$/g, '').replace(/\.$/, '') : 'Your site is planning changes';
  return {
    subject: top ? top.title.replace(a.name, 'your site') : 'Your control system plans',
    body: `Hi ${first},\n\n${hook} [${top ? top.id : ''}]. When plants change at this scale, the control system is often the part that sets the timetable.\n\n${c.text.replace(/\.$/, '')} [${claim}]. ${k.passage.replace(/\.$/, '')} [${kase}].\n\nWould a 20-minute call next week help you plan the next step?\n\nBest regards,\n${repFirst(a.owner)}`,
    structure: 'What changed at their site → one proof point → one easy ask', structureStatus: 'Unproven (no validated structure yet)', format: 'Plain text', llmFailed: false
  };
}
/* Live picture at the base time, used to write each draft against the account's strongest signal. */
accounts.forEach(a => {
  const s = E.scoreSignals(signals.filter(x => x.accountId === a.id), CFG.baseNow, CFG);
  const top = s.live[0];
  const cs = contacts.filter(c => c.accountId === a.id && !c.stale);
  const contact = (top && cs.find(c => c.persona === top.persona)) || cs.find(c => c.persona === 'buyer') || cs[0];
  drafts[a.id] = draftFor(a, contact, top);
});
drafts.ravensworth.body = drafts.ravensworth.body.replace('When plants change at this scale', 'As the best-in-class partner, we know that when plants change at this scale').replace('Would a 20-minute call', 'Our platform cuts integration time by 50%. Would a 20-minute call');
drafts.thornbury = { subject: '', body: '', structure: 'Not produced', structureStatus: 'Not produced', format: 'Plain text', llmFailed: true, error: 'The language model call timed out twice (prompts 2026.11.1). No draft; the signals are attached.' };

/* ─── Sends, replies and outcomes already in memory ─── */
const sends = [
  { id: 'snd-001', accountId: 'whitlock', contactId: contacts.find(c => c.accountId === 'whitlock').id, channel: 'Email', at: agoTs(6, 10), by: 'sofia', signalIds: [], messageVersion: 'm-1', ruleVersion: 'rules 2026.10.4', segment: 'Refinery × Tender or expansion', capture: 'Read back from the mailbox', subject: 'Your control system tender' },
  { id: 'snd-002', accountId: 'elsworth', contactId: contacts.find(c => c.accountId === 'elsworth').id, channel: 'Email', at: agoTs(95, 11), by: 'marco', signalIds: [], messageVersion: 'm-1', ruleVersion: 'rules 2026.08.1', segment: 'Refinery × Announcement', capture: 'Read back from the mailbox', subject: 'Turnaround planning' },
  { id: 'snd-003', accountId: 'harrowgate', contactId: contacts.find(c => c.accountId === 'harrowgate').id, channel: 'Email', at: agoTs(140, 9), by: 'sofia', signalIds: [], messageVersion: 'm-1', ruleVersion: 'rules 2026.06.2', segment: 'Refinery × New plant head', capture: 'Late capture: rebuilt from the approval', subject: 'Congratulations on the new role' },
  { id: 'snd-004', accountId: nine[4].id, contactId: failed.id, channel: 'Email', at: agoTs(50, 9), by: REGION_REP[nine[4].region], signalIds: [], messageVersion: 'm-1', ruleVersion: 'rules 2026.09.1', segment: 'Refinery × Hiring surge', capture: 'Read back from the mailbox', bounced: true, subject: 'Hiring for the upgrade' }
];
const replies = [
  { id: 'rep-001', sendId: 'snd-003', accountId: 'harrowgate', contactId: sends[2].contactId, at: agoTs(138, 15), text: 'Thanks, not this year. Try me again after the budget round.', matched: true },
  { id: 'rep-002', sendId: null, accountId: null, contactId: null, at: agoTs(1, 8), from: 'r.ellis@unknown-sender.example', text: 'Saw your note about migrations. Who should I speak to?', matched: false }
];
const outcomes = [{ id: 'out-001', accountId: 'elsworth', type: 'Meeting booked', at: agoTs(80, 14), sendId: 'snd-002', segment: 'Refinery × Announcement', structure: 'Signal-led first touch', channel: 'Email' }];
/* Events that will happen as the clock moves: a contact in the campaign opts out between touches. */
const lngOptOut = contacts.find(c => c.accountId === lng[1].id);
const futureEvents = [{ id: 'fe-1', at: new Date(NOW.getTime() + 2 * DAY).toISOString().slice(0, 19), kind: 'opt-out', contactId: lngOptOut.id, accountId: lng[1].id, text: lngOptOut.name + ' replied "please remove me from your list"; the rep logged an opt-out.' }];

/* ─── Backtest: 15 won, 15 lost, 15 random, scored as of their decision date ─── */
const backtest = [];
function caseOf(set, i, fit, sigs, outcome) {
  const asOf = agoTs(200 + i * 3);
  const base = new Date(asOf).getTime();
  backtest.push({ id: set + '-' + (i + 1), set, name: makeName(nextPrefix(), pick(['Refinery', 'Petrochemical complex', 'LNG terminal', 'Gas processing plant'])), fit, outcome, asOf,
    signals: sigs.map((s, k) => ({ id: set + i + 's' + k, code: s[0], tier: s[1], strength: s[2], eventDate: iso(base - s[3] * DAY), observable: true, predictive: true, timeBound: true })) });
}
/* Won: twelve with a strong, fresh signal; three slipped through with nothing current. */
for (let i = 0; i < 15; i++) caseOf('won', i, int(72, 92), i < 12 ? [['Co1', 1, 5, int(0, 2)], ['Co2', 2, 4, int(2, 10)]] : [['Co8', 3, 2, 85]], 'Won');
/* Lost: two looked ready; thirteen fit well but had nothing happening. */
for (let i = 0; i < 15; i++) caseOf('lost', i, int(70, 90), i < 2 ? [['Co6', 1, 5, 1], ['P3', 2, 3, 8]] : i < 6 ? [['Co7', 3, 2, 80]] : [], 'Lost');
/* Random: a spread. */
for (let i = 0; i < 15; i++) caseOf('random', i, int(30, 85), i < 3 ? [['Co1', 1, 4, 1], ['Co5', 2, 3, 6]] : i < 7 ? [['Co2', 2, 3, int(5, 30)]] : i < 10 ? [['M1', 3, 2, int(20, 70)]] : [], i < 2 ? 'Won' : 'Lost');

/* ─── Agent runs and cost ─── */
const AGENTS = [['Prospecting agent', 'prompts 2026.11.1', 0.9, 2.4], ['Signal agent', 'prompts 2026.11.1', 3.2, 7.8], ['Qualification agent', 'prompts 2026.11.1', 1.1, 2.9], ['Engagement recommendation agent', 'prompts 2026.11.1', 2.6, 6.1], ['Reply agent', 'prompts 2026.11.1', 0.3, 0.9]];
const runs = [];
for (let d = 13; d >= 0; d--) AGENTS.forEach(([agent, pv, lo, hi], k) => runs.push({ id: 'run-' + d + '-' + k, agent, at: agoTs(d, 6), rows: int(40, 400), cost: Number((lo + rnd() * (hi - lo)).toFixed(2)), promptVersion: pv, status: d === 3 && k === 1 ? 'Retried: 429 from a source, recovered' : 'OK' }));

/* ─── Demo-data screens (R2 and R3) ─── */
const named = n => accounts.filter(a => !customers.includes(a) && !competitors.includes(a)).slice(20, 20 + n).map(a => a.name);
const nm = named(16);
const demo = {
  replies: [
    ['Hot', nm[0], 'Can you do Tuesday? We want to see the hot cut-over approach.', 'Book the meeting'], ['Hot', nm[1], 'Send times for next week, our automation lead will join.', 'Book the meeting'], ['Hot', nm[2], 'Interesting timing. Let us talk before the tender closes.', 'Book the meeting'],
    ['Further action', nm[3], 'Do you have a reference at a refinery our size?', 'Send the asset within a day'], ['Further action', nm[4], 'Please share the migration assessment offer.', 'Send the asset within a day'], ['Further action', nm[5], 'What does a pilot on one unit cost?', 'Send the asset within a day'],
    ['Not now', nm[6], 'Budget is set until April. Come back then.', 'Recontact in April; nurture'], ['Not now', nm[7], 'We are mid-turnaround. Q2 next year.', 'Recontact in Q2; nurture'],
    ['Wrong person', nm[8], 'I left the automation team. Try our new head of automation.', 'Add the new contact and re-route'],
    ['Disqualified', nm[9], 'We signed a ten-year support deal last month.', 'Close out, watch for renewal, save the reason'], ['Disqualified', nm[10], 'The site is being sold.', 'Close out, save the reason'],
    ['Opted out', nm[11], 'Please remove me from your list.', 'Stop all; add to exclusions']
  ].map((r, i) => ({ id: 'dr' + i, status: r[0], account: r[1], text: r[2], next: r[3], at: agoTs(i % 3, 7 + i % 5), draft: r[0] === 'Hot' ? 'Thanks, Tuesday works. I will bring our migration lead and a one-page plan for your site.' : r[0] === 'Further action' ? 'Thanks for the question. Attached is a one-pager on a refinery migration of a similar size [K2].' : '' })),
  funnel: { per100: [['Qualified', 100, 100], ['Contacted', 82, 41], ['Replied', 21, 6], ['Meetings', 9, 2], ['Won', 2.4, 0.5]], note: 'Prioritised accounts against the rest, per 100 accounts worked, last quarter.' },
  scorecards: {
    rep: [['Actions sent', '46'], ['Replies', '11'], ['Meetings', '5'], ['Time to approve', '3.4 h']],
    manager: [['Reply rate', '24%'], ['Acceptance first time', '78%'], ['Edit rate', '19%'], ['Campaigns confirmed', '3']],
    leader: [['Pipeline from Demand AI', 'GBP 3.1M'], ['Qualified meetings', '17'], ['Cost per meeting', 'GBP 214'], ['Won', 'GBP 0.6M']]
  },
  assets: [
    { title: 'One-pager: hot cut-over for refineries', format: 'One-pager (PDF)', lines: [['Units stay online during the switch', 'C3'], ['14 of 15 cut-overs inside the planned turnaround', 'C1'], ['A coastal refinery moved 1,400 loops over nine weekends', 'K2']] },
    { title: 'Deck: methane monitoring for LNG terminals', format: 'Deck (8 slides)', lines: [['Monitoring integrates without new cabling', 'C9'], ['A northern terminal migrated two units in one outage', 'K1'], ['Certified to IEC 62443-3-3', 'C12']] }
  ],
  firstParty: [
    ['Visited the pricing page', nm[12], 'Signal tier 1', '2 hours ago', true], ['Downloaded the migration guide', nm[13], 'Signal tier 2', 'Yesterday', false], ['Clicked the case study link', nm[14], 'Signal tier 2', 'Yesterday', false], ['Attended the live webinar', nm[15], 'Signal tier 1', '40 minutes ago', true], ['Arrived from an AI assistant', nm[0], 'Signal tier 2', 'Today', false]
  ],
  learning: [
    ['Signal-led first touch converts best after a funding signal', '11 of 31 replied (35%)', 'Promoted to validated after 31 outcomes'],
    ['Tender signals older than 10 days rarely convert', '2 of 24 replied', 'Window shortened from 45 to 30 days (backtest passed)'],
    ['LinkedIn first touches to technical leads beat email', '9 of 22 against 5 of 30', 'Channel rule updated for technical leads'],
    ['Reps edited the opening line in 40% of drafts', 'Edits cluster on the greeting', 'Template opening changed; edit rate now 19%']
  ],
  patterns: [['Refinery × Funding', 'Signal → proof → ask', 31, 11, 'Validated'], ['LNG terminal × Compliance deadline', 'Trigger → statistic → ask', 14, 4, 'Provisional'], ['Gas processing × Exec hire', 'Congratulate → peer story → ask', 9, 2, 'Explore']],
  quota: { target: 'GBP 2.4M', closed: 'GBP 1.1M', gap: 'GBP 1.3M', weeks: [['Week 47', 'Push ' + nm[0] + ' to proposal', 'Open ' + nm[1]], ['Week 48', 'Close ' + nm[2], 'Open ' + nm[3] + ' and ' + nm[4]], ['Week 49', 'Proposal to ' + nm[5], 'Open ' + nm[6]], ['Week 50', 'Close ' + nm[7], 'Nurture ' + nm[8]]] },
  research: [
    { rival: 'Orrin Automation', theme: 'Slow support response after go-live', reviews: 23, proof: 'C10', account: nm[9] },
    { rival: 'Calder Process Systems', theme: 'Expensive extended support for old controllers', reviews: 17, proof: 'C8', account: nm[10] },
    { rival: 'Brennick Controls', theme: 'Difficult logic conversion during migration', reviews: 12, proof: 'C16', account: nm[11] }
  ]
};

/* ─── Registry, connectors, escalation types, feature map ─── */
const registry = csv('signals.csv');
const connectors = csv('connectors.csv').map(c => Object.assign(c, { mode: /R1/.test(c.release) ? (/Free/.test(c.access) ? 'Seeded' : 'Cached') : 'Not connected', lastRun: /R1/.test(c.release) ? agoTs(0, 5) : null }));
const escalationTypes = csv('escalations.csv');
const features = csv('feature_map.csv').map(f => ({ id: f.id, module: f.module, feature: f.feature, why: f.why_it_exists, release: f.first_release, treatment: f.prototype_treatment }));

/* ─── Candidates for the cold start (path A): the search returns more than fit ─── */
const candidates = accounts.map(a => ({ name: a.name, niche: a.attributes.niche, region: a.region, employees: a.attributes.employees, controlAge: a.attributes.controlAge, sites: a.attributes.sites, inList: true }))
  .concat(Array.from({ length: 58 }, () => { const n = pick(['Water treatment works', 'Power station', 'Offshore platform', 'Refinery']); return { name: makeName(nextPrefix(), n), niche: n, region: pick(['Middle East', 'South East Asia', 'UK & Ireland']), employees: pick([120, 180, 260, 15000]), controlAge: int(2, 8), sites: 1, inList: false }; }));

/* ─── Write ─── */
const SEED = { generatedFor: CFG.baseNow, tenant: TENANT, users: USERS, icp: ICP, icpProposal: ICP_PROPOSAL, accounts, contacts, signals, exclusions, pausedSegments: PAUSED, content, drafts, sends, replies, outcomes, futureEvents, backtest, runs, demo, registry, connectors, escalationTypes, features, candidates };
fs.mkdirSync(OUT, { recursive: true });
Object.entries(SEED).forEach(([k, v]) => fs.writeFileSync(path.join(OUT, k + '.json'), JSON.stringify(v, null, 1)));
fs.writeFileSync(path.join(OUT, 'seed.js'), '/* Generated by tools/gen-seed.cjs. Do not edit by hand. */\nwindow.SEED = ' + JSON.stringify(SEED) + ';\n');

/* ─── Report, so the scenarios can be checked when the seed changes ─── */
const scored = accounts.map(a => {
  const s = E.scoreSignals(signals.filter(x => x.accountId === a.id), CFG.baseNow, CFG), f = E.fitScore(a, ICP);
  return { id: a.id, name: a.name, owner: a.owner, fit: f.fit, timing: s.timing, rank: E.rankOf(f.fit, s.timing), live: s.live.length, top: s.live[0] };
});
const t = E.assignTiers(scored, CFG);
console.log('accounts', accounts.length, 'contacts', contacts.length, 'signals', signals.length, 'discards', signals.filter(s => !s.observable || !s.predictive || !s.timeBound).length);
console.log('with a live signal', scored.filter(s => s.live).length, 'ranked', t.count, 'cutA', t.cutA, 'cutB', t.cutB);
['harrowgate', 'halden', 'brightwell', 'kestrel', 'fenwick', 'caldbeck', 'whitlock', 'ravensworth', 'saltire', 'thornbury', 'ingleby', 'glenmoor', 'northgate', 'elsworth'].forEach(id => { const s = scored.find(x => x.id === id); console.log(' ', id.padEnd(12), 'fit', s.fit, 'timing', s.timing, 'rank', s.rank, 'tier', (t.tiers.get(id) || {}).tier); });
const bt = E.backtest(backtest, t, CFG, false), btd = E.backtest(backtest, t, CFG, true);
console.log('backtest', bt.bars.map(b => b.label + ' ' + b.value + (b.pass ? ' pass' : ' FAIL')).join(' | '));
console.log('degraded', btd.bars.map(b => b.value + (b.pass ? ' pass' : ' FAIL')).join(' | '));
console.log('per rep A/B', ['sofia', 'marco', 'aisha', 'kenji'].map(r => r + ' ' + scored.filter(s => s.owner === r && ['A', 'B'].includes((t.tiers.get(s.id) || {}).tier)).length).join(', '));
