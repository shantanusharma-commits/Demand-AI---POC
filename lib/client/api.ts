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

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal: init.signal,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/')) {
    // The session ended: a full reload to the sign-in page drops everything the screen held.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
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

/** Uploads a file as multipart/form-data (the server checks it before storing anything). */
export async function uploadFile<T = unknown>(path: string, fields: Record<string, string>, file: File): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set('file', file, file.name);
  const res = await fetch(path, { method: 'POST', body: form, credentials: 'same-origin', cache: 'no-store' });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { error: res.status === 413 ? 'The file is too large.' : undefined }; }
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

/** Server types as they arrive over JSON: dates are ISO strings. */
export type Wire<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };
/** Wire, all the way down (dates inside nested objects and arrays arrive as strings too). */
export type WireDeep<T> = T extends Date ? string : T extends (infer U)[] ? WireDeep<U>[] : T extends object ? { [K in keyof T]: WireDeep<T[K]> } : T;

export type JobState = {
  id: string; kind: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; stage: string | null;
  progress: { stages: string[]; done: number; counts?: Record<string, number>; result?: Record<string, string> };
  error: { code: string; message: string } | null;
};

/** Polls a job until it has finished, reporting each change; resolves with the finished job. */
export async function waitForJob(jobId: string, onChange: (job: JobState) => void, intervalMs = 300): Promise<JobState> {
  let last = '';
  for (;;) {
    const { job } = await api<{ job: JobState }>(`/api/jobs/${jobId}`);
    const key = `${job.status}:${job.stage}:${job.progress.done}`;
    if (key !== last) { last = key; onChange(job); }
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') return job;
    await new Promise(r => setTimeout(r, intervalMs));
  }
}
