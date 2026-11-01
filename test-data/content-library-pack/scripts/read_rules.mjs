// Runs the remediation branch's own readRules (copied into read_rules_core.ts) on the .md and .txt guidelines,
// to record what the POC suggests today. Usage: node read_rules.mjs <texts.json> <out.json>
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./read_rules_core.ts', import.meta.url), 'utf8')
  .replace(/^export function readRules\(text: string\): RuleSuggestion\[\] \{/m, 'function readRules(text) {')
  .replace(/: RuleSuggestion\[\] = \[\]/, ' = []').replace(/\(v: string\)/g, '(v)').replace(/let m: RegExpMatchArray \| null;/, 'let m;')
  .replace(/new Set<string>\(\)/, 'new Set()');
const readRules = new Function(src + '\nreturn readRules;')();
const { texts } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = {};
for (const [f, t] of Object.entries(texts)) out[f] = readRules(t).map(x => [x.kind, x.value]);
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
for (const [f, r] of Object.entries(out)) console.log(f, r.length, 'rules');
