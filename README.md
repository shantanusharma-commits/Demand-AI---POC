# DemandAI PoC

A clickable prototype of the DemandAI pilot: lead discovery and research (Prospecting), Account Scoring, micro-segments and Next Best Action, plus the surrounding screens. It runs entirely in the browser. Data is read from the files you upload, and saved lists and scoring runs are kept in the browser's `localStorage`. There is no backend, no login and no AI service. The two steps the spec hands to AI (classifying an unmapped industry, and wording the "why now" line) fall back to fixed rules.

The app is built with **Next.js (App Router), React and TypeScript**. It was migrated from standalone HTML pages with vanilla JavaScript; the originals are kept in `legacy/` as the reference.

> **`legacy/` is ahead of the React screens.** The HTML prototype kept changing after the migration was cut (2 Oct 2026): Content studio (`15-content-studio.html`), Copilot, the reworked Account Scoring and Micro-segments flows, and more. Open `legacy/00-today.html` in a browser to see the latest design. The React screens still show the 2 Oct version until those changes are ported.

## Running it

Requires Node.js 22 or later.

```bash
npm install
npm run dev        # http://localhost:3000 (opens on /today)
npm run build      # production build
npm start          # serve the production build
npm test           # engine tests (node --test)
npm run typecheck  # strict TypeScript, app and tests
```

## Screens

| Route | Screen | Was |
|---|---|---|
| `/today` | Today | `00-today.html` |
| `/content` | Content library | `07-content.html` |
| `/users` | Users and roles | `08-users.html` |
| `/setup` | Setup | `09-setup.html` |
| `/prospecting` | Prospecting (lead discovery and research) | `10-prospecting.html` |
| `/scoring` | Account Scoring | `11-scoring.html` |
| `/nba` | Micro-segments & Next Best Action | `12-nba.html` |
| `/analytics` | Analytics | `13-analytics.html` |
| `/review` | For Review | `14-review.html` |

`/` redirects to `/today`. Query parameters work as before: `/scoring?list=<id>`, `/nba?from=scoring&ids=…` and `/nba?openAccount=<id>`.

## Project structure

```text
app/
  layout.tsx            root layout: fonts, global CSS
  globals.css           the original stylesheet, unchanged
  <route>/page.tsx      one route per screen; sets the original page title
components/
  AppShell.tsx          sidebar, demo role switcher and role check, shared by every screen
  screens/              one client component per screen (TodayScreen, ProspectingScreen, …)
lib/
  demandai-engine.ts    the rules engine: validation, classification, knock-outs, fit, signals, tiers
  demandai-sample-data.ts  the built-in sample lead and signal files
  file-reader.ts        CSV / Excel reading (SheetJS) and sheet picking
  download.ts           file downloads (also works inside claude.ai)
  roles.ts              roles, which screens each role sees, route names
  ui.ts, sx.ts          toast, avatar helpers; inline-style helper
  nba/, prospecting/    data and helpers used by one screen only
types/
  demandai.ts           types for leads, contacts, accounts, issues, signals, scores and saved lists
public/
  demandai-logo.png
tests/
  engine.test.ts        the original golden tests for the engine
  engine-parity.test.ts proves the TypeScript engine matches legacy/demandai-engine.js
  prospecting-runs.test.ts    paging, search, sort, lazy detail and select-all on the 7,498-row file
  email-verification.test.ts  Hunter client, rate limits, key storage, reuse, bulk, effect on a list
legacy/                 the HTML/JS prototype, the latest design (see the note at the top)
test-data/              generated 7,498-row lead dataset and the Prospecting test-case workbook
```

## Email verification (Hunter.io)

Prospecting can check each lead's email with the [Hunter.io Email Verifier](https://hunter.io/api-documentation/v2#email-verifier). This is the one part of the app that runs on the server: the key never reaches the browser.

**Setup**

1. Get an API key at hunter.io. Save it in **Setup → Integrations · Email verification**, or put `HUNTER_API_KEY=...` in `.env.local` (see `.env.example`). A key saved in Setup wins over the variable.
2. Optional: set `SETTINGS_SECRET` (encrypts the saved key; without it a random secret is created in the data folder) and `DEMANDAI_DATA_DIR` (default `./.data`, git-ignored).
3. Run it as usual (`npm run dev`). In **Prospecting**, upload a file, open the Final list, and use **Verify emails** (all, or only the ticked rows) or **Verify** on one row. **Details** shows every field Hunter returned.

**How results are used**

