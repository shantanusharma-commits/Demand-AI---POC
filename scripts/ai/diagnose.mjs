#!/usr/bin/env node
// Checks an Azure OpenAI endpoint (or the API Management gateway in front of it) the way DemandAI calls it (D-44), for
// DevOps before switching AI on (docs/devops/AZURE-OPENAI.md). For the main and the small deployment: a one-word
// answer, the model that served it, a strict structured-output reply, and a reasoning model's parameters. Prints
// statuses, error codes and model names only, never the endpoint, the key or a reply's text. A few tiny calls.
//   node --env-file=.env.local scripts/ai/diagnose.mjs        (or with AZURE_OPENAI_* set in the environment)
const env = process.env;
const missing = ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT'].filter(k => !env[k]);
if (missing.length) { console.error(`diagnose: set ${missing.join(', ')}`); process.exit(2); }
const endpoint = env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, ''), key = env.AZURE_OPENAI_API_KEY;
const header = env.AZURE_OPENAI_AUTH_HEADER || 'api-key', version = env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview';
const base = /\/openai$/.test(new URL(endpoint).pathname) ? endpoint : `${endpoint}/openai`;
const host = new URL(endpoint).host;
const clean = s => String(s ?? '').split(host).join('<host>').split(key).join('<key>').slice(0, 160);

async function call(deployment, body, apiVersion = version) {
  const started = Date.now();
  try {
    const r = await fetch(`${base}/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${apiVersion}`, {
      method: 'POST', headers: { 'content-type': 'application/json', [header]: key }, body: JSON.stringify({ model: deployment, ...body }), signal: AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { /* not JSON */ }
    const err = j?.error ? `${j.error.code ?? ''} ${clean(j.error.message)}`.trim() : r.ok ? '' : clean(j?.message ?? text);
    return { status: r.status, ms: Date.now() - started, model: j?.model ?? r.headers.get('x-ms-served-model') ?? '', finish: j?.choices?.[0]?.finish_reason ?? '', content: j?.choices?.[0]?.message?.content ?? '', err };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, model: '', finish: '', content: '', err: `${e.name}: ${clean(e.message)}` };
  }
}

const say = (ok, label, r, extra = '') => console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(44)} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(6)} ms ${r.model} ${extra}${r.err ? ` · ${r.err}` : ''}`);
const msgs = [{ role: 'system', content: 'You answer with one word.' }, { role: 'user', content: 'Reply with the word OK.' }];
const schema = { type: 'json_schema', json_schema: { name: 'diagnose', strict: true, schema: { type: 'object', additionalProperties: false, required: ['word'], properties: { word: { type: 'string', enum: ['OK'] } } } } };

console.log(`API version ${version}, key sent as ${header}\n`);
let failed = 0;
for (const [role, deployment] of [['main', env.AZURE_OPENAI_DEPLOYMENT], ['small', env.AZURE_OPENAI_DEPLOYMENT_SMALL]]) {
  if (!deployment) { console.log(`--   ${role} deployment not configured`); continue; }
  console.log(`${role} deployment "${deployment}"`);
  const plain = await call(deployment, { messages: msgs, max_completion_tokens: 32, reasoning_effort: 'none' });
  const okPlain = plain.status === 200 && /ok/i.test(plain.content);
  say(okPlain, 'answers (effort none)', plain, plain.finish);
  const strict = await call(deployment, { messages: msgs, max_completion_tokens: 64, reasoning_effort: 'none', response_format: schema });
  const okStrict = strict.status === 200 && strict.content.trim() === '{"word":"OK"}';
  say(okStrict, 'structured output (strict json_schema)', strict);
  const low = await call(deployment, { messages: msgs, max_completion_tokens: 1056, reasoning_effort: 'low' });
  say(low.status === 200, 'reasoning effort low', low, low.finish);
  failed += [okPlain, okStrict, low.status === 200].filter(x => !x).length;
  console.log('');
}
if (failed) console.log(`${failed} check(s) failed. 404 on every call: wrong deployment name, API version or path (an APIM gateway may expose other paths). 401/403: the key or its header. An occasional 400 "…not supported for CheckAccess" is the pilot gateway's intermittent backend refusal (retried by the app).`);
process.exit(failed ? 1 : 0);
