// The scoring settings an Admin edits in Setup (product owner, 30 Oct 2026; replaces the D-13 lock): what they may hold,
// read from a configuration version's body (`scoring`; absent means the starting values), and what changed between two
// versions, in words. Shared by the server (it checks and stores them) and Setup (it edits and previews them).
import { z } from 'zod';
import {
  BUILT_IN_PARTS, CONFIG, DEFAULT_SCORING, PART_COLUMNS, PART_LEVELS, PERSONA_LABELS, RULE_TESTS, defaultScoringSettings,
  type BuiltInPartKey, type RubricPart, type ScoringSettings,
} from '../demandai-engine.ts';

const pts = z.number().min(0, 'Points go from 0 to 100.').max(100, 'Points go from 0 to 100.');
const label = (max: number) => z.string().trim().min(1, 'Give it a name.').max(max);
const SCORED = Object.entries(CONFIG.signalTypes).filter(([, c]) => !c.knockout && !c.reject).map(([n]) => n);
const PERSONA_SOURCES = [...CONFIG.personas.primary, ...CONFIG.personas.secondary].map(re => re.source);

const Rule = z.object({ when: z.enum(Object.keys(RULE_TESTS) as [keyof typeof RULE_TESTS, ...(keyof typeof RULE_TESTS)[]]), value: z.string().trim().max(100), points: pts })
  .refine(r => !['atLeast', 'below'].includes(r.when) || (r.value !== '' && Number.isFinite(Number(r.value))), { message: '"At least" and "below" need a number.', path: ['value'] })
  .refine(r => ['yes', 'no', 'blank'].includes(r.when) || r.value !== '', { message: 'Say what value the rule looks for.', path: ['value'] });
const Part = z.object({
  key: z.string().regex(/^([a-zA-Z]+|x-[a-z0-9-]{1,40})$/), label: label(60), weight: z.number().int('Weights are whole percentages.').min(0).max(100),
  levels: z.record(z.string(), pts).optional(), column: z.string().optional(), rules: z.array(Rule).max(20).optional(), otherwise: pts.optional(),
}).superRefine((p, ctx) => {
  if ((BUILT_IN_PARTS as string[]).includes(p.key)) {
    const known = PART_LEVELS[p.key as BuiltInPartKey].map(l => l.key);
    for (const k of Object.keys(p.levels ?? {})) if (!known.includes(k)) ctx.addIssue({ code: 'custom', message: `"${k}" is not a level of ${p.label}.`, path: ['levels'] });
  } else if (!p.key.startsWith('x-')) ctx.addIssue({ code: 'custom', message: 'Not a rubric part.', path: ['key'] });
  else {
    if (!p.column || !PART_COLUMNS[p.column]) ctx.addIssue({ code: 'custom', message: 'Pick the lead-file column this part reads.', path: ['column'] });
    if (!p.rules?.length) ctx.addIssue({ code: 'custom', message: 'Give it at least one rule.', path: ['rules'] });
  }
});

