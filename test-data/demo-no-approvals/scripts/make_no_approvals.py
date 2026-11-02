"""A list where nothing needs approval: only built-in signal types and the six built-in segments, so there is nothing to
add in Setup, no new segment, action or signal type for anyone to approve, and every account goes ahead on its own.
Signals stack and differ in age, so the ranking spreads out.
Usage: python3 make_no_approvals.py <output folder> <spec.json>"""
import json, os, sys
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font

OUT, SPEC = sys.argv[1], sys.argv[2]
ROUND = sys.argv[3] if len(sys.argv) > 3 else ''   # 'B': the same design with different company and people names (all invented)
CO_B = ['Alderbay Refining', 'Beacon Hill Refining', 'Crestmoor Refining', 'Dunmore Refining', 'Eastholm Refining', 'Fallowfield Refining',
        'Garnet Bay Refining', 'Hazelton Refining', 'Islemere Refining', 'Jarrow Point Refining', 'Kinross Refining', 'Lyndale Refining',
        'Mossgate Refining', 'Norcliff Refining', 'Ospreyfield Refining', 'Parkhurst Refining', 'Quinton Refining', 'Ridgeway Refining', 'Sablewood Refining']
PEOPLE_B = [('Yusri', 'Hamzah'), ('Grace', 'Ho'), ('Anjali', 'Menon'), ('Fadli', 'Rosli'), ('Chee', 'Keong'), ('Liza', 'Bautista'), ('Thu', 'Nguyen'),
            ('Ratna', 'Sari'), ('Prasit', 'Wong'), ('Wei', 'Jie'), ('Miguel', 'Torres'), ('Mei', 'Fong'), ('Long', 'Tran'), ('Intan', 'Permata'),
            ('Desmond', 'Lim'), ('Neha', 'Kapoor'), ('Joanna', 'Sim'), ('Lee', 'Hwa'), ('Aiman', 'Rashid'), ('Carmen', 'Reyes')]
# Round C: different names again, plus LinkedIn comments and new plants (the Admin has already set these up in Setup)
CO_C = ['Amberwick Refining', 'Bellhaven Refining', 'Cloverdale Refining', 'Driftmoor Refining', 'Eastbrook Refining', 'Fernvale Refining',
        'Graniteview Refining', 'Hillcrest Bay Refining', 'Ivywood Refining', 'Jadebridge Refining', 'Kelso Refining', 'Lakemont Refining',
        'Merrow Refining', 'Newhaven Point Refining', 'Oldfield Refining', 'Pinehurst Refining', 'Quarrymoor Refining', 'Ryeford Refining', 'Shorecliff Refining',
        'Tallis Refining', 'Upton Bay Refining', 'Vantage Refining', 'Willowmere Refining', 'Yewbank Refining', 'Zephyr Point Refining', 'Ashgrove Refining',
        'Bridgewater Bay Refining', 'Cresthaven Refining']
PEOPLE_C = [('Hakim', 'Yunus'), ('Stella', 'Ng'), ('Rohit', 'Verma'), ('Aziz', 'Malik'), ('Kenneth', 'Chew'), ('Bea', 'Santiago'), ('Lan', 'Phuong'),
            ('Wulan', 'Dewi'), ('Narong', 'Sri'), ('Zhi', 'Hao'), ('Paulo', 'Garcia'), ('Yan', 'Ling'), ('Khanh', 'Le'), ('Sinta', 'Maharani'),
            ('Gavin', 'Loh'), ('Meera', 'Pillai'), ('Rachel', 'Toh'), ('Kim', 'Seng'), ('Faiz', 'Ismail'), ('Lorna', 'Cruz'), ('Iqbal', 'Hussain'),
            ('Tina', 'Goh'), ('Chai', 'Wattana'), ('Huy', 'Dang'), ('Sofia', 'Ramirez'), ('Nizam', 'Omar'), ('Lena', 'Yap'), ('Arvind', 'Das'),
            ('Mona', 'Tan'), ('Eric', 'Sia')]
if ROUND == 'C': CO_B, PEOPLE_B = CO_C, PEOPLE_C
_co, _pp = {}, {}
def rn(name):
    if not ROUND: return name
    if name not in _co: _co[name] = CO_B[len(_co)]
    return _co[name]
def rp(first, last):
    if not ROUND: return first, last
    if (first, last) not in _pp: _pp[(first, last)] = PEOPLE_B[len(_pp)]
    return _pp[(first, last)]
AS_OF = '2026-11-09'   # set this as the score date
LEAD_COLS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
             'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
             'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
             'capacity_unit', 'consent_basis', 'opt_out', 'owner_email']
