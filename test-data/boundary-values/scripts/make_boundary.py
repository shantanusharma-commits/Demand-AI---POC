"""Boundary-value test set: each pair of accounts sits either side of a point where a rule flips (fit floor, tier
cut-offs, a signal's window, the 3-account segment minimum, consent and reachability). Score date 16 Nov 2026.
All companies and people are invented.
Usage: python3 make_boundary.py <out folder> <spec.json>"""
import json, os, sys
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font
OUT, SPEC = sys.argv[1], sys.argv[2]
AS_OF = '2026-11-16'
ago = lambda n: (date.fromisoformat(AS_OF) - timedelta(days=n)).isoformat()
LEAD_COLS = ['first_name','last_name','job_title','seniority','email','email_verified','linkedin_url','company_name','company_domain','country','city','industry','annual_revenue_usd','employee_count','account_type','existing_customer','managed_separately','site_name','site_process_type','site_capacity','capacity_unit','consent_basis','opt_out','owner_email']
SIG_COLS = ['company_name','contact_email_or_linkedin','lead_name','signal_type','event_date','detail','source','product','company_domain']
slug = lambda v: ''.join(ch for ch in v.lower() if ch.isalnum())
leads, sigs, accounts = [], [], []
BIG = dict(industry='Refining', site_process_type='Crude refining', annual_revenue_usd=2000000000, employee_count=3000, account_type='Owner-operator', existing_customer='N')
def acc(aid, name, first, last, tests, expect, sig, profile=BIG, person=None):
    dom = slug(name) + '.example'
    p = dict(first_name=first, last_name=last, job_title='Instrumentation Manager', seniority='Manager', email=f'{slug(first)}.{slug(last)}@{dom}', email_verified='Y',
             linkedin_url=f'https://www.linkedin.com/in/{slug(first)}-{slug(last)}-{aid.lower()}', company_name=name, company_domain=dom, country='Singapore', city='',
             managed_separately='N', site_name=name.split()[0] + ' site', site_capacity=150000, capacity_unit='bpd', consent_basis='legitimate interest', opt_out='N',
             owner_email='rep.a@client-sample.com', **profile)
    p.update(person or {}); leads.append(p)
    typ, days, det = sig
    sigs.append([name, p['email'] or p['linkedin_url'], f'{first} {last}', typ, ago(days), det, 'Test', '', dom])
    accounts.append(dict(id=aid, name=name, tests=tests, expect=expect))
INQ = lambda d: ('Inquiry or RFQ', d, 'Asked for a quote on a DCS migration')
FIT50 = dict(industry='Petrochemicals', site_process_type='Olefins', annual_revenue_usd=50000000, employee_count=100, account_type='Owner-operator', existing_customer='N')
FIT49 = dict(industry='Petrochemicals', site_process_type='Olefins', annual_revenue_usd=50000000, employee_count=100, account_type='', existing_customer='Y')
acc('BV01', 'Alderwood Chemicals', 'Ana', 'Ruiz', 'Fit floor: fit exactly 50, the floor (also a small deal: held for deal size)', dict(fit=50, tier='B', route='For Review'), INQ(5), FIT50)
acc('BV02', 'Birchmont Chemicals', 'Ben', 'Sato', 'Fit floor: fit 49, one point under', dict(fit=49, tier='Below fit floor'), INQ(5), FIT49)
acc('BV03', 'Cobbleford Refining', 'Cara', 'Lim', 'Tier A cut-off (35): inquiry 43 days old', dict(score=35.6, tier='A'), INQ(43))
acc('BV04', 'Dunmere Refining', 'Dev', 'Rao', 'Tier A cut-off (35): inquiry 44 days old', dict(score=34.9, tier='B'), INQ(44))
acc('BV05', 'Elmcroft Refining', 'Eli', 'Tan', 'Tier B cut-off (20): webinar 70 days old', dict(score=20, tier='B', route='For Review'), ('Webinar attended', 70, 'legacy-control migration'))
acc('BV06', 'Fernleigh Refining', 'Fay', 'Ong', 'Tier B cut-off (20): webinar 71 days old', dict(score=19.8, tier='C'), ('Webinar attended', 71, 'legacy-control migration'))
acc('BV07', 'Glenrock Refining', 'Gus', 'Lee', 'Signal window: inquiry 89 days old, inside the 90-day window', dict(signal='Qualified', tier='C'), INQ(89))
acc('BV08', 'Hollybrook Refining', 'Hui', 'Ng', 'Signal window: inquiry 90 days old, at the 90-day limit', dict(signal='Rejected', tier='Watch list'), INQ(90))
acc('BV09', 'Ironwell Refining', 'Ian', 'Koh', 'Segment minimum: 1 of only 2 leadership-change accounts', dict(segment=None, route='For Review'), ('Leadership change', 5, 'New plant director appointed'))
acc('BV10', 'Juniper Refining', 'Jo', 'Chua', 'Segment minimum: 2 of only 2 leadership-change accounts', dict(segment=None, route='For Review'), ('Leadership change', 6, 'New head of operations appointed'))
for aid, nm, (f, l), d in [('BV11', 'Kestrel Refining', ('Kai', 'Wu'), 10), ('BV12', 'Larchfield Refining', ('Lea', 'Goh'), 12), ('BV13', 'Millbank Refining', ('Max', 'Yeo'), 14)]:
    acc(aid, nm, f, l, f'Segment minimum: {aid[-1] if aid != "BV13" else 3} of exactly 3 capital-project accounts', dict(segment='Project'), ('Capital project', d, 'Announced an expansion of the crude unit'))
