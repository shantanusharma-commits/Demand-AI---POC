# DemandAI production mock

A clickable mock of the production experience: a chat-first sales workspace for reps and managers, a separate admin console, and a one-page overview with the battle card. It is a mock for discussion: the chat is scripted, the data is invented, and nothing is sent.

Open `index.html` in Chrome or Edge (double-click). Fonts need an internet connection. `legacy/` and the Next.js app are unchanged.

## Pages

| File | What it is |
|---|---|
| `index.html` | Sign in. Pick Sofia (sales rep), Pavan (sales manager) or Rajiv (admin). Links to the overview |
| `story.html` | What we're selling: scope (product vs. client POC), the three process flows, the learning loop, the battle card, the roadmap and open decisions. Prints to two pages |
| `app.html` | Sales workspace. Today: the chat in the middle, the to-do table and the most important updates beside it. Every module (Accounts, Segments, Campaigns, Approvals, Content studio) has its own chat on the left and its view on the right; the Today chat never shows inside a module. Chats on Today are sessions: New chat starts one and it stays under Recent chats |
| `admin/index.html` | Admin home: held records, set-up health, data freshness, the monthly learning job, team default runs |
| `admin/integrations.html` | CRM, contact-data providers, signal sources, rep mailboxes, LinkedIn, team chat (placeholders) |
| `admin/settings.html` | ICP, closed-won mapping, who decides what, thresholds, message templates, team default runs |
| `admin/07-…15-*.html` | The legacy prototype screens (setup, content, users, prospecting, scoring, NBA, analytics, review), copied with the admin sidebar |

## Today

Chat first. The AI's brief opens the day: prospects who said yes (fast lane), next best actions due today only (NBA), and campaigns to create today from the scored list (NBC). The panel beside it has key numbers, a to-do table and the most important updates. The rep sees their own accounts; the manager sees the team.

## The flow in the chat

Find prospects → save as a list → score the list → create micro-segments → prepare next actions (NBA) and build the campaign (NBC) → track the campaigns → what the system learned. Each answer suggests the next step. Result tables come back as a card (save, download, add to campaign); expand one to open the full table beside the chat, with search and more columns.

## Accounts and lists

A list is a saved selection of accounts, so lists live in Accounts as tabs next to "All accounts". Save a list from the chat, from a result table, from a segment, or with "Save as a list" on the current view.

## Campaigns

Email and LinkedIn only. A list of campaigns with enrollment and reply numbers; each campaign has metric cards and tabs for Enrollments, Steps, Outbox and Replies. Clicking a person opens their drawer: details on the left, and Overview, Engagement, Activity and Notes on the right. Engagement shows the personalised steps and "Approve" for a draft sequence. The AI drafts the sequence; anyone can add an email or LinkedIn touch, remove, reorder, change the day, channel or format, edit the text, or rewrite a touch with AI. Sent touches are locked. Reps send drafts to the manager, who confirms.

## Segments

Micro-segments → segment (metric cards; Accounts, Activity and Replies tabs) → person drawer → activity. A segment with 10 or more accounts in 7 days runs as a campaign once the manager confirms; below that, each account gets its own next best action. Sensitive segments never become campaigns.

## Content studio

"What should we write?": describe a blog or whitepaper. It's written in a canvas beside the chat. Change it by asking ("Make it shorter", "Add proof", "More formal", "Rewrite the intro", "Add a section on…") or click a paragraph to change only that one. Tone and length can be set directly. Add it to the Content library when it's right; saved pieces are under Saved content.

## Phone

The navigation becomes icons. Today shows the chat; a module shows its view without its chat.

## Roles

- **Sales rep** works their own items: approves ready actions, reviews the ones the AI wasn't sure about, logs outcomes.
- **Sales manager** sees the whole team, signs off sensitive and C-level messages, confirms campaigns, and can act on any rep's item.
- **Admin** does set-up only and never sees the sales workspace screens.

## Things to try in the chat

"Find prospects like my last 10 wins", "Score this list", "Create micro-segments", "Prepare the next actions", "Build the campaign", "How are the campaigns doing?", "Write a blog on planning a control system migration", "Why is Juniper ranked first?", "What should I do with Cedar?", "Make it shorter", "Use cost framing", "What worked last month?", "How is my team doing?" (manager), "Every weekday at 7am, check my accounts for new signals".

## Files

- `assets/mock.css`: styles, on the design pack's tokens
- `assets/mock-data.js`: the representative data; Fit × Timing is computed with the Score flow's tier, decay and stacking rules
- `assets/app.js`: the sales workspace and the scripted chat
- `admin/admin.css`: the admin sidebar (copied from the legacy pages) and admin page styles
- `tools/build-artifact.py`: writes a copy that can be published as a claude.ai artifact (the sign-in page without its own document wrapper)
- `tools/sync-admin-pages.py`: re-copies `legacy/` into `admin/` with the admin sidebar. Run `python3 production-mock/tools/sync-admin-pages.py` after legacy changes

State (decisions, drafts, notes) is kept in the browser's session storage, so a new tab starts fresh.
