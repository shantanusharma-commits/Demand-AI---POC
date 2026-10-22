// Browser-side calls to the DemandAI API. Errors carry the server's own message (written for people) and the
// request ID to quote to support.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;
  readonly requestId?: string;
  constructor(status: number, body: { error?: string; code?: string; fields?: Record<string, string[]>; requestId?: string }) {
    super(body.error || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code || 'error';
    this.fields = body.fields;
    this.requestId = body.requestId;
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/')) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

/** One line for a toast or an inline error, with the reference when the server gave one. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.requestId && err.status >= 500 ? `${err.message} (reference ${err.requestId})` : err.message;
  return 'Something went wrong. Check your connection and try again.';
}
