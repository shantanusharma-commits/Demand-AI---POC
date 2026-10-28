// The legacy engine's own tests (legacy/engine.test.js), ported to the TypeScript engine as each part is ported
// (G-053). Where the legacy test drove browser storage, the TypeScript engine takes the same settings as arguments;
// storing them (who switched what, when and why) is the server's job (Setup, Phase 5a).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../lib/demandai-engine.ts';
import * as S from '../lib/demandai-sample-data.ts';
import * as N from '../lib/engine/nba.ts';

const leads = () => E.processLeads(S.LEADS, { file: 'l', sheet: 's' });
const list = (L = leads()) => ({ accounts: L.accounts, contacts: JSON.parse(JSON.stringify(L.contacts)) });

// legacy engine.test.js:425
test('a signal switched off in Setup is not scored in new runs (OFF code)', () => {
  const sig = E.processSignals(S.SIGNALS, list(), { asOf: S.SAMPLE_AS_OF, off: ['Leadership change'] });
  const off = sig.signals.filter(s => s.code === 'OFF');
  assert.ok(off.length > 0 && off.every(s => s.type === 'Leadership change' && s.status === 'Rejected'));
  assert.ok(sig.issues.some(i => i.code === 'OFF'));
  assert.equal(E.CODES.OFF, 'Switched off in Setup');
  const on = E.processSignals(S.SIGNALS, list(), { asOf: S.SAMPLE_AS_OF });
  assert.equal(on.signals.filter(s => s.code === 'OFF').length, 0, 'switched back on: scored again');
});

// legacy engine.test.js:443
test('a signal type added in Setup is scored in runs that include it, and only those', () => {
  const grid = S.SIGNALS.concat([['Northwind Refining', 'aditi.rao@northwindrefining.com', 'Trade show visit', '2026-09-20', 'Visited the stand', 'Events team', '']]);
  const added: E.CustomSignalType = { name: 'Trade show visit', segment: 'Engagement', level: 'Light', full: 30, zero: 120 };
  assert.match(E.customSignalProblem({ ...added, segment: 'Nope' }) ?? '', /micro-segment/);
  assert.match(E.customSignalProblem({ ...added, name: 'webinar ATTENDED' }) ?? '', /already a signal type/);
  assert.match(E.customSignalProblem({ ...added, full: 30, zero: 10 }) ?? '', /longer/);
  assert.equal(E.customSignalProblem(added), null);
  const old = E.processSignals(grid, list(), { asOf: S.SAMPLE_AS_OF });
  assert.equal(old.signals.find(s => s.type === 'Trade show visit')!.code, 'D3');
  const now = E.processSignals(grid, list(), { asOf: S.SAMPLE_AS_OF, custom: [added] });
  const t = now.signals.find(s => s.type === 'Trade show visit')!;
  assert.equal(t.status, 'Qualified');
  assert.equal(t.segment, 'Engagement');
  assert.equal(t.tier, 30);
  assert.equal(E.CONFIG.signalTypes['Trade show visit'], undefined, 'the shared configuration is never changed');
});

/* ─── Stage 9: micro-segments, drafts and checks (lib/engine/nba.ts) ─── */
const run = () => {
  const L = leads(), lst = list(L);
  const sig = E.processSignals(S.SIGNALS, lst, { file: S.LEAD_FILE, sheet: 'Signal template', asOf: S.SAMPLE_AS_OF });
  return E.scoreList(lst, sig) as unknown as N.NbaResult[];
};
const sampleRecs = (opts?: Parameters<typeof N.buildSegments>[1]) => N.buildSegments(run(), opts);

// A small synthetic set so each rule can be checked on its own.
function fake(id: string, sigs: [string, number][], opts: { email?: string; linkedin?: string } = {}): N.NbaResult {
  const contact: N.NbaContact = { row: 2, name: `Person ${id}`, firstName: 'Pat', email: opts.email === undefined ? `p@${id}.com` : opts.email,
    emailVerified: opts.email !== '', linkedin: opts.linkedin || '' };
  const signals = sigs.map(([type, weight]) => ({ type, weight, detail: '' }));
  return { account: { id, name: `Account ${id}` }, signalCount: signals.length, confidence: 'high', people: [{ contact, signals, final: 50 }] };
}