SIG_COLS = ['company_name', 'contact_email_or_linkedin', 'lead_name', 'signal_type', 'event_date', 'detail', 'source', 'product', 'company_domain']
RA, RB = 'priya.nair@client-sample.com', 'daniel.koh@client-sample.com'
slug = lambda v: ''.join(ch for ch in v.lower() if ch.isalnum())
ago = lambda n: (date.fromisoformat(AS_OF) - timedelta(days=n)).isoformat()
leads, sigs, accounts = [], [], []
IM, OD = ('Instrumentation Manager', 'Manager'), ('Operations Director', 'Director')

def acct(aid, name, story, segment, people, owner, country, customer=False, size='large'):
    name = rn(name); dom = slug(name) + '.example'; refs = []
    rev, emp, cap = {'large': (2100000000, 2800, 150000), 'mid': (900000000, 1400, 80000)}[size]
    for first, last, (title, sen) in people:
        first, last = rp(first, last)
        r = dict(first_name=first, last_name=last, job_title=title, seniority=sen, email=f'{slug(first)}.{slug(last)}@{dom}', email_verified='Y',
                 linkedin_url=f'https://www.linkedin.com/in/{slug(first)}-{slug(last)}-{aid.lower()}', company_name=name, company_domain=dom,
                 country=country, city='', industry='Refining', annual_revenue_usd=rev, employee_count=emp, account_type='Owner-operator',
                 existing_customer='Y' if customer else 'N', managed_separately='N', site_name=name.split()[0] + ' refinery',
                 site_process_type='Crude refining', site_capacity=cap, capacity_unit='bpd',
                 consent_basis='existing customer' if customer else 'legitimate interest', opt_out='N', owner_email=owner)
        leads.append(r); refs.append((r['email'], f'{first} {last}'))
    accounts.append(dict(id=aid, name=name, story=story, expect=dict(segment=segment, route='Released')))
    return refs
def sig(name, ref, typ, days, detail, source):
    sigs.append([rn(name), ref[0], ref[1], typ, ago(days), detail, source, '', ''])

INQ, EOS, SVC, CAP, LC, WB, CD = ('Inquiry or RFQ', 'Installed system near end of support', 'Service contract renewal', 'Capital project',
                                  'Leadership change', 'Webinar attended', 'Content download')
