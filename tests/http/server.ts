// Starts the production build's standalone server (what the image runs) against a fresh test database, and
// gives tests a small cookie-keeping HTTP client per "browser". Needs `npm run build` first.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { freshDatabase, REPO, type TestDatabase } from '../integration/harness.ts';
import { seedBasics, type Basics } from '../integration/fixtures.ts';

export const PASSWORD = 'correct horse battery 42';
export const SESSION_SECRET = 'http-test-session-secret-'.padEnd(48, 'x');

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

export type TestServer = { base: string; db: TestDatabase; ids: Basics; logs: string[]; stop: () => Promise<void> };

export async function startServer(label: string, extraEnv: Record<string, string> = {}): Promise<TestServer> {
  const serverJs = join(REPO, '.next', 'standalone', 'server.js');
  if (!existsSync(serverJs)) throw new Error('No production build: run `npm run build` before the HTTP tests');
  const db = await freshDatabase(label);
  const ids = await seedBasics(db.pool('demandai_owner'));
  await db.pool('demandai_owner').query(`UPDATE users SET password_hash = $1 WHERE kind = 'person'`, [bcrypt.hashSync(PASSWORD, 4)]);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const logs: string[] = [];
  const child: ChildProcess = spawn(process.execPath, [serverJs], {
    cwd: join(REPO, '.next', 'standalone'),
    env: {
      PATH: process.env.PATH, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1', NEXT_TELEMETRY_DISABLED: '1',
      APP_BASE_URL: base, DATABASE_URL: db.url('demandai_app'), DATABASE_SSL_MODE: 'disable', SESSION_SECRET,
      NOTIFICATION_DISABLED: '1', LOG_LEVEL: 'info', ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout!.on('data', d => logs.push(String(d)));
  child.stderr!.on('data', d => logs.push(String(d)));
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    if (child.exitCode !== null) throw new Error(`server exited early:\n${logs.join('')}`);
    if (Date.now() > deadline) throw new Error(`server did not start:\n${logs.join('')}`);
    await new Promise(r => setTimeout(r, 200));
  }
  return {
    base, db, ids, logs,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise(r => child.once('exit', r));
      await db.drop();
    },
  };
}

/** A browser-like client: keeps its cookie, sends a same-origin Origin header on writes. */
export class Browser {
  cookie = '';
  readonly base: string;
  constructor(base: string) { this.base = base; }

  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: Record<string, unknown>; text: string; headers: Headers }> {
    const res = await fetch(this.base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' ? { origin: this.base } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = /demandai_session=([^;]*)/.exec(setCookie);
      if (m) this.cookie = m[1] ? `demandai_session=${m[1]}` : '';
    }
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* HTML */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  get(path: string) { return this.request('GET', path); }
  post(path: string, body: unknown = {}, headers?: Record<string, string>) { return this.request('POST', path, body, headers); }

  async signIn(email: string, password = PASSWORD) {
    const r = await this.post('/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`sign-in failed for ${email}: ${r.status} ${r.text}`);
    return r;
  }
}
