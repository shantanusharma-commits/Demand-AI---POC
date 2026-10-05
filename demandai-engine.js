/* ═══════════════ DemandAI engine ═══════════════
   Deterministic rules for Lead discovery (stages 1–5) and Scoring (stages 6–8),
   as written in the Stage_Input_Reasoning_Output sheet and the lead/signal templates.
   No AI runs here: validation, knock-outs, fit and signal weighting are fixed code.
   The two places the spec hands to AI (classification with no lookup match, and the
   wording of the why-now line) are marked below and fall back to rules. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DemandAI = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ─── Configuration: starting values, to confirm at kickoff ─── */
const CONFIG = {
  version: 'Config v1 · starting values',
  pilotCountries: ['Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Indonesia', 'Vietnam'],
  fitFloor: 50,
  // Tiers on the 0–100 score. Score = rank ÷ 2, so these are the stage sheet's 70 / 40 on the rank:
  // every account lands in the same tier as before. To recalibrate with the client.
  tierThresholds: { A: 35, B: 20 },
  // Micro-segments: a segment needs this many distinct accounts.
  minSegmentAccounts: 3,
  // For Review: the share of items that went ahead on their own picked at random for a spot-check.
  spotCheckShare: 0.2,
  brand: { maxSubjectWords: 6, competitors: [] },
  // The agreed action library per segment (proposed in the process flows; the client approves the final list).
  // The first option is the recommendation; the next is the runner-up unless the strongest signal says otherwise.
  segmentLibrary: {
    'Inquiry':         ['Call to follow up on the inquiry', 'Route the inquiry to the sales owner'],
    'Modernisation':   ['Propose a migration-path discussion', 'Offer a site assessment', 'Offer a lifecycle service review'],
    'Service renewal': ['Offer a renewal review', 'Route to the service owner'],
    'Project':         ['Share a comparable case study and offer a technical session', 'Offer a reference-site visit', 'Offer an early design workshop'],
    'Leadership':      ['Introduce Client to the new leader', 'Share a peer case study from their sector', 'Invite to a short briefing'],
    'Engagement':      ['Follow up on the topic they engaged with', 'Invite to a related session'],
  },
  // Stacked timing can't exceed twice the strongest tier weight (100 + 50 + 25 + … < 200).
  timingMax: 200,
  verticalMap: [
    { pattern: /refin/i, vertical: 'Refining', level: 'core' },
    { pattern: /petrochem/i, vertical: 'Petrochemicals', level: 'adjacent' },
    { pattern: /gas processing|\blng\b/i, vertical: 'Gas processing', level: 'adjacent' },
  ],
  personas: {
    primary: [/instrumentation/i, /\bi&c\b/i, /\be&i\b/i, /automation/i, /control systems?\b/i, /\bdcs\b/i],
    secondary: [/plant manager/i, /operations/i, /procurement/i, /project director/i, /maintenance/i, /reliability/i],
  },
  rubric: [
    { key: 'vertical', label: 'Vertical', weight: 30 },
    { key: 'size', label: 'Company size', weight: 20 },
    { key: 'site', label: 'Site profile', weight: 20 },
    { key: 'relationship', label: 'Relationship', weight: 15 },
    { key: 'accountType', label: 'Account type', weight: 10 },
    { key: 'contacts', label: 'Contact coverage', weight: 5 },
  ],
  sizeBands: { revenueAbove: 1e9, revenueIn: 250e6, employeesAbove: 3000, employeesIn: 1000 },
  accountTypes: {
    'owner-operator': { label: 'Owner-operator', level: 100 },
    'epc contractor': { label: 'EPC or integrator', level: 60 },
    'system integrator': { label: 'EPC or integrator', level: 60 },
    'distributor': { label: 'Distributor', level: 20 },
    'other': { label: 'Other', level: 0 },
  },
  consentBases: ['legitimate interest', 'existing customer', 'opted in'],
  signalTypes: {
    'Inquiry or RFQ':                       { code: 'Y2',  tier: 100, strength: 1,    full: 30,  zero: 90,  segment: 'Inquiry' },
    'Installed system near end of support': { code: 'Y1',  tier: 100, strength: 1,    full: 365, zero: 730, segment: 'Modernisation' },
    'Service contract renewal':             { code: 'Y1',  tier: 60,  strength: 1,    full: 90,  zero: 180, segment: 'Service renewal' },
    'Capital project':                      { code: 'Y4',  tier: 100, strength: 0.8,  full: 90,  zero: 365, segment: 'Project' },
    'Leadership change':                    { code: 'C1c', tier: 60,  strength: 0.75, full: 30,  zero: 120, segment: 'Leadership' },
    'Webinar attended':                     { code: 'C1w', tier: 60,  strength: 1,    full: 30,  zero: 180, segment: 'Engagement' },
    'Webinar registered':                   { code: 'C1w', tier: 30,  strength: 1,    full: 30,  zero: 120, segment: 'Engagement' },
    'Content download':                     { code: 'C1w', tier: 60,  strength: 1,    full: 30,  zero: 180, segment: 'Engagement' },
    'Email clicked':                        { code: 'C1x', tier: 30,  strength: 1,    full: 14,  zero: 60,  segment: 'Engagement' },
    'Installed system (current)':           { knockout: true },
    'Newsletter sign-up':                   { reject: 'D1' },
  },
};

const CODES = {
  D1: 'Wrong fit',
  D2: 'Stale',
  D3: 'Incomplete',
  D4: "Can't be matched",
  D5: 'Duplicate',
};

const LEAD_COLUMNS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
  'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
  'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
  'capacity_unit', 'consent_basis', 'opt_out', 'owner_email'];
const LEAD_REQUIRED = ['first_name', 'last_name', 'job_title', 'company_name', 'company_domain', 'country', 'industry',
  'existing_customer', 'managed_separately', 'consent_basis', 'opt_out', 'owner_email'];
const SIGNAL_COLUMNS = ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product'];
const SIGNAL_REQUIRED = ['company_name', 'signal_type', 'event_date', 'detail'];

/* ─── Small helpers ─── */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LINKEDIN_RE = /linkedin\.com\/(in|pub)\/[^\s/]+/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

