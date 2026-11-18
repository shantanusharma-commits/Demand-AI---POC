# R1 feature specification

Every R1 feature: why it exists, input and output, rules, what happens if it fails, and the acceptance criteria. Use it to decide what the prototype must show and obey.


## Platform and memory

### FND-01 Connector framework, scheduler and events
- **Why:** Every source needs one safe, repeatable way in, so a failing or missing source never stops the product.
- **Input:** Source credentials; connector settings; schedules; inbound webhooks
- **Output:** Records in memory with source and date; run logs; events
- **Rules:** Secrets are never in code or tables. Every connector declares its rate limits and its cached-mode source. A run records start, end, rows, errors and cost. A 429 backs off with jitter; a 400, 401 or 403 stops and alerts.
- **If it fails:** Retry, then last good data marked stale and an admin alert; no key: cached mode
- **Acceptance:** With a key removed the connector serves cached data and labels it; a forced 429 retries and recovers; a forced 401 is not retried and alerts the admin; every run is in the run log with cost.

### FND-02 Identity graph
- **Why:** The same person appears in the CRM, email, LinkedIn and data providers. Without one record, signals and sends attach to the wrong person.
- **Input:** Contact and account records from every source
- **Output:** One resolved record with an identity tier I1 to I5 (section 6)
- **Rules:** Matching order is LinkedIn URL, then email, then name + company + title. Two records with equal name, company and title but different LinkedIn URLs stay two people. A bounce or a job change sets the contact to stale and excludes it from outreach until re-verified.
- **If it fails:** A disputed record (I4) is held, retried each refresh, and goes to the rep or admin after three failed cycles
- **Acceptance:** A seeded pair of duplicates merges to one record with the source on each field; a seeded same-name pair with different LinkedIn URLs stays two; a bounce marks the contact stale and removes it from the queue.

### FND-03 Context graph
- **Why:** Every agent must read the same history before it acts and write back after. This memory is what compounds, and it is what the customer owns.
- **Input:** Every module's output
- **Output:** The memory core and the account dossier passed down the pipeline
- **Rules:** Entities: people, accounts, deals, signals, actions, reasons, outcomes, documents. Every row has tenant_id, source and date. The client team can read every table and edit the ICP, exclusions, contacts and personas; each edit is audited.
- **If it fails:** A failed migration rolls back; the store goes read only until fixed
- **Acceptance:** A rep in tenant A cannot read a row of tenant B; an edit to an exclusion is applied on the next run and appears in the audit log with who and when.

### FND-04 Facts with expiry
- **Why:** A signal that is months old must stop counting, or old news keeps ranking accounts.
- **Input:** Every signal and time bound fact
- **Output:** An expiry on every signal; expired facts excluded
- **Rules:** Expiry is set at capture from the signal tier window. A date in the source ("budget frozen to April") overrides it. A nightly job marks expired facts; scoring ignores them.
- **If it fails:** A fact with no usable window is not written
- **Acceptance:** A signal past its window does not appear in the timing score; a seeded "budget frozen to April" signal expires at the end of April.

### FND-05 Exclusions and suppression
- **Why:** Contacting a customer, a competitor or someone who opted out is the costliest mistake, so this check comes before everything else.
- **Input:** CRM customers, open deals, competitors, partners, paused segments, recent touches, do-not-contact, opt-outs
- **Output:** A pass or a hold with the reason
- **Rules:** One list with reason, source and date. Contains customers, open deals, competitors, partners, paused segments, recent touches, do-not-contact and opt-outs. Opt-outs are added by the rep in R1. Checked before segmentation, before any recommendation and before any send.
- **If it fails:** If the list cannot be read the action is held and goes to the owning rep
- **Acceptance:** An account in the list never reaches a queue; with the list unreadable nothing is routed and the rep sees the reason; a manual opt-out suppresses the contact in every later run.

### FND-06 Account timeline
- **Why:** A rep, and the AI, must see one account's whole story from first touch to today.
- **Input:** Signals, actions, decisions, sends, replies, outcomes
- **Output:** One timeline per account
- **Rules:** Orders signals, actions, decisions, sends, replies and outcomes by date with a link to the source row. Missing sources show as gaps, not silence.
- **If it fails:** A missing source is shown as a gap
- **Acceptance:** Any account opens a timeline from first touch to today with every item linked to its source.

### FND-07 Decision traces and audit trail
- **Why:** Any rank or action must be explainable later, with the evidence and the rules in force that day.
- **Input:** Every rank, approval, edit, hold, escalation
- **Output:** A decision record; an export
- **Rules:** Append-only. Each record carries actor, evidence, and the version of thresholds, tier table, prompts and rules in force. A failed write blocks the action.
- **If it fails:** If the write fails the action is blocked (nothing happens unlogged)
- **Acceptance:** After a rule change, an older decision still shows the old version; with the log write forced to fail, the action is not taken.

