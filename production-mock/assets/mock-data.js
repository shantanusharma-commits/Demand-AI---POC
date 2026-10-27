/* DemandAI production mock: representative data. Every company and person here is invented.
   The client is called "Client" throughout; the pilot region is South-East Asia, refining and petrochemicals. */
(function () {
  const TODAY = new Date(2026, 9, 27); // Tue 27 Oct 2026

  const USERS = {
    sofia: { id: 'sofia', name: 'Sofia Ahlgren', role: 'rep', title: 'Account executive · Singapore, Malaysia', color: '#0094DA' },
    marco: { id: 'marco', name: 'Marco Lindqvist', role: 'rep', title: 'Account executive · Thailand, Vietnam', color: '#FF8820' },
    aisha: { id: 'aisha', name: 'Aisha Rahman', role: 'rep', title: 'Account executive · Indonesia', color: '#2E7D5A' },
    kenji: { id: 'kenji', name: 'Kenji Mori', role: 'rep', title: 'Account executive · Philippines', color: '#B23F3F' },
    pavan: { id: 'pavan', name: 'Pavan Kumar', role: 'manager', title: 'Sales manager · SEA', color: '#7D52A2' },
    rajiv: { id: 'rajiv', name: 'Rajiv Nair', role: 'admin', title: 'Sales operations admin', color: '#5E3A80' },
  };
  const REPS = ['sofia', 'marco', 'aisha', 'kenji'];

  /* Signal tiers and decay, from the Score process flow (section 2.3, step 6). */
  const TIER_BASE = { 1: 100, 2: 60, 3: 30 };
  function decayed(tier, age) {
    const base = TIER_BASE[tier];
    const full = tier === 1 ? 3 : tier === 2 ? 14 : 30;
    const zero = tier === 1 ? 14 : tier === 2 ? 60 : 90;
    if (age <= full) return base;
    if (age >= zero) return 0;
    return base * (1 - (age - full) / (zero - full));
  }

  /* s(type, tier, ageDays, strength 0-1, text, source) */
  const s = (type, tier, age, strength, text, source) => ({ type, tier, age, strength, text, source });

  const ACCOUNTS = [
    {
      id: 'juniper', name: 'Juniper Petrochem', industry: 'Petrochemicals', country: 'Singapore', size: '2,400 staff', fit: 88, owner: 'sofia',
      segment: 'Exec hire', motivation: 'Growth',
      contact: { name: 'Budi Hartono', title: 'VP Reliability & Maintenance', email: 'b.hartono@juniperpetro.example', phone: '+65 6123 4410', linkedin: true, idTier: 1 },
      warm: { score: 72, note: 'Pavan is a 1st-degree connection; 2 past projects in CRM (2023 safety audit).' },
      signals: [
        s('New exec hire', 1, 2, 0.95, 'Budi Hartono joined as VP Reliability & Maintenance (from a competitor\'s customer site).', 'Job-change alerts'),
        s('Visited pricing page', 1, 1, 0.8, 'Two visits to the asset-performance pricing page this week.', 'Website visitor ID'),
        s('Hiring surge', 2, 9, 0.7, '6 open roles for control-systems engineers in Jurong.', 'Hiring data'),
      ],
      nba: {
        action: 'Introduce Client to the new leader', runnerUp: 'Share a peer case study from their sector', channel: 'Email', confidence: 'High', proven: true,
        reason: null, status: 'ready', due: 'Today 12:00',
        subject: 'Congratulations on the new role, Budi',
        body: 'Hi Budi,\n\nCongratulations on joining Juniper Petrochem as VP Reliability & Maintenance. The first 90 days in a reliability role usually start with one question: where is unplanned downtime really coming from?\n\nWe help petrochemical sites in Singapore answer that with an asset-performance baseline in under six weeks. A site of similar size cut unplanned trips by 18% in the first year.\n\nWould a 20-minute call next week be useful, before your first turnaround plan is locked?\n\nBest,\nSofia',
      },
      history: [
        { d: '14 Mar 2026', t: 'Meeting · safety-system audit review (previous VP)', o: 'Positive, no follow-up' },
        { d: '02 Nov 2025', t: 'Email · emissions monitoring brochure', o: 'Opened, no reply' },
      ],
    },
    {
      id: 'cedar', name: 'Cedar Petrochemicals', industry: 'Petrochemicals', country: 'Malaysia', size: '3,100 staff', fit: 82, owner: 'sofia',
      segment: 'Contract renewal', motivation: 'Cost',
      contact: { name: 'Mei Tan', title: 'Head of Instrumentation & Control', email: 'mei.tan@cedarpc.example', phone: '+60 3 2201 8833', linkedin: true, idTier: 2 },
      warm: { score: 35, note: 'No direct connection. A sibling contact (procurement) is in CRM.' },
      signals: [
        s('Contract renewal window', 1, 3, 0.9, 'Control-system support contract with a named competitor ends in 5 months.', 'Contract data'),
        s('Researching a competitor', 1, 5, 0.75, 'Comparing two DCS vendors on a review site.', 'Buyer intent'),
      ],
      nba: {
        action: 'Propose a migration-path discussion', runnerUp: 'Offer a site assessment', channel: 'Email', confidence: 'Medium', proven: true,
        reason: 'Medium confidence', reasonNote: 'The contact was matched on a fallback provider and confirmed (identity tier 2), but the warm path is weak.', status: 'review', due: 'Today 17:00',
        subject: 'Your control-system support renewal',
        body: 'Hi Mei,\n\nWith Cedar\'s control-system support contract coming up for renewal next year, many I&C teams use the window to compare the cost of extending versus a phased migration.\n\nWe\'ve put together a short migration-path comparison for Malaysian petrochemical sites: lifecycle cost, outage windows and the risk profile of each option.\n\nWould it help if I walked your team through it, ahead of your renewal decision?\n\nBest regards,\nSofia',
      },
      history: [{ d: '20 Jun 2026', t: 'Trade show · badge scan', o: 'No follow-up logged' }],
    },
    {
      id: 'kingfisher', name: 'Kingfisher Refining', industry: 'Refining', country: 'Singapore', size: '1,800 staff', fit: 79, owner: 'sofia',
      segment: 'Exec hire', motivation: 'Growth',
      contact: { name: 'Linh Pham', title: 'Plant Manager', email: 'linh.pham@kingfisherref.example', phone: '', linkedin: true, idTier: 3 },
      warm: { score: 20, note: 'No connection found.' },
      signals: [
        s('New exec hire', 1, 4, 0.85, 'Linh Pham appointed Plant Manager at the Pulau Bukom site.', 'Job-change alerts'),
        s('Content download', 2, 6, 0.6, 'Downloaded "Digital twin for refinery turnarounds".', 'Marketing automation'),
      ],
      nba: {
        action: 'Introduce Client to the new leader', runnerUp: 'Share a peer case study from their sector', channel: 'LinkedIn', confidence: 'Medium', proven: false,
        reason: 'Unproven message', reasonNote: 'No validated message structure yet for "exec hire + content download" on LinkedIn. The AI wrote a provisional one.', status: 'review', due: 'Thu 29 Oct',
        subject: 'LinkedIn connection note',
        body: 'Hi Linh, congratulations on the Plant Manager role at Kingfisher. I saw your team was reading up on digital twins for turnarounds. We\'ve helped two Singapore refineries shorten turnaround planning with one. Happy to share what worked if useful.',
      },
      history: [],
    },
    {
      id: 'aurora', name: 'Aurora Refining', industry: 'Refining', country: 'Malaysia', size: '2,900 staff', fit: 84, owner: 'sofia',
      segment: 'Compliance deadline', motivation: 'Cost',
      contact: { name: 'Niran Wattana', title: 'HSE Director', email: 'n.wattana@aurorarefining.example', phone: '+60 7 255 9020', linkedin: true, idTier: 1 },
      warm: { score: 58, note: 'Marco is connected; a closed-lost deal from 2024 in CRM.' },
      signals: [
        s('Compliance deadline', 3, 20, 0.9, 'New emissions-reporting rules apply from 1 Jan 2027.', 'Regulatory calendar'),
        s('Safety incident', 1, 6, 0.8, 'Reported flaring incident at the Pengerang unit.', 'Public filings'),
      ],
      nba: {
        action: 'Offer an emissions-monitoring assessment', runnerUp: 'Share the regulation summary', channel: 'Email', confidence: 'High', proven: true,
        reason: 'Sensitive', reasonNote: 'Mentions a safety incident. Sensitive items need the sales manager\'s approval.', status: 'review', due: 'Fri 30 Oct', sensitive: true,
        subject: 'Getting ahead of the January emissions rules',
        body: 'Hi Niran,\n\nThe new emissions-reporting rules start on 1 January, and after a difficult few weeks on site, I imagine continuous monitoring is high on your list.\n\nWe run a two-week emissions-monitoring assessment that maps your current instruments against the new reporting requirements and shows the gaps.\n\nWould your team have time for a short call this month?\n\nKind regards,\nSofia',
      },
      history: [{ d: '11 Sep 2024', t: 'Opportunity · safety system upgrade', o: 'Closed lost (budget)' }],
    },
    {
      id: 'eastgate', name: 'Eastgate Refinery', industry: 'Refining', country: 'Indonesia', size: '3,600 staff', fit: 76, owner: 'sofia',
      segment: 'Capex / expansion', motivation: 'Growth',
      contact: { name: 'Dian Putri', title: 'Engineering Director', email: 'dian.putri@eastgate.example', phone: '+62 21 555 0192', linkedin: true, idTier: 1 },
      warm: { score: 44, note: 'One 2nd-degree connection through a partner integrator.' },
      signals: [
        s('Expansion / capex approved', 1, 1, 0.9, 'Board approved a USD 400M hydrocracker expansion at Balikpapan.', 'Funding & news'),
        s('Hiring surge', 2, 12, 0.65, '14 new engineering roles posted.', 'Hiring data'),
      ],
      nba: {
        action: 'Position automation for the expansion project', runnerUp: 'Invite to the regional user forum', channel: 'Email', confidence: 'High', proven: true,
        reason: null, status: 'sent', due: '',
        subject: 'Automation for the Balikpapan expansion',
        body: 'Hi Dian, congratulations on the hydrocracker approval…',
      },
      outcome: 'Replied: positive', replyAt: 'Today 08:12', history: [{ d: 'Today 08:12', t: 'Reply received · "Yes, let\'s talk next week"', o: 'Positive reply' }],
    },
    {
      id: 'ironwood', name: 'Ironwood Refining', industry: 'Refining', country: 'Thailand', size: '2,200 staff', fit: 81, owner: 'marco',
      segment: 'Contract renewal', motivation: 'Cost',
      contact: { name: 'Ana Cruz', title: 'Maintenance Manager', email: 'ana.cruz@ironwood.example', phone: '+66 2 777 1200', linkedin: true, idTier: 1 },
      warm: { score: 61, note: 'Marco is connected; 3 contacts in CRM.' },
      signals: [s('Contract renewal window', 1, 2, 0.85, 'Safety-system service contract ends in 4 months.', 'Contract data')],
      nba: { action: 'Propose a migration-path discussion', runnerUp: 'Offer a site assessment', channel: 'Email', confidence: 'High', proven: true, reason: null, status: 'auto', subject: '', body: '' },
      history: [],
    },
    {
      id: 'halcyon', name: 'Halcyon Gas Processing', industry: 'Gas processing', country: 'Malaysia', size: '1,200 staff', fit: 73, owner: 'sofia',
      segment: 'Tech-stack change', motivation: 'Cost',
      contact: { name: 'Farid Ismail', title: 'Automation Lead', email: 'farid.ismail@halcyongas.example', phone: '+60 9 860 4471', linkedin: true, idTier: 1 },
      warm: { score: 30, note: 'No connection; 1 CRM contact (left the company).' },
      signals: [
        s('Tech-stack change', 2, 8, 0.8, 'Job posts ask for experience with a new historian platform.', 'Tech-stack data'),
        s('Email clicked', 3, 3, 0.5, 'Clicked "Historian migration checklist" in last month\'s newsletter.', 'Sequencing tool'),
      ],
      nba: { action: 'Send the historian migration checklist', runnerUp: 'Offer a 30-minute architecture review', channel: 'Email', confidence: 'High', proven: true, reason: null, status: 'ready', due: 'Today 16:00',
        subject: 'Historian migration: the checklist your team clicked',
        body: 'Hi Farid,\n\nI noticed your team is hiring for a new historian platform. Last month you opened our migration checklist, so I\'ve attached the full version with the cut-over plan we use at gas plants.\n\nIf it helps, I can set up a 30-minute architecture review with one of our engineers.\n\nBest,\nSofia' },
      history: [],
    },
    {
      id: 'meridian', name: 'Meridian Olefins', industry: 'Petrochemicals', country: 'Thailand', size: '4,100 staff', fit: 90, owner: 'marco',
      segment: 'Exec hire', motivation: 'Growth',
      contact: { name: 'Somchai Rattana', title: 'Chief Operating Officer', email: 's.rattana@meridianolefins.example', phone: '+66 38 600 210', linkedin: true, idTier: 1 },
      warm: { score: 66, note: 'Pavan met him at an industry forum (CRM note, 2025).' },
      signals: [
        s('New exec hire', 1, 5, 0.9, 'Somchai Rattana appointed COO.', 'Job-change alerts'),
        s('Expansion / capex approved', 1, 9, 0.7, 'New cracker debottlenecking project announced.', 'Funding & news'),
      ],
      nba: { action: 'Introduce Client to the new leader', runnerUp: 'Executive briefing invitation', channel: 'Email', confidence: 'Medium', proven: true, reason: 'Medium confidence', reasonNote: 'C-level contact: the recommended route is through the manager\'s warm path.', status: 'review', due: 'Today 15:00', sensitive: true,
        subject: 'A note from Client on your new role',
        body: 'Dear Somchai,\n\nCongratulations on your appointment as COO of Meridian Olefins. Pavan Kumar mentioned meeting you at last year\'s forum.\n\nWith the debottlenecking project starting, we\'d welcome the chance to share how other olefins producers kept the cracker online during similar projects.\n\nWould a short executive briefing be useful?\n\nWarm regards,\nMarco' },
      history: [{ d: '18 Aug 2025', t: 'Forum meeting (Pavan)', o: 'Note: interested in APM' }],
    },
    {
      id: 'saltmarsh', name: 'Saltmarsh Refinery', industry: 'Refining', country: 'Vietnam', size: '1,500 staff', fit: 68, owner: 'marco',
      segment: 'Exec hire', motivation: 'Growth',
      contact: { name: 'Tran Minh', title: 'Head of Operations', email: 'tran.minh@saltmarsh.example', phone: '', linkedin: true, idTier: 2 },
      warm: { score: 15, note: 'No connection.' },
      signals: [s('New exec hire', 1, 3, 0.8, 'Tran Minh promoted to Head of Operations.', 'Job-change alerts')],
      nba: { action: 'Introduce Client to the new leader', runnerUp: 'Share a peer case study from their sector', channel: 'Email', confidence: 'High', proven: true, reason: null, status: 'auto', subject: '', body: '' },
      history: [],
    },
    {
      id: 'tidewater', name: 'Tidewater Petrochem', industry: 'Petrochemicals', country: 'Indonesia', size: '2,700 staff', fit: 77, owner: 'aisha',
      segment: 'Exec hire', motivation: 'Cost',
      contact: { name: 'Rizky Pratama', title: 'VP Engineering', email: 'rizky.p@tidewater.example', phone: '+62 254 601 300', linkedin: true, idTier: 1 },
      warm: { score: 40, note: 'Aisha is a 2nd-degree connection.' },
      signals: [s('New exec hire', 1, 6, 0.85, 'Rizky Pratama joined as VP Engineering.', 'Job-change alerts'), s('Visited website', 2, 4, 0.5, 'Three visits to the safety-systems pages.', 'Website visitor ID')],
      nba: { action: 'Introduce Client to the new leader', runnerUp: 'Share a peer case study from their sector', channel: 'Email', confidence: 'High', proven: true, reason: 'Spot-check', reasonNote: 'Went ahead on its own; drawn at random for a quality check.', status: 'review', due: 'Fri 30 Oct', subject: 'Welcome to Tidewater, Rizky', body: 'Hi Rizky,\n\nCongratulations on the VP Engineering role…' },
      history: [],
    },
    {
      id: 'banyan', name: 'Banyan Gas', industry: 'Gas processing', country: 'Philippines', size: '900 staff', fit: 70, owner: 'kenji',
      segment: 'Compliance deadline', motivation: 'Cost',
      contact: { name: 'Grace Villanueva', title: 'Compliance Manager', email: 'g.villanueva@banyangas.example', phone: '+63 2 8890 1100', linkedin: false, idTier: 5 },
      warm: { score: 10, note: 'No connection.' },
      signals: [s('Compliance deadline', 3, 25, 0.85, 'Emissions reporting deadline applies to the Batangas terminal.', 'Regulatory calendar')],
      nba: { action: 'Share the regulation summary', runnerUp: 'Offer an emissions-monitoring assessment', channel: 'Email', confidence: 'Medium', proven: true, reason: 'Medium confidence', reasonNote: 'Contact found on the last-resort provider only (identity tier 5, single source).', status: 'review', due: 'Wed 28 Oct', subject: 'The 2027 emissions rules in one page', body: 'Hi Grace,\n\nWe summarised the new emissions-reporting rules on one page…' },
      history: [],
    },
    {
      id: 'coralbay', name: 'Coral Bay Refining', industry: 'Refining', country: 'Philippines', size: '1,700 staff', fit: 74, owner: 'kenji',
      segment: 'Safety incident', motivation: 'Cost',
      contact: { name: 'Paolo Reyes', title: 'Operations Director', email: 'p.reyes@coralbay.example', phone: '+63 43 723 5500', linkedin: true, idTier: 1 },
      warm: { score: 25, note: 'No connection.' },
      signals: [s('Safety incident', 1, 9, 0.7, 'Unplanned shutdown after a compressor trip.', 'Public filings')],
      nba: { action: 'Offer a reliability assessment', runnerUp: 'Share a peer case study from their sector', channel: 'Phone', confidence: 'High', proven: true, reason: null, status: 'ready', due: 'Today 14:00', subject: 'Call script', body: 'Open with the compressor-trip story from a peer refinery; ask how they are approaching root cause; offer the 2-week reliability assessment.' },
      history: [],
    },
    {
      id: 'sapphire', name: 'Sapphire Aromatics', industry: 'Petrochemicals', country: 'Singapore', size: '1,100 staff', fit: 85, owner: 'sofia',
      segment: 'Contract renewal', motivation: 'Cost',
      contact: { name: 'Wei Ling Goh', title: 'Procurement Director', email: 'weiling.goh@sapphirearom.example', phone: '+65 6789 2201', linkedin: true, idTier: 1 },
      warm: { score: 50, note: 'Sofia met her at a 2025 customer event.' },
      signals: [s('Contract renewal window', 1, 11, 0.7, 'Analyser maintenance contract ends in 7 months.', 'Contract data'), s('Email opened', 3, 2, 0.4, 'Opened "Total cost of analyser ownership" email.', 'Sequencing tool')],
      nba: { action: 'Propose a migration-path discussion', runnerUp: 'Offer a site assessment', channel: 'Email', confidence: 'High', proven: true, reason: null, status: 'sent', subject: 'Analyser maintenance: options before renewal', body: '' },
      outcome: 'Sent · awaiting reply', history: [{ d: 'Mon 26 Oct', t: 'Email sent · options before renewal', o: 'Sent, no response yet' }],
    },
    {
      id: 'pelican', name: 'Pelican LNG', industry: 'Gas processing', country: 'Malaysia', size: '2,000 staff', fit: 62, owner: 'aisha',
      segment: 'Capex / expansion', motivation: 'Growth',
      contact: { name: 'Hafiz Rahman', title: 'Project Director', email: 'hafiz.r@pelicanlng.example', phone: '', linkedin: true, idTier: 3 },
      warm: { score: 18, note: 'No connection.' },
      signals: [s('Expansion / capex approved', 1, 13, 0.6, 'Train 3 FID announced.', 'Funding & news')],
      nba: { action: 'Position automation for the expansion project', runnerUp: 'Invite to the regional user forum', channel: 'Email', confidence: 'High', proven: true, reason: null, status: 'auto', subject: '', body: '' },
      history: [],
    },
    {
      id: 'lotus', name: 'Lotus Chemicals', industry: 'Petrochemicals', country: 'Vietnam', size: '800 staff', fit: 58, owner: 'marco',
      segment: '—', motivation: 'Cost',
      contact: { name: 'Nguyen Thi Hoa', title: 'Plant Engineer', email: 'hoa.nguyen@lotuschem.example', phone: '', linkedin: true, idTier: 1 },
      warm: { score: 5, note: 'No connection.' },
      signals: [],
      nba: null, history: [],
    },
    {
      id: 'orchid', name: 'Orchid Energy', industry: 'Refining', country: 'Thailand', size: '5,200 staff', fit: 93, owner: 'marco',
      segment: '—', motivation: 'Growth',
      contact: { name: 'Kittipong Chai', title: 'VP Operations', email: 'k.chai@orchidenergy.example', phone: '+66 2 610 4400', linkedin: true, idTier: 1 },
      warm: { score: 55, note: '2 CRM contacts; Marco is connected.' },
      signals: [s('Hiring surge', 2, 70, 0.6, 'Engineering hiring (2 months ago).', 'Hiring data')],
      nba: null, history: [],
    },
  ];

  /* Fit × Timing = Score (Score process flow, steps 8 and 10). */
  ACCOUNTS.forEach(a => {
    a.signals.forEach(x => { x.weight = Math.round(decayed(x.tier, x.age) * x.strength * 10) / 10; });
    const ws = a.signals.map(x => x.weight).sort((p, q) => q - p);
    a.timing = Math.round(ws.reduce((t, w, i) => t + w / Math.pow(2, i), 0) * 10) / 10;
    a.score = Math.round(a.fit * a.timing);
    a.tier = a.score >= 8000 ? 'A' : a.score >= 4000 ? 'B' : a.score > 0 ? 'C' : '—';
    a.whyNow = a.signals.length ? a.signals.slice().sort((p, q) => q.weight - p.weight)[0] : null;
  });
  ACCOUNTS.sort((p, q) => q.score - p.score);
  ACCOUNTS.forEach((a, i) => { a.rank = i + 1; });

  /* Prospecting output (Prospect process flow): one row per person, with identity tier. */
  const PROSPECTS_FOUND = [
    { name: 'Arif Hidayat', title: 'Head of Maintenance', account: 'Garuda Refinery', country: 'Indonesia', idTier: 1, email: true, crm: 'New', note: '' },
    { name: 'Chen Jia Hui', title: 'Reliability Manager', account: 'Straits Petrochem', country: 'Singapore', idTier: 1, email: true, crm: 'New', note: '' },
    { name: 'Thanh Le', title: 'Operations Director', account: 'Mekong Refining', country: 'Vietnam', idTier: 2, email: true, crm: 'New', note: 'Confirmed by a second provider' },
    { name: 'Siti Aminah', title: 'I&C Manager', account: 'Borneo Gas Processing', country: 'Malaysia', idTier: 1, email: true, crm: 'New', note: '' },
    { name: 'Apinya Srisuk', title: 'Plant Manager', account: 'Andaman Aromatics', country: 'Thailand', idTier: 3, email: true, crm: 'New', note: 'Unconfirmed, re-checked next refresh' },
    { name: 'Jose Santos', title: 'Engineering Manager', account: 'Luzon Petrochem', country: 'Philippines', idTier: 1, email: false, crm: 'New', note: 'Email pulled only when needed' },
    { name: 'Lim Wei Jie', title: 'Automation Lead', account: 'Jurong Olefins', country: 'Singapore', idTier: 4, email: true, crm: 'Held', note: 'Held: providers disagree on title' },
    { name: 'Dewi Lestari', title: 'HSE Manager', account: 'Java Refining Co', country: 'Indonesia', idTier: 1, email: true, crm: 'Name-only match', note: 'Held: may already be a customer' },
  ];

  const CAMPAIGNS = [
    {
      id: 'c1', name: 'New reliability & operations leaders', segment: 'Exec hire', status: 'Ready to confirm', accounts: 11, window: '11 accounts in 6 days',
      proven: true, owner: 'pavan',
      why: '11 accounts got a new reliability, operations or plant leader in the last 7 days. That crosses the campaign threshold (10 in 7 days), so the system suggests one campaign instead of 11 separate actions.',
      touches: [
        { day: 'Day 0', ch: 'Email', fmt: 'Plain text', t: 'Congratulations + the "first 90 days in reliability" angle, referencing the new role directly.' },
        { day: 'Day 4', ch: 'LinkedIn', fmt: 'Case study (carousel)', t: 'How a peer site cut unplanned trips by 18% in year one.' },
        { day: 'Day 9', ch: 'Email', fmt: 'Plain text', t: 'A direct ask for 20 minutes, referencing both earlier touches.' },
      ],
      list: ['Juniper Petrochem', 'Kingfisher Refining', 'Meridian Olefins', 'Saltmarsh Refinery', 'Tidewater Petrochem', 'Straits Petrochem', 'Mekong Refining', 'Garuda Refinery', 'Andaman Aromatics', 'Luzon Petrochem', 'Borneo Gas Processing'],
    },
    {
      id: 'c2', name: '2027 emissions-reporting deadline', segment: 'Compliance deadline', status: 'Building · 8 of 10', accounts: 8, window: '8 accounts in 7 days',
      proven: false, owner: 'pavan',
      why: 'Accounts facing the 1 January emissions-reporting rules. Two more in this window and it becomes eligible as a campaign. Until then, each account gets its own next best action.',
      touches: [
        { day: 'Day 0', ch: 'Email', fmt: 'Plain text', t: 'The new rules in one paragraph, and what they mean for the site.' },
        { day: 'Day 3', ch: 'Email', fmt: 'Infographic', t: 'The actual deadlines on one page.' },
        { day: 'Day 8', ch: 'Email', fmt: 'Plain text', t: 'Offer the two-week emissions-monitoring assessment.' },
      ],
      list: ['Aurora Refining', 'Banyan Gas', 'Coral Bay Refining', 'Java Refining Co', 'Borneo Gas Processing', 'Andaman Aromatics', 'Pelican LNG', 'Halcyon Gas Processing'],
    },
    {
      id: 'c3', name: 'Control-system renewal window', segment: 'Contract renewal', status: 'Running', accounts: 14, window: 'Launched 12 Oct',
      proven: true, owner: 'pavan', stats: { sent: 42, replies: 9, meetings: 4 },
      why: 'Accounts whose control-system or safety-system support contract with a named competitor ends within 6 months.',
      touches: [
        { day: 'Day 0', ch: 'Email', fmt: 'Plain text', t: 'Extend vs. migrate: the cost question, framed for their renewal date.' },
        { day: 'Day 4', ch: 'Email', fmt: 'Comparison doc', t: 'Migration-path comparison: lifecycle cost and outage windows.' },
        { day: 'Day 9', ch: 'Phone', fmt: 'Call', t: 'Direct ask, referencing the comparison.' },
      ],
      list: ['Cedar Petrochemicals', 'Ironwood Refining', 'Sapphire Aromatics'],
    },
  ];

  const LEARNED = [
    { k: 'pos', t: 'Exec hire + email, "first 90 days" angle', d: 'Promoted to proven: 14 outcomes, 64% positive (needs 10 and 60%).' },
    { k: 'neg', t: 'Compliance deadline + LinkedIn', d: 'Demoted to provisional: the last 90 days fell to 31%. Email is used instead.' },
    { k: 'info', t: 'Website-visit signals converted 2× better than hiring signals', d: 'Their weight goes up in next month\'s re-weighting.' },
    { k: 'warn', t: 'Coverage gap found', d: 'Ironwood booked a meeting with no signal on record. Flagged for source expansion.' },
  ];

  const SCHEDULED = [
    { id: 'r1', name: 'Overnight signal sweep', prompt: 'Check every account on my list for new signals, re-score them, and prepare next actions for anything that moved into tier A or B.', freq: 'Every day at 06:00', next: 'Tomorrow 06:00', scope: 'Team default', owner: 'admin' },
    { id: 'r2', name: 'Weekly prospect refresh', prompt: 'Find new accounts that match our ICP and look like our last 10 wins. Remove customers and anything already owned.', freq: 'Every Mon at 07:00', next: 'Mon 2 Nov 07:00', scope: 'Team default', owner: 'admin' },
    { id: 'r3', name: 'Friday learning summary', prompt: 'Summarise what worked this week: which signals and messages led to replies and meetings, and what changed in the patterns.', freq: 'Every Fri at 16:00', next: 'Fri 30 Oct 16:00', scope: 'Mine', owner: 'me' },
  ];

  const TEAM_STATS = {
    sofia: { todo: 6, overdue: 0, approved: 12, sent: 18, replies: 5, meetings: 2, target: 4, accept: 83 },
    marco: { todo: 5, overdue: 2, approved: 9, sent: 15, replies: 3, meetings: 2, target: 4, accept: 71 },
    aisha: { todo: 3, overdue: 0, approved: 11, sent: 16, replies: 6, meetings: 3, target: 4, accept: 88 },
    kenji: { todo: 4, overdue: 3, approved: 4, sent: 7, replies: 1, meetings: 0, target: 3, accept: 57 },
  };

  window.MOCK = { TODAY, USERS, REPS, ACCOUNTS, PROSPECTS_FOUND, CAMPAIGNS, LEARNED, SCHEDULED, TEAM_STATS, decayed };
})();