function clean(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function normKey(s) { return clean(s).toLowerCase().replace(/\s+/g, ' '); }
function normHeader(h) { return clean(h).toLowerCase().replace(/\*/g, '').trim().replace(/[\s-]+/g, '_'); }
function normEmail(e) { return clean(e).toLowerCase(); }
function normLinkedIn(u) {
  return clean(u).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
}
function round1(n) { return Math.round(n * 10) / 10; }
function parseIsoDate(s) {
  const m = DATE_RE.exec(clean(s));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 ? t : null;
}
function daysBetween(fromIso, toIso) { return Math.round((parseIsoDate(toIso) - parseIsoDate(fromIso)) / DAY_MS); }
function yesNo(v) {
  const s = clean(v).toLowerCase();
  if (s === 'y' || s === 'yes') return 'Y';
  if (s === 'n' || s === 'no') return 'N';
  return s === '' ? '' : null; // null = present but not Y/N
}

/* ─── File reading: CSV text or a SheetJS-style array of rows ─── */
function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function toCSV(rows) {
  return rows.map(r => r.map(v => {
    const s = clean(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}

function cellToString(v) {
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return clean(v);
}

/* Finds the header row (the template has a title row above it and a format-hints row below it),
   then returns one record per data row with its real spreadsheet row number. */
function readTable(grid, { file, sheet, columns, required, anchor }) {
  const issues = [];
  const at = (row, field, issue, outcome, code, fix, severity = 'flag') =>
    issues.push({ file, sheet, row, field, issue, outcome, code, fix, severity });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const hs = (grid[i] || []).map(normHeader);
    if (hs.includes(anchor) && hs.filter(h => columns.includes(h)).length >= 2) { headerIdx = i; break; }
  }
  if (headerIdx < 0) {
    at('—', '—', `Couldn't find the header row (looked for a row containing "${anchor}")`, 'File not processed', 'D3',
      'Use the template: column names exactly as in the template, in the first rows of the sheet', 'stop');
    return { records: [], issues, headers: [] };
  }
  const headers = grid[headerIdx].map(normHeader);
  const missing = required.filter(c => !headers.includes(c));
  missing.forEach(c => at(headerIdx + 1, c, `Required column "${c}" is missing`,
    c === anchor ? 'File not processed' : 'Every row is treated as having this field blank', 'D3',
    `Add the "${c}" column, named exactly as in the template`, c === anchor ? 'stop' : 'flag'));
  headers.forEach((h, i) => {
    if (h && !columns.includes(h)) at(headerIdx + 1, clean(grid[headerIdx][i]), `Column "${clean(grid[headerIdx][i])}" isn't in the template`,
      'Ignored', '—', 'Remove it, or rename it to a template column if it was meant to be one', 'info');
  });
  if (missing.includes(anchor)) return { records: [], issues, headers };
  const records = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const raw = grid[i] || [];
    if (!raw.some(v => cellToString(v) !== '')) continue;
    const rec = { __row: i + 1 };
    headers.forEach((h, j) => { if (columns.includes(h)) rec[h] = cellToString(raw[j]); });
    // The template's third row holds format hints ("Text*", "Email* (or LinkedIn URL)"): not data.
    const starred = Object.values(rec).filter(v => typeof v === 'string' && /\*/.test(v)).length;
    if (i === headerIdx + 1 && starred >= 2) {
      at(i + 1, '—', "Row holds the template's format hints, not data", 'Skipped', '—', 'Nothing to fix', 'info');
      continue;
    }
    records.push(rec);
  }
  return { records, issues, headers };
}

/* ─── Stages 1–5: lead file → screened list ─── */
function parseNumber(raw) {
  const s = clean(raw);
  if (!s) return { value: null };
  if (/^\d+(\.\d+)?$/.test(s)) return { value: Number(s) };
  const stripped = s.replace(/[,\s$€£]|usd/gi, '');
  if (/^\d+(\.\d+)?$/.test(stripped)) return { value: Number(stripped), reformatted: true };
  return { value: null, invalid: true };
}

function personaOf(title) {
  const t = clean(title);
  if (CONFIG.personas.primary.some(re => re.test(t))) return 'Primary';
  if (CONFIG.personas.secondary.some(re => re.test(t))) return 'Secondary';
  return 'None';
}

function processLeads(grid, { file = 'lead file', sheet = 'Sheet1' } = {}) {
  const table = readTable(grid, { file, sheet, columns: LEAD_COLUMNS, required: LEAD_REQUIRED, anchor: 'company_name' });
  const issues = table.issues.slice();
  const at = (row, field, issue, outcome, code, fix, severity = 'flag') =>
    issues.push({ file, sheet, row, field, issue, outcome, code, fix, severity });
  const missingCols = new Set(LEAD_REQUIRED.filter(c => !table.headers.includes(c)));

  const contacts = [];
  const byEmail = new Map(), byLinkedIn = new Map();
  let notLoaded = 0, merged = 0;

  for (const r of table.records) {
    const row = r.__row;
    const req = (f, issue, outcome, fix, severity = 'flag') => {
      if (!clean(r[f]) && !missingCols.has(f)) { at(row, f, issue, outcome, 'D3', fix, severity); return true; }
      return false;
    };
    if (req('company_name', 'Company name is missing', "Row not loaded: it can't be grouped into an account",
      'Add the company name, written the same way as on the other rows for this company', 'stop')) { notLoaded++; continue; }

    const c = {
      row, firstName: clean(r.first_name), lastName: clean(r.last_name), jobTitle: clean(r.job_title),
      seniority: clean(r.seniority), company: clean(r.company_name), companyKey: normKey(r.company_name),
      domain: clean(r.company_domain).toLowerCase(), country: clean(r.country), city: clean(r.city),
      industry: clean(r.industry), siteName: clean(r.site_name), siteProcess: clean(r.site_process_type),
      siteCapacity: clean(r.site_capacity), capacityUnit: clean(r.capacity_unit), owner: clean(r.owner_email).toLowerCase(),
      email: '', emailRaw: clean(r.email), emailVerified: false, linkedin: '', linkedinRaw: clean(r.linkedin_url),
      flags: [],
    };
    c.name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '(no name)';

    req('first_name', 'First name is missing', 'Loaded; the draft greeting will need editing', 'Add the first name');
    req('last_name', 'Last name is missing', 'Loaded', 'Add the last name');
    req('job_title', 'Job title is missing', 'Loaded; persona set to none', 'Add the job title');
    c.persona = personaOf(c.jobTitle);

    // Domain
    if (!req('company_domain', 'Company domain is missing', 'Loaded; signals can only be matched by company name', 'Add the website domain, e.g. company.com')
      && c.domain && (/\s|https?:|\//.test(c.domain) || !c.domain.includes('.'))) {
      at(row, 'company_domain', `Domain "${c.domain}" isn't in the form company.com`, 'Loaded; domain not used for matching', 'D3', 'Write the bare domain, e.g. company.com');
    }

    // Email and verification
    if (c.emailRaw) {
      if (EMAIL_RE.test(c.emailRaw)) {
        c.email = normEmail(c.emailRaw);
        const v = yesNo(r.email_verified);
        if (v === null) at(row, 'email_verified', `"${clean(r.email_verified)}" isn't Y or N`, 'Email treated as not verified, so not used as a channel', 'D3', 'Use Y or N');
        else if (v !== 'Y') at(row, 'email_verified', 'Email not verified', 'Email not used as a channel', '—', 'Verify the address and set email_verified to Y', 'info');
        c.emailVerified = v === 'Y';
      } else {
        at(row, 'email', `Email "${c.emailRaw}" is malformed`, c.linkedinRaw ? 'Email not used; LinkedIn only' : 'Email not used', 'D3', 'Correct the address');
      }
    }
    // LinkedIn
    if (c.linkedinRaw) {
      if (LINKEDIN_RE.test(c.linkedinRaw)) c.linkedin = normLinkedIn(c.linkedinRaw);
      else at(row, 'linkedin_url', `LinkedIn URL "${c.linkedinRaw}" isn't a profile URL`, 'LinkedIn not used', 'D3', 'Use the full profile URL, e.g. https://www.linkedin.com/in/name');
    }
    if (!c.emailRaw && !c.linkedinRaw) {
      at(row, 'email / linkedin_url', 'No email and no LinkedIn URL', 'Kept on the account, not contactable', 'D3', 'Add a work email or a LinkedIn URL');
    } else if (!c.emailRaw && c.linkedin) {
      at(row, 'email', 'No email', 'LinkedIn only', '—', 'Add a verified work email if one is held', 'info');
    } else if (!c.linkedinRaw && c.email) {
      at(row, 'linkedin_url', 'No LinkedIn URL', c.emailVerified ? 'Email only' : 'No usable channel until the email is verified', '—', 'Add the LinkedIn profile URL if one is held', 'info');
    }

    // Duplicates (same email or LinkedIn URL): merged into the first row, blanks filled from the repeat
    const dupOf = (c.email && byEmail.get(c.email)) || (c.linkedin && byLinkedIn.get(c.linkedin));
    if (dupOf) {
      at(row, c.email && byEmail.get(c.email) ? 'email' : 'linkedin_url', `Duplicate of row ${dupOf.row} (${dupOf.name})`,
        `Merged into row ${dupOf.row}`, 'D5', 'Remove the repeated row');
      for (const k of Object.keys(c)) if (k !== 'row' && k !== 'flags' && !dupOf[k] && c[k]) dupOf[k] = c[k];
      merged++;
      continue;
    }

    // Company-level fields (validated per row; the account uses its first row)
    req('country', 'Country is missing', 'The account fails the region check', 'Add the country');
    req('industry', 'Industry is missing', 'Vertical set to other, held for review', 'Add the industry as held');
    const rev = parseNumber(r.annual_revenue_usd), emp = parseNumber(r.employee_count);
    [['annual_revenue_usd', rev], ['employee_count', emp]].forEach(([f, n]) => {
      if (n.reformatted) at(row, f, `"${clean(r[f])}" has commas or a currency symbol`, `Read as ${n.value}`, 'D3', 'Write numbers without commas or currency symbols');
      if (n.invalid) at(row, f, `"${clean(r[f])}" isn't a number`, 'Treated as not provided', 'D3', 'Write a plain number, e.g. 2400000000');
    });
    c.revenue = rev.value; c.employees = emp.value;
    if (c.revenue === null && c.employees === null && !rev.invalid && !emp.invalid) {
      at(row, 'annual_revenue_usd / employee_count', 'No company size', 'Company size scores 0 in fit', 'D3', 'Add revenue, or employees if revenue is unknown');
    }

    const at0 = clean(r.account_type).toLowerCase();
    if (!at0) { c.accountType = 'other'; at(row, 'account_type', 'Account type is blank', 'Scores 0 for account type', '—', 'Choose from the list', 'info'); }
    else if (CONFIG.accountTypes[at0]) c.accountType = at0;
    else { c.accountType = 'other'; at(row, 'account_type', `"${clean(r.account_type)}" isn't on the list`, 'Treated as Other', 'D3', 'Choose Owner-operator, EPC contractor, System integrator, Distributor or Other'); }

    const yn = (f, blankOutcome) => {
      if (missingCols.has(f)) return '';
      const v = yesNo(r[f]);
      if (v === null) { at(row, f, `"${clean(r[f])}" isn't Y or N`, blankOutcome, 'D3', 'Use Y or N'); return ''; }
      if (v === '') at(row, f, `${f} is blank`, blankOutcome, 'D3', 'Use Y or N');
      return v;
    };
    c.existingCustomer = yn('existing_customer', 'Treated as N (no relationship); confirm') === 'Y';
    c.managedSeparately = yn('managed_separately', 'Treated as N; confirm before any outreach') === 'Y';
    const opt = yn('opt_out', "Can't confirm the contact hasn't opted out: not contactable");
    c.optOut = opt === 'Y';
    c.optOutUnknown = opt === '';
    if (c.optOut) at(row, 'opt_out', 'Opted out', 'Suppressed: never contacted', '—', 'Nothing to fix', 'info');

    const consent = clean(r.consent_basis);
    c.consent = consent;
    c.consentOk = CONFIG.consentBases.includes(consent.toLowerCase());
    if (!consent) { if (!missingCols.has('consent_basis')) at(row, 'consent_basis', 'No consent basis', 'Not contactable', 'D3', 'Add legitimate interest, existing customer or opted in'); }
    else if (!c.consentOk) at(row, 'consent_basis', `"${consent}" isn't a recognised basis`, 'Not contactable until confirmed', 'D3', 'Use legitimate interest, existing customer or opted in');

    if (!c.owner) { if (!missingCols.has('owner_email')) at(row, 'owner_email', 'No owner rep', 'Only the sales manager sees this account', 'D3', "Add the assigned rep's email"); }
    else if (!EMAIL_RE.test(c.owner)) at(row, 'owner_email', `Owner "${c.owner}" isn't an email`, 'Only the sales manager sees this account', 'D3', "Use the rep's work email");

    contacts.push(c);
    if (c.email) byEmail.set(c.email, c);
    if (c.linkedin) byLinkedIn.set(c.linkedin, c);
  }

  // Reachability and contactability
  for (const c of contacts) {
    const emailOk = !!c.email && c.emailVerified, liOk = !!c.linkedin;
    c.reachableBy = emailOk && liOk ? 'email and LinkedIn' : emailOk ? 'email' : liOk ? 'LinkedIn' : 'none';
    c.contactable = c.reachableBy !== 'none' && c.consentOk && !c.optOut && !c.optOutUnknown;
  }

  const accounts = buildAccounts(contacts, issues, { file, sheet });
  const stats = {
    rowsRead: table.records.length, notLoaded, merged, contacts: contacts.length,
    accounts: accounts.length, accountsPass: accounts.filter(a => !a.excluded).length,
    inFinalList: contacts.filter(c => c.status === 'In the final list').length,
    issues: issues.length,
    issuesBySeverity: ['stop', 'flag', 'info'].reduce((o, s) => (o[s] = issues.filter(i => i.severity === s).length, o), {}),
  };
  return { contacts, accounts, issues, stats };
}

/* Stage 3 classification and stage 4 knock-outs, per account */
function classify(industry, siteProcess) {
  const hit = s => s ? CONFIG.verticalMap.find(m => m.pattern.test(s)) : null;
  const a = hit(industry), b = hit(siteProcess);
  if (a && b && a.vertical === b.vertical) return { vertical: a.vertical, level: a.level, confidence: 'high', reason: `Industry "${industry}" and site process "${siteProcess}" both map to ${a.vertical}` };
  if (a && b) return { vertical: a.vertical, level: a.level, confidence: 'medium', reason: `Industry maps to ${a.vertical}, site process to ${b.vertical}; industry used` };
  if (a || b) {
    const m = a || b, src = a ? `industry "${industry}"` : `site process "${siteProcess}"`;
    return { vertical: m.vertical, level: m.level, confidence: 'medium', reason: `From the ${src} only` };
  }
  // Spec: with no lookup match, the AI classifier chooses. Not connected in this prototype.
  return { vertical: 'Other', level: 'other', confidence: 'low', needsReview: true,
    reason: `"${industry || '—'}" has no match in the mapping table. The AI classifier would decide here; it isn't connected yet, so this is held as other for review` };
}

function buildAccounts(contacts, issues, { file, sheet }) {
  const map = new Map();
  for (const c of contacts) {
    if (!map.has(c.companyKey)) map.set(c.companyKey, []);
    map.get(c.companyKey).push(c);
  }
  const accounts = [];
  for (const [key, cs] of map) {
    const f = cs[0];
    // Company details should repeat identically on every contact row; say so when they don't.
    const fields = [['country', 'country'], ['industry', 'industry'], ['revenue', 'annual_revenue_usd'], ['employees', 'employee_count'],
      ['accountType', 'account_type'], ['existingCustomer', 'existing_customer'], ['managedSeparately', 'managed_separately']];
    for (const [k, col] of fields) {
      const other = cs.find(c => String(c[k]) !== String(f[k]));
      if (other) issues.push({ file, sheet, row: other.row, field: col, issue: `Differs from row ${f.row} for ${f.company}`,
        outcome: `Row ${f.row}'s value used for the account`, code: 'D3', fix: 'Repeat the same company details on every contact row', severity: 'flag' });
    }
    const cls = classify(f.industry, f.siteProcess);
    const a = {
      id: 'acc-' + accounts.length, key, name: f.company, domain: f.domain, country: f.country, city: f.city,
      industry: f.industry, revenue: f.revenue, employees: f.employees, accountType: f.accountType,
      existingCustomer: f.existingCustomer, managedSeparately: f.managedSeparately,
      siteName: f.siteName, siteProcess: f.siteProcess, siteCapacity: f.siteCapacity, capacityUnit: f.capacityUnit,
      owner: f.owner, vertical: cls.vertical, verticalLevel: cls.level, confidence: cls.confidence,
      classReason: cls.reason, needsReview: !!cls.needsReview, contactIds: cs.map(c => c.row),
    };
    // Stage 4: yes-or-no rules, in order. The installed-base rule needs the signal file, so it runs in Scoring.
    const inRegion = CONFIG.pilotCountries.some(p => p.toLowerCase() === a.country.toLowerCase());
    a.checks = [
      { rule: 'In the pilot region', pass: inRegion, why: inRegion ? a.country : `Outside the pilot region (${a.country || 'no country'})` },
      { rule: 'Not managed separately', pass: !a.managedSeparately, why: a.managedSeparately ? 'Managed separately by Client' : 'Not managed separately' },
      { rule: 'Pilot product not installed at the site', pass: null, why: 'Checked in Scoring, from the installed-base rows of the signal file' },
      { rule: 'At least one contact left after suppression', pass: cs.some(c => !c.optOut), why: cs.some(c => !c.optOut) ? `${cs.filter(c => !c.optOut).length} contact(s) not opted out` : 'No contactable contacts after suppression' },
    ];
    const failed = a.checks.find(k => k.pass === false);
    a.excluded = !!failed;
    a.excludedReason = failed ? failed.why : '';
    accounts.push(a);
    for (const c of cs) {
      c.accountId = a.id;
      if (a.excluded) c.status = `Not in the list: account excluded (${a.excludedReason})`;
      else if (c.optOut) c.status = 'Not in the list: opted out';
      else if (!c.contactable) c.status = `In the list, not contactable (${notContactableWhy(c)})`;
      else c.status = 'In the final list';
    }
  }
  return accounts;
}

function notContactableWhy(c) {
  if (c.reachableBy === 'none') return 'no usable email or LinkedIn';
  if (!c.consentOk) return 'no consent basis';
  if (c.optOutUnknown) return 'opt-out not confirmed';
  return 'see issues';
}

/* ─── Stage 6: weighted fit ─── */
function fitFor(account, contacts) {
  const b = CONFIG.sizeBands;
  let size, sizeWhy;
  if (account.revenue !== null && account.revenue !== undefined) {
    size = account.revenue >= b.revenueAbove ? 100 : account.revenue >= b.revenueIn ? 70 : 20;
    sizeWhy = `Revenue USD ${fmtMoney(account.revenue)}`;
  } else if (account.employees !== null && account.employees !== undefined) {
    size = account.employees >= b.employeesAbove ? 100 : account.employees >= b.employeesIn ? 70 : 20;
    sizeWhy = `${account.employees.toLocaleString('en-US')} employees (no revenue given)`;
  } else { size = 0; sizeWhy = 'No size given'; }
  const sizeLbl = size === 100 ? 'Above target' : size === 70 ? 'In target' : size === 20 ? 'Below target' : 'Not provided';

  const siteHit = account.siteProcess ? CONFIG.verticalMap.find(m => m.pattern.test(account.siteProcess)) : null;
  const site = !account.siteProcess ? 30 : siteHit && siteHit.level === 'core' ? 100 : 50;
  const siteLbl = site === 100 ? 'Suits the product' : site === 50 ? 'Partly' : 'Unknown';
  const siteWhy = account.siteProcess
    ? [account.siteName, account.siteProcess, account.siteCapacity && `${Number(account.siteCapacity).toLocaleString('en-US')} ${account.capacityUnit}`].filter(Boolean).join(' · ')
    : 'No site given';

  const live = contacts.filter(c => !c.optOut);
  const coverage = live.some(c => c.persona === 'Primary') ? 100 : live.length ? 40 : 0;
  const at = CONFIG.accountTypes[account.accountType] || CONFIG.accountTypes.other;
  const vLevel = { core: 100, adjacent: 50, other: 0 }[account.verticalLevel];

  const levels = {
    vertical: { level: vLevel, levelLabel: `${account.vertical} (${account.verticalLevel})`, why: account.classReason },
    size: { level: size, levelLabel: sizeLbl, why: sizeWhy },
    site: { level: site, levelLabel: siteLbl, why: siteWhy },
    relationship: { level: account.existingCustomer ? 100 : 40, levelLabel: account.existingCustomer ? 'Existing customer' : 'None', why: account.existingCustomer ? 'existing_customer = Y' : 'existing_customer = N' },
    accountType: { level: at.level, levelLabel: at.label, why: account.accountType },
    contacts: { level: coverage, levelLabel: coverage === 100 ? 'Buying role present' : coverage === 40 ? 'Other roles only' : 'None',
      why: live.filter(c => c.persona === 'Primary').map(c => c.jobTitle).join(', ') || live.map(c => c.jobTitle).join(', ') || 'No contacts' },
  };
  const breakdown = CONFIG.rubric.map(r => ({ ...r, ...levels[r.key], points: levels[r.key].level * r.weight / 100 }));
  const fit = round1(breakdown.reduce((s, x) => s + x.points, 0));
  return { fit, breakdown, belowFloor: fit < CONFIG.fitFloor };
}

function fmtMoney(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 ? 1 : 0) + 'bn';
  if (n >= 1e6) return Math.round(n / 1e6) + 'm';
  return n.toLocaleString('en-US');
}

/* ─── Stage 7: signal intake and qualification, per person ─── */
function decayFactor(type, age) {
  if (age <= type.full) return 1;
  if (age >= type.zero) return 0;
  return (type.zero - age) / (type.zero - type.full);
}

function processSignals(grid, list, { file = 'signal file', sheet = 'Sheet1', asOf } = {}) {
  const table = readTable(grid, { file, sheet, columns: SIGNAL_COLUMNS, required: SIGNAL_REQUIRED, anchor: 'signal_type' });
  const issues = table.issues.slice();
  const accountsByKey = new Map(list.accounts.map(a => [a.key, a]));
  const contactsByAcc = new Map();
  for (const c of list.contacts) {
    if (!contactsByAcc.has(c.accountId)) contactsByAcc.set(c.accountId, []);
    contactsByAcc.get(c.accountId).push(c);
  }
  const knockouts = new Map(); // accountId -> reason
  const seen = new Map();
  const signals = [];
  const suggested = [];
  let n = 0;

  for (const r of table.records) {
    n++;
    const s = {
      id: 'SIG-' + String(n).padStart(2, '0'), row: r.__row, company: clean(r.company_name),
      personRef: clean(r.contact_email_or_linkedin), type: clean(r.signal_type), date: clean(r.event_date),
      detail: clean(r.detail), source: clean(r.source), product: clean(r.product),
      status: '', code: '', reason: '', assigned: '', personName: '', accountId: null, contactRow: null,
    };
    signals.push(s);
    const reject = (code, reason, field, fix) => {
      s.status = 'Rejected'; s.code = code; s.reason = reason;
      issues.push({ file, sheet, row: s.row, field, issue: reason, outcome: `Rejected (${code} ${CODES[code]})`, code, fix, severity: 'flag' });
    };

    // 1. Match to the account by company, then to the person by email or LinkedIn URL
    const acc = accountsByKey.get(normKey(s.company));
    if (!s.company) { reject('D3', 'No company name', 'company_name', 'Add the company name as in the lead file'); continue; }
    if (!acc) { reject('D4', 'Company is not in the target universe', 'company_name', 'Use the company name exactly as in the lead file, or add the company to the lead file'); continue; }
    s.accountId = acc.id;
    const cs = contactsByAcc.get(acc.id) || [];
    const typeCfg = CONFIG.signalTypes[s.type] || CONFIG.signalTypes[Object.keys(CONFIG.signalTypes).find(k => k.toLowerCase() === s.type.toLowerCase())];
    if (typeCfg) s.type = Object.keys(CONFIG.signalTypes).find(k => CONFIG.signalTypes[k] === typeCfg);

    // Installed system (current) is company-wide: it knocks the account out, whoever is named.
    if (typeCfg && typeCfg.knockout) {
      s.status = 'Used for a knock-out'; s.reason = 'Current pilot product installed: account excluded';
      knockouts.set(acc.id, `Pilot product already installed at the site${s.product ? ` (${s.product})` : ''}`);
      continue;
    }

    let person = null;
    if (s.personRef) {
      const ref = s.personRef.includes('@') ? normEmail(s.personRef) : normLinkedIn(s.personRef);
      person = cs.find(c => (c.email && c.email === ref) || (c.linkedin && c.linkedin === ref) || normEmail(c.emailRaw) === ref);
      if (!person) {
        reject('D4', `Person ${s.personRef} is not in the lead file for this account (sent back as a suggested new contact)`, 'contact_email_or_linkedin', 'Add this person to the lead file, or correct the email or LinkedIn URL');
        suggested.push({ company: acc.name, person: s.personRef, signal: s.type, row: s.row });
        continue;
      }
      s.assigned = 'Named in the file';
    } else {
      const live = cs.filter(c => !c.optOut);
      person = live.find(c => c.persona === 'Primary') || live[0];
      if (!person) { reject('D4', 'No person named and no contact left at this account', 'contact_email_or_linkedin', 'Name the person this signal concerns'); continue; }
      s.assigned = person.persona === 'Primary' ? 'Auto-assigned to the primary-persona contact' : 'Auto-assigned (no primary-persona contact)';
      issues.push({ file, sheet, row: s.row, field: 'contact_email_or_linkedin', issue: 'No person named',
        outcome: `Attached to ${person.name} (${person.jobTitle}), flagged as auto-assigned`, code: '—', fix: 'Name the contact responsible for this event', severity: 'info' });
    }
    s.personName = person.name; s.contactRow = person.row;

    // 2. Date
    if (!s.date) { reject('D3', 'No event date', 'event_date', 'Add the date it happened, as YYYY-MM-DD'); continue; }
    if (parseIsoDate(s.date) === null) { reject('D3', `Event date "${s.date}" isn't YYYY-MM-DD`, 'event_date', 'Write the date as YYYY-MM-DD'); continue; }
    s.age = daysBetween(s.date, asOf);
    if (s.age < 0) { reject('D3', `Event date ${s.date} is after the scoring date ${asOf}`, 'event_date', 'Check the date'); continue; }

    // 3. Type
    if (!typeCfg) { reject('D3', `Signal type "${s.type}" isn't on the list`, 'signal_type', 'Choose the type from the list in the template'); continue; }
    if (typeCfg.reject) { reject(typeCfg.reject, "Doesn't predict buying the pilot product", 'signal_type', 'Nothing to fix: this type is not scored'); continue; }

    // 4. Duplicate
    const dupKey = [acc.id, person.row, s.type, s.date].join('|');
    if (seen.has(dupKey)) { reject('D5', `Same event already recorded (${seen.get(dupKey)})`, 'signal_type', 'Remove the repeated row'); continue; }
    seen.set(dupKey, s.id);

    // 5. Stale
    if (s.age >= typeCfg.zero) { reject('D2', `${s.age} days old; this signal type counts for ${typeCfg.zero} days`, 'event_date', 'Nothing to fix: past its window'); continue; }

    // 6. Qualified: weight = tier weight × strength × decay
    s.status = 'Qualified';
    s.code = typeCfg.code; s.tier = typeCfg.tier; s.strength = typeCfg.strength; s.segment = typeCfg.segment;
    s.decay = decayFactor(typeCfg, s.age);
    s.weight = s.tier * s.strength * s.decay;
    s.window = `full for ${typeCfg.full} days, zero at ${typeCfg.zero}`;
    if (!s.detail) issues.push({ file, sheet, row: s.row, field: 'detail', issue: 'No detail', outcome: 'Qualified; the why-now line can only name the type', code: '—', fix: 'Say what happened', severity: 'info' });
  }
  return { signals, issues, knockouts, suggested, rowsRead: table.records.length };
}

/* ─── Stage 8: timing, rank and reasoning ─── */
function stack(weights) {
  return weights.slice().sort((a, b) => b - a).reduce((sum, w, i) => sum + w * Math.pow(0.5, i), 0);
}

function tierFor(rank, hasSignal) {
  if (!hasSignal) return 'Watch list';
  if (rank >= CONFIG.tierThresholds.A) return 'A';
  if (rank >= CONFIG.tierThresholds.B) return 'B';
  return 'C';
}

function scoreList(list, signalResult) {
  const results = [];
  const contactsByAcc = new Map();
  for (const c of list.contacts) {
    if (!contactsByAcc.has(c.accountId)) contactsByAcc.set(c.accountId, []);
    contactsByAcc.get(c.accountId).push(c);
  }
  for (const a of list.accounts) {
    const cs = contactsByAcc.get(a.id) || [];
    const ko = signalResult.knockouts.get(a.id);
    const res = { account: a, contacts: cs, excluded: a.excluded || !!ko, excludedReason: a.excludedReason || ko || '' };
    if (!res.excluded) Object.assign(res, fitFor(a, cs));
    const own = signalResult.signals.filter(s => s.accountId === a.id && s.status === 'Qualified');
    if (res.excluded || res.belowFloor) {
      own.forEach(s => { s.status = 'Not used'; s.reason = res.excluded ? `Qualified, but the account is excluded (${res.excludedReason})` : 'Qualified, but the account is below the fit floor'; });
      res.tier = res.excluded ? 'Excluded' : 'Below fit floor';
      results.push(res);
      continue;
    }
    // Person signal score, then account timing over everyone's signals
    res.people = cs.filter(c => !c.optOut).map(c => {
      const sigs = own.filter(s => s.contactRow === c.row).sort((x, y) => y.weight - x.weight);
      const raw = stack(sigs.map(s => s.weight));
      return { contact: c, signals: sigs, raw: round1(raw), score: round1(raw / CONFIG.timingMax * 100) };
    }).sort((x, y) => y.raw - x.raw || (x.contact.persona === 'Primary' ? -1 : 0) - (y.contact.persona === 'Primary' ? -1 : 0));
    // Everything on 0–100: timing as a share of its maximum, score = fit × timing ÷ 100.
    // The stage sheet's rank (fit ÷ 100 × raw timing, which reaches 200) is kept for traceability.
    const rawTiming = stack(own.map(s => s.weight));
    res.timingRaw = round1(rawTiming);
    res.rank = round1(res.fit / 100 * rawTiming);
    res.timing = round1(rawTiming / CONFIG.timingMax * 100);
    res.score = round1(res.fit * (rawTiming / CONFIG.timingMax * 100) / 100);
    res.signalCount = own.length;
    res.tier = tierFor(res.score, own.length > 0);
    // Each prospect scored on their own evidence: account fit × their timing, with their own why-now.
    res.people.forEach(p => {
      p.timing = p.score;
      p.final = round1(res.fit * p.timing / 100);
      p.tier = tierFor(p.final, p.signals.length > 0);
      p.whyNow = p.signals.slice(0, 2).map((s, i) => `${i ? 'also ' : ''}${lowerFirst(s.detail || s.type)}`).join('; ');
    });
    const hasPrimary = cs.some(c => !c.optOut && c.persona === 'Primary');
    res.confidence = !hasPrimary ? 'low' : own.length >= 2 ? 'high' : 'medium';
    res.confidenceWhy = !hasPrimary ? 'No contact in the primary persona' : own.length >= 2 ? `${own.length} qualified signals and a primary-persona contact` : 'Only one qualified signal';
    // Why-now line: the spec has AI word it from the evidence; until that's connected it's filled from a template.
    const top = own.slice().sort((x, y) => y.weight - x.weight).slice(0, 2);
    res.whyNow = top.map((s, i) => `${i ? 'also ' : ''}${s.personName}: ${lowerFirst(s.detail || s.type)}`).join('; ');
    res.whyNowSources = top.map(s => `${s.source || 'no source'}, ${s.date}`);
    res.segment = top[0] ? top[0].segment : '';
    results.push(res);
  }
  const order = { A: 0, B: 1, C: 2, 'Watch list': 3, 'Below fit floor': 4, Excluded: 5 };
  results.sort((x, y) => order[x.tier] - order[y.tier] || (y.score || 0) - (x.score || 0) || (y.fit || 0) - (x.fit || 0));
  return results;
}

function lowerFirst(s) { return s && /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; }


/* ─── Micro-segments straight from a file: prospects with their signals, one row per signal ───
   For lists scored outside the platform. The score column is optional: without it, a prospect's score is
   their timing alone (signals weighted and stacked as in Scoring), since there's no fit rubric to apply. */
const SEGMENT_COLUMNS = ['first_name', 'last_name', 'job_title', 'email', 'email_verified', 'linkedin_url', 'company_name',
  'industry', 'country', 'existing_customer', 'consent_basis', 'score', 'signal_type', 'event_date', 'detail', 'source', 'owner_email'];
const SEGMENT_REQUIRED = ['first_name', 'company_name', 'signal_type', 'event_date'];
function processScoredProspects(grid, { file = 'prospect file', sheet = 'Sheet1', asOf } = {}) {
  const table = readTable(grid, { file, sheet, columns: SEGMENT_COLUMNS, required: SEGMENT_REQUIRED, anchor: 'signal_type' });
  const issues = table.issues.slice();
  const at = (row, field, issue, outcome, code, fix, severity = 'flag') => issues.push({ file, sheet, row, field, issue, outcome, code, fix, severity });
  const accounts = new Map(), people = new Map(), seen = new Set();
  let rejected = 0;
  for (const r of table.records) {
    const row = r.__row, company = clean(r.company_name), first = clean(r.first_name);
    if (!company || !first) { at(row, !company ? 'company_name' : 'first_name', 'Company or first name missing', 'Row not used', 'D3', 'Fill in both'); rejected++; continue; }
    const type = clean(r.signal_type), cfg = CONFIG.signalTypes[type], date = clean(r.event_date);
    const bad = (field, issue, code, fix) => { at(row, field, issue, 'Signal not used', code, fix); rejected++; };
    if (!cfg) { bad('signal_type', `Signal type "${type}" isn't on the list`, 'D3', 'Choose the type from the template list'); continue; }
    if (cfg.reject || cfg.knockout) { bad('signal_type', `"${type}" isn't used for segments`, 'D1', 'Nothing to fix'); continue; }
    if (parseIsoDate(date) === null) { bad('event_date', `Event date "${date}" isn't YYYY-MM-DD`, 'D3', 'Write the date as YYYY-MM-DD'); continue; }
    const age = daysBetween(date, asOf);
    if (age < 0) { bad('event_date', `Event date ${date} is after ${asOf}`, 'D3', 'Check the date'); continue; }
    if (age >= cfg.zero) { bad('event_date', `${age} days old; ${type} counts for ${cfg.zero} days`, 'D2', 'Nothing to fix: past its window'); continue; }
    const accKey = normKey(company);
    if (!accounts.has(accKey)) {
      const cls = classify(clean(r.industry), '');
      accounts.set(accKey, { id: 'acc-' + (accounts.size + 1), key: accKey, name: company, vertical: cls.vertical, verticalLevel: cls.level,
        country: clean(r.country), existingCustomer: yesNo(r.existing_customer) === 'Y' });
    }
    const acc = accounts.get(accKey);
    const email = EMAIL_RE.test(clean(r.email)) ? normEmail(r.email) : '', li = LINKEDIN_RE.test(clean(r.linkedin_url)) ? clean(r.linkedin_url) : '';
    const pKey = acc.id + '|' + (email || normLinkedIn(li) || normKey(first + ' ' + clean(r.last_name)));
    if (!people.has(pKey)) {
      const consent = clean(r.consent_basis);
      const c = { row, firstName: first, lastName: clean(r.last_name), jobTitle: clean(r.job_title), email, emailRaw: clean(r.email),
        emailVerified: !!email && yesNo(r.email_verified) === 'Y', linkedin: li, linkedinRaw: clean(r.linkedin_url), country: clean(r.country),
        consent, consentOk: CONFIG.consentBases.includes(consent.toLowerCase()), optOut: false, owner: clean(r.owner_email).toLowerCase(), accountId: acc.id };
      c.name = [c.firstName, c.lastName].filter(Boolean).join(' ');
      c.persona = personaOf(c.jobTitle);
      if (!c.consentOk) at(row, 'consent_basis', consent ? `"${consent}" isn't a recognised basis` : 'No consent basis', 'Call only', 'D3', 'Use legitimate interest, existing customer or opted in', 'info');
      const sc = parseNumber(r.score);
      people.set(pKey, { contact: c, account: acc, signals: [], given: sc.value !== null && sc.value >= 0 && sc.value <= 100 ? sc.value : null });
      if (clean(r.score) && (sc.value === null || sc.value < 0 || sc.value > 100)) at(row, 'score', `Score "${clean(r.score)}" isn't 0–100`, 'Score worked out from the signals', 'D3', 'Use a number from 0 to 100', 'info');
    }
    const p = people.get(pKey);
    const dup = [pKey, type, date].join('|');
    if (seen.has(dup)) { bad('signal_type', 'Same event already in the file', 'D5', 'Remove the repeated row'); continue; }
    seen.add(dup);
    const decay = decayFactor(cfg, age);
    p.signals.push({ id: 'SIG-' + row, row, type, date, age, detail: clean(r.detail), source: clean(r.source), segment: cfg.segment,
      tier: cfg.tier, strength: cfg.strength, decay, weight: cfg.tier * cfg.strength * decay, personName: p.contact.name, status: 'Qualified' });
  }
  const results = [...accounts.values()].map(account => {
    const ps = [...people.values()].filter(p => p.account === account && p.signals.length).map(p => {
      p.signals.sort((x, y) => y.weight - x.weight);
      const raw = stack(p.signals.map(s => s.weight)), timing = round1(raw / CONFIG.timingMax * 100);
      const final = p.given !== null ? p.given : timing;
      return { contact: p.contact, signals: p.signals, raw: round1(raw), score: timing, timing, final, scoreFrom: p.given !== null ? 'file' : 'signals',
        tier: tierFor(final, true), whyNow: p.signals.slice(0, 2).map((s, i) => `${i ? 'also ' : ''}${lowerFirst(s.detail || s.type)}`).join('; ') };
    }).sort((a, b) => b.final - a.final);
    const signalCount = ps.reduce((t, p) => t + p.signals.length, 0);
    const hasPrimary = ps.some(p => p.contact.persona === 'Primary');
    const best = ps[0];
    return { account, contacts: ps.map(p => p.contact), people: ps, signalCount, score: best ? best.final : undefined, tier: best ? best.tier : 'Watch list',
      confidence: !hasPrimary ? 'low' : signalCount >= 2 ? 'high' : 'medium', confidenceWhy: !hasPrimary ? 'No contact in the primary persona' : '' };
  }).filter(r => r.people.length);
  return { results, issues, stats: { rowsRead: table.records.length, rejected, prospects: results.reduce((t, r) => t + r.people.length, 0), accounts: results.length } };
}

/* ─── Stage 9: micro-segments and next best action ───
   Each account goes to the segment of its strongest signal. A segment forms only with at least
   CONFIG.minSegmentAccounts distinct accounts; an account whose strongest signal doesn't reach that falls
   back to its next signal. No account appears in two segments. Accounts left over are exceptions. */
function segmentRanks(r) {
  const best = new Map();
  for (const p of r.people || []) for (const sg of p.signals) {
    const seg = (CONFIG.signalTypes[sg.type] || {}).segment;
    if (seg && (!best.has(seg) || sg.weight > best.get(seg).weight)) best.set(seg, sg);
  }
  return [...best.entries()].sort((a, b) => b[1].weight - a[1].weight).map(([segment, signal]) => ({ segment, signal }));
}

function buildSegments(results, opts = {}) {
  const min = opts.min || CONFIG.minSegmentAccounts;
  const keep = opts.keys ? new Set(opts.keys) : null;
  const accounts = results.filter(r => r.people && r.signalCount > 0)
    .map(r => ({ r, ranks: segmentRanks(r) }))
    .filter(a => a.ranks.length && (!keep || a.r.people.some(p => keep.has(a.r.account.id + '|' + p.contact.row))));
  // 5.9 Engage-once: an account already recommended in this pilot is set aside as a process rule, not a low score.
  const engaged = opts.engaged || new Map();
  const engagedOnce = [];
  for (let i = accounts.length - 1; i >= 0; i--) {
    const label = engaged.get(accounts[i].r.account.name.toLowerCase());
    if (label) { engagedOnce.unshift({ result: accounts[i].r, account: accounts[i].r.account, label, prominent: accounts[i].ranks[0] }); accounts.splice(i, 1); }
  }
  const assigned = new Map(); // account id -> { segment, rank }
  const formed = new Map();   // segment -> [account ids]
  const maxK = Math.max(0, ...accounts.map(a => a.ranks.length));
  for (let k = 1; k <= maxK; k++) {
    for (;;) {
      const open = accounts.filter(a => !assigned.has(a.r.account.id));
      const support = new Map();
      for (const a of open) a.ranks.slice(0, k).forEach((x, i) => {
        if (!support.has(x.segment)) support.set(x.segment, []);
        support.get(x.segment).push({ a, i });
      });
      // A segment qualifies with enough accounts counting those already in it; most support first, then total weight.
      const qualifying = [...support.entries()]
        .map(([segment, list]) => ({ segment, list, n: list.length + (formed.get(segment) || []).length,
          w: list.reduce((t, x) => t + x.a.ranks[x.i].signal.weight, 0) }))
        .filter(q => q.n >= min)
        .sort((x, y) => y.n - x.n || y.w - x.w);
      if (!qualifying.length) break;
      const q = qualifying[0];
      if (!formed.has(q.segment)) formed.set(q.segment, []);
      for (const { a, i } of q.list) { assigned.set(a.r.account.id, { segment: q.segment, rank: i }); formed.get(q.segment).push(a.r.account.id); }
    }
  }
  const segments = [...formed.entries()].map(([name, ids]) => ({ name, accountIds: ids }));
  const recs = [];
  for (const a of accounts) {
    const r = a.r, as = assigned.get(r.account.id), prominent = a.ranks[0];
    const segment = as ? as.segment : null;
    const lib = CONFIG.segmentLibrary[segment || prominent.segment] || ['Follow up'];
    const fallback = !!as && as.rank > 0;
    let action = lib[0], runnerUp;
    if (!segment) {
      runnerUp = lib[1] ? { action: lib[1], reason: 'Second option for its strongest signal' } : null;
    } else if (fallback) {
      runnerUp = { action: CONFIG.segmentLibrary[prominent.segment][0], fromStrongest: true,
        reason: `Its strongest signal is ${prominent.signal.type} (${prominent.segment}), but fewer than ${min} accounts share it, so it is grouped under ${segment} on its next signal. This is the offering for that strongest signal.` };
    } else {
      runnerUp = lib[1] ? { action: lib[1], reason: `Second option in the ${segment} library` } : null;
    }
    const people = r.people.filter(p => p.signals.length && (!keep || keep.has(r.account.id + '|' + p.contact.row)));
    for (const p of people) {
      // The message speaks to this person's own evidence: their strongest signal in the segment, else their strongest.
      const inSeg = p.signals.find(sg => (CONFIG.signalTypes[sg.type] || {}).segment === (segment || prominent.segment));
      const signal = inSeg || p.signals[0];
      const exception = !segment ? `No micro-segment: fewer than ${min} accounts share any of its signals`
        : r.confidence === 'low' ? 'Low confidence: no contact in the primary persona' : '';
      const ago = signal.age !== undefined ? ` (${signal.age} days ago)` : '';
      recs.push({ key: r.account.id + '|' + p.contact.row, contact: p.contact, account: r.account, result: r, person: p,
        segment, prominent: prominent.segment, prominentSignal: prominent.signal, groupedOn: (as ? a.ranks[as.rank] : prominent).signal,
        fallback, action, runnerUp, signal, exception,
        reason: `${signal.type}${ago}: ${lowerFirst(clean(signal.detail) || signal.type)}`,
        status: r.account.existingCustomer ? 'Existing customer' : 'Net-new', persona: p.contact.persona || '' });
    }
  }
  const order = s => segments.findIndex(x => x.name === s);
  recs.sort((x, y) => (x.segment ? order(x.segment) : 99) - (y.segment ? order(y.segment) : 99) || (y.person.final || 0) - (x.person.final || 0));
  segments.forEach(sg => { sg.recs = recs.filter(r => r.segment === sg.name); });
  return { segments, recs, exceptions: recs.filter(r => !r.segment), engagedOnce, accountsConsidered: accounts.length + engagedOnce.length };
}

/* ─── 5.10–5.19: from the action to a checked first engagement ───
   Rules only in the POC: the brief, proof, draft, checks and confidence are built from the client's own signal
   data and the approved collateral below. AI drafting replaces the templates in production; the checks stay. */
const PLAYBOOK = {
  Inquiry:          { angle: 'Answer the question they asked while it is live', objection: 'We are only gathering information for now.',
                      response: 'Understood. A short call now usually saves a round of back-and-forth later, and there is no commitment.',
                      questions: ['What prompted the question now?', 'What does the timeline look like, and who else is involved?', 'What would a good answer look like for you?'] },
  Modernisation:    { angle: 'Plan the migration before end of support forces the timing', objection: 'The current system still runs fine.',
                      response: 'It does today. Planning early is what lets the cutover fit a planned shutdown instead of an unplanned one.',
                      questions: ['When is your next planned shutdown?', 'What would you need to see to start planning the migration?', 'Who else would be part of that decision?'] },
  'Service renewal':{ angle: 'Check the cover still fits how the site runs today', objection: 'We will just renew as is.',
                      response: 'That is an option. A short review first makes sure you are not paying for cover you no longer use, or missing what you need.',
                      questions: ['What has changed on site since the contract was signed?', 'Where did support work well, and where not?'] },
  Project:          { angle: 'Settle the control scope while the design is still open', objection: 'It is too early to talk about control systems.',
                      response: 'That is when the scope is cheapest to shape. Later it tends to be fixed by the design.',
                      questions: ['Where is the project in front-end design?', 'When is the control-system decision due?', 'Who is leading the design?'] },
  Leadership:       { angle: 'Be useful to a new leader setting priorities', objection: 'I am still settling in.',
                      response: 'Of course. A short overview now can save time when priorities are set.',
                      questions: ['What are your first priorities in the role?', 'Where does automation sit among them?'] },
  Engagement:       { angle: 'Follow up on the topic they chose to engage with', objection: 'I was just browsing.',
                      response: 'No problem. If it becomes relevant, I can share how comparable sites approached it.',
                      questions: ['What made the topic relevant for you?', 'Is it something your site is looking at this year?'] },
};
// Approved collateral the drafts may cite (fictional, for the POC; the client's knowledge base replaces it).
const COLLATERAL = [
  { id: 'CS-01', type: 'Case study', year: 2025, title: 'Legacy control system migration in one planned shutdown', segments: ['Modernisation', 'Inquiry', 'Engagement'], expiry: '2027-06-30',
    claim: 'A comparable refinery moved its legacy control system to a current platform within one planned shutdown.' },
  { id: 'OP-02', type: 'One-pager', year: 2026, title: 'Site assessment overview', segments: ['Modernisation'], expiry: '2027-03-31',
    claim: 'A site assessment takes two days on site and ends with a prioritised upgrade list.' },
  { id: 'BR-03', type: 'Brochure', year: 2026, title: 'Lifecycle services overview', segments: ['Service renewal', 'Modernisation'], expiry: '2027-01-31',
    claim: 'Lifecycle service plans can cover planned upgrades as well as support.' },
  { id: 'CS-04', type: 'Case study', year: 2024, title: 'Gas plant expansion: control scope fixed at front-end design', segments: ['Project'], expiry: '2027-12-31',
    claim: 'On a comparable gas plant expansion, settling the control scope at front-end design kept the project on schedule.' },
  { id: 'WB-05', type: 'Webinar recording', year: 2026, title: 'Modernising legacy control systems', segments: ['Engagement'], expiry: '2027-09-30',
    claim: 'The session recording walks through how comparable sites sequenced their migration.' },
  { id: 'PS-06', type: 'Peer story', year: 2023, title: 'First 100 days: setting automation priorities', segments: ['Leadership'], expiry: '2026-06-30',
    claim: 'A plant manager in a similar role set automation priorities within the first hundred days.' },
];
const BRAND = {
  banned: ['guarantee', 'guaranteed', 'best-in-class', 'best in class', 'world-class', 'cheapest', 'risk-free', 'no-brainer', '100%'],
  pricing: /(\$\s?\d|\bUSD\b|\bprice|\bpricing\b|\bdiscount|\bfree of charge\b)/i,
  sensitive: /\b(incident|accident|explosion|fatalit|injur|emissions? breach|lawsuit)/i,
  competitors: [],          // the client's brand pack fills this in Setup
  maxWords: 120, maxSubjectWords: 6, maxNote: 200,
};
const cite = item => `[${item.type}, ${item.year}]`;

const COPY = {
  'Call to follow up on the inquiry':        { task: true, script: true },
  'Route the inquiry to the sales owner':    { task: true },
  'Propose a migration-path discussion':     { subject: 'migration planning', cta: 'Worth comparing the options?', alt: 'Would a short call to compare options help?' },
  'Offer a site assessment':                 { subject: 'site assessment', cta: 'Worth a look?', alt: 'Would that be useful before the date?' },
  'Offer a lifecycle service review':        { subject: 'lifecycle review', cta: 'Worth exploring?', alt: 'Would a short review help?' },
  'Offer a renewal review':                  { task: true, script: true },
  'Route to the service owner':              { task: true },
  'Share a comparable case study and offer a technical session': { subject: 'similar project', cta: 'Worth a look?', alt: 'Would a short technical session help?' },
  'Offer a reference-site visit':            { subject: 'reference site visit', cta: 'Would that be useful?', alt: 'Worth arranging?' },
  'Offer an early design workshop':          { subject: 'design workshop', cta: 'Worth exploring?', alt: 'Would an early workshop help?' },
  'Introduce Client to the new leader':      { subject: 'your new role', cta: 'Worth a conversation once you have settled in?', alt: 'Would a short intro be useful?' },
  'Share a peer case study from their sector': { subject: 'peer example', cta: 'Would that be useful?', alt: 'Worth a look?' },
  'Invite to a short briefing':              { subject: 'quick briefing', cta: 'Worth scheduling?', alt: 'Would a short briefing help?' },
  'Follow up on the topic they engaged with': { subject: 'following up', cta: 'Worth a short conversation?', alt: 'Would it help to compare notes?' },
  'Invite to a related session':             { subject: 'related session', cta: 'Interested?', alt: 'Shall I send the invite?' },
};
const GENERIC = { subject: 'quick question', cta: 'Worth a conversation?', alt: 'Would that be useful?' };

function opener(sg, account) {
  const d = clean(sg.detail).replace(/\.$/, '');
  const low = d ? d[0].toLowerCase() + d.slice(1) : '';
  switch (sg.type) {
    case 'Inquiry or RFQ': {
      const about = low.replace(/^asked (about|for) /, '');
      return !d ? 'Thanks for your question.' : about !== low ? `Thanks for your question about ${about}.` : `Thanks for your question: ${low}.`;
    }
    case 'Installed system near end of support': return d ? `I understand ${low}.` : `I understand a control system at ${account.name} is nearing end of support.`;
    case 'Service contract renewal': return d ? `I see the ${low.replace(/^the /, '')}.` : 'I see your service contract is coming up for renewal.';
    case 'Capital project': return d ? `Noticed the update on your project: ${low}.` : 'Noticed the update on your project.';
    case 'Leadership change': return 'Congratulations on the new role.';
    case 'Webinar attended': return d ? `Thanks for joining our session on ${low}.` : 'Thanks for joining our session.';
    case 'Webinar registered': return d ? `Saw you registered for our session on ${low}.` : 'Saw you registered for our session.';
    case 'Content download': return d ? `Saw you downloaded the ${low.replace(/^the /, '')}.` : 'Saw you downloaded one of our guides.';
    case 'Email clicked': return d ? `Saw you opened ${low.replace(/^clicked /, '')}.` : 'Saw you opened our last note.';
    default: return d ? `Noticed ${low}.` : '';
  }
}
const segmentOfAction = (action, rec) => Object.keys(CONFIG.segmentLibrary).find(k => CONFIG.segmentLibrary[k].includes(action)) || (rec && (rec.segment || rec.prominent)) || 'Engagement';
// The evidence behind an action: the prospect's own signal in the action's segment, else the one they were grouped on.
function evidenceFor(rec, action) {
  const seg = segmentOfAction(action, rec);
  const own = rec.person && rec.person.signals.find(sg => (CONFIG.signalTypes[sg.type] || {}).segment === seg);
  return own || rec.signal;
}
function proofFor(action, rec, asOf) {
  const seg = segmentOfAction(action, rec);
  const fits = COLLATERAL.filter(c => c.segments.includes(seg));
  const live = fits.filter(c => !asOf || c.expiry >= asOf).sort((a, b) => (b.segments[0] === seg) - (a.segments[0] === seg));
  return { item: live[0] || null, expired: fits.filter(c => asOf && c.expiry < asOf) };
}
// 5.10 Channel within hard limits: email only if verified, LinkedIn only with a URL, and a consent basis for either.
function allowedChannels(c) {
  const out = [];
  if (c.consentOk !== false && c.email && c.emailVerified) out.push('Email');
  if (c.consentOk !== false && c.linkedin) out.push('LinkedIn');
  out.push('Call');
  return out;
}
function recommendChannel(rec, action, prefer) {
  const c = rec.contact, copy = COPY[action] || {};
  if (copy.task) return { channel: 'Task', why: 'Inquiries, renewals and sensitive cases go to a person on the account team, not straight to the prospect.' };
  const allowed = allowedChannels(c);
  if (prefer && allowed.includes(prefer)) return { channel: prefer, why: `${prefer} chosen by the reviewer, within the limits.` };
  if (c.consentOk === false) return { channel: 'Call', why: 'No recognised consent basis, so no email or LinkedIn: call only.' };
  if (allowed[0] === 'Email') return { channel: 'Email', why: c.linkedin ? 'Verified email, so email first; LinkedIn is the fallback.' : 'Verified, sendable email.' };
  if (allowed[0] === 'LinkedIn') return { channel: 'LinkedIn', why: 'No verified email, but a LinkedIn URL: connection note, then a message.' };
  return { channel: 'Call', why: 'No verified email and no LinkedIn URL: call is the only channel.' };
}
// 5.14 Call script: opener, discovery questions, objection handling, the ask.
function callScript(rec, action, open) {
  const first = rec.contact.firstName || rec.contact.name.split(' ')[0];
  const pb = PLAYBOOK[segmentOfAction(action, rec)] || PLAYBOOK.Engagement;
  const copy = COPY[action] || GENERIC;
  return { opener: `Hi ${first}, it's [name] from Client. ${open}`, questions: pb.questions, objection: pb.objection, response: pb.response,
    ask: copy.cta || 'Would a follow-up conversation with the right specialist help?' };
}
// 5.11 The brief: who, why now, angle, proof, objection, ask and constraints.
function briefFor(rec, action, opts = {}) {
  const sg = evidenceFor(rec, action), pb = PLAYBOOK[segmentOfAction(action, rec)] || PLAYBOOK.Engagement;
  const proof = proofFor(action, rec, opts.asOf);
  const ch = recommendChannel(rec, action, opts.channel);
  return {
    who: `${rec.contact.name}, ${rec.contact.jobTitle || 'no title'} (${rec.contact.persona || 'persona unknown'}) at ${rec.account.name} · ${rec.account.existingCustomer ? 'existing customer' : 'net-new'}`,
    whyNow: `${sg.type}: ${clean(sg.detail) || sg.type}${sg.date ? ` (${sg.date})` : ''}`,
    angle: pb.angle, proof: proof.item, expired: proof.expired, objection: pb.objection,
    ask: (COPY[action] || GENERIC).cta || 'A conversation with the right specialist',
    constraints: ch.channel === 'Email' ? `Subject of ${CONFIG.brand.maxSubjectWords} words or fewer, under 80 words, one proof point, one ask, no pricing` :
      ch.channel === 'LinkedIn' ? `Connection note under ${CONFIG.brand.maxNote} characters with no pitch; short message after acceptance` :
      ch.channel === 'Call' ? 'Opener, two or three questions, the objection, one ask' : 'For a person on the account team',
    channel: ch,
  };
}
// 5.12–5.15 The draft. No approved proof for the case: a task for the owner instead of a draft.
function draftFor(rec, action, opts = {}) {
  const first = rec.contact.firstName || rec.contact.name.split(' ')[0];
  const copy = COPY[action] || GENERIC;
  const ch = recommendChannel(rec, action, opts.channel);
  const open = opener(evidenceFor(rec, action), rec.account);
  const variant = opts.variant || '';
  if (ch.channel === 'Task') return { channel: 'Task', why: ch.why, task: `${action} for ${rec.contact.name} at ${rec.account.name}. Context: ${open}`,
    script: copy.script ? callScript(rec, action, open) : null, proof: null };
  const proof = proofFor(action, rec, opts.asOf).item;
  if (!proof) return { channel: 'Task', why: 'No approved, unexpired proof for this case: routed to the owner to add proof, or call instead.', noProof: true,
    task: `${action} for ${rec.contact.name} at ${rec.account.name}. Add approved proof, or call. Context: ${open}`, script: callScript(rec, action, open), proof: null };
  const proofLine = `${proof.claim} ${cite(proof)}`;
  const cta = variant === 'tone' || variant === 'alt' ? copy.alt || copy.cta : copy.cta;
  if (ch.channel === 'Call') return { channel: 'Call', why: ch.why, script: callScript(rec, action, open), proof };
  if (ch.channel === 'LinkedIn') {
    const note = `Hi ${first}, ${open.charAt(0).toLowerCase() + open.slice(1)} Would be good to connect.`;
    return { channel: 'LinkedIn', why: ch.why, note: note.length > BRAND.maxNote ? `Hi ${first}, would be good to connect.` : note,
      message: variant === 'short' ? `Thanks for connecting, ${first}. ${cta}` : `Thanks for connecting, ${first}. ${proofLine} ${cta}`, proof };
  }
  const body = variant === 'short' ? `Hi ${first},\n\n${open} ${cta}\n\nBest,\nClient Team` : `Hi ${first},\n\n${open} ${proofLine}\n\n${cta}\n\nBest,\nClient Team`;
  return { channel: 'Email', why: ch.why, subject: copy.subject, body, words: body.split(/\s+/).filter(Boolean).length, proof };
}
function draftText(d) {
  if (d.channel === 'Email') return `${d.subject}\n${d.body}`;
  if (d.channel === 'LinkedIn') return `${d.note}\n${d.message}`;
  const s = d.script;
  return [d.task, s && s.opener, s && s.questions.join(' '), s && s.response, s && s.ask].filter(Boolean).join('\n');
}
// 5.16 Brand and rule checks, 5.17 claim verification.
function checkDraft(d) {
  const text = draftText(d), low = text.toLowerCase(), flags = [];
  for (const w of BRAND.banned) if (low.includes(w)) flags.push({ rule: 'Banned claim', detail: `"${w}"` });
  for (const w of BRAND.competitors.concat(CONFIG.brand.competitors || [])) if (w && low.includes(w.toLowerCase())) flags.push({ rule: 'Competitor name', detail: `"${w}"` });
  if (BRAND.pricing.test(text)) flags.push({ rule: 'Pricing or commercial terms', detail: 'Pricing is left to the account team' });
  if (BRAND.sensitive.test(text)) flags.push({ rule: 'Sensitive term', detail: 'Needs compliance approval' });
  if (d.channel === 'Email') {
    const sw = (d.subject || '').split(/\s+/).filter(Boolean).length, bw = (d.body || '').split(/\s+/).filter(Boolean).length;
    if (sw > CONFIG.brand.maxSubjectWords) flags.push({ rule: 'Length', detail: `Subject is ${sw} words (limit ${CONFIG.brand.maxSubjectWords})` });
    if (bw > BRAND.maxWords) flags.push({ rule: 'Length', detail: `Body is ${bw} words (limit ${BRAND.maxWords})` });
  }
  if (d.channel === 'LinkedIn' && (d.note || '').length > BRAND.maxNote) flags.push({ rule: 'Length', detail: `Connection note is ${d.note.length} characters (limit ${BRAND.maxNote})` });
  // Claims: anything citing a source, or that reads like a product claim. A claim is verified only when it is
  // an approved item's claim, word for word, with that item's citation.
  const sentences = text.split(/\n+/).flatMap(l => l.split(/(?<=[.?!]|\d{4}\])\s+(?!\[)/)).map(s => s.trim()).filter(Boolean);
  const claimLike = /(\d+\s?%|\b(reduces?|reduced|improves?|improved|increases?|increased|cuts? (downtime|costs?)|savings|uptime|faster|proven|within one|guarantee\w*)\b)/i;
  const claims = [];
  for (const s of sentences) {
    const m = s.match(/\[([^\]]+, \d{4})\]\s*$/);
    if (!m && !claimLike.test(s)) continue;
    const bare = s.replace(/\s*\[[^\]]+, \d{4}\]\s*$/, '');
    const src = COLLATERAL.find(c => cite(c) === `[${m ? m[1] : ''}]` && c.claim === bare);
    claims.push({ text: bare, source: src ? `${src.id} · ${src.title}` : '', verified: !!src });
  }
  const seen = new Set();
  const uniq = claims.filter(c => !seen.has(c.text) && seen.add(c.text));
  return { flags, claims: uniq, unsupported: uniq.filter(c => !c.verified) };
}
// 5.18 Confidence from grounding, open flags and signal strength.
function confidenceFor(rec, d, chk, action) {
  const w = ((action ? evidenceFor(rec, action) : rec.signal) || {}).weight || 0;
  const strength = w >= 60 ? 'strong' : w >= 30 ? 'moderate' : 'weak';
  const n = chk.claims.length, ok = n - chk.unsupported.length;
  const grounding = n ? `${ok} of ${n} claim${n === 1 ? '' : 's'} verified` : 'no product claims';
  const flags = chk.flags.length ? `${chk.flags.length} open flag${chk.flags.length === 1 ? '' : 's'}` : 'no open flags';
  const level = chk.unsupported.length || chk.flags.length || rec.result.confidence === 'low' || strength === 'weak' ? 'Low'
    : strength === 'strong' && rec.result.confidence === 'high' ? 'High' : 'Medium';
  const extra = rec.result.confidence === 'low' ? ', no contact in the primary persona' : '';
  return { level, reason: `${level}: ${grounding}, ${flags}, ${strength} signal${extra}` };
}

/* ─── Lists hand-off between Prospecting and Scoring (browser only) ─── */
const LIST_KEY = 'demandai_lists_v1';
let memoryLists = null;
function loadLists() {
  try { return JSON.parse(localStorage.getItem(LIST_KEY) || '[]'); }
  catch (e) { return memoryLists || []; }
}
function saveLists(lists) {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(lists)); return true; }
  catch (e) { memoryLists = lists; return false; }
}
function saveList(list) {
  const lists = loadLists().filter(l => l.id !== list.id);
  lists.unshift(list);
  return saveLists(lists);
}
function getList(id) { return loadLists().find(l => l.id === id) || null; }
function deleteList(id) { return saveLists(loadLists().filter(l => l.id !== id)); }