### FND-08 Write-time capture
- **Why:** Outcomes only teach the system if every send is logged with its exact cause.
- **Input:** An action at the moment it is sent
- **Output:** A capture row per send
- **Rules:** Captures person, segment, signal ids, message version, rule version and channel at the moment of send. A send made outside the system is rebuilt from the approval and flagged late capture.
- **If it fails:** A send outside the system is rebuilt from the approval and flagged "late capture"
- **Acceptance:** Each send read back from the mailbox has a capture row joined to its approval and signals; a manual send shows as late capture.

### FND-09 Knowledge Hub (retrieval, RAG)
- **Why:** Messages and assets must be grounded in the customer's own documents and cite them, so nothing is invented.
- **Input:** Datasheets, case studies, decks, proof points, brand templates, client documents
- **Output:** A searchable, quality-checked library with citations
- **Rules:** Per customer, never shared. Chunk, embed, index. Retrieval returns passages with page references. If no passage supports a claim the claim is not made.
- **If it fails:** No relevant document: no claim is made from it; the question goes to the content backlog
- **Acceptance:** A question about a seeded datasheet returns the passage and page; a question with no source returns "not found", not an answer.

### FND-10 Chat experience
- **Why:** Reps should ask, decide and act in one conversation, not across screens.
- **Input:** A question or an escalation
- **Output:** One conversation for asking, deciding and approving
- **Rules:** One conversation surface with cards for ranked lists, cited answers, drafts and escalations. Core questions in R1: what should I work on today; why is this account ranked here; show me this account's history; what needs my decision; what is this campaign.
- **If it fails:** Unrecognised question: ask to rephrase with examples; an agent failure is stated with the last good data
- **Acceptance:** Each of the five questions returns the right card on live data in under 5 seconds from cached data.

### FND-11 Backtest and evaluation harness
- **Why:** Nothing should reach reps until it has been tested on cases where the answer is already known.
- **Input:** 45 known accounts (15 won, 15 lost, 15 random); golden sets; hand-labelled replies
- **Output:** A pass or fail report; release blocked on fail
- **Rules:** Pass bars are suggested defaults agreed with each customer. Steps: pick known cases, run blind, compare, pass or fix, dry run, go live, monitor.
- **If it fails:** No client history: use the customer's CRM wins and losses or a peer set and mark the result provisional
- **Acceptance:** The scoring backtest runs on 15 won, 15 lost and 15 random accounts and writes a pass or fail report; a fail blocks release.

### FND-12 Versioned prompts, rules and cost logging
- **Why:** Prompts and rules change. Every change must be versioned, costed and reversible.
- **Input:** Every prompt, rule, tier table and model call
- **Output:** A version and a cost on every call
- **Rules:** Every prompt, rule set and tier table has a version. Cost per call, run and account is logged. Caps alert at 80% and stop non-essential runs at 100%.
- **If it fails:** A failed cost log raises an alert; the call proceeds
- **Acceptance:** Every model call row has a prompt version and a cost; a forced cap breach alerts at 80% and stops non-essential runs at 100%.

### FND-13 Lessons and objections store
- **Why:** Lessons from lost deals and objections must be stored so the system can use them later.
- **Input:** Replies, outcomes, rep edits
- **Output:** Lessons and winning replies per segment
- **Rules:** R1 creates the table only. Reasons from Disqualified replies and rep edits are captured from R2.
- **If it fails:** Not applicable until captured
- **Acceptance:** The table exists with tenant_id and links to account and outcome.

### FND-14 Escalation queue (human in the loop)
- **Why:** When the AI cannot decide, a named person must get the item with a reason, a deadline and a default.
- **Input:** Anything the AI cannot decide
- **Output:** A queue with owner, reason, due time, default
- **Rules:** Owner is the account owner (rep), the sales manager for campaigns, the admin for configuration. Each item has reason, due time (3 days default) and a default action on timeout.
- **If it fails:** If nobody acts by the due time the default applies: individual NBAs instead of an NBC, expire a draft, keep a record held
- **Acceptance:** Each seeded case the AI cannot decide creates an item with owner, reason, due time and default; an untouched item applies its default at the due time.

### FND-15 Customer configuration and onboarding
- **Why:** Each customer needs its own setup. Reaching a first ranked queue in four weeks depends on setup being configuration, not code.
- **Input:** The customer's ICP, CRM, closed-won field, tier table, thresholds, brand, autonomy policy
- **Output:** A configured tenant
- **Rules:** Configuration includes ICP, CRM field and value for closed-won, tier table, confidence bands, autonomy policy per segment, send windows, retention. Cold start: week 1 connect, week 2 load won and lost and draft scoring rules, week 3 backtest, week 4 first ranked queue.
- **If it fails:** Missing configuration blocks go-live with a named gap
- **Acceptance:** A new tenant can be configured without code and reaches a first ranked queue; the configuration is versioned.

