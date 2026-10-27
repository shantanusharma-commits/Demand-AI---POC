# DemandAI production mock

A clickable mock of the production experience: a chat-first sales workspace for reps and managers, a separate admin console, and a one-page overview with the battle card. It is a mock for discussion: the chat is scripted, the data is invented, and nothing is sent.

Open `index.html` in Chrome or Edge (double-click). Fonts need an internet connection. `legacy/` and the Next.js app are unchanged.

## Pages

| File | What it is |
|---|---|
| `index.html` | Sign in. Pick Sofia (sales rep), Pavan (sales manager) or Rajiv (admin). Links to the overview |
| `story.html` | What we're selling, as a product page: the three questions, how it works (find → score → segment → act → track → learn), the scoring engine, the three process flows, product vs. client POC, the learning loop, the battle card, the roadmap and open decisions |
| `app.html` | Sales workspace. Today is a home page: the greeting and the chat box at the top, then the brief and the to-do table, with metrics, updates and a leaderboard on the right. Every chat is one screen: Today chats and each module's own chat (Inbox, Accounts, Segments, Campaigns, Approvals, and Analytics for the manager). The screen splits, chat on the left and the view on the right, only when you expand a list, open an item or open the module. Asking from Today starts a chat session that stays under Recent chats |
| `admin/index.html` | Admin home: held records, set-up health, data freshness, the monthly learning job, the system jobs |
| `admin/integrations.html` | CRM, contact-data providers, signal sources, rep mailboxes, LinkedIn, team chat (placeholders) |
| `admin/settings.html` | ICP, closed-won mapping, who decides what, thresholds, message templates, the system jobs (overnight sweep, weekly prospect refresh, monthly learning) |
| `admin/07-…15-*.html` | The legacy prototype screens (setup, content, users, prospecting, scoring, NBA, analytics, review), copied with the admin sidebar |

## Today

The chat box comes first, under the greeting; any blocker shows on top of it. Below: the AI's brief (prospects who said yes, next best actions due today only (NBA), campaigns to create today (NBC)) and the to-do table. On the right: today's metrics against targets, the most important updates, and the weekly leaderboard. The rep sees their own accounts; the manager sees the team.

## The flow in the chat

Find prospects → save as a list → score the list → route to NBA and NBC → track the campaigns and the inbox → what the system learned. Each answer suggests the next step. Result tables come back as a card (save, download, add to campaign); expand one to open the full table beside the chat, with search and more columns.

## Accounts and lists

A list is a saved selection of accounts, so lists live in Accounts as tabs next to "All accounts". Save a list from the chat, from a result table, from a segment, or with "Save as a list" on the current view.

## Campaigns

Email and LinkedIn only. Open a campaign to see its numbers, then the accounts in it: what each person gets (email, LinkedIn or both), their current step, and Approve. The sequence sits below; Edit sequence opens the step editor. Clicking a person opens their drawer: details on the left, and Overview, Engagement, Activity and Notes on the right. Engagement shows the personalised steps and "Approve" for a draft sequence. The AI drafts the sequence; anyone can add an email or LinkedIn touch, remove, reorder, change the day, channel or format, edit the text, or rewrite a touch with AI. Sent touches are locked. Reps send drafts to the manager, who confirms.

## Segments

Micro-segments → segment (metric cards; Accounts, Activity and Replies tabs) → person panel → activity. A segment with 10 or more accounts in 7 days runs as a campaign once the manager confirms; below that, each account gets its own next best action. Sensitive segments never become campaigns.

## Content studio

"What should we write?": describe a blog or whitepaper. It's written in a canvas beside the chat. Change it by asking ("Make it shorter", "Add proof", "More formal", "Rewrite the intro", "Add a section on…") or click a paragraph to change only that one. Tone and length can be set directly. Add it to the Content library when it's right; saved pieces are under Saved content.

## Phone

The navigation becomes icons and Today stacks into one column. When a list is expanded, the view replaces the chat.

## Work is individual

A rep sees only their own accounts, campaigns, replies and numbers. The manager sees everyone's, can filter any view by rep, move accounts to another rep, and assign tasks; an assigned task appears in that rep's to-do list on Today (try it: assign as Pavan, then "Switch to Sofia"). The manager's metrics switch between Team and Mine.

## Person and reply views

Opening a person or a reply brings up a focused panel; the chat and the view behind it are blurred until you close it. Loading shows a short placeholder instead of redrawing, and the AI's steps appear one by one before the answer.

## Inbox

Replies from email and LinkedIn in one place, each with a suggested answer that runs the brand checks. When someone replies, their remaining campaign steps pause (an assumption to confirm). The manager can reassign the thread.

## Analytics (manager; the admin has its own page)

Pilot targets (meetings, reply rate, accepted first time), the funnel, each rep, each campaign, and what the system learned. Pick a rep to see only their numbers.

## Scoring and routing

"Score this list" shows the Score flow step by step (collect, qualify, weigh by tier, decay, stack into Timing, Fit × Timing) with the top account worked through; "How scoring works" in Accounts shows the same. "Route to NBA and NBC" then sends the segment that crosses the threshold to one campaign and gives every other account its own next best action.

## Roles

- **Sales rep** works their own items: approves ready actions, reviews the ones the AI wasn't sure about, logs outcomes.
- **Sales manager** sees the whole team, signs off sensitive and C-level messages, confirms campaigns, and can act on any rep's item.
- **Admin** does set-up only and never sees the sales workspace screens.

## Things to try in the chat

"Find prospects like my last 10 wins", "Score this list", "Route to NBA and NBC", "Which replies are objections?", "Where is the funnel leaking?" (manager), "Prepare the next actions", "Build the campaign", "How are the campaigns doing?", "Write a blog on planning a control system migration", "Why is Juniper ranked first?", "What should I do with Cedar?", "Make it shorter", "Use cost framing", "What worked last month?", "How is my team doing?" (manager).

## Files

- `assets/mock.css`: styles, on the design pack's tokens
- `assets/mock-data.js`: the representative data; Fit × Timing is computed with the Score flow's tier, decay and stacking rules
- `assets/app.js`: the sales workspace and the scripted chat
- `admin/admin.css`: the admin sidebar (copied from the legacy pages) and admin page styles
- `tools/build-artifact.py`: writes a copy that can be published as a claude.ai artifact (the sign-in page without its own document wrapper)
- `tools/sync-admin-pages.py`: re-copies `legacy/` into `admin/` with the admin sidebar. Run `python3 production-mock/tools/sync-admin-pages.py` after legacy changes

State (decisions, drafts, notes) is kept in the browser's session storage, so a new tab starts fresh.
