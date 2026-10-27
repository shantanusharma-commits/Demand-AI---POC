# Demand AI: from prospecting to deal

A summary of the pilot funnel, why it has not produced a deal yet, and what the leading AI sales platforms teach us. Full detail is in `funnel-view.html` (open it in a browser) and `COMPETITOR_RESEARCH.md`.

**All funnel figures in this summary are sample data.** Every placeholder is listed at the end so it can be replaced with real pilot numbers.

## The flow

Demand AI takes a pilot client (an industrial automation vendor selling control system migration and lifecycle services to refining, petrochemical and gas processing sites in six South-East Asian countries) through ten stages:

| Stage | What the tool does | Result to judge it by |
|---|---|---|
| 1. Prospecting | Loads and cleans the lead file | Accounts loaded |
| 2. Qualified lead identification | Applies ICP knock-outs and checks each contact can be reached | Qualified, contactable accounts |
| 3. Lead scoring | Fit score plus decaying signals, giving tiers A, B, C and a watch list | Accounts with a live signal |
| 4. Segmentation | The strongest signal sets the micro-segment | Accounts with a play |
| 5. NBA and NBC | An action and draft per account, a campaign per segment, human review | Accounts released with a reason to talk |
| 6. Campaign execution | Six-step sequence over 21 days via Dripify (LinkedIn) and email | Contacts reached |
| 7. Content creation | Blogs and whitepapers from the brand pack and approved claims | Replies that cite content |
| 8. Content mapping | One asset per persona per step | Replies per step |
| 9. Follow-up | Reply tracking and next steps | Positive replies answered, meetings booked |
| 10. Deal | Meeting, opportunity, close | Opportunities and deals |

## Funnel numbers (sample data)

| Outcome | Accounts | Kept from previous |
|---|---:|---:|
| Loaded | 1,400 (7,498 contacts) | |
| Qualified and contactable | 612 | 44% |
| With a live signal | 236 | 39% |
| Tier A or B | 95 | 40% |
| Released to outreach | 64 | 67% |
| Replied | 16 | 25% |
| Positive reply | 6 | 38% |
| Meeting held | 3 (4 booked) | 50% |
| Opportunity | 1 (USD 600k estimated) | 33% |
| Deal | 0 | 0% |

## Diagnosis: why no deals yet

The top of the funnel works. The funnel breaks after the first reply. In order of impact:

1. **Follow-up.** Positive replies wait a median 3.4 days, and 2 of 6 waited more than a week. Replies sit in Dripify and inboxes, so Demand AI never sees them and cannot recommend the next step.
2. **Targeting.** 61% of sequenced contacts were secondary persona, because primary-persona contacts lacked a verified email. They gave 1 positive reply from 105. 61% of qualified accounts have no live signal, and the largest segment rests on an installed-base date rather than active intent.
3. **Content.** The step 3 whitepaper went to every persona and drew 1 reply from 101 contacts. Short, signal-led LinkedIn notes at steps 1 and 2 drew 13 of the 21 replies. 5 of 14 assets were never used.
4. **Deliverability.** 18% of emails bounced, so the message is not read in the first place.
5. **Conversion and measurement.** 3 meetings produced 1 opportunity, with no playbook after the first meeting. Outcomes are tracked by hand, so scoring cannot learn which signals lead to meetings.

**Timing matters.** These deals take 9 to 18 months. Zero deals after eight weeks is expected; one open opportunity is the leading indicator. The next eight weeks should be judged on meetings held and qualified pipeline, not on deals.

## Top lessons from the competitor research

We researched 19 AI-native platforms and 8 incumbents. Two entries could not be fully matched: "#1 Search Engine To Find The Best Leads" is Leadsforge, already on the list, and Baze could not be identified.

1. **The best players handle replies inside the product.** Conversica, AiSDR, 6sense and Unify classify replies, stop or pause the sequence and hand hot replies to a person. This is our biggest gap.
2. **Every recommendation carries a specific reason.** HubSpot, Salesloft, 6sense and Monaco show why an account is ranked. Our "why now" line is the right idea; we need to show which signals moved the score.
3. **Signals stack.** Unify claims replies double at four or more signals (vendor claim). Our 61% no-signal watch list needs at least one live intent source.
4. **They find the right person before reaching out.** Leadsforge, Unify, Apollo and ZoomInfo use enrichment waterfalls across many data providers. Our primary-persona gap is a data-sourcing problem.
5. **They promise and price on outcomes.** HubSpot charges $1 per recommended lead, AiSDR promises 1 to 3 meetings per 100 leads, and 1mind proves revenue in the customer's own CRM. We should report meetings and pipeline per 100 accounts released, measured in the client's CRM.
6. **Rules plus AI is the winning architecture.** Salesforce's Agent Script, nRev's deterministic playbooks and Workvivo's Journeys all pair a rules engine with AI drafting. That validates Demand AI's design.
7. **Our opening is vertical.** No researched player is built around industrial installed-base, service renewal or turnaround signals, or around 9 to 18 month high-ticket cycles. Incumbents win on data, distribution and trust in horizontal markets, not here.

