"""Builds the input rows for the scenario sets (TS6-TS10, TS12) as JSON. Each set is a lead file and a signal file for the
same companies, so it runs through Prospecting -> Scoring -> Micro-segments & NBA -> For Review like a real list.
Every account is designed for one result; the result it was designed for is kept as 'expect' and checked by run_scenarios.js.
Usage: python3 make_scenarios.py <scenarios.json>"""
import json, random, sys
from datetime import date, timedelta

AS_OF = '2026-10-20'
LEAD_COLS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
             'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
             'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
             'capacity_unit', 'consent_basis', 'opt_out', 'owner_email']
SIG_COLS = ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product']
# The demo Sales rep role is Rep A (legacy/demandai-nba.js), so ownership tests use the demo's rep addresses.
REP_A, REP_B = 'rep.a@client-sample.com', 'rep.b@client-sample.com'

def ago(days):
    return (date.fromisoformat(AS_OF) - timedelta(days=days)).isoformat()

slug = lambda v: v.lower().replace(' ', '').replace('&', '')
PRIMARY = ('Instrumentation Manager', 'Manager')
SECONDARY = ('Plant Manager', 'Director')
OTHER = ('Finance Manager', 'Manager')

class Set:
    def __init__(self, sid, title, module, purpose):
        self.id, self.title, self.module, self.purpose = sid, title, module, purpose
        self.leads, self.signals, self.accounts = [], [], []
        self.n = 0

    def account(self, name, intent, expect, people=None, country='Singapore', industry='Refining', revenue=2500000000,
                employees=3200, account_type='Owner-operator', existing='N', process='Crude refining', owner=REP_A,
                consent=None, **over):
        """Adds one account and its contacts. people: list of dicts (first, last, title, seniority and any lead column)."""
        self.n += 1
        dom = slug(name) + '.example'
        people = people or [dict(first='Alex', last='Tan')]
        refs = []
        for j, p in enumerate(people):
            title, sen = p.get('role', PRIMARY)
            em = f"{slug(p['first'])}.{slug(p['last'])}@{dom}"
            row = dict(first_name=p['first'], last_name=p['last'], job_title=title, seniority=sen, email=em, email_verified='Y',
                       linkedin_url=f"https://www.linkedin.com/in/{slug(p['first'])}-{slug(p['last'])}-{self.id.lower()}{self.n}",
                       company_name=name, company_domain=dom, country=country, city='', industry=industry,
                       annual_revenue_usd=revenue, employee_count=employees, account_type=account_type, existing_customer=existing,
                       managed_separately='N', site_name=(name.split()[0] + ' site') if process else '', site_process_type=process,
                       site_capacity=150000 if process else '', capacity_unit='bpd' if process else '',
                       consent_basis=consent or ('existing customer' if existing == 'Y' else 'legitimate interest'),
                       opt_out='N', owner_email=owner)
            row.update(over)
            row.update({k: v for k, v in p.items() if k in LEAD_COLS})
            self.leads.append([row[c] for c in LEAD_COLS])
            refs.append(row['email'] or row['linkedin_url'])
        self.accounts.append(dict(name=name, intent=intent, expect=expect))
        return refs

    def signal(self, company, ref, typ, days, detail, source='CRM'):
        self.signals.append([company, ref, typ, ago(days) if isinstance(days, int) else days, detail, source, ''])

    def out(self):
        return dict(id=self.id, title=self.title, module=self.module, purpose=self.purpose, asOf=AS_OF,
                    leads=self.leads, signals=self.signals, accounts=self.accounts)

sets = []

# ---------- TS6: micro-segment boundaries, through Scoring ----------
s = Set('TS6', 'Micro-segment boundaries', 'Micro-segments & NBA',
        'Which micro-segments form and which accounts become exceptions: exactly 3 accounts, 2 accounts, falling back to a next signal, '
        'a segment that would only form on second-best signals, Leadership and Service renewal segments, two people with signals at one account.')
