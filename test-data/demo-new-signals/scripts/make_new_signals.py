"""Round 2 of the new-signals demo: fresh net-new companies (none from the first cold-outbound set, so nothing is set
aside as already engaged), with the Admin setting the segments up in advance in Setup. A mix of signals: mostly LinkedIn
comments, then team expanding and new plants, then built-in leadership and engagement signals. Signals stack on some
accounts and differ in age and in fit, so the ranking spreads out.
Usage: python3 make_new_signals.py <output folder> <spec.json>"""
import json, os, sys
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font

OUT, SPEC = sys.argv[1], sys.argv[2]
AS_OF = '2026-11-09'   # set this as the score date
LEAD_COLS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
             'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
             'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
             'capacity_unit', 'consent_basis', 'opt_out', 'owner_email']
SIG_COLS = ['company_name', 'contact_email_or_linkedin', 'lead_name', 'signal_type', 'event_date', 'detail', 'source', 'product', 'company_domain']
RA, RB = 'priya.nair@client-sample.com', 'daniel.koh@client-sample.com'
slug = lambda v: ''.join(ch for ch in v.lower() if ch.isalnum())
ago = lambda n: (date.fromisoformat(AS_OF) - timedelta(days=n)).isoformat()

# What the Admin sets up in Setup before the list is scored: segments, signal types mapped to them, and actions.
SEGMENTS = [
    dict(name='Expanding teams', theme='Sites building up their control and automation teams',
         actions=[('Offer a technical onboarding session for the new engineers', 'Help the new engineers get productive on the control system fast.'),
                  ('Invite the new team to a hands-on training day', 'When the team is growing but not yet trained.')]),
    dict(name='New plants', theme='Companies that announced a new plant or unit, while the control scope is still open',
         actions=[('Propose a front-end design session for the new plant', 'Shape the control scope while the plant is still being designed.'),
                  ('Share a reference plant of a similar size', 'When the project team needs proof before deciding.')]),
    dict(name='Talking about ageing systems', theme='People who said publicly that their site lives with ageing control systems',
         actions=[('Share a short point of view on that topic, with a peer example', 'Reply to the problem they raised with something useful.'),
                  ('Invite them to a peer roundtable on the same problem', 'When they are not ready for a sales conversation.')]),
]
NEW_TYPES = [
    dict(name='Team expanding', segment='Expanding teams', level='Medium', full=45, zero=120,
         about='The site is hiring control, instrumentation or automation engineers: the team is growing, so a project or upgrade is likely.',
         data='Job postings on the company careers page or job boards', source='Job boards'),
    dict(name='New plant announced', segment='New plants', level='Strong', full=90, zero=365,
         about='The company announced a new plant, unit or major site expansion: the control scope is still being decided.',
         data='Company press releases and industry news', source='News'),
    dict(name='Commented on LinkedIn', segment='Talking about ageing systems', level='Medium', full=30, zero=90,
         about='A person at the account commented publicly on an industry post about ageing control systems, alarms or migration.',
         data='Public LinkedIn activity on industry topics', source='LinkedIn'),
]

leads, sigs, accounts = [], [], []
def acct(aid, name, story, expect, people, owner=RA, industry='Refining', process='Crude refining', revenue=1900000000, employees=2600,
         account_type='Owner-operator', country='Malaysia', capacity=140000):
    dom = slug(name) + '.example'; refs = []
    for first, last, title, seniority, more in people:
        r = dict(first_name=first, last_name=last, job_title=title, seniority=seniority, email=f'{slug(first)}.{slug(last)}@{dom}', email_verified='Y',
                 linkedin_url=f'https://www.linkedin.com/in/{slug(first)}-{slug(last)}-{aid.lower()}', company_name=name, company_domain=dom, country=country,
                 city='', industry=industry, annual_revenue_usd=revenue, employee_count=employees, account_type=account_type, existing_customer='N',
                 managed_separately='N', site_name=name.split()[0] + ' site', site_process_type=process, site_capacity=capacity, capacity_unit='bpd',
                 consent_basis='legitimate interest', opt_out='N', owner_email=owner)
        r.update(more or {}); leads.append(r); refs.append((r['email'] or r['linkedin_url'], f'{first} {last}'))
    accounts.append(dict(id=aid, name=name, story=story, expect=expect))
    return refs
def sig(name, ref, typ, days, detail, source):
    sigs.append([name, ref[0], ref[1], typ, ago(days), detail, source, '', ''])
IM, OD = ('Instrumentation Manager', 'Manager'), ('Operations Director', 'Director')
P = lambda f, l, t, more=None: (f, l, t[0], t[1], more)

LI, TE, NP, LC, WB, CD = 'Commented on LinkedIn', 'Team expanding', 'New plant announced', 'Leadership change', 'Webinar attended', 'Content download'
TA = 'Talking about ageing systems'
SMALL = dict(revenue=400000000, employees=700, capacity=40000)
MID = dict(revenue=900000000, employees=1400, capacity=80000)

