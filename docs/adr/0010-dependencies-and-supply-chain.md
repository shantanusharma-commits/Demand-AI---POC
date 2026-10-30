# ADR 0010: Dependencies and the supply chain

**Status:** Accepted, 21 Oct 2026 (D-24, D-25, D-31).

## Decision

- Exact versions only, from the lockfile (`npm ci`). A new or updated dependency must be at least 1 day old, preferring 7 days unless a newer patch fixes an advisory (`npm install --save-exact --before=<date>`; `npm run deps:age` checks the lockfile's publish dates in CI).
- `npm run audit:gate` fails CI on any high or critical advisory in production dependencies. Development-only advisories may be allowed only with a reason and an expiry (`security/audit-allowlist.json`; empty since 23 Oct 2026).
- SheetJS 0.20.3 is the official tarball, pinned by its checksum (npm stops at 0.18.5, which has two advisories); `npm audit` doesn't cover it, so its advisories are tracked by hand. It was committed under `vendor/` until 30 Oct 2026; since then `npm ci` downloads it from SheetJS's CDN, because Azure Repos refuses files over 1 MB.
- CI actions are pinned by commit SHA and images by digest; gitleaks scans every commit.

## Consequences

Upgrades are deliberate: Next.js went from 16.4.0 to 16.4.2 for three advisories under this rule (23 Oct 2026). A new dependency needs the plan's approval.