for i, nm in enumerate(['Harbourline Refining', 'Saltmarsh Refining', 'Ridgeway Refining']):
    people = [dict(first='Nora', last='Lim'), dict(first='Owen', last='Chua', role=SECONDARY)]
    r = s.account(nm, 'Inquiry segment with exactly 3 accounts (the minimum)' + (': a second person also has a signal; the recommendation goes to the person with the strongest' if i == 0 else ''),
                  dict(segment='Inquiry', tier='A'), people=people)
    s.signal(nm, r[0], 'Inquiry or RFQ', 5 + i, 'Asked for a quote on a DCS migration', 'Web form')
    if i == 0: s.signal(nm, r[1], 'Webinar attended', 10, 'Attended the alarm management webinar', 'Webinar platform')
for i, nm in enumerate(['Copperleaf Petrochem', 'Westbay Olefins', 'Silverstream Aromatics']):
    r = s.account(nm, 'Leadership segment with 3 accounts', dict(segment='Leadership', tier='C'), industry='Petrochemicals', process='Olefins')
    s.signal(nm, r[0], 'Leadership change', 7 + i, 'New plant director appointed', 'News')
for i, nm in enumerate(['Bluestone Refining', 'Greenfield Refinery', 'Northpoint Refining']):
    r = s.account(nm, 'Service renewal segment with 3 accounts', dict(segment='Service renewal', tier='B'), existing='Y')
    s.signal(nm, r[0], 'Service contract renewal', 20 + i, 'Service contract renews on 31 Mar 2027', 'CRM')
r = s.account('Ironbark Refining', 'Strongest signal is Modernisation, but only 2 accounts have it: falls back to Service renewal, which formed',
              dict(segment='Service renewal', fallback=True, runnerUp='Propose a migration-path discussion'), existing='Y')
s.signal('Ironbark Refining', r[0], 'Installed system near end of support', 60, 'Control system reaches end of support in 2027', 'Installed base')
s.signal('Ironbark Refining', r[0], 'Service contract renewal', 25, 'Service contract renews on 30 Apr 2027', 'CRM')
r = s.account('Pinecrest Refining', 'Modernisation only, and only 2 accounts have it: no segment, exception in For Review',
              dict(segment='', exception=True))
s.signal('Pinecrest Refining', r[0], 'Installed system near end of support', 90, 'Legacy PLCs are end of life', 'Installed base')
for nm in ['Thornfield LNG', 'Crescent Gas Processing']:
    r = s.account(nm, 'Strongest signal is Project (2 accounts only); next is Engagement, which never formed: exception',
                  dict(segment='', exception=True), industry='LNG', process='LNG liquefaction')
    s.signal(nm, r[0], 'Capital project', 30, 'Final investment decision on a new train', 'News')
    s.signal(nm, r[0], 'Content download', 12, 'Downloaded the migration planning guide', 'Website')
r = s.account('Seabright Refining', 'Engagement is its strongest signal, but only 1 account has Engagement first: exception. '
              'Engagement appears on 3 accounts in total, but a segment never forms only on second-best signals',
              dict(segment='', exception=True))
s.signal('Seabright Refining', r[0], 'Webinar attended', 8, 'Attended the alarm management webinar', 'Webinar platform')
s.account('Quietwater Refining', 'No signal: watch list, not in Micro-segments', dict(tier='Watch list', segment=''))
sets.append(s.out())

# ---------- TS7: scoring and fit boundaries ----------
s = Set('TS7', 'Scoring and fit boundaries', 'Account Scoring',
        'Fit at and below the floor, each part of the fit rubric, tier cut-offs at exactly 35 and 20, signal decay at the edge '
        'of its window, and stacking several signals.')
full = dict(existing='Y')  # fit 100: core, above-target revenue, refining site, existing customer, owner-operator, primary contact
def inq(nm, days, intent, expect, **k):
    r = s.account(nm, intent, expect, **{**full, **k})
    s.signal(nm, r[0], 'Inquiry or RFQ', days, 'Asked for a quote on a DCS migration', 'Web form')
