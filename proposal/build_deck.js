// DemandAI pilot proposal deck: the same story as the Proposal AI workshop deck, for signal-led prospecting and NBA.
const pptxgen = require('pptxgenjs');
const React = require('react');
const RDS = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa6');
const { applyTheme } = require('/root/.claude/skills/synced/f7fa06b4-2868-40b5-8f36-79579d15dcaa_7a0111b3-0b36-48aa-b693-79c86e571a7a/pptx/scripts/apply_theme.js');

const HEX = { ink: '1B1F2A', slate: '2E3A4F', white: 'FFFFFF', mist: 'F3F4F6', amber: 'F2A900', teal: '0E7C7B', rust: 'B4441C', grey: '64748B', pale: 'FCEFC7', line: 'D9DEE5' };
const THEME = { name: 'DemandAI Proposal', headFontFace: 'Calibri', bodyFontFace: 'Calibri',
  colors: { dk1: HEX.ink, lt1: HEX.white, dk2: HEX.slate, lt2: HEX.mist, accent1: HEX.amber, accent2: HEX.teal, accent3: HEX.rust, accent4: HEX.grey, accent5: HEX.pale, accent6: HEX.line, hlink: HEX.teal, folHlink: HEX.grey } };

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = 'DemandAI: signal-led prospecting and next best action';
pres.author = 'DemandAI team';
const C = pres.SchemeColor;
const INK = C.text1, WHITE = C.background1, MIST = C.background2, SLATE = C.text2, AMBER = C.accent1, TEAL = C.accent2, RUST = C.accent3, GREY = C.accent4, PALE = C.accent5, LINE = C.accent6;
const W = 13.333, X0 = 0.6, CW = W - 1.2;
const FOOT = 'DemandAI  ·  Prepared for Client  ·  Confidential';

pres.defineSlideMaster({ title: 'CONTENT', background: { color: WHITE }, margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: 'kicker', type: 'body', x: X0, y: 0.32, w: 9, h: 0.3, fontSize: 11, bold: true, color: RUST, charSpacing: 1.5, margin: 0, valign: 'middle' }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: X0, y: 0.62, w: CW, h: 0.7, fontSize: 28, bold: true, color: INK, margin: 0, valign: 'middle', align: 'left' }, text: '' } },
    { text: { text: FOOT, options: { x: 6.7, y: 7.05, w: 5.4, h: 0.3, fontSize: 10, color: GREY, align: 'right', margin: 0 } } },
  ],
  slideNumber: { x: 12.25, y: 7.05, w: 0.5, h: 0.3, fontSize: 10, color: GREY, align: 'right' } });
pres.defineSlideMaster({ title: 'DIVIDER', background: { color: INK },
  objects: [{ text: { text: FOOT, options: { x: 6.7, y: 7.05, w: 6.05, h: 0.3, fontSize: 10, color: GREY, align: 'right', margin: 0 } } }] });
pres.defineSlideMaster({ title: 'COVER', background: { color: INK } });

async function icon(Comp, color, size = 256) {
  const svg = RDS.renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size: String(size) }));
  return 'image/png;base64,' + (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
}
const T = (s, text, o) => s.addText(text, Object.assign({ isTextBox: true, margin: 0, color: INK, fontSize: 14, valign: 'top' }, o));
const box = (s, x, y, w, h, fill, o = {}) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, Object.assign({ x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.08 }, o));
const bullets = (items, o = {}) => items.map((t, i) => ({ text: t, options: Object.assign({ bullet: { indent: 14 }, breakLine: i < items.length - 1, paraSpaceAfter: 5 }, o) }));
const disc = (s, x, y, d, fill, label, color = INK, fs = 14) => {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 } });
  T(s, label, { x, y, w: d, h: d, align: 'center', valign: 'middle', bold: true, color, fontSize: fs });
};
const diamond = (s, x, y, d, fill) => s.addShape(pres.shapes.DIAMOND, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 } });
function content(kicker, title, section) {
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: section });
  s.addText(kicker.toUpperCase(), { placeholder: 'kicker' });
  s.addText(title, { placeholder: 'title' });
  return s;
}