### FND-16 Roles, tenancy and audit
- **Why:** Different people need different access, and one customer's data must never mix with another's.
- **Input:** Users, roles, territories
- **Output:** Access decisions and an audit log
- **Rules:** Roles: sales rep, sales manager, sales leader, admin. Territory-based access. Access check fails closed. Append-only audit of configuration and access changes.
- **If it fails:** Access check fails closed
- **Acceptance:** A rep sees only own territory accounts; an admin change to a role is in the audit log; a failed access check denies.


## 01 Prospecting and enrichment

### PRO-01 ICP definition
- **Why:** The customer may or may not know their ICP. Either way a confirmed ICP is needed to start.
- **Input:** Either the ICP the customer shares (typed in chat, a form or a document), or, if they are unsure, their website and a short interview; past won accounts where the CRM has them
- **Output:** A confirmed, versioned ICP filter per customer
- **Rules:** Path A: the customer shares an ICP in chat, a form or a document; the AI parses it and shows it back. Path B: the customer does not know; the AI reads the website and, where useful, interviews, then proposes an ICP and a sample of matching accounts. The admin edits and confirms. Versioned.
- **If it fails:** Website unreadable or interview unfinished: ask for the ICP in a form
- **Acceptance:** Path A: a pasted ICP becomes structured criteria and weights the admin can confirm. Path B: from a website alone the AI proposes an ICP and a sample list within one session; nothing is searched until the ICP is confirmed.

### PRO-02 Account search
- **Why:** The confirmed ICP must turn into a list of real candidate accounts and contacts.
- **Input:** The confirmed ICP filter
- **Output:** A candidate list
- **Rules:** Queries use only free attributes at this stage. A provider failure moves to the next; all failing serves a cached list flagged as cached.
- **If it fails:** One provider down: the next; all down: cached list flagged
- **Acceptance:** A confirmed ICP returns a candidate list with firmographics and titles and no paid enrichment calls.

### PRO-03 Waterfall aggregation
- **Why:** No single data provider is complete. Trying the cheapest first controls cost.
- **Input:** The shortlist
- **Output:** Raw records tagged by provider and how they were found
- **Rules:** Order Apollo, ZoomInfo, Lusha. An empty result triggers the next. Apollo first-try hits are accepted; ZoomInfo fallback hits are cross-checked against Lusha. Each record is tagged with provider and how it was found.
- **If it fails:** All providers fail: hold, retry next cycle, then escalate
- **Acceptance:** A record missing in Apollo is found in ZoomInfo and cross-checked; every record has its provider tag.

### PRO-04 Identity resolution and tiers
- **Why:** Providers can disagree. Each record needs a trust level so doubtful ones are not used blindly.
- **Input:** Raw records tagged by source
- **Output:** An identity-resolved record with tier I1 to I5
- **Rules:** I1 Apollo first try. I2 ZoomInfo fallback with Lusha agreeing. I3 ZoomInfo fallback with Lusha silent. I4 ZoomInfo fallback with Lusha disagreeing, held. I5 Lusha only, single-source.
- **If it fails:** I4 held; I3 proceeds as unconfirmed
- **Acceptance:** Seeded cases produce I1 to I5 as defined; an I4 record goes no further.

### PRO-05 Fit-matched list
- **Why:** Only accounts that fit should be paid for, so fit is judged on free attributes first.
- **Input:** Candidates; ICP; category research (RES-01)
- **Output:** The fit-matched list
- **Rules:** Cost rule: only candidates that pass the fit check proceed to paid enrichment. Weights come from the category research where available, otherwise equal and flagged.
- **If it fails:** Missing weights: equal weights, flagged
- **Acceptance:** A seeded poor-fit account is dropped before any enrichment call; the enrichment spend equals the number of passing accounts.

### PRO-07 CRM deduplication and identity match
- **Why:** The list must not contain existing customers or open deals.
- **Input:** The list; read access to the customer's CRM
- **Output:** A clean list; customers removed; name-only matches held
- **Rules:** Closed-won read from the customer's field and value. Domain match on both sides excludes with confidence. Name-only match is held, not dropped. A person links to a CRM contact at 70 confidence or more on a genuine identifying match. Read-only.
- **If it fails:** CRM unreachable: nothing passes to outreach until the check runs
- **Acceptance:** A customer account is excluded; a name-only match is held with a reason; no write call is made to the CRM.