inq('Apex Refining', 10, 'Maximum fit (100) and a fresh inquiry (weight 100): score 50', dict(fit=100, score=50, tier='A'))
inq('Bayfront Refining', 48, 'Inquiry 48 days old decays to weight 70: score exactly 35, the A cut-off', dict(fit=100, score=35, tier='A'))
inq('Coldwater Refining', 49, 'Inquiry 49 days old decays to weight 68.3: score 34.2, just under A', dict(fit=100, score=34.2, tier='B'))
inq('Driftwood Refining', 66, 'Inquiry 66 days old decays to weight 40: score exactly 20, the B cut-off', dict(fit=100, score=20, tier='B'))
inq('Eastgate Refining', 67, 'Inquiry 67 days old decays to weight 38.3: score 19.2, just under B', dict(fit=100, score=19.2, tier='C'))
inq('Fairhaven Refining', 30, 'Inquiry exactly 30 days old: still full weight (100)', dict(fit=100, score=50, tier='A'))
inq('Glenmore Refining', 90, 'Inquiry exactly 90 days old: weight 0, stale, so no qualified signal: watch list', dict(fit=100, tier='Watch list'))
r = s.account('Highcliff Refining', 'Three fresh signals stack: 100 + 60 x 0.5 + 30 x 0.25 = 137.5, score 68.8', dict(fit=100, score=68.8, tier='A'), **full)
s.signal('Highcliff Refining', r[0], 'Inquiry or RFQ', 3, 'Asked for a quote on a DCS migration', 'Web form')
s.signal('Highcliff Refining', r[0], 'Webinar attended', 6, 'Attended the alarm management webinar', 'Webinar platform')
s.signal('Highcliff Refining', r[0], 'Email clicked', 4, 'Clicked the lifecycle services email', 'Email platform')
r = s.account('Ivywood Refining', 'Signals from two people stack at account level (100 + 60 x 0.5 = 130, score 65); each person is scored on their own',
              dict(fit=100, score=65, tier='A'), people=[dict(first='Kai', last='Ong'), dict(first='Lena', last='Koh', role=SECONDARY)], **full)
s.signal('Ivywood Refining', r[0], 'Inquiry or RFQ', 3, 'Asked for a quote on a DCS migration', 'Web form')
s.signal('Ivywood Refining', r[1], 'Content download', 9, 'Downloaded the migration planning guide', 'Website')
# Fit levels: each needs a fresh inquiry so the tier shows
def fit(nm, intent, expect, **k):
    r = s.account(nm, intent, expect, **k)
    s.signal(nm, r[0], 'Inquiry or RFQ', 5, 'Asked for a quote on a DCS migration', 'Web form')
fit('Juniper Fuels', 'Fit exactly 50 (core 30, revenue below target 4, no site 6, not a customer 6, distributor 2, secondary contact only 2): passes the floor',
    dict(fit=50, score=25, tier='B'), revenue=100000000, employees=300, account_type='Distributor', process='', people=[dict(first='Max', last='Lee', role=SECONDARY)])
fit('Kingsbridge Fuels', 'Fit 49 (core 30, no size given 0, no site 6, not a customer 6, distributor 2, primary contact 5): below the fit floor, not scored',
    dict(fit=49, tier='Below fit floor'), revenue='', employees='', account_type='Distributor', process='')
fit('Larkspur Refining', 'No revenue, 3,500 employees: size from headcount (above target)', dict(fit=100, tier='A'), revenue='', employees=3500, existing='Y')
fit('Moorland Refining', 'Revenue USD 400m: size in target (70% of 20 = 14)', dict(fit=94, tier='A'), revenue=400000000, existing='Y')
fit('Newhaven Petrochem', 'Petrochemicals: adjacent vertical (50% of 30 = 15); petrochemical site partly suits (10)', dict(fit=75, tier='A'),
    industry='Petrochemicals', process='Olefins', existing='Y')
fit('Oakridge Water', 'Industry and site not in the lookup: vertical Other (0), flagged for a person to classify', dict(fit=60, tier='B'),
    industry='Water utilities', process='Water treatment', existing='Y')