# ── Talking about ageing systems: LinkedIn comments, the biggest group (7) ──
r = acct('N01', 'Greystone Refining', 'Hero: commented on a post about ageing DCS 2 days ago AND attended a migration webinar: two signals stack',
         dict(segment=TA), [P('Lakshmi', 'Iyer', IM), P('Daniel', 'Ong', OD)])
sig('Greystone Refining', r[0], LI, 2, 'your comment on an industry post about running a DCS past its end of support', 'LinkedIn')
sig('Greystone Refining', r[0], WB, 9, 'legacy-control migration', 'Webinar platform')
r = acct('N02', 'Lowmoor Refining', 'Two people at the site commented on the same post about alarm floods', dict(segment=TA),
         [P('Somchai', 'Wong', IM), P('Anan', 'Sukjai', OD)], owner=RB, country='Thailand')
sig('Lowmoor Refining', r[0], LI, 3, 'your comment on a post about alarm floods on older control systems', 'LinkedIn')
sig('Lowmoor Refining', r[1], LI, 3, 'your comment on a post about alarm floods on older control systems', 'LinkedIn')
r = acct('N03', 'Pebblebrook Refining', 'Commented on a post about spare parts for old controllers, and downloaded the migration guide', dict(segment=TA),
         [P('Erin', 'Lim', IM)])
sig('Pebblebrook Refining', r[0], LI, 6, 'your comment on a post about sourcing spare parts for old controllers', 'LinkedIn')
sig('Pebblebrook Refining', r[0], CD, 15, 'migration planning guide', 'Website')
r = acct('N04', 'Moorland Refining', 'Commented on a post about obsolete operator stations', dict(segment=TA), [P('Hafiz', 'Osman', IM)], owner=RB, **MID)
sig('Moorland Refining', r[0], LI, 8, 'your comment on a post about keeping obsolete operator stations running', 'LinkedIn')
r = acct('N05', 'Ashcombe Refining', 'Commented on a post about unplanned trips on an old safety system', dict(segment=TA), [P('Ravi', 'Kumar', IM)], country='Singapore')
sig('Ashcombe Refining', r[0], LI, 14, 'your comment on a post about unplanned trips on an older safety system', 'LinkedIn')
r = acct('N06', 'Driftwood Refining', 'Commented 45 days ago: past full weight, so it ranks lower', dict(segment=TA), [P('Maria', 'Santos', IM)], owner=RB, country='Philippines')
sig('Driftwood Refining', r[0], LI, 45, 'your comment on a post about migrating a DCS without a shutdown', 'LinkedIn')
r = acct('N07', 'Quarry Bay Refining', 'Commented 70 days ago, smaller site: tier C, so not handed off', dict(tier='C', handoff=False), [P('Thanh', 'Nguyen', IM)], country='Vietnam', **SMALL)
sig('Quarry Bay Refining', r[0], LI, 70, 'your comment on a post about end-of-life controllers', 'LinkedIn')

# ── Expanding teams (4) ──
r = acct('N08', 'Redcliff Refining', 'Hiring five automation engineers this week', dict(segment='Expanding teams'), [P('Nurul', 'Huda', IM)], owner=RB)
sig('Redcliff Refining', r[0], TE, 5, 'your team is hiring five automation engineers for the crude unit', 'Job boards')
r = acct('N09', 'Ironbark Refining', 'Hiring a control systems lead, and a new operations director joined', dict(segment='Expanding teams'),
         [P('Paolo', 'Reyes', IM)], country='Philippines')
sig('Ironbark Refining', r[0], TE, 12, 'you are hiring a control systems lead and two instrument technicians', 'Job boards')
sig('Ironbark Refining', r[0], LC, 20, 'New operations director appointed', 'News')
r = acct('N10', 'Tamarind Refining', 'Hiring for a new automation team, mid-size site', dict(segment='Expanding teams'), [P('Quang', 'Le', IM)], owner=RB, country='Vietnam', **MID)
sig('Tamarind Refining', r[0], TE, 18, 'you are building a new reliability and automation team', 'Job boards')
r = acct('N11', 'Fernhill Refining', 'Hiring 80 days ago: past full weight, tier C, so not handed off', dict(tier='C', handoff=False), [P('Kiran', 'Rao', IM)], country='Malaysia')
sig('Fernhill Refining', r[0], TE, 80, 'your team was hiring two DCS engineers', 'Job boards')

# ── New plants (4) ──
r = acct('N12', 'Blackwater Refining', 'Hero: a new hydrocracker announced AND hiring control engineers for it: the top of the ranking',
         dict(segment='New plants', tier='A'), [P('Aisha', 'Karim', IM), P('Marcus', 'Teo', OD)])
