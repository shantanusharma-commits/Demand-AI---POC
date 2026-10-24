// A stand-in for Azure OpenAI's chat completions on 127.0.0.1, for the HTTP tests and local browser checks: it answers
// in Azure's response format with the same per-capability fakes the unit tests use, and keeps every request it got
// (path, query, headers, body) so a test can read what the app sent. Like the GPT-5 deployments it plays (D-44), it
// refuses max_tokens, a temperature beside a reasoning effort other than "none", and a json_schema that isn't strict,
// with the errors those models return; it names the model that answered "<deployment>-stand-in". Never a live model.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { ModelRequest } from '../../lib/ai/types.ts';
import { classifier, draftWriter, pieceWriter, rewriteIds, rewriteParts, whyNowWriter } from './ai-fakes.ts';
import { json, reply, type StepFn } from './fake-model.ts';

export type Received = { path: string; query: URLSearchParams; headers: IncomingMessage['headers']; body: { messages: { role: string; content: string }[];
  response_format?: { type: string; json_schema?: { name: string; strict?: boolean; schema: Record<string, unknown> } }; max_tokens?: number; max_completion_tokens?: number;
  reasoning_effort?: string; temperature?: number } };

/** What a GPT-5 deployment refuses, as it says it (captured 24 Oct 2026). */
function refusal(body: Received['body']): { message: string; param: string; code: string } | null {
  if (body.max_tokens !== undefined) return { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", param: 'max_tokens', code: 'unsupported_parameter' };
  if (body.temperature !== undefined && body.reasoning_effort && body.reasoning_effort !== 'none') {
    return { message: `Unsupported value: 'temperature' does not support ${body.temperature} with this model. Only the default (1) value is supported.`, param: 'temperature', code: 'unsupported_value' };
  }
  if (body.response_format?.type === 'json_schema' && (!body.response_format.json_schema?.strict || body.response_format.json_schema.schema?.additionalProperties !== false)) {
    return { message: 'Invalid schema for response_format: a strict schema needs additionalProperties false.', param: 'response_format', code: 'invalid_value' };
  }
  return null;
}

/** Answers by what the request is: the system prompt names its task. */
export const byTask: StepFn = (req, n) => {
  const s = req.system;
  if (/connectivity check/.test(s)) return reply('OK');
  if (/classify the industry/.test(s)) return classifier(() => ({ vertical: 'Other', confidence: 'high' }))(req, n);
  if (/"why now" line/.test(s)) return whyNowWriter()(req, n);
  if (/first outreach message/.test(s)) return draftWriter()(req, n);
  if (/one part at a time/.test(s)) return pieceWriter()(req, n);
  if (/^You edit a /.test(s)) { const id = rewriteIds(req)[0]; return json({ parts: rewriteParts(req, id ? { [id]: 'A plainer opening, as one engineer would put it to another.' } : {}), reply: 'Rewrote the opening in a plainer, peer-to-peer voice.' }); }
  if (/You are Copilot/.test(s)) { const t = req.messages.at(-1)!.content.match(/\bP\d+\b/)?.[0]; return reply(t ? `${t} is the one to look at first.` : 'Nothing in the data answers that.'); }
  return reply('OK');
};

export async function startFakeAzure(answer: StepFn = byTask, port = 0): Promise<{ base: string; received: Received[]; stop: () => Promise<void> }> {
  const received: Received[] = [];
  let n = 0;
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    received.push({ path: url.pathname, query: url.searchParams, headers: req.headers, body });
    const refused = refusal(body);
    if (refused) {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { ...refused, type: 'invalid_request_error' } }));
      return;
    }
    const model = `${decodeURIComponent(url.pathname.match(/\/deployments\/([^/]+)\//)?.[1] ?? 'unknown')}-stand-in`;
    const system = body.messages?.find((m: { role: string }) => m.role === 'system')?.content ?? '';
    const r: ModelRequest = { system, messages: (body.messages ?? []).filter((m: { role: string }) => m.role !== 'system'), json: !!body.response_format,
      maxTokens: body.max_completion_tokens ?? 0, temperature: 0, signal: new AbortController().signal };
    const out = await answer(r, ++n);
    if (out instanceof Error) {
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'InternalServerError', message: 'stand-in failure' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'x-request-id': `fake-${n}`, 'x-ms-served-model': model }).end(JSON.stringify({
      id: `chatcmpl-fake-${n}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
      choices: [{ index: 0, finish_reason: out.finish === 'content_filter' ? 'content_filter' : out.finish === 'length' ? 'length' : 'stop', message: { role: 'assistant', content: out.text } }],
      usage: { prompt_tokens: out.promptTokens, completion_tokens: out.completionTokens, total_tokens: out.promptTokens + out.completionTokens },
    }));
  });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const bound = (server.address() as { port: number }).port;
  return { base: `http://127.0.0.1:${bound}`, received, stop: () => new Promise(resolve => server.close(() => resolve())) };
}