- `valid` marks the address verified; `invalid` marks it not verified. Both change reachability, status and the "In the final list" count.
- `accept_all`, `webmail`, `disposable`, `unknown`, and any call that did not finish are **inconclusive**: the result is shown, but the contact is not changed and the address is never called valid or invalid.
- Hunter 451 (the person asked not to be processed) suppresses the contact like an opt-out.
- Results are stored per address and reused (30 days if conclusive, 1 day if inconclusive) so a re-upload does not spend credits. "Re-check stored results" forces a new call.
- A saved list keeps each contact's result.

**Limits and errors.** One shared limiter keeps calls under Hunter's 10 per second and 300 per minute; a bulk run is paced by it and shows progress, retries (3 attempts) on rate limits, timeouts and Hunter 222/5xx, stops at once on a missing or rejected key or an exhausted plan, and can be cancelled. A 202 is polled until Hunter finishes.

| Route | Does |
|---|---|
| `GET/PUT/DELETE /api/settings/hunter` | Whether a key is set (never the key); save; remove |
| `POST /api/email-verification` | `{ email, refresh? }` → one result, reused when stored |
| `POST /api/email-verification/stored` | `{ emails }` → stored results, no Hunter call |

The routes have no login (the app has none yet): put it behind your own access control before exposing it, since anyone who can reach it can replace the key and spend credits. Needs a long-lived Node server (`next start`), not a serverless host with a read-only disk.

## Large lead files

A lead file is screened on the server and stays there; the browser only ever holds one page of it. A 7,498-row file is screened in about a quarter of a second, and "View the list" shows the first rows in about 0.2 s, with 16 table rows in the page and no long tasks (measured in headless Chrome).

- **Paging.** 25, 50 or 100 rows per request (default 50, never more than 200). Selection is kept across pages as row numbers; "Select all matching" reaches past the page on screen.
- **Virtualized rendering.** Only the rows in view, plus a buffer, are in the page. Row heights are measured, not assumed.
- **Lazy detail.** A list row carries only what the table shows. Click a name for the full record (account, knock-outs, every issue, the whole Hunter.io result with its sources); that is fetched when the row is opened.
- **Server-side search, filter and sort.** All applied to every row on the server; click a column heading to sort (ascending, descending, off). Empty values sort last.
- **Where it lives.** A run is held in memory (the last four) and on disk under `DEMANDAI_DATA_DIR/runs` for a day, so a restart does not lose an upload. This is an in-process index, not a database: put the same functions in front of one when you outgrow a single server. If a run is gone, the screen says so and offers the upload again.

| Route | Does |
|---|---|
| `POST /api/prospecting/runs` | A file (multipart `file`) or `{ sample: true }` → screen it, answer with a summary (counts, the 12 steps) |
| `GET /api/prospecting/runs/[id]/contacts` | `?offset&limit&q&filter&sort&dir` → one page of the Final list |
| `GET /api/prospecting/runs/[id]/contacts/[row]` | The full record behind one row |
| `GET /api/prospecting/runs/[id]/contact-rows` | `?q&filter` → row numbers of every matching contact (select all) |
| `GET /api/prospecting/runs/[id]/accounts` | One page of the Accounts tab |
| `POST /api/prospecting/runs/[id]/emails`, `/verifications` | Addresses to verify; bring stored Hunter results into the run |
| `POST /api/prospecting/runs/[id]/export` | The whole list, or the selection, as a saved list stores it |

**Known limit.** Saving a list still writes every contact into browser storage (`demandai_lists_v1`), which Scoring reads. Browsers cap that at about 5 MB, so a list of several thousand contacts cannot be saved there ("This browser blocks storage"). Moving saved lists to the server, with Scoring reading them from there, removes the cap.

## Storage keys

These are unchanged from the original pages, so existing browser data still loads.

| Key | Holds |
|---|---|
| `demandai_lists_v1` | Saved prospect lists (Prospecting → Scoring) |
| `demandai_scorings_v1` | Saved scoring runs |
| `demandai_nba_v1` | Prospects sent from Scoring to Next Best Action |
| `demandai_role` | The demo role picked in the sidebar |

## Notes on the migration

- **Like for like.** The UI, wording, workflows and rules are unchanged. Each screen was compared with its original in Chromium, with screenshots and visible text, across its states and interactions, and they match.
- **Original quirks kept.** Known quirks of the original pages were kept rather than fixed: for example, the Next Best Action Copy buttons do nothing, as in the original. They are listed in the pull request.
- **`legacy/` can be removed** once the React screens have caught up with it and the team is happy with the migration. When it goes, delete `tests/engine-parity.test.ts` with it.
