"""Round 2 of the new-signals demo: fresh net-new companies (none from the first cold-outbound set, so nothing is set
aside as already engaged), with the Admin setting the segments up in advance in Setup. Four behaviour signals:
three form segments of their own; the fourth has only 2 accounts, so it waits in For Review for the sales manager.
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
    # Deliberately NOT given a segment in Setup: only 2 accounts, so it waits for the sales manager in For Review.
    dict(name='Contractor awarded', segment='', level='Strong', full=60, zero=240,
         about='An engineering contractor (EPC) was awarded the build of a new unit at the site: the control vendor is chosen in the coming months.',
         data='Industry news and contract award notices', source='News'),
]

leads, sigs, accounts = [], [], []
def acct(aid, name, story, expect, people, owner=RA, industry='Refining', process='Crude refining', revenue=1900000000, employees=2600,
         account_type='Owner-operator', country='Malaysia'):
    dom = slug(name) + '.example'; refs = []
    for first, last, title, seniority, more in people:
        r = dict(first_name=first, last_name=last, job_title=title, seniority=seniority, email=f'{slug(first)}.{slug(last)}@{dom}', email_verified='Y',
                 linkedin_url=f'https://www.linkedin.com/in/{slug(first)}-{slug(last)}-{aid.lower()}', company_name=name, company_domain=dom, country=country,
                 city='', industry=industry, annual_revenue_usd=revenue, employee_count=employees, account_type=account_type, existing_customer='N',
                 managed_separately='N', site_name=name.split()[0] + ' site', site_process_type=process, site_capacity=140000, capacity_unit='bpd',
                 consent_basis='legitimate interest', opt_out='N', owner_email=owner)
        r.update(more or {}); leads.append(r); refs.append((r['email'] or r['linkedin_url'], f'{first} {last}'))
    accounts.append(dict(id=aid, name=name, story=story, expect=expect))
    return refs
def sig(name, ref, typ, days, detail, source):
    sigs.append([name, ref[0], ref[1], typ, ago(days), detail, source, '', ''])
IM, OD = ('Instrumentation Manager', 'Manager'), ('Operations Director', 'Director')
P = lambda f, l, t, more=None: (f, l, t[0], t[1], more)

# ── New plants (3) ──
r = acct('N01', 'Blackwater Refining', 'Hero: a new hydrocracker announced: tier A, New plants', dict(segment='New plants', tier='A'),
         [P('Aisha', 'Karim', IM), P('Marcus', 'Teo', OD)])
sig('Blackwater Refining', r[0], 'New plant announced', 8, 'the new hydrocracker you announced at Kerteh, with start-up planned for 2029', 'News')
r = acct('N02', 'Coralbay Refining', 'A new aromatics unit announced: New plants', dict(segment='New plants', tier='A'), [P('Ming', 'Zhao', IM)], owner=RB, country='Singapore')
sig('Coralbay Refining', r[0], 'New plant announced', 25, 'the new aromatics unit you announced on Jurong Island', 'News')
r = acct('N03', 'Silverton Refining', 'A refinery expansion announced: New plants', dict(segment='New plants', tier='A'), [P('Budi', 'Santoso', IM)], country='Indonesia')
sig('Silverton Refining', r[0], 'New plant announced', 40, 'the expansion of your Cilacap refinery you announced', 'News')

# ── Expanding teams (3) ──
r = acct('N04', 'Redcliff Refining', 'Hero: hiring five automation engineers: Expanding teams', dict(segment='Expanding teams', tier='B'), [P('Nurul', 'Huda', IM)], owner=RB)
sig('Redcliff Refining', r[0], 'Team expanding', 5, 'your team is hiring five automation engineers for the crude unit', 'Job boards')
r = acct('N05', 'Ironbark Refining', 'Hiring a control systems lead: Expanding teams', dict(segment='Expanding teams', tier='B'), [P('Paolo', 'Reyes', IM)], country='Philippines')
sig('Ironbark Refining', r[0], 'Team expanding', 12, 'you are hiring a control systems lead and two instrument technicians', 'Job boards')
r = acct('N06', 'Tamarind Refining', 'Hiring for a new reliability and automation team: Expanding teams', dict(segment='Expanding teams', tier='B'),
         [P('Quang', 'Le', IM)], owner=RB, country='Vietnam')
sig('Tamarind Refining', r[0], 'Team expanding', 20, 'you are building a new reliability and automation team', 'Job boards')

# ── Talking about ageing systems (3) ──
r = acct('N07', 'Greystone Refining', 'Hero: commented on a post about ageing DCS: Talking about ageing systems', dict(segment='Talking about ageing systems', tier='B'),
         [P('Lakshmi', 'Iyer', IM)])
sig('Greystone Refining', r[0], 'Commented on LinkedIn', 2, 'your comment on an industry post about running a DCS past its end of support', 'LinkedIn')
r = acct('N08', 'Moorland Refining', 'Commented on a post about alarm floods: Talking about ageing systems', dict(segment='Talking about ageing systems', tier='B'),
         [P('Somchai', 'Wong', IM)], owner=RB, country='Thailand')
sig('Moorland Refining', r[0], 'Commented on LinkedIn', 7, 'your comment on a post about alarm floods on older control systems', 'LinkedIn')
r = acct('N09', 'Pebblebrook Refining', 'Commented on a post about spare parts for old controllers: Talking about ageing systems',
         dict(segment='Talking about ageing systems', tier='B'), [P('Erin', 'Lim', IM)], country='Malaysia')
sig('Pebblebrook Refining', r[0], 'Commented on LinkedIn', 11, 'your comment on a post about sourcing spare parts for old controllers', 'LinkedIn')

# ── Contractor awarded: only 2 accounts, no segment set up -> For Review (Segment too small) ──
r = acct('N10', 'Harbourline Refining', 'Contractor awarded for a new unit; no segment set up and only 2 such accounts: waits in For Review',
         dict(segment=None, route='For Review'), [P('Rahul', 'Desai', IM)], owner=RB, country='Singapore')
sig('Harbourline Refining', r[0], 'Contractor awarded', 14, 'the EPC contract awarded for your new hydrotreater', 'News')
r = acct('N11', 'Kingfisher Refining', 'Contractor awarded for a new unit: the second account, still below the 3-account minimum',
         dict(segment=None, route='For Review'), [P('Dina', 'Halim', IM)], country='Malaysia')
sig('Kingfisher Refining', r[0], 'Contractor awarded', 21, 'the EPC contract awarded for your new sulphur recovery unit', 'News')

# ── Noise: what the system sets aside ──
r = acct('N12', 'Fairhaven Refining', 'Team expanding signal 150 days old: past its window (Watch list)', dict(tier='Watch list'), [P('Owen', 'Cruz', IM)], owner=RB)
sig('Fairhaven Refining', r[0], 'Team expanding', 150, 'your team was hiring two automation engineers', 'Job boards')
r = acct('N13', 'Sunleaf Foods', 'A new bakery plant announced, but food is outside the ideal customer: below the fit floor', dict(tier='Below fit floor'),
         [P('Joy', 'Tan', ('Plant Manager', 'Manager'))], industry='Food and beverage', process='Bakery', account_type='Distributor', revenue=80000000, employees=400)
sig('Sunleaf Foods', r[0], 'New plant announced', 10, 'the new bakery plant you announced', 'News')
r = acct('N14', 'Westmere Refining', 'Commented on LinkedIn, but the only contact opted out: never contacted', dict(optOut=True),
         [P('Ivan', 'Ho', IM, dict(opt_out='Y'))], country='Singapore')
sig('Westmere Refining', r[0], 'Commented on LinkedIn', 4, 'your comment on a post about migrating old safety systems', 'LinkedIn')
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
