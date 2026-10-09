# Setup (Configure) screen: build brief for Replit

This brief covers how the Setup screen works in the DemandAI POC demo (`09-setup.html` plus `demandai-engine.js`), and what to tell Replit so it rebuilds the screen as a working app. Part 1 is the context. Part 2 is a prompt you can paste straight into Replit.

---

## Part 1 · What Setup is and how we built it

### Purpose

Setup holds **one configuration for the pilot**. It has seven sections, and each one is signed off separately. The scoring engine reads this configuration on every run. Every change keeps a record of who made it, when and why.

### How the demo is built

- A static HTML page with no backend. All state lives in the browser's localStorage under `demandai_setup_v1`.
- The rules engine (`demandai-engine.js`) holds the default configuration in `CONFIG`. It also holds these Setup functions:
  - `setupStore()` and `saveSetup()` read and write the stored setup.
  - `signalsOff()` and `setSignal(type, on, by, reason)` switch signal types on and off.
  - `customSignals()`, `addSignal(def, by)` and `removeSignal(name, by)` manage the signal types a person adds.
  - `applyCustomSignals()` merges the added types into `CONFIG.signalTypes`.
  - `signalAudit(type)` returns the audit trail.
- Scoring and NBA runs save a **snapshot** of the signal set they used (`signalsOff`, `signalsCustom`). A list scored earlier is never re-scored by a later Setup change.

### Modes and roles

- **View mode**: everyone who can open the page.
- **Edit mode**: Admin only (`canEdit()`). Anyone else sees Edit disabled with "Only an admin can change the setup".
- Switching to a role that can't edit forces View mode.

### Page layout, top to bottom

1. **Top bar**: title "Setup", a badge "N of 7 signed off", a View/Edit toggle, and "Export config".
2. **Intro banner**: its text changes between View and Edit.
3. **Seven section panels**. Each shows a status badge: `Signed off` / `Draft · needs sign-off` / `Not started`. In Edit mode each has "Sign off this section" or "Reopen to edit".
4. **Edit mode only**: a panel "Config v1" showing `Active` or `N sections remaining`.

### The seven sections

| # | Section | What it shows | What Edit allows | Default status |
|---|---|---|---|---|
| 1 | Scope | Pilot product ("Process control DCS platform"), business unit, region = six pilot countries | Read-only | Signed off |
| 2 | ICP and rubric | Donut of the six weights, fit floor, rubric list with levels, knock-outs | Weight per criterion (0–100), fit-floor slider (0–100, step 5) | Needs sign-off |
| 3 | Personas | Persona chips | Add or remove a persona | Signed off |
| 4 | Signals | Signals table, search, audit trail, link to Signal monitoring | Switch a type on or off (with a reason), add a type, remove an added type | Needs sign-off |
| 5 | Actions | Action library per micro-segment; the first is marked "Usual" | Read-only ("changes go to the client as a proposal") | Needs sign-off |
| 6 | Brand | Link to the Content library | — | Signed off |
| 7 | Users | Link to Users and roles | — | Signed off |

**Sign-off rules**

- The rubric can't be signed off unless the weights total exactly 100. The message is "The weights must add up to 100% before sign-off".
- Editing personas, or adding a signal, sends a signed-off section back to "needs sign-off".

### Section 2: rubric (defaults)

| Key | Criterion | Weight | Levels |
|---|---|---|---|
| vertical | Vertical | 30 | Core (100) · Adjacent (50) · Other (0) |
| size | Company size | 20 | Above target (100) · In target (70) · Below (20) |
| site | Site profile | 20 | Suits the product (100) · Partly (50) · Unknown (30) |
| relationship | Relationship | 15 | Customer on another line (100) · Past (70) · None (40) |
| accountType | Account type | 10 | Owner-operator (100) · EPC or integrator (60) · Distributor (20) |
| contacts | Contact coverage | 5 | Buying role present (100) · Other roles (40) · None (0) |