### PRO-08 Enrichment and cross-check
- **Why:** Reps need verified contact details and company facts, paid for only when an account fits.
- **Input:** Reconciled records
- **Output:** An enriched, cross-checked record
- **Rules:** Firmographics, name, title, LinkedIn at match; verified email and phone only when triggered. Cross-check email domain with company and title with identity. ZoomInfo record stays Under Management 12 months at no further credit.
- **If it fails:** A contradiction is flagged, not accepted; an I4 record never arrives here
- **Acceptance:** Enriched records pass the domain and title cross-check; a contradiction is flagged and not accepted.

### PRO-09 Hand-off to signals and scoring
- **Why:** The next stages need the whole list and everything collected, not a summary.
- **Input:** The enriched list with identity tiers
- **Output:** The cumulative account record
- **Rules:** The whole list and every collected field pass on with no export.
- **If it fails:** Not applicable
- **Acceptance:** Signals and scoring read the list directly with identity tier, enrichment and exclusion flags.

### PRO-10 Held records and escalation
- **Why:** Doubtful records must not vanish or pass silently. They are held, retried, then given to a person.
- **Input:** Records held at identity, CRM match or profile change
- **Output:** Resolved or escalated records
- **Rules:** Retry on each refresh. After three failed cycles escalate. I3 is not escalated.
- **If it fails:** Not applicable
- **Acceptance:** A record held for three cycles creates an item for the rep or admin; an I3 record is not escalated.


## 02 Signals

### SIG-01 Signal registry
- **Why:** Every signal type needs a defined source, level, tier and window in one place.
- **Input:** The list of signals, sources, levels, tiers
- **Output:** The registry (section 9)
- **Rules:** Registry holds signal, level, source or API, capture method, signal tier, window and release. New signals start at the tier default.
- **If it fails:** Not applicable
- **Acceptance:** Every signal in the catalogue exists in the registry and can be switched on or off per customer.

### SIG-02 Capture: pull
- **Why:** Signals must be fetched for each target account on a schedule.
- **Input:** Accounts on the list; named sources
- **Output:** Raw items
- **Rules:** A match becomes a timestamped signal tied to an account; a non-match is discarded. Push events from competitor sources are reconciled to the target list.
- **If it fails:** Source down: last good run, stale
- **Acceptance:** A seeded event for a target account becomes a signal with a timestamp; one for a non-target account is discarded.

### SIG-03 Market signals
- **Why:** A whole sector moving (rules, energy, news) changes timing for many accounts at once.
- **Input:** Sector, region, regulatory topics
- **Output:** Dated, sourced market events
- **Rules:** Daily pull. Sources: GDELT, Firecrawl monitor, NewsCatcher, Exa Monitors, regulatory calendars.
- **If it fails:** One source down: another covers
- **Acceptance:** A seeded market event appears as a dated, sourced market signal within one daily run.

### SIG-04 Company signals
- **Why:** Events at an account (tenders, funding, hiring) are the clearest evidence of timing.
- **Input:** Each target account
- **Output:** Dated, sourced company events
- **Rules:** Per account pull. Sources: Crunchbase, PredictLeads, SEC EDGAR, BuiltWith, Apollo job postings, tender portals.
- **If it fails:** Licence missing: cached then seeded and labelled
- **Acceptance:** A seeded funding event for a target account becomes a company signal with its evidence passage and URL.

### SIG-05 Competitor signals
- **Why:** An account committed to a rival, or one that is weakening, is a reason to act now.
- **Input:** Accounts; named rivals
- **Output:** Dated, sourced competitor events
- **Rules:** Contract renewal, health decline, researching a rival, rival named in jobs or stack, rival pricing changes. Paid sources run on seeded labelled data until licensed.
- **If it fails:** Paid source missing: seeded, labelled
- **Acceptance:** A seeded rival-renewal window becomes a signal tier 1 with its source; a missing licence is labelled seeded.

### SIG-06 Personal signals
- **Why:** A new executive, or a champion's move, is a reason to reach a person now.
- **Input:** Contacts on the list
- **Output:** Dated, sourced person events
- **Rules:** A champion move removes the signal tied to the old role and creates one at the new company.
- **If it fails:** Not applicable
- **Acceptance:** A seeded champion move removes the old-role signal and creates a new one at the new company.

### SIG-12 Entry gate
- **Why:** A late or repeated signal should weigh less than a fresh first one.
- **Input:** A captured signal
- **Output:** A gated signal
- **Rules:** Recency is the age when the signal enters. Frequency counts repeats of the same type for the account. The same event from several sources is merged. Proposed: a repeat within 30 days counts at 0.5, 0.25 and 0.1 from the fifth.
- **If it fails:** Not applicable
- **Acceptance:** A signal entering after its full-weight period starts at its decayed weight; two sources reporting one event give one signal.