// legacy engine.test.js:152
test('micro-segments: three distinct accounts on the strongest signal form a segment', () => {
  const r = N.buildSegments([fake('a', [['Inquiry or RFQ', 100]]), fake('b', [['Inquiry or RFQ', 90]]), fake('c', [['Inquiry or RFQ', 80]])]);
  assert.deepEqual(r.segments.map(s => [s.name, s.accountIds.length]), [['Inquiry', 3]]);
  assert.equal(r.exceptions.length, 0);
  assert.ok(r.recs.every(x => !x.fallback));
});

// legacy engine.test.js:159
test('micro-segments: a segment never forms on second-best signals; those accounts go to a person', () => {
  const r = N.buildSegments([
    fake('a', [['Inquiry or RFQ', 100], ['Webinar attended', 40]]),
    fake('b', [['Webinar attended', 60]]),
    fake('c', [['Content download', 50]]),
  ]);
  assert.deepEqual(r.segments, []);
  const a = r.recs.find(x => x.account.id === 'a')!;
  assert.equal(a.segment, null);
  assert.equal(a.action, E.CONFIG.segmentLibrary.Inquiry[0]);
  assert.match(a.exception, /No micro-segment/);
});

// A small list (27 Oct 2026): two accounts per signal form nothing. A person may put them in a micro-segment of their
// own in For Review, but the system never forms one below the minimum.
test('micro-segments: two accounts on each of two signals form no micro-segment; all four go to a person', () => {
  const r = N.buildSegments([fake('a', [['Inquiry or RFQ', 100]]), fake('b', [['Inquiry or RFQ', 90]]),
    fake('c', [['Capital project', 70]]), fake('d', [['Capital project', 65]])]);
  assert.equal(E.CONFIG.minSegmentAccounts, 3);
  assert.deepEqual(r.segments, []);
  assert.deepEqual(r.recs.map(x => [x.account.id, x.segment, x.prominent]), [['a', null, 'Inquiry'], ['b', null, 'Inquiry'], ['c', null, 'Project'], ['d', null, 'Project']]);
  assert.ok(r.recs.every(x => /No micro-segment/.test(x.exception || '')));
});

// legacy engine.test.js:174
test('micro-segments: an account falls back to its next signal to join a segment formed on strongest signals', () => {
  const r = N.buildSegments([
    fake('a', [['Inquiry or RFQ', 100], ['Webinar attended', 40]]),
    fake('b', [['Webinar attended', 60]]),
    fake('c', [['Content download', 50]]),
    fake('d', [['Webinar attended', 55]]),
  ]);
  assert.deepEqual(r.segments.map(s => [s.name, s.accountIds.sort()]), [['Engagement', ['a', 'b', 'c', 'd']]]);
  const a = r.recs.find(x => x.account.id === 'a')!;
  assert.equal(a.fallback, true);
  assert.equal(a.runnerUp!.action, E.CONFIG.segmentLibrary.Inquiry[0]);
  assert.ok(a.runnerUp!.fromStrongest);
});

// legacy engine.test.js:188
test('micro-segments: no account is in two segments, and leftovers are exceptions', () => {
  const r = N.buildSegments([
    fake('a', [['Inquiry or RFQ', 100], ['Capital project', 70]]),
    fake('b', [['Inquiry or RFQ', 95], ['Capital project', 70]]),
    fake('c', [['Inquiry or RFQ', 90]]),
    fake('d', [['Capital project', 80]]),
    fake('e', [['Leadership change', 30]]),
  ]);
  const ids = r.segments.flatMap(s => s.accountIds);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(r.segments.map(s => s.name), ['Inquiry']);
  assert.deepEqual(r.exceptions.map(x => x.account.id), ['d', 'e']);
  assert.match(r.exceptions[0].exception, /No micro-segment/);
});

