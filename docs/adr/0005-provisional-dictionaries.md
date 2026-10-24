# ADR 0005: Synonyms, personas and the industry table (provisional v1)

**Status:** Provisional, 22 Oct 2026 (D-14, D-15, D-16, D-17). The Client is to confirm or replace each list.

## Decision

- **Synonyms (D-14):** country codes and variants, account-type variants (Owner operator, Owner/Operator, Operator, End user → Owner-operator; SI → System integrator), "Opt-in" → Opted in, and RFQ / Inquiry → "Inquiry or RFQ" are read as the template's values, each with an info flag ("read as …"). Everything else stays rejected until the Client adds it.
- **Personas and industries (D-15):** a versioned v1 dictionary of titles (including Instrument Engineer, the Inst./Ctrl abbreviations and local-language titles in the audit) and of industries, with out-of-ICP exclusions (palm oil, oleochemical, edible oil, sugar); a person can set an account's vertical with a reason. AI classification, when on, only answers what the table can't match, and below high confidence the account stays in review.
- **Signals (D-16):** the contact is optional; a blank one is auto-assigned only to someone who can be contacted, and flagged. An optional `company_domain` column is used for matching.
- **Unreadable values (D-17):** an unreadable "managed separately" or opt-out holds the account or contact for review; nothing is handed off until a person confirms, and the confirmation is logged.

## Consequences

The answer-key test holds the results at these lists (with each deliberate change commented). When the Client's lists arrive, they become configuration version 2 and the answer key's expectations are reviewed.
