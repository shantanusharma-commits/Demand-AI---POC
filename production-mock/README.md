# Demand AI production mock

A clickable mock of the production experience: a chat-first sales workspace for reps and managers, a separate admin console, and a one-page overview with the battle card. It is a mock for discussion: the chat is scripted, the data is invented, and nothing is sent.

Open `index.html` in Chrome or Edge (double-click). Fonts need an internet connection. `legacy/` and the Next.js app are unchanged.

## Pages

| File | What it is |
|---|---|
| `index.html` | Sign in. Pick Sofia (sales rep), Daniel (sales manager) or Rajiv (admin). Links to the overview |
| `story.html` | What we're selling, as a product page: the three questions, how it works (find → score → segment → act → track → learn), the scoring engine, the three process flows, product vs. client POC, the learning loop, the battle card, the roadmap and open decisions |
| `app.html` | Sales workspace. Today is a chat: it opens with a catch-up of what the AI did, where you stand against target, and what needs you. Objectives are named chats with progress, reminders and notes. The person panel opens beside the chat; Analytics keeps its chat beside the dashboard. See "Changes from the 27 Oct review" below |
| `admin/index.html` | Admin home: held records, set-up health, data freshness, the monthly learning job, the system jobs |
| `admin/integrations.html` | CRM, contact-data providers, signal sources, rep mailboxes, LinkedIn, team chat (placeholders) |
| `admin/users.html` | People, roles and permissions, teams, invitations |
| `admin/chats.html` | Chat flows: what each chat runs, step by step, who decides and where it's set |
| `admin/rules.html` | Who decides what, autonomy ceiling, the six checks, thresholds, ICP, templates, change history |
| `admin/audit.html` | Audit log of everything the AI and people did |
| `admin/settings.html` | General, Appearance, Notifications, Security and access, Data and privacy, Usage |
| `admin/07-…15-*.html` | The legacy prototype screens (setup, content, users, prospecting, scoring, NBA, analytics, review), copied with the admin sidebar |

## Fixes after the 29 Oct review

1. **Prospecting follows the request.** Ask for anyone in any chat ("Find maintenance heads at refineries in Thailand", "Find marketing heads in Sydney working in tech"): the role, place and industry become the list, and the chat is named after it. Scoring, "Route to NBA and NBC", "Save the scored list", "Assign them to Kenji" (manager), "Send them" and "Send an update" all work on that list. When 10 or more accounts share a trigger, they become a new draft campaign in Campaigns; the rest get next best actions in Segments, which go ahead on their own only if they pass the six checks. The new list, segments and campaign stay after a reload. "Find prospects like my last 10 wins" still gives the seeded list.
2. **Adding a step to a person's sequence.** In a campaign, open a person, then Engagement: **+ Email step** and **+ LinkedIn step** now sit above the sequence as well as below it. The new step opens for editing and scrolls into view, and the panel no longer jumps back to the top. In the campaign itself, **Edit sequence** adds steps the same way.
3. **The score process is behind an info toggle.** "How the score is calculated" (the six steps and the worked example) is collapsed behind a small ⓘ chip wherever a score is shown. "How scoring works" in Accounts still opens it.

4. **A new step reads as a follow-up.** An email step you add is a reply to the previous email ("Re: …"), and every email step labels its subject and shows "From … · to …", instead of a subject built from the campaign name.
5. **Lists open beside Today too.** When you find or score a list from the Today chat, the list opens on the right instead of the Today board, and scoring swaps it for the scored list. Click Today in the menu to get the board back.
6. **The Analytics chat answers from the dashboard.** Ask about meetings against target, reply rate, positive replies, accepted first time, what went ahead on its own, time to a first action, pipeline, overdue items, the funnel, campaigns, or one rep ("How is Kenji doing?"). Naming a rep or "this month" moves the dashboard to match; "we" or "the team" goes back to everyone. "Where are we stuck?" still shows the problems and the fixes.
7. **Content studio formats.** PPT / PDF, Brochure, Infographic, Single image, Carousel, LinkedIn text post, Podcast and Video show as disabled "Coming soon" options; asking for one says so. Blogs and whitepapers work as before.
8. **Chat flows in the admin console.** *The process behind the chat* now starts with **Chat flows** (`admin/chats.html`): the ten flows a chat runs (find prospects, score, segment and route, next best actions, campaigns, replies and hand-off, content, objectives and catch-up, analytics, the learning loop), each with example questions, the steps the AI runs as shown in the chat, what it produces, who decides, where it's tracked and links to its settings. The menu items after it follow the same order.