// legacy engine.test.js:203
test('micro-segments on the sample: every scored account placed once, all prospects get an action', () => {
  const r = sampleRecs();
  const ids = r.segments.flatMap(s => s.accountIds);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length + new Set(r.exceptions.map(x => x.account.id)).size, r.accountsConsidered);
  assert.ok(r.segments.every(s => s.accountIds.length >= 3));
  assert.ok(r.recs.every(x => x.action && x.signal));
});

// legacy engine.test.js:214
test('drafts follow the outreach rules: short subject, short body, interest question, LinkedIn note under 200', () => {
  const r = sampleRecs();
  for (const rec of r.recs) for (const action of [rec.action, rec.runnerUp && rec.runnerUp.action].filter(Boolean) as string[]) {
    const d = N.draftFor(rec, action);
    if (d.channel === 'Email') {
      assert.ok(d.subject!.split(/\s+/).length <= 4, d.subject);
      assert.ok(d.words! <= 90, `${d.words} words`);
      assert.match(d.body!, /\?\n/);
      assert.match(d.body!, /Client Team$/); // the client appears only as "Client"
    }
    if (d.channel === 'LinkedIn') {
      assert.ok(d.note!.length <= 200);
      assert.doesNotMatch(d.note!, /\?$/);
    }
  }
  // Farah Aziz has no verified email but a LinkedIn URL
  const meridian = r.recs.find(x => x.account.name === 'Meridian Petrochem')!;
  const farah = meridian.result.people!.find(p => p.contact.name === 'Farah Aziz')!.contact;
  assert.equal(N.recommendChannel({ ...meridian, contact: farah }, meridian.action).channel, 'LinkedIn');
});

// legacy engine.test.js:236, plus G-007: an unconfirmed opt-out closes both channels, like a missing consent basis.
test('channel rules: email or LinkedIn only, hard limits on both, consent and a confirmed opt-out required, otherwise held', () => {
  const rec = { contact: { name: 'Pat Lee', email: 'p@x.com', emailVerified: true, linkedin: 'https://linkedin.com/in/p', consentOk: true } };
  assert.equal(N.recommendChannel(rec, 'Call to follow up on the inquiry').channel, 'Email');
  assert.equal(N.recommendChannel(rec, 'Offer a renewal review').channel, 'Email');
  assert.equal(N.recommendChannel({ contact: { ...rec.contact, emailVerified: false } }, 'Offer a site assessment').channel, 'LinkedIn');
  const noConsent = N.recommendChannel({ contact: { ...rec.contact, consentOk: false } }, 'Offer a site assessment');
  assert.deepEqual([noConsent.channel, noConsent.unreachable], ['Email', true]);
  assert.equal(N.recommendChannel({ contact: { name: 'Pat Lee' } }, 'Offer a site assessment').unreachable, true);
  for (const flag of ['optOut', 'optOutUnknown'] as const) {
    assert.deepEqual(N.allowedChannels({ ...rec.contact, [flag]: true }), [], flag);
    const held = N.recommendChannel({ contact: { ...rec.contact, [flag]: true } }, 'Offer a site assessment');
    assert.deepEqual([held.unreachable, held.why], [true, 'Opt-out not confirmed: a person must confirm before anything is sent.'], flag);
  }
});

// G-007 on the sample: every recommendation the engine would send goes to someone canContact allows.
test('no recommendation is sendable to someone who cannot be contacted (G-007)', () => {
  const r = sampleRecs();
  const sendable = r.recs.filter(x => !N.draftFor(x, x.action, { asOf: S.SAMPLE_AS_OF }).unreachable);
  assert.ok(sendable.length > 0);
  assert.deepEqual(sendable.filter(x => !E.canContact(x.contact as unknown as Parameters<typeof E.canContact>[0])).map(x => x.contact.name), []);
});