### SIG-13 Qualification filter
- **Why:** Only signals that are verifiable, predictive and time-bound should count.
- **Input:** A gated signal
- **Output:** A qualified signal, or a discard with the failed test
- **Rules:** Observable, predictive and time-bound must all pass. A failed signal is discarded with the failed test recorded.
- **If it fails:** An unclear signal is discarded
- **Acceptance:** "Headquartered in California" is discarded as not time-bound; an inferred company size is discarded as not observable; a funding round passes.

### SIG-14 Strength score (content in context)
- **Why:** Two events of the same type are not equally strong. The content decides.
- **Input:** A qualified signal
- **Output:** A strength score and a relevance note
- **Rules:** Strength scale 1 to 5 (proposed). The AI reads what the signal says. LLM failure sets strength 3 and flags it.
- **If it fails:** LLM fails: strength 3, flagged unreviewed
- **Acceptance:** Two funding announcements of different substance receive different strengths with a note.

### SIG-15 Tier, decay and expiry
- **Why:** Signals fade at different speeds. The tier sets the points and the decay.
- **Input:** A scored signal
- **Output:** A tier, a decay curve and an expiry
- **Rules:** Signal tier 1: 100 points, full 48 to 72 hours, near zero by day 7 to 14. Signal tier 2: 60 points, full 1 to 2 weeks, fades over 30 to 60 days. Signal tier 3: 30 points, slow 60 to 90 days.
- **If it fails:** Not applicable
- **Acceptance:** A tier 1 signal is near zero by day 14; a tier 3 signal still counts at day 60.

### SIG-16 Disqualifiers and persona mapping
- **Why:** A signal that no longer applies (a champion moved) must be removed, and each signal tied to the right persona.
- **Input:** A tiered signal
- **Output:** A persona-mapped signal
- **Rules:** Persona taken from the signal's subject (a CFO move maps to the economic buyer). Source kept.
- **If it fails:** Not applicable
- **Acceptance:** Each signal carries a persona and a source.

### SIG-21 LinkedIn engagement signals
- **Why:** Comments, likes and shares on LinkedIn show interest, but only if the content shows the interest is relevant.
- **Input:** Comments, likes and shares by contacts at target accounts on LinkedIn posts: the customer's own company page and rep posts, and posts by the account, from licensed engagement providers
- **Output:** Dated, sourced engagement signals with a relevance judgement
- **Rules:** Content in context: the AI reads the post and the comment. A like on an unrelated post is discarded at the qualification filter. Comment asking a question on a relevant post is strong. Proposed signal tiers: comment 2, share with comment 2, share 3, like 3. Source per PD27; seeded and labelled until licensed.
- **If it fails:** Source not licensed: seeded and labelled; relevance unclear: strength 2, flagged
- **Acceptance:** A seeded question-comment on a relevant post becomes a strong signal with a relevance note; a seeded like on an unrelated post is discarded.


## 03 Lead scoring

### SCR-01 Fit score
- **Why:** Reps need to know how well an account matches the ICP.
- **Input:** Account attributes; ICP criteria and weights
- **Output:** A fit score
- **Rules:** Weighted ICP match 0 to 100 on account attributes. Missing attributes hold the account unranked; a default fit is never invented.
- **If it fails:** Missing attributes: held unranked, never a default fit
- **Acceptance:** A seeded account with all attributes receives a fit score; one with a missing key attribute stays unranked with the reason.

### SCR-02 Timing score
- **Why:** Timing must reflect how many live signals there are, and how fresh and strong they are.
- **Input:** Live signals after decay
- **Output:** A timing score
- **Rules:** Timing = S1 + 0.5 x S2 + 0.25 x S3 + 0.125 x S4 and so on, signals ordered strongest first after decay. No cap.
- **If it fails:** No live signal: timing 0
- **Acceptance:** Fit 80 with decayed signals 34.5, 6.25 and 2.1 gives timing 38.15.

### SCR-03 Rank and account tiers
- **Why:** Ranking by fit times timing puts accounts that fit and are ready first. A good fit with nothing happening ranks zero.
- **Input:** Fit and timing
- **Output:** Rank and tier
- **Rules:** Rank = Fit x Timing. Account tier A top 15%, B next 25%, C the rest (proposed). Disqualifiers subtract.
- **If it fails:** Not applicable
- **Acceptance:** Fit 80 and timing 38.15 ranks 3,052; fit 95 with no live signal ranks 0; tier bands apply by percentile.

### SCR-04 Why line and calibrated confidence
- **Why:** A rank needs a one-line reason and an honest confidence.
- **Input:** The signal stack; identity tier
- **Output:** A why line and a confidence value
- **Rules:** The why line is built from the top signals; the confidence flag from identity tier, source count, strength and evidence. LLM failure falls back to a template from the top two signals.
- **If it fails:** LLM down: template from the top two signals
- **Acceptance:** Every ranked account shows a one-line why and a confidence; a forced LLM failure still shows the template line.

