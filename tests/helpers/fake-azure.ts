// A stand-in for Azure OpenAI's chat completions on 127.0.0.1, for the HTTP tests and local browser checks: it answers
// in Azure's response format with the same per-capability fakes the unit tests use, and keeps every request it got
// (path, query, headers, body) so a test can read what the app sent. Never a live model.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { ModelRequest } from '../../lib/ai/types.ts';
import { classifier, draftWriter, pieceWriter, rewriteIds, whyNowWriter } from './ai-fakes.ts';
import { json, reply, type StepFn } from './fake-model.ts';

export type Received = { path: string; query: URLSearchParams; headers: IncomingMessage['headers']; body: { messages: { role: string; content: string }[]; response_format?: unknown; max_tokens?: number } };

/** Answers by what the request is: the system prompt names its task. */
export const byTask: StepFn = (req, n) => {
  const s = req.system;
  if (/connectivity check/.test(s)) return reply('OK');
  if (/classify the industry/.test(s)) return classifier(() => ({ vertical: 'Other', confidence: 'high' }))(req, n);
  if (/"why now" line/.test(s)) return whyNowWriter()(req, n);
  if (/first outreach message/.test(s)) return draftWriter()(req, n);
  if (/one part at a time/.test(s)) return pieceWriter()(req, n);
  if (/^You edit a /.test(s)) { const id = rewriteIds(req)[0]; return json({ parts: id ? { [id]: 'A plainer opening, as one engineer would put it to another.' } : {}, reply: 'Rewrote the opening in a plainer, peer-to-peer voice.' }); }
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
    const system = body.messages?.find((m: { role: string }) => m.role === 'system')?.content ?? '';
    const r: ModelRequest = { system, messages: (body.messages ?? []).filter((m: { role: string }) => m.role !== 'system'), json: !!body.response_format, maxTokens: body.max_tokens ?? 0, temperature: 0, signal: new AbortController().signal };
    const out = await answer(r, ++n);
    if (out instanceof Error) {
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'InternalServerError', message: 'stand-in failure' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'x-request-id': `fake-${n}` }).end(JSON.stringify({
      id: `chatcmpl-fake-${n}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'gpt-4o-2024-05-13',
      choices: [{ index: 0, finish_reason: out.finish === 'content_filter' ? 'content_filter' : out.finish === 'length' ? 'length' : 'stop', message: { role: 'assistant', content: out.text } }],
      usage: { prompt_tokens: out.promptTokens, completion_tokens: out.completionTokens, total_tokens: out.promptTokens + out.completionTokens },
    }));
  });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const bound = (server.address() as { port: number }).port;
  return { base: `http://127.0.0.1:${bound}`, received, stop: () => new Promise(resolve => server.close(() => resolve())) };
}