fit('Pebblebrook Refining', 'Same as Moorland but not an existing customer: relationship drops from 15 to 6', dict(fit=85, tier='A'), revenue=400000000)
fit('Quarry Hill Engineering', 'EPC contractor: account type 60% of 10 = 6', dict(fit=96, tier='A'), account_type='EPC contractor', existing='Y')
fit('Rosewood Refining', 'Primary contact opted out, secondary contact kept: contact coverage drops to 40% (2), confidence low. '
    'The inquiry is from the opted-out person, so it should not be used',
    dict(fit=97, confidence='low', tier='Watch list', gap="The opted-out person's inquiry still counts: tier A with no recommendation, and the account never reaches For Review"), existing='Y', people=[dict(first='Sam', last='Wee', opt_out='Y'), dict(first='Tara', last='Yap', role=SECONDARY)])
r = s.account('Stonegate Refining', 'Current pilot product already installed: knocked out (excluded) whatever its other signals', dict(tier='Excluded'), **full)
s.signal('Stonegate Refining', r[0], 'Installed system (current)', 200, 'Current pilot product installed on the crude unit', 'Installed base')
s.signal('Stonegate Refining', r[0], 'Inquiry or RFQ', 5, 'Asked for a quote on a DCS migration', 'Web form')
s.account('Tidewater Refining', 'Outside the pilot region (Australia): excluded in Prospecting', dict(tier='Excluded'), country='Australia')
sets.append(s.out())

# ---------- TS8: contactability and channel ----------
s = Set('TS8', 'Contactability and channel', 'Micro-segments & NBA, For Review',
        'Which channel the draft uses and when nobody can be reached: email and LinkedIn, one of them, neither, no or unknown consent, '
        'opt-out not confirmed, and a primary contact who opted out.')
def eng(nm, intent, expect, people=None, **k):
    r = s.account(nm, intent, expect, people=people, existing='Y', **k)
    return r
def web(nm, ref, days=6):
    s.signal(nm, ref, 'Webinar attended', days, 'Attended the alarm management webinar', 'Webinar platform')
r = eng('Amberley Refining', 'Verified email and LinkedIn: Email, LinkedIn is the fallback', dict(segment='Engagement', channel='Email', reach=False)); web('Amberley Refining', r[0])
r = eng('Brightwater Refining', 'Verified email, no LinkedIn: Email', dict(segment='Engagement', channel='Email', reach=False),
        people=[dict(first='Ben', last='Ho', linkedin_url='')]); web('Brightwater Refining', r[0])
r = eng('Cedarbrook Refining', 'Email not verified, LinkedIn given: LinkedIn connection note', dict(segment='Engagement', channel='LinkedIn', reach=False),
        people=[dict(first='Chen', last='Yu', email_verified='N')]); web('Cedarbrook Refining', r[0])
r = eng('Dunmore Refining', 'No email, LinkedIn only: LinkedIn; the signal names the person by LinkedIn URL', dict(segment='Engagement', channel='LinkedIn', reach=False),
        people=[dict(first='Dara', last='Ng', email='', email_verified='N')]); web('Dunmore Refining', r[0])
r = eng('Elmstead Refining', 'Email not verified and no LinkedIn: nobody can be reached, goes to a person', dict(segment='Engagement', reach=True),
        people=[dict(first='Eli', last='Sim', email_verified='N', linkedin_url='')]); web('Elmstead Refining', r[0])
r = eng('Foxley Refining', 'No consent basis: not contactable, goes to a person', dict(segment='Engagement', reach=True),
        people=[dict(first='Fay', last='Lau', consent_basis='')]); web('Foxley Refining', r[0])
r = eng('Garnet Refining', 'Consent basis "purchased list" is not recognised: goes to a person', dict(segment='Engagement', reach=True),
        people=[dict(first='Gus', last='Teo', consent_basis='purchased list')]); web('Garnet Refining', r[0])
r = eng('Hollis Refining', 'Opt-out left blank: Prospecting marks the contact not contactable. Check that NBA does not draft to them either',
        dict(segment='Engagement', reach=True, gap='NBA drafts an email to this person although Prospecting marks them not contactable (opt-out not confirmed)'),
        people=[dict(first='Hana', last='Rao', opt_out='')]); web('Hollis Refining', r[0])