sig('Blackwater Refining', r[0], NP, 8, 'the new hydrocracker you announced at Kerteh, with start-up planned for 2029', 'News')
sig('Blackwater Refining', r[0], TE, 4, 'your team is hiring three control systems engineers for the new unit', 'Job boards')
r = acct('N13', 'Coralbay Refining', 'A new aromatics unit announced', dict(segment='New plants', tier='A'), [P('Ming', 'Zhao', IM)], owner=RB, country='Singapore')
sig('Coralbay Refining', r[0], NP, 25, 'the new aromatics unit you announced on Jurong Island', 'News')
r = acct('N14', 'Silverton Refining', 'A refinery expansion announced 5 months ago: still counts, at lower weight', dict(segment='New plants'), [P('Budi', 'Santoso', IM)], country='Indonesia')
sig('Silverton Refining', r[0], NP, 150, 'the expansion of your Cilacap refinery you announced', 'News')
r = acct('N15', 'Elmstead Refining', 'A new tank farm announced at a smaller site', dict(segment='New plants'), [P('Arjun', 'Menon', IM)], owner=RB, **SMALL)
sig('Elmstead Refining', r[0], NP, 30, 'the new tank farm you announced', 'News')

# ── Leadership (3, built-in) ──
for aid, nm, (fn, ln), d, det, ow, ctry in [('N16', 'Cobalt Point Refining', ('Grace', 'Chua'), 10, 'New plant director appointed', RA, 'Singapore'),
                                             ('N17', 'Highbury Refining', ('Imran', 'Shah'), 18, 'New head of operations appointed', RB, 'Malaysia'),
                                             ('N18', 'Westbrook Refining', ('Linh', 'Pham'), 22, 'New VP engineering joined', RA, 'Vietnam')]:
    r = acct(aid, nm, f'Leadership change ({d} days ago)', dict(segment='Leadership'), [P(fn, ln, IM)], owner=ow, country=ctry)
    sig(nm, r[0], LC, d, det, 'News')

# ── Engagement (3, built-in) ──
r = acct('N19', 'Sandpiper Refining', 'Attended a webinar on alarm management', dict(segment='Engagement'), [P('Joanne', 'Tay', IM)], owner=RB, country='Singapore')
sig('Sandpiper Refining', r[0], WB, 6, 'alarm management', 'Webinar platform')
r = acct('N20', 'Thistle Refining', 'Downloaded the migration planning guide', dict(segment='Engagement'), [P('Rizal', 'Hamid', IM)])
sig('Thistle Refining', r[0], CD, 12, 'migration planning guide', 'Website')
r = acct('N21', 'Yarrow Refining', 'Attended a webinar on reliability planning, mid-size site', dict(segment='Engagement'), [P('Mai', 'Tran', IM)], owner=RB, country='Vietnam', **MID)
sig('Yarrow Refining', r[0], WB, 25, 'reliability planning', 'Webinar platform')

# ── Noise: what the system sets aside ──
r = acct('N22', 'Fairhaven Refining', 'LinkedIn comment 120 days old: past its 90-day window (Watch list)', dict(tier='Watch list'), [P('Owen', 'Cruz', IM)], owner=RB)
sig('Fairhaven Refining', r[0], LI, 120, 'your comment on a post about alarm floods', 'LinkedIn')
r = acct('N23', 'Sunleaf Foods', 'A new bakery plant announced, but food is outside the ideal customer: below the fit floor', dict(tier='Below fit floor'),
         [P('Joy', 'Tan', ('Plant Manager', 'Manager'))], industry='Food and beverage', process='Bakery', account_type='Distributor', revenue=80000000, employees=400)
sig('Sunleaf Foods', r[0], NP, 10, 'the new bakery plant you announced', 'News')
r = acct('N24', 'Westmere Refining', 'Commented on LinkedIn, but the only contact opted out: never contacted', dict(optOut=True),
         [P('Ivan', 'Ho', IM, dict(opt_out='Y'))], country='Singapore')
sig('Westmere Refining', r[0], LI, 4, 'your comment on a post about migrating old safety systems', 'LinkedIn')
# A signal for a company that is not on the prospect list: rejected
sigs.append(['Rosewood Refining', 'li.wei@rosewoodrefining.example', 'Li Wei', 'New plant announced', ago(9), 'the new unit you announced', 'News', '', ''])

def book(path, sheet, cols, rows):
    wb = Workbook(); ws = wb.active; ws.title = sheet; ws.append(cols)
    for row in rows:
        vals = [row.get(c, '') for c in cols] if isinstance(row, dict) else list(row)
        ws.append([None if v == '' else v for v in vals])
    for c in ws[1]: c.font = Font(bold=True)
    for col in ws.columns: ws.column_dimensions[col[0].column_letter].width = min(48, max(10, *(len(str(c.value or '')) + 2 for c in col)))
    ws.freeze_panes = 'A2'; wb.save(path)
os.makedirs(OUT, exist_ok=True)
book(os.path.join(OUT, 'New_Signals_1_Prospects.xlsx'), 'Lead template', LEAD_COLS, leads)
book(os.path.join(OUT, 'New_Signals_2_Signals.xlsx'), 'Signal template', SIG_COLS, sigs)
json.dump(dict(asOf=AS_OF, leadCols=LEAD_COLS, sigCols=SIG_COLS, newTypes=NEW_TYPES, segments=SEGMENTS, leads=[[r.get(c, '') for c in LEAD_COLS] for r in leads],
               signals=sigs, accounts=accounts), open(SPEC, 'w'), indent=1)
print(len(accounts), 'accounts', len(leads), 'contacts', len(sigs), 'signals')
