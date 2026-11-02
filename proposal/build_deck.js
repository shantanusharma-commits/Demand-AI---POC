// Pilot proposal deck for the platform: a sales story first (who to target, why now, what to say), then what makes it work.
const NAME = 'Marketing Intelligence AI';   // product name: change it here only
const pptxgen = require('pptxgenjs');
const React = require('react');
const RDS = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa6');
const { applyTheme } = require('/root/.claude/skills/synced/f7fa06b4-2868-40b5-8f36-79579d15dcaa_7a0111b3-0b36-48aa-b693-79c86e571a7a/pptx/scripts/apply_theme.js');

const HEX = { ink: '1B1F2A', slate: '2E3A4F', white: 'FFFFFF', mist: 'F3F4F6', amber: 'F2A900', teal: '0E7C7B', rust: 'B4441C', grey: '64748B', pale: 'FCEFC7', line: 'D9DEE5' };
const THEME = { name: 'Pilot Proposal', headFontFace: 'Calibri', bodyFontFace: 'Calibri',
  colors: { dk1: HEX.ink, lt1: HEX.white, dk2: HEX.slate, lt2: HEX.mist, accent1: HEX.amber, accent2: HEX.teal, accent3: HEX.rust, accent4: HEX.grey, accent5: HEX.pale, accent6: HEX.line, hlink: HEX.teal, folHlink: HEX.grey } };

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = NAME + ': who to target, why now, and what to say';
pres.author = NAME + ' team';
const C = pres.SchemeColor;
const INK = C.text1, WHITE = C.background1, MIST = C.background2, SLATE = C.text2, AMBER = C.accent1, TEAL = C.accent2, RUST = C.accent3, GREY = C.accent4, PALE = C.accent5, LINE = C.accent6;
const W = 13.333, X0 = 0.6, CW = W - 1.2;
const FOOT = NAME + '  ·  Prepared for Client  ·  Confidential';

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
  T(s, NAME.toUpperCase(), { x: X0, y: 1.6, w: 7.8, h: 0.5, fontSize: 18, bold: true, color: AMBER, charSpacing: 3 });
  T(s, 'Who to target.\nWhy now.\nWhat to say.', { x: X0, y: 2.15, w: 8.2, h: 2.3, fontSize: 46, bold: true, color: WHITE });
  T(s, 'Your reps can work 10 to 15 accounts well in a day. Their lists hold hundreds. We help them pick the right ones and open with the right message.', { x: X0, y: 4.55, w: 7.6, h: 0.9, fontSize: 16, color: LINE });
  T(s, 'Discovery workshop  |  November 2026', { x: X0, y: 5.75, w: 7, h: 0.4, fontSize: 14, color: AMBER, bold: true });
  T(s, 'Prepared for Client  ·  Response to RFP  ·  Confidential', { x: X0, y: 6.75, w: 7, h: 0.3, fontSize: 11, color: GREY });

  s.addNotes('Open with the anchor and say it with confidence: who to target, why now, what to say. Everything in the demo hangs on these three. Then go straight to the rep\'s problem.');

  /* 1b The sales problem */
  s = content('The sales problem', 'Every rep starts the day with the same three questions', 'Overview');
  box(s, X0, 1.6, 4.3, 4.75, INK);
  T(s, [{ text: '10–15', options: { fontSize: 54, bold: true, color: AMBER, breakLine: true } }, { text: 'accounts a rep can work well in a day', options: { fontSize: 15, color: WHITE } }], { x: X0 + 0.35, y: 1.8, w: 3.7, h: 1.9 });
  s.addShape(pres.shapes.LINE, { x: X0 + 0.35, y: 3.85, w: 3.6, h: 0, line: { color: SLATE, width: 1 } });
  T(s, [{ text: 'Hundreds', options: { fontSize: 44, bold: true, color: WHITE, breakLine: true } }, { text: 'to thousands of accounts on each rep\'s list', options: { fontSize: 15, color: LINE } }], { x: X0 + 0.35, y: 4.0, w: 3.7, h: 1.9 });
  const qs3 = [['Who should I call today?', 'Today: gut feel, or whoever was touched last. Good accounts wait while the list is sorted by hand.'],
    ['Why them, and why now?', 'Today: up to 30 minutes of research per account, across the CRM, news, LinkedIn and event lists.'],
    ['What do I say?', 'Today: a first message written from scratch, then checked with marketing for brand and claims.']];
  qs3.forEach(([q, d], i) => {
    const y = 1.6 + i * 1.62;
    box(s, 5.25, y, 7.48, 1.45, i === 0 ? PALE : MIST);
    disc(s, 5.5, y + 0.42, 0.6, AMBER, String(i + 1), INK, 18);
    T(s, [{ text: q, options: { bold: true, fontSize: 20, breakLine: true } }, { text: d, options: { fontSize: 13, color: SLATE } }], { x: 6.35, y: y + 0.1, w: 6.2, h: 1.25, valign: 'middle' });
  });
  box(s, X0, 6.5, CW, 0.45, AMBER);
  T(s, NAME + ' answers all three every morning, so reps spend their time selling, not sorting.', { x: X0, y: 6.5, w: CW, h: 0.45, fontSize: 15, bold: true, align: 'center', valign: 'middle' });
  s.addNotes('Speak as a sales person. "A good rep can work 10 to 15 accounts properly in a day, but owns hundreds. So every morning they ask: who do I call, why them, why now, and what do I say? Today each answer costs time: sorting the list, researching each account, writing from scratch." Then: "Let me show you a Monday morning with the platform."');

  /* 2 In this pack */
  s = content('In this pack', 'Overview', 'Overview');
  const pack = [['A rep\'s Monday morning', 'Live demo: who to target, why now, what to say'], ['What makes it work', 'The agents and the flow, tuned to your process'],
    ['Setting it up together', 'A few questions today; the rest in a short questionnaire'], ['Success criteria', 'How we will measure the pilot'], ['Draft pilot timeline', '4 to 5 weeks of pilot run after set-up']];
  pack.forEach(([h, d], i) => {
    const x = X0 + i * 2.45, y = 2.0;
    box(s, x, y, 2.25, 3.9, i === 0 ? INK : MIST);
    diamond(s, x + 0.3, y + 0.35, 0.65, AMBER);
    T(s, String(i + 1), { x: x + 0.3, y: y + 0.35, w: 0.65, h: 0.65, align: 'center', valign: 'middle', bold: true, fontSize: 16 });
    T(s, h, { x: x + 0.25, y: y + 1.2, w: 1.85, h: 1.0, bold: true, fontSize: 16, color: i === 0 ? WHITE : INK });
    T(s, d, { x: x + 0.25, y: y + 2.35, w: 1.8, h: 1.4, fontSize: 13, color: i === 0 ? LINE : SLATE });
  });

  /* 3 Pilot scope */
  s = content('Pilot scope', 'Two modules answer the three questions', 'Overview');
  box(s, X0, 1.7, 5.7, 4.6, PALE);
  s.addImage({ data: I.search, x: X0 + 0.4, y: 2.0, w: 0.5, h: 0.5 });
  T(s, 'Who to target, and why now', { x: X0 + 1.1, y: 2.0, w: 4.4, h: 0.5, fontSize: 22, bold: true, valign: 'middle' });
  T(s, 'Prospect & Account Scoring: the accounts with a live reason to buy', { x: X0 + 0.4, y: 2.7, w: 5, h: 0.4, fontSize: 14, italic: true, color: SLATE });
  T(s, bullets(['Checks and cleans your lead lists', 'Scores every account against your ICP', 'Reads buying signals and how fresh they are', 'Ranks people into tiers A, B and C, with why now']),
    { x: X0 + 0.4, y: 3.3, w: 5, h: 2.6, fontSize: 15 });
  box(s, 6.73, 1.7, 6.0, 4.6, INK);
  s.addImage({ data: await icon(fa.FaBolt, HEX.amber), x: 7.13, y: 2.0, w: 0.5, h: 0.5 });
  T(s, 'What to do, and what to say', { x: 7.83, y: 2.0, w: 4.7, h: 0.5, fontSize: 22, bold: true, color: WHITE, valign: 'middle' });
  T(s, 'Micro-segments & Next Best Action: a ready first touch for each one', { x: 7.13, y: 2.7, w: 5.3, h: 0.4, fontSize: 14, italic: true, color: LINE });
  T(s, bullets(['Groups accounts that share a reason into micro-segments', 'Recommends the next best action and channel', 'Drafts the first message from approved content only',
    'Checks brand, consent and sensitive topics', 'Routes exceptions to For Review; releases the rest to reps']), { x: 7.13, y: 3.3, w: 5.4, h: 2.4, fontSize: 15, color: WHITE });
  box(s, 7.13, 5.65, 5.2, 0.45, AMBER);
  T(s, 'A person decides anything the system cannot.', { x: 7.13, y: 5.65, w: 5.2, h: 0.45, align: 'center', valign: 'middle', bold: true, fontSize: 14 });
  s.addImage({ data: I.arrow, x: 6.38, y: 3.8, w: 0.3, h: 0.3 });
  s.addNotes('Two modules, one flow. Scoring decides who has a reason to buy now; NBA decides what each rep does about it. Nothing is sent automatically in the pilot: reps send from their own tools.');

  /* 3b The demo: a rep's Monday morning */
  s = content('Live demo · The story', 'A Monday morning with the platform', 'Overview');
  T(s, 'Each step starts with what the sales team needs to get done. The platform does the work; people make the calls.', { x: X0, y: 1.28, w: CW, h: 0.4, fontSize: 14, color: SLATE });
  const beats = [['What needs me today?', 'Overnight it read every list and signal. Most actions went ahead on their own; a few wait for me.', 'Today'],
    ['Is my list worth working?', 'I run my list through it. In seconds: bad emails, duplicates and opt-outs flagged, people matched to companies.', 'Prospecting'],
    ['Who is ready to buy, and why?', 'Every account ranked against our ideal customer and its buying signals, with why now and what would lift it a tier.', 'Account Scoring'],
    ['What do I say?', 'Accounts grouped by their reason to buy, each with a next best action, a first message on brand and a call script.', 'Micro-segments & NBA'],
    ['What only I can decide', 'Five minutes a day: sensitive messages, segments too small, anything new. Every decision is logged.', 'For Review'],
    ['Is it working?', 'Minutes of human effort per action against today\'s 38, and how often we accept what it recommends.', 'Analytics']];
  beats.forEach(([job, does, screen], i) => {
    const x = X0 + (i % 3) * 4.08, y = 1.85 + Math.floor(i / 3) * 2.3;
    box(s, x, y, 3.9, 2.1, i === 0 ? INK : MIST);
    disc(s, x + 0.22, y + 0.22, 0.48, AMBER, String(i + 1), INK, 15);
    T(s, job, { x: x + 0.85, y: y + 0.15, w: 2.9, h: 0.62, fontSize: 17, bold: true, color: i === 0 ? WHITE : INK, valign: 'middle' });
    T(s, does, { x: x + 0.25, y: y + 0.85, w: 3.45, h: 0.9, fontSize: 13, color: i === 0 ? LINE : SLATE });
    T(s, 'SCREEN: ' + screen.toUpperCase(), { x: x + 0.25, y: y + 1.72, w: 3.45, h: 0.28, fontSize: 10, bold: true, color: i === 0 ? AMBER : RUST, charSpacing: 1 });
  });
  box(s, X0, 6.5, CW, 0.45, PALE);
  T(s, 'Who to target  ·  Why now  ·  What to say: the platform does the sorting, your team does the selling.', { x: X0, y: 6.5, w: CW, h: 0.45, fontSize: 14, bold: true, align: 'center', valign: 'middle' });
  s.addNotes('Talk track for the demo, always leading with the job, then how the platform helps. 1 Today: "It is Monday. Before I logged in, the platform read every list and signal: 23 actions, 21 already went ahead. I only look at what needs me." 2 Prospecting: "I run my new leads through it; instead of an afternoon cleaning a spreadsheet, the checks take seconds." 3 Scoring: "Which of these is ready to buy? I get a ranked list, and for each one why now; a tier B tells me what would move it to A." 4 NBA: "What do I say? Accounts with the same reason to buy get the same play, and a first message on brand, citing approved proof." 5 For Review: "Five minutes a day on what only I can decide, and every decision is logged." 6 Analytics: "Is it working? Effort per action against 38 minutes today, and how often we accept what it recommends." Close: "You have seen it work. Let me show you what makes it work, and what we set up with you."');

  /* 4 Divider 01 */
  const divider = (n, title, sub, section) => {
    pres.addSection({ title: section });
    const d = pres.addSlide({ masterName: 'DIVIDER', sectionTitle: section });
    diamond(d, 8.4, 1.5, 4.2, AMBER);
    T(d, n, { x: 8.4, y: 1.5, w: 4.2, h: 4.2, align: 'center', valign: 'middle', fontSize: 72, bold: true });
    T(d, NAME.toUpperCase() + '  ·  ' + section.toUpperCase(), { x: X0, y: 2.2, w: 7, h: 0.4, fontSize: 13, bold: true, color: AMBER, charSpacing: 2 });
    T(d, title, { x: X0, y: 2.8, w: 7.4, h: 1.6, fontSize: 40, bold: true, color: WHITE });
    T(d, sub, { x: X0, y: 4.5, w: 7, h: 0.8, fontSize: 16, color: LINE });
    return d;
  };
  divider('01', 'What makes it work', 'You have seen it work. Here is what is behind it, and what we tune to your process.', 'How it works');

  /* 6 Agents overview */
  const STAGES = [
    ['Find and score', [['List Checker', 'Checks and cleans the lead file: duplicates, missing fields, opt-outs and consent.', 'Uploads the list, fixes flagged rows'],
      ['Fit Scorer', 'Scores each account against your ICP rubric and fit floor.', 'Agrees the rubric'],
      ['Signal Reader', 'Reads every signal file attached to the list and matches each signal to its account and person.', 'Admin loads files; managers and reps add fresh ones'],
      ['Signal Classifier', 'Sorts a signal type it has never seen: another name for a known one, a new buying signal, or not a signal.', 'Manager approves it once'],
      ['Timing Scorer', 'Weights each signal by type and how fresh it is.', 'Agrees the weights'],
      ['Tier Ranker', 'Ranks people into tiers A, B and C and explains why now.', 'Chooses who is handed off']]],
    ['Segment and plan', [['Segmenter', 'Groups accounts by reason to buy; proposes a new segment when 3 or more share a new reason, and keeps smaller groups as candidates.', 'Manager approves new segments'],
      ['Action Recommender', 'Picks the next best action from your action library; proposes a new action when none fits.', 'Manager approves new actions into the library'],
      ['Channel Picker', 'Chooses email, LinkedIn or a call, within consent and verification limits.', 'Rep can change the channel'],
      ['Deal Sizer', 'Estimates the first deal and how confident the recommendation is.', 'Manager sets the thresholds']]],
    ['Draft', [['Brief Builder', 'Sets out who, why now, the angle, the proof point and the ask.', 'Marketing owns the plays'],
      ['Draft Writer', 'Writes the first message in your brand voice from approved content only.', 'Rep edits before sending'],
      ['Claim Matcher', 'Picks an approved, unexpired claim that fits the segment.', 'Marketing approves claims'],
      ['Call Script Writer', 'Prepares the opener, discovery questions and objection handling.', 'Rep uses it on the call']]],
    ['Review and compliance', [['Brand Checker', 'Checks banned words and openers, length, pricing and competitor mentions.', 'Marketing sets the rules'],
      ['Consent Guard', 'Stops anyone who opted out or has no recognised consent before hand-off.', 'Admin confirms the bases'],
      ['Sensitive-topic Router', 'Sends incidents, security and regulation topics to the sales manager.', 'Manager approves or rejects'],
      ['Spot-checker', 'Draws about 20% of released actions each week, at least one per rep, for rating.', 'Manager rates the sample'],
      ['Claim Checker', 'Checks a new claim for spelling, grammar and a figure with no source before it is approved.', 'Marketing fixes or confirms']]],
    ['Release and measure', [['Rep Hand-off', "Releases ready actions to each rep's list for today.", 'Rep works the list'],
      ['Decision Log', 'Records every accept, reject, edit and alternative, with the reason and the review time.', 'Reviewer gives the reason'],
      ['Metrics Reporter', 'Reports G1 (human review effort) and G2 (acceptance rate) against the agreed thresholds.', 'Leaders review the readout']]]];
  const nAgents = STAGES.reduce((n, st) => n + st[1].length, 0);
  s = content('AI agents · Overview', `${nAgents} agents across the demand journey`, 'How it works');
  STAGES.forEach(([h, ags], i) => {
    const x = X0 + i * 2.45;
    box(s, x, 1.55, 2.3, 0.75, INK);
    T(s, [{ text: h, options: { bold: true, breakLine: true } }, { text: `${ags.length} agents`, options: { color: AMBER, fontSize: 12 } }], { x: x + 0.15, y: 1.6, w: 2.0, h: 0.65, fontSize: 14, color: WHITE, valign: 'middle' });
    ags.forEach(([n], j) => {
      box(s, x, 2.42 + j * 0.54, 2.3, 0.46, MIST);
      s.addShape(pres.shapes.OVAL, { x: x + 0.12, y: 2.53 + j * 0.54, w: 0.24, h: 0.24, fill: { color: AMBER }, line: { color: AMBER, width: 0 } });
      T(s, n, { x: x + 0.5, y: 2.42 + j * 0.54, w: 1.75, h: 0.46, fontSize: 13, valign: 'middle' });
    });
  });
  box(s, X0, 5.75, CW, 0.75, PALE);
  T(s, [{ text: 'Behind every stage: For Review', options: { bold: true, breakLine: true } }, { text: 'People decide what the system could not', options: { fontSize: 12, color: SLATE } }], { x: X0 + 0.25, y: 5.8, w: 3.4, h: 0.65, fontSize: 14, valign: 'middle' });
  [['Exception queue', "rep's own checks"], ['Approvals', 'sensitive messages, new segments, actions, signal types'], ['Weekly spot-check', 'about 20% of released items']].forEach(([n, d], i) => {
    s.addShape(pres.shapes.OVAL, { x: 4.0 + i * 2.95, y: 5.98, w: 0.3, h: 0.3, fill: { color: TEAL }, line: { color: TEAL, width: 0 } });
    T(s, [{ text: n, options: { bold: true, breakLine: true } }, { text: d, options: { fontSize: 11, color: SLATE } }], { x: 4.42 + i * 2.95, y: 5.78, w: 2.55, h: 0.7, fontSize: 14, valign: 'middle' });
  });
  T(s, 'Agents prepare the work. Your team makes every decision.', { x: X0, y: 6.62, w: 7, h: 0.3, fontSize: 13, italic: true, color: SLATE });
  s.addNotes('Anchor slide. Transition: "You have seen it work from a sales person\'s seat. Behind it, these agents each do one job, and we set them up with you so they fit how your team sells." Each agent has one job. Scoring, segmentation, routing and the checks are tested rules, so every result can be traced; AI words the drafts, proposes new segments, actions and signal types (each waits for the sales manager\'s approval), behind the gateway and switched off until you approve its results. Agents never send, approve or commit on the company\'s behalf.');

  /* 5 How it works */
  s = content('Platform · Technology stack', 'How it all works', 'How it works');
  T(s, 'How a request travels, and the six layers behind it', { x: X0, y: 1.3, w: 8, h: 0.35, fontSize: 14, color: SLATE });
  const flow = [['users', 'Your team', 'Browser, invite-only sign-in'], ['browser', 'Web app', 'One screen per step'], ['gears', 'Rules engine', 'Tested rules: score, segment, route'],
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

  /* 7 Understanding the flow */
  s = content('How it works · The flow', 'The flow, end to end', 'How it works');
  const chevrons = (y, label, steps, fill, txt, wEach) => {
    T(s, label, { x: X0, y: y - 0.4, w: 6, h: 0.3, fontSize: 12, bold: true, color: RUST, charSpacing: 1.5 });
    steps.forEach((t, i) => {
      const x = X0 + i * (wEach + 0.08);
      s.addShape(i ? pres.shapes.CHEVRON : pres.shapes.PENTAGON, { x, y, w: wEach, h: 1.0, fill: { color: fill }, line: { color: fill, width: 0 } });
      disc(s, x + (i ? 0.38 : 0.18), y + 0.31, 0.38, AMBER, String(i + 1), INK, 12);
      T(s, t, { x: x + (i ? 0.85 : 0.65), y, w: wEach - (i ? 1.25 : 0.95), h: 1.0, fontSize: 13, bold: true, color: txt, valign: 'middle' });
    });
  };
  chevrons(1.95, 'PROSPECT & ACCOUNT SCORING', ['Prospect list upload', 'Account fit scoring', 'Signals & tiering'], PALE, INK, 4.0);
  T(s, 'MICRO-SEGMENTS, NEXT BEST ACTION, REVIEW & APPROVALS', { x: X0, y: 3.45, w: 7, h: 0.3, fontSize: 12, bold: true, color: RUST, charSpacing: 1.5 });
  ['Hand-off of tier A and B', 'Micro-segmentation', 'Next best action', 'Draft & checks', 'Review & approvals', 'Release to reps', 'Analytics: G1 and G2'].forEach((t, i) => {
    const x = X0 + i * 1.74;
    s.addShape(i ? pres.shapes.CHEVRON : pres.shapes.PENTAGON, { x, y: 3.85, w: 1.66, h: 0.75, fill: { color: i === 4 ? TEAL : INK }, line: { color: i === 4 ? TEAL : INK, width: 0 } });
    disc(s, x + (i ? 0.62 : 0.5), 4.03, 0.4, AMBER, String(i + 4), INK, 12);
    T(s, t, { x: x + 0.05, y: 4.7, w: 1.55, h: 0.6, fontSize: 13, bold: true, align: 'center' });
  });
  box(s, X0, 5.55, CW, 0.9, MIST);
  T(s, [{ text: 'Next: ', options: { bold: true } }, { text: 'each step is on the next three slides. In the workshop your team tells us how each one works today, so the pilot is set up to your process.' }],
    { x: X0 + 0.3, y: 5.55, w: CW - 0.6, h: 0.9, fontSize: 15, valign: 'middle' });

  // One card per step: what you give, what the platform does, what you see.
  const steps = (kicker, title, list) => {
    const q = content(kicker, title, 'How it works');
    const n = list.length, cw = (CW - (n - 1) * 0.25) / n, fs = n > 3 ? 12.5 : 13.5;
    list.forEach(([num, name, give, does, see, hi], i) => {
      const x = X0 + i * (cw + 0.25);
      box(q, x, 1.55, cw, 0.8, hi ? TEAL : INK);
      disc(q, x + 0.18, 1.74, 0.42, AMBER, String(num), INK, 13);
      T(q, name, { x: x + 0.72, y: 1.55, w: cw - 0.85, h: 0.8, fontSize: 16, bold: true, color: WHITE, valign: 'middle' });
      box(q, x, 2.35, cw, 4.35, MIST, { rectRadius: 0.04 });
      T(q, [{ text: 'YOU GIVE', options: { bold: true, color: RUST, fontSize: 10.5, charSpacing: 1, breakLine: true } }, { text: give, options: { fontSize: fs } }],
        { x: x + 0.2, y: 2.5, w: cw - 0.4, h: 0.95 });
      T(q, 'THE PLATFORM DOES', { x: x + 0.2, y: 3.5, w: cw - 0.4, h: 0.25, bold: true, color: RUST, fontSize: 10.5, charSpacing: 1 });
      T(q, bullets(does, { paraSpaceAfter: 3 }), { x: x + 0.2, y: 3.78, w: cw - 0.35, h: 1.95, fontSize: fs });
      box(q, x + 0.12, 5.78, cw - 0.24, 0.8, PALE);
      T(q, [{ text: 'YOU SEE  ', options: { bold: true, color: RUST, fontSize: 10.5, charSpacing: 1, breakLine: true } }, { text: see, options: { fontSize: fs - 0.5 } }],
        { x: x + 0.25, y: 5.8, w: cw - 0.5, h: 0.76, valign: 'middle' });
    });
    return q;
  };
  steps('How it works · Each step · 1 of 3', 'Prospect & Account Scoring, step by step', [
    [1, 'Prospect list upload', 'Your prospect list in our template (Excel or CSV): people, company, site, consent, opt-out, owner.',
      ['Checks every required column', 'Fixes or flags bad rows: duplicates, missing fields', 'Holds back opt-outs and unknown consent', 'Groups people into accounts by domain'], 'Accounts and contacts loaded, with each issue and its fix.'],
    [2, 'Account fit scoring', 'Your ICP rubric: vertical, size, site profile, relationship, account type, contact coverage.',
      ['Scores each account out of 100 on the rubric', 'Applies the fit floor', 'Marks key accounts managed separately'], 'A fit score for every account, with the reason behind it.'],
    [3, 'Signals & tiering', 'Signal files attached to the list: loaded by your admin; managers and reps add fresh ones.',
      ['Uses every signal file attached to the list', 'Holds a signal type it doesn\u2019t know for one approval', 'Weights each signal by type and age, with fit', 'Ranks people into tiers A, B and C'], 'A ranked prospect list with why now for each person.'],
  ]);
  steps('How it works · Each step · 2 of 3', 'Micro-segments & Next Best Action, step by step', [
    [4, 'Hand-off', 'The tier A and B prospects with a live signal (or the ones you pick).',
      ['Keeps only people who can be contacted', 'Counts the rest as held back, with why'], 'Prospects handed to NBA, and who was held back.'],
    [5, 'Micro-segmentation', 'Your segments, set up in advance by your Admin, and the signals that feed each.',
      ['Groups accounts that share a reason to buy', 'At least 3 accounts; smaller groups wait as candidates', 'Proposes a new segment for the manager to approve'], 'Segments, each with its accounts and reason.'],
    [6, 'Next best action', 'Your action library in Setup.',
      ['Picks the action that fits the signal and person', 'Proposes a new action when none fits, for approval', 'Chooses email, LinkedIn or call within consent'], 'One action per prospect, with why.'],
    [7, 'Draft & checks', 'Your Content library: brand voice, approved claims, plays, banned words.',
      ['Writes the first message from approved content', 'Checks brand, claims, length, pricing, consent', 'Regenerates once if a check fails'], 'A ready draft, or the check that stopped it.'],
  ]);
  steps('How it works · Each step · 3 of 3', 'Review & approvals, release and Analytics, step by step', [
    [8, 'Review & approvals', 'Reps decide their own queue; the sales manager decides Approvals.',
      ['Queue: what a check could not clear goes to the rep', 'Approvals: sensitive messages, new segments, actions, signal types', 'One approval releases all items waiting on it', 'Weekly spot-check of about 20%'],
      'Accept, edit, choose an alternative or reject, with a reason.', true],
    [9, 'Release to reps', 'Nothing: items that pass every check go ahead on their own.',
      ["Puts ready actions on each rep's Today list", 'Reps send from their own email or LinkedIn', 'Nothing is sent automatically'], "Each rep's actions for today, ready to use."],
    [10, 'Analytics', 'The baseline and thresholds you agree (e.g. 38 minutes per action today).',
      ['G1: review minutes per action a person handled', 'G2: share accepted on the first look', 'AI proposals approved, next to G2', 'A team panel per rep on the manager\u2019s Today'], 'Whether the pilot meets G1 and G2, and why.'],
  ]);

  /* 9 What the platform receives */
  s = content('Account scoring · Inputs', 'What the platform receives: prospect lists and their signals', 'How it works');
  T(s, 'In production, signals flow in from your systems. In the pilot, our admin loads the signal files you send and attaches them to each list; picking a list in Account Scoring uses its signals automatically.', { x: X0, y: 1.28, w: CW, h: 0.55, fontSize: 13.5, color: SLATE });
  const tmpl = [['file', 'Prospect template', 'One row per person. Uploaded in Prospecting.',
      [['Person', 'first_name, last_name, job_title, seniority'], ['Contact', 'email, email_verified, linkedin_url'], ['Company', 'company_name, company_domain, country, industry, revenue, employees'],
       ['Site', 'site_name, process type, capacity'], ['Relationship', 'existing_customer, account_type, managed_separately'], ['Consent', 'consent_basis, opt_out'], ['Owner', 'owner_email (the rep)']]],
    ['bolt', 'Signal template', 'One row per signal. Attached to a prospect list.',
      [['Who', 'company_name, company_domain, contact_email_or_linkedin'], ['What', 'signal_type (one of the types below, or one you add in Setup)'], ['When', 'event_date'], ['Detail', 'detail, source, product']]]];
  tmpl.forEach(([ic, h, sub, rows], i) => {
    const x = X0 + i * 6.15;
    box(s, x, 1.9, 5.9, 3.6, i ? INK : MIST);
    s.addImage({ data: i ? I.boltA : I.file, x: x + 0.25, y: 2.08, w: 0.4, h: 0.4 });
    T(s, h, { x: x + 0.8, y: 2.05, w: 4.9, h: 0.45, fontSize: 19, bold: true, color: i ? WHITE : INK, valign: 'middle' });
    T(s, sub, { x: x + 0.25, y: 2.55, w: 5.4, h: 0.3, fontSize: 12.5, italic: true, color: i ? LINE : SLATE });
    rows.forEach(([k, v], j) => T(s, [{ text: k + '  ', options: { bold: true, color: i ? AMBER : RUST } }, { text: v }], { x: x + 0.25, y: 2.95 + j * 0.36, w: 5.45, h: 0.34, fontSize: 12.5, color: i ? WHITE : INK, valign: 'middle' }));
  });
  T(s, [{ text: 'Built in: ', options: { bold: true, color: AMBER } }, { text: 'Inquiry or RFQ · End of support · Service renewal · Capital project · Leadership change · Webinar · Content download · Email clicked', options: { breakLine: true } },
    { text: 'Yours to add: ', options: { bold: true, color: AMBER } }, { text: 'e.g. Team expanding · New plant announced · Commented on LinkedIn. A type the system doesn\u2019t know is held for one approval.' }],
    { x: X0 + 6.4, y: 4.4, w: 5.45, h: 1.05, fontSize: 11, color: LINE });
  T(s, 'HOW THE PLATFORM USES THE FILES', { x: X0, y: 5.68, w: 6, h: 0.3, fontSize: 12, bold: true, color: RUST, charSpacing: 1.5 });
  [['Check', 'Columns, values, duplicates, consent'], ['Match', 'Signal to account by domain, to person by email'], ['Score', 'Fit × signal weight × freshness'], ['Tier', 'A, B or C per person, with why now']].forEach(([h, d], i) => {
    const x = X0 + i * 3.06;
    s.addShape(i ? pres.shapes.CHEVRON : pres.shapes.PENTAGON, { x, y: 6.02, w: 2.98, h: 0.82, fill: { color: PALE }, line: { color: PALE, width: 0 } });
    disc(s, x + (i ? 0.35 : 0.15), 6.22, 0.42, AMBER, String(i + 1), INK, 12);
    T(s, [{ text: h, options: { bold: true, breakLine: true, fontSize: 13.5 } }, { text: d, options: { fontSize: 11, color: SLATE } }], { x: x + (i ? 0.88 : 0.68), y: 6.02, w: 1.8, h: 0.82, valign: 'middle' });
  });
  s.addNotes('Pilot: our admin loads the signal files the Client sends and attaches each to its list; the sales manager can add fresh signals to any list, a rep to the lists they uploaded. Each attachment is a new signal version; the list rescores with all of them. Connectors to CRM, web forms or news feeds are a later phase. An unknown signal type is held, classified by the AI, and approved once by the sales manager.');

  /* 10b Beyond the six: behaviour signals become new segments */
  s = content('Account scoring · New signals', 'New signals become new segments, each with its own action', 'How it works');
  T(s, 'For net-new accounts, the strongest signals are often behaviour, not engagement with your content. Each kind of signal forms its own segment, with an action that fits it.', { x: X0, y: 1.28, w: CW, h: 0.5, fontSize: 13.5, color: SLATE });
  [['SIGNAL YOU ADD', 1.0], ['NEW SEGMENT', 4.55], ['NEW ACTION', 7.75], ['EXAMPLE ACCOUNT', 11.0]].forEach(([t, x]) => T(s, t, { x: X0 + x - 1.0, y: 1.9, w: 3.2, h: 0.25, fontSize: 10.5, bold: true, color: RUST, charSpacing: 1 }));
  const newSegs = [['Team expanding', 'Hiring control or automation engineers', 'Expanding teams', 'Offer a technical onboarding session for the new engineers', 'Highgate Refining: hiring four instrumentation engineers'],
    ['New plant announced', 'A new plant, unit or major expansion', 'New plants', 'Propose a front-end design session for the new plant', 'Meridian Refining: a new hydrotreater unit'],
    ['Commented on LinkedIn', 'Joined a public discussion about ageing control systems', 'Talking about ageing systems', 'Share a short point of view on that topic, with a peer example', 'Oakhurst Refining: commented on a post about ageing DCS']];
  newSegs.forEach(([sig, what, seg, act, ex], i) => {
    const y = 2.25 + i * 1.02;
    box(s, X0, y, 3.2, 0.86, MIST);
    T(s, [{ text: sig, options: { bold: true, breakLine: true, fontSize: 14 } }, { text: what, options: { fontSize: 11.5, color: SLATE } }], { x: X0 + 0.18, y, w: 2.9, h: 0.86, valign: 'middle' });
    s.addImage({ data: I.arrow, x: X0 + 3.27, y: y + 0.31, w: 0.24, h: 0.24 });
    box(s, X0 + 3.58, y, 2.6, 0.86, INK);
    T(s, seg, { x: X0 + 3.76, y, w: 2.3, h: 0.86, fontSize: 14, bold: true, color: WHITE, valign: 'middle' });
    s.addImage({ data: I.arrow, x: X0 + 6.25, y: y + 0.31, w: 0.24, h: 0.24 });
    box(s, X0 + 6.56, y, 3.1, 0.86, PALE);
    T(s, act, { x: X0 + 6.74, y, w: 2.8, h: 0.86, fontSize: 12.5, valign: 'middle' });
    T(s, ex, { x: X0 + 9.85, y, w: 2.28, h: 0.86, fontSize: 11.5, italic: true, color: SLATE, valign: 'middle' });
  });
  const path = (y, label, sub, steps, dark) => {
    T(s, [{ text: label, options: { bold: true, color: RUST, charSpacing: 1, breakLine: true } }, { text: sub, options: { fontSize: 11, color: SLATE } }], { x: X0, y, w: 2.55, h: 0.62, fontSize: 11.5, valign: 'middle' });
    steps.forEach((t, i) => {
      const x = X0 + 2.65 + i * 3.18, fill = i === 2 ? (dark ? TEAL : INK) : PALE;
      s.addShape(i ? pres.shapes.CHEVRON : pres.shapes.PENTAGON, { x, y, w: 3.1, h: 0.62, fill: { color: fill }, line: { color: fill, width: 0 } });
      T(s, t, { x: x + (i ? 0.38 : 0.18), y, w: 2.55, h: 0.62, fontSize: 12.5, bold: true, color: i === 2 ? WHITE : INK, valign: 'middle' });
    });
  };
  path(5.5, 'SET UP IN ADVANCE', 'Admin, before the pilot', ['Add the segment in Setup', 'Map its signals, add its actions', 'Used straight away: no approval'], false);
  path(6.25, 'SPOTTED BY THE AI', 'Only what nobody set up', ['AI proposes a segment and action', 'Sales manager approves once', 'Joins Setup for every later list'], true);
  s.addNotes('These three come from the cold-outbound demo set. The Admin can set segments up before the pilot: add the segment in Setup, map the signal types that feed it and add its actions, and it is used straight away with no approval. The sales manager approves only what nobody set up: a segment or action the AI proposes (switched on for the pilot once you agree), once, after which it is reused. A segment needs at least 3 accounts; smaller groups wait as candidates across lists. A message for a new segment cites an approved claim about its topic; with no such claim the action goes to the owner as a task.');

  /* 14 Divider 02 */
  divider('02', 'Setting it up together', 'A few questions today. The rest in a short questionnaire, shared ahead.', 'Setting it up');

  /* 14b Questions for today */
  s = content('Setting it up · Questions for today', 'Six questions for today', 'Setting it up');
  const today = [['Who to target', [['Which accounts and roles are your best customers, and which do you never pursue?', 'Sets the ideal-customer score'], ['Which buying signals matter most, and where do they come from?', 'Sets the signals and their weights']]],
    ['Why now, and what to do', [['How do reps decide what to do next today, and which channels can they use?', 'Sets the actions and channels'], ['Who approves a new segment or a sensitive message?', 'Sets who reviews what']]],
    ['What to say', [['Do you have brand guidelines and approved claims or case studies?', 'Sets the content library'], ['How long does a first touch take today, and what response do you get?', 'Sets the baseline for G1 and G2']]]];
  today.forEach(([h, qs], i) => {
    const x = X0 + i * 4.08;
    box(s, x, 1.6, 3.9, 0.7, INK);
    T(s, h, { x: x + 0.25, y: 1.6, w: 3.5, h: 0.7, fontSize: 18, bold: true, color: AMBER, valign: 'middle' });
    qs.forEach(([q, why], j) => {
      const y = 2.45 + j * 1.85;
      box(s, x, y, 3.9, 1.7, MIST);
      disc(s, x + 0.2, y + 0.2, 0.42, AMBER, String(i * 2 + j + 1), INK, 13);
      T(s, q, { x: x + 0.8, y: y + 0.12, w: 2.95, h: 1.05, fontSize: 14.5, bold: true, valign: 'middle' });
      T(s, why, { x: x + 0.8, y: y + 1.17, w: 2.95, h: 0.4, fontSize: 12, italic: true, color: TEAL });
    });
  });
  box(s, X0, 6.25, CW, 0.6, PALE);
  T(s, [{ text: 'Everything else is in the setup questionnaire ', options: { bold: true } }, { text: 'we share before the workshop: answer what you can, and we fill the gaps together.' }], { x: X0 + 0.3, y: 6.25, w: CW - 0.6, h: 0.6, fontSize: 14, valign: 'middle' });
  s.addNotes('Ask only these six live, two per question the platform answers. The full list sits in the setup questionnaire (Excel), shared ahead so the team can answer at their own pace.');

  /* 15 What we need: data and content */
  s = content('Setting it up · What we need · 1 of 2', 'What we need: data and content', 'Setting it up');
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
  s = content('Setting it up · What we need · 2 of 2', 'What we need: access and ways of working', 'Setting it up');
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
  const gcard = (i, g, h, q, formula, example, pass) => {
    const x = X0 + i * 6.15, dark = i === 0, fg = dark ? WHITE : INK, ac = dark ? AMBER : RUST;
    box(s, x, 1.45, 5.9, 4.6, dark ? INK : PALE);
    T(s, g, { x: x + 0.3, y: 1.55, w: 1.4, h: 0.9, fontSize: 48, bold: true, color: AMBER, valign: 'middle' });
    T(s, [{ text: h, options: { bold: true, fontSize: 21, breakLine: true } }, { text: q, options: { fontSize: 12.5, italic: true } }], { x: x + 1.7, y: 1.55, w: 4.0, h: 0.9, color: fg, valign: 'middle' });
    T(s, 'THE FORMULA', { x: x + 0.3, y: 2.6, w: 3, h: 0.25, fontSize: 10.5, bold: true, color: ac, charSpacing: 1 });
    box(s, x + 0.3, 2.88, 5.3, 1.05, dark ? SLATE : WHITE);
    T(s, formula, { x: x + 0.45, y: 2.88, w: 5.0, h: 1.05, fontSize: 13, color: fg, valign: 'middle' });
    T(s, 'WORKED EXAMPLE', { x: x + 0.3, y: 4.05, w: 3, h: 0.25, fontSize: 10.5, bold: true, color: ac, charSpacing: 1 });
    T(s, example, { x: x + 0.3, y: 4.32, w: 5.3, h: 1.05, fontSize: 12.5, color: fg });
    T(s, [{ text: 'Passes when  ', options: { bold: true, color: ac } }, { text: pass, options: { bold: true } }], { x: x + 0.3, y: 5.45, w: 5.3, h: 0.45, fontSize: 15, color: fg, valign: 'middle' });
  };
  gcard(0, 'G1', 'Human review effort', 'Does it save people time?',
    [{ text: 'Minutes per action = ', options: { bold: true } }, { text: 'minutes people spent deciding, in For Review and Approvals ÷ first actions a person handled', options: { breakLine: true } },
     { text: 'Effort saved = ', options: { bold: true } }, { text: '1 − (minutes per action ÷ baseline)' }],
    'People handled 12 first actions and spent 90 minutes deciding, approvals included. 90 ÷ 12 = 7.5 minutes per action. Today it takes 38 minutes, so 1 − 7.5 ÷ 38 = 80% less effort.',
    'effort is at least 50% lower than the baseline');
  gcard(1, 'G2', 'Acceptance rate', 'Do people trust what it recommends?',
    [{ text: 'Acceptance = ', options: { bold: true } }, { text: 'recommendations accepted on the first look ÷ recommendations decided', options: { breakLine: true } },
     { text: 'Counted from: ', options: { bold: true } }, { text: 'the exception queue, the weekly spot-check and the manager\u2019s approve or reject in Approvals, weighted by path' }],
    'Spot-check: 8 of 10 accepted (80%), on the 60% of items that went ahead. Queue: 5 of 10 accepted (50%), on the other 40%. 80% × 0.6 + 50% × 0.4 = 68%.',
    'at least 70% are accepted (68% falls just short)');
  box(s, X0, 6.2, CW, 0.7, MIST);
  T(s, [{ text: 'Too early to call: ', options: { bold: true } }, { text: 'neither is judged until 10 decisions are counted. “AI proposals approved” (new segments, actions, signal types) sits next to G2, not inside it. Baseline (38 min), thresholds and the 10 are agreed with you at baselining.' }],
    { x: X0 + 0.25, y: 6.2, w: CW - 0.5, h: 0.7, fontSize: 12.5, valign: 'middle' });
  s.addNotes('G1: the minutes come from how long each decision took, in For Review and in Approvals, logged automatically, divided by the first actions a person handled. Actions that went ahead on their own take no review minutes, which is where the saving comes from. G2: first-look decisions count, including the sales manager approving or rejecting in Approvals; items an approval released reach G2 through the weekly spot-check. Choosing an alternative after a rejection is tracked separately.');

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
    ['AI proposals approved*', 'How often does the manager agree with what the AI proposes to add?', 'New segments, actions and signal types approved ÷ decided', '7 in 10 approved as proposed or after an edit']],
  '* can be measured during the pilot phase. Reply rates and pipeline sourced need outcomes from your CRM; revenue attribution needs a longer window. Open to discussion.');

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
    ['Pilot execution', RUST, [['Pilot run & measurement (4 to 5 weeks)', 11, 4], ['User support', 11, 4]]],
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
  T(s, NAME.toUpperCase() + ' PILOT  ·  DISCOVERY WORKSHOP', { x: X0, y: 2.4, w: 8, h: 0.4, fontSize: 13, bold: true, color: AMBER, charSpacing: 2 });
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
    { x: X0, y: 1.6, w: CW, colW: [2.8, 6.2, 3.13], rowH: ags.length > 5 ? 0.72 : 0.82, border: { type: 'solid', pt: 0.5, color: HEX.line }, valign: 'middle', margin: 0.12, color: INK });
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

  const OUTFILE = NAME.replace(/\s+/g, '_') + '_Pilot_Proposal.pptx';
  await pres.writeFile({ fileName: OUTFILE });
  await applyTheme(OUTFILE, THEME);
  console.log('written');
})().catch(e => { console.error(e); process.exit(1); });