// legacy engine.test.js:251
// Since 28 Oct 2026 the approved claim goes in word for word without its citation ("[Webinar recording, 2026]").
test('drafts carry one approved proof point, word for word with no citation, and pass the brand and claim checks', () => {
  const r = sampleRecs();
  const rec = r.recs.find(x => x.contact.name === 'Aditi Rao')!;
  const d = N.draftFor(rec, E.CONFIG.segmentLibrary.Engagement[0], { asOf: S.SAMPLE_AS_OF });
  assert.equal(d.channel, 'Email');
  assert.ok(d.body!.includes(N.COLLATERAL.find(c => c.id === 'WB-05')!.claim));
  assert.doesNotMatch(d.body!, /\[[^\]]+, \d{4}\]/);
  const chk = N.checkDraft(d);
  assert.deepEqual([chk.flags.length, chk.claims.length, chk.unsupported.length], [0, 1, 0]);
  assert.match(N.confidenceFor(rec, d, chk).reason, /1 of 1 claim verified, no open flags/);
});

// 5d: a signal's detail keeps its capitals when it opens a message (it read "rFQ for …"), and "I" stays "I".
test('an opener keeps an acronym and "I" capitalised, in an email and in a LinkedIn note', () => {
  const base = sampleRecs().recs[0], action = E.CONFIG.segmentLibrary.Inquiry[0];
  const withDetail = (detail: string, contact: Partial<N.NbaContact> = { email: 'pat@x.example', emailVerified: true, consentOk: true }): N.Rec => {
    const sg = { ...base.signal, type: 'Inquiry or RFQ', detail };
    return { ...base, signal: sg, contact: { ...base.contact, ...contact }, person: { ...base.person, signals: [sg] } };
  };
  const email = N.draftFor(withDetail('RFQ for three DCS cabinets'), action, { asOf: S.SAMPLE_AS_OF });
  assert.equal(email.channel, 'Email');
  assert.match(email.body!, /Thanks for your question: RFQ for three DCS cabinets\./);
  const asked = N.draftFor(withDetail('Asked about the DCS upgrade'), action, { asOf: S.SAMPLE_AS_OF });
  assert.match(asked.body!, /Thanks for your question about the DCS upgrade\./, 'an ordinary word is still lowered');
  const li = N.draftFor(withDetail('RFQ for three DCS cabinets', { emailVerified: false, linkedin: 'https://linkedin.com/in/x', consentOk: true }), action, { asOf: S.SAMPLE_AS_OF });
  assert.match(li.note!, /^Hi \w+, thanks for your question: RFQ for three DCS cabinets\./);
  assert.doesNotMatch(E.processSignals.toString(), /suggested new contact/, 'the D4 reason promises no list that nothing shows');
});

// legacy engine.test.js:262, changed per D-10 (G-051): the legacy draft went out without a proof line; now the
// action becomes a task for the account owner, naming the proof point that lapsed.
test('no approved proof for the case: the action becomes a task for the owner, not a draft (D-10)', () => {
  const r = sampleRecs();
  const rec = r.recs[0];
  // Leadership's only item expired on 2026-06-30
  const d = N.draftFor(rec, 'Share a peer case study from their sector', { asOf: S.SAMPLE_AS_OF });
  assert.equal(d.channel, 'Task');
  assert.ok(d.noProof);
  assert.equal(d.body, undefined);
  assert.equal(d.note, undefined);
  assert.match(d.task!, /no approved, unexpired proof point for Leadership \(PS-06 expired 2026-06-30\)/);
  assert.doesNotMatch(N.draftText(d), /\[[^\]]+, \d{4}\]/);
});

// legacy engine.test.js:272
test('LinkedIn is one connection note, no follow-up message', () => {
  const r = sampleRecs();
  const rec = r.recs[0];
  const d = N.draftFor({ ...rec, contact: { ...rec.contact, emailVerified: false, linkedin: 'https://linkedin.com/in/x', consentOk: true } }, rec.action, { asOf: S.SAMPLE_AS_OF });
  assert.equal(d.channel, 'LinkedIn');
  assert.ok(d.note!.length <= 200);
  assert.equal((d as { message?: string }).message, undefined);
});

