"""Setup-from-scratch test pack: a market the default settings do not cover (water treatment and desalination), so
every result depends on the Admin setting it up in Setup: ICP rubric (a new vertical, new buying roles, a new rubric
part), signal types, micro-segments and actions. Then one change at a time (S1 to S13) on top of that set-up.
All companies and people are invented. Score date 16 Nov 2026.
Usage: python3 make_setup_pack.py <out folder> <spec.json>"""
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
# ── What the Admin enters in Setup (from scratch) ──
SETUP = dict(
  verticals=[dict(name='Water treatment', level='core', words=['water treatment', 'wastewater']), dict(name='Desalination', level='adjacent', words=['desalination'])],
  primary=['plant engineer', 'process engineer'], secondary=['utility manager'],
  part=dict(key='capacity', label='Plant capacity', weight=10, column='site_capacity', rules=[dict(when='atLeast', value='200000', points=100), dict(when='atLeast', value='50000', points=60)], otherwise=20),
  weights=dict(vertical=30, size=15, site=15, relationship=15, accountType=10, contacts=5),
  types=[dict(name='Tender published', segment='Open tenders', level='Strong', full=30, zero=90, about='The utility published a tender for treatment, automation or control works.'),
         dict(name='Regulation deadline', segment='Compliance deadline', level='Medium', full=90, zero=365, about='A new discharge or water-quality rule applies to the plant by a set date.')],
  segments=[dict(name='Open tenders', theme='Utilities with a live tender for treatment or control works'), dict(name='Compliance deadline', theme='Plants that must meet a new rule by a set date')],
  actions={'Open tenders': ['Offer a pre-bid technical clarification call', 'Share a reference plant from a similar tender'],
           'Compliance deadline': ['Offer a compliance gap assessment', 'Invite them to a regulation briefing']})
leads, sigs, accounts = [], [], []
def acc(aid, name, first, last, title, country, ind, proc, cap, rev, emp, sig_list, note, owner='rep.a@client-sample.com', cust='N'):
    dom = slug(name) + '.example'
    p = dict(first_name=first, last_name=last, job_title=title, seniority='Manager', email=f'{slug(first)}.{slug(last)}@{dom}', email_verified='Y',
             linkedin_url=f'https://www.linkedin.com/in/{slug(first)}-{slug(last)}-{aid.lower()}', company_name=name, company_domain=dom, country=country, city='',
             industry=ind, annual_revenue_usd=rev, employee_count=emp, account_type='Owner-operator', existing_customer=cust, managed_separately='N',
             site_name=name.split()[0] + ' plant', site_process_type=proc, site_capacity=cap, capacity_unit='m3/day', consent_basis='legitimate interest', opt_out='N', owner_email=owner)
    leads.append(p)
    for typ, d, det in sig_list: sigs.append([name, p['email'], f'{first} {last}', typ, ago(d), det, 'Test', '', dom])
    accounts.append(dict(id=aid, name=name, note=note, country=country))