export const ScoringSettingsInput = z.object({
  parts: z.array(Part).min(1, 'Keep at least one part.').max(20),
  fitFloor: pts, tiers: z.object({ A: pts, B: pts }),
  sizeBands: z.object({ revenueAbove: z.number().positive(), revenueIn: z.number().positive(), employeesAbove: z.number().int().positive(), employeesIn: z.number().int().positive() }),
  verticals: z.array(z.object({ name: label(60), level: z.enum(['core', 'adjacent', 'other']), words: z.array(z.string().trim().min(2).max(40)).max(30) })).max(30),
  personas: z.object({ off: z.array(z.string()).max(PERSONA_SOURCES.length), primary: z.array(z.string().trim().min(2).max(60)).max(50), secondary: z.array(z.string().trim().min(2).max(60)).max(50) }),
  knockouts: z.object({ region: z.boolean(), managed: z.boolean(), installed: z.boolean(), nobodyLeft: z.boolean() }),
  countries: z.array(z.string().trim().min(2).max(60)).max(60),
  signals: z.record(z.string(), z.object({ tier: z.number().min(1).max(100), strength: z.number().min(0.05).max(1), full: z.number().int().min(1).max(3650), zero: z.number().int().min(2).max(3650) })),
}).strict().superRefine((s, ctx) => {
  const total = s.parts.reduce((n, p) => n + p.weight, 0);
  if (total !== 100) ctx.addIssue({ code: 'custom', message: `The weights add up to ${total}%: they must add up to 100%.`, path: ['parts'] });
  const keys = s.parts.map(p => p.key), names = s.parts.map(p => p.label.toLowerCase());
  if (new Set(keys).size !== keys.length || new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', message: 'Two parts have the same name.', path: ['parts'] });
  if (s.tiers.B >= s.tiers.A) ctx.addIssue({ code: 'custom', message: 'Tier B must start below tier A.', path: ['tiers'] });
  if (s.sizeBands.revenueIn >= s.sizeBands.revenueAbove) ctx.addIssue({ code: 'custom', message: '"In target" revenue must be below "above target".', path: ['sizeBands'] });
  if (s.sizeBands.employeesIn >= s.sizeBands.employeesAbove) ctx.addIssue({ code: 'custom', message: '"In target" headcount must be below "above target".', path: ['sizeBands'] });
  const vs = s.verticals.map(v => v.name.toLowerCase());
  if (new Set(vs).size !== vs.length) ctx.addIssue({ code: 'custom', message: 'Two verticals have the same name.', path: ['verticals'] });
  if (vs.some(v => v === 'other' || v === 'out of icp')) ctx.addIssue({ code: 'custom', message: '"Other" and "Out of ICP" are kept by the system.', path: ['verticals'] });
  if (s.personas.off.some(o => !PERSONA_SOURCES.includes(o))) ctx.addIssue({ code: 'custom', message: 'Not a starting persona term.', path: ['personas'] });
  if (s.knockouts.region && !s.countries.length) ctx.addIssue({ code: 'custom', message: 'Name at least one country, or switch the region knock-out off.', path: ['countries'] });
  for (const [name, c] of Object.entries(s.signals)) {
    if (!SCORED.includes(name)) ctx.addIssue({ code: 'custom', message: `"${name}" is not a starting signal type that is scored.`, path: ['signals'] });
    if (c.zero <= c.full) ctx.addIssue({ code: 'custom', message: `${name}: "gone after" must be longer than "full weight for".`, path: ['signals'] });
  }
});

/** The scoring settings in a configuration body; the starting values (the same object, DEFAULT_SCORING) when it has
 *  none. Throws with the reason when they can't be used, so a run is never scored with settings other than the ones shown. */
export function scoringSettingsOf(body: unknown): ScoringSettings {
  const raw = body && typeof body === 'object' ? (body as { scoring?: unknown }).scoring : undefined;
  if (raw === undefined || raw === null) return DEFAULT_SCORING;
  const r = ScoringSettingsInput.safeParse(raw);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? 'the scoring settings are not valid');
  return r.data as ScoringSettings;
}

/** A new added part, with a key no other part uses. */
export function newPart(parts: RubricPart[], name: string): RubricPart {
  const base = 'x-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'part');
  let key = base, n = 2;
  while (parts.some(p => p.key === key)) key = `${base}-${n++}`;
  return { key, label: name, weight: 0, column: 'country', rules: [{ when: 'is', value: '', points: 100 }], otherwise: 0 };
}

export const PERSONA_TERMS: { kind: 'primary' | 'secondary'; source: string; label: string }[] = [
  ...CONFIG.personas.primary.map((re, i) => ({ kind: 'primary' as const, source: re.source, label: PERSONA_LABELS.primary[i] ?? re.source })),
  ...CONFIG.personas.secondary.map((re, i) => ({ kind: 'secondary' as const, source: re.source, label: PERSONA_LABELS.secondary[i] ?? re.source })),
];

