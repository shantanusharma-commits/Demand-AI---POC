// A scripted model client for tests: CI never calls a live model (remediation prompt §7.9). Each step answers one
// request in turn (a reply, an error, or a function of the request); every request is kept so tests can read what
// would have been sent (the personal-data scan, prompt-injection fixtures).
import { ModelError, type ModelClient, type ModelErrorKind, type ModelRequest, type ModelResponse } from '../../lib/ai/types.ts';

export type Step = ModelResponse | ModelError | ((req: ModelRequest, n: number) => ModelResponse | ModelError | Promise<ModelResponse | ModelError>);

export const reply = (text: string, extra: Partial<ModelResponse> = {}): ModelResponse =>
  ({ text, finish: 'stop', promptTokens: 120, completionTokens: 40, ...extra });
export const json = (value: unknown, extra: Partial<ModelResponse> = {}): ModelResponse => reply(JSON.stringify(value), extra);
export const fail = (kind: ModelErrorKind, extra: { status?: number; retryAfterMs?: number; filtered?: string[] } = {}) => new ModelError(kind, `fake ${kind}`, extra);
/** Never answers until the request is cancelled (a timeout test). */
export const hang = (): Step => req => new Promise((_, reject) => req.signal.addEventListener('abort', () => reject(new ModelError('aborted', 'fake abort'))));

export class FakeModel implements ModelClient {
  readonly provider = 'fake' as const;
  readonly deployment: string;
  readonly requests: ModelRequest[] = [];
  private readonly steps: Step[];
  private readonly fallback: Step | null;
  constructor(steps: Step[] = [], opts: { deployment?: string; otherwise?: Step } = {}) {
    this.steps = steps.slice();
    this.deployment = opts.deployment ?? 'fake-deployment';
    this.fallback = opts.otherwise ?? null;
  }
  async complete(req: ModelRequest): Promise<ModelResponse> {
    this.requests.push(req);
    const step = this.steps.shift() ?? this.fallback;
    if (!step) throw new Error(`FakeModel: no answer scripted for request ${this.requests.length}`);
    const out = typeof step === 'function' ? await step(req, this.requests.length) : step;
    if (out instanceof ModelError) throw out;
    return out;
  }
  /** Everything a request would have sent, as one string. */
  static sent(req: ModelRequest): string {
    return [req.system, ...req.messages.map(m => m.content)].join('\n');
  }
}
