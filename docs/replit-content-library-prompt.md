# Content library: Replit prompt

These are the build instructions for the Content library in the DemandAI POC (`07-content.html`, with the brand pack in `demandai-engine.js`). Paste everything below the line into Replit. The library is the **versioned brand pack**: every message the system drafts is checked against it.

**What the demo does today.** Everything lives in the browser. An uploaded guideline file is only read if it is text or Markdown. The call-to-action tools and sign-off are greyed. The prompt below keeps the greyed parts greyed, but builds them as real data.

---

Build a **Content library** module for a B2B demand-generation app called DemandAI.

- **Stack:** React and TypeScript on the front end, Node/Express on the back end, Postgres.
- **Style:** clean and plain. White cards, 8px corners, one accent colour, no gradients.

**Purpose.** Hold the brand pack every outbound message must follow: voice, banned words, competitors, approved claims and messaging frameworks. List the content pieces (blogs, whitepapers) that may be attached to messages. The brand pack is **versioned**. Edits go to a draft, and only reach drafting when saved as a new version.

**Roles**

- Admin and Sales manager can edit.
- Everyone else sees the page read-only, with the note: "View only: the admin and the sales manager maintain the brand pack."
- Enforce this on the API.

**Top bar**

- Title "Content library" and a badge "Brand vN".
- Tabs, in this order: Brand guidelines · Messaging frameworks · Voice and tone · Negative keywords · Approved claims · Content · Versions.
- A dot on a tab means it has unsaved changes.
- `?tab=` in the URL opens that tab.

**Save bar**

- Shows whenever the draft differs from the live version.
- Text: "N unsaved changes in {sections}. Saving makes Brand vN+1".
- Buttons:
  - **See changes:** a modal listing each change, such as `Voice: preset Direct → Formal` or `Negative keywords: added "synergy"`.
  - **Discard:** asks to confirm, then drops the draft.
  - **Save as vN+1:** asks for an optional note, then publishes.
- Publishing:
  1. Sets the version to the live version + 1.
  2. Archives the old live pack.
  3. Records who, when, the note, the sections changed and the list of changes.
- Every message the system drafts stores the brand version it used.

**Tab 1 · Brand guidelines**

- **"Brand guideline document" card:**
  - Upload .pdf, .doc, .docx, .ppt, .pptx, .txt or .md. Show Open and Remove.
  - Parse text and Markdown files for plain rules, and list them under "Rules found in the document", each with "Add to the draft". Recognise these lines:
    - "Never use: a, b"
    - "Competitors: x, y"
    - "Never open with: …"
    - "Keep emails under N words"
    - "Keep sentences under N words"
    - "Always sign off as: …"
    - "No exclamation marks"
  - Keep other formats as reference only.
- **"Key rules from the guidelines, in your words":** a textarea.
- **"Samples" card:** three downloadable Markdown samples (full guideline, email guideline, voice and tone), each with Preview and Download. The full guideline has seven sections:
  1. Brand at a glance
  2. Who we write for
  3. Voice and tone
  4. Words we never use
  5. Claims and proof
  6. Email rules
  7. Visual basics

**Tab 2 · Messaging frameworks**

- Stat tiles: Used often / sometimes / rarely / Not used. Clicking one filters the table.
- Table columns: Objective · Framework and its steps · Call to action · How often used · Edit.
- The Call to action column is greyed, with the badge "After the pilot". It shows the action label and the tool logos.
- The Edit modal changes the name, steps and usage. The call-to-action checkboxes are disabled.
- Seed these frameworks (objective → framework: steps · usage · actions):

  | Objective | Framework | Steps | Usage | Actions |
  |---|---|---|---|---|
  | Book a first meeting | Trigger, insight, ask | their trigger; one insight or approved proof; one clear ask | Often | meeting, reply |
  | Answer an inquiry | Question, answer, next step | restate the question; answer briefly; offer a short call | Often | ticket, form, call |
  | Start a migration conversation | Problem, agitate, solve | — | Sometimes | meeting, content |
  | Review a renewal | Before, after, bridge | — | Sometimes | meeting, form |
  | Introduce ourselves to a new leader | Give, then ask | — | Sometimes | content, meeting |
  | Re-engage after they read our content | Attention, interest, desire, action | — | Rarely | content, event |
  | Blogs and whitepapers | Problem, approach, evidence, next step | — | Often | content, form |