const money = (n: number) => (n >= 1e9 ? `${+(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `${Math.round(n / 1e6)}m` : n.toLocaleString('en-US'));
const listDiff = (a: string[], b: string[], what: string) => {
  const A = new Set(a.map(x => x.toLowerCase())), B = new Set(b.map(x => x.toLowerCase()));
  return [...b.filter(x => !A.has(x.toLowerCase())).map(x => `${what} added: ${x}`), ...a.filter(x => !B.has(x.toLowerCase())).map(x => `${what} removed: ${x}`)];
};
const levelLabel = (p: RubricPart, k: string) => PART_LEVELS[p.key as BuiltInPartKey]?.find(l => l.key === k)?.label ?? k;
const ruleText = (p: RubricPart) => (p.rules ?? []).map(r => `${RULE_TESTS[r.when]}${r.value ? ' ' + r.value : ''} → ${r.points}`).join('; ') + `; otherwise ${p.otherwise ?? 0}`;

/** What changed from one set of scoring settings to the next, in words, for the version history and the audit trail. */
export function scoringChanges(a: ScoringSettings, b: ScoringSettings): string[] {
  const out: string[] = [];
  for (const p of b.parts) {
    const q = a.parts.find(x => x.key === p.key);
    if (!q) { out.push(`Part added: ${p.label} (${p.weight}%${p.column ? `, reads ${PART_COLUMNS[p.column]?.label ?? p.column}` : ''})`); continue; }
    if (q.label !== p.label) out.push(`Part renamed: ${q.label} → ${p.label}`);
    if (q.weight !== p.weight) out.push(`${p.label} weight: ${q.weight}% → ${p.weight}%`);
    for (const k of new Set([...Object.keys(q.levels ?? {}), ...Object.keys(p.levels ?? {})])) {
      const x = q.levels?.[k], y = p.levels?.[k];
      if (x !== y) out.push(`${p.label}, ${levelLabel(p, k)}: ${x ?? '—'} → ${y ?? '—'} points`);
    }
    if (p.column !== q.column) out.push(`${p.label} reads ${PART_COLUMNS[p.column ?? '']?.label ?? p.column} (was ${PART_COLUMNS[q.column ?? '']?.label ?? q.column})`);
    if (p.rules && ruleText(p) !== ruleText(q)) out.push(`${p.label} rules: ${ruleText(p)}`);
  }
  for (const q of a.parts) if (!b.parts.some(x => x.key === q.key)) out.push(`Part removed: ${q.label}`);
  if (a.fitFloor !== b.fitFloor) out.push(`Fit floor: ${a.fitFloor} → ${b.fitFloor}`);
  if (a.tiers.A !== b.tiers.A) out.push(`Tier A from: ${a.tiers.A} → ${b.tiers.A}`);
  if (a.tiers.B !== b.tiers.B) out.push(`Tier B from: ${a.tiers.B} → ${b.tiers.B}`);
  const sb = a.sizeBands, nb = b.sizeBands;
  if (sb.revenueAbove !== nb.revenueAbove || sb.revenueIn !== nb.revenueIn) out.push(`Revenue bands: USD ${money(nb.revenueIn)} / ${money(nb.revenueAbove)} (were ${money(sb.revenueIn)} / ${money(sb.revenueAbove)})`);
  if (sb.employeesAbove !== nb.employeesAbove || sb.employeesIn !== nb.employeesIn) out.push(`Headcount bands: ${nb.employeesIn.toLocaleString('en-US')} / ${nb.employeesAbove.toLocaleString('en-US')} (were ${sb.employeesIn.toLocaleString('en-US')} / ${sb.employeesAbove.toLocaleString('en-US')})`);
  for (const v of b.verticals) {
    const w = a.verticals.find(x => x.name === v.name);
    if (!w) out.push(`Vertical added: ${v.name} (${v.level}${v.words.length ? `; matches ${v.words.join(', ')}` : ''})`);
    else {
      if (w.level !== v.level) out.push(`${v.name}: ${w.level} → ${v.level}`);
      out.push(...listDiff(w.words, v.words, `${v.name} words`));
    }
  }
  for (const w of a.verticals) if (!b.verticals.some(x => x.name === w.name)) out.push(`Vertical removed: ${w.name}`);
  const term = (src: string) => PERSONA_TERMS.find(t => t.source === src)?.label ?? src;
  out.push(...listDiff(a.personas.off.map(term), b.personas.off.map(term), 'Persona term switched off').map(x => x.replace('switched off removed', 'switched back on')));
  out.push(...listDiff(a.personas.primary, b.personas.primary, 'Primary persona phrase'), ...listDiff(a.personas.secondary, b.personas.secondary, 'Secondary persona phrase'));
  const ko: Record<keyof ScoringSettings['knockouts'], string> = { region: 'Region', managed: 'Managed separately', installed: 'Pilot product installed', nobodyLeft: 'Nobody left to contact' };
  for (const k of Object.keys(ko) as (keyof typeof ko)[]) if (a.knockouts[k] !== b.knockouts[k]) out.push(`Knock-out "${ko[k]}" switched ${b.knockouts[k] ? 'on' : 'off'}`);
  out.push(...listDiff(a.countries, b.countries, 'Country'));
  for (const name of new Set([...Object.keys(a.signals), ...Object.keys(b.signals)])) {
    const base = CONFIG.signalTypes[name], x = a.signals[name] ?? base, y = b.signals[name] ?? base;
    if (!x || !y) continue;
    const wx = Math.round((x.tier ?? 0) * (x.strength ?? 0)), wy = Math.round((y.tier ?? 0) * (y.strength ?? 0));
    const bits = [wx !== wy ? `weight ${wx} → ${wy}` : '', x.full !== y.full ? `full weight for ${x.full} → ${y.full} days` : '', x.zero !== y.zero ? `gone after ${x.zero} → ${y.zero} days` : ''].filter(Boolean);
    if (bits.length) out.push(`${name}: ${bits.join(', ')}`);
  }
  return out;
}

/** The settings as Setup starts editing them: a copy, so the defaults are never changed in place. */
export const editableCopy = (s: ScoringSettings): ScoringSettings => (s === DEFAULT_SCORING ? defaultScoringSettings() : JSON.parse(JSON.stringify(s)));