// legacy engine.test.js:281
test('brand checks and claim verification catch an edited draft', () => {
  const r = sampleRecs();
  const rec = r.recs.find(x => x.contact.name === 'Aditi Rao')!;
  const d = N.draftFor(rec, E.CONFIG.segmentLibrary.Engagement[0], { asOf: S.SAMPLE_AS_OF });
  const edited = { ...d, body: d.body!.replace('Worth a short conversation?', 'We guarantee 30% less downtime at a discount. Worth a short conversation?') };
  const chk = N.checkDraft(edited);
  assert.ok(chk.flags.some(f => f.rule === 'Banned claim'));
  assert.ok(chk.flags.some(f => f.rule === 'Pricing or commercial terms'));
  assert.equal(chk.unsupported.length, 1);
  assert.equal(N.confidenceFor(rec, edited, chk).level, 'Low');
});

// legacy engine.test.js:400. The legacy test published the pack into browser storage; here the pack is an argument,
// and drafting, publishing and versions (a list keeps the version it was drafted with) are the Content library's job
// (Phase 5a). What stays: a changed pack changes the drafts and the checks, and the starting pack is untouched.
test('a published brand pack changes the drafts and the checks', () => {
  const v2 = N.defaultBrand();
  v2.v = 2;
  v2.voice.preset = 'Formal'; v2.voice.signoff = 'Client Sales';
  v2.negative.push('synergy'); v2.competitors.push('Rivalco');
  v2.claims = v2.claims.filter(c => c.id !== 'WB-05');
  const r = sampleRecs(), rec = r.recs.find(x => x.contact.name === 'Aditi Rao')!;
  const draft = N.draftFor(rec, rec.action, { asOf: S.SAMPLE_AS_OF, brand: v2 });
  assert.match(draft.body!, /^Dear Aditi,/);
  assert.match(draft.body!, /Kind regards,\nClient Sales$/);
  assert.ok(!draft.body!.includes(N.COLLATERAL.find(c => c.id === 'WB-05')!.claim));   // the withdrawn claim is no longer used
  const flags = N.checkDraft({ ...draft, body: draft.body!.replace('Kind regards', 'Great synergy with Rivalco! Kind regards') }, v2).flags.map(f => f.rule);
  assert.ok(flags.includes('Banned claim') && flags.includes('Competitor name') && flags.includes('Tone of voice'));
  assert.equal(N.checkDraft({ channel: 'Email', subject: 'hello', body: 'Compared with Rivalco. Worth a chat?' }).flags.length, 0, 'the starting pack has no competitors');
  // A list built with v1 keeps drafting with v1.
  assert.match(N.draftFor(rec, rec.action, { asOf: S.SAMPLE_AS_OF, brand: N.defaultBrand() }).body!, /^Hi Aditi,/);
  assert.equal(N.defaultBrand().competitors.length, 0);
});

// legacy engine.test.js:293
test('engage-once: an account already recommended in the pilot is set aside as a process rule', () => {
  const r = sampleRecs({ engaged: new Map([['northwind refining', 'Earlier list']]) });
  assert.ok(!r.recs.some(x => x.account.name === 'Northwind Refining'));
  assert.deepEqual(r.engagedOnce.map(x => [x.account.name, x.label]), [['Northwind Refining', 'Earlier list']]);
});

