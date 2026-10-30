"""A prospect file and a signal file where every account goes ahead with an email, in all six micro-segments, so the
Content library's effect on real messages can be read: claims, voice, openers, length, sign-off.
Usage: python3 make_content_check.py <output folder> <spec.json>"""
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
slug = lambda v: ''.join(ch for ch in v.lower() if ch.isalnum())
ago = lambda n: (date.fromisoformat(AS_OF) - timedelta(days=n)).isoformat()
COUNTRIES = ['Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Indonesia', 'Vietnam']
REPS = ['rep.a@client-sample.com', 'rep.b@client-sample.com']
# segment, signal type, details (one per account), source, days ago
PLAN = [
    ('Inquiry', 'Inquiry or RFQ', ['Asked for a quote on a DCS migration for the crude unit', 'Asked about alarm management on the hydrocracker',
                                   'Asked about the timeline for a control room upgrade'], 'Web form', [3, 5, 8]),
    ('Modernisation', 'Installed system near end of support', ['the DCS on the crude unit reaches end of support in 2027', 'the legacy PLCs on the tank farm are end of life',
                                                               'the safety system on the reformer goes out of support next year'], 'Installed base', [40, 90, 150]),
    ('Service renewal', 'Service contract renewal', ['Service contract renews on 31 Mar 2027', 'Annual maintenance agreement renews in January',
                                                     'Support contract for the control room renews in Q1'], 'CRM', [10, 20, 35]),
    ('Project', 'Capital project', ['Announced an expansion of the crude unit', 'FEED awarded for a new hydrotreater', 'Final investment decision on a new tank farm'], 'News', [15, 30, 45]),
    ('Leadership', 'Leadership change', ['New head of operations appointed', 'New plant director appointed', 'New VP engineering joined'], 'News', [5, 10, 20]),
    ('Engagement', 'Webinar attended', ['legacy-control migration', 'alarm management', 'reliability planning'], 'Webinar platform', [4, 9, 14]),
]
NAMES = ['Arcadia', 'Bayview', 'Coralstone', 'Duskwood', 'Emberline', 'Falcon Ridge', 'Goldcrest', 'Highmoor', 'Islandport', 'Jadeite', 'Kestrelbay', 'Lumina',
         'Moonstone', 'Northwind Bay', 'Orchard Point', 'Pinecrest Bay', 'Quayside', 'Riverbend', 'Seagrove', 'Tidewell']
PEOPLE = [('Aiko', 'Tan'), ('Ben', 'Lim'), ('Chandra', 'Ng'), ('Dewi', 'Hartono'), ('Eko', 'Pratama'), ('Farah', 'Ismail'), ('Gopal', 'Nair'), ('Hana', 'Reyes'),
          ('Irfan', 'Yusof'), ('Jia', 'Wong'), ('Kiran', 'Menon'), ('Lan', 'Tran'), ('Mei', 'Ong'), ('Nadia', 'Rahman'), ('Oscar', 'Cruz'), ('Putri', 'Sari'),
          ('Quan', 'Vo'), ('Rizal', 'Hamid'), ('Siti', 'Aminah'), ('Thanh', 'Pham')]
SECOND = [('Plant Manager', 'Director'), ('Maintenance Manager', 'Manager'), ('Operations Director', 'Director')]
leads, sigs, accounts = [], [], []
i = 0
for seg, typ, details, source, days in PLAN:
    for j, det in enumerate(details):
        name = f'{NAMES[i]} Refining'; dom = slug(name) + '.example'; fn, ln = PEOPLE[i]
        base = dict(company_name=name, company_domain=dom, country=COUNTRIES[i % 6], city='', industry='Refining', annual_revenue_usd=2400000000,
                    employee_count=3200, account_type='Owner-operator', existing_customer='Y', managed_separately='N', site_name=f'{NAMES[i]} refinery',
                    site_process_type='Crude refining', site_capacity=150000, capacity_unit='bpd', consent_basis='existing customer', opt_out='N', owner_email=REPS[i % 2])
        p1 = dict(base, first_name=fn, last_name=ln, job_title='Instrumentation Manager', seniority='Manager', email=f'{slug(fn)}.{slug(ln)}@{dom}',
                  email_verified='Y', linkedin_url=f'https://www.linkedin.com/in/{slug(fn)}-{slug(ln)}-{i}')
        t2, s2 = SECOND[i % 3]
        p2 = dict(base, first_name='Alex', last_name=NAMES[i].split()[0], job_title=t2, seniority=s2, email=f'alex.{slug(NAMES[i])}@{dom}', email_verified='Y',
                  linkedin_url=f'https://www.linkedin.com/in/alex-{slug(NAMES[i])}')
        leads += [p1, p2]
        sigs.append([name, p1['email'], typ, ago(days[j]), det, source, ''])
        accounts.append(dict(id=f'C{i + 1:02d}', name=name, segment=seg, contact=f'{fn} {ln}', owner=REPS[i % 2]))
        i += 1
# Two LinkedIn-only accounts: a connection note instead of an email (no claim in a note)
for seg, typ, det, source, d in [('Inquiry', 'Inquiry or RFQ', 'Asked for a quote on a safety system upgrade', 'Web form', 6),
                                 ('Engagement', 'Content download', 'migration planning guide', 'Website', 7)]:
    name = f'{NAMES[i]} Refining'; dom = slug(name) + '.example'; fn, ln = PEOPLE[i]
    p = dict(company_name=name, company_domain=dom, country=COUNTRIES[i % 6], city='', industry='Refining', annual_revenue_usd=2400000000, employee_count=3200,
             account_type='Owner-operator', existing_customer='Y', managed_separately='N', site_name=f'{NAMES[i]} refinery', site_process_type='Crude refining',
             site_capacity=150000, capacity_unit='bpd', consent_basis='existing customer', opt_out='N', owner_email=REPS[i % 2],
             first_name=fn, last_name=ln, job_title='Instrumentation Manager', seniority='Manager', email='', email_verified='',
             linkedin_url=f'https://www.linkedin.com/in/{slug(fn)}-{slug(ln)}-{i}')
    leads.append(p); sigs.append([name, p['linkedin_url'], typ, ago(d), det, source, ''])
    accounts.append(dict(id=f'C{i + 1:02d}', name=name, segment=seg, contact=f'{fn} {ln}', owner=REPS[i % 2], linkedin=True))
    i += 1

def book(path, sheet, cols, rows):
    wb = Workbook(); ws = wb.active; ws.title = sheet; ws.append(cols)
    for r in rows: ws.append([None if (r.get(c, '') if isinstance(r, dict) else r[k]) == '' else (r.get(c) if isinstance(r, dict) else r[k]) for k, c in enumerate(cols)])
    for c in ws[1]: c.font = Font(bold=True)
    for col in ws.columns: ws.column_dimensions[col[0].column_letter].width = min(40, max(10, *(len(str(c.value or '')) + 2 for c in col)))
    ws.freeze_panes = 'A2'; wb.save(path)
os.makedirs(OUT, exist_ok=True)
book(os.path.join(OUT, 'Content_Check_1_Prospects.xlsx'), 'Lead template', LEAD_COLS, leads)
book(os.path.join(OUT, 'Content_Check_2_Signals.xlsx'), 'Signal template', SIG_COLS, sigs)
json.dump(dict(asOf=AS_OF, leadCols=LEAD_COLS, sigCols=SIG_COLS, leads=[[r.get(c, '') for c in LEAD_COLS] for r in leads], signals=sigs, accounts=accounts), open(SPEC, 'w'), indent=1)
print(len(accounts), 'accounts', len(leads), 'contacts', len(sigs), 'signals')
