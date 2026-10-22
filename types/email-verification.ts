/* Email verification through Hunter.io (Email Verifier API). Shared by the server routes and the Prospecting screen. */

/** Hunter's `data.status`. */
export type HunterStatus = 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown';

/** What DemandAI concludes. Only 'valid' and 'invalid' are conclusive; everything else must never be read as either. */
export type VerificationOutcome = 'valid' | 'invalid' | 'inconclusive' | 'do_not_process';

export interface HunterSource { domain: string; uri: string; extracted_on: string; last_seen_on: string; still_on_page: boolean }

/** The response fields Hunter returns for one address, kept as received. */
export interface HunterVerification {
  status: HunterStatus | null;
  score: number | null;
  regexp: boolean | null;
  gibberish: boolean | null;
  disposable: boolean | null;
  webmail: boolean | null;
  mx_records: boolean | null;
  smtp_server: boolean | null;
  smtp_check: boolean | null;
  accept_all: boolean | null;
  block: boolean | null;
  verification: { date: string | null; status: string | null } | null;
  sources: HunterSource[];
}

/** One stored verification: Hunter's fields plus what DemandAI made of them. */
export interface EmailVerification extends HunterVerification {
  email: string;
  provider: 'hunter';
  outcome: VerificationOutcome;
  /** Why the outcome is what it is, in plain words. */
  reason: string;
  /** ISO timestamp of the Hunter call (not of the reuse). */
  checkedAt: string;
}

export type VerifyErrorCode =
  | 'not_configured' | 'invalid_api_key' | 'rate_limited' | 'quota_exceeded' | 'timeout' | 'pending'
  | 'smtp_unavailable' | 'bad_email' | 'upstream_error' | 'network_error';

export interface VerifyError { code: VerifyErrorCode; message: string; retryable: boolean; retryAfterMs?: number }

/** What POST /api/email-verification answers. */
export type VerifyResponse =
  | { ok: true; verification: EmailVerification; reused: boolean }
  | { ok: false; error: VerifyError };

/** True for a failed answer. A guard function, so narrowing works with or without strictNullChecks. */
export function isFailure(r: VerifyResponse): r is Extract<VerifyResponse, { ok: false }> { return !r.ok; }

export interface HunterSettingsStatus { configured: boolean; source: 'settings' | 'env' | null }