- Call-to-action types and their tools:

  | Type | Label | Tools |
  |---|---|---|
  | meeting | Book a meeting | Google Calendar, Calendly, Microsoft Teams |
  | call | Request a call | Microsoft Teams, Zoom, Google Meet |
  | ticket | Raise a support ticket | Zendesk, Jira Service Management |
  | form | Fill in a short form | HubSpot, Google Forms, Typeform |
  | content | Read or download content | — |
  | event | Register for a session | Zoom, Webex, Microsoft Teams |
  | reply | Reply to the email | — |

- A greyed "Being explored" block: map frameworks to customer journey stages.

**Tab 3 · Voice and tone**

- Three preset buttons:
  - **Direct:** "Hi {first}," / "Best,". Short sentences, the prospect's own trigger first, one point, one question.
  - **Formal:** "Dear {first}," / "Kind regards,". Complete sentences, courteous ask, no contractions.
  - **Warm:** "Hi {first}," / "All the best,". Friendly, still one point and one ask.
- Only the selected preset's sample message shows, and it changes when the preset changes.
- Card "Rules every draft must meet":
  - Sign-off text (default "Client Team")
  - Email length, in words (default 120)
  - Sentence length, in words (default 35)
  - "No exclamation marks" toggle (on)
  - Openers to avoid, as chips: "I hope this email finds you well", "Just checking in", "Hope you are well"
- A greyed "Being explored" block: personalities per piece of content; email header, footer and opt-out line.

**Tab 4 · Negative keywords**

- A chips editor for banned words. Seed: guarantee, guaranteed, best-in-class, best in class, world-class, cheapest, risk-free, no-brainer, 100%.
- A chips editor for competitor names (empty by default).
- A read-only note, "Always checked":
  - pricing terms ($ amounts, USD, price, pricing, discount, free of charge);
  - sensitive terms: incident, accident, explosion, fatality, injury, lawsuit, security, cyber, breach, vulnerability, regulation, compliance, emission. These send a message to the sales manager for approval.

**Tab 5 · Approved claims (fully functional)**

- **Toolbar:** search, topic select (the micro-segments), status select (Approved / Draft / Retired / Expired), "From For Review (n)" and "Add a claim".
- **Table columns:** Claim (title, then the claim text) · Topics · Expires · Last used · Status.
  - Expired = an expiry date before today. Show it in red.
  - "Used after expiry" is a warning count.
- **Right pane:** Source (type and year), Topics it fits, Owner, Expires, Where it was used (the messages that cited it), In content (the pieces that cite it), and an expiry alert. Editable status select and expiry date.
- **Add a claim:**
  - Fields: claim text, source type, year, title, expiry, owner.
  - Auto-assign the id `CL-NN`.
  - Suggest topics from keywords in the text.
  - Status starts as `approved`.