// legacy engine.test.js:299
test('micro-segments from an uploaded file: prospects with their signals, score optional', () => {
  const g = [N.SEGMENT_COLUMNS,
    ['Aditi', 'Rao', 'Head of Instrumentation', 'aditi@nw.com', 'Y', '', 'Northwind Refining', 'Refining', 'Singapore', 'N', 'Legitimate interest', '72', 'Inquiry or RFQ', '2026-09-20', 'Asked about migration', ''],
    ['Wei', 'Lim', 'Plant Manager', 'wei@nw.com', 'Y', '', 'Northwind Refining', 'Refining', 'Singapore', 'N', 'Legitimate interest', '', 'Webinar attended', '2026-09-10', 'Modernising legacy control systems', ''],
    ['Wei', 'Lim', 'Plant Manager', 'wei@nw.com', 'Y', '', 'Northwind Refining', 'Refining', 'Singapore', 'N', 'Legitimate interest', '', 'Webinar attended', '2026-09-10', 'Modernising legacy control systems', ''],
    ['Ann', 'Lee', 'Engineer', 'ann@acme.com', 'Y', '', 'Acme', 'Petrochemicals', 'Thailand', 'Y', 'Opted in', '', 'Bogus', '2026-09-10', '', ''],
  ];
  const r = N.processScoredProspects(g, { asOf: '2026-09-30' });
  assert.deepEqual(r.stats, { rowsRead: 4, rejected: 2, prospects: 2, accounts: 1 });
  const nw = r.results[0];
  assert.deepEqual(nw.people!.map(p => [p.contact.name, p.final, p.scoreFrom]), [['Aditi Rao', 72, 'file'], ['Wei Lim', 30, 'signals']]);
  // One recommendation per account, to the person with the strongest signals
  assert.deepEqual(N.buildSegments(r.results).recs.map(x => x.contact.name), ['Aditi Rao']);
});