- **Fit floor**: 50. Accounts below it are not scored.
- **Fit** = Σ (level points × weight ÷ 100), from 0 to 100.
- **Knock-outs** (shown as a list): Out of the pilot region · Pilot product already installed · Managed separately (strategic account) · No contact left after opt-outs.
- **Donut colours**, in this fixed order: `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`, `#e87ba4`, `#008300`. The centre shows the total %. Hovering a slice highlights its row in the list, and the reverse.

### Section 3: personas (defaults)

Head of Instrumentation / I&C · Automation or DCS manager · Control systems lead · Plant manager · Operations or maintenance lead · Procurement lead.

### Section 4: signals (the main part)

**Signal types**

| Signal type | Code | Weight (tier) | Strength | Full weight for (days) | Gone after (days) | Feeds micro-segment |
|---|---|---|---|---|---|---|
| Inquiry or RFQ | Y2 | 100 | 1 | 30 | 90 | Inquiry |
| Installed system near end of support | Y1 | 100 | 1 | 365 | 730 | Modernisation |
| Service contract renewal | Y1 | 60 | 1 | 90 | 180 | Service renewal |
| Capital project | Y4 | 100 | 0.8 | 90 | 365 | Project |
| Leadership change | C1c | 60 | 0.75 | 30 | 120 | Leadership |
| Webinar attended | C1w | 60 | 1 | 30 | 180 | Engagement |
| Webinar registered | C1w | 30 | 1 | 30 | 120 | Engagement |
| Content download | C1w | 60 | 1 | 30 | 180 | Engagement |
| Email clicked | C1x | 30 | 1 | 14 | 60 | Engagement |
| Installed system (current) | — | — | — | — | — | Knock-out (excludes the account) |
| Newsletter sign-up | — | — | — | — | — | Not scored (rejected as D1) |

**Signals table columns**

- **Signal**: the name, "Feeds {segment}", and strength bars. The strength label is tier × strength: 80 or more is Strong (3 bars), 45 or more is Medium (2 bars), anything lower is Light (1 bar). An added type shows an "Added" pill.
- **What comes through**: what it means, what data arrives, and one real example from the sample file.
- **From**: the source system.
- **How long it counts**: "Full weight for N days · Gone after M days".
- **Status**: `On` / `Off` (with the last audit entry under it), `Knock-out` or `Not scored`.

Rows are sorted with scored types first, then the knock-out type, then the not-scored type.

**Switching a type on or off (Edit only)**

1. Clicking the status opens a modal.
2. Switching **off** needs a reason. Quick chips offer Legal hold · Data quality issue · Source not available · Client request. With no reason, the modal shows "Say why, so the audit trail explains it."
3. Switching **on** takes an optional reason.
4. Saving writes the change and appends an audit entry `{type, on, by, reason, at}`.
5. Rows of that type are rejected with code `OFF` in **new runs only**.

**Adding a signal type (Edit only)**

The form fields are:

- Name, written exactly as in the file's `signal_type` column.
- What it means.
- What data comes through.
- Where it comes from.
- Feeds micro-segment, chosen from the segment library.
- How much it counts: Strong / Medium (default) / Light, which map to tier 100 / 60 / 30 with strength 1.
- Full weight for (days, default 30).
- Gone after (days, default 120).

Validation errors, shown in the form:

- "Give the signal a name, as it appears in the signal_type column"
- "\"{name}\" is already a signal type" (case-insensitive)
- "Pick the micro-segment it feeds"
- "Full weight needs a number of days, and \"gone after\" must be longer" (full must be above 0, and gone-after must be above full)

On save:

- The type is stored with code `C` and `custom: true`.
- An audit entry is written with `added: true` and the reason "New signal type".
- New scoring runs recognise the type; lists already scored are not changed.

**Removing an added type**: confirm, then remove it from the added and off lists, and write an audit entry with `removed: true`. Built-in types can't be removed, only switched off.

