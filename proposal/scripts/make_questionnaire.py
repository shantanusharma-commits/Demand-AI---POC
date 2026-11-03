"""Setup questionnaire for the pilot: every question we need answered to set up the platform, grouped by the three
questions the platform answers (who to target, why now and what to do, what to say) plus measurement and logistics.
The six marked "Ask live" are the ones on the deck's "Six questions for today" slide; the rest are sent ahead.
Usage: python3 make_questionnaire.py <out.xlsx>"""
import sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

OUT = sys.argv[1]
LIVE = 'Ask live'; AHEAD = 'Send ahead'
SM, MK, OPS, IT, LEAD = 'Sales manager', 'Marketing', 'Sales operations', 'IT / InfoSec', 'Sales leadership'
Q = [
 # area, question, why we need it (what it sets up), example answer / format, priority, usually answered by
 ('1. Who to target', 'Ideal customer & fit', 'Which accounts and roles are your best customers, and which do you never pursue?', 'Sets the ideal-customer (fit) score and the fit floor', 'Refineries and petrochemical sites over 50,000 bpd; plant and instrumentation managers. Never: distributors, sites under 10,000 bpd', LIVE, SM),
 ('1. Who to target', 'Ideal customer & fit', 'Which industries and site types are core, adjacent, or out of scope?', 'Sets the vertical part of the fit score', 'Core: refining. Adjacent: chemicals, LNG. Out: food, retail', AHEAD, SM),
 ('1. Who to target', 'Ideal customer & fit', 'What company size or site capacity makes an account worth pursuing?', 'Sets the size and site parts of the fit score', 'Revenue over USD 500m, or capacity over 50,000 bpd', AHEAD, SM),
 ('1. Who to target', 'Ideal customer & fit', 'Which roles and seniority do you approach first, and who else is involved in the decision?', 'Sets the primary and secondary personas', 'First: instrumentation manager. Also: plant manager, operations director', AHEAD, SM),
 ('1. Who to target', 'Ideal customer & fit', 'Do you treat existing customers and net-new accounts differently?', 'Sets the relationship part of the fit score and the actions', 'Existing customers: renewal and upgrade plays. Net-new: introduce and educate', AHEAD, SM),
 ('1. Who to target', 'Ideal customer & fit', 'Are some accounts managed separately (key accounts, partners), and should the pilot leave them out?', 'Marks accounts the platform must not touch', 'Yes: a list of 40 key accounts handled by the KAM team', AHEAD, SM),
 ('1. Who to target', 'Lead lists & data', 'Where do lead lists come from today: CRM, events, bought data, partners?', 'Tells us which files to expect and how they are shaped', 'CRM export monthly; event lists after each trade show', AHEAD, OPS),
 ('1. Who to target', 'Lead lists & data', 'How many accounts and contacts are in scope for the pilot business unit?', 'Sizes the pilot lists', 'About 1,500 accounts, 4,000 contacts', AHEAD, OPS),
 ('1. Who to target', 'Lead lists & data', 'Who owns each account, and where is that recorded?', 'Assigns each prospect to the right rep', 'Account owner field in the CRM', AHEAD, OPS),
 ('1. Who to target', 'Lead lists & data', 'How are duplicates, opt-outs and consent recorded today?', 'Sets the list checks and who can be contacted', 'Opt-out flag in the CRM; consent basis not recorded', AHEAD, OPS),
 ('1. Who to target', 'Lead lists & data', 'How often are lists refreshed?', 'Sets how often lists are re-scored', 'Monthly', AHEAD, OPS),
 ('2. Why now & what to do', 'Buying signals', 'Which buying signals matter most to you, and where does each come from?', 'Sets the signal types and their weights', 'RFQs from the web form; end of support from the installed base; projects from news', LIVE, SM),
 ('2. Why now & what to do', 'Buying signals', 'How long does each signal stay relevant?', 'Sets how fast each signal fades', 'An inquiry: 30 days. A capital project: up to a year', AHEAD, SM),
 ('2. Why now & what to do', 'Buying signals', 'Do you track installed-base, end-of-support and contract renewal dates?', 'Enables the Modernisation and Service renewal segments', 'Yes, in the service system; export available', AHEAD, OPS),
 ('2. Why now & what to do', 'Buying signals', 'Which signals do you have for net-new accounts: hiring, new plants, LinkedIn activity, news?', 'Sets the signal types the Admin adds in Setup', 'Job postings and project news from a subscription feed', AHEAD, MK),
 ('2. Why now & what to do', 'Buying signals', 'Can you share 6 to 12 months of signals for the pilot accounts, with outcomes?', 'Data to tune and test the pilot (80% tune, 20% test)', 'Excel export: account, signal, date, outcome', AHEAD, OPS),
 ('2. Why now & what to do', 'Prioritising & segments', 'How do reps decide what to do next today, and which channels can they use?', 'Sets the action library and allowed channels', 'Call for inquiries, email for content follow-up; LinkedIn allowed, phone only for existing customers', AHEAD, SM),
 ('2. Why now & what to do', 'Prioritising & segments', 'How do reps decide which accounts to work this week?', 'Checks the ranking against how your team works', 'Open opportunities first, then whoever was touched last', AHEAD, SM),
 ('2. Why now & what to do', 'Prioritising & segments', 'Do you group accounts by their reason to buy? Which groups would you set up in advance?', 'The Admin sets these segments up in Setup, so they need no approval', 'Modernisation, renewals, new projects, new plants', AHEAD, SM),
 ('2. Why now & what to do', 'Prioritising & segments', 'Who approves a new segment or a sensitive message?', 'Sets who reviews what in For Review and Approvals', 'The sales manager of the business unit', LIVE, SM),
 ('2. Why now & what to do', 'Actions & channels', 'What does a rep do in each situation: call, site assessment, renewal review, case study, event invite?', 'Fills the action library, per segment, in order', 'Inquiry: call within 2 days. End of support: offer a migration assessment', AHEAD, SM),
 ('2. Why now & what to do', 'Actions & channels', 'Which channels are allowed in each country: email, LinkedIn, phone?', 'Sets the channel limits', 'Email and LinkedIn everywhere; phone only with existing customers', AHEAD, SM),
 ('2. Why now & what to do', 'Actions & channels', 'What is a typical first deal size per segment?', 'Sets the deal-size check: smaller deals go to a person', 'Modernisation USD 500k; service renewal USD 150k', AHEAD, SM),
 ('2. Why now & what to do', 'Actions & channels', 'How many accounts can a rep act on each week?', 'Caps each rep\'s daily list', '40 to 60 a week', AHEAD, SM),
 ('2. Why now & what to do', 'Actions & channels', 'Who picks up accounts with no rep?', 'Routes unowned accounts', 'The inside sales team', AHEAD, SM),
 ('3. What to say', 'Messaging & content', 'Do you have brand guidelines and approved claims or case studies?', 'Fills the content library: voice, claims, proof', 'Brand book PDF; 20 case studies with owners and review dates', LIVE, MK),
 ('3. What to say', 'Messaging & content', 'What tone of voice do you use with prospects, and how do you sign off?', 'Sets the brand voice for drafts', 'Plain, technical, no hype; signed by the rep', AHEAD, MK),
 ('3. What to say', 'Messaging & content', 'Which words, claims and competitor names must never appear?', 'Sets the banned words and competitor checks', 'No "guarantee", no pricing, no competitor names', AHEAD, MK),
 ('3. What to say', 'Messaging & content', 'Is there a library of approved claims, with an owner and expiry date for each?', 'Only approved, unexpired claims are cited', 'Yes, in SharePoint, reviewed yearly', AHEAD, MK),
 ('3. What to say', 'Messaging & content', 'Do you have plays or messaging frameworks per segment?', 'Sets the angle for each segment\'s first message', 'Migration play, renewal play', AHEAD, MK),
 ('3. What to say', 'Messaging & content', 'How are first messages written today, and how long do they take?', 'Part of the G1 baseline', 'By the rep, about 20 minutes each', AHEAD, SM),
 ('3. What to say', 'Review & approval', 'Who reviews messages before they go out today?', 'Sets the review path', 'Nobody, or the manager for key accounts', AHEAD, SM),
 ('3. What to say', 'Review & approval', 'Which topics always need a manager: pricing, incidents, security, regulation?', 'Sets the sensitive topics that go to Approvals', 'Pricing, safety incidents, cyber security', AHEAD, SM),
 ('3. What to say', 'Review & approval', 'What should happen to a rejected suggestion?', 'Sets what the platform does after a rejection', 'Offer the next action; log the reason', AHEAD, SM),
 ('4. Measuring success', 'Baseline', 'Today, how many prioritised accounts does a rep research and write to by hand each week?', 'Sets the G1 baseline: today every prioritised account needs a person', 'About 30 accounts a week, all by hand', LIVE, LEAD),
 ('4. Measuring success', 'Baseline', 'Who should do the weekly spot-check of released items, and how many can they check each week?', 'Sets how G2 (recommendation acceptance) is counted for released items', 'The sales manager, about 10 a week', AHEAD, SM),
 ('4. Measuring success', 'Baseline', 'How long does a rep spend researching an account before contacting it?', 'Part of the G1 baseline', '20 to 30 minutes', AHEAD, SM),
 ('4. Measuring success', 'Baseline', 'How long after a signal does the first touch happen today?', 'Baseline for signal-to-touch time (also observed)', 'Not measured; often weeks', AHEAD, SM),
 ('4. Measuring success', 'Baseline', 'What are your reply and meeting rates by channel?', 'Baseline for reply and meeting rate', 'Email 5% reply, 1% meeting', AHEAD, OPS),
 ('4. Measuring success', 'Baseline', 'How much pipeline comes from outbound today?', 'Baseline for pipeline sourced', 'About 15% of new pipeline', AHEAD, LEAD),
 ('4. Measuring success', 'Outcomes', 'Are outcomes (reply, meeting, opportunity) recorded today, and where?', 'Baseline for prioritisation accuracy (also observed)', 'Meetings in the CRM; replies not tracked', AHEAD, OPS),
 ('4. Measuring success', 'Outcomes', 'Which outcomes matter most to sales leadership?', 'Chooses the measures we report', 'Meetings booked and pipeline created', AHEAD, LEAD),
 ('4. Measuring success', 'Thresholds', 'What would make the pilot a success for you: what share of prioritised accounts should go ahead with no human effort, and how often should a checked recommendation be kept?', 'Sets the G1 and G2 pass marks', '6 in 10 released on their own; 7 in 10 kept', AHEAD, LEAD),
 ('5. Pilot set-up', 'Team & scope', 'Which business unit, region and reps (3 to 5) take part in the pilot?', 'Sets the pilot scope and users', 'Refining, South-East Asia, 4 reps and their manager', AHEAD, LEAD),
 ('5. Pilot set-up', 'Team & scope', 'Who plays each role: admin, sales manager, reps, content owner, viewer?', 'Sets up user access', 'Names and emails per role', AHEAD, LEAD),
 ('5. Pilot set-up', 'Ways of working', 'Where do reps work today: CRM, email, a sales engagement tool? Should actions become CRM tasks?', 'Plans the hand-off to reps', 'CRM and Outlook; tasks in the CRM would help', AHEAD, OPS),
 ('5. Pilot set-up', 'Ways of working', 'Which day and channel suit a biweekly check-in?', 'Sets the cadence', 'Thursdays, Teams', AHEAD, SM),
 ('5. Pilot set-up', 'Consent & data', 'Which consent bases apply in each country, and how are opt-outs shared?', 'Sets who can be contacted', 'Legitimate interest in most countries; opt-outs in the CRM', AHEAD, IT),
 ('5. Pilot set-up', 'Consent & data', 'Any data residency or security review requirements?', 'Sets hosting and the security review', 'Data stays in the region; security review before go-live', AHEAD, IT),
 ('5. Pilot set-up', 'Consent & data', 'What should happen to pilot data at the end?', 'Sets export and purge at pilot end', 'Export the results, then purge', AHEAD, IT),
]
B, WRAP, HEAD = Font(bold=True, color='FFFFFF'), Alignment(wrap_text=True, vertical='top'), PatternFill('solid', fgColor='1B1F2A')
LIVEF, AREAF = PatternFill('solid', fgColor='FCEFC7'), PatternFill('solid', fgColor='F3F4F6')
wb = Workbook(); ws = wb.active; ws.title = 'Read me'
intro = [
 ('Pilot setup questionnaire', True),
 ('These questions help us set the platform up to the way your team sells: who to target, why now, what to do and what to say.', False),
 ('', False),
 ('How to use it', True),
 ('1. The five rows marked "Ask live" are the ones we would like to discuss in the workshop.', False),
 ('2. Please answer the rest in the Answer column before or after the workshop. Short answers are fine; attach files where you have them.', False),
 ('3. If you do not know an answer, leave it blank or write who would know. We fill the gaps together.', False),
 ('4. The "Example answer" column shows the kind of answer we need. It is an illustration, not a suggestion.', False),
 ('', False),
 ('Files that help most', True),
 ('A prospect list for the pilot business unit, 6 to 12 months of signals with outcomes, your brand guidelines, and your approved claims and case studies.', False),
]
for t, b in intro: ws.append([t]); ws.cell(ws.max_row, 1).font = Font(bold=b, size=14 if b else 11)
ws.column_dimensions['A'].width = 120
for r in ws.iter_rows():
    for c in r: c.alignment = Alignment(wrap_text=True, vertical='top')
