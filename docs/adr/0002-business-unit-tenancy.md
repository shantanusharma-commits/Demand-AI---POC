# ADR 0002: Business units and ownership

**Status:** Accepted, 22 Oct 2026 (D-32, D-33, D-34; extends D-4).

## Context

One deployment serves one Client, whose sales organisation is split into business units with their own pipelines, configuration and brand. Reps must see only their own accounts; managers their unit; the Client also wanted leads routed to the right unit.

## Decision

- **Row-level tenancy in one database.** Every unit-owned table carries `business_unit_id`. Isolation is enforced twice: by the services (scoped repositories) and by PostgreSQL row-level security keyed on per-transaction settings set by `withTenant()`; both fail closed. A person can belong to several units with a role in each; the session carries the active unit and the shell switches it.
- **Ownership inside a unit.** Reps see accounts, contacts and everything made from them whose `owner_email` is theirs or an alias; managers and Admins see the unit; Viewers see aggregates only. Enforced in row-level security (`app_owns()`) and in the services.
- **Lead to unit.** An upload belongs to the unit chosen when it is uploaded. Routing rules (country, vertical, tier) fill a missing owner and suggest a target unit at hand-off; a manager with the role in both units can move an account to another unit, which copies its rows (corrections included) as a list there and is recorded in both units.
- **Per-unit configuration** (D-41, provisional): configuration versions, signal switches, brand pack, claims and routing rules are per unit, each seeded from version 1.

## Consequences

- Tests prove each isolation layer alone holds (database, service and HTTP level; mutation runs remove one layer at a time).
- A Client-wide view across units needs a person in every unit, or a later reporting role.
- Owner emails in the Client's files must match people or their aliases, or reps see nothing; managers see every account and add aliases.