## Final internal build (28 Oct)

**Sales workspace**
1. **New chat starts in the centre.** From any screen, **New chat** opens a centred composer (greeting, the composer, chats that need you, suggestions, recent chats, "See today's plan"). After the first answer, what the AI put together (a prospect list, a scored list) opens beside the chat, and the chat moves to the left. The chat keeps that view when you come back to it.
2. **Last touchpoint in the chat.** "Pull the last touchpoint" now answers in the chat: the last message (channel, when, who sent it, subject and body), what happened after it, a one-line read ("opened it, no reply yet: same channel 3 times, so change the channel"), earlier touches, and the next steps (*Draft a follow-up*, *Change the channel*, *Open the full activity*). *Draft a follow-up* writes the draft in the chat too.
3. **The menu has two states.** It is open at a fixed width, or collapsed to icons. Hovering no longer expands it.
4. **One font for the lockup.** *Zinger | Demand AI* uses the heading font from the rest of the design.

**Admin console**
5. **One shell for every admin page.** `admin-shell.js` and `admin-shell.css` give all 13 admin pages the same menu, lockup, collapse and 56px header, legacy screens included. The menu groups are Set up, Govern, The process behind the chat, and Measure.
6. **New pages:**
   - `rules.html`: who decides what, the autonomy ceiling (Manual, Assist, Autopilot per kind of work; the price row is locked), the six checks with their parameters, thresholds, ICP and knock-outs, message templates, and the change history with rollback.
   - `users.html`: people (search, change role, pause), the roles and permissions matrix, teams and territories with what happens when someone leaves, and invitations (with a working invite dialog).
   - `audit.html`: every action by the AI or a person, filterable and searchable, each stamped with the rules version it ran under.
   - `settings.html`: General (workspace, time zone, currency, send window, caps, pause everything, system jobs), Appearance (as before), Notifications (an event × channel matrix, digests, team chat), Security and access, Data and privacy (retention, do-not-contact, deletion requests, export), and Usage (seats, credits, messages, AI runs, plan).
7. **Fixes.** `08-users.html` now redirects to `users.html`. In the previous build the rename to "Demand AI" broke the scripts on the legacy admin screens; that is fixed. The admin pages no longer contain em dashes.

## Changes from the second 28 Oct walkthrough

1. **Your day: Day, Week and List.** These follow the Proposal AI build. Today's board now goes: where you stand, then while you were away, then **Your day**, which has the same filters (All, Decide, Approve, Reply, Review) in three views:
   - **Day:** a day strip, meetings with prep readiness, a goal and the decisions tied to each one, a *Now* line, and "free time · good time for these".
   - **Week:** a Mon to Fri calendar with a *Due* row, meetings with readiness bars, and *Needs you this week*.
   - **List:** *This week, in priority order*, grouped by day and numbered.
2. **Copilot can close.** The **×** in the Copilot header gives the view the full width, for example on Today or while writing a reply in Inbox, where the folder column comes back. A **Copilot** pill floats bottom left; click it to reopen.
3. **Name your chats.** **New chat** asks for a name, and the name shows in Recent chats. Click a chat's title to rename it. If you skip the name, the first message names the chat.
4. **Notes live in Copilot.** The Notes button on the board is gone; the pen in the Copilot header is where notes are added.
5. **Start something new mirrors the menu.** Each action names the place it opens: Accounts, Segments, Approvals, Campaigns, Inbox, Content studio, Analytics, or an objective.
6. **Thin borders only.** The thick left bars on callouts, the attention row in Recent chats and the person panel are now 1px borders.
7. **Lockup.** The menu header reads *logo · ZINGER | Demand AI* with a panel toggle, as in the Sales AI screens. The product name is now **Demand AI** everywhere in the UI.

## Changes from the 28 Oct walkthrough

