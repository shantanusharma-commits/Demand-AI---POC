/* DemandAI production mock: representative data. Every company and person here is invented.
   The client is called "Client" throughout; the pilot region is South-East Asia, refining and petrochemicals. */
(function () {
  const TODAY = new Date(2026, 9, 27); // Tue 27 Oct 2026

  const USERS = {
    sofia: { id: 'sofia', name: 'Sofia Ahlgren', role: 'rep', title: 'Account executive · Singapore, Malaysia', color: '#0094DA' },
    marco: { id: 'marco', name: 'Marco Lindqvist', role: 'rep', title: 'Account executive · Thailand, Vietnam', color: '#FF8820' },
    aisha: { id: 'aisha', name: 'Aisha Rahman', role: 'rep', title: 'Account executive · Indonesia', color: '#2E7D5A' },
    kenji: { id: 'kenji', name: 'Kenji Mori', role: 'rep', title: 'Account executive · Philippines', color: '#B23F3F' },
    pavan: { id: 'pavan', name: 'Daniel Brooks', role: 'manager', title: 'Sales manager · SEA', color: '#7D52A2' },
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
      warm: { score: 72, note: 'Daniel is a 1st-degree connection; 2 past projects in CRM (2023 safety audit).' },
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
      history: [],
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
      warm: { score: 66, note: 'Daniel met him at an industry forum (CRM note, 2025).' },
      signals: [
        s('New exec hire', 1, 5, 0.9, 'Somchai Rattana appointed COO.', 'Job-change alerts'),
        s('Expansion / capex approved', 1, 9, 0.7, 'New cracker debottlenecking project announced.', 'Funding & news'),
      ],
      nba: { action: 'Introduce Client to the new leader', runnerUp: 'Executive briefing invitation', channel: 'Email', confidence: 'Medium', proven: true, reason: 'Medium confidence', reasonNote: 'C-level contact: the recommended route is through the manager\'s warm path.', status: 'review', due: 'Today 15:00', sensitive: true,
        subject: 'A note from Client on your new role',
        body: 'Dear Somchai,\n\nCongratulations on your appointment as COO of Meridian Olefins. Daniel Brooks mentioned meeting you at last year\'s forum.\n\nWith the debottlenecking project starting, we\'d welcome the chance to share how other olefins producers kept the cracker online during similar projects.\n\nWould a short executive briefing be useful?\n\nWarm regards,\nMarco' },
      history: [{ d: '18 Aug 2025', t: 'Forum meeting (Daniel)', o: 'Note: interested in APM' }],
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
      nba: { action: 'Offer a reliability assessment', runnerUp: 'Share a peer case study from their sector', channel: 'LinkedIn', confidence: 'High', proven: true, reason: null, status: 'ready', due: 'Today 14:00', subject: 'LinkedIn message', body: 'Hi Paolo, a peer refinery had a very similar compressor trip last year. Happy to share how they found the root cause in two weeks, if useful.' },
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
      segment: '–', motivation: 'Cost',
      contact: { name: 'Nguyen Thi Hoa', title: 'Plant Engineer', email: 'hoa.nguyen@lotuschem.example', phone: '', linkedin: true, idTier: 1 },
      warm: { score: 5, note: 'No connection.' },
      signals: [],
      nba: null, history: [],
    },
    {
      id: 'orchid', name: 'Orchid Energy', industry: 'Refining', country: 'Thailand', size: '5,200 staff', fit: 93, owner: 'marco',
      segment: '–', motivation: 'Growth',
      contact: { name: 'Kittipong Chai', title: 'VP Operations', email: 'k.chai@orchidenergy.example', phone: '+66 2 610 4400', linkedin: true, idTier: 1 },
      warm: { score: 55, note: '2 CRM contacts; Marco is connected.' },
      signals: [s('Hiring surge', 2, 70, 0.6, 'Engineering hiring (2 months ago).', 'Hiring data')],
      nba: null, history: [],
    },
  ];

  /* ─── Micro-segments ───
     A segment is the strongest trigger that made its accounts ready. When 10 or more accounts land in one segment within
     7 days it is run as a campaign (NBC, confirmed by the manager); below that, each account gets its own next best action (NBA). */
  const SEGMENTS = [
    { id: 's8', name: 'Turnaround season 2027', trigger: 'Turnaround announced', mode: 'NBC', campaign: 'c1', proven: 'Proven', rate: 58, outcomes: 19,
      why: '11 accounts announced a planned maintenance shutdown for H1 2027 in the last 6 days. That crosses the campaign threshold, so they wait for one campaign instead of 11 separate actions.',
      structure: 'Turnaround readiness: reference the shutdown date → the 3 risks peers hit → offer a pre-turnaround health check' },
    { id: 's2', name: 'Control-system renewal window', trigger: 'Contract renewal window', mode: 'NBC', campaign: 'c2', proven: 'Proven', rate: 48, outcomes: 21,
      why: 'Accounts whose control-system or safety-system support contract with a named competitor ends within 6 months.',
      structure: 'Extend vs. migrate: the cost question framed for their renewal date → comparison document → direct ask' },
    { id: 's4', name: 'Expansion & capex projects', trigger: 'Expansion / capex approved', mode: 'NBC', campaign: 'c3', proven: 'Proven', rate: 52, outcomes: 11,
      why: 'Board-approved expansion or debottlenecking projects. Automation is decided early, so timing matters.',
      structure: 'Automation for the project: congratulate → what peers decided in the first 90 days → offer an early design review' },
    { id: 's1', name: 'New reliability & operations leaders', trigger: 'New exec hire', mode: 'NBA', proven: 'Proven', rate: 64, outcomes: 14,
      why: '7 accounts got a new leader this week, below the campaign threshold of 10, so each gets its own next best action from its owner.',
      structure: '"First 90 days": congratulate on the role → where downtime really comes from → 20-minute call before plans lock' },
    { id: 's3', name: '2027 emissions-reporting deadline', trigger: 'Compliance deadline', mode: 'Building', building: 8, proven: 'Provisional', rate: 31, outcomes: 9,
      why: '8 of the 10 accounts needed for a campaign. Until two more arrive within the window, each account gets its own action.',
      structure: 'Deadline in one paragraph → the gap map → offer the 2-week emissions assessment (email only; LinkedIn was demoted)' },
    { id: 's7', name: 'Researching competitors', trigger: 'Researching a competitor', mode: 'NBA', proven: 'Proven', rate: 44, outcomes: 12,
      why: 'Accounts comparing vendors on review sites. Each needs a tailored answer to the competitor it is looking at.',
      structure: 'Acknowledge the evaluation → the 2 questions to ask any vendor → offer a reference call' },
    { id: 's5', name: 'Historian & tech-stack change', trigger: 'Tech-stack change', mode: 'NBA', proven: 'Provisional', rate: 38, outcomes: 6,
      why: 'Job posts and filings show a platform change. Too few, and too varied, for a campaign.',
      structure: 'Spot the change → the migration checklist → offer an architecture review' },
    { id: 's6', name: 'Incidents & unplanned shutdowns', trigger: 'Safety incident', mode: 'NBA', sensitive: true, proven: 'Provisional', rate: 0, outcomes: 4,
      why: 'Sensitive by nature, so never run as a campaign. Every message goes to the sales manager before it is sent.',
      structure: 'Lead with a peer story, never the incident → root-cause help → reliability assessment' },
  ];
  SEGMENTS.splice(3, 0, { id: 's9', name: 'Control-systems hiring surge', trigger: 'Control-systems hiring surge', mode: 'NBC', campaign: 'c5', proven: 'Provisional', rate: 0, outcomes: 0, fromList: 'L1',
    why: '10 accounts from the list saved on Monday posted control-systems roles within days of each other, far above normal. The AI drafted one campaign for them; it needs a review before it is confirmed.',
    structure: 'Build-out: reference the new roles → how peers staffed the cut-over → offer a migration workshop' });
  const HAND_SEG = { juniper: 's1', kingfisher: 's1', meridian: 's1', saltmarsh: 's1', tidewater: 's1', cedar: 's7', aurora: 's3', banyan: 's3',
    eastgate: 's4', pelican: 's4', ironwood: 's2', sapphire: 's2', halcyon: 's5', coralbay: 's6' };

  /* Seeded generator so the mock shows the same accounts every time. */
  let seed = 20261027;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const NAMES = ['Heron', 'Mangrove', 'Monsoon', 'Teakwood', 'Egret', 'Hornbill', 'Rattan', 'Jadeite', 'Amberline', 'Cobalt Bay', 'Saffron', 'Tamarind',
    'Kestrel', 'Osprey', 'Marlin', 'Nautilus', 'Lantern', 'Harbourline', 'Tidemark', 'Silverleaf', 'Bluewater', 'Greystone', 'Northcape', 'Southpoint',
    'Westbay', 'Sandpiper', 'Starling', 'Waxwing', 'Magnolia', 'Camphor', 'Pinewell', 'Driftwood', 'Larkspur', 'Bayleaf', 'Copperhill', 'Stillwater',
    'Seabright', 'Palmyra', 'Ironbark', 'Wildfern', 'Moonstone', 'Firethorn', 'Kingsbay', 'Riverbend', 'Cloudbreak', 'Oakmere', 'Sunfield', 'Brightwater', 'Gullwing', 'Reedbank'];
  const KIND = [['Refining', 'Refining'], ['Refinery', 'Refining'], ['Petrochem', 'Petrochemicals'], ['Olefins', 'Petrochemicals'], ['Aromatics', 'Petrochemicals'], ['Gas Processing', 'Gas processing'], ['LNG', 'Gas processing']];
  const REGION = { sofia: [['Singapore', ['Tan', 'Lim', 'Ng', 'Goh', 'Chua'], ['Jia Hui', 'Wei Ming', 'Kai Xin', 'Jun Jie', 'Hui Min']], ['Malaysia', ['Ismail', 'Abdullah', 'Lee', 'Wong', 'Kumar'], ['Nurul', 'Hafiz', 'Siew Ling', 'Arjun', 'Zul']]],
    marco: [['Thailand', ['Srisuk', 'Chaiyaporn', 'Wongsa', 'Boonmee', 'Kittisak'], ['Anan', 'Pim', 'Narong', 'Suda', 'Chalerm']], ['Vietnam', ['Nguyen', 'Tran', 'Pham', 'Le', 'Vo'], ['Minh', 'Lan', 'Quang', 'Thu', 'Huy']]],
    aisha: [['Indonesia', ['Wijaya', 'Santoso', 'Hidayat', 'Saputra', 'Lestari'], ['Budi', 'Dewi', 'Agus', 'Rina', 'Fajar']]],
    kenji: [['Philippines', ['Santos', 'Reyes', 'Cruz', 'Garcia', 'Mendoza'], ['Miguel', 'Andrea', 'Ramon', 'Bea', 'Carlo']]] };
  const TITLES = ['VP Reliability', 'Head of Maintenance', 'Operations Director', 'Plant Manager', 'Head of Instrumentation & Control', 'Engineering Manager', 'Automation Lead', 'HSE Director', 'Project Director', 'Procurement Director'];
  const SIG = {
    s8: [['Turnaround announced', 1, 'Planned maintenance shutdown announced for H1 2027.', 'Funding & news'], ['Hiring surge', 2, 'Contract maintenance roles posted for the turnaround.', 'Hiring data']],
    s2: [['Contract renewal window', 1, 'Control-system support contract with a named competitor ends within 6 months.', 'Contract data'], ['Email opened', 3, 'Opened the renewal comparison.', 'Sequencing tool']],
    s4: [['Expansion / capex approved', 1, 'Expansion project approved by the board.', 'Funding & news'], ['Hiring surge', 2, 'Engineering roles posted for the new unit.', 'Hiring data']],
    s1: [['New exec hire', 1, 'New reliability or operations leader appointed.', 'Job-change alerts']],
    s3: [['Compliance deadline', 3, 'New emissions-reporting rules apply from 1 Jan 2027.', 'Regulatory calendar']],
    s7: [['Researching a competitor', 1, 'Comparing control-system vendors on a review site.', 'Buyer intent'], ['Visited pricing page', 1, 'Visited the pricing page twice.', 'Website visitor ID']],
    s5: [['Tech-stack change', 2, 'Job posts ask for a new historian platform.', 'Tech-stack data']],
    s6: [['Safety incident', 1, 'Unplanned shutdown reported.', 'Public filings']],
    s9: [['Control-systems hiring surge', 1, 'Posted several control-systems engineer roles in 2 days (anomaly boost).', 'Hiring data'], ['Visited website', 2, 'Visited the DCS migration pages.', 'Website visitor ID']],
  };
  const NEED = { s8: 11, s2: 14, s4: 10, s1: 7, s3: 8, s7: 5, s5: 4, s6: 3 };
  const OWNERS = ['sofia', 'sofia', 'marco', 'aisha', 'kenji', 'marco', 'sofia', 'aisha', 'kenji'];
  let nameIx = 0;
  const genAccount = (segId, fixed) => {
    const owner = fixed ? fixed.owner : pick(OWNERS), [country, lasts, firsts] = fixed ? REGION[owner].find(r => r[0] === fixed.country) : pick(REGION[owner]), [suffix, industry] = pick(KIND);
    const name = fixed ? fixed.name : NAMES[nameIx++ % NAMES.length] + ' ' + suffix;
    const first = pick(firsts), last = pick(lasts);
    const sigs = (SIG[segId] || []).filter((x, i) => i === 0 || rnd() > 0.45).map(([type, tier, text, source]) => s(type, tier, 1 + Math.floor(rnd() * (tier === 3 ? 30 : tier === 2 ? 14 : 8)), Math.round((0.55 + rnd() * 0.4) * 100) / 100, text, source));
    const id = name.toLowerCase().replace(/[^a-z]+/g, '');
    return { id, name, industry, country, size: (600 + Math.floor(rnd() * 40) * 100).toLocaleString('en-US') + ' staff', fit: 58 + Math.floor(rnd() * 36), owner, generated: true,
      segment: '', motivation: rnd() > 0.5 ? 'Cost' : 'Growth',
      contact: { name: `${first} ${last}`, title: pick(TITLES), email: `${first.split(' ')[0].toLowerCase()}.${last.toLowerCase()}@${id.slice(0, 12)}.example`, phone: rnd() > 0.4 ? '+65 6000 ' + (1000 + Math.floor(rnd() * 8999)) : '', linkedin: true, idTier: pick([1, 1, 1, 1, 2, 2, 3, 5]) },
      warm: { score: Math.floor(rnd() * 70), note: pick(['No connection found.', 'One 2nd-degree connection.', 'A sibling contact is in CRM.', 'The rep is a 1st-degree connection.']) },
      signals: sigs, nba: null, history: [] };
  };
  Object.keys(NEED).forEach(segId => {
    const have = ACCOUNTS.filter(a => HAND_SEG[a.id] === segId).length;
    for (let i = have; i < NEED[segId]; i++) { const a = genAccount(segId); HAND_SEG[a.id] = segId; ACCOUNTS.push(a); }
  });
  /* The prospect list saved from the chat on Monday: 17 accounts, owners by territory. */
  const TERR = { Singapore: 'sofia', Malaysia: 'sofia', Thailand: 'marco', Vietnam: 'marco', Indonesia: 'aisha', Philippines: 'kenji' };
  [['Ember Aromatics', 'Thailand', 's9'], ['Willow Refining', 'Vietnam', 's9'], ['Quartz Olefins', 'Singapore', 's9'], ['Lumen Petrochem', 'Singapore', 's9'], ['Garnet Refinery', 'Indonesia', 's9'],
    ['Fernhill Gas Processing', 'Malaysia', 's9'], ['Coralwood Petrochem', 'Philippines', 's9'], ['Thornbury Refining', 'Indonesia', 's9'], ['Ashgrove Olefins', 'Thailand', 's9'], ['Bramble Refining', 'Malaysia', 's9'],
    ['Cinder Aromatics', 'Thailand', 's5'], ['Dunmore Gas Processing', 'Malaysia', 's5'], ['Elmstead Refining', 'Vietnam', 's5'], ['Foxglove Petrochem', 'Singapore', 's7'], ['Gladewater LNG', 'Indonesia', 's7'],
    ['Hollowell Refining', 'Philippines', 's7'], ['Ivybridge Olefins', 'Thailand', null]].forEach(([name, country, seg]) => {
    const a = genAccount(seg, { name, country, owner: TERR[country] });
    a.fromList = 'L1'; if (seg) HAND_SEG[a.id] = seg; ACCOUNTS.push(a);
  });
  ACCOUNTS.forEach(a => { a.seg = HAND_SEG[a.id] || null; const sg = SEGMENTS.find(x => x.id === a.seg); a.segment = sg ? sg.name : '–'; });

  /* Next best actions for generated accounts in NBA segments: most went ahead on their own, a few wait for a person. */
  const ACTION = { s1: ['Introduce Client to the new leader', 'Share a peer case study from their sector'], s3: ['Share the regulation summary', 'Offer an emissions-monitoring assessment'],
    s7: ['Send the vendor-evaluation guide', 'Offer a reference call'], s5: ['Send the historian migration checklist', 'Offer an architecture review'], s6: ['Offer a reliability assessment', 'Share a peer case study from their sector'] };
  ACCOUNTS.filter(a => a.generated && a.seg && SEGMENTS.find(x => x.id === a.seg).mode !== 'NBC').forEach((a, i) => {
    const st = a.seg === 's6' ? 'review' : ['auto', 'sent', 'auto', 'sent', 'ready', 'auto'][i % 6];
    const [action, runnerUp] = ACTION[a.seg];
    a.nba = { action, runnerUp, channel: 'Email', confidence: st === 'review' ? 'Medium' : 'High', proven: SEGMENTS.find(x => x.id === a.seg).proven === 'Proven',
      reason: a.seg === 's6' ? 'Sensitive' : null, reasonNote: a.seg === 's6' ? 'Incident-related: needs the sales manager\'s approval.' : '', sensitive: a.seg === 's6', status: st, due: st === 'ready' ? 'Today 17:00' : st === 'review' ? 'Wed 28 Oct' : '',
      subject: action, body: `Hi ${a.contact.name.split(' ')[0]},\n\n${a.whyNowText || ''}A short note from Client: ${action.toLowerCase()}.\n\nWould a 20-minute call next week be useful?\n\nBest regards` };
    if (st === 'sent') a.outcome = pick(['Sent · awaiting reply', 'Opened · no reply yet', 'Sent · awaiting reply']);
  });

  /* Fit × Timing = Score (Score process flow, steps 8 and 10). */
  ACCOUNTS.forEach(a => {
    a.signals.forEach(x => { x.weight = Math.round(decayed(x.tier, x.age) * x.strength * 10) / 10; });
    const ws = a.signals.map(x => x.weight).sort((p, q) => q - p);
    // Everything on 0–100: Timing is the stacked points as a share of 200, Score = Fit × Timing ÷ 100
    a.points = Math.round(ws.reduce((t, w, i) => t + w / Math.pow(2, i), 0) * 10) / 10;
    a.timing = Math.min(100, Math.round(a.points / 2));
    a.score = Math.round(a.fit * a.timing / 100);
    a.tier = a.score >= 40 ? 'A' : a.score >= 20 ? 'B' : a.score > 0 ? 'C' : '–';
    a.whyNow = a.signals.length ? a.signals.slice().sort((p, q) => q.weight - p.weight)[0] : null;
  });
  ACCOUNTS.sort((p, q) => q.score - p.score);
  ACCOUNTS.forEach((a, i) => { a.rank = i + 1; });

  /* ─── Campaigns (NBC) ─── */
  const CAMPAIGNS = [
    { id: 'c1', seg: 's8', name: 'Turnaround season 2027', status: 'Ready to confirm', launched: null, day: 0,
      touches: [
        { day: 0, ch: 'Email', fmt: 'Plain text', t: 'Reference the announced shutdown window and the three risks peers hit in planning.', state: 'Waiting for confirmation' },
        { day: 4, ch: 'LinkedIn', fmt: 'Checklist (carousel)', t: 'The pre-turnaround health checklist a peer refinery used.', state: '' },
        { day: 9, ch: 'Email', fmt: 'Plain text', t: 'A direct ask for a pre-turnaround health check, referencing both earlier touches.', state: '' } ],
      explore: '1 of 11 accounts gets a different opening (cost of a delayed restart) to keep the pattern honest.',
      updates: [{ t: 'Today 06:05', x: 'Crossed the threshold: 11 accounts in 6 days. Waiting for Daniel to confirm.' }, { t: 'Mon 26 Oct', x: '3 more accounts announced shutdowns (8 → 11).' }],
      blockers: [] },
    { id: 'c2', seg: 's2', name: 'Control-system renewal window', status: 'Running', launched: 'Mon 12 Oct', day: 15,
      touches: [
        { day: 0, ch: 'Email', fmt: 'Plain text', t: 'Extend vs. migrate: the cost question, framed for their renewal date.', state: 'Sent 12 Oct' },
        { day: 4, ch: 'Email', fmt: 'Comparison document', t: 'Migration-path comparison: lifecycle cost and outage windows.', state: 'Sent 16 Oct' },
        { day: 9, ch: 'LinkedIn', fmt: 'Message', t: 'Direct ask on LinkedIn, referencing the comparison.', state: 'Sent 21 Oct' } ],
      explore: '1 of 14 accounts got a "risk of staying" opening instead of cost. It is behind (0 replies), so the cost structure stays.',
      updates: [{ t: 'Mon 26 Oct', x: 'Sapphire Aromatics opened the comparison a third time; follow-up suggested to Sofia.' }, { t: 'Fri 23 Oct', x: 'Ironwood Refining booked a meeting (Marco).' }, { t: 'Wed 21 Oct', x: 'LinkedIn touch sent to 9 accounts.' }, { t: 'Fri 16 Oct', x: '1 email bounced; the contact was re-enriched from the fallback provider.' }],
      blockers: [{ k: 'warn', x: 'Explore variant has 0 replies from 1 account. Kept running so the pattern can be re-earned.' }] },
    { id: 'c3', seg: 's4', name: 'Expansion & capex projects', status: 'Running', launched: 'Mon 19 Oct', day: 8,
      touches: [
        { day: 0, ch: 'Email', fmt: 'Plain text', t: 'Congratulate on the approval; what peers decided in the first 90 days.', state: 'Sent 19 Oct' },
        { day: 4, ch: 'LinkedIn', fmt: 'Case study (carousel)', t: 'How an expansion kept automation on the critical path.', state: 'Sent 23 Oct' },
        { day: 10, ch: 'Email', fmt: 'Plain text', t: 'Offer an early design review, referencing both touches.', state: 'Scheduled Thu 29 Oct 09:00' } ],
      explore: 'None yet: fewer than 10 outcomes for this structure.',
      updates: [{ t: 'Today 08:12', x: 'Eastgate Refinery replied positive. Sequence stopped for that account and handed to Sofia (fast lane).' }, { t: 'Fri 23 Oct', x: 'Touch 2 sent to 8 accounts on LinkedIn.' }, { t: 'Thu 22 Oct', x: 'Status watch: another rep opened an opportunity at 1 account. It was taken out of the campaign.' }],
      blockers: [{ k: 'neg', x: 'Touch 3 goes out Thursday through rep mailboxes. 3 of the 4 reps have not connected theirs (placeholder in the mock).' }] },
    { id: 'c5', seg: 's9', name: 'Control-systems hiring surge', status: 'Draft', launched: null, day: 0, fromList: 'L1',
      touches: [
        { day: 0, ch: 'Email', fmt: 'Plain text', subject: 'Staffing the control-systems build-out', t: 'Reference the new control-systems roles and what they usually mean: a migration or a new unit.', state: '' },
        { day: 3, ch: 'LinkedIn', fmt: 'Connection request', t: 'Short note to the hiring manager referencing the roles.', state: '' },
        { day: 7, ch: 'Email', fmt: 'Case study', subject: 'How a peer staffed its DCS cut-over', t: 'Case study: how a peer refinery staffed its DCS cut-over without delaying start-up.', state: '' },
        { day: 12, ch: 'LinkedIn', fmt: 'Message', t: 'Offer a 60-minute migration workshop, referencing the case study.', state: '' } ],
      explore: '1 of 10 accounts gets a cost-of-delay opening instead.',
      updates: [{ t: 'Mon 26 Oct', x: 'Drafted from the list "Lookalikes of my last 10 wins" after 10 accounts showed the same hiring surge.' }],
      blockers: [{ k: 'warn', x: 'Provisional message structure: no outcomes yet for this segment, so it needs a review before confirming.' }] },
    { id: 'c4', seg: null, name: 'Q3 debottlenecking projects', status: 'Completed', launched: 'Mon 7 Sep', day: 30,
      touches: [{ day: 0, ch: 'Email', fmt: 'Plain text', t: 'Debottlenecking: where automation pays back first.', state: 'Sent 7 Sep' }, { day: 4, ch: 'Email', fmt: 'Infographic', t: 'Payback timeline from 3 peer projects.', state: 'Sent 11 Sep' }, { day: 9, ch: 'Email', fmt: 'Plain text', t: 'Direct ask.', state: 'Sent 16 Sep' }],
      explore: 'The explore variant (safety-first opening) beat the original 3 replies to 1 and became the proven structure.',
      updates: [{ t: 'Fri 2 Oct', x: 'Closed: 12 accounts, 5 replies, 3 meetings, 1 opportunity.' }], blockers: [], final: { accounts: 12, sent: 36, replies: 5, meetings: 3 } },
  ];
  /* Where each campaign account is in its sequence. */
  const C2_STATES = ['Meeting booked', 'Replied · positive', 'Replied · objection', 'Out of office', 'Touch 3 done', 'Touch 3 done', 'Touch 3 done', 'Opened', 'Opened', 'Touch 3 done', 'Bounced → re-enriched', 'Touch 3 done', 'Opened', 'Touch 3 done'];
  const C3_STATES = ['Replied · positive', 'Touch 2 sent', 'Touch 2 sent', 'Opened', 'Touch 2 sent', 'Clicked', 'Touch 2 sent', 'Taken out: owner changed', 'Touch 2 sent', 'Opened'];
  const camp = (c, states, first) => {
    const accs = ACCOUNTS.filter(a => a.seg === c.seg);
    const at = a => (first.includes(a.id) ? first.indexOf(a.id) : 99);
    accs.sort((p, q) => at(p) - at(q));
    accs.forEach((a, i) => { a.campaign = c.id; a.campState = states ? states[i % states.length] : 'Waiting for confirmation'; a.nba = null; });
    return accs;
  };
  camp(CAMPAIGNS[0], null, []);
  camp(CAMPAIGNS[1], C2_STATES, ['ironwood']);
  camp(CAMPAIGNS[2], C3_STATES, ['eastgate']);
  camp(CAMPAIGNS[3], null, []);
  ACCOUNTS.filter(a => a.campaign === 'c5').forEach(a => { a.campState = 'Draft · not started'; });
  ACCOUNTS.find(a => a.id === 'sapphire').campState = 'Opened';
  CAMPAIGNS.forEach(c => {
    const accs = ACCOUNTS.filter(a => a.campaign === c.id);
    c.accounts = accs.map(a => a.id);
    if (c.final) { c.stats = c.final; return; }
    const has = re => accs.filter(a => re.test(a.campState)).length;
    c.stats = { accounts: accs.length, sent: c.status === 'Running' ? accs.length * c.touches.filter(t => /Sent|Done/.test(t.state)).length : 0,
      opened: has(/Opened|Clicked|Replied|Meeting/), replies: has(/Replied|Meeting|Out of office/), positive: has(/positive|Meeting/), meetings: has(/Meeting/) };
  });

  /* ─── Replies (from campaigns and from individual actions) ─── */
  const REPLIES = [];
  const replyText = { 'Replied · positive': ['Good timing. Can we talk next week?', 'Yes, please send the comparison and some times.', 'Interested. Our project team meets vendors in November.'], 'Replied · objection': ['We are locked in with our current vendor until 2028.', 'Not a priority this year, budget is set.'], 'Out of office': ['Out of office until 3 Nov.'], 'Meeting booked': ['Booked: Tue 3 Nov 10:00 via the scheduling link.'] };
  ACCOUNTS.filter(a => /Replied|Meeting|Out of office/.test(a.campState || '')).forEach((a, i) => {
    const kind = a.campState.replace('Replied · ', '');
    REPLIES.push({ id: 'r' + a.id, acc: a.id, from: a.contact.name, owner: a.owner, source: CAMPAIGNS.find(c => c.id === a.campaign).name, sourceKind: 'Campaign',
      kind: /positive/.test(kind) ? 'Positive' : /objection/.test(kind) ? 'Objection' : /Out/.test(kind) ? 'Out of office' : 'Meeting booked',
      text: a.id === 'eastgate' ? 'Thanks Sofia, good timing. The expansion team is meeting vendors next week. Can we do Tuesday or Wednesday?' : replyText[a.campState][i % replyText[a.campState].length],
      at: a.id === 'eastgate' ? 'Today 08:12' : ['Mon 26 Oct', 'Fri 23 Oct', 'Thu 22 Oct', 'Wed 21 Oct'][i % 4] });
  });
  const firstSent = ACCOUNTS.find(a => a.nba && a.nba.status === 'sent' && a.generated);
  if (firstSent) { firstSent.outcome = 'Replied · positive'; REPLIES.push({ id: 'r' + firstSent.id, acc: firstSent.id, from: firstSent.contact.name, owner: firstSent.owner, source: firstSent.nba.action, sourceKind: 'Your action', kind: 'Positive', text: 'Thanks for the note. Send me something I can share with my team.', at: 'Today 07:40' }); }
  REPLIES.sort((p, q) => (q.at.startsWith('Today') ? 1 : 0) - (p.at.startsWith('Today') ? 1 : 0));

  /* ─── Activity: every account's story from signal to outcome ─── */
  ACCOUNTS.forEach(a => {
    const act = [];
    if (a.fromList) act.push({ k: 'crm', when: 'Mon 26 Oct', t: 'Found by prospecting', d: 'Added to the list "Lookalikes of my last 10 wins" from the chat. Identity checked, customers removed.' });
    const sig = a.signals.slice().sort((p, q) => q.age - p.age);
    sig.forEach(x => act.push({ k: 'signal', when: x.age === 0 ? 'Today' : `${x.age} day${x.age > 1 ? 's' : ''} ago`, t: `Signal: ${x.type}`, d: `${x.text} (${x.source}, tier ${x.tier})` }));
    if (a.signals.length) act.push({ k: 'score', when: 'Today 06:00', t: `Scored ${a.score}/100 · tier ${a.tier}`, d: `Fit ${a.fit} × Timing ${a.timing} ÷ 100. Passed the observable, predictive and time-bound checks.` });
    if (a.seg) act.push({ k: 'segment', when: 'Today 06:02', t: `Joined micro-segment: ${a.segment}`, d: `Strongest trigger: ${a.whyNow ? a.whyNow.type : '–'}.` });
    if (a.campaign) {
      const c = CAMPAIGNS.find(x => x.id === a.campaign);
      act.push({ k: 'campaign', when: c.launched || 'Today 06:05', t: c.status === 'Ready to confirm' ? `Held for campaign: ${c.name}` : c.status === 'Draft' ? `In draft campaign: ${c.name}` : `Enrolled in campaign: ${c.name}`, d: c.status === 'Ready to confirm' ? 'Waiting for the sales manager to confirm the campaign.' : c.status === 'Draft' ? 'The sequence is being reviewed before it goes to the sales manager.' : `Touch plan: ${c.touches.map(t => `day ${t.day} ${t.ch.toLowerCase()}`).join(', ')}.` });
      c.touches.filter(t => /Sent|Done/.test(t.state)).forEach((t, i) => act.push({ k: 'sent', when: t.state.replace(/^(Sent|Done) /, ''), t: `Touch ${i + 1} sent · ${t.ch}`, d: t.t, msg: t.ch === 'Email' ? { subject: c.name, body: `Hi ${a.contact.name.split(' ')[0]},\n\n${t.t}\n\nBest regards,\n${USERS[a.owner].name.split(' ')[0]}` } : null }));
      if (/Opened|Clicked|Replied|Meeting/.test(a.campState)) act.push({ k: 'open', when: 'Recently', t: /Clicked/.test(a.campState) ? 'Clicked the case study' : 'Opened the email', d: 'Engagement is logged against the segment and message structure.' });
      const r = REPLIES.find(x => x.acc === a.id);
      if (r) act.push({ k: 'reply', when: r.at, t: `Reply · ${r.kind}`, d: `"${r.text}"`, reply: r });
      if (/Taken out/.test(a.campState)) act.push({ k: 'watch', when: 'Thu 22 Oct', t: 'Taken out of the campaign', d: 'Status watch: another rep opened an opportunity here. No double outreach.' });
      if (/Bounced/.test(a.campState)) act.push({ k: 'watch', when: 'Fri 16 Oct', t: 'Email bounced → contact re-enriched', d: 'The fallback provider found the new address; the next touch used it.' });
    } else if (a.nba) {
      act.push({ k: 'nba', when: 'Today 06:05', t: `Next best action: ${a.nba.action}`, d: `${a.nba.channel} · ${a.nba.confidence} confidence · runner-up: ${a.nba.runnerUp}` });
      if (a.nba.status === 'auto') act.push({ k: 'sent', when: 'Today 09:00', t: 'Went ahead on its own', d: 'Every check passed, so it was sent in the morning window.' });
      if (a.nba.status === 'sent') act.push({ k: 'sent', when: 'Mon 26 Oct', t: 'Approved and sent', d: a.nba.subject || a.nba.action, msg: a.nba.body ? { subject: a.nba.subject, body: a.nba.body } : null });
      if (a.nba.status === 'ready' || a.nba.status === 'review') act.push({ k: 'wait', when: 'Now', t: 'Waiting for a person', d: a.nba.reason ? `${a.nba.reason}: ${a.nba.reasonNote}` : 'Ready: high confidence, proven message.' });
      const r = REPLIES.find(x => x.acc === a.id);
      if (r) act.push({ k: 'reply', when: r.at, t: `Reply · ${r.kind}`, d: `"${r.text}"`, reply: r });
    }
    (a.history || []).forEach(h => act.push({ k: 'crm', when: h.d, t: h.t, d: h.o }));
    a.activity = act;
  });

  /* Prospecting output (Prospect process flow): one row per person, with identity tier. */
  const PROSPECTS_FOUND = [
    { name: 'Arif Hidayat', title: 'Head of Maintenance', account: 'Garnet Refinery', country: 'Indonesia', idTier: 1, email: true, crm: 'New', note: '' },
    { name: 'Chen Jia Hui', title: 'Reliability Manager', account: 'Lumen Petrochem', country: 'Singapore', idTier: 1, email: true, crm: 'New', note: '' },
    { name: 'Thanh Le', title: 'Operations Director', account: 'Willow Refining', country: 'Vietnam', idTier: 2, email: true, crm: 'New', note: 'Confirmed by a second provider' },
    { name: 'Siti Aminah', title: 'I&C Manager', account: 'Fernhill Gas Processing', country: 'Malaysia', idTier: 1, email: true, crm: 'New', note: '' },
    { name: 'Apinya Srisuk', title: 'Plant Manager', account: 'Ember Aromatics', country: 'Thailand', idTier: 3, email: true, crm: 'New', note: 'Unconfirmed, re-checked next refresh' },
    { name: 'Jose Santos', title: 'Engineering Manager', account: 'Coralwood Petrochem', country: 'Philippines', idTier: 1, email: false, crm: 'New', note: 'Email pulled only when needed' },
    { name: 'Lim Wei Jie', title: 'Automation Lead', account: 'Quartz Olefins', country: 'Singapore', idTier: 4, email: true, crm: 'Held', note: 'Held: providers disagree on title' },
    { name: 'Dewi Lestari', title: 'HSE Manager', account: 'Thornbury Refining', country: 'Indonesia', idTier: 1, email: true, crm: 'Name-only match', note: 'Held: may already be a customer' },
  ];

  const LISTS = [
    { id: 'L1', name: 'Lookalikes of my last 10 wins', kind: 'Prospect list', by: 'Chat', when: 'Mon 26 Oct', note: '24 people at 17 accounts · identity-checked, customers removed' },
    { id: 'L2', name: 'Q4 target accounts', kind: 'Scored list', by: 'Overnight run', when: 'Today 06:00', note: 'Every account with a live signal, ranked by Fit × Timing' },
    { id: 'L3', name: 'Turnaround season 2027', kind: 'Segment', by: 'Micro-segments', when: 'Today 06:02', seg: 's8', note: 'Crossed the campaign threshold today' },
    { id: 'L4', name: 'New leaders to watch', kind: 'Segment', by: 'Sofia', when: 'Fri 23 Oct', seg: 's1', note: 'New reliability and operations leaders' },
  ];
  const CONTENT = [
    { id: 'k1', type: 'Whitepaper', title: 'Turnaround readiness: the 3 risks refineries miss', status: 'Approved', seg: 's8', led: 'Planned for touch 2 of Turnaround season 2027', by: 'Daniel' },
    { id: 'k2', type: 'Case study', title: 'How a peer site cut unplanned trips by 18%', status: 'In Content library', seg: 's1', led: 'Used in 31 messages · 9 replies · 3 meetings', by: 'Sofia' },
    { id: 'k3', type: 'LinkedIn post', title: 'What an emissions gap map looks like', status: 'Sent for sign-off', seg: 's3', led: 'Waiting for Daniel', by: 'Sofia' },
    { id: 'k4', type: 'Blog', title: 'Extend or migrate? A cost model for control-system renewals', status: 'Draft', seg: 's2', led: '–', by: 'Marco' },
  ];

  const BLOCKERS = [
    { k: 'neg', who: 'all', t: 'Rep mailboxes not connected', d: '3 of 4 reps can\'t send campaign touches. Expansion & capex touch 3 goes out Thursday.', go: 'campaign:c3' },
    { k: 'warn', who: 'all', t: 'Website-visit signals paused since 02:14', d: 'The visitor-ID connection failed. Visit signals are missing from today\'s scores; the admin has been told.', go: null },
    { k: 'warn', who: 'manager', t: 'Turnaround season 2027 waits for you', d: '11 accounts are held until you confirm the campaign or send them back as individual actions.', go: 'campaign:c1' },
    { k: 'warn', who: 'manager', t: 'Kenji: 3 overdue items, no meetings this week', d: 'The AI suggests moving 2 accounts to Aisha, who has capacity.', go: 'ask:How is my team doing?' },
    { k: 'warn', who: 'sofia', t: 'Aurora Refining waits for Daniel\'s sign-off', d: 'Sensitive (mentions an incident). Nothing goes out until he approves.', go: 'record:aurora' },
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

  window.MOCK = { TODAY, USERS, REPS, ACCOUNTS, SEGMENTS, LISTS, CONTENT, PROSPECTS_FOUND, CAMPAIGNS, REPLIES, BLOCKERS, LEARNED, SCHEDULED, TEAM_STATS, decayed };
})();