### SCR-05 Scoring backtest gate
- **Why:** Scoring must be proven on known won and lost accounts before reps rely on it.
- **Input:** 15 won, 15 lost, 15 random accounts
- **Output:** Pass or fix before go live
- **Rules:** Bars: at least 12 of 15 won in Tier A or B; at most 3 of 15 lost; no tier above 40% of the random set. Below 12 fix and rerun twice; below 9 sell research, not scoring.
- **If it fails:** Below 9 of 15 won: sell research, not scoring
- **Acceptance:** The report shows each bar with its result; the release is blocked on a fail.


## 04 Segmentation

### SEG-01 Niche taxonomy
- **Why:** Messages and plays must fit the customer's niche, not only the industry.
- **Input:** Account attributes and description
- **Output:** A niche
- **Rules:** Fixed taxonomy below industry (plant or process type). Low confidence leaves it unclassified and tells the rep.
- **If it fails:** Low confidence: unclassified, to the rep
- **Acceptance:** Seeded accounts land in the right niche; a low-confidence one is unclassified with a reason.

### SEG-02 Microsegments
- **Why:** What triggered the account decides the angle of the message.
- **Input:** Niche and strongest trigger
- **Output:** A microsegment
- **Rules:** Niche x trigger: funding, exec hire, compliance deadline, breach, tech-stack, M&A. A first-pass thesis.
- **If it fails:** No trigger: niche only
- **Acceptance:** Each seeded account with a trigger receives a microsegment tag.

### SEG-03 Personas
- **Why:** The message depends on who is being contacted.
- **Input:** Contact titles
- **Output:** A persona per contact
- **Rules:** Title rules first, LLM as fallback. Personas: buyer, technical lead, operations, procurement.
- **If it fails:** Unknown: generic persona, flagged
- **Acceptance:** Seeded titles map to the expected persona; an unknown title gets a generic persona and a flag.

### SEG-04 Exclusion and recent-touch check
- **Why:** Nothing may be routed to an excluded account, or one touched recently.
- **Input:** Exclusions; CRM; send history
- **Output:** Pass or hold with reason
- **Rules:** Checks customers, open deals, competitors, partners, paused segments and recent touches before routing. Fail closed.
- **If it fails:** Fail closed
- **Acceptance:** A seeded recently touched account is held with the reason; with the check unreadable nothing routes.

### SEG-07 NBC eligibility rule
- **Why:** A group sharing a trigger is best worked as one campaign. A rule decides when.
- **Input:** Microsegment counts
- **Output:** A campaign flag
- **Rules:** The rule that decides NBA or NBC: 10 or more accounts in the same microsegment within a rolling 7 days (default). Below it each account gets an NBA.
- **If it fails:** Not applicable
- **Acceptance:** 11 seeded accounts sharing one microsegment in 7 days raise one campaign flag; 9 do not.


## 05 Next best action and campaign

### NBA-01 De-dup gate and history
- **Why:** Two reps must not work the same live opportunity, and history must inform the message.
- **Input:** Ranked account; CRM
- **Output:** Blocked or cleared account with history
- **Rules:** Gate: an active owner or an open opportunity holds the account; nothing downstream runs. History always passes forward.
- **If it fails:** CRM down: hold the action
- **Acceptance:** A seeded account with an open opportunity is held; its history appears in the brief of an account that passes.

### NBA-04 Message structure selection
- **Why:** Messages need a proven structure. Until one is proven, the draft is marked unproven.
- **Input:** The segment; outcome history
- **Output:** A message structure and its status
- **Rules:** The AI writes every message. The cache stores structure, never text. In R1 no structure is validated, so each draft is a provisional structure flagged unproven.
- **If it fails:** Miss: to the rep
- **Acceptance:** Each R1 draft carries the status unproven and the structure used.

### NBA-05 NBA brief
- **Why:** A rep needs one decided action: who, what, channel, why now, with the evidence.
- **Input:** Score, signals and evidence, contact, segment, history, motivation tag, category research
- **Output:** One brief per account
- **Rules:** One brief per account: who, what, channel, why now, draft, signals cited, format (plain text in R1).
- **If it fails:** LLM fails: no draft, to the rep with signals attached
- **Acceptance:** A brief shows all six parts and every signal cited links to its source.

### NBA-06 Channel selection
- **Why:** The channel should be chosen from verified data and from what has worked.
- **Input:** Verified contact data, warm-path strength, signal urgency, history
- **Output:** A channel
- **Rules:** Channel chosen from verified contact data, signal urgency and history. A channel that failed before is not repeated blindly.
- **If it fails:** No verified channel: to the rep
- **Acceptance:** A contact with no verified email gets LinkedIn; a channel that failed on the account is not chosen again.