1. **The chat is always on the left.** Today and every chat now have the same layout as the other screens: the chat on the left and a board on the right. Today's board holds the catch-up, where you stand, Needs you and the team. An objective's board holds its catch-up, its list and your notes. In the chat, the AI gives the short version.
2. **One composer everywhere.** The chat, the inbox chat and Copilot all use the same box. It has a **+** to attach a file, a **Start something new** menu with the quick actions, and a picker for what the AI is looking at (team, my accounts, an objective, or one account). The **mic** sits right next to send. The suggestion chips are trimmed to three.
3. **Talk to it.** The mic uses the browser's speech recognition: it transcribes as you speak and sends when you stop. In the inbox it adds what you say to the reply draft. If the microphone is unavailable (for example, a file opened from disk), it fills a sample question.
4. **Notes are visible.** A pen in every chat header opens the notes for that chat. You can add or remove a note there, and the count shows on the pen. "Note: …" in the chat and **Add a note** in the menu save to the same place.
5. **Attention for reps too.** Sofia's *Cedar renewal prep* chat asks for her attention: Mei Tan opened the comparison twice. Chats that need you show as orange callouts in the chat, on the board and in Recent chats.
6. **Inbox has its chat.** Inbox opens with the chat on the left, like every other screen. The folder column folds away to make room.
7. **Copilot is the chat.** In the person panel, **Copilot** points the chat on the left at that person, instead of opening a third column. In full screen, Copilot still opens inside the panel.
8. **One header height.** The menu, chat, board, module views, inbox, Analytics, the person panel and the admin console all use the same 56px top bar.
9. **Appearance in the admin console.** *Templates and settings* now has an **Appearance** tab, matching the Proposal AI settings: six themes, four colours (accent, accent dark, text, icons) with hex inputs, a live preview and a contrast check. The chosen theme applies to the sales workspace and the admin console (stored in this browser). Plum keeps today's Demand AI colours and is the default.

## Changes for the demo build (28 Oct)

1. **Collapsible menu.** The arrow next to the logo collapses the left menu to icons (it remembers your choice); hover the strip to see it in full. Badges and the attention dot stay visible when collapsed.
2. **Resizable chat.** In every split screen (a module opened beside the chat, a person panel beside the chat) drag the edge of the chat to make it wider or narrower; double-click the edge to go back to the default. The width is remembered.
3. **Every thread opens where you left off.** A dotted line, *New since you last looked*, separates what you have read from what is new, and the thread opens on that line: Today opens on the greeting, with yesterday's exchange above it; the objective chat opens on its catch-up, with the earlier messages above. With nothing new, a thread reopens at your last position. After you ask something, your question sits at the top with the answer below it.
4. **Attention stands out.** The objective that needs you is highlighted in Recent chats (orange outline, a count of what needs you, "Catch-up ready"), and Recent chats carries a *Needs you* tag.

## Demo click-through

See `DEMO.md`.

## Changes from the 27 Oct review

Applied on a copy after the design review of 27 Oct, against the six AI-native principles (start in a conversation, agents propose and people decide, few screens, work where people already work, every number has a source, every outcome teaches). The manager leads the walkthrough: sign in as Daniel.