WT, WW, DS = ('Water utility', 'Water treatment'), ('Water utility', 'Wastewater treatment'), ('Water utility', 'Seawater desalination')
PE, PR, OM = 'Plant Engineer', 'Process Engineer', 'Operations Manager'
T = lambda d, det: ('Tender published', d, det); R = lambda d, det: ('Regulation deadline', d, det); EOS = lambda d, det: ('Installed system near end of support', d, det)
acc('W01', 'Aquaria Water', 'Ana', 'Lim', PE, 'Singapore', *WT, 300000, 900000000, 1800, [T(5, 'Tender for SCADA upgrade at the main treatment plant')], 'Big plant, fresh tender')
acc('W02', 'Bluestream Utilities', 'Ben', 'Ng', PR, 'Malaysia', *WW, 250000, 600000000, 1400, [T(12, 'Tender for aeration control upgrade')], 'Tender', owner='rep.b@client-sample.com')
acc('W03', 'Clearbrook Water', 'Cara', 'Tan', PE, 'Thailand', *WT, 120000, 400000000, 900, [T(20, 'Tender for a new filtration line control system')], 'Mid capacity, tender')
acc('W04', 'Deepwell Utilities', 'Dev', 'Rao', PE, 'Vietnam', *WW, 90000, 250000000, 700, [T(45, 'Tender for pump station automation')], 'Older tender (past full weight); Vietnam', owner='rep.b@client-sample.com')
acc('W05', 'Eastshore Water', 'Eli', 'Ho', PR, 'Indonesia', *WT, 400000, 1200000000, 2500, [T(70, 'Tender for plant-wide DCS replacement'), R(30, 'New turbidity limits apply from July 2027')], 'Old tender plus a compliance deadline')
acc('W06', 'Fairhaven Water', 'Fay', 'Goh', PE, 'Philippines', *WW, 150000, 350000000, 800, [R(15, 'New discharge limits for nitrogen from 2027')], 'Compliance deadline')
acc('W07', 'Greenmere Utilities', 'Gus', 'Koh', PR, 'Malaysia', *WW, 220000, 700000000, 1500, [R(40, 'New effluent monitoring rule from March 2027')], 'Compliance deadline', owner='rep.b@client-sample.com')
acc('W08', 'Harbourline Water', 'Hui', 'Sim', PE, 'Singapore', *WT, 60000, 150000000, 300, [R(100, 'Lead-pipe replacement deadline in 2028')], 'Smaller plant, compliance (past full weight)')
acc('W09', 'Islemere Utilities', 'Ian', 'Ong', PE, 'Thailand', *WT, 280000, 800000000, 1600, [EOS(60, 'The SCADA at the main plant reaches end of support in 2027')], 'Built-in signal type: modernisation', cust='Y')
acc('W10', 'Jadeport Water', 'Jo', 'Teo', PR, 'Indonesia', *WW, 180000, 500000000, 1100, [EOS(90, 'The PLCs at the sludge plant are end of life')], 'Modernisation', cust='Y', owner='rep.b@client-sample.com')
acc('W11', 'Keystone Utilities', 'Kai', 'Wu', PE, 'Philippines', *WT, 210000, 650000000, 1300, [EOS(120, 'The control system at the intake reaches end of support next year')], 'Modernisation', cust='Y')
acc('W12', 'Lagoon Desal', 'Lea', 'Chua', PE, 'Singapore', *DS, 320000, 1000000000, 1200, [T(8, 'Tender for reverse-osmosis train controls')], 'Desalination (adjacent vertical), tender')
acc('W13', 'Marlow Foods', 'Max', 'Yeo', OM, 'Malaysia', 'Food and beverage', 'Bottling', 5000, 80000000, 300, [T(6, 'Tender for a bottling line')], 'Out of ICP: food company')
acc('W14', 'Northwater Utilities', 'Nia', 'Das', PE, 'India', *WT, 350000, 1100000000, 2200, [T(9, 'Tender for SCADA at a new plant')], 'Outside the pilot countries (India)')
acc('W15', 'Oakfield Water', 'Oli', 'Lee', 'Finance Manager', 'Vietnam', *WT, 200000, 600000000, 1300, [R(20, 'New water-quality reporting rule from 2027')], 'Only contact is not a buying role')
BASE = {'addVerticals': SETUP['verticals'], 'addPrimary': SETUP['primary'], 'addSecondary': SETUP['secondary'], 'weights': SETUP['weights'], 'addParts': [SETUP['part']]}
RUNS = [  # id, what changes in Setup, settings patch (on top of BASE unless base=False), extra (off types, library, deal threshold, types)
 ('S0', 'Before any set-up: default settings, the two new signal types not added', None, dict(base=False, types=False)),
 ('BASE', 'Everything on the Setup sheets entered (the from-scratch set-up)', {}, {}),
 ('S1', 'Fit floor raised from 50 to 70', {'fitFloor': 70}, {}),
 ('S2', 'Rubric weights: Vertical 30 to 40, Plant capacity 10 to 0', {'weights': dict(SETUP['weights'], vertical=40), 'addParts': [dict(SETUP['part'], weight=0)]}, {}),
 ('S3', 'Tier thresholds: A 35 to 45, B 20 to 25', {'tiers': dict(A=45, B=25)}, {}),
 ('S4', 'Vertical "Desalination" removed', {'addVerticals': SETUP['verticals'][:1]}, {}),
 ('S5', 'Buying role "process engineer" removed', {'addPrimary': ['plant engineer']}, {}),
 ('S6', 'Vietnam removed from the pilot countries', {'countries': ['Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Indonesia']}, {}),
 ('S7', '"Tender published": gone after 90 days changed to 60', {}, dict(types=[dict(SETUP['types'][0], zero=60), SETUP['types'][1]])),
 ('S8', '"Regulation deadline" switched off', {}, dict(off=['Regulation deadline'])),
 ('S10', '"Regulation deadline" moved to the Open tenders segment', {}, dict(types=[SETUP['types'][0], dict(SETUP['types'][1], segment='Open tenders')])),
 ('S12', 'Actions for Open tenders reordered (reference plant first)', {}, dict(library={**SETUP['actions'], 'Open tenders': SETUP['actions']['Open tenders'][::-1]})),
 ('S13a', 'Deal-size threshold set to 0 (rule off)', {}, dict(deal=0)),
 ('S13b', 'Deal-size threshold set to USD 1,000,000', {}, dict(deal=1000000)),
]
def book(path, sheet, cols, rows):
    wb = Workbook(); ws = wb.active; ws.title = sheet; ws.append(cols)
    for r in rows:
        vals = [r.get(c, '') for c in cols] if isinstance(r, dict) else r
        ws.append([None if v == '' else v for v in vals])
    for c in ws[1]: c.font = Font(bold=True)
    for col in ws.columns: ws.column_dimensions[col[0].column_letter].width = min(44, max(10, *(len(str(c.value or '')) + 2 for c in col)))
    ws.freeze_panes = 'A2'; wb.save(path)
os.makedirs(OUT, exist_ok=True)
book(os.path.join(OUT, 'Setup_Test_1_Prospects.xlsx'), 'Lead template', LEAD_COLS, leads)
book(os.path.join(OUT, 'Setup_Test_2_Signals.xlsx'), 'Signal template', SIG_COLS, sigs)
specs = {}
for rid, what, patch, extra in RUNS:
    st = {} if extra.get('base') is False else json.loads(json.dumps(BASE))
    if patch:
        for k, v in patch.items(): st[k] = v
    types = [] if extra.get('types') is False else extra.get('types', SETUP['types'])
    lib = None if extra.get('base') is False else extra.get('library', SETUP['actions'])
    specs[rid] = dict(asOf=AS_OF, leadCols=LEAD_COLS, leads=[[r.get(c, '') for c in LEAD_COLS] for r in leads], sigCols=SIG_COLS, signals=sigs,
                      newTypes=types, settings=st, library=lib, off=extra.get('off', []), dealThreshold=extra.get('deal'), what=what)
json.dump(dict(setup=SETUP, accounts=accounts, runs=[[r[0], r[1]] for r in RUNS], specs=specs), open(SPEC, 'w'), indent=1)
print(len(accounts), 'accounts', len(sigs), 'signals', len(RUNS), 'runs')