- **"From For Review":** lists sentences reviewers approved in edited messages that cite no claim. Each has "Make it a claim", which pre-fills the form.
- **Seed six claims** (id · type · year · title · topics · expiry · claim text):

  | Id | Type | Year | Title | Topics | Expires | Claim |
  |---|---|---|---|---|---|---|
  | CS-01 | Case study | 2025 | Legacy control system migration in one planned shutdown | Modernisation, Inquiry, Engagement | 2027-06-30 | "A comparable refinery moved its legacy control system to a current platform within one planned shutdown." |
  | OP-02 | One-pager | 2026 | Site assessment overview | Modernisation | 2027-03-31 | "A site assessment takes two days on site and ends with a prioritised upgrade list." |
  | BR-03 | Brochure | 2026 | Lifecycle services overview | Service renewal, Modernisation | 2027-01-31 | "Lifecycle service plans can cover planned upgrades as well as support." |
  | CS-04 | Case study | 2024 | Gas plant expansion: control scope fixed at front-end design | Project | 2027-12-31 | "On a comparable gas plant expansion, settling the control scope at front-end design kept the project on schedule." |
  | WB-05 | Webinar recording | 2026 | Modernising legacy control systems | Engagement | 2027-09-30 | "The session recording walks through how comparable sites sequenced their migration." |
  | PS-06 | Peer story | 2023 | First 100 days: setting automation priorities | Leadership | 2026-06-30 | "A plant manager in a similar role set automation priorities within the first hundred days." |

  PS-06 is already expired, so the red state can be tested.
- **Citation format in messages:** `[Type, Year]`.

**Tab 6 · Content**

- **Tiles:** In the library · Drafts in Content studio · In messages · Cite approved claims.
- **"i" popover, "How content gets here":**
  1. Write it in Content studio.
  2. Brand and claim checks pass.
  3. Add it to the Content library.
  4. Reps add it to messages.
  5. Marketing and legal sign-off (After the pilot).
- **Table columns:** Content (title, type, audience) · Status (In the library / Draft / "N checks to fix") · Sign-off (greyed, "After the pilot") · Claims it cites (each opens the claim pane) · In messages (count) · Open · Download Word.
- Pieces come from a `content_items` table, which Content studio will write to.

**Tab 7 · Versions**

- One row per version: vN, an "In use" badge on the live one, the note, section tags, and the date and author ("Kickoff" for v1).
- Click a row to expand its list of changes.
- "Restore as a new version" copies an old version into the draft.

**Data model**

- `brand_versions(id, version, status draft|live|archived, pack jsonb, note, sections text[], changes jsonb, created_by, created_at, published_at)`
  - `pack` = `{voice, negative[], competitors[], claims[], frameworks[], guideline}`
- `claims(id, type, year, title, topics text[], expiry date, claim, status approved|draft|retired, owner, created_by, created_at)`
- `claim_usage(claim_id, message_id, used_at, after_expiry bool)`
- `guideline_files(id, name, size, mime, storage_url, uploaded_by, uploaded_at, rules_found jsonb)`
- `content_items(id, type blog|whitepaper, title, topic, segment, tone, length, sources text[], status Draft|Ready, brand_version, html, created_by, updated_at)`

**API**

- `GET /api/brand?version=live|draft|N`
- `PATCH /api/brand/draft`
- `GET /api/brand/draft/diff`
- `POST /api/brand/publish {note}`
- `DELETE /api/brand/draft`
- `GET /api/brand/versions`
- `POST /api/brand/versions/:v/restore`
- `GET /api/claims?search=&topic=&status=`
- `POST /api/claims`
- `PATCH /api/claims/:id`
- `GET /api/claims/:id/usage`
- `GET /api/claims/candidates`
- `POST /api/guidelines` (upload)
- `GET /api/content`

**Shared check function**

Export `checkMessage(text, brandPack)` for the drafting engine. It returns flags `{rule, detail}` for:

- banned words;
- competitor names;
- pricing terms;
- sensitive terms;
- banned openers;
- exclamation marks (when that rule is on);
- word count over the maximum;
- sentences over the maximum;
- a factual claim without a `[Type, Year]` citation to an approved, unexpired claim.

Write unit tests for each rule.

**Acceptance checks**

1. Editing a banned word shows the save bar. "See changes" lists it. Saving makes v2, and Versions shows v2 with that change.
2. A Viewer can't edit, and the API rejects their writes.
3. PS-06 shows as expired.
4. Adding a claim gives `CL-07` with suggested topics.
5. `checkMessage("We guarantee zero downtime!")` flags the banned word and the exclamation mark.