r = eng('Inglewood Refining', 'Primary contact opted out and has the only signal; secondary has none. Check the opted-out signal does not lift the score or produce a recommendation',
        dict(tier='Watch list', gap="The opted-out person's signal still counts: the account scores B, gets no recommendation and never reaches For Review, so it drops out without a trace"),
        people=[dict(first='Ian', last='Goh', opt_out='Y'), dict(first='Jia', last='Lim', role=SECONDARY)]); web('Inglewood Refining', r[0])
r = eng('Jasper Refining', 'Primary opted out; secondary has the signal: recommendation goes to the secondary contact, low confidence',
        dict(segment='Engagement', channel='Email', confidence='low'),
        people=[dict(first='Jon', last='Wu', opt_out='Y'), dict(first='Kim', last='Ang', role=SECONDARY)]); web('Jasper Refining', r[1])
sets.append(s.out())

# ---------- TS9: For Review routing ----------
s = Set('TS9', 'For Review routing', 'For Review, Today',
        'One reason per account for an item to need a person, plus clean items that go ahead on their own: deal size, low confidence, '
        'sensitive content, an unverifiable claim, a brand rule, no way to reach them, segment too small, and an inquiry due the same day.')
def item(nm, detail, intent, cats, typ='Webinar attended', **k):
    r = s.account(nm, intent, dict(cats=cats), existing='Y', **k)
    s.signal(nm, r[0], typ, 6, detail, 'Webinar platform')
for nm in ['Alderbank Refining', 'Beacon Hill Refining', 'Cobalt Bay Refining']:
    item(nm, 'Attended the alarm management webinar', 'Clean item: no reason for a person, goes ahead on its own (may be drawn for a spot-check)', [])
item('Dovecote Petrochem', 'Attended the alarm management webinar',
     'Estimated first deal below USD 250k (adjacent vertical, revenue in target, EPC contractor): Below deal size', ['deal'],
     industry='Petrochemicals', process='Olefins', revenue=400000000, employees=1200, account_type='EPC contractor')
item('Elderflower Refining', 'Attended the alarm management webinar', 'No contact in the primary persona: Low confidence', ['low'],
     people=[dict(first='Ella', last='Tan', role=SECONDARY)])
item('Fernhill Refining', 'Attended the webinar after a plant incident at the site', 'Signal detail mentions an incident: Sensitive content, due the same day', ['sensitive'])
item('Gatewood Refining', 'Downloaded the guide on how to cut downtime by 30%', 'Signal detail reads like a product claim with no approved source: Unsupported claim', ['claim'],
     typ='Content download')
item('Hawthorn Refining', 'Attended the webinar and asked about pricing!', 'Signal detail mentions pricing and has an exclamation mark: Brand or rule check', ['brand'])
item('Juniper Ridge Refining', 'Attended the alarm management webinar', "Email not verified and no LinkedIn: Can't reach them", ['reach'],
     people=[dict(first='Joe', last='Lam', email_verified='N', linkedin_url='')])
r = s.account('Kestrel Ridge Refining', 'Only account with a Modernisation signal: Segment too small', dict(cats=['small']), existing='Y')
s.signal('Kestrel Ridge Refining', r[0], 'Installed system near end of support', 40, 'Control system reaches end of support in 2027', 'Installed base')
item('Lowmoor Petrochem', 'Attended the alarm management webinar', 'Several reasons at once: below deal size, low confidence and no way to reach them',
     ['deal', 'low', 'reach'], industry='Petrochemicals', process='Olefins', revenue=400000000, employees=1200, account_type='EPC contractor',
     people=[dict(first='Lia', last='Chan', role=SECONDARY, email_verified='N', linkedin_url='')])
