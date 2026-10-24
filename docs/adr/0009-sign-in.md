# ADR 0009: Invite-only password sign-in

**Status:** Accepted, 21 Oct 2026 (D-3 revised, D-26, D-29). SSO is Phase 3b if the Client requires it.

## Decision

Email and password, invite-only (no self sign-up): bcrypt hashes, HMAC-signed database sessions (12 hours absolute, 60 minutes idle), five wrong passwords lock an account for 15 minutes, per-address and per-email rate limits, one-time invite and reset links (hashed, expiring, in the URL fragment), every session ended by a reset or a deactivation. Roles are per business unit in the database. Admins and Sales managers manage users; only Admins grant Admin. Without SMTP, links are shown to copy.

## Alternatives

Entra ID (OIDC) SSO: the plan's original default; deferred because the Client's identity tenant and its requirement weren't known. It would sit on the same tables (users keyed by the IdP's subject and tenant).

## Consequences

No second factor: phishing or a reused password could expose an account. Mitigated by invite-only accounts, length and common-password rules, lockout and short sessions. If the Client's security review requires MFA, add SSO (Phase 3b).
