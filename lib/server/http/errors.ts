// Errors a service can raise on purpose. The message is shown to the person, so it names the problem in plain
// words and never includes stored values, SQL or stack traces. Anything else becomes a generic 500.
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message: string, fields?: Record<string, string[]>) => new HttpError(400, 'bad_request', message, fields);
export const unauthorized = (message = 'Sign in to continue.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message: string) => new HttpError(403, 'forbidden', message);
/** Also used when a record exists but is outside the caller's scope, so its existence isn't confirmed. */
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);
export const conflict = (message: string) => new HttpError(409, 'conflict', message);
export const tooMany = (message: string) => new HttpError(429, 'rate_limited', message);
