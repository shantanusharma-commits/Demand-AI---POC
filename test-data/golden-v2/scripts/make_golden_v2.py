"""Three golden datasets for the remediation branch, each a prospect file and a signal file run the normal way:
  A  Scoring and tiering    (Prospecting -> Account Scoring)
  B  Micro-segments and NBA (-> hand-off -> build)
  C  For Review             (-> exception queue, Approvals, released)
Every account is designed for one outcome; run_golden_v2.mts checks it against the branch's engine.
Usage: python3 make_golden_v2.py <output folder> <spec.json>"""
import json, os, sys
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font

OUT, SPEC = sys.argv[1], sys.argv[2]
AS_OF = '2026-10-30'
LEAD_COLS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
             'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
             'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
             'capacity_unit', 'consent_basis', 'opt_out', 'owner_email']
SIG_COLS = ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product']
RA, RB = 'rep.a@client-sample.com', 'rep.b@client-sample.com'
PRIMARY, SECONDARY = 'Instrumentation Manager', 'Plant Manager'
slug = lambda v: ''.join(ch for ch in v.lower() if ch.isalnum())
ago = lambda n: (date.fromisoformat(AS_OF) - timedelta(days=n)).isoformat()


class Set:
    def __init__(self, key):
        self.key, self.leads, self.sigs, self.accounts = key, [], [], []

    def acct(self, gid, name, tests, expect, people=None, owner=RA, country='Singapore', industry='Refining', process='Crude refining',
             revenue=2400000000, employees=3200, account_type='Owner-operator', existing='Y', managed='N', domain=None):
        dom = domain or slug(name) + '.example'
        people = people or [('Ana', gid, PRIMARY, {})]
        refs = []
        for first, last, title, extra in people:
            r = dict(first_name=first, last_name=last, job_title=title, seniority='Manager', email=f'{slug(first)}.{slug(last)}@{dom}', email_verified='Y',
                     linkedin_url=f'https://www.linkedin.com/in/{slug(first)}-{slug(last)}-{gid.lower()}', company_name=name, company_domain=dom,
                     country=country, city='', industry=industry, annual_revenue_usd=revenue, employee_count=employees, account_type=account_type,
                     existing_customer=existing, managed_separately=managed, site_name=name.split()[0] + ' site', site_process_type=process,
                     site_capacity=150000, capacity_unit='bpd', consent_basis='existing customer' if existing == 'Y' else 'legitimate interest',
                     opt_out='N', owner_email=owner)
            r.update(extra)
            self.leads.append(r); refs.append(r['email'] or r['linkedin_url'])
        self.accounts.append(dict(id=gid, name=name, tests=tests, expect=expect))
        return refs

    def sig(self, name, ref, typ, days, detail, source='CRM'):
        self.sigs.append([name, ref, typ, ago(days), detail, source, ''])


RFQ, EOS, REN, PRJ = 'Asked for a quote on a DCS migration', 'Control system reaches end of support in 2027', 'Service contract renews on 31 Mar 2027', 'Announced a site expansion'
LEAD, WEB = 'New plant director appointed', 'Attended the alarm management webinar'