const SCORING_KEY = 'demandai_scorings_v1';
function loadScorings() { try { return JSON.parse(localStorage.getItem(SCORING_KEY) || '[]'); } catch (e) { return []; } }
function saveScorings(all) { try { localStorage.setItem(SCORING_KEY, JSON.stringify(all)); return true; } catch (e) { return false; } }
function saveScoring(run) { const all = loadScorings().filter(r => r.id !== run.id); all.unshift(run); return saveScorings(all); }
function getScoring(id) { return loadScorings().find(r => r.id === id) || null; }
function deleteScoring(id) { return saveScorings(loadScorings().filter(r => r.id !== id)); }

const SEGMENTATION_KEY = 'demandai_nba_runs_v1';
function loadSegmentations() { try { return JSON.parse(localStorage.getItem(SEGMENTATION_KEY) || '[]'); } catch (e) { return []; } }
function saveSegmentations(all) { try { localStorage.setItem(SEGMENTATION_KEY, JSON.stringify(all)); return true; } catch (e) { return false; } }
function saveSegmentation(run) { const all = loadSegmentations().filter(r => r.id !== run.id); all.unshift(run); return saveSegmentations(all); }
function getSegmentation(id) { return loadSegmentations().find(r => r.id === id) || null; }
function deleteSegmentation(id) { return saveSegmentations(loadSegmentations().filter(r => r.id !== id)); }