### NBA-07 Message verification
- **Why:** Nothing unsupported or off-brand should go out.
- **Input:** The draft; Content Library; evidence
- **Output:** A verified draft or a flagged one
- **Rules:** Claims must match an approved claim or cite evidence; tone and style rules; banned phrases; a second AI checks facts and tone.
- **If it fails:** Unsupported claim: removed, or to the rep
- **Acceptance:** A draft with a banned phrase or an unsupported claim is flagged or corrected before routing.

### NBA-08 Confidence routing and criteria
- **Why:** The AI should decide what it can and give a person only what it cannot.
- **Input:** Confidence; verification result; protective checks; identity tier; autonomy policy
- **Output:** A route and the reason
- **Rules:** Proceeds on its own only when confidence is high, verification passes, every protective check passes, identity tier is I1 or I2 and the segment policy allows it. Anything failing a criterion becomes an approval card. Low confidence goes to nurture. NBC always goes to the manager.
- **If it fails:** Not applicable
- **Acceptance:** Seeded cases show proceed, card, nurture and manager routing exactly as the criteria say; a case failing one criterion gets a card with the failed criterion named.

### NBA-09 Approval card (escalations only)
- **Why:** A person decides the items that fail a criterion, and every campaign.
- **Input:** A routed action that failed a criterion, or an NBC
- **Output:** A decision
- **Rules:** Shown only for failed criteria and for every NBC. Approve, edit or skip. Edits stored as diffs. No action in 3 days expires and re-ranks.
- **If it fails:** No action in 3 days (default): expire and re-rank
- **Acceptance:** An item meeting all criteria shows no card; an escalated item shows a card with the reason; an edit is stored as a diff.

### NBA-10 Ranked morning queue
- **Why:** Reps start the day with a ranked list of what changed and what to do.
- **Input:** Tier A and B accounts; overnight changes
- **Output:** A daily queue
- **Rules:** Built at 6am per rep for Tier A and B: what changed overnight, with a drafted action, in chat. A failed build shows yesterday marked as of.
- **If it fails:** Build fails: yesterday's queue marked "as of"
- **Acceptance:** The queue opens in under 2 seconds and lists accounts in rank order with a why and a draft; a forced failure shows yesterday's queue marked as of.

### NBA-11 NBC detection and brief
- **Why:** A trigger shared by many accounts is worth one coordinated three-touch campaign.
- **Input:** Campaign flag (SEG-07); the accounts in the segment and their signals
- **Output:** A confirmed sequence for the segment
- **Rules:** Three touches: day 0 plain text; day 3 to 5 reinforces the angle and cites an existing asset or statistic from the Knowledge Hub; day 7 to 10 a direct ask. Manager confirms before start. Touches go to each owner as scheduled tasks. A logged reply removes that account's pending touches. Before each touch the protective checks and message verification run again; a failure holds that touch and escalates it to the owning rep. No answer in 3 days falls back to individual NBAs.
- **If it fails:** No answer in 3 days: fall back to individual NBAs
- **Acceptance:** A campaign flag produces a three-touch sequence; nothing starts until the manager confirms; a logged reply removes pending touches; a touch whose contact has become excluded is held and escalated; an unconfirmed campaign falls back to NBAs.

### NBA-15 Delivery and notifications
- **Why:** Actions must reach reps where they work.
- **Input:** An action
- **Output:** A delivered action
- **Rules:** Chat is always available. Slack and Teams push in R1; interactive in R2.
- **If it fails:** Channel down: chat
- **Acceptance:** An escalation arrives in chat and, where connected, as a Slack or Teams message with a link back.


## 06 Content

### CON-01 Content Library
- **Why:** Writers and checkers need one source of voice, tone, approved claims and banned phrases.
- **Input:** Voice and tone guide, brand guidelines, approved claims, banned phrases, templates, examples of bad drafts
- **Output:** Rules the writer and the verifier use
- **Rules:** Holds voice and tone, brand guidelines, approved claims with source and review date, banned phrases, templates, examples of bad drafts. R1 enforces it in message verification.
- **If it fails:** Missing library: generic style, flagged
- **Acceptance:** A banned phrase is blocked; a claim without an approved source is flagged; every approved claim shows its source and review date.


## 07 Campaign execution

### CMP-01 Interim sending via the rep's mailbox
- **Why:** Until integrated sending exists, reps send from their own mailbox, and the system must still capture each send.
- **Input:** A routed action
- **Output:** A logged send
- **Rules:** The rep sends from their own mailbox (Outlook through Microsoft Graph, or Gmail). The send is read back and logged. If read-back fails the rep logs it by hand.
- **If it fails:** Read-back fails: the rep logs it by hand
- **Acceptance:** A send from the rep's mailbox appears as a logged send with capture within 15 minutes.