q = wb.create_sheet('Questions')
cols = ['#', 'Platform question', 'Topic', 'Question', 'Why we ask (what it sets up)', 'Example answer', 'When', 'Usually answered by', 'Answer', 'Files attached', 'Answered by', 'Notes']
q.append(cols)
for c in q[1]: c.font, c.fill, c.alignment = B, HEAD, WRAP
for i, (area, topic, text, why, ex, when, who) in enumerate(Q, 1):
    q.append([i, area, topic, text, why, ex, when, who, '', '', '', ''])
    fill = LIVEF if when == LIVE else None
    for c in q[q.max_row]:
        c.alignment = WRAP
        if fill: c.fill = fill
    q.cell(q.max_row, 4).font = Font(bold=True)
for k, w in zip('ABCDEFGHIJKL', [5, 22, 20, 52, 38, 40, 11, 17, 45, 18, 16, 25]): q.column_dimensions[k].width = w
q.freeze_panes = 'E2'; q.auto_filter.ref = f'A1:L{q.max_row}'
dv = DataValidation(type='list', formula1=f'"{LIVE},{AHEAD}"', allow_blank=False); q.add_data_validation(dv); dv.add(f'G2:G{q.max_row}')
# Summary: count per area
s = wb.create_sheet('Summary')
s.append(['Platform question', 'Questions', 'Ask live']); [setattr(c, 'font', Font(bold=True)) for c in s[1]]
areas = []
for a, *_ in Q:
    if a not in areas: areas.append(a)
for a in areas:
    r = s.max_row + 1
    s.append([a, f'=COUNTIF(Questions!B:B,A{r})', f'=COUNTIFS(Questions!B:B,A{r},Questions!G:G,"{LIVE}")'])
r = s.max_row + 1
s.append(['Total', f'=SUM(B2:B{r-1})', f'=SUM(C2:C{r-1})']); [setattr(c, 'font', Font(bold=True)) for c in s[r]]
s.column_dimensions['A'].width = 30; s.column_dimensions['B'].width = 12; s.column_dimensions['C'].width = 10
wb.save(OUT)
print(len(Q), 'questions,', sum(x[5] == LIVE for x in Q), 'ask live')