# ── Inquiry (3) ──
r = acct('Q01', 'Bluefin Refining', 'Hero: asked for a quote AND attended a migration webinar: top of the ranking', 'Inquiry', [('Hasnah', 'Ali', IM), ('Victor', 'Lam', OD)], RA, 'Malaysia')
sig('Bluefin Refining', r[0], INQ, 3, 'Asked for a quote on a DCS migration for the crude unit', 'Web form')
sig('Bluefin Refining', r[0], WB, 10, 'legacy-control migration', 'Webinar platform')
r = acct('Q02', 'Cedarline Refining', 'Asked about alarm management', 'Inquiry', [('Pooja', 'Shah', IM)], RB, 'Singapore')
sig('Cedarline Refining', r[0], INQ, 6, 'Asked about alarm management on the hydrocracker', 'Web form')
r = acct('Q03', 'Dovecote Refining', 'Asked about a control room upgrade 20 days ago', 'Inquiry', [('Arif', 'Hakim', IM)], RA, 'Indonesia', size='mid')
sig('Dovecote Refining', r[0], INQ, 20, 'Asked about the timeline for a control room upgrade', 'Web form')
# ── Modernisation (3, existing customers) ──
r = acct('Q04', 'Emberly Refining', 'DCS reaches end of support next year', 'Modernisation', [('Kok', 'Wai', IM)], RB, 'Malaysia', customer=True)
sig('Emberly Refining', r[0], EOS, 40, 'the DCS on the crude unit reaches end of support in 2027', 'Installed base')
r = acct('Q05', 'Glenmoor Refining', 'Legacy PLCs end of life', 'Modernisation', [('Ana', 'Villareal', IM)], RA, 'Philippines', customer=True)
sig('Glenmoor Refining', r[0], EOS, 120, 'the legacy PLCs on the tank farm are end of life', 'Installed base')
r = acct('Q06', 'Hartwell Refining', 'Safety system goes out of support, mid-size site', 'Modernisation', [('Tuan', 'Bui', IM)], RB, 'Vietnam', customer=True, size='mid')
sig('Hartwell Refining', r[0], EOS, 200, 'the safety system on the reformer goes out of support next year', 'Installed base')
# ── Service renewal (3, existing customers) ──
r = acct('Q07', 'Inglewood Refining', 'Service contract renews in March', 'Service renewal', [('Mira', 'Lestari', IM)], RA, 'Indonesia', customer=True)
sig('Inglewood Refining', r[0], SVC, 10, 'Service contract renews on 31 Mar 2027', 'CRM')
r = acct('Q08', 'Jasperton Refining', 'Maintenance agreement renews in January', 'Service renewal', [('Somsak', 'Chai', IM)], RB, 'Thailand', customer=True)
sig('Jasperton Refining', r[0], SVC, 30, 'Annual maintenance agreement renews in January', 'CRM')
r = acct('Q09', 'Kestrel Point Refining', 'Support contract renews in Q1, mid-size site', 'Service renewal', [('Jun', 'Ong', IM)], RA, 'Singapore', customer=True, size='mid')
sig('Kestrel Point Refining', r[0], SVC, 60, 'Support contract for the control room renews in Q1', 'CRM')
# ── Project (4) ──
r = acct('Q10', 'Larchmont Refining', 'Capital project announced AND a new plant director: two signals stack', 'Project', [('Rafael', 'Diaz', IM)], RB, 'Philippines')
sig('Larchmont Refining', r[0], CAP, 15, 'Announced an expansion of the crude unit', 'News')
sig('Larchmont Refining', r[0], LC, 12, 'New plant director appointed', 'News')
r = acct('Q11', 'Millbrook Refining', 'FEED awarded for a new hydrotreater', 'Project', [('Siew', 'Ling', IM)], RA, 'Malaysia')
sig('Millbrook Refining', r[0], CAP, 30, 'FEED awarded for a new hydrotreater', 'News')
r = acct('Q12', 'Nettlefield Refining', 'Final investment decision on a new tank farm', 'Project', [('Hoang', 'Lam', IM)], RB, 'Vietnam')
sig('Nettlefield Refining', r[0], CAP, 60, 'Final investment decision on a new tank farm', 'News')
r = acct('Q13', 'Orchid Bay Refining', 'Capital project 5 months ago, mid-size site', 'Project', [('Dewi', 'Putri', IM)], RA, 'Indonesia', size='mid')
sig('Orchid Bay Refining', r[0], CAP, 150, 'Announced a revamp of the vacuum unit', 'News')
# ── Leadership (3) ──
for aid, nm, (fn, ln), d, det, ow, ctry in [('Q14', 'Primrose Refining', ('Gareth', 'Neo'), 8, 'New head of operations appointed', RB, 'Singapore'),
                                             ('Q15', 'Quillon Refining', ('Aditi', 'Joshi'), 16, 'New VP engineering joined', RA, 'Malaysia'),
                                             ('Q16', 'Rookwood Refining', ('Chanel', 'Tan'), 24, 'New plant director appointed', RB, 'Thailand')]:
    r = acct(aid, nm, f'Leadership change ({d} days ago)', 'Leadership', [(fn, ln, IM)], ow, ctry); sig(nm, r[0], LC, d, det, 'News')
# ── Engagement (3) ──
r = acct('Q17', 'Sorrel Refining', 'Attended a webinar on alarm management AND downloaded a guide', 'Engagement', [('Ming', 'Hui', IM)], RA, 'Singapore')
sig('Sorrel Refining', r[0], WB, 5, 'alarm management', 'Webinar platform'); sig('Sorrel Refining', r[0], CD, 12, 'migration planning guide', 'Website')
r = acct('Q18', 'Tidewater Refining', 'Downloaded the migration planning guide', 'Engagement', [('Ikhwan', 'Zain', IM)], RB, 'Malaysia')
sig('Tidewater Refining', r[0], CD, 14, 'migration planning guide', 'Website')
r = acct('Q19', 'Umber Refining', 'Attended a webinar on reliability planning, mid-size site', 'Engagement', [('Jose', 'Ramos', IM)], RA, 'Philippines', size='mid')
sig('Umber Refining', r[0], WB, 28, 'reliability planning', 'Webinar platform')