for i, nm in enumerate(['Marlowe Refining', 'Nettlebed Refining', 'Oxbow Refining']):
    people = [dict(first='Mia', last='Ko', role=SECONDARY)] if i == 0 else None
    r = s.account(nm, ('Inquiry with low confidence: in For Review and due the same day because it is an inquiry' if i == 0
                       else 'Inquiry segment member (makes the Inquiry segment form)'),
                  dict(cats=['low'] if i == 0 else [], segment='Inquiry', dueSameDay=i == 0), existing='Y', people=people)
    s.signal(nm, r[0], 'Inquiry or RFQ', 4 + i, 'Asked for a quote on a DCS migration', 'Web form')
sets.append(s.out())

# ---------- TS10: rep ownership ----------
s = Set('TS10', 'Rep ownership and visibility', 'Micro-segments & NBA, For Review, Today (role switcher)',
        'Who sees which item: the demo Sales rep role is Rep A (rep.a@client-sample.com) and the Sales manager sees everyone. '
        'Owners for Rep A, Rep B, no owner, an owner who is not a user, an owner in capitals, and an owner that is not an email.')
owners = [(REP_A, 'Rep A', True), (REP_A, 'Rep A', True), (REP_A, 'Rep A', True), (REP_B, 'Rep B', False), (REP_B, 'Rep B', False),
          ('', 'No owner: flagged in Prospecting; only the sales manager sees it', False),
          ('aisha.rahman@client-sample.com', 'Owner is a valid email but not a user in the demo: shown as the email, only the manager sees it', False),
          ('REP.A@CLIENT-SAMPLE.COM', 'Rep A written in capitals: read as Rep A', True),
          ('Rep A', 'Owner is a name, not an email: flagged in Prospecting; only the manager sees it', False)]
names = ['Arden Refining', 'Brookfield Refining', 'Carrow Refining', 'Denholm Refining', 'Everley Refining', 'Fallowfield Refining',
         'Glenrock Refining', 'Hartwell Refining', 'Ilford Bay Refining']
for i, (nm, (own, why, a_sees)) in enumerate(zip(names, owners)):
    r = s.account(nm, why if own not in (REP_A, REP_B) else f'Owned by {why}', dict(owner=own.lower(), repASees=a_sees, managerSees=True,
                  segment='Inquiry' if i % 2 == 0 else 'Engagement'), owner=own, existing='Y')
    if i % 2 == 0: s.signal(nm, r[0], 'Inquiry or RFQ', 3 + i, 'Asked for a quote on a DCS migration', 'Web form')
    else: s.signal(nm, r[0], 'Webinar attended', 3 + i, 'Attended the alarm management webinar', 'Webinar platform')
sets.append(s.out())

# ---------- TS12: a realistic list at volume ----------
rnd = random.Random(20261020)
s = Set('TS12', 'Realistic mixed list', 'All modules (volume and robustness)',
        '60 accounts and about 200 contacts across the six pilot countries and a few outside it, all verticals, with the usual '
        'gaps of a real export: unverified emails, missing LinkedIn, opt-outs, blank consent, missing size, unmapped industries. '
        'The answer key gives the counts to expect at each step rather than a designed result per account.')
first = ['Aditya', 'Bella', 'Chong', 'Dina', 'Eko', 'Fiona', 'Gilbert', 'Hui', 'Imran', 'Joy', 'Kumar', 'Lani', 'Mohan', 'Nisa', 'Oscar',
         'Pim', 'Qian', 'Rosa', 'Suresh', 'Tuan', 'Umar', 'Vivian', 'Wan', 'Xavier', 'Yuki', 'Zara']
last = ['Abdullah', 'Bautista', 'Chen', 'Dewan', 'Effendi', 'Fong', 'Gunawan', 'Halim', 'Ibrahim', 'Jaya', 'Kaur', 'Loh', 'Muthu', 'Ng',
        'Ocampo', 'Phan', 'Quek', 'Ramos', 'Salleh', 'Tran', 'Uy', 'Vu', 'Wibowo', 'Xu', 'Yeo', 'Zulkifli']
