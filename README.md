# DemandAI PoC

A clickable prototype of the DemandAI pilot: lead discovery and research (Prospecting), Account Scoring, micro-segments and Next Best Action, plus the surrounding screens. It runs entirely in the browser. Data is read from the files you upload, and saved lists and scoring runs are kept in the browser's `localStorage`. There is no backend, no login and no AI service. The two steps the spec hands to AI (classifying an unmapped industry, and wording the "why now" line) fall back to fixed rules.

The app is built with **Next.js (App Router), React and TypeScript**. It was migrated from standalone HTML pages with vanilla JavaScript; the originals are kept in `legacy/` as the reference.

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
legacy/                 the original HTML/JS pages, the reference for the migration
test-data/              generated 7,498-row lead dataset and the Prospecting test-case workbook
```

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
- **`legacy/` can be removed** once the team is happy with the migration. When it goes, delete `tests/engine-parity.test.ts` with it.