# ═════════ A · Scoring and tiering ═════════
A = Set('A')
r = A.acct('A01', 'Altamira Refining', 'Fit 100 and a fresh RFQ: timing 50, score 50, tier A', dict(tier='A', score=50))
A.sig('Altamira Refining', r[0], 'Inquiry or RFQ', 3, RFQ, 'Web form')
r = A.acct('A02', 'Brightwater Refining', 'Two signals stack: RFQ at full weight plus a webinar at half weight. Timing (100 + 60 x 0.5) / 200 = 65', dict(tier='A', score=65))
A.sig('Brightwater Refining', r[0], 'Inquiry or RFQ', 4, RFQ, 'Web form'); A.sig('Brightwater Refining', r[0], 'Webinar attended', 6, WEB, 'Webinar platform')
r = A.acct('A03', 'Cobalt Bay Refining', 'Leadership change: weight 60 x 0.75 = 45, timing 22.5, score 22.5: tier B', dict(tier='B', score=22.5))
A.sig('Cobalt Bay Refining', r[0], 'Leadership change', 5, LEAD, 'News')
r = A.acct('A04', 'Deepwell Refining', 'An RFQ 60 days old: half way through its window (full for 30 days, zero at 90), so weight 50, timing 25: tier B', dict(tier='B', score=25))
A.sig('Deepwell Refining', r[0], 'Inquiry or RFQ', 60, RFQ, 'Web form')
r = A.acct('A05', 'Elmstead Refining', 'Email click only: weight 30, timing 15, score 15: tier C (below 20)', dict(tier='C', score=15))
A.sig('Elmstead Refining', r[0], 'Email clicked', 5, 'Clicked the migration guide link', 'Email platform')
r = A.acct('A06', 'Fernhill Petrochem', 'Same fresh RFQ as A01 at a weaker-fit account (adjacent vertical, smaller, EPC): lower fit, so a lower score', dict(scoreBelow=50),
           industry='Petrochemicals', process='Olefins', revenue=400000000, employees=1200, account_type='EPC contractor')
A.sig('Fernhill Petrochem', r[0], 'Inquiry or RFQ', 3, RFQ, 'Web form')
r = A.acct('A07', 'Granite Cove Refining', 'A signal 100 days old for a type that counts for 60 days: rejected as stale, so no live signal: Watch list', dict(tier='Watch list'))
A.sig('Granite Cove Refining', r[0], 'Email clicked', 100, 'Clicked the migration guide link', 'Email platform')
A.acct('A08', 'Harbourline Refining', 'No signal at all: Watch list', dict(tier='Watch list'))
r = A.acct('A09', 'Ivory Coast Refining', 'Newsletter sign-up is not a buying signal: the row is rejected, so Watch list', dict(tier='Watch list'))
A.sig('Ivory Coast Refining', r[0], 'Newsletter sign-up', 4, 'Signed up for the newsletter', 'Website')
r = A.acct('A10', 'Jadestone Refining', 'Their control system is current: a knockout signal takes the account out', dict(tier='Excluded'))
A.sig('Jadestone Refining', r[0], 'Installed system (current)', 30, 'Control system upgraded in 2025', 'Installed base')
A.sig('Jadestone Refining', r[0], 'Webinar attended', 5, WEB, 'Webinar platform')
r = A.acct('A11', 'Keystone Retail', 'Wrong industry (retail): below the fit floor, so the RFQ is not used', dict(tier='Below fit floor'), industry='Retail', process='Distribution centre',
           account_type='Distributor', revenue=50000000, employees=200, existing='N')
A.sig('Keystone Retail', r[0], 'Inquiry or RFQ', 3, RFQ, 'Web form')
r = A.acct('A12', 'Lowmoor Refining', 'The person with the RFQ opted out: kept off the prospect list and never contacted; the colleague has no signal (Watch list). The account itself still shows tier A from that signal', dict(optOut=True),
           people=[('Ana', 'A12', PRIMARY, dict(opt_out='Y')), ('Ben', 'A12', SECONDARY, {})])
A.sig('Lowmoor Refining', r[0], 'Inquiry or RFQ', 3, RFQ, 'Web form')
r = A.acct('A13', 'Marlowe Refining', 'Tier A, but consent basis is blank: ranked in Scoring, held back at hand-off', dict(tier='A', heldBack=True),
           people=[('Ana', 'A13', PRIMARY, dict(consent_basis=''))])
