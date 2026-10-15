# Users and roles: Replit prompt

These are the build instructions for the Users and roles screen of the DemandAI POC (`08-users.html`) and the role rules used across the app. Copy everything below the line into Replit.

**What the demo does today.** Users live in memory only, and Invite shows a toast. Edit and Deactivate are not checked by role. The prompt below closes all three gaps.

---

Build a **Users and roles** module for a B2B demand-generation app called DemandAI.

- Stack: React + TypeScript front end, Node/Express back end, Postgres.
- Look: a clean, plain UI with white cards, 8px corners, one accent colour and no gradients.
- The module also provides the **role and permission layer** every other screen uses.

**Roles** (exact names) and what each one may open:

| Role | Pages it can open | What it can do |
|---|---|---|
| Admin | All pages | Everything; the only role that can edit Setup |
| Sales manager | All pages | Sees every rep's items; approves sensitive messages; pauses segments; edits the brand pack; manages users |
| Sales rep | All except Setup and Users | Sees and decides only items they own; sends sensitive items to their manager |
| Viewer | Analytics only | Read-only |
| Platform admin | None (reserved for the hosting team) | — |

Pages: Today, Setup, Users and roles, Prospecting, Account Scoring, Micro-segments & NBA, For Review, Content library, Content studio, Analytics.

- Store this map as data (`role_permissions`), not hard-coded `if` statements.
- The nav hides pages the role can't open.
- Opening one directly shows "Not available for this role".
- The API returns 403 for the same pages and actions.
- Add a "Switch role (demo)" control in the sidebar footer for testing. Hide it behind a `DEMO_MODE` flag.

**Users and roles page**

- **Top bar:** title "Users and roles", a badge "N users", and a "+ Invite user" button. Only Admin and Sales manager see the button.
- **Filter bar:**
  - a search box that matches name, email or business unit;
  - a role select, "All roles" plus each role in use;
  - an "x of N" count.
- **Table columns:**
  - Name: avatar initials, name, email underneath.
  - Role: a tag.
  - Manager.
  - Business unit.
  - Status: a coloured dot. Active is green, Invited is amber, Deactivated is grey.
  - Last sign-in, as relative time.
- **Row click:** opens a right drawer with:
  - a Details panel: Role, Manager, Business unit, Status;
  - a Change history panel, newest first;
  - Edit and Deactivate buttons.

**Invite modal** ("Invite a user"):

- Fields:
  - Name and Email, both required;
  - Role, defaulting to Sales rep;
  - Manager, a select of users whose role is Sales manager or Admin, or "—";
  - Business unit.
- Validation: name and email are required, and the email must be valid and unique (case-insensitive).
- On save:
  - create the user with status `invited`;
  - send an invite email with a sign-in link (a stub that logs the email is fine for now);
  - toast "Invited {name}, confirmation sent to {email}";
  - add history "Invited as {role}" plus ", manager set to {manager}" when a manager is set.
- When the invited user first signs in, status becomes `active`, history adds "Accepted invite, account activated", and last sign-in updates.

**Edit modal** ("Edit user"):

- Fields: role, manager and business unit. Email is shown but can't be changed.
- On save, write one history line per change:
  - "Role changed from X to Y"
  - "Manager changed to Z"
  - "Business unit changed to W"
- A user can't change their own role.
- There must always be at least one active Admin.

**Deactivate** ("Deactivate {name}?"):

- Confirm, then set status `deactivated` and add history "Deactivated by {who}".
- Deactivated users can't sign in.
- Their past decisions and audit entries keep their name.
- Add a "Reactivate" button for deactivated users.

**Who can do what on this page:**
- Admin and Sales manager can invite, edit, deactivate and reactivate.
- A Sales manager can't create or edit Admins.
- Everyone else gets "No access".
- Enforce all of this on the API.

**Data scoping rule used by other screens:**
- A Sales rep sees only records where `owner_email` equals their email.
- A Sales manager sees their team (users whose manager is them) plus records with no owner.
- Admin sees everything.
- Expose this as a helper, `scopeFor(user)`, that returns a query filter.

**Data model:**
- `users(id, name, email unique, role, manager_id, business_unit, status invited|active|deactivated, last_sign_in_at, created_at)`
- `user_history(id, user_id, at, by_user_id, what)`
- `role_permissions(role, page, can_view, can_edit)`, seeded from the table above.

**API:**
- `GET /api/users?search=&role=`
- `POST /api/users/invite`
- `PATCH /api/users/:id`
- `POST /api/users/:id/deactivate`
- `POST /api/users/:id/reactivate`
- `GET /api/users/:id/history`
- `GET /api/me`, which returns the user, the role and the allowed pages.

**Seed data:** six users.
- One Admin and one Sales manager.
- Two Sales reps reporting to the manager, one of them Invited.
- One Viewer and one Platform admin.
- All in the business unit "Industrial Automation", with plausible history.

**Tests to include:**
1. A rep can't open Setup or Users (UI and API).
2. A rep's item list only returns their own items.
3. The last Admin can't be deactivated or demoted.
4. A duplicate email on invite is rejected.
5. Every edit writes history.