pre = ['Arc', 'Bay', 'Cove', 'Dune', 'Ember', 'Flint', 'Grove', 'Haven', 'Isle', 'Jade', 'Kite', 'Lumen', 'Mist', 'Nova', 'Orchid',
       'Pearl', 'Quill', 'Reef', 'Sable', 'Tern', 'Umber', 'Vale', 'Wren', 'Yarrow', 'Zephyr', 'Aster', 'Birch', 'Cirrus', 'Delta', 'Echo']
kinds = [('Refining', 'Crude refining', 'Refining'), ('Petrochemicals', 'Olefins', 'Petrochem'), ('LNG', 'LNG liquefaction', 'LNG'),
         ('Gas processing', 'Gas processing', 'Gas'), ('Specialty chemicals', 'Batch chemicals', 'Chemicals'), ('Power generation', '', 'Power')]
countries = ['Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Indonesia', 'Vietnam']
titles = [PRIMARY, ('Head of Automation', 'Director'), ('Control Systems Engineer', 'Senior'), SECONDARY, ('Maintenance Manager', 'Manager'),
          ('Procurement Manager', 'Manager'), OTHER, ('HR Manager', 'Manager')]
sigtypes = [('Inquiry or RFQ', 'Asked for a quote on a DCS migration', 'Web form', 80), ('Installed system near end of support', 'Control system reaches end of support', 'Installed base', 500),
            ('Service contract renewal', 'Service contract renews next quarter', 'CRM', 150), ('Capital project', 'Announced an expansion', 'News', 300),
            ('Leadership change', 'New head of operations appointed', 'News', 100), ('Webinar attended', 'Attended the alarm management webinar', 'Webinar platform', 150),
            ('Webinar registered', 'Registered for the reliability webinar', 'Webinar platform', 100), ('Content download', 'Downloaded the migration planning guide', 'Website', 150),
            ('Email clicked', 'Clicked the lifecycle services email', 'Email platform', 50)]
used = set()
for i in range(60):
    ind, proc, word = kinds[rnd.choices(range(6), weights=[30, 22, 12, 12, 14, 10])[0]]
    nm = f"{pre[i % 30]}{'' if i < 30 else ' Coast'} {word}"
    ctry = 'Australia' if i in (17, 44) else 'India' if i == 31 else countries[i % 6]
    rev = rnd.choice([3e9, 1.4e9, 6e8, 3e8, 1.2e8, ''])
    emp = '' if rev and rnd.random() < 0.3 else rnd.choice([5000, 2400, 1200, 600, ''])
    typ = rnd.choices(['Owner-operator', 'EPC contractor', 'System integrator', 'Distributor'], weights=[70, 12, 8, 10])[0]
    k = rnd.choice([2, 3, 3, 4, 5])
    people = []
    for j in range(k):
        while True:
            f, l = rnd.choice(first), rnd.choice(last)
            if (f, l, nm) not in used: used.add((f, l, nm)); break
        role = titles[j if j < 2 and rnd.random() < 0.75 else rnd.randrange(len(titles))]
        p = dict(first=f, last=l, role=role)
        x = rnd.random()
        if x < 0.06: p['email_verified'] = 'N'
        elif x < 0.09: p['opt_out'] = 'Y'
        elif x < 0.11: p['consent_basis'] = ''
        if rnd.random() < 0.15: p['linkedin_url'] = ''
        people.append(p)
    refs = s.account(nm, '', {}, people=people, country=ctry, industry=ind, process=proc, revenue=int(rev) if rev else '', employees=emp,
                     account_type=typ, existing='Y' if rnd.random() < 0.3 else 'N', owner=REP_A if i % 2 == 0 else REP_B)
    for _ in range(rnd.choices([0, 1, 2, 3], weights=[25, 40, 25, 10])[0]):
        t, d, src, maxage = rnd.choice(sigtypes)
        s.signal(nm, rnd.choice(refs), t, rnd.randint(1, maxage), d, src)
sets.append(s.out())

json.dump({'leadCols': LEAD_COLS, 'sigCols': SIG_COLS, 'sets': sets}, open(sys.argv[1], 'w'), indent=0)
for x in sets: print(x['id'], len(x['leads']), 'leads', len(x['signals']), 'signals', len(x['accounts']), 'accounts')
