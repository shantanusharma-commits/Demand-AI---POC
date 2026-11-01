"""Demo data for cold outbound: net-new accounts whose signals are behaviour, not engagement with our content (a team
growing, a new plant, a public LinkedIn comment). The Admin adds the three new signal types in Setup first.
Usage: python3 make_cold_outbound.py <output folder> <spec.json>"""
import json, os, sys
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

OUT, SPEC = sys.argv[1], sys.argv[2]
AS_OF = '2026-11-02'   # the demo Monday: set this as the score date
LEAD_COLS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
             'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
             'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
             'capacity_unit', 'consent_basis', 'opt_out', 'owner_email']
SIG_COLS = ['company_name', 'contact_email_or_linkedin', 'lead_name', 'signal_type', 'event_date', 'detail', 'source', 'product', 'company_domain']
RA, RB = 'priya.nair@client-sample.com', 'daniel.koh@client-sample.com'
slug = lambda v: ''.join(ch for ch in v.lower() if ch.isalnum())
ago = lambda n: (date.fromisoformat(AS_OF) - timedelta(days=n)).isoformat()

# The three signal types the Admin adds in Setup -> Signals before the demo (name exactly as in the file).
NEW_TYPES = [
    dict(name='Team expanding', segment='Project', level='Medium', full=45, zero=120,
         about='The site is hiring control, instrumentation or automation engineers: the team is growing, so a project or upgrade is likely.',
         data='Job postings on the company careers page or job boards', source='Job boards'),
    dict(name='New plant announced', segment='Project', level='Strong', full=90, zero=365,
         about='The company announced a new plant, unit or major site expansion: the control scope is still being decided.',
         data='Company press releases and industry news', source='News'),
    dict(name='Commented on LinkedIn', segment='Modernisation', level='Medium', full=30, zero=90,
         about='A person at the account commented publicly on an industry post about ageing control systems, alarms or migration: they are living the problem.',
         data='Public LinkedIn activity on industry topics', source='LinkedIn'),
]

leads, sigs, accounts = [], [], []
def acct(aid, name, story, expect, people, owner=RA, industry='Refining', process='Crude refining', revenue=1800000000, employees=2400,
         account_type='Owner-operator', country='Malaysia', domain=None, extra=None):
    dom = domain or slug(name) + '.example'
    refs = []
    for first, last, title, seniority, more in people:
        r = dict(first_name=first, last_name=last, job_title=title, seniority=seniority, email=f'{slug(first)}.{slug(last)}@{dom}', email_verified='Y',
                 linkedin_url=f'https://www.linkedin.com/in/{slug(first)}-{slug(last)}', company_name=name, company_domain=dom, country=country,
                 city='', industry=industry, annual_revenue_usd=revenue, employee_count=employees, account_type=account_type, existing_customer='N',
                 managed_separately='N', site_name=name.split()[0] + ' site', site_process_type=process, site_capacity=120000, capacity_unit='bpd',
                 consent_basis='legitimate interest', opt_out='N', owner_email=owner)
        r.update(more or {}); leads.append(r); refs.append((r['email'] or r['linkedin_url'], f'{first} {last}'))
    accounts.append(dict(id=aid, name=name, story=story, expect=expect))
    return refs
def sig(name, ref, typ, days, detail, source):
    sigs.append([name, ref[0], ref[1], typ, ago(days), detail, source, '', ''])

IM, OD = ('Instrumentation Manager', 'Manager'), ('Operations Director', 'Director')
P = lambda f, l, t, more=None: (f, l, t[0], t[1], more)

# ── Project: new plants and growing teams (6 accounts) ──
r = acct('C01', 'Meridian Refining', 'Hero: new hydrotreater announced AND hiring automation engineers: two growth signals, tier A, Project',
         dict(segment='Project', tier='A'), [P('Farid', 'Rahman', IM), P('Grace', 'Lee', OD)])
sig('Meridian Refining', r[0], 'New plant announced', 12, 'the new hydrotreater unit you announced at Port Dickson, with start-up planned for 2028', 'News')
sig('Meridian Refining', r[0], 'Team expanding', 6, 'your team is hiring three control systems engineers for the new unit', 'Job boards')
r = acct('C02', 'Larkspur Refining', 'New crude unit announced: Project', dict(segment='Project', tier='A'),
         [P('Mei', 'Ling', IM)], owner=RB, country='Indonesia')
sig('Larkspur Refining', r[0], 'New plant announced', 20, 'the second crude distillation unit you announced at Balikpapan', 'News')
r = acct('C03', 'Saltmarsh Refining', 'New tank farm and blending unit announced: Project', dict(segment='Project', tier='A'),
         [P('Arun', 'Pillai', IM)], country='Thailand')