(async () => {
  const I = {};
  for (const [k, comp, col] of [['users', fa.FaUsers, HEX.amber], ['browser', fa.FaDesktop, HEX.amber], ['gears', fa.FaGears, HEX.amber], ['book', fa.FaBookOpen, HEX.amber],
    ['shield', fa.FaShieldHalved, HEX.amber], ['brain', fa.FaBrain, HEX.amber], ['search', fa.FaMagnifyingGlassChart, HEX.ink], ['bolt', fa.FaBolt, HEX.ink],
    ['layers', fa.FaLayerGroup, HEX.teal], ['server', fa.FaServer, HEX.teal], ['lock', fa.FaLock, HEX.teal], ['db', fa.FaDatabase, HEX.teal], ['robot', fa.FaRobot, HEX.teal], ['cloud', fa.FaCloud, HEX.teal],
    ['check', fa.FaCircleCheck, HEX.teal], ['stop', fa.FaHand, HEX.rust], ['file', fa.FaFileLines, HEX.ink], ['people', fa.FaPeopleGroup, HEX.ink], ['cal', fa.FaCalendarDays, HEX.ink],
    ['chat', fa.FaComments, HEX.ink], ['folder', fa.FaFolderOpen, HEX.ink], ['key', fa.FaKey, HEX.ink], ['flag', fa.FaFlagCheckered, HEX.ink], ['arrow', fa.FaArrowRight, HEX.grey], ['boltA', fa.FaBolt, HEX.amber]])
    I[k] = await icon(comp, col);

  /* 1 Cover */
  pres.addSection({ title: 'Overview' });
  let s = pres.addSlide({ masterName: 'COVER', sectionTitle: 'Overview' });
  diamond(s, 8.6, 1.2, 5.2, SLATE); diamond(s, 10.4, 3.6, 3.0, AMBER); diamond(s, 9.2, 4.9, 1.4, TEAL);
  T(s, 'DEMAND AI', { x: X0, y: 1.9, w: 7.5, h: 0.5, fontSize: 18, bold: true, color: AMBER, charSpacing: 3 });
  T(s, 'Signal-led Prospecting &\nNext Best Action', { x: X0, y: 2.4, w: 8.2, h: 1.7, fontSize: 44, bold: true, color: WHITE });
  T(s, 'Find the accounts with a reason to buy now, and give every rep the next best action and a first message.', { x: X0, y: 4.3, w: 7.4, h: 0.8, fontSize: 16, color: LINE });
  T(s, 'Discovery workshop  |  November 2026', { x: X0, y: 5.6, w: 7, h: 0.4, fontSize: 14, color: AMBER, bold: true });
  T(s, 'Prepared for Client  ·  Response to RFP  ·  Confidential', { x: X0, y: 6.75, w: 7, h: 0.3, fontSize: 11, color: GREY });

  /* 2 In this pack */
  s = content('In this pack', 'Overview', 'Overview');
  const pack = [['DemandAI', 'Prospect & Account Scoring and Micro-segments & NBA'], ['Understanding the demand process', 'Workshop: your team walks us through it'],
    ['Key inputs', 'What we need for the pilot: data, content and access'], ['Success criteria', 'How we will measure the pilot'], ['Draft pilot timeline', 'Pilot plan by phase']];
  pack.forEach(([h, d], i) => {
    const x = X0 + i * 2.45, y = 2.0;
    box(s, x, y, 2.25, 3.9, i === 0 ? INK : MIST);
    diamond(s, x + 0.3, y + 0.35, 0.65, AMBER);
    T(s, String(i + 1), { x: x + 0.3, y: y + 0.35, w: 0.65, h: 0.65, align: 'center', valign: 'middle', bold: true, fontSize: 16 });
    T(s, h, { x: x + 0.25, y: y + 1.2, w: 1.85, h: 1.0, bold: true, fontSize: 16, color: i === 0 ? WHITE : INK });
    T(s, d, { x: x + 0.25, y: y + 2.35, w: 1.8, h: 1.4, fontSize: 13, color: i === 0 ? LINE : SLATE });
  });

  /* 3 Pilot scope */
  s = content('Pilot scope', 'DemandAI: from a lead list to a ready-to-send first touch', 'Overview');
  box(s, X0, 1.7, 5.7, 4.6, PALE);
  s.addImage({ data: I.search, x: X0 + 0.4, y: 2.0, w: 0.5, h: 0.5 });
  T(s, 'Prospect & Account Scoring', { x: X0 + 1.1, y: 2.0, w: 4.4, h: 0.5, fontSize: 22, bold: true, valign: 'middle' });
  T(s, 'Finds the accounts and people with a live reason to buy', { x: X0 + 0.4, y: 2.7, w: 5, h: 0.4, fontSize: 14, italic: true, color: SLATE });
  T(s, bullets(['Checks and cleans your lead lists', 'Scores every account against your ICP', 'Reads buying signals and how fresh they are', 'Ranks people into tiers A, B and C, with why now']),
    { x: X0 + 0.4, y: 3.3, w: 5, h: 2.6, fontSize: 15 });
  box(s, 6.73, 1.7, 6.0, 4.6, INK);
  s.addImage({ data: await icon(fa.FaBolt, HEX.amber), x: 7.13, y: 2.0, w: 0.5, h: 0.5 });
  T(s, 'Micro-segments & Next Best Action', { x: 7.83, y: 2.0, w: 4.7, h: 0.5, fontSize: 22, bold: true, color: WHITE, valign: 'middle' });
  T(s, 'Turns the best prospects into actions your reps can use today', { x: 7.13, y: 2.7, w: 5.3, h: 0.4, fontSize: 14, italic: true, color: LINE });
  T(s, bullets(['Groups accounts that share a reason into micro-segments', 'Recommends the next best action and channel', 'Drafts the first message from approved content only',
    'Checks brand, consent and sensitive topics', 'Routes exceptions to For Review; releases the rest to reps']), { x: 7.13, y: 3.3, w: 5.4, h: 2.4, fontSize: 15, color: WHITE });
  box(s, 7.13, 5.65, 5.2, 0.45, AMBER);
  T(s, 'A person decides anything the system cannot.', { x: 7.13, y: 5.65, w: 5.2, h: 0.45, align: 'center', valign: 'middle', bold: true, fontSize: 14 });
  s.addImage({ data: I.arrow, x: 6.38, y: 3.8, w: 0.3, h: 0.3 });
  s.addNotes('Two modules, one flow. Scoring decides who has a reason to buy now; NBA decides what each rep does about it. Nothing is sent automatically in the pilot: reps send from their own tools.');

  /* 4 Divider 01 */
  const divider = (n, title, sub, section) => {
    pres.addSection({ title: section });
    const d = pres.addSlide({ masterName: 'DIVIDER', sectionTitle: section });
    diamond(d, 8.4, 1.5, 4.2, AMBER);
    T(d, n, { x: 8.4, y: 1.5, w: 4.2, h: 4.2, align: 'center', valign: 'middle', fontSize: 72, bold: true });
    T(d, 'DEMAND AI  ·  ' + section.toUpperCase(), { x: X0, y: 2.2, w: 7, h: 0.4, fontSize: 13, bold: true, color: AMBER, charSpacing: 2 });
    T(d, title, { x: X0, y: 2.8, w: 7.4, h: 1.6, fontSize: 40, bold: true, color: WHITE });
    T(d, sub, { x: X0, y: 4.5, w: 7, h: 0.8, fontSize: 16, color: LINE });
    return d;
  };
  divider('01', 'Understanding the demand process', 'How prospects are found, prioritised and approached today.', 'Understanding');

  /* 5 How it works */
  s = content('Platform · Technology stack', 'How it all works in DemandAI', 'Understanding');
  T(s, 'How a request travels, and the six layers behind it', { x: X0, y: 1.3, w: 8, h: 0.35, fontSize: 14, color: SLATE });
  const flow = [['users', 'Your team', 'Browser, invite-only sign-in'], ['browser', 'Web app', 'One screen per step'], ['gears', 'DemandAI engine', 'Tested rules: score, segment, route'],
    ['book', 'Your content', 'Brand pack, claims, plays'], ['shield', 'AI gateway', 'Flags, checks, rules fallback'], ['brain', 'AI models', 'Enterprise LLMs in your cloud']];
  flow.forEach(([k, h, d], i) => {
    const x = X0 + 0.15 + i * 2.05;
    s.addShape(pres.shapes.OVAL, { x: x + 0.5, y: 1.8, w: 0.8, h: 0.8, fill: { color: INK }, line: { color: INK, width: 0 } });
    s.addImage({ data: I[k], x: x + 0.7, y: 2.0, w: 0.4, h: 0.4 });
    T(s, h, { x: x - 0.1, y: 2.7, w: 2.0, h: 0.3, align: 'center', bold: true, fontSize: 14 });
    T(s, d, { x: x - 0.1, y: 3.0, w: 2.0, h: 0.5, align: 'center', fontSize: 11, color: GREY });
    if (i < 5) s.addImage({ data: I.arrow, x: x + 1.83, y: 2.07, w: 0.25, h: 0.25 });
  });
  const layers = [['layers', 'Front end', ['Web application, one screen per step', 'Role-aware screens for rep, manager, admin', 'Strict content policy and security headers']],
    ['server', 'Application services', ['Server-side business rules per screen', 'Background jobs for uploads, scoring, builds', 'Every action logged in an audit trail']],
    ['lock', 'Identity and access', ['Invite-only sign-in; SSO at go-live*', 'Roles: admin, manager, rep, viewer', 'Reps see only the accounts they own']],
    ['db', 'Data', ['Managed PostgreSQL, private endpoint', 'Row-level security per business unit', 'Append-only logs; purge at pilot end']],
    ['robot', 'AI layer', ['Enterprise large language models', 'Each AI step off until you approve it', 'Rules fallback if the AI is unsure']],
    ['cloud', 'Hosting and operations', ['Containers on a private cloud network', 'Outbound traffic on an allow-list only', 'Automated CI/CD, central logging']]];
  layers.forEach(([k, h, items], i) => {
    const x = X0 + (i % 3) * 4.08, y = 3.75 + Math.floor(i / 3) * 1.6;
    box(s, x, y, 3.9, 1.45, MIST);
    s.addImage({ data: I[k], x: x + 0.2, y: y + 0.18, w: 0.32, h: 0.32 });
    T(s, h, { x: x + 0.65, y: y + 0.15, w: 3.1, h: 0.38, bold: true, fontSize: 14, valign: 'middle' });
    T(s, bullets(items, { paraSpaceAfter: 2 }), { x: x + 0.25, y: y + 0.58, w: 3.55, h: 0.82, fontSize: 11, color: SLATE });
  });
  T(s, '* Single sign-on with your directory at commercial go-live', { x: X0, y: 7.05, w: 5, h: 0.3, fontSize: 10, color: GREY });
  s.addNotes('Reps and managers sign in to the web app. The engine applies tested rules for scoring, segmentation and routing; AI words drafts and suggests segments through one gateway that logs every call and falls back to the rules. Data sits in PostgreSQL with row-level security per business unit.');

  /* 6 Agents overview */
  const STAGES = [
    ['Find and score', [['List Checker', 'Checks and cleans the lead file: duplicates, missing fields, opt-outs and consent.', 'Uploads the list, fixes flagged rows'],
      ['Fit Scorer', 'Scores each account against your ICP rubric and fit floor.', 'Agrees the rubric'],
      ['Signal Reader', 'Reads intent, installed-base, CRM and news signals and matches them to accounts and people.', 'Sets signal sources'],
      ['Timing Scorer', 'Weights each signal by type and how fresh it is.', 'Agrees the weights'],
      ['Tier Ranker', 'Ranks people into tiers A, B and C and explains why now.', 'Chooses who is handed off']]],
    ['Segment and plan', [['Segmenter', 'Groups accounts that share a reason to buy into micro-segments of three or more.', 'Manager approves new segments'],
      ['Action Recommender', 'Picks the next best action from the actions your team set in Setup; the AI chooses the one that fits the signal and person.', 'Rep accepts or picks another'],
      ['Channel Picker', 'Chooses email, LinkedIn or a call, within consent and verification limits.', 'Rep can change the channel'],
      ['Deal Sizer', 'Estimates the first deal and how confident the recommendation is.', 'Manager sets the thresholds']]],
    ['Draft', [['Brief Builder', 'Sets out who, why now, the angle, the proof point and the ask.', 'Marketing owns the plays'],
      ['Draft Writer', 'Writes the first message in your brand voice from approved content only.', 'Rep edits before sending'],
      ['Claim Matcher', 'Picks an approved, unexpired claim that fits the segment.', 'Marketing approves claims'],
      ['Call Script Writer', 'Prepares the opener, discovery questions and objection handling.', 'Rep uses it on the call']]],
    ['Review and compliance', [['Brand Checker', 'Checks banned words and openers, length, pricing and competitor mentions.', 'Marketing sets the rules'],
      ['Consent Guard', 'Stops anyone who opted out or has no recognised consent before hand-off.', 'Admin confirms the bases'],
      ['Sensitive-topic Router', 'Sends incidents, security and regulation topics to the sales manager.', 'Manager approves or rejects'],
      ['Spot-checker', 'Draws about 20% of released actions each week, at least one per rep, for rating.', 'Manager rates the sample']]],
    ['Release and measure', [['Rep Hand-off', "Releases ready actions to each rep's list for today.", 'Rep works the list'],
      ['Decision Log', 'Records every accept, reject, edit and alternative, with the reason and the review time.', 'Reviewer gives the reason'],
      ['Metrics Reporter', 'Reports G1 (human review effort) and G2 (acceptance rate) against the agreed thresholds.', 'Leaders review the readout']]]];
  const nAgents = STAGES.reduce((n, st) => n + st[1].length, 0);
  s = content('AI agents · Overview', `${nAgents} agents across the demand journey`, 'Understanding');
  STAGES.forEach(([h, ags], i) => {
    const x = X0 + i * 2.45;
    box(s, x, 1.55, 2.3, 0.75, INK);
    T(s, [{ text: h, options: { bold: true, breakLine: true } }, { text: `${ags.length} agents`, options: { color: AMBER, fontSize: 12 } }], { x: x + 0.15, y: 1.6, w: 2.0, h: 0.65, fontSize: 14, color: WHITE, valign: 'middle' });
    ags.forEach(([n], j) => {
      box(s, x, 2.45 + j * 0.62, 2.3, 0.52, MIST);
      s.addShape(pres.shapes.OVAL, { x: x + 0.12, y: 2.58 + j * 0.62, w: 0.26, h: 0.26, fill: { color: AMBER }, line: { color: AMBER, width: 0 } });
      T(s, n, { x: x + 0.5, y: 2.45 + j * 0.62, w: 1.75, h: 0.52, fontSize: 13, valign: 'middle' });
    });
  });
  box(s, X0, 5.75, CW, 0.75, PALE);
  T(s, [{ text: 'Behind every stage: For Review', options: { bold: true, breakLine: true } }, { text: 'People decide what the system could not', options: { fontSize: 12, color: SLATE } }], { x: X0 + 0.25, y: 5.8, w: 3.4, h: 0.65, fontSize: 14, valign: 'middle' });
  [['Exception queue', "rep's own checks"], ['Approvals', 'sensitive items, sales manager'], ['Weekly spot-check', 'about 20% of released items']].forEach(([n, d], i) => {
    s.addShape(pres.shapes.OVAL, { x: 4.0 + i * 2.95, y: 5.98, w: 0.3, h: 0.3, fill: { color: TEAL }, line: { color: TEAL, width: 0 } });
    T(s, [{ text: n, options: { bold: true, breakLine: true } }, { text: d, options: { fontSize: 11, color: SLATE } }], { x: 4.42 + i * 2.95, y: 5.8, w: 2.5, h: 0.65, fontSize: 14, valign: 'middle' });
  });
  T(s, 'Agents prepare the work. Your team makes every decision.', { x: X0, y: 6.62, w: 7, h: 0.3, fontSize: 13, italic: true, color: SLATE });
  s.addNotes('Each agent has one job. Scoring, segmentation, routing and the checks are tested rules, so every result can be traced; AI words the drafts and suggests segments and actions, behind the gateway and switched off until you approve its results. Agents never send, approve or commit on the company\'s behalf.');

  /* 7 Understanding the flow */
  s = content('Understanding · The flow', 'Understanding the demand process', 'Understanding');
  const chevrons = (y, label, steps, fill, txt, wEach) => {
    T(s, label, { x: X0, y: y - 0.4, w: 6, h: 0.3, fontSize: 12, bold: true, color: RUST, charSpacing: 1.5 });
    steps.forEach((t, i) => {
      const x = X0 + i * (wEach + 0.08);
      s.addShape(i ? pres.shapes.CHEVRON : pres.shapes.PENTAGON, { x, y, w: wEach, h: 1.0, fill: { color: fill }, line: { color: fill, width: 0 } });
      disc(s, x + (i ? 0.38 : 0.18), y + 0.31, 0.38, AMBER, String(i + 1), INK, 12);
      T(s, t, { x: x + (i ? 0.85 : 0.65), y, w: wEach - (i ? 1.25 : 0.95), h: 1.0, fontSize: 13, bold: true, color: txt, valign: 'middle' });
    });
  };
  chevrons(1.95, 'PROSPECT & ACCOUNT SCORING', ['Prospect list upload', 'Account fit scoring', 'Signal upload & tiering'], PALE, INK, 4.0);
  T(s, 'MICRO-SEGMENTS, NEXT BEST ACTION & FOR REVIEW', { x: X0, y: 3.45, w: 7, h: 0.3, fontSize: 12, bold: true, color: RUST, charSpacing: 1.5 });
  ['Hand-off of tier A and B', 'Micro-segmentation', 'Next best action', 'Draft & checks', 'For Review', 'Release to reps', 'Analytics: G1 and G2'].forEach((t, i) => {
    const x = X0 + i * 1.74;
    s.addShape(i ? pres.shapes.CHEVRON : pres.shapes.PENTAGON, { x, y: 3.85, w: 1.66, h: 0.75, fill: { color: i === 4 ? TEAL : INK }, line: { color: i === 4 ? TEAL : INK, width: 0 } });
    disc(s, x + (i ? 0.62 : 0.5), 4.03, 0.4, AMBER, String(i + 4), INK, 12);
    T(s, t, { x: x + 0.05, y: 4.7, w: 1.55, h: 0.6, fontSize: 13, bold: true, align: 'center' });
  });
  box(s, X0, 5.55, CW, 0.9, MIST);
  T(s, [{ text: 'Next: ', options: { bold: true } }, { text: 'each step is described on the next three slides. The workshop walks through how your team does each one today, so the pilot is configured to your process.' }],
    { x: X0 + 0.3, y: 5.55, w: CW - 0.6, h: 0.9, fontSize: 15, valign: 'middle' });

  // One card per step: what you give, what DemandAI does, what you see.
  const steps = (kicker, title, list) => {
    const q = content(kicker, title, 'Understanding');
    const n = list.length, cw = (CW - (n - 1) * 0.25) / n, fs = n > 3 ? 12.5 : 13.5;
    list.forEach(([num, name, give, does, see, hi], i) => {
      const x = X0 + i * (cw + 0.25);
      box(q, x, 1.55, cw, 0.8, hi ? TEAL : INK);
      disc(q, x + 0.18, 1.74, 0.42, AMBER, String(num), INK, 13);
      T(q, name, { x: x + 0.72, y: 1.55, w: cw - 0.85, h: 0.8, fontSize: 16, bold: true, color: WHITE, valign: 'middle' });
      box(q, x, 2.35, cw, 4.35, MIST, { rectRadius: 0.04 });
      T(q, [{ text: 'YOU GIVE', options: { bold: true, color: RUST, fontSize: 10.5, charSpacing: 1, breakLine: true } }, { text: give, options: { fontSize: fs } }],
        { x: x + 0.2, y: 2.5, w: cw - 0.4, h: 0.95 });
      T(q, 'DEMANDAI DOES', { x: x + 0.2, y: 3.5, w: cw - 0.4, h: 0.25, bold: true, color: RUST, fontSize: 10.5, charSpacing: 1 });
      T(q, bullets(does, { paraSpaceAfter: 3 }), { x: x + 0.2, y: 3.78, w: cw - 0.35, h: 1.95, fontSize: fs });
      box(q, x + 0.12, 5.78, cw - 0.24, 0.8, PALE);
      T(q, [{ text: 'YOU SEE  ', options: { bold: true, color: RUST, fontSize: 10.5, charSpacing: 1, breakLine: true } }, { text: see, options: { fontSize: fs - 0.5 } }],
        { x: x + 0.25, y: 5.8, w: cw - 0.5, h: 0.76, valign: 'middle' });
    });
    return q;
  };
  steps('Understanding · Each step · 1 of 3', 'Prospect & Account Scoring, step by step', [
    [1, 'Prospect list upload', 'Your prospect list in the DemandAI template (Excel or CSV): people, company, site, consent, opt-out, owner.',
      ['Checks every required column', 'Fixes or flags bad rows: duplicates, missing fields', 'Holds back opt-outs and unknown consent', 'Groups people into accounts by domain'], 'Accounts and contacts loaded, with each issue and its fix.'],
    [2, 'Account fit scoring', 'Your ICP rubric: vertical, size, site profile, relationship, account type, contact coverage.',
      ['Scores each account out of 100 on the rubric', 'Applies the fit floor', 'Marks key accounts managed separately'], 'A fit score for every account, with the reason behind it.'],
    [3, 'Signal upload & tiering', 'Your signals in the signal template: company, contact, signal type, date, detail.',
      ['Matches each signal to the account and person', 'Weights it by type and age', 'Combines it with fit into a score', 'Ranks people into tiers A, B and C'], 'A ranked prospect list with why now for each person.'],
  ]);
  steps('Understanding · Each step · 2 of 3', 'Micro-segments & Next Best Action, step by step', [
    [4, 'Hand-off', 'The tier A and B prospects with a live signal (or the ones you pick).',
      ['Keeps only people who can be contacted', 'Counts the rest as held back, with why'], 'Prospects handed to NBA, and who was held back.'],
    [5, 'Micro-segmentation', 'The segments in your Setup (six to start with).',
      ['Groups accounts that share a reason to buy', 'Needs at least 3 accounts per segment', 'AI may suggest a new segment for a manager to approve'], 'Segments, each with its accounts and reason.'],
    [6, 'Next best action', 'The actions you set per segment in Setup.',
      ['AI picks the action that fits the signal and person', 'Chooses email, LinkedIn or call within consent', 'Estimates the first deal and confidence'], 'One action per prospect, with why.'],
    [7, 'Draft & checks', 'Your Content library: brand voice, approved claims, plays, banned words.',
      ['Writes the first message from approved content', 'Checks brand, claims, length, pricing, consent', 'Regenerates once if a check fails'], 'A ready draft, or the check that stopped it.'],
  ]);
  steps('Understanding · Each step · 3 of 3', 'For Review, release and Analytics, step by step', [
    [8, 'For Review', 'Reviewers: each rep for their own items; the sales manager for approvals.',
      ['Exception queue: items a check could not clear go to the rep', 'Approvals: sensitive topics (incidents, security, regulation) go to the sales manager', 'Weekly spot-check: about 20% of released items, at least one per rep, rated by a person'],
      'Accept, edit, choose an alternative or reject, with a reason.', true],
    [9, 'Release to reps', 'Nothing: items that pass every check go ahead on their own.',
      ["Puts ready actions on each rep's Today list", 'Reps send from their own email or LinkedIn', 'Nothing is sent automatically'], "Each rep's actions for today, ready to use."],
    [10, 'Analytics', 'The baseline and thresholds you agree (e.g. 38 minutes per action today).',
      ['G1: human review minutes per usable first action', 'G2: share accepted on the first pass', 'Too early to call until 10 decisions are counted', 'Pilot readout and weekly summary'], 'Whether the pilot meets G1 and G2, and why.'],
  ]);

  /* 8 Key questions: scoring */
  const questions = (kicker, title, tag, cols, ask) => {
    const q = content(kicker, title, 'Understanding');
    box(q, 10.33, 0.32, 2.4, 0.32, AMBER);
    T(q, tag, { x: 10.33, y: 0.32, w: 2.4, h: 0.32, fontSize: 10, bold: true, align: 'center', valign: 'middle', charSpacing: 1 });
    const n = cols.length, cw = (CW - (n - 1) * 0.3) / n;
    cols.forEach(([h, items], i) => {
      const x = X0 + i * (cw + 0.3);
      box(q, x, 1.6, cw, 0.85, INK);
      T(q, h, { x: x + 0.25, y: 1.6, w: cw - 0.5, h: 0.85, fontSize: 17, bold: true, color: AMBER, valign: 'middle' });
      box(q, x, 2.45, cw, ask ? 3.65 : 4.25, MIST, { rectRadius: 0.04 });
      T(q, bullets(items, { paraSpaceAfter: 7 }), { x: x + 0.25, y: 2.65, w: cw - 0.45, h: (ask ? 3.65 : 4.25) - 0.35, fontSize: 13.5, color: INK });
    });
    if (ask) { box(q, X0, 6.3, CW, 0.5, PALE); T(q, ask, { x: X0 + 0.3, y: 6.3, w: CW - 0.6, h: 0.5, fontSize: 14, bold: true, valign: 'middle' }); }
    return q;
  };
  questions('Understanding · Prospect & account scoring', 'Prospect & Account Scoring: key questions', 'ACCOUNT SCORING', [
    ['A. Lead lists & data', ['Where do lead lists come from today: CRM, events, bought data?', 'How many accounts and contacts per region and business unit?', 'How are duplicates, opt-outs and consent handled?', 'Who owns each account, and how is that recorded?', 'How often are lists refreshed?']],
    ['B. Ideal customer & fit', ['Who is the ideal customer: industry, site type, size, revenue?', 'Which criteria rule an account out?', 'Which roles and seniority do you target first?', 'Are existing customers and net-new treated differently?', 'Are some accounts managed separately (key accounts, partners)?']],
    ['C. Buying signals & timing', ['Which signals matter most: inquiries, end of support, renewals, projects, new leaders, webinars?', 'Where does each signal come from, and how fresh is it?', 'How long does a signal stay relevant?', 'Do you track installed-base and contract dates?']],
  ], 'Any additional pain points in finding and prioritising prospects?');

  /* 9 What DemandAI receives */
  s = content('Account scoring · Inputs', 'What DemandAI receives: two files in our templates', 'Understanding');
  T(s, 'DemandAI does not search the web in the pilot. Your team exports prospects and signals from your own systems into two templates and uploads them.', { x: X0, y: 1.3, w: CW, h: 0.4, fontSize: 14, color: SLATE });
  const tmpl = [['file', 'Prospect template', 'One row per person. Uploaded in Prospecting.',
      [['Person', 'first_name, last_name, job_title, seniority'], ['Contact', 'email, email_verified, linkedin_url'], ['Company', 'company_name, company_domain, country, industry, revenue, employees'],
       ['Site', 'site_name, process type, capacity'], ['Relationship', 'existing_customer, account_type, managed_separately'], ['Consent', 'consent_basis, opt_out'], ['Owner', 'owner_email (the rep)']]],
    ['bolt', 'Signal template', 'One row per signal. Uploaded in Scoring.',
      [['Who', 'company_name, company_domain, contact_email_or_linkedin'], ['What', 'signal_type (one of the types below, or one you add in Setup)'], ['When', 'event_date'], ['Detail', 'detail, source, product']]]];
  tmpl.forEach(([ic, h, sub, rows], i) => {
    const x = X0 + i * 6.15;
    box(s, x, 1.9, 5.9, 3.6, i ? INK : MIST);
    s.addImage({ data: i ? I.boltA : I.file, x: x + 0.25, y: 2.08, w: 0.4, h: 0.4 });
    T(s, h, { x: x + 0.8, y: 2.05, w: 4.9, h: 0.45, fontSize: 19, bold: true, color: i ? WHITE : INK, valign: 'middle' });
    T(s, sub, { x: x + 0.25, y: 2.55, w: 5.4, h: 0.3, fontSize: 12.5, italic: true, color: i ? LINE : SLATE });
    rows.forEach(([k, v], j) => T(s, [{ text: k + '  ', options: { bold: true, color: i ? AMBER : RUST } }, { text: v }], { x: x + 0.25, y: 2.95 + j * 0.36, w: 5.45, h: 0.34, fontSize: 12.5, color: i ? WHITE : INK, valign: 'middle' }));
  });
  T(s, 'Signal types: Inquiry or RFQ · Installed system near end of support · Service contract renewal · Capital project · Leadership change · Webinar attended · Webinar registered · Content download · Email clicked',
    { x: X0 + 6.4, y: 4.4, w: 5.45, h: 1.0, fontSize: 11.5, color: LINE });
  T(s, 'HOW DEMANDAI USES THE FILES', { x: X0, y: 5.68, w: 6, h: 0.3, fontSize: 12, bold: true, color: RUST, charSpacing: 1.5 });
  [['Check', 'Columns, values, duplicates, consent'], ['Match', 'Signal to account by domain, to person by email'], ['Score', 'Fit × signal weight × freshness'], ['Tier', 'A, B or C per person, with why now']].forEach(([h, d], i) => {
    const x = X0 + i * 3.06;
    s.addShape(i ? pres.shapes.CHEVRON : pres.shapes.PENTAGON, { x, y: 6.02, w: 2.98, h: 0.82, fill: { color: PALE }, line: { color: PALE, width: 0 } });
    disc(s, x + (i ? 0.35 : 0.15), 6.22, 0.42, AMBER, String(i + 1), INK, 12);
    T(s, [{ text: h, options: { bold: true, breakLine: true, fontSize: 13.5 } }, { text: d, options: { fontSize: 11, color: SLATE } }], { x: x + (i ? 0.88 : 0.68), y: 6.02, w: 1.8, h: 0.82, valign: 'middle' });
  });
  s.addNotes('In the pilot the data comes from the Client: two uploads in fixed templates. Connectors to CRM, web forms or news feeds are a later phase. Signal types can be extended in Setup; each new type feeds one of the segments.');

  /* 10 Our understanding: six micro-segments */
  s = content('Account scoring · Segments', 'Our understanding: six reasons a site buys now', 'Understanding');
  const segRows = [['Inquiry', 'Inquiry or RFQ', 'Answer the question they asked while it is live', 'Call to follow up on the inquiry · Route the inquiry to the sales owner'],
    ['Modernisation', 'Installed system near end of support', 'Plan the migration before end of support forces the timing', 'Propose a migration-path discussion · Offer a site assessment · Offer a lifecycle service review'],
    ['Service renewal', 'Service contract renewal', 'Check the cover still fits how the site runs today', 'Offer a renewal review · Route to the service owner'],
    ['Project', 'Capital project', 'Settle the control scope while the design is still open', 'Share a case study and offer a technical session · Offer a reference-site visit · Offer an early design workshop'],
    ['Leadership', 'Leadership change', 'Be useful to a new leader setting priorities', 'Introduce Client to the new leader · Share a peer case study · Invite to a short briefing'],
    ['Engagement', 'Webinar, download or email click', 'Follow up on the topic they chose to engage with', 'Follow up on the topic they engaged with · Invite to a related session']];
  const hd = t => ({ text: t, options: { bold: true, color: WHITE, fill: { color: INK }, fontSize: 12.5 } });
  s.addTable([[hd('Micro-segment'), hd('Signal that triggers it'), hd('Angle (the play)'), hd('Actions your team sets in Setup')],
    ...segRows.map((r, i) => r.map((t, j) => ({ text: t, options: { fontSize: 12, bold: j === 0, fill: { color: i % 2 ? WHITE : MIST } } })))],
  { x: X0, y: 1.45, w: CW, colW: [1.75, 2.45, 3.1, 4.83], rowH: 0.5, border: { type: 'solid', pt: 0.5, color: HEX.line }, valign: 'middle', margin: 0.07, color: INK });
  T(s, 'HOW THE NEXT BEST ACTION IS CHOSEN', { x: X0, y: 5.42, w: 6, h: 0.3, fontSize: 12, bold: true, color: RUST, charSpacing: 1.5 });
  [['Your inputs', 'Your team sets the segments and actions in Setup; they guide the AI.'], ['AI decides', 'The AI picks the action that fits the signal, the person and the account.'],
   ['Outside the list', 'A new action or segment the AI suggests goes to For Review, tagged, for a person to approve.']].forEach(([h, d], i) => {
    const x = X0 + i * 4.08;
    box(s, x, 5.78, 3.9, 1.0, i === 1 ? INK : PALE);
    disc(s, x + 0.2, 6.05, 0.45, AMBER, String(i + 1), INK, 13);
    T(s, [{ text: h, options: { bold: true, breakLine: true, fontSize: 14.5 } }, { text: d, options: { fontSize: 12 } }], { x: x + 0.8, y: 5.78, w: 2.95, h: 1.0, valign: 'middle', color: i === 1 ? WHITE : INK });
  });

  /* 11-13 Key questions: NBA */
  questions('Understanding · Micro-segments & NBA · 1 of 3', 'Micro-segments & NBA: key questions (1/3)', 'NEXT BEST ACTION', [
    ['D. Prioritising & segments', ['How do reps decide which accounts to work this week?', 'Do you group accounts by their reason to buy?', 'Who should approve a new segment?', 'How many accounts can a rep act on each week?']],
    ['E. Actions & channels', ['What does a rep do today in each situation: call, assessment, renewal review, case study?', 'Which channels are allowed per country: email, LinkedIn, phone?', 'What is a typical first deal size per segment?', 'Who picks up accounts with no rep?']],
    ['F. Messaging & content', ['How are first messages written today, and how long do they take?', 'Is there a brand guideline, tone of voice and banned words?', 'Is there a library of approved claims and case studies, with expiry dates?', 'Are there plays or frameworks per segment?']],
  ]);
  questions('Understanding · Micro-segments & NBA · 2 of 3', 'Micro-segments & NBA: key questions (2/3)', 'NEXT BEST ACTION', [
    ['G. Review & approval', ['Who reviews messages before they go out today?', 'Which topics need a manager: pricing, incidents, security, regulation?', 'What review effort per action is acceptable?', 'What should happen to a rejected suggestion?']],
    ['H. Rep hand-off & CRM', ['Where do reps work today: CRM, email, a sales engagement tool?', 'Should released actions become CRM tasks?', 'How are activities and outcomes logged?', 'Which notifications do reps want?']],
    ['I. Consent & data', ['Which consent bases apply in each country?', 'How are opt-outs captured and shared?', 'Any data residency requirements?', 'What happens to pilot data at the end?']],
  ]);
  questions('Understanding · Micro-segments & NBA · 3 of 3', 'Micro-segments & NBA: key questions (3/3)', 'NEXT BEST ACTION', [
    ['J. Learning & measurement', ['Are outcomes (reply, meeting, opportunity) recorded today, and where?', 'Is there a report of outbound metrics?', 'Is win or loss linked back to the first touch?', 'Which outcomes matter most to sales leadership?']],
    ['K. Baseline numbers', ['Research time per account', 'Time from signal to first touch', 'Reply and meeting rates by channel', 'Pipeline sourced from outbound', 'Accounts a rep works per week']],
  ]);

  /* 14 Divider 02 */
  divider('02', 'Key inputs from stakeholders', 'Key inputs needed from you for the pilot.', 'Key inputs');

  /* 15 What we need: data and content */
  s = content('Key requirements · 1 of 2', 'What we need: data and content', 'Key inputs');
  box(s, X0, 1.6, 4.6, 4.9, INK);
  box(s, X0 + 0.3, 1.85, 1.7, 0.36, AMBER);
  T(s, 'MOST IMPORTANT', { x: X0 + 0.3, y: 1.85, w: 1.7, h: 0.36, fontSize: 10, bold: true, align: 'center', valign: 'middle', charSpacing: 1 });
  T(s, 'Data to train and test the pilot', { x: X0 + 0.3, y: 2.4, w: 4.0, h: 0.9, fontSize: 22, bold: true, color: WHITE });
  T(s, bullets(['2 to 3 lead lists for the pilot business unit', '6 to 12 months of signals for those accounts', 'Outcomes: replied, meeting, opportunity, or no response', 'A mix of existing customers and net-new']), { x: X0 + 0.3, y: 3.4, w: 4.0, h: 2.0, fontSize: 14, color: WHITE });
  box(s, X0 + 0.3, 5.65, 1.9, 0.55, AMBER); T(s, [{ text: '80% ', options: { bold: true, fontSize: 18 } }, { text: 'tune', options: { fontSize: 12 } }], { x: X0 + 0.3, y: 5.65, w: 1.9, h: 0.55, align: 'center', valign: 'middle' });
  box(s, X0 + 2.4, 5.65, 1.9, 0.55, WHITE); T(s, [{ text: '20% ', options: { bold: true, fontSize: 18 } }, { text: 'test', options: { fontSize: 12 } }], { x: X0 + 2.4, y: 5.65, w: 1.9, h: 0.55, align: 'center', valign: 'middle' });
  const needs = [['Content library', ['Brand guideline, tone of voice, sign-off', 'Approved claims and case studies, with owners and expiry dates', 'Messaging plays per segment; banned words and competitors']],
    ['ICP and scoring rules', ['Ideal customer criteria and the fit floor', 'Target roles and seniority', 'Which signals count, and their weights']],
    ['Signal sources and actions', ['Web forms, webinar and email platforms, CRM, installed base', 'News or project feeds you subscribe to', 'The actions reps may take, by segment']]];
  needs.forEach(([h, items], i) => {
    const y = 1.6 + i * 1.68;
    disc(s, 5.55, y + 0.05, 0.45, AMBER, String(i + 1), INK, 13);
    T(s, h, { x: 6.2, y: y + 0.05, w: 6.4, h: 0.45, fontSize: 17, bold: true, valign: 'middle' });
    T(s, bullets(items, { paraSpaceAfter: 2 }), { x: 6.2, y: y + 0.55, w: 6.5, h: 1.05, fontSize: 13.5, color: SLATE });
  });

  /* 16 Access and ways of working */
  s = content('Key requirements · 2 of 2', 'What we need: access and ways of working', 'Key inputs');
  const ways = [['people', 'Pilot team', ['One business unit and 3 to 5 reps', 'Roles: admin, sales manager, rep, viewer, content owner']], ['cal', 'Cadence', ['Biweekly check-in', 'Inputs provided by agreed dates']],
    ['chat', 'Communication channel', ['Shared Teams channel', 'One owner per open question']], ['folder', 'Data and content repository', ['Central folder for lists, signals and content', 'Access-controlled for the pilot team']],
    ['key', 'System and InfoSec access', ['CRM export or read access', 'Security review and cloud account set-up']], ['flag', 'Scope and timelines', ['Agree the pilot business unit and dates', 'Review progress at each check-in']]];
  ways.forEach(([k, h, items], i) => {
    const x = X0 + (i % 3) * 4.08, y = 1.6 + Math.floor(i / 3) * 2.55;
    box(s, x, y, 3.9, 2.35, MIST);
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: y + 0.25, w: 0.6, h: 0.6, fill: { color: AMBER }, line: { color: AMBER, width: 0 } });
    s.addImage({ data: I[k], x: x + 0.4, y: y + 0.4, w: 0.3, h: 0.3 });
    T(s, h, { x: x + 1.0, y: y + 0.25, w: 2.8, h: 0.6, fontSize: 16, bold: true, valign: 'middle' });
    T(s, bullets(items, { paraSpaceAfter: 4 }), { x: x + 0.25, y: y + 1.05, w: 3.45, h: 1.2, fontSize: 13.5, color: SLATE });
  });

  /* 17-19 Success criteria */
  pres.addSection({ title: 'Success criteria' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Success criteria' });
  s.addText('SUCCESS CRITERIA · THE TWO MAIN MEASURES', { placeholder: 'kicker' }); s.addText('The pilot is judged on two measures: G1 and G2', { placeholder: 'title' });
  [['G1', 'Human review effort', 'How much time does a person spend making each first action usable?', [['Measured as', 'Review minutes per usable first action, from For Review timings'], ['Compared with', 'Your timed baseline (placeholder: 38 minutes today)'], ['Passes when', 'Effort drops by at least 50%']], '38 min → 19 min or less'],
   ['G2', 'Acceptance rate', 'How often does a person accept the recommended action on the first pass?', [['Measured as', 'Accepted ÷ decided, first-pass and exception items'], ['Counts as accepted', 'Accepted as is, or within one alternative'], ['Passes when', 'At least 70% are accepted']], '7 of every 10 or more']].forEach(([g, h, q, rows, ex], i) => {
    const x = X0 + i * 6.15, dark = i === 0;
    box(s, x, 1.5, 5.9, 4.85, dark ? INK : PALE);
    T(s, g, { x: x + 0.3, y: 1.65, w: 1.6, h: 1.0, fontSize: 54, bold: true, color: AMBER });
    T(s, [{ text: h, options: { bold: true, fontSize: 22, breakLine: true } }, { text: q, options: { fontSize: 13, italic: true } }], { x: x + 1.9, y: 1.7, w: 3.8, h: 1.1, color: dark ? WHITE : INK, valign: 'middle' });
    rows.forEach(([k, v], j) => {
      box(s, x + 0.3, 3.0 + j * 0.72, 5.3, 0.62, dark ? SLATE : WHITE);
      T(s, [{ text: k + '   ', options: { bold: true, color: dark ? AMBER : RUST } }, { text: v }], { x: x + 0.5, y: 3.0 + j * 0.72, w: 5.0, h: 0.62, fontSize: 13, color: dark ? WHITE : INK, valign: 'middle' });
    });
    T(s, [{ text: 'Example  ', options: { bold: true, color: dark ? AMBER : RUST } }, { text: ex, options: { bold: true } }], { x: x + 0.3, y: 5.3, w: 5.3, h: 0.5, fontSize: 15, color: dark ? WHITE : INK, valign: 'middle' });
  });
  T(s, 'Both read "too early to call" until 10 decisions are counted. Baseline, thresholds and the minimum are agreed with you at baselining and can be changed by a manager.', { x: X0, y: 6.45, w: CW, h: 0.5, fontSize: 12, color: GREY });
  s.addNotes('G1 asks whether the system saves people time; G2 asks whether people trust what it recommends. Spot-checked items count towards both, so the measures are not only drawn from the items people chose to look at.');

  const criteria = (title, rows, foot) => {
    const q = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Success criteria' });
    q.addText('SUCCESS CRITERIA · OTHER MEASURES', { placeholder: 'kicker' }); q.addText(title, { placeholder: 'title' });
    const h = t => ({ text: t, options: { bold: true, fill: { color: AMBER }, fontSize: 12 } });
    q.addTable([[h('#'), h('Baseline metric'), h('Metric definition'), h('How we measure it'), h('Metric illustration (examples)'), h('Rating scale')],
      ...rows.map((r, i) => [String(i + 1), ...r, '☆☆☆☆☆'].map((t, j) => ({ text: t, options: { fontSize: 12, bold: j === 1, color: j === 5 ? GREY : INK, fill: { color: i % 2 ? WHITE : MIST } } })))],
    { x: X0, y: 1.5, w: CW, colW: [0.45, 2.1, 3.2, 2.45, 2.75, 1.18], rowH: 0.68, border: { type: 'solid', pt: 0.5, color: HEX.line }, valign: 'middle', margin: 0.07, color: INK });
    T(q, foot, { x: X0, y: 6.45, w: CW, h: 0.5, fontSize: 11, color: GREY });
    return q;
  };
  criteria('Other measures: Prospect & Account Scoring', [
    ['Accounts covered*', 'How many target accounts are reviewed for buying signals today?', 'Accounts with a current score each month', 'Today 200 by hand | 2,000+ scored weekly'],
    ['Research effort*', 'How long does a rep spend finding out why to call an account?', 'Minutes per account', '30 minutes today vs 5 minutes to review | 80% less'],
    ['Signal-to-touch time*', 'How long after a signal does the first touch happen?', 'Average days from signal date to first touch', 'Not measured today vs within 3 working days'],
    ['Prioritisation accuracy*', 'Do the top-tier prospects produce most of the meetings?', 'Share of meetings from tier A and B', '70% of meetings from tier A and B'],
    ['List quality*', 'How many rows are unusable: duplicates, no contact, opted out?', 'Issues found per 1,000 rows', 'Flagged before scoring, with a fix suggested'],
    ['Missed signals', 'How many live signals were not acted on?', 'Signals older than 30 days with no touch', 'Not measured today vs tracked weekly']],
  '* can be measured during the pilot phase. Figures in the illustration column are examples to agree at baselining, not commitments.');
  criteria('Other measures: Micro-segments, NBA & For Review', [
    ['Go ahead on their own*', 'How many actions pass every check without a person?', 'Released automatically ÷ all actions', '6 in 10 go ahead; the rest are reviewed'],
    ['Messages on brand*', 'How many drafts pass the brand, claim and consent checks?', 'Share of drafts with no flag', '95% pass; the rest are corrected once automatically'],
    ['Spot-check rating*', 'Are released actions good when a person checks a sample?', 'Average rating of the weekly 20% sample', '4 out of 5 or better'],
    ['Rep adoption*', 'Do reps use the list each week?', 'Weekly active reps; actions worked', '4 of 5 reps active every week'],
    ['Reply and meeting rate', 'Do recommended actions get more responses?', 'Replies and meetings per 100 touches', 'Pilot reps vs the same reps last year'],
    ['Pipeline sourced', 'What pipeline starts from a DemandAI action?', 'Opportunities and value linked to a first touch', 'Tracked from pilot week 4']],
  '* can be measured during the pilot phase. Reply rates and pipeline need outcomes from your CRM; revenue attribution needs a longer window. Open to discussion.');

  /* 19 Timeline */
  pres.addSection({ title: 'Timeline' });
  s = content('Draft timeline', 'Draft pilot timeline', 'Timeline');
  const weeks = ['2', '9', '16', '23', '30', '7', '14', '21', '28', '4', '11', '18', '25', '1', '8', '15'];
  const months = [['Nov 2026', 5], ['Dec 2026', 4], ['Jan 2027', 4], ['Feb 2027', 3]];
  const gx = 5.3, gw = (W - 0.6 - gx) / 16, gy = 1.5;
  let m0 = 0;
  months.forEach(([m, n], i) => { box(s, gx + m0 * gw + 0.02, gy, n * gw - 0.04, 0.3, i % 2 ? SLATE : INK, { rectRadius: 0.03 }); T(s, m, { x: gx + m0 * gw, y: gy, w: n * gw, h: 0.3, fontSize: 11, bold: true, color: WHITE, align: 'center', valign: 'middle' }); m0 += n; });
  weeks.forEach((d, i) => T(s, [{ text: 'W' + (i + 1), options: { bold: true, breakLine: true } }, { text: d, options: { color: GREY } }], { x: gx + i * gw, y: gy + 0.33, w: gw, h: 0.42, fontSize: 9.5, align: 'center' }));
  const phases = [['Initiation & readiness', INK, [['Project preparation', 1, 1], ['Team briefing preparation', 1, 1], ['Pilot business unit and reps selected', 2, 1], ['Team confirmation', 2, 1]]],
    ['Discovery workshops', TEAL, [['Kick-off & demo', 2, 1], ['Sales & marketing workshop', 3, 1], ['Stakeholder alignment & requirements', 3, 2], ['Baseline, success criteria & work plan', 4, 2]]],
    ['Pilot: configure & set up', SLATE, [['Platform set-up & configuration', 4, 3], ['ICP rubric, signals & segment plays', 5, 3], ['Content library: brand, claims, plays', 5, 3], ['Data load: lead lists & signal feeds', 6, 2], ['Training run, tuning & fixes', 8, 2], ['UAT & InfoSec checks', 9, 2], ['User training', 10, 1]]],
    ['Pilot execution', RUST, [['Pilot run & measurement', 11, 4], ['User support', 11, 4]]],
    ['Results & recommendation', AMBER, [['Results consolidation', 15, 1], ['Rollout recommendation', 15, 2]]]];
  let ry = gy + 0.82; const rh = 0.225;
  phases.forEach(([p, col, tasks]) => {
    const ph = tasks.length * rh;
    box(s, X0, ry, 1.75, ph - 0.04, col, { rectRadius: 0.03 });
    T(s, p, { x: X0 + 0.08, y: ry, w: 1.6, h: ph - 0.04, fontSize: 10.5, bold: true, color: col === AMBER ? INK : WHITE, valign: 'middle' });
    tasks.forEach(([t, st, len], j) => {
      const y = ry + j * rh;
      T(s, t, { x: 2.5, y, w: 2.75, h: rh, fontSize: 10, valign: 'middle' });
      s.addShape(pres.shapes.LINE, { x: 2.5, y: y + rh, w: W - 0.6 - 2.5, h: 0, line: { color: LINE, width: 0.5 } });
      box(s, gx + (st - 1) * gw + 0.03, y + 0.045, len * gw - 0.06, rh - 0.09, col, { rectRadius: 0.03 });
    });
    ry += ph + 0.07;
  });
  T(s, 'Weeks start on Mondays. The year-end weeks (W8, W9) carry lighter work; dates are agreed at kick-off.', { x: X0, y: 7.05, w: 6, h: 0.3, fontSize: 10, color: GREY });

  /* 20 Thank you */
  s = pres.addSlide({ masterName: 'COVER', sectionTitle: 'Timeline' });
  diamond(s, 8.9, 1.3, 4.6, AMBER); diamond(s, 8.3, 4.6, 1.6, TEAL);
  T(s, 'DEMAND AI PILOT  ·  DISCOVERY WORKSHOP', { x: X0, y: 2.4, w: 8, h: 0.4, fontSize: 13, bold: true, color: AMBER, charSpacing: 2 });
  T(s, 'Thank you', { x: X0, y: 2.9, w: 8, h: 1.2, fontSize: 54, bold: true, color: WHITE });
  T(s, 'Questions and discussion welcome.', { x: X0, y: 4.1, w: 8, h: 0.5, fontSize: 18, color: LINE });
  T(s, 'Prepared for Client  ·  Response to RFP  ·  Confidential', { x: X0, y: 6.75, w: 7, h: 0.3, fontSize: 11, color: GREY });

  /* Appendix */
  pres.addSection({ title: 'Appendix' });
  s = pres.addSlide({ masterName: 'DIVIDER', sectionTitle: 'Appendix' });
  diamond(s, 8.4, 1.5, 4.2, SLATE);
  T(s, 'A', { x: 8.4, y: 1.5, w: 4.2, h: 4.2, align: 'center', valign: 'middle', fontSize: 72, bold: true, color: AMBER });
  T(s, 'Appendix', { x: X0, y: 2.8, w: 7.4, h: 1.0, fontSize: 40, bold: true, color: WHITE });
  T(s, 'Security and responsible AI, agent detail and validation dimensions.', { x: X0, y: 3.9, w: 7, h: 0.8, fontSize: 16, color: LINE });

  /* Security: three layers */
  s = content('Security and responsible AI', 'Three layers of protection', 'Appendix');
  T(s, 'Every AI request passes through all three before a draft reaches your team', { x: X0, y: 1.3, w: 9, h: 0.35, fontSize: 14, color: SLATE });
  const lay = [['LAYER 1', 'AI gateway', 'Checks every call to and from the AI', ['Only features you switched on', 'Sends the minimum data needed', 'Logs metadata, never the prompt text']],
    ['LAYER 2', 'Controlled agents', 'Agents follow fixed, approved rules', ['Versioned prompt templates', 'Approved claims and plays only', 'Every action tied to a user']],
    ['LAYER 3', 'Draft checks', 'Every draft checked before you see it', ['Brand, claim and consent checks', 'Sensitive topics to a manager', 'Rules fallback if a check fails']]];
  lay.forEach(([tag, h, sub, items], i) => {
    const x = 1.6 + i * 3.6;
    box(s, x, 1.9, 3.3, 4.1, i === 1 ? INK : MIST);
    T(s, tag, { x: x + 0.3, y: 2.1, w: 2.7, h: 0.3, fontSize: 11, bold: true, color: i === 1 ? AMBER : RUST, charSpacing: 1.5 });
    T(s, h, { x: x + 0.3, y: 2.45, w: 2.85, h: 0.5, fontSize: 18, bold: true, color: i === 1 ? WHITE : INK });
    T(s, sub, { x: x + 0.3, y: 3.0, w: 2.7, h: 0.6, fontSize: 13, italic: true, color: i === 1 ? LINE : SLATE });
    items.forEach((t, j) => {
      s.addImage({ data: i === 1 ? I.shield : I.check, x: x + 0.3, y: 3.8 + j * 0.65, w: 0.28, h: 0.28 });
      T(s, t, { x: x + 0.75, y: 3.72 + j * 0.65, w: 2.35, h: 0.5, fontSize: 13, color: i === 1 ? WHITE : INK, valign: 'middle' });
    });
  });
  T(s, 'Your data', { x: 0.3, y: 3.6, w: 0.85, h: 0.6, fontSize: 12, bold: true, align: 'center', valign: 'middle' });
  T(s, 'Draft you see', { x: 12.4, y: 3.6, w: 0.85, h: 0.6, fontSize: 12, bold: true, align: 'center', valign: 'middle' });
  s.addImage({ data: I.arrow, x: 1.25, y: 3.78, w: 0.25, h: 0.25 }); s.addImage({ data: I.arrow, x: 12.12, y: 3.78, w: 0.25, h: 0.25 });
  box(s, 1.6, 6.2, 10.5, 0.5, PALE);
  s.addImage({ data: I.stop, x: 1.8, y: 6.3, w: 0.3, h: 0.3 });
  T(s, 'If anything is flagged at any layer, the draft stops and the rules version or a person takes over.', { x: 2.25, y: 6.2, w: 9.7, h: 0.5, fontSize: 14, bold: true, valign: 'middle' });

  /* Network, access and governance */
  s = content('Security and responsible AI', 'Network, access and governance', 'Appendix');
  const gov = [['Network and access', ['No exposure to the public internet', 'TLS everywhere; a nonce-based content policy', 'Invite-only sign-in with lockout; SSO at go-live', 'Row-level security per business unit and owner']],
    ['Governance and assurance', ['Reviewed against your AI and security policies', 'Penetration test findings tracked to closure', 'New AI features stay off until you approve them', 'Pilot data exported and purged at the end']]];
  gov.forEach(([h, items], i) => {
    const x = X0 + i * 6.15;
    T(s, h, { x, y: 1.55, w: 5.9, h: 0.45, fontSize: 18, bold: true });
    items.forEach((t, j) => {
      box(s, x, 2.1 + j * 0.72, 5.9, 0.6, MIST);
      s.addImage({ data: I.check, x: x + 0.2, y: 2.24 + j * 0.72, w: 0.3, h: 0.3 });
      T(s, t, { x: x + 0.7, y: 2.1 + j * 0.72, w: 5.0, h: 0.6, fontSize: 14, valign: 'middle' });
    });
  });
  T(s, 'WHO LOOKS AFTER WHAT', { x: X0, y: 5.1, w: 6, h: 0.3, fontSize: 12, bold: true, color: RUST, charSpacing: 1.5 });
  [['Your IT team', 'Network, company sign-in, access policies, approving new features'], ['Platform team', 'AI gateway, agent rules, checks, backups, monitoring']].forEach(([h, d], i) => {
    const x = X0 + i * 6.15;
    box(s, x, 5.5, 5.9, 1.0, i ? INK : PALE);
    T(s, [{ text: h, options: { bold: true, breakLine: true, fontSize: 16 } }, { text: d, options: { fontSize: 13 } }], { x: x + 0.3, y: 5.5, w: 5.3, h: 1.0, valign: 'middle', color: i ? WHITE : INK });
  });

  /* Agent detail */
  const detail = (n, of, h, ags) => {
    const q = content(`AI agents · Detail · ${n} of ${of}`, `${h}: ${ags.length} agents`, 'Appendix');
    const hdr = t => ({ text: t, options: { bold: true, color: WHITE, fill: { color: INK }, fontSize: 13, charSpacing: 1 } });
    q.addTable([[hdr('AGENT'), hdr('WHAT IT DOES'), hdr('YOUR TEAM')], ...ags.map(([a, d, y], i) => [
      { text: a, options: { bold: true, fontSize: 15, fill: { color: i % 2 ? WHITE : MIST } } },
      { text: d, options: { fontSize: 14, fill: { color: i % 2 ? WHITE : MIST } } },
      { text: y, options: { fontSize: 14, color: TEAL, bold: true, fill: { color: i % 2 ? WHITE : MIST } } }])],
    { x: X0, y: 1.6, w: CW, colW: [2.8, 6.2, 3.13], rowH: 0.82, border: { type: 'solid', pt: 0.5, color: HEX.line }, valign: 'middle', margin: 0.12, color: INK });
  };
  const all = STAGES;
  all.forEach(([h, ags], i) => detail(i + 1, all.length, h, ags));

  /* Validation dimensions */
  s = content('Validation dimensions', 'Pilot validation dimensions', 'Appendix');
  const dims = ['Data understanding: list quality, matching and de-duplication', 'Scoring that a rep agrees with, and can trace', 'Segments that make sense to sales and marketing', 'Actions and channels that fit the signal and consent',
    'Messages on brand, with approved claims only', 'Review and quality control: exceptions, approvals, spot-checks', 'Integration with CRM and the tools reps use', 'Actual productivity: time saved, acceptance, replies, pipeline'];
  dims.forEach((d, i) => {
    const x = X0 + (i % 2) * 6.15, y = 1.6 + Math.floor(i / 2) * 1.25;
    box(s, x, y, 5.9, 1.05, i % 2 ? MIST : PALE);
    diamond(s, x + 0.25, y + 0.2, 0.65, AMBER);
    T(s, String(i + 1), { x: x + 0.25, y: y + 0.2, w: 0.65, h: 0.65, align: 'center', valign: 'middle', bold: true, fontSize: 15 });
    T(s, d, { x: x + 1.15, y, w: 4.55, h: 1.05, fontSize: 15, valign: 'middle' });
  });

  await pres.writeFile({ fileName: 'DemandAI_Pilot_Proposal.pptx' });
  await applyTheme('DemandAI_Pilot_Proposal.pptx', THEME);
  console.log('written');
})().catch(e => { console.error(e); process.exit(1); });