### CMP-02 Autonomy policy and approval enforcement
- **Why:** The system must enforce who approves what, and when the AI may send alone.
- **Input:** Per-segment policy
- **Output:** A mode per segment
- **Rules:** Per segment: assisted (the rep sends with one click) or autopilot (the AI sends through the rep's connected mailbox within guardrails). Autopilot is off at the start and enabled per segment only after the backtest and a dry run. The system refuses a send whose required approval is missing.
- **If it fails:** Policy unreadable: assisted
- **Acceptance:** With autopilot off nothing is sent without the rep's click; a send missing a required approval is refused and logged.


## 08 Response tracking

### RSP-01 Replies logged
- **Why:** Every reply must be saved against its account.
- **Input:** Email and CRM feeds; send log
- **Output:** Replies on the timeline
- **Rules:** Match each reply to its send and contact; log it on the timeline. Opt-outs are added by the rep in R1.
- **If it fails:** Unmatched: to the rep
- **Acceptance:** A reply to a logged send appears on the timeline against the right account and contact.


## 09 Learning, analytics and quota

### LRN-01 Decision log and baseline
- **Why:** Every decision must be logged, and today's numbers recorded as the baseline.
- **Input:** Decisions; today's funnel
- **Output:** A baseline
- **Rules:** Every decision logged. Today's funnel numbers recorded as the baseline snapshot.
- **If it fails:** Snapshot fails: retried next day
- **Acceptance:** The baseline snapshot exists before the first rep goes live.

### LRN-02 Outcome logging
- **Why:** Outcomes, hits and misses alike, are what the system learns from.
- **Input:** Meetings booked or not, with the microsegment, structure and channel used
- **Output:** Outcomes
- **Rules:** Log meetings booked or not with microsegment, structure and channel. Success and miss both count.
- **If it fails:** Not applicable
- **Acceptance:** A booked meeting and a non-converted send each create an outcome row linked to the send.


## Research agent

### RES-01 Category research
- **Why:** We need to know why customers in the category buy, and what they cite.
- **Input:** G2, competitor pages, Verid
- **Output:** A reference set
- **Rules:** Built once at onboarding from G2, competitor pages and Verid: who buys this category, why, what they cite. Manual reference set if the sources are unavailable.
- **If it fails:** Not applicable
- **Acceptance:** A reference set exists for the customer's category with sources and feeds the fit weights.


## Morning workflows (chat)

### WRK-04 Show me this account's history
- **Why:** A rep needs one account's whole history before a call.
- **Input:** "Show me this account's history."
- **Output:** First touch to today with the next step and source
- **Rules:** Builds the timeline: signals, actions, reasons, outcomes, buying committee where known. The rep approves the next step.
- **If it fails:** Not applicable
- **Acceptance:** Asking for an account's history returns the timeline and a next step with its source.


## Channels and integrations

### INT-01 CRM connectors
- **Why:** The customer's CRM stays the record. We read it so we never contact customers or open deals, and we never write to it.
- **Input:** CRM credentials
- **Output:** CRM data in
- **Rules:** Salesforce, HubSpot and Dynamics 365, read-only. The first customer's CRM first. CRM down serves the last snapshot and holds checks that need it.
- **If it fails:** CRM down: last snapshot; checks that need the CRM hold
- **Acceptance:** Accounts, contacts, deals, stages and the closed-won field are read; no write call is made.

### INT-02 Email and calendar connectors
- **Why:** Sends, replies and meetings live in email and calendar.
- **Input:** Microsoft Graph (Outlook); Gmail and Google Calendar
- **Output:** Mail and meetings in memory
- **Rules:** Microsoft Graph (Outlook, Calendar) and Gmail with Google Calendar. Read sends, replies and meetings; send as the rep.
- **If it fails:** Auth lapses: rep re-authenticates
- **Acceptance:** A rep's sent mail and replies are read and matched; an expired authorisation prompts the rep to reconnect.

### INT-03 Slack bot
- **Why:** Reps work in Slack and need alerts and actions there.
- **Input:** Slack workspace
- **Output:** Notifications; actions in Slack
- **Rules:** Push notifications of actions and alerts, with a link to chat.
- **If it fails:** Slack down: chat
- **Acceptance:** A new escalation posts to the rep's Slack with a link; if Slack is down it appears in chat.

### INT-04 Microsoft Teams bot
- **Why:** Reps work in Teams and need alerts and actions there.
- **Input:** Teams tenant
- **Output:** Notifications; actions in Teams
- **Rules:** Same as Slack for Teams.
- **If it fails:** Teams down: chat
- **Acceptance:** A new escalation posts to the rep's Teams with a link; if Teams is down it appears in chat.

