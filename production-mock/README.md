# DemandAI production mock

A clickable mock of the production experience: a chat-first sales workspace for reps and managers, a separate admin console, and a one-page overview with the battle card. It is a mock for discussion: the chat is scripted, the data is invented, and nothing is sent.

Open `index.html` in Chrome or Edge (double-click). Fonts need an internet connection. `legacy/` and the Next.js app are unchanged.

## Pages

| File | What it is |
|---|---|
| `index.html` | Sign in. Pick Sofia (sales rep), Pavan (sales manager) or Rajiv (admin). Links to the overview |
| `story.html` | What we're selling: scope (product vs. client POC), the three process flows, the learning loop, the battle card, the roadmap and open decisions. Prints to two pages |
| `app.html` | Sales workspace. Side navigation: Today, Segments, Campaigns, Approvals, Accounts. Today is the chat, with a to-do table and the most important updates beside it; on the other views the same chat is docked on the right |
| `admin/index.html` | Admin home: held records, set-up health, data freshness, the monthly learning job, team default runs |
| `admin/integrations.html` | CRM, contact-data providers, signal sources, rep mailboxes, LinkedIn, team chat (placeholders) |
| `admin/settings.html` | ICP, closed-won mapping, who decides what, thresholds, message templates, team default runs |
| `admin/07-…15-*.html` | The legacy prototype screens (setup, content, users, prospecting, scoring, NBA, analytics, review), copied with the admin sidebar |

## Today

Chat first. The AI's brief opens the day: prospects who said yes (fast lane), next best actions due today only (NBA), and campaigns to create today from the scored list (NBC). The panel beside it has key numbers, a to-do table and the most important updates. The rep sees their own accounts; the manager sees the team.

## Segments

Micro-segments → segment → account → activity. A segment with 10 or more accounts in 7 days runs as a campaign once the manager confirms; below that, each account gets its own next best action. Sensitive segments never become campaigns.

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
- `tools/build-artifact.py`: writes a copy that can be published as a claude.ai artifact (the sign-in page without its own document wrapper)
- `tools/sync-admin-pages.py`: re-copies `legacy/` into `admin/` with the admin sidebar. Run `python3 production-mock/tools/sync-admin-pages.py` after legacy changes

State (decisions, drafts, notes) is kept in the browser's session storage, so a new tab starts fresh.