A.sig('Marlowe Refining', r[0], 'Inquiry or RFQ', 3, RFQ, 'Web form')
r = A.acct('A14', 'Northgate Refining', 'Signal file names the company differently ("Northgate Refining Pte Ltd"): matched by name variant, tier A', dict(tier='A', score=50))
A.sig('Northgate Refining Pte Ltd', r[0], 'Inquiry or RFQ', 3, RFQ, 'Web form')
A.sig('Oakridge Chemicals', 'buyer@oakridgechemicals.example', 'Inquiry or RFQ', 3, RFQ, 'Web form')
A.accounts.append(dict(id='A15', name='Oakridge Chemicals (signal only)', tests='A signal for a company that is not in the prospect file: reported as unmatched, nothing scored', expect=dict(unmatched=True)))
r = A.acct('A16', 'Pebble Point Refining', 'Two people, two signals: each is scored on their own evidence (RFQ person tier A, webinar person tier B)', dict(people={'Ana A16': 'A', 'Ben A16': 'B'}),
           people=[('Ana', 'A16', PRIMARY, {}), ('Ben', 'A16', SECONDARY, {})])
A.sig('Pebble Point Refining', r[0], 'Inquiry or RFQ', 3, RFQ, 'Web form'); A.sig('Pebble Point Refining', r[1], 'Webinar attended', 4, WEB, 'Webinar platform')

# ═════════ B · Micro-segments and NBA ═════════
B = Set('B')
def b(gid, name, tests, typ, days, detail, src, expect, **kw):
    r = B.acct(gid, name, tests, expect, **kw); B.sig(name, r[0], typ, days, detail, src); return r
b('B01', 'Ashgrove Refining', 'Inquiry: call to follow up, by email', 'Inquiry or RFQ', 3, RFQ, 'Web form', dict(segment='Inquiry', action='Call to follow up on the inquiry', channel='Email'))
b('B02', 'Birchwood Refining', 'Inquiry for a net-new account', 'Inquiry or RFQ', 5, 'Asked about alarm management on the hydrocracker', 'Web form', dict(segment='Inquiry'), existing='N', owner=RB)
b('B03', 'Cedarbank Refining', 'Inquiry: LinkedIn only (no email), so a connection note instead of an email', 'Inquiry or RFQ', 6, RFQ, 'Web form', dict(segment='Inquiry', channel='LinkedIn'),
  people=[('Ana', 'B03', PRIMARY, dict(email='', email_verified=''))])
b('B04', 'Dunmore Refining', 'Modernisation: migration-path discussion', 'Installed system near end of support', 60, EOS, 'Installed base', dict(segment='Modernisation', action='Propose a migration-path discussion'))
b('B05', 'Eastbrook Refining', 'Modernisation, net-new account', 'Installed system near end of support', 120, 'Legacy PLCs on the tank farm are end of life', 'Installed base', dict(segment='Modernisation'), existing='N', owner=RB)
b('B06', 'Foxhollow Refining', 'Modernisation, third account: exactly the minimum of 3', 'Installed system near end of support', 200, EOS, 'Installed base', dict(segment='Modernisation'))
b('B07', 'Glenmoor Refining', 'Service renewal: renewal review', 'Service contract renewal', 20, REN, 'CRM', dict(segment='Service renewal', action='Offer a renewal review'))
b('B08', 'Hawthorn Refining', 'Service renewal', 'Service contract renewal', 35, 'Annual maintenance agreement renews in January', 'CRM', dict(segment='Service renewal'), owner=RB)
b('B09', 'Ironwood Refining', 'Service renewal, third account', 'Service contract renewal', 50, 'Support contract for the control room renews in Q1', 'CRM', dict(segment='Service renewal'))
b('B10', 'Juniper Refining', 'Project: case study and technical session', 'Capital project', 15, PRJ, 'News', dict(segment='Project'))
b('B11', 'Kestrel Refining', 'Project, net-new account', 'Capital project', 30, 'FEED awarded for a new hydrotreater', 'News', dict(segment='Project'), existing='N', owner=RB)
b('B12', 'Larchmont Refining', 'Project, third account', 'Capital project', 45, 'Final investment decision on a new tank farm', 'News', dict(segment='Project'))
b('B13', 'Maplewood Refining', 'Leadership: only 2 accounts have this signal, below the minimum of 3, so the segment does not form; with no unexpired Leadership claim the action is a task for the owner', 'Leadership change', 5, LEAD, 'News', dict(segment=None))
b('B14', 'Nettlefield Refining', 'Leadership, second of only 2 accounts: no segment', 'Leadership change', 9, 'New head of operations appointed', 'News', dict(segment=None), owner=RB)
b('B15', 'Oxbow Refining', 'Engagement: follow up on the webinar topic', 'Webinar attended', 4, 'legacy-control migration', 'Webinar platform', dict(segment='Engagement'))
b('B16', 'Pinewood Refining', 'Engagement: content download', 'Content download', 7, 'migration planning guide', 'Website', dict(segment='Engagement'), owner=RB)
r = b('B17', 'Quarry Hill Refining', 'Engagement, third account: two people, the one with the stronger signal gets the action', 'Webinar attended', 6, 'alarm management', 'Webinar platform',
      dict(segment='Engagement', contact='Ana B17'), people=[('Ana', 'B17', PRIMARY, {}), ('Ben', 'B17', SECONDARY, {})])
