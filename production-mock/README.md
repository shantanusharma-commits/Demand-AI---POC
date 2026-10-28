# DemandAI production mock

A clickable mock of the production experience: a chat-first sales workspace for reps and managers, a separate admin console, and a one-page overview with the battle card. It is a mock for discussion: the chat is scripted, the data is invented, and nothing is sent.

Open `index.html` in Chrome or Edge (double-click). Fonts need an internet connection. `legacy/` and the Next.js app are unchanged.

## Pages

| File | What it is |
|---|---|
| `index.html` | Sign in. Pick Sofia (sales rep), Pavan (sales manager) or Rajiv (admin). Links to the product overview and the demo walkthrough |
| `story.html` | Product overview: the three questions, how it works, the scoring engine, the three process flows, product vs. client POC, the learning loop, the battle card, the roadmap and open decisions |
| `walkthrough.html` | The demo, scene by scene: what to click, what to type and what to say, in story order |
| `app.html` | Sales workspace: one continuous chat. Today on top; the left side holds anchors (Accounts, Segments, Campaigns, Approvals, Content studio) and recent chats; anything you open sits in a pane on the right |
| `admin/index.html` | Admin home: held records, set-up health, data freshness, the monthly learning job, the system jobs |
| `admin/integrations.html` | CRM, contact-data providers, signal sources, rep mailboxes, LinkedIn, team chat (placeholders) |
| `admin/settings.html` | ICP, closed-won mapping, who decides what, thresholds, message templates, the system jobs |
| `admin/07-…15-*.html` | The legacy prototype screens (setup, content, users, prospecting, scoring, NBA, analytics, review), copied with the admin sidebar |

## How it works: one continuous chat

- **Left: anchors.** Today, the views (Accounts, Segments, Campaigns, Approvals, Content studio) and recent chats. Help and the profile menu (switch user, product overview, walkthrough, sign out) sit at the top and bottom.
- **Middle: the chat.** Results come back as tiles (lists with actions). The chat box can start something new, work with any agent (prospecting, scoring, segments & NBA, campaigns, inbox, content, analytics), pick which accounts to work on, tag a task with # (it opens in its own window), add an account with @, and take dictation.
- **Right: the pane.** Expanding a tile, opening a person, a reply, a campaign or analytics opens it beside the chat, with the two headers aligned. The chat then talks about what's open ("Talking about…"). Back, full screen and close are in the pane header.
- **AI or person.** ✦ marks what the AI did on its own; a person icon marks what someone did or approved.

## Today

The chat box first. Then **What the AI did** since you last logged in, today or this week (accounts re-checked, segments updated, campaign steps sent, next best actions that went ahead, replies, meetings), with the key events. Then **your numbers** (each opens its list). Then **what it handed to you**, most urgent first; each opens in its own window.

## Objectives, notes, reminders and catch-up

Say what you want to do ("I want to work my red accounts this week") and the chat names itself after the objective and tracks progress (3 of 5). Leave notes ("Note: …") and reminders ("Remind me on Wednesday at 9 to …"). Recent chats show progress and a red ! when a reminder is due. Reopening the chat adds a catch-up tile: what the AI did meanwhile, what you did, and what's left.

## Replies and analytics, in the chat

There is no separate inbox or analytics screen. "Show me the replies I received today" brings a tile of replies; open one for the conversation and a drafted answer on the right. "Show me last week's analytics" opens the dashboard on the right; follow up with "which pipeline did the AI drive on its own?", "which accounts are hot?", "which are stuck?" and "pull the last interaction for Eastgate".

## Where each thing is tracked

Both NBC and NBA come from micro-segments: accounts grouped by the same trigger, with one message structure.

- **Campaign segments (NBC):** 10+ accounts in 7 days run as one sequence. Segments shows them first with their campaign numbers; each person's steps and delivery are in Campaigns.
- **Next best action segments (NBA):** below the threshold, every account gets its own action from the segment's message structure. Segments tracks them: actions, went ahead, waiting for approval, delivered, open and reply rates, a Prepared → Sent → Delivered → Opened → Replied bar, and each person's delivery. Opening a person shows the same steps.
- **Approvals:** only the exceptions from both: next best actions that failed a check, and campaigns waiting to be confirmed.

## Next best actions

A next best action goes ahead on its own when it passes six checks: high confidence, proven message, not sensitive, identity confirmed, not in another sequence, not picked for a spot-check. Only the ones that fail a check wait for a person, with the failed check shown. Approvals shows them, with tabs Needs you, With Pavan (manager sign-off), Went ahead and Decided; the manager also confirms campaigns there. Segments that aren't campaigns list their next best actions.

## Person panel

Send sits in the pane header; the chat beside it is the copilot. In a campaign, Engagement shows that person's sequence as a timeline: each step's day, channel, format, message and what it was built from (the signal, the message structure and the outreach practice it follows). Edit any unsent message, remove a step, add an email or LinkedIn step, or ask Copilot ("make step 1 shorter", "use cost framing", "add a LinkedIn step", "why these messages?"). Changes apply to that person only.



## Scoring and routing

Every score is out of 100: Fit (0–100) × Timing (stacked signal points as a share of 200, 0–100) ÷ 100; tiers A ≥ 40, B ≥ 20, C above 0. "Score this list" shows the Score flow step by step (collect, qualify, weigh by tier, decay, stack into Timing, Fit × Timing ÷ 100) with the top account worked through; "How scoring works" in Accounts shows the same. "Route to NBA and NBC" then sends the segment that crosses the threshold to one campaign and gives every other account its own next best action.

## Work is individual

A rep sees only their own accounts, campaigns, replies and numbers. The manager sees everyone's, can filter any view by rep, move an account to another rep from the person pane or a reply, and assign work from the chat ("Assign calling back Larkspur to Kenji"); assigned work appears in that rep's list on Today (assign as Pavan, then switch to Sofia).

## Roles

- **Sales rep** works their own items: approves ready actions, reviews the ones the AI wasn't sure about, logs outcomes.
- **Sales manager** sees the whole team, signs off sensitive and C-level messages, confirms campaigns, and can act on any rep's item.
- **Admin** does set-up only and never sees the sales workspace screens.

## Things to try in the chat

"Find prospects like my last 10 wins", "Score this list", "Route to NBA and NBC", "Which replies are objections?", "Where is the funnel leaking?" (manager), "Prepare the next actions", "Build the campaign", "How are the campaigns doing?", "Write a blog on planning a control system migration", "Why is Juniper ranked first?", "What should I do with Cedar?", "Make it shorter", "Use cost framing", "What worked last month?", "How is my team doing?" (manager), "I want to work my red accounts this week", "Show me last week's analytics", "Show me the replies I received today", "Assign calling back Larkspur to Kenji" (manager).

## Files

- `assets/mock.css`: styles, on the design pack's tokens
- `assets/mock-data.js`: the representative data; Fit × Timing is computed with the Score flow's tier, decay and stacking rules
- `assets/app.js`: the sales workspace and the scripted chat
- `admin/admin.css`: the admin sidebar (copied from the legacy pages) and admin page styles
- `tools/build-artifact.py`: writes a copy that can be published as a claude.ai artifact (the sign-in page without its own document wrapper)
- `tools/sync-admin-pages.py`: re-copies `legacy/` into `admin/` with the admin sidebar. Run `python3 production-mock/tools/sync-admin-pages.py` after legacy changes

State (decisions, drafts, notes) is kept in the browser's session storage, so a new tab starts fresh.