## Technical mechanisms worth adopting

| Mechanism | Stage | Learned from | Difficulty |
|---|---|---|---|
| Reply ingestion and intent classification with stop rules | Follow-up | Conversica, AiSDR, Unify, 6sense | Medium |
| Enrichment waterfall with a verified primary-persona gate before release | Qualified lead identification | Leadsforge, Apollo, ZoomInfo, Unify | Medium |
| Signal stacking with explainable score contributions | Lead scoring | Unify, 6sense, HubSpot | Low |
| A live intent source for no-signal accounts (website visits or a co-op feed) | Lead scoring | Warmly, Bombora, 6sense | Medium to High |
| Campaigns as plays (trigger, persona, steps, asset per step), messages generated at send time | NBA and NBC, Content mapping | Unify, Salesloft, Workvivo Journeys | Low |
| Results logged per step, angle and asset | Content mapping | Lightfield, nRev | Low |
| Bounce threshold that pauses a sequence; block unverified emails | Campaign execution | AiSDR, Unify | Low |
| CRM write-back and tiers recalibrated on meeting outcomes | Deal | Clarify, Rox, 6sense, Salesloft | Medium |

## Recommended next eight weeks

1. Ingest Dripify and email replies and make answering a positive reply a same-day next best action.
2. Gate release on a verified primary-persona contact.
3. Remap content: short signal-led steps first, long-form only after engagement, one asset per persona per step.
4. Report meetings held and qualified pipeline per 100 accounts released, from the client's CRM.

## Placeholders to replace

Every figure below is sample data in `funnel-view.html` and this document. The `DATA` block at the top of the page script holds them all, so the page updates once they are edited there.

**Pilot context**
1. Pilot window: 1 Sep to 26 Oct 2026 (8 weeks)
2. Pilot client description, ICP (verticals, six countries) and sequence design (six steps over 21 days). Taken from the prototype; confirm they match the live pilot
3. Typical sales cycle: 9 to 18 months
4. Opportunity value: USD 600k estimated

**Funnel counts**
5. Accounts loaded: 1,400; contacts loaded: 7,498 (these are the volumes of the test dataset, not the live pilot)
6. Data issues found: 1,126
7. Qualified accounts: 612; qualified contacts: 2,310; primary persona with verified email: 38%
8. Accounts with a live signal: 236 (A 34, B 61, C 141); watch list: 376
9. Micro-segments: Modernisation 31, Project 21, Engagement 17, Leadership 12, Service renewal 4, Inquiry 3 (88 total); unsegmented: 7
10. NBA review: 88 items; 51 approved as is, 13 edited, 24 rejected (11 wrong contact, 7 already engaged, 6 wrong action); median review time 1.6 days; about 22 review hours
11. Accounts released: 64; contacts sequenced: 172 (61% secondary persona)
12. LinkedIn: 70 of 172 connections accepted (41%); 298 LinkedIn actions; 14 replies, 4 positive
13. Email: 123 contacts emailed, 101 delivered (18% bounced); 271 emails sent; 7 replies, 2 positive
14. Replies: 21 from 18 contacts at 16 accounts; 6 positive
15. Median time to answer a positive reply: 3.4 days; positive replies waiting over 7 days: 2
16. Meetings booked: 4; held: 3; opportunities: 1; deals: 0
17. Segment campaigns run: 6; segments with replies: 4 of 6; Inquiry accounts replying: 2 of 3

**Content**
18. Assets produced: 14; used: 9; never sent: 5; replies citing an asset: 2
19. Content-to-sequence map: every asset name and the replies/reached figure in all 24 cells (4 personas by 6 steps)
20. Persona figures: sequenced, replied and positive per persona (41/7/3, 26/4/2, 63/6/1, 42/4/0)

**Follow-up tracker**
21. All 12 respondents: names, roles, accounts, channel, step, reply type, what they said, days since reply, status and next step (names are invented)

**Activities vs results**
22. Scoring runs: 6; reply tracking effort: about 2 hours a week

**Real data needed to make the diagnosis accurate:** stage counts for the live pilot, the Dripify export (connections, replies by step, who replied), email send and bounce figures by step, the actual sequences and assets per persona, reply handling times, and ACV and cycle length.
