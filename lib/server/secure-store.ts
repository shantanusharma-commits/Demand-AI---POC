/* Server-side storage for the integration key and stored verifications (server only).
   Files live in DEMANDAI_DATA_DIR (default ./.data, git-ignored). The API key is encrypted with AES-256-GCM.
   The encryption secret is SETTINGS_SECRET if set; otherwise a random one is created next to the data (mode 0600).
   That keeps the key out of plain text on disk; for production set SETTINGS_SECRET (or use a secrets manager). */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const dataDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.DEMANDAI_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), '.data'));

/* Writes to one file are queued, and land via a temp file and a rename, so a crash never leaves half a file. */
const queues = new Map<string, Promise<unknown>>();
export function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(file) ?? Promise.resolve()).then(fn, fn);
  queues.set(file, next.catch(() => undefined));
  return next;
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw e; }
}
export async function writeJson(file: string, value: unknown, pretty = true): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, pretty ? 2 : 0), { mode: 0o600 });
  await fs.rename(tmp, file);
}

/* ─── Secrets ─── */
async function secret(): Promise<Buffer> {
  if (process.env.SETTINGS_SECRET) return createHash('sha256').update(process.env.SETTINGS_SECRET).digest();
  const f = path.join(dataDir(), '.secret');
  try { return Buffer.from((await fs.readFile(f, 'utf8')).trim(), 'hex'); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    await fs.mkdir(dataDir(), { recursive: true });
    const k = randomBytes(32);
    try { await fs.writeFile(f, k.toString('hex'), { mode: 0o600, flag: 'wx' }); return k; }
    catch (e2) { if ((e2 as NodeJS.ErrnoException).code === 'EEXIST') return Buffer.from((await fs.readFile(f, 'utf8')).trim(), 'hex'); throw e2; }
  }
}

interface Sealed { iv: string; tag: string; data: string }
async function seal(plain: string): Promise<Sealed> {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', await secret(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { iv: iv.toString('hex'), tag: c.getAuthTag().toString('hex'), data: data.toString('hex') };
}
async function unseal(s: Sealed): Promise<string> {
  const d = createDecipheriv('aes-256-gcm', await secret(), Buffer.from(s.iv, 'hex'));
  d.setAuthTag(Buffer.from(s.tag, 'hex'));
  return Buffer.concat([d.update(Buffer.from(s.data, 'hex')), d.final()]).toString('utf8');
}

/* ─── Settings: the Hunter.io key ─── */
interface SettingsFile { hunterApiKey?: Sealed }
const settingsFile = () => path.join(dataDir(), 'settings.json');

export async function saveHunterKey(key: string): Promise<void> {
  const sealed = await seal(key);
  await withFileLock(settingsFile(), async () => {
    const s = await readJson<SettingsFile>(settingsFile(), {});
    s.hunterApiKey = sealed;
    await writeJson(settingsFile(), s);
  });
}
export async function clearHunterKey(): Promise<void> {
  await withFileLock(settingsFile(), async () => {
    const s = await readJson<SettingsFile>(settingsFile(), {});
    delete s.hunterApiKey;
    await writeJson(settingsFile(), s);
  });
}

/** The key to use, and where it came from. A key saved in Setup wins over HUNTER_API_KEY. Server use only: never return `key` to a client. */
export async function getHunterKey(): Promise<{ key: string; source: 'settings' | 'env' } | null> {
  const s = await readJson<SettingsFile>(settingsFile(), {});
  if (s.hunterApiKey) {
    try { return { key: await unseal(s.hunterApiKey), source: 'settings' }; }
    catch { /* unreadable (secret changed): fall through to the environment variable */ }
  }
  const env = (process.env.HUNTER_API_KEY || '').trim();
  return env ? { key: env, source: 'env' } : null;
}
