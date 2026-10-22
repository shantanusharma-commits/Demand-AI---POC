// Passwords: bcrypt (bcryptjs, cost 12, as the RFP service) and the rules a new password must meet.
import 'server-only';
import bcrypt from 'bcryptjs';
import { COMMON_PASSWORDS } from './common-passwords.ts';

export const BCRYPT_COST = 12;
export const MIN_LENGTH = 12;
// bcrypt reads only the first 72 bytes; longer passwords would silently share a hash.
export const MAX_BYTES = 72;

export function hashPassword(password: string, cost = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(password, cost);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// A real hash to compare against when the account doesn't exist, so a wrong email costs the same time as a wrong
// password and the reply can't reveal which it was.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<false> {
  dummyHash ??= bcrypt.hash('demandai-timing-equaliser', BCRYPT_COST);
  await bcrypt.compare(password, await dummyHash);
  return false;
}

/** Problems with a proposed password, in words a person can act on. Empty means acceptable. */
export function passwordProblems(password: string, context: { email?: string; displayName?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < MIN_LENGTH) problems.push(`Use at least ${MIN_LENGTH} characters.`);
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) problems.push(`Use at most ${MAX_BYTES} bytes (about ${MAX_BYTES} letters).`);
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(lower.replace(/[0-9!@#$%^&*._-]+$/, ''))) problems.push('This password is too common.');
  if (/^(.)\1+$/.test(password)) problems.push("Don't repeat one character.");
  if (/demandai/i.test(password)) problems.push("Don't use the product's name.");
  const local = context.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) problems.push("Don't use your email address.");
  const name = context.displayName?.toLowerCase().split(/\s+/).find(part => part.length >= 4 && lower.includes(part));
  if (name) problems.push("Don't use your name.");
  return problems;
}