// legacy engine.test.js:314
test('one recommendation per account, to the contact with the strongest signals', () => {
  const r = sampleRecs();
  const ids = r.recs.map(x => x.account.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(r.recs.find(x => x.account.name === 'Northwind Refining')!.contact.name, 'Aditi Rao');
  assert.equal(r.recs.find(x => x.account.name === 'Meridian Petrochem')!.contact.name, 'Hassan Idris');
});

// legacy engine.test.js:322
test('content touching an incident, security or regulation is flagged as sensitive', () => {
  for (const t of ['after the incident at the plant', 'our cybersecurity review', 'the new emissions regulation']) {
    assert.ok(N.checkDraft({ channel: 'Email', subject: 'hello', body: `Hi, about ${t}. Worth a chat?` }).flags.some(f => f.rule === 'Sensitive term'), t);
  }
});

// legacy engine.test.js:328
test('deal size: estimated from vertical, size and account type; below the threshold is flagged', () => {
  const r = sampleRecs();
  const nw = r.recs.find(x => x.account.name === 'Northwind Refining')!, mp = r.recs.find(x => x.account.name === 'Meridian Petrochem')!;
  assert.deepEqual([N.estimateDealSize(nw.account)!.value, N.estimateDealSize(nw.account)!.below], [600000, false]);
  assert.deepEqual([N.estimateDealSize(mp.account)!.value, N.estimateDealSize(mp.account)!.below], [210000, true]);
  assert.equal(N.estimateDealSize({ name: 'x' }), null); // nothing to go on: the rule isn't applied
});

// legacy engine.test.js:336. The TypeScript sample's email click reads "Lifecycle services overview"; the legacy sample
// had "Lifecycle services pricing overview", so the rec gets that wording back here.
test('a draft that fails a brand or rule check is regenerated once without the source wording', () => {
  const r = sampleRecs();
  const found = r.recs.find(x => x.account.name === 'Andaman Petroleum')!;
  const priced = (s: N.NbaSignal) => s.type === 'Email clicked' ? { ...s, detail: 'Clicked "Lifecycle services pricing overview"' } : s;
  const ap = { ...found, person: { ...found.person, signals: found.person.signals.map(priced) }, signal: priced(found.signal) };
  const act = E.CONFIG.segmentLibrary.Engagement[0];   // the engagement follow-up quotes the pricing overview they opened
  const first = N.draftFor(ap, act, { asOf: S.SAMPLE_AS_OF });
  assert.ok(N.checkDraft(first).flags.some(f => f.rule === 'Pricing or commercial terms'));
  const again = N.draftFor(ap, act, { asOf: S.SAMPLE_AS_OF, variant: 'clean' });
  assert.equal(N.checkDraft(again).flags.length, 0);
});

/* ─── The NBA test-scenario set: every account does what its scenario says ─── */
function scenarios() {
  const asOf = '2026-10-05';
  const file = N.processScoredProspects(S.nbaScenarioGrid(asOf), { asOf });
  const seg = N.buildSegments(file.results);
  const rec = (n: string) => seg.recs.find(x => x.account.name.startsWith(n))!;
  const draft = (n: string, extra = {}) => { const r = rec(n); return N.draftFor(r, r.action, { asOf, ...extra }); };
  return { asOf, file, seg, rec, draft };
}

// legacy engine.test.js:356
test('scenarios: data errors are caught, one recommendation per account', () => {
  const { file, seg } = scenarios();
  assert.deepEqual(file.stats, { rowsRead: 20, rejected: 5, prospects: 13, accounts: 12 });
  assert.deepEqual(file.issues.filter(i => i.outcome === 'Signal not used').map(i => i.code).sort(), ['D1', 'D2', 'D3', 'D3', 'D5']);
  assert.equal(seg.recs.length, 12);
});

// legacy engine.test.js:363
test('scenarios: three micro-segments, a fallback and two accounts with no micro-segment', () => {
  const { seg, rec } = scenarios();
  const names = (g: { recs?: N.Rec[] }) => g.recs!.map(x => x.account.name.split(' ')[0]).sort();
  assert.deepEqual(Object.fromEntries(seg.segments.map(g => [g.name, names(g)])), {
    Modernisation: ['Aurora', 'Bluewater', 'Cedar'], Inquiry: ['Harbor', 'Ironwood', 'Juniper'], Engagement: ['Delta', 'Eastgate', 'Fernhill', 'Granite'] });
  assert.deepEqual(seg.exceptions.map(x => x.account.name.split(' ')[0]).sort(), ['Kingfisher', 'Lantern']);
  const delta = rec('Delta');
  assert.ok(delta.fallback);
  assert.equal(delta.runnerUp!.action, 'Offer a renewal review');
  assert.equal(rec('Aurora').contact.name, 'Niran Wattana');
});

// legacy engine.test.js:375; Kingfisher's only proof expired, so per D-10 it is a task, not a draft without proof.
test('scenarios: channels, tasks and proof', () => {
  const { draft } = scenarios();
  assert.deepEqual(['Aurora', 'Eastgate', 'Cedar', 'Lantern', 'Harbor', 'Juniper'].map(n => draft(n).channel), ['Email', 'LinkedIn', 'Email', 'Email', 'Email', 'Email']);
  assert.deepEqual(['Cedar', 'Lantern', 'Juniper'].map(n => draft(n).unreachable), [true, true, true]);
  assert.deepEqual([draft('Kingfisher').noProof, draft('Kingfisher').channel], [true, 'Task']);
});

// legacy engine.test.js:382
test('scenarios: each exception rule is triggered by its account, and only there', () => {
  const { rec, draft, seg } = scenarios();
  const sensitive = (n: string) => N.checkDraft(draft(n)).flags.some(f => f.rule === 'Sensitive term');
  const brand = (n: string) => N.checkDraft(draft(n)).flags.filter(f => f.rule !== 'Sensitive term').length > 0;
  assert.deepEqual(seg.recs.filter(r => r.result.confidence === 'low').map(r => r.account.name), ['Cedar Petrochemicals']);
  assert.deepEqual(seg.recs.filter(r => N.estimateDealSize(r.account)?.below).map(r => r.account.name), ['Granite Gas Processing']);
  assert.deepEqual(seg.recs.filter(r => sensitive(r.account.name)).map(r => r.account.name), ['Ironwood Refining']);
  assert.deepEqual(seg.recs.filter(r => brand(r.account.name)).map(r => r.account.name), ['Fernhill Refining']);
  assert.equal(N.checkDraft(draft('Fernhill', { variant: 'clean' })).flags.length, 0); // regenerated once, then passes
  assert.ok(rec('Bluewater').contact.linkedin && rec('Bluewater').contact.emailVerified); // a next channel to fall back to
  assert.equal(rec('Aurora').result.people!.length, 2); // a next contact to fall back to
});

// legacy engine.test.js:395
test('the configuration version says the scoring weights are fixed in the POC', () => {
  assert.equal(N.configVersion(), 'Config v1 · starting values · scoring weights fixed');
});