**Suggestions**: in Edit mode, signal tags that appeared in uploaded files but aren't known types are listed under "Seen in a file but not a signal type yet", each with an "Add it" button that pre-fills the form.

**Audit trail**: a collapsible table with columns When · Signal · Change (Added / Removed / Switched on / Switched off) · Who · Why, newest first.

**Link**: "Signal monitoring →" opens the Account Scoring screen on its monitoring tab.

### Section 5: action library (read-only)

| Micro-segment | Actions; the first is the usual one |
|---|---|
| Inquiry | Call to follow up on the inquiry · Route the inquiry to the sales owner |
| Modernisation | Propose a migration-path discussion · Offer a site assessment · Offer a lifecycle service review |
| Service renewal | Offer a renewal review · Route to the service owner |
| Project | Share a comparable case study and offer a technical session · Offer a reference-site visit · Offer an early design workshop |
| Leadership | Introduce Client to the new leader · Share a peer case study from their sector · Invite to a short briefing |
| Engagement | Follow up on the topic they engaged with · Invite to a related session |

### Stored data (`demandai_setup_v1`)

```json
{
  "steps":    { "rubric": "done", "signals": "review" },
  "weights":  { "vertical": 30, "size": 20, "site": 20, "relationship": 15, "accountType": 10, "contacts": 5 },
  "fitFloor": 50,
  "personas": ["Head of Instrumentation / I&C", "..."],
  "off":      ["Email clicked"],
  "custom":   [{ "name": "Trade show visit", "about": "...", "data": "...", "source": "...", "segment": "Engagement",
                 "level": "Medium", "full": 30, "zero": 120, "by": "Rajiv Nair", "at": 1760000000000 }],
  "audit":    [{ "type": "Email clicked", "on": false, "by": "Rajiv Nair", "reason": "Data quality issue", "at": 1760000000000 }]
}
```

### Known gaps in the demo to fix in the new build

1. **Weights, fit floor and personas don't reach scoring yet.** Setup saves them, but the engine still reads the defaults in `CONFIG`. In the new build, scoring must read the active configuration version.
2. "Export config" only shows a toast. Make it download the active configuration as JSON.
3. There's no real config versioning. Make "Config vN" a stored version: activating it freezes a copy, and every run records the version it used.
4. Actions are read-only. Keep it that way, or add a proposal flow.
5. The Edit role check runs in the browser only. Enforce it on the server.

---

## Part 2 · Prompt to paste into Replit

