// What each measure means, how it is worked out with the reader's own numbers filled in, its target, and why it may
// read "Too early to call" (product owner, 30 Oct 2026; the wording of section J of the change request). Shown in
// Analytics only: the Today and For Review tiles carry no (i) (product owner, 30 Oct 2026).

export type Explain = { title: string; means: string; how: string; target?: string; early?: string; example?: string };

/** The parts of the measures the texts quote (R.measure's shape, numbers only). */
export type MeasureNumbers = {
  autoN: number; excN: number; weighted: number | null; minutes: number | null; base: number; handled?: number; saved: number | null;
  auto: { n: number; a: number; pct: number | null }; exc: { n: number; a: number; pct: number | null }; pooled: { n: number; a: number; pct: number | null };
  alternatives: { n: number; a: number; pct: number | null }; flagged: number;
};
export type SettingNumbers = { g1Threshold: number; g2Threshold: number; minDecisions: number; spotCheckShare: number; dealSizeThreshold?: number; g1BaselineMinutes?: number };

const p = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${Math.round(v)}%`);
const r1 = (v: number) => Math.round(v * 10) / 10;
const k = (usd: number) => `USD ${Math.round(usd / 1000)}k`;

export const earlyText = (n: number, min: number) => `Too early to call: ${n} of ${min} decisions`;

export function explainG1(m: MeasureNumbers, s: SettingNumbers): Explain {
  const target = r1(m.base * (1 - s.g1Threshold / 100));
  return {
    title: 'G1 · Reduced human effort', means: 'Does the system save people time compared with doing it by hand?',
    how: m.minutes === null ? `Minutes people spent reviewing ÷ first actions they handled, compared with the baseline of ${m.base} min. Nobody has handled one yet.`
      : `Minutes people spent reviewing ÷ first actions they handled: ${r1(m.minutes * (m.handled ?? 1))} min ÷ ${m.handled ?? 1} = ${r1(m.minutes)} min each, against ${m.base} min before the pilot: ${p(m.saved)} less. Preparation and sending time are not recorded in the pilot.`,
    target: `Passes when it is at least ${s.g1Threshold}% less than ${m.base} min, so ${target} min or less per first action.`,
    early: `No pass or fail until ${s.minDecisions} decisions are counted (${m.pooled.n} so far).`,
    example: 'Before the pilot, one first action took 38 min. Now people spend 10 min reviewing each one: 74% less, so G1 passes. At 25 min it would be 34% less: it fails.',
  };
}

export function explainG2(m: MeasureNumbers, s: SettingNumbers): Explain {
  const total = m.autoN + m.excN;
  const working = m.auto.pct !== null && m.exc.pct !== null && total
    ? `${p(m.auto.pct)} × ${m.autoN}/${total} + ${p(m.exc.pct)} × ${m.excN}/${total} = ${p(m.weighted)}`
    : m.weighted !== null ? `only one path has decisions so far: ${p(m.weighted)}` : 'no decisions yet';
  return {
    title: 'G2 · Recommendation acceptance', means: 'How often people agree with the system the first time.',
    how: `Accepted on first pass ÷ recommendations a person judged (queue decisions, the sales manager's approvals and rejections, and spot-checks), weighted by how many items took each path: ${working}. An item counts once, by its first decision.`,
    target: `Passes at ${s.g2Threshold}% or more.`, early: `No pass or fail until ${s.minDecisions} decisions are counted (${m.pooled.n} so far).`,
    example: 'Of 20 items, 12 went ahead and 8 needed a person. Spot-checks accepted 100%, the queue 50%: 100% × 12/20 + 50% × 8/20 = 80%, so G2 passes.',
  };
}

export const explainEarly = (n: number, min: number): Explain => ({
  title: 'Too early to call', means: 'A result from a handful of decisions is mostly luck, so the gate waits.',
  how: `No pass or fail until ${min} decisions are counted; until then it shows how many so far: ${n} of ${min}.`,
  example: '2 decisions, both accepted, would read 100%. One rejection would make it 67%. After 10 decisions the number means something.',
});