// The number waiting in For Review, shown as a badge on the For Review link in the sidebar.
function reviewBadge() {
  const n = loadSegmentations().reduce((t, r) => t + ((r.stats || {}).waiting ?? (r.stats || {}).prospects ?? 0), 0);
  if (typeof document === 'undefined') return n;
  document.querySelectorAll('a[href="14-review.html"]').forEach(a => {
    let b = a.querySelector('.nav-count');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'nav-count'; b.style.cssText = 'margin-left:auto;min-width:18px;height:18px;padding:0 6px;border-radius:9px;background:#FF8820;color:#fff;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center'; a.appendChild(b); }
    b.textContent = n;
  });
  return n;
}
return {
  CONFIG, CODES, LEAD_COLUMNS, LEAD_REQUIRED, SIGNAL_COLUMNS, SIGNAL_REQUIRED,
  parseCSV, toCSV, readTable, processLeads, classify, personaOf, fitFor, decayFactor,
  processSignals, scoreList, stack, tierFor, daysBetween, round1, buildSegments, segmentRanks, recommendChannel, draftFor, processScoredProspects, SEGMENT_COLUMNS,
  briefFor, callScript, checkDraft, confidenceFor, allowedChannels, proofFor, COLLATERAL, PLAYBOOK,
  loadLists, saveList, getList, deleteList, loadScorings, saveScoring, getScoring, deleteScoring,
  loadSegmentations, saveSegmentation, getSegmentation, deleteSegmentation, reviewBadge,
};
});