NEW_TYPES, SEGMENTS = [], []
if ROUND == 'C':
    LI, NP, TA = 'Commented on LinkedIn', 'New plant announced', 'Talking about ageing systems'
    NEW_TYPES = [dict(name=NP, segment='New plants', level='Strong', full=90, zero=365, about='The company announced a new plant, unit or major site expansion.'),
                 dict(name=LI, segment=TA, level='Medium', full=30, zero=90, about='A person at the account commented publicly on an industry post about ageing control systems.')]
    SEGMENTS = [dict(name='New plants', actions=[['Propose a front-end design session for the new plant', ''], ['Share a reference plant of a similar size', '']]),
                dict(name=TA, actions=[['Share a short point of view on that topic, with a peer example', ''], ['Invite them to a peer roundtable on the same problem', '']])]
    # ── Talking about ageing systems (5) ──
    r = acct('Q20', 'Rosehill Refining', 'Hero: commented on a post about ageing DCS 2 days ago AND downloaded the migration guide', TA, [('Aaron', 'Lee', IM), ('Bina', 'Rao', OD)], RA, 'Malaysia')
    sig('Rosehill Refining', r[0], LI, 2, 'your comment on an industry post about running a DCS past its end of support', 'LinkedIn')
    sig('Rosehill Refining', r[0], CD, 9, 'migration planning guide', 'Website')
    r = acct('Q21', 'Seaholme Refining', 'Commented on a post about alarm floods', TA, [('Chen', 'Yi', IM)], RB, 'Singapore')
    sig('Seaholme Refining', r[0], LI, 5, 'your comment on a post about alarm floods on older control systems', 'LinkedIn')
    r = acct('Q22', 'Thornfield Refining', 'Commented on a post about spare parts for old controllers', TA, [('Dara', 'Sok', IM)], RA, 'Thailand')
    sig('Thornfield Refining', r[0], LI, 9, 'your comment on a post about sourcing spare parts for old controllers', 'LinkedIn')
    r = acct('Q23', 'Underwood Refining', 'Commented on a post about obsolete operator stations, mid-size site', TA, [('Elena', 'Cruz', IM)], RB, 'Philippines', size='mid')
    sig('Underwood Refining', r[0], LI, 14, 'your comment on a post about keeping obsolete operator stations running', 'LinkedIn')
    r = acct('Q24', 'Verdant Refining', 'Commented 40 days ago: past full weight, ranks lower', TA, [('Faisal', 'Noor', IM)], RA, 'Indonesia')
    sig('Verdant Refining', r[0], LI, 40, 'your comment on a post about migrating a DCS without a shutdown', 'LinkedIn')
    # ── New plants (4) ──
    r = acct('Q25', 'Westgate Refining', 'Hero: a new hydrocracker announced AND a new plant director: top of the ranking', 'New plants', [('Gina', 'Lau', IM)], RB, 'Malaysia')
    sig('Westgate Refining', r[0], NP, 6, 'the new hydrocracker you announced, with start-up planned for 2029', 'News')
    sig('Westgate Refining', r[0], LC, 10, 'New plant director appointed', 'News')
    r = acct('Q26', 'Yellowstone Refining', 'A new aromatics unit announced', 'New plants', [('Harun', 'Said', IM)], RA, 'Singapore')
    sig('Yellowstone Refining', r[0], NP, 20, 'the new aromatics unit you announced', 'News')
    r = acct('Q27', 'Zinnia Refining', 'A refinery expansion announced', 'New plants', [('Isabel', 'Tan', IM)], RB, 'Indonesia')
    sig('Zinnia Refining', r[0], NP, 45, 'the expansion of your refinery you announced', 'News')
    r = acct('Q28', 'Arden Bay Refining', 'A new tank farm announced 4 months ago, mid-size site', 'New plants', [('Jonas', 'Wee', IM)], RA, 'Vietnam', size='mid')
    sig('Arden Bay Refining', r[0], NP, 120, 'the new tank farm you announced', 'News')

def book(path, sheet, cols, rows):
    wb = Workbook(); ws = wb.active; ws.title = sheet; ws.append(cols)
    for row in rows:
        vals = [row.get(c, '') for c in cols] if isinstance(row, dict) else list(row)
        ws.append([None if v == '' else v for v in vals])
    for c in ws[1]: c.font = Font(bold=True)
    for col in ws.columns: ws.column_dimensions[col[0].column_letter].width = min(48, max(10, *(len(str(c.value or '')) + 2 for c in col)))
    ws.freeze_panes = 'A2'; wb.save(path)
os.makedirs(OUT, exist_ok=True)
PRE = 'No_Approvals_' + (ROUND + '_' if ROUND else '')
PF, SF = ('Prospect_Data.xlsx', 'Signal_Data.xlsx') if ROUND else (PRE + '1_Prospects.xlsx', PRE + '2_Signals.xlsx')
book(os.path.join(OUT, PF), 'Lead template', LEAD_COLS, leads)
book(os.path.join(OUT, SF), 'Signal template', SIG_COLS, sigs)
json.dump(dict(prefix=PRE, prospectFile=PF, signalFile=SF, asOf=AS_OF, leadCols=LEAD_COLS, sigCols=SIG_COLS, newTypes=NEW_TYPES, segments=SEGMENTS,
               leads=[[r.get(c, '') for c in LEAD_COLS] for r in leads], signals=sigs, accounts=accounts), open(SPEC, 'w'), indent=1)
print(len(accounts), 'accounts', len(leads), 'contacts', len(sigs), 'signals')