export const FIRST_PASS: Explain = {
  title: 'First pass only', means: "G2 judges the system's first answer, not its second try.",
  how: 'Only the first decision on an item counts. An alternative accepted after a rejection is counted separately ("Within one alternative").',
  example: 'The system suggests emailing Dev; you reject it, it offers Eli, you accept. For G2 that is one rejection. Accepting Eli shows under "Within one alternative".',
};

export const CHECKED: Explain = {
  title: 'Checked before counting', means: 'Stops quick clicking from inflating the score.',
  how: 'A decision made in under 5 seconds, or in a run of identical decisions, is flagged and counts only after a manager checks it.',
  example: 'Someone approves 20 items in a row at 2 seconds each. They are flagged and left out until checked.',
};

export const explainSpotShare = (share: number): Explain => ({
  title: 'Spot-check share', means: 'How much of what went ahead on its own a person still checks.',
  how: `Each week, ${Math.round(share * 100)}% of each rep's items that went ahead (at least 1) are drawn at random to rate.`,
  example: 'A rep had 5 items go ahead this week: 1 is drawn for them to rate by Friday.',
});

export const explainProceeded = (m: MeasureNumbers): Explain => ({
  title: 'Proceeded path', means: 'Of the items that went ahead on their own, how many people agreed with when they rated them.',
  how: `Spot-checks accepted ÷ spot-checks rated: ${m.auto.a} ÷ ${m.auto.n} = ${p(m.auto.pct)} (${m.autoN} items went ahead).`, example: '4 rated, 3 accepted: 75%.',
});

export const explainException = (m: MeasureNumbers): Explain => ({
  title: 'Exception path', means: 'Of the items that needed a person, how many were accepted as recommended.',
  how: `Accepted ÷ decided in the queue: ${m.exc.a} ÷ ${m.exc.n} = ${p(m.exc.pct)} (${m.excN} items needed a person).`, example: '8 decided, 4 accepted: 50%.',
});

export const explainAlternative = (m: MeasureNumbers): Explain => ({
  title: 'Within one alternative', means: 'When the first answer was wrong, did the second one work?',
  how: `Alternatives accepted ÷ alternatives decided: ${m.alternatives.a} ÷ ${m.alternatives.n} = ${p(m.alternatives.pct)}. Not part of G2.`,
  example: '3 rejections brought back an alternative; 2 were accepted: 67%.',
});

export const explainFlagged = (n: number): Explain => ({
  title: 'Flagged', means: 'Decisions to double-check before they count.',
  how: `Count of decisions flagged by the 5-second or same-decision check, not yet checked: ${n}.`, example: '4 flagged: a manager opens each and confirms it.',
});

export const explainDeal = (threshold: number): Explain => ({
  title: 'Deal-size threshold', means: "Small deals need a person's judgement.",
  how: `An item whose estimated first deal is below ${k(threshold)} goes to For Review as "Below deal size". Set in Setup › Measurement and proceed criteria.`,
  example: 'An EPC contractor in petrochemicals with USD 400m revenue is estimated at about USD 160k: it goes to a person.',
});

export const explainPreferred = (min: number): Explain => ({
  title: 'Preferred-action candidate', means: 'An action that keeps working in a segment.',
  how: `Judged at least ${min} times, accepted 70% or more, and led to a reply or a meeting. During the pilot this only suggests; nothing changes on its own.`,
  example: '"Offer a site assessment" in Modernisation: accepted 9 of 10, 3 meetings.',
});

export const explainPaused = (min: number): Explain => ({
  title: 'Would be paused for review', means: 'A segment people keep rejecting.',
  how: `Judged at least ${min} times and accepted under 50%. In production it would be paused and reviewed; in the pilot it is only flagged.`,
  example: 'Leadership items rejected 4 of 5 times as "Wrong contact".',
});

export const explainWeight = (overall: number | null): Explain => ({
  title: 'Review: weight up / down', means: 'A signal whose recommendations are accepted much more or less than average.',
  how: `Acceptance for that signal is 20 points or more above (up) or below (down) the overall rate${overall === null ? '' : ` of ${p(overall)}`}. A suggestion only: the weights change in Setup, by a person.`,
  example: 'Webinar-based items accepted 40% against 75% overall: review its weight down.',
});