acc('BV14', 'Northgate Refining', 'Nia', 'Teo', 'Consent: opt_out = Y (the only contact)', dict(handoff=False), ('Service contract renewal', 10, 'Service contract renews on 31 Mar 2027'), person=dict(opt_out='Y'))
acc('BV15', 'Oakhill Refining', 'Oli', 'Sim', 'Consent: opt_out blank (not confirmed)', dict(handoff=False), ('Service contract renewal', 11, 'Service contract renews in January'), person=dict(opt_out=''))
acc('BV16', 'Pinewood Refining', 'Pia', 'Low', 'Consent: consent_basis blank', dict(handoff=False), ('Service contract renewal', 12, 'Support contract renews in Q1'), person=dict(consent_basis=''))
acc('BV17', 'Quarrydale Refining', 'Quin', 'Ho', 'Reach: email not verified and no LinkedIn URL', dict(handoff=False), ('Service contract renewal', 13, 'Maintenance agreement renews in February'), person=dict(email_verified='N', linkedin_url=''))
acc('BV18', 'Ravenmoor Refining', 'Rae', 'Chan', 'Reach: email not verified, LinkedIn URL present', dict(channel='LinkedIn'), ('Service contract renewal', 14, 'Service contract renews in March'), person=dict(email_verified='N'))
def book(path, sheet, cols, rows):
    wb = Workbook(); ws = wb.active; ws.title = sheet; ws.append(cols)
    for r in rows:
        vals = [r.get(c, '') for c in cols] if isinstance(r, dict) else r
        ws.append([None if v == '' else v for v in vals])
    for c in ws[1]: c.font = Font(bold=True)
    for col in ws.columns: ws.column_dimensions[col[0].column_letter].width = min(44, max(10, *(len(str(c.value or '')) + 2 for c in col)))
    ws.freeze_panes = 'A2'; wb.save(path)
os.makedirs(OUT, exist_ok=True)
book(os.path.join(OUT, 'Boundary_1_Prospects.xlsx'), 'Lead template', LEAD_COLS, leads)
book(os.path.join(OUT, 'Boundary_2_Signals.xlsx'), 'Signal template', SIG_COLS, sigs)
json.dump(dict(asOf=AS_OF, leadCols=LEAD_COLS, leads=[[r.get(c, '') for c in LEAD_COLS] for r in leads], sigCols=SIG_COLS, signals=sigs, accounts=accounts), open(SPEC, 'w'), indent=1)
print(len(accounts), 'accounts', len(sigs), 'signals')
