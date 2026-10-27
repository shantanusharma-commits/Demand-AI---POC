# Links A: Unify use cases and customers, kōdlo, Monaco memory, Reevo Foundation and Sell

Research date: 27 October 2026. All figures on vendor pages are vendor claims unless marked otherwise. Unify use-case pages all carry the label "Sample accounts and numbers, for illustration", so numbers on those pages are illustrative examples, not results.

Coverage: the Unify use-case index ([use cases](https://www.unifygtm.com/use-cases)) and all 78 use-case pages it links to were read. The first three and the 38 pages from "Find a warm introduction" onward were read as full page text; 37 pages in the middle of the list (local-business list through "Catch dormant pipeline heating up") were read through a structured extraction of each page's prompt, steps, data sources, signals, industry notes and FAQ, because Firecrawl credits were running low. All 16 Unify customer stories were read in full. kōdlo (2 pages), Monaco (1 post) and Reevo (2 pages) were read in full. No customer stories are linked from either Reevo page.

---

## Page notes

### 1. Unify: Use cases hub
URL: https://www.unifygtm.com/use-cases

**What it says.** A library of 78 "workflows", each a worked chat conversation with Unify's agent, filterable by role (SDR/BDR, AE, sales manager, VP Sales/CRO, enablement, RevOps, marketing, AM/CS) and by industry. Groups: Start here (3), Prospecting and research (11), Signals and intent (15), Product-led growth (5), Customer expansion and health (8), Relationships and reactivation (5), Outreach and meetings (5), Events and inbound activation (8), Pipeline intelligence and coaching (12), Operations and data (6). Each page has: the conversation, a "with and without Unify" table, a starting prompt with an "Open in Unify" deep link, follow-up prompts, "How it changes by who you sell to" (industry variants, including manufacturing on most pages), setup connections and an FAQ. Data block: "40+ data connections. One conversation." Included data: Ocean.io, Dealroom, OpenMart, ContactOut, Prospeo, Findymail, Forager, FullEnrich, Wiza (companies and contacts); BuiltWith, TheirStack, BuyerCaddy, PredictLeads (tools and hiring); Harmonic, Exa, Infinity Signal (funding, news, custom); Unify Intent (website visitors); SE Ranking, Serpstat, Adyntel, Upriver, Store Leads, Autobound, The Swarm (marketing, ads, network). Customer-connected: Salesforce, HubSpot, Gmail, Outlook, Segment, PostHog, Google Tag Manager, 6sense, Demandbase, Clearbit, G2, Slack, Snowflake or ClickHouse via Fivetran, Hightouch or the Unify API, CSV ([use cases](https://www.unifygtm.com/use-cases)).

**The common mechanism (repeated on almost every page).**
1. Start from a trigger set: a signal (hiring, funding, new leader, launch, web visit, research intent, competitor adoption), an uploaded list (webinar, booth scans, partner list) or the CRM (closed-lost, not-now replies, old inbound).
2. Resolve every row to a company by domain, merge duplicates, resolve subsidiaries and aliases; hold unresolved rows "with the reason. Nothing was guessed" ([webinar CSV](https://www.unifygtm.com/use-cases/turn-a-messy-webinar-csv-into-pipeline)).
3. Check the CRM first: customers, open opportunities and owned accounts are removed from outreach and routed to their owner.
4. Score against the ICP and personas, and keep "observed facts" separate from "interpretation" ([outgrowing setup](https://www.unifygtm.com/use-cases/find-companies-outgrowing-their-setup)).
5. Find the right person (often not the person who triggered the signal) through a contact waterfall; write only verified values.
6. Draft an opener that names one checkable fact and asks one question; hold drafts for human approval.
7. Save as a recurring play (daily, Monday, evening build, monthly) with exceptions routed to a manager.

**Notable plays for new-logo acquisition (step by step where the page gives it).**
- *Reopen closed-lost when something changes* ([page](https://www.unifygtm.com/use-cases/reopen-closed-lost-with-a-change)): read closed-lost opportunities from the last 18 months with loss reason and notes; match website visitors in the last 14 days; check funding, new leader, sales hiring and tooling change since the loss; "Kept a change only where it touches the loss reason"; name who to re-engage; draft for the original owner; weekly Monday watch. Example: 46 lost deals, 4 worth reopening.
- *Stack four signals* ([page](https://www.unifygtm.com/use-cases/stack-four-signals-on-one-account)): RevOps hiring in last 45 days (1,240 accounts), plus competitor tooling with install dates (410), plus funding in last six months (168), plus G2 category research in last 30 days (34). Page claim: "Unify's research puts reply rates roughly twice as high when four or more signals stack on one account."
- *Find which signals create meetings* ([page](https://www.unifygtm.com/use-cases/find-which-signals-create-meetings)): traces each meeting to the signal or combination that started the outreach and ranks by meetings per 100 contacted. Illustrative: new leader plus hiring 11.2; leadership change alone 8.1; funding 5.6; hiring alone 3.9; website intent alone 1.9; website intent plus another signal 6.2. Median days from signal to meeting: leadership change 9, leader plus hiring 11, hiring 16, funding 20. Signals with under 100 contacted are not ranked.
- *Find what drives outbound pipeline* ([page](https://www.unifygtm.com/use-cases/find-what-drives-outbound-pipeline)): every outbound opportunity traced to its sequence enrolment and reply, then broken down by signal, persona, segment, channel and rep, "with deal count beside value". Illustrative: email reply then a call within two days produced $1.5m from 33 deals versus $700k for email only; website intent alone, 1,100 contacted, one opportunity. Resulting rule change: "The website-visitor play now requires a second signal."
- *Find which segments are working* ([page](https://www.unifygtm.com/use-cases/find-which-segments-are-working)): segments built from company data (industry, employee band, BuiltWith stack, region), not CRM picklists; ranked by meetings per 100 contacted relative to share of activity.
- *Build tomorrow's books* ([page](https://www.unifygtm.com/use-cases/build-tomorrows-books)): every evening at six, score accounts on ICP fit, signals from last 14 days and CRM history; keep accounts touched in 30 days with the same rep; split the rest by per-rep capacity; verified contact and one-line reason; territory-line and double-touch conflicts go to the manager.
- *Pre-conference campaign* ([page](https://www.unifygtm.com/use-cases/run-a-pre-conference-campaign)): attendee list, drop vendors/agencies/press, verified email and direct number (ContactOut, Wiza), rank by fit then CRM history; Day 14 email naming their talk, launch or hire and asking for 15 minutes at a fixed time; Day 7 call; Day 3 reminder; booth calendar.
- *Find problem-aware accounts* ([page](https://www.unifygtm.com/use-cases/find-problem-aware-accounts)): "Infinity Signal", Unify's research agent, builds a research plan from a plain-language problem description, searches job boards, posts, forums, reviews and news, attaches its reasoning to each match, learns from dismissed matches and keeps watching.
- *Measure TAM coverage* ([page](https://www.unifygtm.com/use-cases/measure-tam-coverage)): ICP market built as a company list, matched to CRM by domain; shares in CRM, in pipeline, worked in 12 months, never touched. The illustrative thinnest segment is "Mid-market manufacturing 22% covered", with 270 of 410 untouched firms showing an operations-hiring, plant-opening or site-visit signal.

**Signals used.** See the Signals section; the hub covers hiring, funding, leadership change, launches, tooling adoption and removal, web visits by page, UTM campaign source, category and comparison research, social engagement with competitor posts, podcast and creator sponsorship, ad spend and traffic growth, ecommerce app installs, local-business new locations, public problem mentions, warm-intro paths, job changes, reply classifications, email opens, product usage, warehouse usage and billing.

**Metrics claimed.** Hub footer: sellers "build lists and write sequences 90% faster" ([customers](https://www.unifygtm.com/customers)). Page-level figures are illustrative samples, not results.

**Manufacturing-specific notes (useful for Demand AI's industrial ICP).** Unify writes an industry variant on most pages; the manufacturing ones are consistent: work at plant level, not company level; phone beats email at plant level and plant contacts "rarely live on LinkedIn"; funding is a weak signal, plant openings and operations hiring are strong; trade shows dominate; plant visitors "scan badges for the free coffee"; plants adopt competitor tools independently ([multichannel sequence](https://www.unifygtm.com/use-cases/build-a-multichannel-sequence); [prioritise attendees](https://www.unifygtm.com/use-cases/prioritize-event-attendees); [post-event](https://www.unifygtm.com/use-cases/follow-up-after-an-event-with-the-right-people); [battlecards](https://www.unifygtm.com/use-cases/keep-battlecards-current); [TAM coverage](https://www.unifygtm.com/use-cases/measure-tam-coverage)).

**Quotes for a CEO.**
- "One signal is a guess. Four pointing the same way is a reason to call today." ([stack four signals](https://www.unifygtm.com/use-cases/stack-four-signals-on-one-account))
- "Personalized does not mean mentioning the logo. It means naming something they can check." ([research into outreach](https://www.unifygtm.com/use-cases/turn-research-into-outreach))
- "A change that does not touch the loss reason is news, not a reason to reopen" ([reopen closed-lost](https://www.unifygtm.com/use-cases/reopen-closed-lost-with-a-change))
- "Phone still outperforms email at plant level, and plant contacts rarely live on LinkedIn." ([multichannel sequence](https://www.unifygtm.com/use-cases/build-a-multichannel-sequence))

Inference: the use-case library is Unify's real product spec for an agent-led motion. It sells a method (signal, CRM check, verified contact, checkable opener, human approval, attribution back to signal) more than a feature list, and it already writes manufacturing variants.

### 2. kōdlo: AI prospecting
URL: https://kodlo.ai/ai-prospecting/ (published 26 September 2026, modified 18 October 2026)

**What it says.** Positioned at "builders and small B2B SaaS teams" for whom "sales has to happen between shipping, support and everything else". Five problems: "I don't know who to write to", "I don't know what to say", "Sales happens in leftover time", "Nothing accumulates", "I'm afraid of breaking something".

**Process (six steps on the page).**
1. Describe: the agent asks questions and turns answers into an ICP; "If your audience is still broad, it helps you work through the gaps instead of guessing."
2. Find: the Discovery agent "searches the open web", explains "why each company fits, who may be worth contacting, and where the evidence came from"; companies already in the campaign are left out.
3. Review: import or skip each suggestion; "The reason each one was found stays on its timeline."
4. Research: Deep Search reads multiple sources and returns "a short report with citations".
5. Draft: Knowledge Hub product documents plus the research produce a first message "in your saved tone of voice"; the user sends it.
6. Keep going: scheduled checks ("Every Monday, check these accounts and tell me if anything changed") and follow-up tasks.

Example evidence card: a logistics platform of about 40 people; "Why it fits: B2B company, Ships a public API"; "Evidence: Company blog: Public API launch, March · Careers page: Partnerships role, 6 days ago". Example draft cites 2 public and 1 Knowledge Hub source, with a "Why this angle?" box: recent trigger, relevant signal, your proof.

**Signals used.** Public API launch, partnerships hiring (careers page), company blog posts; generally public web sources.

**Metrics claimed.** None quantified beyond "Research that used to take an hour per company takes a few minutes of reading a brief". No customers or case studies. Free plan, no credit card, no time limit.

**Quotes for a CEO.**
- "Most tools give you filters that show who matches. kōdlo gives you the reason, with links, and then carries that context into research, the first message and the follow-up, all in one workspace." ([AI prospecting](https://kodlo.ai/ai-prospecting/))
- "Research that used to take an hour per company takes a few minutes of reading a brief, and repeated checks run on a schedule while you build." ([AI prospecting](https://kodlo.ai/ai-prospecting/))
- "Review every prospect and message yourself. kōdlo sends nothing and saves nothing without your approve." [sic] ([AI prospecting](https://kodlo.ai/ai-prospecting/))

### 3. kōdlo: Sales intelligence
URL: https://kodlo.ai/sales-intelligence/ (published 26 September 2026, modified 18 October 2026)

**What it says.** Targets "sales teams at software houses and IT outsourcing firms". Defines two roads: contact databases ("sell you records") versus "Research-first" platforms that read public sources and cite every claim. Problems: everyone uses their own AI; pre-pitch research takes "About an hour per company"; nobody knows who wrote to whom; "Every offer starts from zero"; "Sales is slower than delivery".

**Process.**
1. Ask: pick Deep search, ask e.g. "what is changing at this company and where could an external dev team help?"
2. Read: "several research passes in parallel across public sources. It takes minutes, not seconds".
3. Check: numbered citations and a Sources list; gaps go in "a Limitations note instead of filling the gap".
4. Share: save as PDF or into the Knowledge Hub as searchable, citable team material.
5. Scale: "Hand the agent a list of up to 5,000 companies and it researches them one by one as a background job. It takes days, and the job picks up where it left off after any interruption."

Also: the Knowledge Hub answers from uploaded case studies and rate cards "and names the file and section it used, then builds a document or a deck in your brand"; scheduled jobs watch accounts for signals; the agent "Proposes changes, you confirm each one". A comparison table contrasts contact database, AI chat in a browser tab and kōdlo on output, sources, team sharing, own documents and CRM writes.

**Signals used.** Tech stack and platform changes (engineering blog), hiring (careers page, "three backend engineers"), announcements (press release, partner API), budget signals.

**Metrics and pricing.** No outcome metrics. Pricing on page: Free plan; Starter $49 a month for one seat; Pro $199 a month for up to three seats; "Deep search, Discovery, the Knowledge Hub and scheduled jobs are included on every plan, including Free" ([sales intelligence](https://kodlo.ai/sales-intelligence/)). This is consistent with the pricing captured in COMPETITOR_RESEARCH.md.

**Quotes for a CEO.**
- "Contact databases sell records. Research-first platforms like kōdlo read public sources and cite every claim." ([sales intelligence](https://kodlo.ai/sales-intelligence/))
- "You get fewer records and much more reason to trust each one." ([sales intelligence](https://kodlo.ai/sales-intelligence/))
- "If something could not be found, the report says so in a Limitations note instead of filling the gap." ([sales intelligence](https://kodlo.ai/sales-intelligence/))
- "Does kōdlo replace SDRs? No. It replaces the five or six tools SDRs switch between." ([sales intelligence](https://kodlo.ai/sales-intelligence/))

### 4. Monaco: How we built Monaco Memory
URL: https://www.monaco.com/blog/design-monaco-memory-for-sales-agents (published 30 September 2026; authors Mihail Eric, Prashant Mahajan, Yunshu Gao, Adam Tazi)

**What it says.** Agents writing for a salesperson need the context that person took months to learn (which problems to lead with, why a segment was dropped, personal style). Monaco Memory carries that into every agent task and updates as people use the product. It follows Monaco's earlier "system of intelligence" post.

**Mechanism.**
1. Five design principles: interpretability (people can read and edit memory), heterogeneity (learn across chat, settings and other surfaces), freshness, personalisation, ambience (learning happens in the background).
2. Two scopes: organisation memory (positioning, targeting, priorities, shared lessons; account exclusions live here) and user memory (sender identity, writing style, working preferences), split into sections with "distinct authority, such as 'tone' and 'how I work'".
3. Storage: "versioned S3-backed Markdown", readable by humans and models alike.
4. Seeding: business context, ICPs and recent meeting transcripts.
5. Updating: (a) deterministic pub-sub event triggers for business context, onboarding forms and transcripts; (b) a scheduled "reflection" job over chat transcripts that produces candidate observations, with a later consolidation step deciding what persists.
6. Consumption: memory is "an explicit context layer that we inject directly into agents", and is inspectable when evaluating agent output.
7. Use cases: the demand agent skips accounts that match the ICP but belong to "a competitor's parent company" or "a segment the team has stopped pursuing after repeated losses", and explains why; objection handling draws on positioning, the pricing floor and responses colleagues have used successfully.

**Signals used.** None external; this is about internal context (exclusions, positioning, objections, transcripts).

**Metrics claimed.** None.

**Quotes for a CEO.**
- "When an agent writes on their behalf, those details belong in its context." ([Monaco Memory](https://www.monaco.com/blog/design-monaco-memory-for-sales-agents))
- "Knowledge that once depended on a particular rep being present becomes available to future prospecting tasks." ([Monaco Memory](https://www.monaco.com/blog/design-monaco-memory-for-sales-agents))
- "When an outreach draft uses an unexpected tone, the user's tone section provides a concrete place to look." ([Monaco Memory](https://www.monaco.com/blog/design-monaco-memory-for-sales-agents))

### 5. Reevo: Foundation
URL: https://reevo.ai/products/foundation

**What it says.** "One memory layer. Context that compounds." Pitched as an AI-native CRM: "Most CRMs store what happened and never know why it mattered."

**Mechanism / features.**
1. AI-native system of record: "no manual data entry, no decay"; custom objects, relationships and rollups; field change history; automated stage gating.
2. Ask Reevo: answers about pipeline, deals or team; "Every answer cites the exact call, email, or record behind it"; deep research, scheduled prompts, Slack mentions.
3. Home feed: "what changed overnight, ranked by what matters: the deal that slipped, the reply that landed, the meeting you're walking into."
4. Human approval: "Approve, edit, or dismiss every action before it goes out" and "Hand over more as trust grows".
5. No-code workflow automation triggered on deal stage changes, email replies or calendar activity; acts in Slack and Microsoft Teams; dry-run before going live.
6. Integrations: Salesforce, HubSpot, Slack, Zoom, Google Calendar, Granola, Microsoft Teams; MCP brings Notion, Linear, Pylon and PostHog into Ask Reevo. One-click migration "in minutes, not months".

**Signals used.** Internal deal events: stage changes, email replies, calendar activity, slipped deals.

**Metrics claimed.** None. No pricing. No customer stories linked. FAQ answers were collapsed and not visible in the scrape.

**Quotes for a CEO.**
- "Most CRMs store what happened and never know why it mattered." ([Foundation](https://reevo.ai/products/foundation))
- "Approve, edit, or dismiss every action before it goes out" and "Hand over more as trust grows" ([Foundation](https://reevo.ai/products/foundation))

### 6. Reevo: Sell
URL: https://reevo.ai/products/sell

**What it says.** "Turn conversations into conversions." "You don't need more meetings. You need better outcomes." Conversation intelligence for the meeting stage.

**Mechanism.** Pre-meeting brief; automatic call recording; highlights, action items and sentiment "with citations back to the exact moment in the call"; surfaces highlights from past conversations before a meeting; automates next steps.

**Signals used.** Call content (highlights, sentiment, action items), past conversations.

**Metrics claimed.** None. No pricing. One testimonial, no linked case study: Veraal, Head of BD, RoboForce: "Reevo didn't just record my meeting" ... "it turned it into action. It provided insights, created tasks, prioritized them, and showed me how they tied back to my pipeline." ([Sell](https://reevo.ai/products/sell))

**Quotes for a CEO.**
- "You don't need more meetings. You need better outcomes." ([Sell](https://reevo.ai/products/sell))
- "I've never seen one platform connect the dots across my whole workflow like this." (Veraal, RoboForce, [Sell](https://reevo.ai/products/sell))

---

## Customer stories

### Unify (16 stories, all vendor case studies; count confirmed by a Tavily site map of /customers/ on 27 October 2026)
Index: https://www.unifygtm.com/customers. The index shows 9 cards; the "Meet more of our customers" list on each story page names 16, all read. Page 2 of the index returned the same set.

| Customer | Industry and size | Use case / play | Signals used | Metrics achieved (exact numbers and timeframe) | Short quote | URL |
|---|---|---|---|---|---|---|
| Perplexity | AI search; SF; 100+ employees; $665M funding; Salesforce | Zero-to-one outbound for Enterprise Pro, led by product marketing; PQL and MCL plays; initial email plus three timed follow-ups | Website visits (firmographic and behavioural), free and Pro product usage, marketing-campaign engagement; "25+ native signals" | $1.7M pipeline in 3 months; 75+ outbound opportunities; 26+ meetings for Enterprise Pro; PQL play 5% reply rate; some MQL plays 20% reply rate. Video title says "80+ Meetings in 3 Months" (inconsistent with 26+ on the page) | "The platform's intent triggers and touch points give us the opportunity to talk to prospects at the right time." | https://www.unifygtm.com/customers/perplexity |
| Pylon | Customer support platform for B2B; SF; 100+ employees; $51M | Orchestrated automated outbound replacing many tools; started early 2024 | CRM-enriched data, website intent, tech stack, new-hire data for AM/CS decision makers | 4.2x ROI; 3x meetings booked via outbound; 6.5K+ contacts prospected and enriched; 10 automated plays within 2 weeks; $300K new pipeline "over just a few weeks"; video title "$3M+ in Pipeline & 300% More Meetings" | "This is our go-to-market operating system" (Marty Kausas, CEO) | https://www.unifygtm.com/customers/pylon |
| Campfire | AI-first ERP (fintech); SF; 80+ employees; $103.5M | Consolidated HubSpot, Apollo and Instantly; warm outbound to web visitors and MQLs; retarget repeat openers | Website visits, campaign engagement, intent, email opens; exclusions to limit contact fatigue | 2x qualified outbound pipeline in under 5 months; 5x more efficient outbound; 8K+ prospects sequenced in 5 months; 3 tools into 1 | "95% of the thousands of leads we've nurtured with Unify are either a perfect fit for Campfire or will be down the line." | https://www.unifygtm.com/customers/campfire |
| Spellbook | Legal AI; St John's, Canada; 120+ employees; HubSpot; prior Gong Engage | 7-person BDR team moving upmarket from SMB law firms; email and phone in one workflow; managed deliverability | Website intent incl. closed-lost "Boneyard" accounts returning, blog and learning-page visitors | $2.59M pipeline and $250K closed revenue in 7 months (since February); open rates 70 to 80% vs 19 to 25% in HubSpot with the same copy; 2 hours per rep per day saved (25%) | "We had the growth, the traffic, and the signals. What we didn't have was a system that could actually help reps capitalize on it." | https://www.unifygtm.com/customers/spellbook |
| Guru | Knowledge management SaaS; Philadelphia; 101 to 250 employees; $68M+ | Moving upmarket with no SDR team; one analyst plus Unify Professional Services (on-site, weekly standups) | Web visits, new hires and champion job changes at targets, closed-lost re-engaged on monthly product releases, CEO LinkedIn engagement, content moments, vertical lookalikes of recent wins | $3.17M closed won from Unify-influenced accounts (132 opportunities, 83% first-time engagements); 109 net-new accounts closed; 200K+ emails a month at 50%+ open; 266 positive replies over 12 months; 18 demo-link opportunities in 45 days; 81 sequences and 96 plays run part-time | "We're sending over 200,000 emails a month, without a full-time SDR." | https://www.unifygtm.com/customers/guru |
| CandorIQ | HR headcount and compensation planning; SF; 20+ employees; $5.3M | Founding SDR replacing Apollo, Sales Navigator, Factors.ai, Nooks and Claude with chat-driven prospecting, copy and reporting; onboarded within 12 days | Web visitors, new hires, champion job changes (background plays) | $1.8M+ attributed pipeline; $121K closed won; 70% open rate; 3.4% reply (recent months 4.5%); bounce rate from 15% to under 2% over first six months (87% lower); 95% less time on manual tasks. Overall timeframe not stated | "Outbound felt like shooting arrows in the dark for the most part." | https://www.unifygtm.com/customers/candoriq |
| Juicebox | AI recruiting; SF; $36M; prior Koala (sunset), Apollo | PLG sign-ups to enterprise; founding BDR stood up the motion "in a couple weeks by myself"; chat-built sequences | Free-trial usage (casual vs active), Fortune 500 list cross-referenced with sign-ups, active users in large accounts, pricing and key-page visits, conference attendee lists, content downloads, UTM, social ad traffic | Nearly $3M pipeline in one month (January); 256 meetings, 92% show rate; Fortune 100 and nearly all FAANG engaged; webinar follow-up to 415 people, 20% reply, 18% positive; event CSV sequence, 80% open, 20% reply; 90% faster sequence build | "When you're trying to move upmarket, you can't afford to treat a Fortune 500 company the same as an individual sign-up." (Vicky Liu) | https://www.unifygtm.com/customers/juicebox |
| HyperComply | Security questionnaires / customer trust; Toronto; 24+ employees; $10M; Salesforce | Website-visitor plays, gift-card play for top accounts, closed-lost re-engagement | Website intent (auto-prospect Sales, Presales, RevOps titles), CRM closed-lost date (6 months after loss) | $1.6M+ pipeline in last 12 months; 40% increase in meetings; 40% of September meetings from Unify; >5K personas sequenced; F100 CISO replied within 15 to 25 minutes of sequence start | "We're not just reaching more prospects; we're reaching the right ones, faster and more effectively than ever before." | https://www.unifygtm.com/customers/hypercomply |
| Justworks | Payroll and HR; New York; 1,500+ employees; $143M; Salesforce | Warm outbound as a new demand channel on top of purchased 6sense and G2 intent | Pricing and demo page visits (check CRM, ICP titles, enrich, persona sequence); website intent with UTM filters for paid-traffic retargeting; G2 competitor comparison-page intent | 6.8x ROI, paid back in first 5 months; more than 10% of bounces prevented; 3 plays within 3 days; plays "10x easier" than 6sense plus Salesloft | "The signal is the reason why we're reaching out, and we want to reference that in the email we send." | https://www.unifygtm.com/customers/justworks |
| Innovate Energy Group | Clean-energy consulting and EPC (solar, storage); Charlotte, NC; 10+ employees; HubSpot | Fix deliverability after Google and Microsoft rule changes; AI agent researches ESG goals; strategist-led set-up | Firmographics, contact data, intent; AI agent scrapes company sites for carbon-reduction and energy-cost plans; target: manufacturing plant managers | $15M pipeline in one month; 20+ hours saved per week across reps; 8x meetings | "Unify gets us in front of multibillion-dollar companies when they're most likely to convert." (Drew Mays, CRO) | https://www.unifygtm.com/customers/innovate-energy-group |
| Navattic | Interactive demo software; New York; 35+ employees; $5.4M; Salesforce | Warm and cold outbound; Slack alerts for rep and CS moments | Qualified website visitors, new hires in ICP, closed-lost by loss reason, freemium PQLs plus account prospecting, cold ICP; competitor-discovery and pricing-page churn alerts | $100K+ direct pipeline in first 10 days; 3.9K+ people prospected in 2 months; 30+ meetings; 67% open | "It's not uncommon for us to book a meeting within hours of launching a new Play." | https://www.unifygtm.com/customers/navattic |
| Peridio | Physical AI (robotics, computer vision, industrial IoT); Nashville; 11 to 50 employees; $4M; HubSpot | Founder-led outbound made repeatable; vertical and persona plays in the CEO's voice; product growth strategist onboarding | Web and social engagement, lookalikes of customers and active prospects | $1.15M influenced and $550K direct pipeline; 1 Fortune 100 customer closed; 4,400+ people across 1,400+ companies; 58% open, 5% reply; 11.6% reply on social-follower plays. Timeframe "a short period of time" (not stated) | "We didn't need another tool that told us to do more. We needed something that helped us decide where to focus" (Kristen Van Laren) | https://www.unifygtm.com/customers/peridio |
| Quo | Business phone system, 38,000+ customers; SF; 120 employees; $56M; Salesforce | Replace Apollo, Outreach and Clearbit Reveal; first play live within a day | Website intent | 100% of outbound pipeline via Unify; 2.5x reply rate (25% of replies positive); 100+ outbound opportunities; meetings in first week; 60 hours a month saved (stat block: 25 hours per rep per month). Timeframe not stated | "It's easy to email a bunch of cold prospects, but in today's world that doesn't get positive replies or engagement." | https://www.unifygtm.com/customers/quo |
| Together AI | AI inference cloud; SF; 150+ employees; $533M; Salesforce | Enrich and engage on-platform users; live in under a week | On-platform user (product) data enriched from 10+ sources; role and size for package recommendation | 500+ high-intent contacts from first five plays (since December); 30+ hours saved across reps per month; 5 plays within days | "Before Unify, our outbound process was time consuming and resource-intensive. Now, it's fully automated" | https://www.unifygtm.com/customers/together-ai |
| Anrok | Sales-tax compliance (fintech); SF; 130+ employees; $100M+; Salesforce | Marketing first, then 2-person SDR team; gifting campaign for demos | New finance-leader hires, champion job changes, pricing and AI-resource page visits, lookalikes, AI agent identifying sales-tax exposure and free trials; funding and global expansion for personalisation | $300K+ pipeline from about 25 campaigns in first 3 months; 2 new markets; 4x faster SDR workflows vs ZoomInfo and Outreach; 20% faster campaign builds vs HubSpot | "We had the growth and the signals. What we needed was a system that helped us act on them without juggling five tools." | https://www.unifygtm.com/customers/anrok |
| Abacum | FP&A software; New York; 100 employees; $32M; Salesforce | Turn 6sense and G2 intent into automated outbound; implemented in under 2 hours, first play same day | Website visits, competitor G2 page visits | $250,000 outbound pipeline (stated as per year); 75% less prospecting time; "5x ROI" (index quote) | "Unify's automated approach was as good as our manual one, but took a fraction of the time." | https://www.unifygtm.com/customers/abacum |

Correction to COMPETITOR_RESEARCH.md: it cites Perplexity as "80+ enterprise meetings" from a blog post; the case-study page itself states "26+ meetings booked" and "75+ outbound opportunities", with "80+ Meetings" only in the embedded video title ([Perplexity](https://www.unifygtm.com/customers/perplexity)). The doc's list of nine case studies is now 16.

### Reevo
No customer stories are linked from [Foundation](https://reevo.ai/products/foundation) or [Sell](https://reevo.ai/products/sell). The only customer evidence is the RoboForce testimonial on Sell. Not published.

### Patterns across the Unify stories
- **Website intent is the default entry play, but it is rarely the whole story.** 13 of 16 stories use website visits, usually pricing or demo pages. The biggest pipeline numbers pair it with something stronger: product usage at PLG companies (Juicebox nearly $3M in a month; Perplexity $1.7M in 3 months) or a narrow, researched vertical play (Innovate Energy $15M in a month). Unify's own illustrative attribution says website intent alone converts worst, which matches ([signals to meetings](https://www.unifygtm.com/use-cases/find-which-signals-create-meetings)).
- **Product usage and owned first-party data produce the largest, fastest results.** Perplexity, Juicebox, Together AI and Navattic all mine sign-ups and active users. Inference: this advantage is mostly unavailable to an industrial seller without a self-serve product, so Demand AI's equivalent is first-party engagement (site, webinars, trade shows, RFQs).
- **People-change signals recur:** new hires in the buying team, champion job changes and new leaders appear in Pylon, Guru, CandorIQ, Navattic and Anrok. Closed-lost re-engagement appears in Guru, Spellbook, HyperComply and Navattic.
- **Typical timeframes are short and front-loaded:** first play live in hours to 3 days (Abacum, Quo, Justworks, Pylon); first pipeline in 10 days to 1 month (Navattic, Juicebox, Innovate Energy); headline results at 3 to 7 months. Several stories give no timeframe (CandorIQ, Quo, Peridio).
- **Typical customer profile:** venture-backed US software or AI companies, 20 to 250 employees (Justworks at 1,500+ is the outlier), Salesforce or HubSpot, a lean team or a single founding SDR/BDR, often moving upmarket. Only Innovate Energy (clean-energy services targeting plant managers) and Peridio (industrial IoT) are near Demand AI's industrial world, and both are tiny.
- **Tool consolidation is the second sales argument.** Most stories name the stack replaced (Apollo, Outreach, Salesloft, HubSpot sequences, Instantly, ZoomInfo, Sales Navigator, Gong Engage, Factors.ai, Koala, Clay for warm outbound). Deliverability is a hidden driver: Spellbook (19 to 25% open rising to 70 to 80%), CandorIQ (bounce 15% to under 2%), Innovate Energy.
- **Human services sit behind several big results.** Guru credits Unify Professional Services; Innovate Energy and Peridio credit a named product growth strategist; Campfire and Perplexity describe Unify setting up plays. Inference: like Monaco's forward-deployed AE, outcomes depend partly on vendor-run onboarding.
- **Metric hygiene varies.** Unify mixes "pipeline influenced", "attributed", "direct" and "closed won influenced by email activity"; ROI multiples (4.2x, 5x, 6.8x) are given without cost bases. Only Spellbook ($250K), CandorIQ ($121K), Guru ($3.17M influenced) and Peridio (one Fortune 100 logo) report revenue.

---

## Signals mentioned

Unify, use cases hub and use-case pages (base: https://www.unifygtm.com/use-cases):
- Hiring for the team you sell to (job posts, TheirStack, PredictLeads), direct vs agency postings; corporate vs plant hiring kept separate ([hiring audience](https://www.unifygtm.com/use-cases/build-an-audience-from-hiring-signals))
- Funding rounds (Harmonic, Dealroom), stated use of funds via Exa ([funding week](https://www.unifygtm.com/use-cases/reach-accounts-the-week-funding-lands))
- New executive / leadership change with start date (PredictLeads, TheirStack, Exa) ([new executive](https://www.unifygtm.com/use-cases/catch-a-new-executive-early))
- Product launches (PredictLeads) ([launches](https://www.unifygtm.com/use-cases/prospect-on-product-launches))
- Competitor tool adoption with first-seen date, tool removal (BuiltWith, BuyerCaddy, TheirStack job posts naming the tool, G2) ([competitor won](https://www.unifygtm.com/use-cases/find-accounts-your-competitor-just-won); [battlecards](https://www.unifygtm.com/use-cases/keep-battlecards-current))
- Tooling / stack changes and "strain" (help-centre growth, slower review response times, sustained open roles) ([outgrowing setup](https://www.unifygtm.com/use-cases/find-companies-outgrowing-their-setup))
- Website visits by page (pricing, docs, security, integrations, comparison), repeat visits, resolved to company (Unify Intent, Segment, PostHog) ([website visitors](https://www.unifygtm.com/use-cases/turn-website-visitors-into-outbound); [Slack alerts](https://www.unifygtm.com/use-cases/send-high-intent-website-visits-to-slack))
- Campaign traffic by UTM source, medium, campaign, term, content and referrer ([campaign traffic](https://www.unifygtm.com/use-cases/turn-campaign-traffic-into-outbound); [campaign reach](https://www.unifygtm.com/use-cases/see-which-companies-your-campaigns-reach))
- Category and comparison research intent (6sense, Demandbase, G2) ([category research](https://www.unifygtm.com/use-cases/act-on-category-research))
- Social engagement with competitor posts (likes, comments, reposts via PhantomBuster export) ([social](https://www.unifygtm.com/use-cases/turn-social-engagement-into-pipeline))
- Podcast sponsorships and creator partnerships (Upriver) ([creators](https://www.unifygtm.com/use-cases/find-brands-investing-in-creators))
- Web traffic, ad spend, search and LLM visibility growth (SE Ranking, Serpstat, Adyntel) ([scaling marketing](https://www.unifygtm.com/use-cases/find-accounts-scaling-their-marketing))
- Ecommerce revenue band, growth and new app installs (Store Leads) ([ecommerce](https://www.unifygtm.com/use-cases/find-growing-ecommerce-brands))
- Local business new location, new services, changed hours (OpenMart) ([local business](https://www.unifygtm.com/use-cases/build-a-local-business-territory-list))
- Public problem mentions in job ads, posts, forums, reviews, news (Infinity Signal) ([problem-aware](https://www.unifygtm.com/use-cases/find-problem-aware-accounts))
- Facility openings, regulatory changes, compliance hiring, practice launches, partner hires ([define ICP](https://www.unifygtm.com/use-cases/define-icp-and-first-signals))
- Lookalikes of closed-won accounts (Ocean.io, BuiltWith attributes) ([lookalike](https://www.unifygtm.com/use-cases/build-a-lookalike-list))
- Warm-intro paths: past colleagues, schools, shared investors (The Swarm) ([warm intro](https://www.unifygtm.com/use-cases/find-a-warm-introduction))
- Champion and contact job changes (ContactOut, Exa, Wiza) ([champions](https://www.unifygtm.com/use-cases/follow-champions-to-new-companies))
- Reply classifications: Bad Timing with named date, Left Job, Opt out, Positive, Willing to meet ([bad timing](https://www.unifygtm.com/use-cases/follow-up-on-bad-timing-replies); [best sequences](https://www.unifygtm.com/use-cases/find-what-your-best-sequences-do-differently))
- Repeat email opens (3+ in 30 days) ([repeat openers](https://www.unifygtm.com/use-cases/create-call-tasks-for-repeat-openers))
- Closed-lost with a change that touches the loss reason ([reopen](https://www.unifygtm.com/use-cases/reopen-closed-lost-with-a-change))
- Dormant open deals (no activity 45 days) waking up ([dormant](https://www.unifygtm.com/use-cases/catch-dormant-pipeline-heating-up))
- Old inbound leads returning, moving jobs, hiring in their department ([old inbound](https://www.unifygtm.com/use-cases/reengage-old-inbound-leads))
- Event and webinar attendance, Q&A questions asked, booth demo vs scan only, speaker slots ([webinar CSV](https://www.unifygtm.com/use-cases/turn-a-messy-webinar-csv-into-pipeline); [post-event](https://www.unifygtm.com/use-cases/follow-up-after-an-event-with-the-right-people); [pre-conference](https://www.unifygtm.com/use-cases/run-a-pre-conference-campaign))
- First-party engagement weighted by page, persona and recency; engaged but unworked accounts ([first-party audiences](https://www.unifygtm.com/use-cases/build-audiences-from-first-party-engagement); [engaged unworked](https://www.unifygtm.com/use-cases/find-engaged-accounts-sales-has-not-worked))
- Inbound form fills enriched and scored ([inbound routing](https://www.unifygtm.com/use-cases/qualify-and-route-inbound-leads))
- Product usage: sign-ups, activation step, feature use, paywall and usage-limit hits, seat growth, invites, new departments or domains ([product usage](https://www.unifygtm.com/use-cases/run-outbound-on-product-usage); [paywall](https://www.unifygtm.com/use-cases/turn-paywall-hits-into-upgrade-conversations))
- Warehouse usage, billing, activation and health tables (Snowflake, ClickHouse) ([warehouse](https://www.unifygtm.com/use-cases/turn-warehouse-data-into-account-signals))
- Stacked signals (four on one account) ([stack four](https://www.unifygtm.com/use-cases/stack-four-signals-on-one-account))

Unify, customer stories (https://www.unifygtm.com/customers):
- Tech-stack data and CRM-enriched data ([Pylon](https://www.unifygtm.com/customers/pylon))
- G2 competitor comparison-page intent; UTM paid-traffic retargeting ([Justworks](https://www.unifygtm.com/customers/justworks))
- ESG / carbon-reduction plans scraped from company websites by an AI agent ([Innovate Energy Group](https://www.unifygtm.com/customers/innovate-energy-group))
- Founder / CEO LinkedIn content engagement; monthly product releases as re-engagement trigger ([Guru](https://www.unifygtm.com/customers/guru))
- Sales-tax exposure identified by AI agent; global expansion ([Anrok](https://www.unifygtm.com/customers/anrok))
- Competitor discovery source and churn sign (customer viewing pricing) as Slack alerts ([Navattic](https://www.unifygtm.com/customers/navattic))
- Fortune 500 target list matched to free-trial sign-ups ([Juicebox](https://www.unifygtm.com/customers/juicebox))

kōdlo:
- Public API launch (company blog); partnerships hiring (careers page) ([AI prospecting](https://kodlo.ai/ai-prospecting/))
- Tech-stack migration (engineering blog); backend hiring; partner API press release; "budget signals" ([sales intelligence](https://kodlo.ai/sales-intelligence/))
- Scheduled account-watch for any change ("tell me if anything changed") ([AI prospecting](https://kodlo.ai/ai-prospecting/))

Monaco:
- Organisation memory exclusions: competitor's parent company; segments dropped after repeated losses; objections and successful responses; meeting transcripts ([Monaco Memory](https://www.monaco.com/blog/design-monaco-memory-for-sales-agents))

Reevo:
- Overnight deal changes: slipped deals, landed replies, upcoming meetings; deal stage changes, email replies, calendar activity as workflow triggers ([Foundation](https://reevo.ai/products/foundation))
- Call highlights, action items and sentiment ([Sell](https://reevo.ai/products/sell))

---

## Metrics and pricing seen

**Outcome metrics promised (vendor claims).**
- Unify: sellers "build lists and write sequences 90% faster" ([customers](https://www.unifygtm.com/customers)); "Unify's research puts reply rates roughly twice as high when four or more signals stack on one account" ([stack four signals](https://www.unifygtm.com/use-cases/stack-four-signals-on-one-account)). Customer-story metrics are in the table above.
- Unify use-case pages: all numbers are labelled "Sample accounts and numbers, for illustration". Useful benchmarks they imply (illustrative only): new leader plus hiring 11.2 meetings per 100 contacted vs website intent alone 1.9 ([signals to meetings](https://www.unifygtm.com/use-cases/find-which-signals-create-meetings)); first emails of 58 to 74 words and 3 to 4 steps outperforming 140-word, 6 to 8 step sequences ([best sequences](https://www.unifygtm.com/use-cases/find-what-your-best-sequences-do-differently)); regional dinners $4,300 pipeline per attendee vs flagship conference $1,180 ([programs](https://www.unifygtm.com/use-cases/measure-which-programs-create-pipeline)); 20-touch ceiling before a manager decides ([capacity](https://www.unifygtm.com/use-cases/find-where-rep-capacity-is-wasted)).
- kōdlo: "Research that used to take an hour per company takes a few minutes of reading a brief" ([AI prospecting](https://kodlo.ai/ai-prospecting/)); background research on "up to 5,000 companies" over days ([sales intelligence](https://kodlo.ai/sales-intelligence/)). No outcome metrics.
- Monaco Memory post: none ([Monaco Memory](https://www.monaco.com/blog/design-monaco-memory-for-sales-agents)).
- Reevo Foundation and Sell: none beyond "Get up and running in minutes" and migration "in minutes, not months" ([Foundation](https://reevo.ai/products/foundation); [Sell](https://reevo.ai/products/sell)).

**Pricing seen on these pages.**
- kōdlo: Free plan (no credit card, no time limit); Starter $49 a month, one seat; Pro $199 a month, up to three seats; Deep search, Discovery, Knowledge Hub and scheduled jobs on every plan including Free ([sales intelligence](https://kodlo.ai/sales-intelligence/)).
- Unify: not published on these pages (the use-case and customer pages link to [pricing](https://www.unifygtm.com/pricing), already captured in COMPETITOR_RESEARCH.md).
- Monaco: not published on this page.
- Reevo: not published on these pages.
