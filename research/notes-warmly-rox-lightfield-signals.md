# Links B: selected pages, customer stories and signal catalogues

Research date: 27 October 2026. All figures on vendor sites are vendor claims unless marked otherwise. "Inference:" marks my own reasoning. "(search extract)" marks anything seen only in a search snippet.

Coverage note: all 7 Lightfield stories and all 19 Rox stories linked from the index pages were read in full. Warmly's Wall of Love (https://www.warmly.ai/p/customers/reviews) renders its story grid in JavaScript across paginated tabs; I read every story linked from page 1 plus every distinct story found by a site search of warmly.ai/p/case-studies (44 pages read in full). Duplicate slugs that point to the same customer (for example blake-wisz-2, lilly-chen-2, sam-few-2, kael-campbell-2, bharadwaj-giridhar-2, caddis-systems, inbox-pirates, maxwell-farmer, elizabeth-watts-2) were not re-read separately. Index pages 2 to 5 could not be paginated because of Firecrawl rate limits, so a small number of stories may be missing.

## Page notes

### 1. Warmly: How Context Graph works
URL: https://www.warmly.ai/p/context-graph/how-it-works

**What it says.** Context Graph is Warmly's "unified data layer", positioned as "Not a data warehouse (it's real-time, not batch)", "Not a CDP (it's purpose-built for B2B GTM)" and "Not just enrichment (it connects and activates)". The page is architecture marketing; it does not restate the signal/action/reasoning/outcome model described on the main Context Graph page (covered in COMPETITOR_RESEARCH.md).

**Mechanism, step by step.**
1. Ingest: first-, second- and third-party signals stream in continuously, normalised to a common schema, with full event history and source tracking for attribution.
2. Resolve: identity matching by IP-to-company, cookie persistence, email pixel matching, "LinkedIn data graph", CRM contact matching, and "Deterministic + probabilistic matching".
3. Enrich: firmographics, technographics, social presence, funding; contact title, seniority, email, phone, LinkedIn profile, persona classification. "Multi-vendor waterfall (best data wins)", continuous refresh, "Human-verified critical data", confidence scoring.
4. Deduplicate: domain normalisation, name matching ("Acme Inc = Acme = ACME Corp"), parent and subsidiary hierarchy, merge logic for acquisitions; contacts keyed on email, fuzzy name plus company, LinkedIn profile dedupe, and "Job change handling (same person, new company)".
5. Activate: Inbound Agent personalises chat, routes to the right rep, books meetings; TAM Agent scores intent, builds dynamic audiences, triggers outbound, syncs to LinkedIn Ads.
6. Sync: bidirectional CRM sync in real time with conflict rules and field mapping; pushes new contacts, activity timeline, intent scores and engagement events.
7. Setup: connect CRM, install pixel, configure enrichment, set sync rules, go live ("Unified Data in Days").

**Signals used.** Website visits, chat, forms, email pixel, LinkedIn data, CRM data, intent data, sales engagement data.

**Metrics claimed.** "Signals resolve in seconds, not hours"; "4.8/5 based on 200+ reviews". No outcome numbers on the page.

**Quotes worth showing a CEO.**
- "Hot signals cool quickly" and "First-responder advantage is real" (https://www.warmly.ai/p/context-graph/how-it-works)
- "We had 5 different 'versions' of the same account across tools. Context Graph unified everything" (anonymous "VP Revenue Operations, Enterprise SaaS", same URL)
- "Job change handling (same person, new company)" (same URL)

Inference: the useful idea for Demand AI is the dedupe and hierarchy layer (one account, one contact, one timeline) before any scoring, plus treating a job change as the same person moving rather than a new contact.

### 3. Rox: The Autonomous Outbound Worker Part 1, The Outbound Reward Model
URL: https://www.rox.com/articles/the-outbound-reward-model (12 October 2026; built with hiddenweights)

**What it says.** Rox trained a small (3B-scale) reward model that scores cold emails the way SDRs judge them, to give its autonomous outbound agent a dense, instant reward signal. Reply rate is unusable directly because of sparsity ("about a 1 to 2% reply rate"), delay and confounding (signal quality, persona fit, data accuracy, sender reputation, season).

**Mechanism, step by step.**
1. Collect labels for free: every time an SDR sends a draft as-is, edits it, or discards it, that is an expert label. Before-and-after edit pairs are the core training data.
2. Train with a Bradley-Terry loss so the edited version scores higher than the draft it replaced.
3. Widen coverage with synthetic edit pairs that probe the model's blind spots; choose the weight of each synthetic pair by metagradient descent against a held-out set of high-quality real edits.
4. Fold in sparse outcomes: the final objective also rewards scoring opened and replied emails higher.
5. Sanity-check behaviour: splitting a dense block into short paragraphs raised reward by 5.8; lower-casing, "Hey" instead of "Hi", and a generic company-bragging paragraph all lowered it.
6. Use it at send time: best-of-N generation (draft N emails, score all, send the top one). Ten drafts capture most of the gain.

**Signals used.** SDR edit behaviour (send, edit, discard), opens, replies. The email prompt includes a contact and an "outreach reason" (example: a $38M Series B and six new SDR roles).

**Metrics claimed (vendor claim).**
- Agrees with SDR edits 80% of the time on 717 held-out edits; GPT-5.6-luna 38%, Claude Sonnet 4.6 45%.
- Top 20% of emails by the model get 1.75x the average reply rate (GPT 1.33x, Claude 1.23x). Evaluated on 33,933 held-out sends with 510 replies.
- Each standard deviation of reward raises reply odds 1.77x (1.53x for the edits-only model).
- About 0.37 seconds and $0.06 per 1,000 emails versus 1.9 to 2.2 seconds and $0.27 to $1.77 for the LLM judges.
- Projected (not measured) reply rate: random draft about 0.7%, best of 100 about 1.5%.

**Quotes worth showing a CEO.**
- "An SDR who edits your email is telling you, character by character, what was wrong with it."
- "optimize for open rate, and the agent learns to write clickbait subject lines."
- "It agrees with real SDR edits 80% of the time, where GPT and Claude score below 50%"
(all https://www.rox.com/articles/the-outbound-reward-model)

Inference: Demand AI already captures reviewer edits to drafts; storing each before/after pair is the cheapest path to a house style scorer, even before training anything (for example, use the pairs as few-shot examples for a judge).

### a. Lightfield: warm outbound via the team's LinkedIn graph, and the self-updating CRM

URLs: https://lightfield.com/product/ai-pipeline-generation ; https://lightfield.com/ ; https://lightfield.com/blog/monaco-vs-lightfield ; https://lightfield.com/blog/designing-for-outbound-that-compounds-on-itself ; https://lightfield.com/customers/thrad

**What it says about warm intros.** Pipeline Generation (a managed outbound service on the Lightfield CRM) lists "Warm paths surfaced automatically: Your team's LinkedIn connection graph is mapped to target accounts. Warm intro paths surface where they exist for the prospects most worth pursuing." Each account is scored "on fit, timing, and connection strength using hiring, funding, tech stack, and investor signals", and for each account Lightfield will "cross-reference your team's network for warm intros, and route contacts to the right sequence" (https://lightfield.com/product/ai-pipeline-generation). The Monaco comparison says Lightfield starts with "The champion who changed jobs. The account ready to expand. The warm intro sitting two calls back" and ranks net-new accounts "on fit, timing, and connection strength" (https://lightfield.com/blog/monaco-vs-lightfield). The home page shows an example sequence: Step 1 LinkedIn connection request, Step 2 "Mutual connection intro" after 3 days, Step 3 case study follow-up, Step 4 breakup (https://lightfield.com/).

**Mechanism, as far as published.**
1. Connect LinkedIn alongside email, calendar and Slack ("Connect email, calendar, Slack, LinkedIn, and your other systems in minutes", https://lightfield.com/). LinkedIn sync is listed as beta on the Growth plan (pricing, per COMPETITOR_RESEARCH.md, https://lightfield.com/pricing). Thrad used LinkedIn "through a custom integration" (https://lightfield.com/customers/thrad).
2. Map the team's connections to target accounts and compute "connection strength" as one of three scoring axes (fit, timing, connection strength).
3. Surface warm paths for the highest-priority prospects and add a mutual-connection intro step into the sequence.
4. Also mine the CRM's own history for warm paths: prior champions who moved, expansion-ready accounts, intros mentioned on earlier calls.
- How mutual connections are found (whose connections are imported, whether second-degree paths are computed, how strength is measured): Not published. A search found no help-centre documentation (search extract, https://www.stackai.com/integrations/lightfield-crm says it is used "to surface warm paths into target accounts", third-party).

**Self-updating ("dynamic") CRM.**
1. Capture: "Lightfield captures every customer interaction and keeps the record structured automatically" from email, calendar, Slack, LinkedIn and call recordings; backfills "months of history in about an hour" (https://lightfield.com/ ; https://lightfield.com/blog/monaco-vs-lightfield).
2. Model: custom objects and relationships, plus "A temporal context graph connects every interaction and preserves how your data changes over time"; every change is snapshotted (same URLs).
3. Update: the agent populates fields from conversations (for example GPU SKU, GPU count and start date at SF Compute, https://lightfield.com/customers/sf-compute; forecast stage and amount at Agree, https://lightfield.com/customers/agree).
4. Signals on accounts: chips for executive hire, headcount growth, contact job change, tech stack change, new funding round, with a score per account (https://lightfield.com/).
5. Act: weekly lookalike discovery adds accounts; outbound agent drafts emails for review; Deal Review skill returns "one next step, never a list" (https://lightfield.com/).
6. Compound: "Historical sequence funnel data associated with their goals, audiences, and messaging get stored directly in your CRM knowledge base" (https://lightfield.com/blog/designing-for-outbound-that-compounds-on-itself).

**Metrics claimed.** Pipeline Generation: "Setup takes a few weeks... Results take 4 to 6 weeks of live sending" (https://lightfield.com/product/ai-pipeline-generation). No warm-intro conversion figures published.

**Quotes worth showing a CEO.**
- "Your team's LinkedIn connection graph is mapped to target accounts. Warm intro paths surface where they exist for the prospects most worth pursuing." (https://lightfield.com/product/ai-pipeline-generation)
- "Agencies optimize for meetings booked... Lightfield optimizes for pipeline most likely to convert to revenue." (same URL)
- "Once you have customers telling you why they buy, a database of everyone else is a step backward." (https://lightfield.com/blog/monaco-vs-lightfield)
- "I don't have time to be on Lightfield every day and just update it or clean it up, but it does a very good job at doing that itself." (Thrad, https://lightfield.com/customers/thrad)

### b. Nooks: signals catalogue, including competitor renewal

URLs: https://www.nooks.ai/signals-intelligence ; https://www.nooks.ai/pricing ; https://support.nooks.ai/articles/8913542083-configuring-competitors-in-nooks ; https://www.nooks.ai/blog-posts/june-product-release-auto-enrich-numbers-frequently-used-dispositions-competitor-renewal-signal ; https://www.nooks.ai/blog-posts/how-to-generate-your-own-signals-to-create-an-outbound-engine

**What it says.** Signals and Intelligence offers "100+ Pre-built Signals", "Signals from CRM, Calls, and more", a "Custom Signal Builder" and "Intent Scoring" (https://www.nooks.ai/pricing). Nooks "analyzes web activity, CRM data, and call transcripts to surface critical events" (https://www.nooks.ai/signals-intelligence). The full list of 100+ signals is Not published; the named ones are in the catalogue below.

**Competitor renewal mechanism.**
1. Admin adds up to 30 competitors in Settings (Dialer > Competitors). Nooks then tags any recorded call where a competitor is named, retroactively scanning old calls, and improves transcription of those names (https://support.nooks.ai/articles/8913542083-configuring-competitors-in-nooks).
2. The "Competitor Renewal Signal analyzes past call recordings to find when a prospect mentioned their contract end date, then prompts your team to reach out at the perfect time" (June 2025 release, https://www.nooks.ai/blog-posts/june-product-release-auto-enrich-numbers-frequently-used-dispositions-competitor-renewal-signal).
3. With the Competitors data source enabled, agentic signals such as "Upcoming Renewal with Competitor" or "Uses Competitor" look across job descriptions, Nooks calls, Gong transcripts and CRM data for competitor mentions (support article above).
4. Plays can trigger on these signals, enrolling contacts into a sequence with AI email steps that use battlecard content; email agents focus on one competitor per email (support article above).
5. Marketing page framing: "Identify when a prospect's contract with a competitor is expiring so you can step in with a better offer before they auto-renew" (https://www.nooks.ai/signals-intelligence).
- Limits: competitor tags cannot be exported to CRM; no competitor-mention report exists; tags fire whether rep or prospect says the name (support article).

**Other mechanism points.** Dynamic lists that refresh as signals change; "Nooks uses the outcome of every call (pickups, objections, and bookings) to retrain your scoring model" (https://www.nooks.ai/signals-intelligence). The CPO argues first-party "active" signals from your own outbound beat third-party ones: transcripts contain "follow-up in December" or "contact my VP" or "we're using your competitor" (https://www.nooks.ai/blog-posts/how-to-generate-your-own-signals-to-create-an-outbound-engine).

**Metrics claimed (vendor claim).** Signals users "2x more pipeline, 4x faster prospecting, 3x more meetings"; "50% less time spent prospecting"; Job Changes play "3x higher conversion on warm leads"; Company News play "2x higher reply rates"; Inbound play "5-minute speed to lead" (https://www.nooks.ai/signals-intelligence). Modern Health 50% more meetings and 60% of pipeline from AI prospecting; Pendo one in three meetings from signals (https://www.nooks.ai/blog-posts/how-to-generate-your-own-signals-to-create-an-outbound-engine ; https://www.nooks.ai/signals-intelligence).

**Quotes worth showing a CEO.**
- "Our Competitor Renewal Signal analyzes past call recordings to find when a prospect mentioned their contract end date, then prompts your team to reach out at the perfect time." (June 2025 release URL above)
- "Third-party signals... are useful, but every team has access to them, so they can't set your outreach apart." (Rohan Suri, CPO, signals blog URL above)
- "We've uncovered signals that ended up being our best ones ever just by replicating what our best reps were already researching manually." (Pendo, https://www.nooks.ai/signals-intelligence)

### c. Common Room: signals, especially LinkedIn and person-level

URLs: https://www.commonroom.io/resources/signals/ ; https://www.commonroom.io/docs/signals/community-and-social-integrations/linkedin/ ; https://www.commonroom.io/docs/signals/common-room-native-signals/chrome-extension/ ; https://www.commonroom.io/docs/signals/common-room-native-signals/job-changes/ ; https://www.commonroom.io/docs/signals/common-room-native-signals/default-contact-signals/

**What it says.** Common Room publishes "100+ guides" to go-to-market signals, each tagged by source (Website, Product, Social, CRM, Community, Forum, Open-source, News and events, Dark funnel, Email, Custom) and intent level (High, Medium, Low) (https://www.commonroom.io/resources/signals/).

**LinkedIn mechanism (what is and is not covered).**
1. Company page integration (all plans): connect your LinkedIn company page as a super or content admin via LinkedIn's official API. Common Room creates a Contact for everyone who interacts and an Activity for each post, comment, reaction and mention; imports the last 30 days, then syncs new content within about 30 minutes. Ads from the company page are ingested; thought leader ads are not (https://www.commonroom.io/docs/signals/community-and-social-integrations/linkedin/).
2. Limits: "connecting personal LinkedIn profiles is not currently supported"; company followers cannot be imported "due to API limitations"; re-shares are not tracked; some members appear as "Anonymous LinkedIn Member" (same URL).
3. Chrome extension (all plans): shows Person360 context in a side pane on any LinkedIn profile, Salesforce or HubSpot record, and lets a rep "Add and enrich contact" from any LinkedIn profile manually (https://www.commonroom.io/docs/signals/common-room-native-signals/chrome-extension/). The page metadata says it can add "contacts, posts, comments, and reactions directly into Common Room from anywhere on LinkedIn" (same URL). A playbook to add everyone who reacted to or commented on any LinkedIn post (search extract, https://commonroom.io/playbooks/prospect-from-any-linkedin-post) now redirects to the playbook index.
4. Job changes (all plans): a "Job change" contact signal within a time range, combined with a "Previous org" filter (for example, previous org was a customer). "Currently, this info comes from LinkedIn." (https://www.commonroom.io/docs/signals/common-room-native-signals/job-changes/)
5. Person-level resolution: Person360 merges each person's activity across sources into one Contact (background, COMPETITOR_RESEARCH.md). Default contact signals include Title, Role, Location, Impact Points, Activity Level percentile, First/Last Active, Job Change, Has Primary Email, Has Phone Number (https://www.commonroom.io/docs/signals/common-room-native-signals/default-contact-signals/).

**Metrics claimed.** None on these pages.

**Quotes worth showing a CEO.**
- "We create a profile for everyone who interacts with you on LinkedIn and an Activity for each post, reply, or comment." (LinkedIn docs URL)
- "Customer/champion job change: When a product buyer or user switches organizations." High intent. (https://www.commonroom.io/resources/signals/)
- "Upcoming renewal with competitor: When a company decides to double down or break free." Medium intent. (same URL)

Inference: Common Room's person-level LinkedIn coverage is narrower than its marketing suggests. Automatic capture is limited to your own company page; anything on personal profiles or other people's posts needs a rep to click in the Chrome extension.

## Customer stories

### Warmly
URL root: https://www.warmly.ai/p/case-studies/ (index https://www.warmly.ai/p/customers/reviews). All metrics are vendor claims.

| Customer | Industry and size | Use case | Signals used | Metrics achieved (exact numbers and timeframe) | Short quote | URL |
|---|---|---|---|---|---|---|
| Continu | Enterprise enablement, about 30 staff, 2 AEs | Visitor ID, AI chat "Nico", orchestration to Salesforce, sequences, Slack, LinkedIn | Hot page visits (pricing, demo), chat | 8x pipeline ROI and 3.5x revenue ROI in under a year; deal size up 10 to 20% vs demo forms; 95% accuracy on identified visitors | "Nobody leaves, nobody goes away without being interacted with." | https://www.warmly.ai/p/case-studies/kevin-mcready |
| Orum | Sales software, about 150 | AI chat replacing SDR chat cover | Chat engagement | "Dozens of hours a week" of SDR time saved (no period) | "Warmly is like the all-knowing super SDR that lives on your website." | https://www.warmly.ai/p/case-studies/justin-van-nostrand |
| TigerGraph | Graph database (listed Financial Services), about 100 | Replace Drift chatbot | Chat | 5 meetings in 6 weeks from zero; live in 2 weeks; "over 100% on ROI from a meeting standpoint" | "from not booking anything from our website to now booking meetings" | https://www.warmly.ai/p/case-studies/braden-looper |
| TeamWeave | Construction SaaS, growth stage | Five-signal funnel into HubSpot, 6-email sequence | Website visits, Bombora (category research, competitor), ICP hiring, social engagers on curated content, ICP contacts | Pipeline up over 80% (period not stated) | "Five signals in. One automated funnel." | https://www.warmly.ai/p/case-studies/parke-jacquay |
| Innerspace | Indoor location tech, 30 staff | Replace SDR agency | Engagers with competitor, competitor exec and competitor rep LinkedIn posts; monthly visitor list by time on site | Eliminated $20,000 to $40,000 a month SDR spend | "Every one of my competitors, all their prospects - I know who they are." | https://www.warmly.ai/p/case-studies/jon-freeman |
| Cendyn | Hospitality tech, enterprise | Replace Drift | Visitor ID, chat | No numbers; spend at or below Drift | "for the cost that we paid for Drift is already making up for in the difference" | https://www.warmly.ai/p/case-studies/ryan-shapiro |
| Namecoach (WarmLegency SDR) | HR tech, mid-market | Placed SDR plus AI inbound chat | Visitor ID, intent for outbound priority | 28 qualified meetings in 60 days; 60% via inbound chat, 40% outbound | Not published | https://www.warmly.ai/p/case-studies/namecoach-warmlegency |
| Dyspatch (WarmLegency SDR) | Email design, mid-market | Enterprise prospecting by placed SDR | Key page visits, return visits, technical content | Meetings with Nvidia and Daily Mail; 3 enterprise demos a month | Not published | https://www.warmly.ai/p/case-studies/dyspatch-warmlegency |
| Alpharun (WarmLegency SDR) | Early-stage SaaS | Outsourced AI-enabled SDR | Intent signals | "Pipeline from week one", no numbers | Not published | https://www.warmly.ai/p/case-studies/alpharun-warmlegency |
| TrustArc | Privacy software, enterprise | Replace offshore chat team | Page-specific flows (demo, vs competitor, catch-all), AI qualifying | Meeting rate flat, platform spend lower, so ROI up (no figure) | "Instead of having to manage four or five workflows, I just have to manage one workflow." | https://www.warmly.ai/p/case-studies/jon-barger |
| CiraSync | IT automation SaaS, mid-market | Visitor ID as lead source | Visits to any page, intent | 100+ leads a day; paid for itself in first month | "It can help identify people that are slipping through the funnel" | https://www.warmly.ai/p/case-studies/neil-wainwright |
| Conversion | CRO SaaS, 41 staff | Visitor ID, inbound agent, nurture agent (email, LinkedIn) | Website intent, other lead signals | Over $1M ARR sourced; 12% higher close rate | "Knowing who to reach out to, when to reach out to, what's the right timing" | https://www.warmly.ai/p/case-studies/neil-tewari |
| TotalSDS | Safety software, mid-market | AE self-sourcing, Outreach attribution | Page visits, sequence click-throughs, champion colleagues visiting | Pipeline up over 60% in Q2 (one quarter) | "Your champion might be passing your information to higher execs." | https://www.warmly.ai/p/case-studies/sam-few |
| Chasing Creative | Marketing agency, small | Speed of response | Real-time visits | No numbers | "How I beat the competition is responsiveness." | https://www.warmly.ai/p/case-studies/blake-wisz |
| Recruiting firm (Kael Campbell) | Recruiting, small | Visitor ID to enterprise outreach | Company visits, revenue band, org chart | No numbers (Hydro One example) | "somebody from your company was on our website" | https://www.warmly.ai/p/case-studies/kael-campbell |
| Behavioral Signals (2026 page) | AI conversational intelligence, growth stage | UTM campaigns plus human live chat | UTM click-throughs, page views | 4 qualified meetings week 1; 12+ qualified opps in 3 months; $40K deal in 7 days; about $60K tools saved | "Without Warmly, it would have taken another three to four months just to get a meeting." | https://www.warmly.ai/p/case-studies/jay-leano |
| Behavioral Signals (2023 page) | AI software, 30 staff | Visitor ID, chat | Unique link identifier in emails | Nearly $7M pipeline sourced; nearly $2M in first month | Not published | https://www.warmly.ai/p/case-studies/behavioral-signals |
| ScaleU | Recruiting, seed stage | Visitor ID, ICP validation | Visits, LinkedIn content engagers | 6 or 7 companies visible within hours (1,500 visitors had been anonymous) | "It was just like taking a blindfold off." | https://www.warmly.ai/p/case-studies/rich-saylor |
| Brainstory | AI productivity, 8 people | PLG company mapping | Personal-email signups mapped to employer | Maxed free tier on day one | "we've been chatting for months, they never tried to sell me anything" | https://www.warmly.ai/p/case-studies/lilly-chen |
| Caddis Systems | Enterprise software, 75 staff, 3 reps | AI chat, live chat, AI Prospector tied to AdWords pages | Landing page visits, support doc visits | 2 to 3 qualified leads in week 1 vs 1 to 2 a month ("500%"); 4 to 5x ROI; 300+ contacts auto-prospected | "One website conversion is the ROI." | https://www.warmly.ai/p/case-studies/mike-zimmerman |
| StraightIn | LinkedIn marketing agency, small | AI Prospector, LinkedIn automation | Time on site, pricing page, blog topic, title, size, industry | $10K revenue (2 deals) in 2 weeks; open rate +9%, click +6%, positive reply +1% | "With Warmly, we're skipping the whole top-of-funnel spend part" | https://www.warmly.ai/p/case-studies/straightin |
| Namecoach (2023) | HR tech, 50 staff | Slack alerts, warm calls | Pricing page, active seconds, high intent pages | 26 meetings in 6 months; 282% ROI | "we want to capture every single person and not just rely on them to click that request a demo button" | https://www.warmly.ai/p/case-studies/namecoach |
| Namecoach (2026) | HR tech, 50 staff | Auto-chat, AI booking | Chat | 8% of closed customers over 15 months; Warmly cost about 5% of that revenue | "by far the most impactful sales enablement tool that we use" | https://www.warmly.ai/p/case-studies/jon-lacivita |
| Stage | Pricing software, early stage | Visitor ID | ICP account visits, location | Qualified meeting in first 24 hours; "multiple deals" first month | "an invaluable addition to our sales process" | https://www.warmly.ai/p/case-studies/stage |
| Pump | Cloud cost optimisation, 75 staff | Visitor ID, live video chat | Visit by prior outreach contact | $20,000 deal in the first week | "we were immediately ROI positive" | https://www.warmly.ai/p/case-studies/pump |
| Kadence | Not published | Not published (page has headline only) | Not published | "cut our original CAC by about 50%" (headline) | Not published | https://www.warmly.ai/p/case-studies/kadence |
| Arc | Startup banking fintech, 150 staff | Visitor ID into Outreach sequences | Specific landing pages, web traffic | Breakeven in 90 days; 200% ROI by month 6; funnel conversion +10 to 15%; +1 to 3 customers a month; 3 to 5x ROI for the year (estimate) | "Timing is everything." | https://www.warmly.ai/p/case-studies/arc |
| Kandji | Apple device management, 300 staff | AI chat with human takeover | Identified company on site, chat reply | 2 qualified meetings in 8 minutes | Not published | https://www.warmly.ai/p/case-studies/kandji |
| Subskribe | Quote-to-revenue, 45 staff | Slack alerts, outreach in minutes | Page views | No numbers | "We start reaching out to them in the first few minutes they're on the website" | https://www.warmly.ai/p/case-studies/subskribe |
| VioletX | CISO services startup | Visibility, partner and competitor visits | Visits before or after calls, competitor and partner visits | No Warmly-attributed metric (company growth 400%) | "I want to live in Slack" | https://www.warmly.ai/p/case-studies/violetx |
| UTTR | Marketing agency, small | Ungated content tracking | Resource downloads, return visits | No numbers | "Warmly's been really great at helping us identify users that have a need for these resources." | https://www.warmly.ai/p/case-studies/uttr |
| HG Insights | Technology intelligence, enterprise | Ungated content, Orchestrator | Content-driven visits | No outcome numbers | "I genuinely think Warmly is a paradigm shift in how we can generate demand." | https://www.warmly.ai/p/case-studies/hg-insights |
| Bigeye | Data observability startup | Chat plus AI Prospector, HubSpot workflows | Enterprise account visits, chat | $230K pipeline; 2 deals from chat; second-best channel after phone | "that's turned into our second highest channel" | https://www.warmly.ai/p/case-studies/kyle-eligio |
| Inbox Pirates | B2B agency, 5 staff | Founder-led outreach to CEO | Repeat session data after a resource download | Four-figure deal within 2 weeks | "more often than not that data is accurate and reliable" | https://www.warmly.ai/p/case-studies/bharadwaj-giridhar |
| Warmly (marketing) | Own team | Dogfooding | Visits, partial form fills, UTMs, pricing and case study pages | Inbound +40% in Q2 (2023); about 60% of traffic identified; 12.5% warm connect rate vs 2% cold | Not published | https://www.warmly.ai/p/case-studies/warmly-marketing |
| Aligned | Sales enablement startup | Triangulate visitors with product usage | Visits plus product sign-up usage | 12% interest rate, 23% reply rate | "That's how I got Sam's attention, with actual data." | https://www.warmly.ai/p/case-studies/debdutta-saha |
| Monograph | Architecture software startup | Fully automated visitor-to-sequence | Visitor ID, LeanData ownership check | No numbers | "It's not a hard sell." | https://www.warmly.ai/p/case-studies/jon-piehl |
| Cacheflow (SDR) | Quote-to-revenue startup | SDR prospecting source | Firmographic filters, RevOps titles | Qualified deal within 24 hours | "net new contacts that we hadn't found anywhere else" | https://www.warmly.ai/p/case-studies/riley-timmins |
| Cacheflow (sales) | Quote-to-revenue startup | Real-time alerts | Pages viewed, org chart | 1.5 website leads to over 4x; website conversion 5x | "First to inbox, first to LinkedIn." | https://www.warmly.ai/p/case-studies/taylor-griffith |
| Warmly (sales) | Own team | Dogfooding | Visits, query parameter in sequences | About 43% of closed-won attributed; about 1,050 net new ICP accounts a month from 30,000 visits (2023) | Not published | https://www.warmly.ai/p/case-studies/warmly-sales |
| Kargo | Warehouse tech, growth stage | Chat plus Orchestrator | Visits driven by LinkedIn posts | 62 of 206 meetings in one month; warm call about 40% vs cold 1%; Orchestrator 30 to 40% | "On a pure cold call, we might get a meeting 1% of the time. On a Warmly call, we get about 40%." | https://www.warmly.ai/p/case-studies/keith-fearon |
| The D2D Experts | Sales training, small (15 in sales) | AI chat, AI email, warm calls | Visits, Salesforce contact on site | $80,000 revenue in 12 days; answer rate 5 to 10% to 30 to 40%; conversion 2 to 3% to 13% this quarter | "fire off sales emails that convert at 10x the rate of our normal sequences" | https://www.warmly.ai/p/case-studies/the-d2d-experts |
| Zinc Work (inbound) | Background checks, mid-market | Live chat, AI chat with 30s delay | Session time, page views | Monthly target hit in one week; about 50% of leads from Warmly | "I've set the AI delay to 30 seconds so I can jump in first." | https://www.warmly.ai/p/case-studies/elizabeth-watts |
| Zinc Work (outbound) | Background checks, mid-market | Account prioritisation in CRM views | Pages, visit count, sessions, "last seen within 30 days" | No numbers | "visiting four pages, seven total sessions - is far more top priority" | https://www.warmly.ai/p/case-studies/alastair-chamberlin |
| DuploCloud | Cloud infrastructure startup | Proactive and reactive chat | SOC 2 and cloud topic pages | 2 meetings from reactive chat | Not published | https://www.warmly.ai/p/case-studies/james-solada |
| Martus Solutions | Nonprofit software startup | AI Prospector into HubSpot | Gmail visitor ID, off-ICP company visit | Deal in top 90th percentile of ARR | "The tool paid for itself." | https://www.warmly.ai/p/case-studies/chris-martel |
| Alysio | AI sales performance startup | Visitor ID, AI chat | Target account visits | 8 to 9 opportunities in about 2 weeks | "we're never missing warm leads anymore" | https://www.warmly.ai/p/case-studies/aaron-mcreynolds |
| Revsure.ai | Revenue intelligence startup | Slack visitor channel, meeting prep | Competitor page visit by buyer persona | 5 to 8 demos a week to 30 to 50 a month (whole marketing ramp, not Warmly alone) | "I'd tell you it will 100% lead to wins." | https://www.warmly.ai/p/case-studies/alex-cox |

### Rox
URL root: https://www.rox.com/customers/ (index https://www.rox.com/customers). All metrics are vendor claims. Rox's site footer says metrics "reflect results reported by individual customers under specific configurations and may not be representative".

| Customer | Industry and size | Use case | Signals used | Metrics achieved (exact numbers and timeframe) | Short quote | URL |
|---|---|---|---|---|---|---|
| XBOW | AI penetration testing, 200 to 500 | Prospecting partner inside an in-house GTM engine | Not published | Tool stack cut from 12 to 5; 2-week bake-off: 3 or 4 meetings plus 3 pending vs none for a rival | "Rox is solving prospecting for us in a way we could not solve ourselves." | https://www.rox.com/customers/xbow |
| Upwind | Cloud security, 200 to 500 | Outbound in one tool instead of six | Salesforce firmographic and intent scores | "we just saved you 80% of your day" within the first hour of onboarding; "best quarter yet" | "Reps adopt outcomes, not tools" | https://www.rox.com/customers/upwind |
| MongoDB | Database, 5,500 staff | Autonomous outbound pipeline generation | Not published | Prototype to production in 45 days | "It's like having a rocket engine for your AI needs for your go to market organization." | https://www.rox.com/customers/mongodb |
| Rev.io | Billing and service ops software, 51 to 200 | Personalised outbound at scale, agent per account | Prospect research | About 200 emails per rep per day; first Rox opportunity in forecast; TAM grew from about 10,000 to 50,000+ companies | "The first meeting that Rox was able to book for us was a company that wasn't on our radar at all." | https://www.rox.com/customers/rev.io |
| Cloud Software Group | Software, 10,000+ | Full customer context for renewals and expansion | Contracts, history, usage, engagement | No numbers | "If I build it myself, I'm limited by what I know." | https://www.rox.com/customers/cloud-software-group |
| Together AI | AI cloud, 300+ | Research and automated outreach across book | Product, customer and external data | "uptick" in qualified meetings; faster SDR ramp (no numbers) | "Getting more qualified meetings is the ultimate goal" | https://www.rox.com/customers/together-ai |
| Pallet | Supply chain AI, 50 to 200 | CEO Mode for pipeline and deal risk | Calls, Slack, email; competitor evaluation; weak champion | Best quarter ever across every sales KPI; team grew 5 to 40 reps | "We've had our best quarter yet after adopting Rox" | https://www.rox.com/customers/pallet |
| LogicMonitor | IT observability, 1,000 to 5,000 | BDR agents over 300 accounts for 6 AEs | 10-K reports, pain points, past sent emails | 70%+ open rate; event campaign in 30 minutes vs weeks; research time "nearly zero" (was 20 to 25 minutes per email) | "We've got Rox. We don't need to focus on 3-4 accounts." | https://www.rox.com/customers/logicmonitor |
| Ramp | Fintech, 500+ | Meeting prep and guided execution | Deal context | Card says "10-15% conversion rate increase"; story body gives no number | "I close more when I use ROX. That's the bottom line." | https://www.rox.com/customers/ramp |
| WSP | Engineering services, 50,000+ | Research agent over top clients | Extreme weather incidents affecting clients | Answers in 5 minutes vs 4 to 8 hours per client; rolled out to 600 users | "Rox gets you out from behind your desk and into the market." | https://www.rox.com/customers/wsp |
| Codat | Fintech data for banks, 200+ | Account mapping in complex banks | 24/7 account monitoring, org charts | No numbers; org chart feature shipped in 2 weeks | "How do you narrow from thousands of people to the 100 that matter most" | https://www.rox.com/customers/codat |
| Axon 911 | Public safety tech, 150+ | Signal detection and automated outreach; event follow-up | Legislation changes, local news, community publications, Facebook posts | 3 top reps booked 11 meetings in 2.5 weeks | "I referenced a Facebook post in my outreach." | https://www.rox.com/customers/axon-911 |
| Bynder | Digital asset management, 500+ | Expansion research for SAMs, outbound for BDRs | Account gaps | SAMs 2.5x higher net-new closed ARR per month; 100+ monthly active users within 90 days | "Without Rox, you're just losing time." | https://www.rox.com/customers/bynder |
| Rho | Fintech, 50+ | Plays, self-updating records | Not published | Rox-influenced leads convert higher than the standard funnel (no figure) | "They fail because they don't know who to call." | https://www.rox.com/customers/rho |
| New Relic | Observability, 2,000+ | Call prep dashboards for mid-market new business | Deal and buyer context | 85% efficiency gain in research time (prep was 45 minutes); 50%+ faster ramp | "Rox is like having a co-pilot" | https://www.rox.com/customers/new-relic |
| Couchbase | NoSQL database, 700+ | Account planning, pre-meeting briefs | Clever Columns account intel | 90%+ adoption of 200+ field reps; 7 sessions in 3 weeks | "where we can target our resources to make us more effective" | https://www.rox.com/customers/couchbase |
| Puma Energy | Retail fuel, 3,000+ | Replace abandoned CRM | Internal plus live external sourcing | Feature use from 2% to 80 to 90% | "solving the external sourcing problem for us, along with the internal information in one place" | https://www.rox.com/customers/puma-energy |
| Tabs | Finance software, 50+ | Research and outreach | Contact research | 2 to 3x "faster efficacy for open rates or response rates"; "often seven hours a day" saved | "To describe Rox in just a simple word, it would be cerebral." | https://www.rox.com/customers/tabs |
| Snorkel AI | AI data platform, 700+ | Research, emails and LinkedIn messages | Clever Columns enrichment | "hours each week" saved (no figure) | "If you are looking to consolidate tools and become and AI-first company you need to implement Rox" | https://www.rox.com/customers/snorkel |


### Lightfield
URL root: https://lightfield.com/customers/ (index https://lightfield.com/customers lists about 60 logos, 7 with stories). All are vendor claims; Lightfield stories contain very few hard numbers.

| Customer | Industry and size | Use case | Signals used | Metrics achieved (exact numbers and timeframe) | Short quote | URL |
|---|---|---|---|---|---|---|
| Thrad | AI advertising tech | Post-call onboarding workflow; 9pm call briefs | Call content (brand, budget, customer type); LinkedIn via custom integration | About 55 calls a week by September run through workflow; replaced "a couple hours" of work per call | "We simply trust lightfield" | https://lightfield.com/customers/thrad |
| Agree | Contracting and payments, hypergrowth | Pipeline run by chat; migration from HubSpot then Attio by CSV | Conversation-derived deal fields | Saves "multiple hours per week" | "When the pipeline is messy, so is the performance." | https://lightfield.com/customers/agree |
| Intent HQ | Customer intelligence for telco, retail, FS | Forecasting on flow rate, deal reviews, external agents via MCP | Time in stage, conversation-derived fields | 7 months on Lightfield; 18+ month cycles; no outcome figure | "State is just a snapshot" | https://lightfield.com/customers/intent-hq |
| Power | Clinical trial recruitment, 5 sellers | Deal coaching skill; trial monitoring agent | ClinicalTrials.gov registrations, press releases, regulatory news (FDA IND), filtered by phase, condition, sponsor | Target market about 20 pharma and 100 biotech; surfaced a Phase 2 Alzheimer's IND at a customer | "If it prompts 10 smarter things we do every single week, that's a win." | https://lightfield.com/customers/power |
| SF Compute | GPU cluster provider | Demand capture from calls, demand analytics for procurement | GPU SKU, count, start date extracted from conversations | No figures | "We're able to track and close large deals faster with Lightfield" | https://lightfield.com/customers/sf-compute |
| Verdigris | Electrical sensing for AI data centres | Leave Salesforce; MEDDPICC hygiene, close automations | MEDDPICC gaps from 2,330 closed deals | Migrated about 10,000 contacts and a 211-field object; daily deal scoring | "it becomes this tool that really shortens the learning loop for a company." | https://lightfield.com/customers/verdigris |
| Macroscope | AI code review | Every touchpoint into CRM; agents qualify inbound | RB2B website visitors, GitHub installs, trust-centre requests, product usage, support tickets | 50-block Zapier flow rebuilt in under a day; 30 automations; about 10x less time to build | "I can build out all the automation that took me months to build on Zapier in a day" | https://lightfield.com/customers/macroscope |

### Patterns across the stories
- **Speed of response is the most repeated mechanism, not data volume.** Warmly stories turn on acting within minutes (Kargo warm calls about 40% vs 1% cold; D2D answer rates 30 to 40% vs 5 to 10%; Kandji 2 meetings in 8 minutes) (https://www.warmly.ai/p/case-studies/keith-fearon ; https://www.warmly.ai/p/case-studies/the-d2d-experts ; https://www.warmly.ai/p/case-studies/kandji).
- **Metrics are mostly small-sample, short-window and self-reported.** Many Warmly headlines rest on one deal or one week ("$20,000 closed in the first week", "500%" meaning 2 to 3 leads vs 1 to 2). Several stories have no numbers at all, and Rox's Ramp card shows a figure not in the story body. Inference: Demand AI's proof should use a fixed period, a stated baseline and a control.
- **Time saved and stack consolidation are the safest claims.** Rox (Upwind 80% of day, XBOW 12 to 5 tools, New Relic 85% research time), Warmly (Innerspace $20K to $40K a month SDR spend removed; Behavioral Signals about $60K of tools) and Lightfield (Macroscope Zapier) all lead with this.
- **Bespoke, local signals beat generic intent.** Power watches ClinicalTrials.gov, Axon 911 watches legislation and local Facebook posts, WSP asked about weather incidents, SF Compute extracts GPU specs from calls (https://lightfield.com/customers/power ; https://www.rox.com/customers/axon-911 ; https://www.rox.com/customers/wsp). Inference: for industrial buyers, plant announcements, permits and capex filings are the equivalent.
- **Human-in-the-loop with fast handover.** Warmly users set AI chat delays so humans jump in first (Zinc Work 30 seconds); Rox and Lightfield queue drafts for review.
- **First-party context is the differentiator vendors sell.** Lightfield (calls and email), Nooks (call transcripts), Rox (CRM plus warehouse) all argue that bought data is commoditised.
- **Forward-deployed help is part of the product.** Warmly CSMs and WarmLegency placed SDRs, Rox training and forward-deployed teams (Together AI, Bynder, Couchbase), Lightfield's forward-deployed team (Power). Inference: results are partly service-delivered.
- **Enterprise Rox stories sell trust and governance (MongoDB, CSG), not pipeline numbers;** smaller customers sell speed and meetings.

## Signals catalogue

### Nooks (vendor list; "100+ Pre-built Signals" claimed, full list Not published)
- **Competitor:** Competitor Renewal / Upcoming Renewal with Competitor (from contract end dates mentioned on past calls); Uses Key Competitor / Uses Competitor (https://www.nooks.ai/signals-intelligence ; https://support.nooks.ai/articles/8913542083-configuring-competitors-in-nooks ; https://www.nooks.ai/blog-posts/june-product-release-auto-enrich-numbers-frequently-used-dispositions-competitor-renewal-signal)
- **Call and conversation (first-party):** Requested Follow Up; Timing Objection; No Show Demo; transcript phrases such as "follow-up in December", "contact my VP" (https://www.nooks.ai/signals-intelligence ; https://www.nooks.ai/blog-posts/how-to-generate-your-own-signals-to-create-an-outbound-engine)
- **People:** Prior Champion; Job Changes (champions and decision-makers moving); Leadership Hire (https://www.nooks.ai/signals-intelligence)
- **Company events:** Recent Funding; Announced Acquisition; Announced Expansion; Partnership Announced; New Product Launch; New GTM Strategy; 20% Headcount Jump; Hiring Sales Team; Hiring Ops; Company News (funding, mergers, strategic shifts) (https://www.nooks.ai/signals-intelligence)
- **Fit and technographic:** ICP Org Match; Uses Integration (https://www.nooks.ai/signals-intelligence)
- **Engagement:** Asset Downloaded; Webinar Attendee; Inbound demo requests; Website Intent via third-party de-anonymisation (pricing, case studies pages) (https://www.nooks.ai/signals-intelligence)
- **CRM:** Closed Lost Intel (resurface when contract up for renewal or leadership changes) (https://www.nooks.ai/signals-intelligence)
- **Blog list of buying signals:** demo or trial request; pricing or terms questions; three or more pricing/product page visits in a week; multiple stakeholder engagement; procurement and legal involvement; funding, hiring or leadership change; ROI calculator and case study downloads; competitor or review-site research; re-engagement after dormancy; explicit timeline or deadline mentions (https://www.nooks.ai/blog-posts/10-proven-buying-signals-every-b2b-sales-rep-should-track)
- **Data sources for agentic signals:** job descriptions, Nooks calls, Gong transcripts, CRM data, Competitors list, battlecards (https://support.nooks.ai/articles/8913542083-configuring-competitors-in-nooks)

### Common Room (signal guides, with stated intent level; https://www.commonroom.io/resources/signals/ unless noted)
- **LinkedIn and personal (person-level):** LinkedIn company page posts, comments, reactions and mentions (https://www.commonroom.io/docs/signals/community-and-social-integrations/linkedin/); LinkedIn Ads engagement (same docs); manual add from any LinkedIn profile via Chrome extension (https://www.commonroom.io/docs/signals/common-room-native-signals/chrome-extension/); Job change, sourced from LinkedIn, with previous-org filter (https://www.commonroom.io/docs/signals/common-room-native-signals/job-changes/); Customer/champion job change (High); Competitor job change (Medium); Ideal persona recently hired (Low); Customer/prospect promotion (Low); Professional milestone (Low); Personal milestone (Low); LinkedIn profile view (Low); Relevant post engagement (Medium); Social post (Low); Competitor follow (Medium); Influencer follow (Low); Shared connections (Low); Podcast guest appearance (Low); Event keynote or panel (Low); Likes/comments on relevant videos (Low); LinkedIn insights tag activity (Low)
- **Website:** Pricing page activity (High); Security/terms page activity (Medium); Docs page activity (Medium); Integration page activity (Medium); Form or chat abandonment (Medium); Content consumption (Low); Surge or decline in website traffic (Low); Subscribe (Low)
- **Product (PLG):** Surge in product usage (High); Rapid rise and fall in usage (High); Multiplayer activity (High); Paid ceiling approached (High); Power user threshold (High); Plan upgrade (High); Payment method added (High); Upgrade screen activity (High); Aha moment (High); Compliance or IT user identified (High); Multiple workspaces by one org (High); New sign-up (Medium); Gmail sign-up enrichment (Medium); Integration connected / disconnected (Medium); Trial end approached (Medium); Surge in log-ins (Medium); Product link share (Medium); Activity after stagnant period (Medium); Sign-up abandonment (Medium); Rage clicks (Medium); Payment declined (Low)
- **Company events (news):** Capital raised (Low); New leadership hired (Low); Surge in hiring (Low); Job openings (Low); Surge in layoffs (Low); Merger or acquisition (Low); Region expansion (Low); Earnings call/10-K (Low); Positive and negative media coverage (Low/Medium); Award (Low); Brand relaunch (Low); External product launch (Low); Event sponsorship (Low); Legislation change (High); Platform policy change (High)
- **Competitor:** Upcoming renewal with competitor (Medium, CRM and Social); Competitor closure/acquisition (High); Competitor feature deprecation (High); Tech stack adjacency (Medium)
- **Community, forum, open source:** Activity level spike (High); Community question asked (High); Ideal persona community join, owned (High) and unowned (Low); Organisational activity growth (Medium); GitHub activity (Medium); Keyword engagement (Medium); Channel sentiment (Medium); Bug complaint (Medium); Negative product review (Medium); Keyword search (Medium); Topic engagement (Low)
- **CRM, email and custom:** Economic buyer activity (High); Stale opportunity (Medium); Surge in email opens (High); Shared investor (Low); Shared advisor (Low); Shared opportunities across partners (Medium); Round-tripping (Medium); Product review intent (Low); Live and digital event attendance (Low)
- **Third-party integrations:** Bombora, 6sense, Demandbase, TechTarget, G2, Gong, Nooks, Zoom (docs index, https://www.commonroom.io/docs/signals/community-and-social-integrations/linkedin/ navigation)

### Warmly (https://www.warmly.ai/p/signals unless noted)
- **1st party, web intent:** person-level visitor ID; page-by-page behaviour; chat conversations; form submissions and partial form fills (https://www.warmly.ai/p/case-studies/warmly-marketing); return visits; UTM and query-parameter identification from sequences (https://www.warmly.ai/p/case-studies/warmly-sales)
- **2nd party, social:** LinkedIn profile views; content engagement (likes, comments); connection activity; social interactions with the brand; engagers with competitor company, executive and rep posts (https://www.warmly.ai/p/case-studies/jon-freeman)
- **3rd party, research:** LinkedIn posts and comments; Twitter/X activity; Glassdoor; G2 reviews; SEC filings; hiring trends and job postings; job changes; Bombora topics; technographics
- **Published weights:** pricing page High; multiple stakeholders High; return visit same week High; Bombora surge Medium; relevant job posting Medium; LinkedIn engagement Medium; blog visit Low; homepage only Low
- **Customer-used combinations:** five-signal funnel (visits, Bombora, ICP hiring, social engagers, ICP contacts) (https://www.warmly.ai/p/case-studies/parke-jacquay); champion's colleagues visiting (https://www.warmly.ai/p/case-studies/sam-few); existing customers on support docs (https://www.warmly.ai/p/case-studies/mike-zimmerman); visitors cross-referenced with product usage (https://www.warmly.ai/p/case-studies/debdutta-saha)

### Rox (from stories; full list Not published)
- Public events found by research agents: legislation changes, local news, community publications, Facebook posts (https://www.rox.com/customers/axon-911); extreme weather incidents (https://www.rox.com/customers/wsp); 10-K reports (https://www.rox.com/customers/logicmonitor)
- Deal risk: buyer assessing an alternative; champion lacking authority; stakeholder gaps (https://www.rox.com/customers/pallet)
- Funding and hiring as outreach reasons (example "$38M Series B and six new SDR roles", https://www.rox.com/articles/the-outbound-reward-model)
- Behavioural reward signals: SDR send, edit, discard; opens; replies (same URL)
- Background (COMPETITOR_RESEARCH.md): news, job postings, blogs, financial documents, CRM, email, calls, warehouse data

### Lightfield
- Account chips: executive hire; headcount growth; contact job change; tech stack change; new funding round (https://lightfield.com/)
- Scoring inputs: hiring, funding, tech stack, investor signals; connection strength from the team's LinkedIn graph (https://lightfield.com/product/ai-pipeline-generation)
- First-party: won-deal patterns, buyer language, objections, stalled and lost deal notes (https://lightfield.com/blog/designing-for-outbound-that-compounds-on-itself); warm intros mentioned on past calls; champion job changes (https://lightfield.com/blog/monaco-vs-lightfield)
- Customer-built: ClinicalTrials.gov and regulatory news (https://lightfield.com/customers/power); website visitors via RB2B, GitHub installs, trust-centre access requests, product usage (https://lightfield.com/customers/macroscope)

## Metrics and pricing seen

### Outcome metrics promised (vendor claims)
- **Nooks:** 2x pipeline, 4x faster prospecting, 3x meetings for signals users; 5x dials, 4x conversations, 3x meetings for the dialer; Drata +25% meetings; Coder +50% opportunities; Pendo 33% of meetings from signals; Relay 90% SDR time saved; Spring Health 4x meeting rate; Greenhouse +70% opportunities; Observe +20% meetings; Deel 600+ conversations in 5 days; HubSpot +67% meetings and +24% pipeline per BDR (https://www.nooks.ai/signals-intelligence ; https://www.nooks.ai/pricing)
- **Rox:** reward model 80% agreement with SDR edits and 1.75x reply rate in its top 20% (https://www.rox.com/articles/the-outbound-reward-model); customer figures as in the table above.
- **Warmly:** "first responder advantage... (35-50% higher conversion)" (https://www.warmly.ai/p/signals); WorkBoard pipeline targets +20% without headcount, ACV doubled, Warmly MQLs closed 50% higher and 30% faster (quotes on https://www.warmly.ai/p/signals); visitor coverage "15% of contacts and 65% of the companies" (https://www.warmly.ai/p/case-studies/hg-insights).
- **Lightfield:** results in 4 to 6 weeks of live sending after a few weeks' setup (https://lightfield.com/product/ai-pipeline-generation); no percentage uplifts published.
- **Common Room:** none on the signal pages read; see COMPETITOR_RESEARCH.md for Semgrep, Notion, Workvivo claims.

### Pricing seen
- **Lightfield:** Pro $999 per workspace per month (5 capture seats) and Growth $1,999 per workspace per month (10 capture seats), billed annually; Enterprise custom (https://lightfield.com/blog/monaco-vs-lightfield). Starter $89 per user per month and LinkedIn sync (beta) on Growth (https://lightfield.com/pricing, per COMPETITOR_RESEARCH.md). Pipeline Generation is a managed service; Monaco page says it is "optional and opt-out within the first 30 days"; separate price Not published.
- **Nooks:** custom quote only (https://www.nooks.ai/pricing). Third-party: Vendr median contract value $26,504 (search extract, third-party, https://www.vendr.com/marketplace/nooks); another snippet cites $30,105 a year over 57 purchases (search extract, third-party, https://skipcall.io/en/comparatif/nooks-vs-koncert).
- **Warmly:** official pricing page is quote only (COMPETITOR_RESEARCH.md, https://www.warmly.ai/p/pricing). A January 2024 case study says "For as little as $1200 a month" and mentions a free plan (https://www.warmly.ai/p/case-studies/the-d2d-experts); likely out of date. TrustArc notes credit-based pricing vs a prior per-lead vendor (https://www.warmly.ai/p/case-studies/jon-barger).
- **Rox:** Individual $100 a month (10,000 Agent Actions), Teams $255 a month (15,000 actions), Enterprise custom (https://www.rox.com/pricing, per COMPETITOR_RESEARCH.md; not re-checked today).
- **Common Room:** official price list Not confirmed; third-party estimates of about $1,700 to $2,500 a month for Essential, typical contracts about $27,000 to $30,000 a year (third-party, per COMPETITOR_RESEARCH.md). LinkedIn integration, Chrome extension and job changes are "included on all plans" (docs URLs above).