1. **Today is a chat, not a home page.** It opens with three messages: a catch-up of what the AI did (quick filters: since you last logged in, today, this week; every number opens its list), where you stand (meetings against target first, pipeline influenced, replies, then emails sent as the activity behind it), and one "Needs you" list. The manager also gets the team card.
2. **Who did it is always visible.** Every list and the delivery row carry one marker: *On its own* (AI), *Person*, or *Needs you*. The same markers appear in Approvals, the objective list and the catch-up.
3. **Objectives are chats.** Type a goal ("Let's get our red accounts to a next step this week") and the AI names the chat for the goal, lists the accounts most urgent first, and tracks progress in the left nav (progress bar, reminder, attention dot). "Remind me…" and "Note: …" work inside the chat; coming back opens with a catch-up on that objective. Daniel has one seeded objective, *Red accounts · week of 26 Oct*.
4. **One list component.** Needs you, the objective list, autonomy and "Stuck" share the same row: avatar, what, why it needs you, marker, one action.
5. **The person panel opens beside the chat.** No blur, no scrim; the conversation stays live and scoped to that account (the composer shows the account). A full-screen button expands it.
6. **Skip asks why.** One tap from five reasons (wrong timing, not our offer, the data is wrong, already in talks, customer at risk); the reason shows on the delivery row and feeds the learning loop.
7. **Analytics answers, then acts.** The chat stays beside the dashboard. "Where are we stuck?" returns the pipeline-influenced chart plus the stuck items with a fix (change channel, move Kenji's accounts to Aisha).
8. **Autonomy is a dial.** "How much do agents do on their own?" shows Manual / Assist / Autopilot per kind of work; the manager sets it for the team, anything with a price or commitment stays manual.
9. **Inbox in the chat, hand-off from a reply.** "Pull the emails we received today" lists replies in the chat; a positive reply has *Hand to proposals*, which posts the hand-off back into Today.
10. **Composer.** Scope chip (what the AI is looking at), dictation (placeholder), and a help icon in the chat header that opens the overview and battle card.
11. **Fixes.** A skipped item no longer shows "Approved by a person"; empty cells use an en dash; persona renamed to Daniel Brooks.

Not changed: the admin console, `story.html`, the design tokens, and the separate admin sign-in. Admin pages still contain em dashes from the original build.

## Today (before the 27 Oct review)

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

A rep sees only their own accounts, campaigns, replies and numbers. The manager sees everyone's, can filter any view by rep, move accounts to another rep, and assign tasks; an assigned task appears in that rep's to-do list on Today (try it: assign as Daniel, then "Switch to Sofia"). The manager's metrics switch between Team and Mine.

## Person and reply views

Opening a person or a reply brings up a focused panel; the chat and the view behind it are blurred until you close it. Loading shows a short placeholder instead of redrawing, and the AI's steps appear one by one before the answer.

## Where each thing is tracked

Both NBC and NBA come from micro-segments: accounts grouped by the same trigger, with one message structure.

- **Campaign segments (NBC):** 10+ accounts in 7 days run as one sequence. Segments shows them first with their campaign numbers; each person's steps and delivery are in Campaigns.
- **Next best action segments (NBA):** below the threshold, every account gets its own action from the segment's message structure. Segments tracks them: actions, went ahead, waiting for approval, delivered, open and reply rates, a Prepared → Sent → Delivered → Opened → Replied bar, and each person's delivery. Opening a person shows the same steps.
- **Approvals:** only the exceptions from both: next best actions that failed a check, and campaigns waiting to be confirmed.

## Next best actions

A next best action goes ahead on its own when it passes six checks: high confidence, proven message, not sensitive, identity confirmed, not in another sequence, not picked for a spot-check. Only the ones that fail a check wait for a person, with the failed check shown. Approvals shows them, with tabs Needs you, With Daniel (manager sign-off), Went ahead and Decided; the manager also confirms campaigns there. Segments that aren't campaigns list their next best actions.

## Person panel

Send and Copilot sit under the person's name. In a campaign, Engagement shows that person's sequence as a timeline: each step's day, channel, format, message and what it was built from (the signal, the message structure and the outreach practice it follows). Edit any unsent message, remove a step, add an email or LinkedIn step, or ask Copilot ("make step 1 shorter", "use cost framing", "add a LinkedIn step", "why these messages?"). Changes apply to that person only.

## Inbox

Laid out like a mail client: folders (Inbox, Needs a reply, Positive, Objection, Meetings, Out of office, Sent, Archived) and channel filters on the left, the conversation list in the middle with unread in bold, and the reading pane on the right with the earlier message, a reply drafted by the AI that runs the brand checks, Send, Mark handled, Archive and Mark as unread. On a phone the list and the message are separate screens. When someone replies, their remaining campaign steps pause (an assumption to confirm). The manager can reassign the thread.

## Analytics (manager; the admin has its own page)

A dashboard page, not a chat. Metric cards first: meetings booked against target, reply rate, positive replies, accepted first time (G2), went ahead on their own, time to a first action (G1), pipeline influenced and overdue items, each with its trend over the last five periods and the change against the previous one. Then the funnel, each rep, each campaign, and what the system learned. Switch between this week and this month, or pick a rep to see only their numbers.

## Scoring and routing

Every score is out of 100: Fit (0–100) × Timing (stacked signal points as a share of 200, 0–100) ÷ 100; tiers A ≥ 40, B ≥ 20, C above 0. "Score this list" shows the Score flow step by step (collect, qualify, weigh by tier, decay, stack into Timing, Fit × Timing ÷ 100) with the top account worked through; "How scoring works" in Accounts shows the same. "Route to NBA and NBC" then sends the segment that crosses the threshold to one campaign and gives every other account its own next best action.

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