B.sig('Quarry Hill Refining', r[1], 'Email clicked', 3, 'Clicked the session recording link', 'Email platform')
r = b('B18', 'Rowan Bay Refining', 'Two signals at one account: the fresher, stronger RFQ wins over an older end-of-support signal, so Inquiry', 'Inquiry or RFQ', 2, RFQ, 'Web form', dict(segment='Inquiry'))
B.sig('Rowan Bay Refining', r[0], 'Installed system near end of support', 400, EOS, 'Installed base')
b('B19', 'Silverton Refining', 'Tier C (email click only): not handed off, so not in any segment', 'Email clicked', 5, 'Clicked the migration guide link', 'Email platform', dict(handoff=False))

# ═════════ C · For Review ═════════
C = Set('C')
def c(gid, name, tests, typ, days, detail, src, expect, **kw):
    r = C.acct(gid, name, tests, expect, **kw); C.sig(name, r[0], typ, days, detail, src); return r
c('C01', 'Amberly Refining', 'Clean: passes every check and goes ahead on its own', 'Inquiry or RFQ', 3, RFQ, 'Web form', dict(route='Released'))
c('C02', 'Blackrock Refining', 'Clean, second rep', 'Inquiry or RFQ', 5, 'Asked about alarm management on the hydrocracker', 'Web form', dict(route='Released'), owner=RB)
c('C03', 'Coldwater Refining', 'The inquiry mentions a safety incident: Sensitive content, straight to the sales manager\'s Approvals',
  'Inquiry or RFQ', 4, 'Asked for a quote after a safety incident on the crude unit', 'Web form', dict(route='Approvals', reason='Sensitive'))
c('C04', 'Dovecote Refining', 'No contact in the primary persona: Low confidence, to the exception queue', 'Inquiry or RFQ', 6, RFQ, 'Web form', dict(route='Queue', reason='Low confidence'),
  people=[('Dev', 'C04', SECONDARY, {}), ('Eli', 'C04', 'Maintenance Manager', {})])
c('C05', 'Elderberry Petrochem', 'Estimated first deal below the threshold (adjacent vertical, smaller, EPC contractor): Below deal size, to the queue',
  'Installed system near end of support', 90, EOS, 'Installed base', dict(route='Queue', reason='Below the deal-size'),
  industry='Petrochemicals', process='Olefins', revenue=400000000, employees=1200, account_type='EPC contractor')
c('C06', 'Fallowfield Refining', 'The signal detail reads like a product claim with no approved source: A claim can\'t be verified, to the queue',
  'Service contract renewal', 30, 'Renewal review: the upgrade reduced downtime by 20% last year', 'CRM', dict(route='Queue', reason="claim can't be verified"))