> Build a **Setup (Configure)** module for a B2B demand-generation app called DemandAI. Use React + TypeScript on the front end, Node/Express on the back end, and Postgres (Replit DB is fine for a prototype). Keep the UI clean and plain: white cards, 8px corners, one accent colour, no gradients.
>
> **What it is**: one configuration for a sales pilot, in seven sections that are each signed off separately. A scoring engine reads the active configuration on every run. Every change is audited with who, when and why.
>
> **Roles**: Admin can edit. Sales manager, Sales rep and Viewer can only view. Enforce this on the API, not just the UI. Add a "Switch role (demo)" control so I can test each role.
>
> **Page layout**:
> - Top bar: title "Setup", a badge "N of 7 signed off", a View/Edit toggle (Edit is disabled for non-admins, with a tooltip "Only an admin can change the setup"), and an "Export config" button that downloads the active config as JSON.
> - Seven stacked section panels. Each has a number, a title, a status badge ("Signed off" / "Draft · needs sign-off" / "Not started"), and in Edit mode "Sign off this section" or "Reopen to edit".
> - In Edit mode, a footer panel "Config vN": "Active" when all 7 are signed off, otherwise "N sections remaining", plus an "Activate as new version" button that freezes a copy.
>
> **Sections**:
> 1. *Scope* (read-only): pilot product, business unit, region (Singapore, Malaysia, Thailand, Philippines, Indonesia, Vietnam).
> 2. *ICP and rubric*:
>    - A donut chart of six weighted criteria, with the total % in the centre. Slice colours in order: #2a78d6, #eb6834, #1baf7a, #eda100, #e87ba4, #008300. Hovering a slice highlights its row, and the reverse.
>    - Criteria (key · label · default weight · levels):
>      - vertical · Vertical · 30 · Core 100 / Adjacent 50 / Other 0
>      - size · Company size · 20 · Above target 100 / In target 70 / Below 20
>      - site · Site profile · 20 · Suits the product 100 / Partly 50 / Unknown 30
>      - relationship · Relationship · 15 · Customer on another line 100 / Past 70 / None 40
>      - accountType · Account type · 10 · Owner-operator 100 / EPC or integrator 60 / Distributor 20
>      - contacts · Contact coverage · 5 · Buying role present 100 / Other roles 40 / None 0
>    - In Edit: a number input per weight (0–100) and a fit-floor slider (0–100, step 5, default 50).
>    - Show "✓ Adds up to 100%", or "Must be 100% to sign off" in red. Block sign-off unless the total is exactly 100.
>    - List the knock-outs: Out of the pilot region · Pilot product already installed · Managed separately (strategic account) · No contact left after opt-outs.
> 3. *Personas*: editable chips (add, remove). Defaults: Head of Instrumentation / I&C, Automation or DCS manager, Control systems lead, Plant manager, Operations or maintenance lead, Procurement lead. Any change sends a signed-off section back to review.
> 4. *Signals*. This is the main part.
>    - Seed these signal types (name · code · tier · strength · fullDays · goneAfterDays · segment):
>      - Inquiry or RFQ · Y2 · 100 · 1 · 30 · 90 · Inquiry
>      - Installed system near end of support · Y1 · 100 · 1 · 365 · 730 · Modernisation
>      - Service contract renewal · Y1 · 60 · 1 · 90 · 180 · Service renewal
>      - Capital project · Y4 · 100 · 0.8 · 90 · 365 · Project
>      - Leadership change · C1c · 60 · 0.75 · 30 · 120 · Leadership
>      - Webinar attended · C1w · 60 · 1 · 30 · 180 · Engagement
>      - Webinar registered · C1w · 30 · 1 · 30 · 120 · Engagement
>      - Content download · C1w · 60 · 1 · 30 · 180 · Engagement
>      - Email clicked · C1x · 30 · 1 · 14 · 60 · Engagement
>    - Also seed two special types: "Installed system (current)" (role knock-out) and "Newsletter sign-up" (role not-scored).
>    - Show a summary "X of Y signal types are on", a search box, and a link "Signal monitoring →".
>    - Table columns:
>      - Signal: name, "Feeds {segment}", strength bars from tier × strength (≥80 Strong, 3 bars; ≥45 Medium, 2; else Light, 1), and an "Added" pill for custom types.
>      - What comes through: meaning, data fields, one example.
>      - From: source.
>      - How long it counts: "Full weight for N days · Gone after M days".
>      - Status: On/Off toggle with the last audit line under it; "Knock-out" or "Not scored" for the special types.
>    - Sort scored types first, then knock-out, then not-scored.
>    - Toggle (Edit only): open a modal. Switching OFF requires a reason, with quick chips Legal hold / Data quality issue / Source not available / Client request; with no reason, show "Say why, so the audit trail explains it." Switching ON takes an optional reason. Save writes an audit row.
>    - "+ Add a signal" form (Edit only):
>      - Fields: name (exactly as in the file's signal_type column), what it means, what data comes through, where it comes from, feeds micro-segment (select from the six segments), how much it counts (Strong=tier 100 / Medium=60 default / Light=30, strength 1), full weight for days (default 30), gone after days (default 120).
>      - Validation errors: "Give the signal a name, as it appears in the signal_type column"; "\"{name}\" is already a signal type" (case-insensitive); "Pick the micro-segment it feeds"; "Full weight needs a number of days, and \"gone after\" must be longer" (full > 0 and gone-after > full).
>      - On save: code "C", custom = true, audit row "New signal type", and send the Signals section back to review.
>    - Remove: only custom types can be removed, after a confirm, with an audit row. Built-in types can only be switched off.
>    - Suggestions: an endpoint returns signal_type values seen in uploaded files that aren't known types. List them as "Seen in a file but not a signal type yet", each with "Add it" to pre-fill the form.
>    - A collapsible "Audit trail" table, newest first: When · Signal · Change (Added / Removed / Switched on / Switched off) · Who · Why.
> 5. *Actions* (read-only grid, the first action marked "Usual"):
>    - Inquiry: Call to follow up on the inquiry · Route the inquiry to the sales owner
>    - Modernisation: Propose a migration-path discussion · Offer a site assessment · Offer a lifecycle service review
>    - Service renewal: Offer a renewal review · Route to the service owner
>    - Project: Share a comparable case study and offer a technical session · Offer a reference-site visit · Offer an early design workshop
>    - Leadership: Introduce Client to the new leader · Share a peer case study from their sector · Invite to a short briefing
>    - Engagement: Follow up on the topic they engaged with · Invite to a related session
> 6. *Brand*: a link card to the Content library.
> 7. *Users*: a link card to Users and roles.
>
> **Data model** (Postgres):
> - `config_versions(id, version, status draft|active|archived, created_by, created_at, activated_at, payload jsonb)`. The payload holds scope, weights, fitFloor, personas, knockouts and actions.
> - `section_status(config_version_id, section, status, signed_off_by, signed_off_at)`
> - `signal_types(id, name unique case-insensitive, code, tier, strength, full_days, gone_after_days, segment, role scored|knockout|reject, is_custom, about, data, source, created_by, created_at)`
> - `signal_state(signal_type_id, is_on)`
> - `setup_audit(id, at, who, signal_type, change added|removed|on|off|weight|fit_floor|persona|signoff|reopen, reason, before jsonb, after jsonb)`
>
> **API**:
> - `GET /api/setup`
> - `PATCH /api/setup/weights`
> - `PATCH /api/setup/fit-floor`
> - `POST /api/setup/personas` and `DELETE /api/setup/personas/:name`
> - `POST /api/setup/sections/:id/signoff` and `POST /api/setup/sections/:id/reopen`
> - `POST /api/signals/:name/toggle {on, reason}`
> - `POST /api/signals` and `DELETE /api/signals/:name`
> - `GET /api/signals/suggestions`
> - `GET /api/setup/audit`
> - `POST /api/config/activate`
> - `GET /api/config/export`
>
> All writes are Admin-only and audited.
>
> **Key rule**: a scoring run must store the config version and the signal set (off list and custom list) it used. A later Setup change only affects new runs, never runs already saved. Expose `getActiveConfig()` for the scoring engine to read weights, fit floor, personas and signal types from the active version.
>
> **Scoring maths the config feeds** (for a later step; build it as a pure function with unit tests):
> - fit = Σ(levelPoints × weight / 100)
> - Accounts with fit below the fit floor are not scored.
> - signal weight = tier × strength × decay, where decay = 1 up to fullDays, then falls linearly to 0 at goneAfterDays
> - timing = signals sorted by weight descending, summed as w1 + w2/2 + w3/4 + …, then scaled ×100/200
> - score = fit × timing / 100
> - Tier A ≥ 35, B ≥ 20, else C. No live signal: Watch list.

---

## Tips for working with Replit

- Paste Part 2 as the first message. Build in this order: data model and API, then the page, then the signals table, then the forms.
- If it simplifies, ask it to keep the exact labels and error messages above; they are what reviewers have already seen.
- Test the four flows by hand:
  1. Change weights to total 95 and check sign-off is blocked.
  2. Switch a signal off with no reason and check the error.
  3. Add a duplicate signal name and check the error.
  4. Switch to the Sales rep role and check Edit is disabled.