sig('Saltmarsh Refining', r[0], 'New plant announced', 35, 'the new tank farm and blending unit you announced', 'News')
r = acct('C04', 'Highgate Refining', 'Hiring instrumentation engineers: the team is expanding, Project', dict(segment='Project', tier='B'),
         [P('Lina', 'Tan', IM)], owner=RB, country='Singapore')
sig('Highgate Refining', r[0], 'Team expanding', 9, 'your team is hiring four instrumentation engineers for the crude unit', 'Job boards')
r = acct('C05', 'Wrenfield Refining', 'Hiring a DCS lead engineer: Project', dict(segment='Project', tier='B'),
         [P('Joel', 'Santos', IM)], country='Philippines')
sig('Wrenfield Refining', r[0], 'Team expanding', 14, 'you are hiring a DCS lead engineer and two automation technicians', 'Job boards')
r = acct('C06', 'Corran Refining', 'Hiring for a new automation team: Project', dict(segment='Project', tier='B'),
         [P('Wei', 'Chen', IM)], owner=RB, country='Vietnam')
sig('Corran Refining', r[0], 'Team expanding', 21, 'you are building a new automation team of six engineers', 'Job boards')

# ── Modernisation: people talking publicly about ageing systems (3 accounts) ──
r = acct('C07', 'Oakhurst Refining', 'Hero: the instrumentation manager commented on a post about ageing DCS ("we are living this right now"): Modernisation',
         dict(segment='Modernisation', tier='B'), [P('Hana', 'Yusof', IM)])
sig('Oakhurst Refining', r[0], 'Commented on LinkedIn', 3, 'your comment on an industry post about ageing DCS on crude units ("we are living this right now")', 'LinkedIn')
r = acct('C08', 'Kelpie Bay Refining', 'Commented on a post about legacy PLC migration: Modernisation', dict(segment='Modernisation', tier='B'),
         [P('Ravi', 'Shankar', IM)], owner=RB, country='Indonesia')
sig('Kelpie Bay Refining', r[0], 'Commented on LinkedIn', 6, 'your comment on a post about migrating legacy PLCs without a shutdown', 'LinkedIn')
r = acct('C09', 'Thornbury Refining', 'Commented on a post about obsolete control hardware: Modernisation', dict(segment='Modernisation', tier='B'),
         [P('Siti', 'Nur', IM)], country='Malaysia')
sig('Thornbury Refining', r[0], 'Commented on LinkedIn', 10, 'your comment on a post about finding spare parts for obsolete control hardware', 'LinkedIn')

# ── Controls: what the system sets aside (the noise) ──
r = acct('C10', 'Ashby Refining', 'LinkedIn comment 120 days old: past its window, so not scored (Watch list)', dict(tier='Watch list'),
         [P('Tom', 'Reyes', IM)], owner=RB)
sig('Ashby Refining', r[0], 'Commented on LinkedIn', 120, 'your comment on a post about alarm floods', 'LinkedIn')
r = acct('C11', 'Brightline Retail', 'A new warehouse announced, but retail is outside the ideal customer: below the fit floor', dict(tier='Below fit floor'),
         [P('Amy', 'Goh', ('Facilities Manager', 'Manager'))], industry='Retail', process='Distribution centre', account_type='Distributor',
         revenue=60000000, employees=300)
sig('Brightline Retail', r[0], 'New plant announced', 15, 'the new distribution warehouse you announced', 'News')
r = acct('C12', 'Fenwick Refining', 'Hiring, but the only contact opted out: never contacted', dict(optOut=True),
         [P('Ken', 'Ong', IM, dict(opt_out='Y'))], country='Singapore')
sig('Fenwick Refining', r[0], 'Team expanding', 8, 'your team is hiring two control systems engineers', 'Job boards')

def book(path, sheet, cols, rows):
    wb = Workbook(); ws = wb.active; ws.title = sheet; ws.append(cols)
    for row in rows:
        vals = [row.get(c, '') for c in cols] if isinstance(row, dict) else list(row)
        ws.append([None if v == '' else v for v in vals])
    for c in ws[1]: c.font = Font(bold=True)
    for col in ws.columns: ws.column_dimensions[col[0].column_letter].width = min(48, max(10, *(len(str(c.value or '')) + 2 for c in col)))
    ws.freeze_panes = 'A2'; wb.save(path)

os.makedirs(OUT, exist_ok=True)
book(os.path.join(OUT, 'Cold_Outbound_1_Prospects.xlsx'), 'Lead template', LEAD_COLS, leads)
book(os.path.join(OUT, 'Cold_Outbound_2_Signals.xlsx'), 'Signal template', SIG_COLS, sigs)
json.dump(dict(asOf=AS_OF, leadCols=LEAD_COLS, sigCols=SIG_COLS, newTypes=NEW_TYPES, leads=[[r.get(c, '') for c in LEAD_COLS] for r in leads],
               signals=sigs, accounts=accounts), open(SPEC, 'w'), indent=1)
print(len(accounts), 'accounts', len(leads), 'contacts', len(sigs), 'signals')