c('C07', 'Greystone Refining', 'The signal detail mentions pricing: the first draft fails the brand check, is rewritten once and then passes, so it goes ahead (version 2)',
  'Service contract renewal', 25, 'Asked about pricing for the renewal', 'CRM', dict(route='Released', regen=True))
c('C08', 'Hollowell Refining', 'Tier A, but email not verified and no LinkedIn: no way to reach them, so held back at hand-off and never reaches For Review', 'Capital project', 20, PRJ, 'News', dict(heldBack=True),
  people=[('Ana', 'C08', PRIMARY, dict(email_verified='N', linkedin_url=''))])
c('C09', 'Ivybridge Refining', 'Leadership: only this account has the signal, so no segment (too small): to the queue as a task for the owner', 'Leadership change', 6, LEAD, 'News', dict(route='Queue', reason='Segment too small'))
c('C10', 'Juneberry Refining', 'Two problems at once: no primary-persona contact and a sensitive word (cybersecurity). Sensitive wins: Approvals, with both reasons listed',
  'Inquiry or RFQ', 3, 'Asked about a cybersecurity upgrade for the control system', 'Web form', dict(route='Approvals', reason='Sensitive'),
  people=[('Dev', 'C10', SECONDARY, {})])
c('C11', 'Kingfisher Refining', 'Clean Modernisation item', 'Installed system near end of support', 60, EOS, 'Installed base', dict(route='Released'))
c('C12', 'Lindenfield Refining', 'Clean Modernisation item, second rep', 'Installed system near end of support', 120, 'Legacy PLCs on the tank farm are end of life', 'Installed base', dict(route='Released'), owner=RB)
c('C13', 'Moorcroft Refining', 'Clean Service renewal item', 'Service contract renewal', 40, REN, 'CRM', dict(route='Released'))
c('C14', 'Netherby Refining', 'Clean Project item', 'Capital project', 30, 'FEED awarded for a new hydrotreater', 'News', dict(route='Released'))
c('C15', 'Ormond Refining', 'Clean Project item, second rep', 'Capital project', 45, 'Final investment decision on a new tank farm', 'News', dict(route='Released'), owner=RB)
c('C16', 'Pennant Refining', 'Clean Project item: the third, so the Project segment forms', 'Capital project', 15, PRJ, 'News', dict(route='Released'))


def book(path, sheet, cols, rows):
    wb = Workbook(); ws = wb.active; ws.title = sheet; ws.append(cols)
    for r in rows:
        vals = [r.get(c, '') for c in cols] if isinstance(r, dict) else list(r)
        ws.append([None if v == '' else v for v in vals])
    for cell in ws[1]: cell.font = Font(bold=True)
    for col in ws.columns: ws.column_dimensions[col[0].column_letter].width = min(40, max(10, *(len(str(c.value or '')) + 2 for c in col)))
    ws.freeze_panes = 'A2'; wb.save(path)

NAMES = {'A': 'Golden_A_Scoring', 'B': 'Golden_B_Segments_NBA', 'C': 'Golden_C_For_Review'}
spec = {}
for s in (A, B, C):
    d = os.path.join(OUT, NAMES[s.key]); os.makedirs(d, exist_ok=True)
    book(os.path.join(d, f'{NAMES[s.key]}_1_Prospects.xlsx'), 'Lead template', LEAD_COLS, s.leads)
    book(os.path.join(d, f'{NAMES[s.key]}_2_Signals.xlsx'), 'Signal template', SIG_COLS, s.sigs)
    spec[s.key] = dict(name=NAMES[s.key], leads=[[r.get(c, '') for c in LEAD_COLS] for r in s.leads], signals=s.sigs, accounts=s.accounts)
    print(s.key, len(s.accounts), 'accounts', len(s.leads), 'contacts', len(s.sigs), 'signals')
json.dump(dict(asOf=AS_OF, leadCols=LEAD_COLS, sigCols=SIG_COLS, sets=spec), open(SPEC, 'w'), indent=1)
