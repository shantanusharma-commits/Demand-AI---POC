# DemandAI production mock

A clickable mock of the production experience: a chat-first sales workspace for reps and managers, a separate admin console, and a one-page overview with the battle card. It is a mock for discussion: the chat is scripted, the data is invented, and nothing is sent.

Open `index.html` in Chrome or Edge (double-click). Fonts need an internet connection. `legacy/` and the Next.js app are unchanged.

## Pages

| File | What it is |
|---|---|
| `index.html` | Sign in. Pick Sofia (sales rep), Pavan (sales manager) or Rajiv (admin). Links to the overview |
| `story.html` | What we're selling: scope (product vs. client POC), the three process flows, the learning loop, the battle card, the roadmap and open decisions. Prints to two pages |
| `app.html` | Sales workspace. Tabs: Home (Today), Approvals, Accounts, Campaigns. The chat is shared by every tab: full width on Home, docked on the left elsewhere. Account records open beside the chat |
| `admin/index.html` | Admin home: held records, set-up health, data freshness, the monthly learning job, team default runs |
| `admin/integrations.html` | CRM, contact-data providers, signal sources, rep mailboxes, LinkedIn, team chat (placeholders) |
| `admin/settings.html` | ICP, closed-won mapping, who decides what, thresholds, message templates, team default runs |
| `admin/07-…15-*.html` | The legacy prototype screens (setup, content, users, prospecting, scoring, NBA, analytics, review), copied with the admin sidebar |

## Roles

- **Sales rep** works their own items: approves ready actions, reviews the ones the AI wasn't sure about, logs outcomes.
- **Sales manager** sees the whole team, signs off sensitive and C-level messages, confirms campaigns, and can act on any rep's item.
- **Admin** does set-up only and never sees the sales workspace screens.

## Things to try in the chat

"What should I do first today?", "Find refiners in Thailand like my last 3 wins", "Rank my accounts for this week", "Why is Juniper ranked first?", "Group them by trigger", "What should I do with Cedar?", "Make it shorter", "Use cost framing", "What worked last month?", "How is my team doing?" (manager), "Every weekday at 7am, check my accounts for new signals".

## Files

- `assets/mock.css`: styles, on the design pack's tokens
- `assets/mock-data.js`: the representative data; Fit × Timing is computed with the Score flow's tier, decay and stacking rules
- `assets/app.js`: the sales workspace and the scripted chat
- `admin/admin.css`: the admin sidebar (copied from the legacy pages) and admin page styles
- `tools/sync-admin-pages.py`: re-copies `legacy/` into `admin/` with the admin sidebar. Run `python3 production-mock/tools/sync-admin-pages.py` after legacy changes

State (decisions, drafts, notes) is kept in the browser's session storage, so a new tab starts fresh.
