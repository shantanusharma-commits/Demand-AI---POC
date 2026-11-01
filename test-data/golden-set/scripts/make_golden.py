"""The golden dataset for Micro-segments & NBA and For Review: one lead + signal workbook, run the normal way
(Prospecting -> Account Scoring -> Micro-segments -> For Review), where every account is designed for one outcome.
Writes the workbook's input sheets and golden_spec.json (what each account is designed to show) for run_golden.js.
Usage: python3 make_golden.py <output folder> <golden_spec.json>"""
import json, os, sys
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font

OUT, SPEC = sys.argv[1], sys.argv[2]
AS_OF = '2026-10-20'
LEAD_COLS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
             'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
             'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
             'capacity_unit', 'consent_basis', 'opt_out', 'owner_email']
SIG_COLS = ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product']
A, B = 'rep.a@client-sample.com', 'rep.b@client-sample.com'
PRIMARY, SECONDARY = 'Instrumentation Manager', 'Plant Manager'
slug = lambda v: ''.join(ch for ch in v.lower() if ch.isalnum())
ago = lambda n: (date.fromisoformat(AS_OF) - timedelta(days=n)).isoformat()

leads, sigs, accounts = [], [], []
def acct(gid, name, story, expect, people=(('Ana', 'Lim', PRIMARY, {}),), owner=A, country='Singapore', industry='Refining', process='Crude refining',
         revenue=2400000000, employees=3200, account_type='Owner-operator', existing='Y'):
    dom = slug(name) + '.example'
    refs = []
    for first, last, title, extra in people:
        r = dict(first_name=first, last_name=last, job_title=title, seniority='Manager', email=f'{slug(first)}.{slug(last)}@{dom}', email_verified='Y',
                 linkedin_url=f'https://www.linkedin.com/in/{slug(first)}-{slug(last)}-{gid.lower()}', company_name=name, company_domain=dom,
                 country=country, city='', industry=industry, annual_revenue_usd=revenue, employee_count=employees, account_type=account_type,
                 existing_customer=existing, managed_separately='N', site_name=name.split()[0] + ' site', site_process_type=process,
                 site_capacity=150000, capacity_unit='bpd', consent_basis='existing customer' if existing == 'Y' else 'legitimate interest', opt_out='N', owner_email=owner)
        r.update(extra)
        leads.append(r); refs.append(r['email'] or r['linkedin_url'])
    accounts.append(dict(id=gid, name=name, story=story, expect=expect))
    return refs
def sig(name, ref, typ, days, detail, source='CRM'):
    sigs.append([name, ref, typ, ago(days), detail, source, ''])

INQ = 'Asked for a quote on a DCS migration'
# ── Inquiry (5 accounts) ──
r = acct('G01', 'Anchor Point Refining', 'Clean inquiry: every check passes, so it goes ahead on its own (it may be drawn for a spot-check)',
         dict(segment='Inquiry', action='Call to follow up on the inquiry', runnerUp='Route the inquiry to the sales owner', channel='Email', status='Existing customer', cats=[]))
sig('Anchor Point Refining', r[0], 'Inquiry or RFQ', 4, INQ, 'Web form')
r = acct('G02', 'Bellwether Refining', 'Two people have signals: the recommendation goes to the person with the strongest one (the inquiry), not the webinar attendee',
         dict(segment='Inquiry', contact='Ben Tan', status='Net-new', cats=[]), people=(('Ben', 'Tan', PRIMARY, {}), ('Cara', 'Ong', SECONDARY, {})), owner=B, existing='N')
sig('Bellwether Refining', r[0], 'Inquiry or RFQ', 6, INQ, 'Web form'); sig('Bellwether Refining', r[1], 'Webinar attended', 9, 'Attended the alarm management webinar', 'Webinar platform')
r = acct('G03', 'Copperline Refining', 'Inquiry with no primary-persona contact: Low confidence, due the SAME DAY because it is an inquiry. Two secondary contacts, so "Wrong contact" (R7) can bring the next one',
         dict(segment='Inquiry', cats=['low'], dueDays=0, confidence='low'), people=(('Dev', 'Rao', SECONDARY, {}), ('Eli', 'Goh', 'Maintenance Manager', {})))
sig('Copperline Refining', r[0], 'Inquiry or RFQ', 3, INQ, 'Web form')
r = acct('G04', 'Driftline Refining', 'The inquiry mentions a safety incident: Sensitive content. It skips the rep\'s queue and goes straight to the sales manager\'s Approvals',
         dict(segment='Inquiry', cats=['sensitive'], dueDays=0, route='Approvals'))
sig('Driftline Refining', r[0], 'Inquiry or RFQ', 5, 'Asked for a quote after a safety incident on the crude unit', 'Web form')
r = acct('G05', 'Eastmere Refining', 'Two strong signals: the fresher inquiry wins over an older end-of-support signal; runner-up is the second Inquiry option, not a fallback',
         dict(segment='Inquiry', runnerUp='Route the inquiry to the sales owner', confidence='high', cats=[]), owner=B)
sig('Eastmere Refining', r[0], 'Inquiry or RFQ', 2, INQ, 'Web form'); sig('Eastmere Refining', r[0], 'Installed system near end of support', 420, 'Control system reaches end of support in 2027', 'Installed base')
# ── Modernisation (exactly 3) ──
EOS = 'Control system reaches end of support in 2027'
r = acct('G06', 'Fairlight Refining', 'Modernisation, exactly 3 accounts (the minimum). Email and LinkedIn both present',
         dict(segment='Modernisation', action='Propose a migration-path discussion', runnerUp='Offer a site assessment', channel='Email', cats=[]))
sig('Fairlight Refining', r[0], 'Installed system near end of support', 60, EOS, 'Installed base')
r = acct('G07', 'Glasswater Refining', 'Clean Modernisation item for a net-new account', dict(segment='Modernisation', status='Net-new', cats=[]), owner=B, existing='N')
sig('Glasswater Refining', r[0], 'Installed system near end of support', 120, EOS, 'Installed base')
r = acct('G08', 'Harrowgate Petrochem', 'Estimated first deal below USD 250k (adjacent vertical, revenue in target, EPC contractor): Below deal size, due in 2 working days',
         dict(segment='Modernisation', cats=['deal'], dueDays=2), industry='Petrochemicals', process='Olefins', revenue=400000000, employees=1200, account_type='EPC contractor')
sig('Harrowgate Petrochem', r[0], 'Installed system near end of support', 200, EOS, 'Installed base')
# ── Service renewal (3) ──
r = acct('G09', 'Ironbridge Refining', 'Clean Service renewal item', dict(segment='Service renewal', action='Offer a renewal review', runnerUp='Route to the service owner', cats=[]))
sig('Ironbridge Refining', r[0], 'Service contract renewal', 30, 'Service contract renews on 31 Mar 2027')
r = acct('G10', 'Juniper Bay Refining', 'The signal detail reads like a product claim (reduced downtime by 20%) with no approved source: Unsupported claim, due in 2 working days',
         dict(segment='Service renewal', cats=['claim'], dueDays=2), owner=B)
sig('Juniper Bay Refining', r[0], 'Service contract renewal', 40, 'Renewal review: the upgrade reduced downtime by 20% last year')
r = acct('G11', 'Kingsmere Refining', 'The signal detail mentions pricing, so the first draft fails the brand check. The system rewrites it once without the signal wording; the new draft passes and goes ahead (version 2 in the history)',
         dict(segment='Service renewal', cats=[], route='Goes ahead'))
sig('Kingsmere Refining', r[0], 'Service contract renewal', 25, 'Asked about pricing for the renewal')
# ── Project (3) ──
PRJ = 'Announced a site expansion'
r = acct('G12', 'Lakeshore Refining', 'Clean Project item for a net-new account', dict(segment='Project', action='Share a comparable case study and offer a technical session', status='Net-new', cats=[]), owner=B, existing='N')
sig('Lakeshore Refining', r[0], 'Capital project', 30, PRJ, 'News')
r = acct('G13', 'Millbrook Refining', "Email not verified and no LinkedIn: Can't reach them, due in 1 working day. Add an email in the workspace to clear it",
         dict(segment='Project', cats=['reach'], dueDays=1, channel='None'), people=(('Fay', 'Lau', PRIMARY, {'email_verified': 'N', 'linkedin_url': ''}),))
sig('Millbrook Refining', r[0], 'Capital project', 45, PRJ, 'News')
r = acct('G14', 'Northgate Fuels', "No consent basis: Can't reach them (a person must confirm before anything is sent)",
         dict(segment='Project', cats=['reach'], dueDays=1, channel='None'), people=(('Gus', 'Teo', PRIMARY, {'consent_basis': ''}),), owner=B)
sig('Northgate Fuels', r[0], 'Capital project', 60, PRJ, 'News')
# ── Engagement ──
r = acct('G15', 'Oakmont Refining', 'Engagement, LinkedIn only (no email): the draft is a LinkedIn connection note', dict(segment='Engagement', channel='LinkedIn', cats=[]),
         people=(('Hana', 'Rao', PRIMARY, {'email': '', 'email_verified': ''}),))
sig('Oakmont Refining', r[0], 'Webinar attended', 8, 'Attended the alarm management webinar', 'Webinar platform')
r = acct('G16', 'Pinehurst Refining', 'Clean Engagement item from a content download, net-new account', dict(segment='Engagement', action='Follow up on the topic they engaged with', status='Net-new', cats=[]), owner=B, existing='N')
sig('Pinehurst Refining', r[0], 'Content download', 10, 'Downloaded the migration planning guide', 'Website')
r = acct('G17', 'Queensway Refining', 'Only a weak signal (one email click): tier C. By default Scoring sends only tier A and B to Micro-segments, so it is not there', dict(tier='C', rec=False))
sig('Queensway Refining', r[0], 'Email clicked', 5, 'Clicked the lifecycle services email', 'Email platform')
r = acct('G18', 'Ravenhill Petrochem', "Three reasons at once: below deal size, low confidence and can't reach them. All three show; due is the earliest (1 working day)",
         dict(segment='Project', cats=['deal', 'low', 'reach'], dueDays=1), industry='Petrochemicals', process='Olefins', revenue=400000000, employees=1200,
         account_type='EPC contractor', people=(('Ivy', 'Sim', SECONDARY, {'email_verified': 'N', 'linkedin_url': ''}),), owner=B)
sig('Ravenhill Petrochem', r[0], 'Capital project', 20, 'Announced a site expansion', 'News')
# ── Leadership: only 2 accounts, so it never forms ──
r = acct('G19', 'Silverton Refining', 'Leadership change is its only signal and only 2 accounts have it first: no micro-segment, Segment too small, due in 2 working days. Assign a segment in the workspace',
         dict(segment='', cats=['small'], dueDays=2))
sig('Silverton Refining', r[0], 'Leadership change', 10, 'New plant director appointed', 'News')
r = acct('G20', 'Thornbury Refining', 'Strongest signal is a leadership change (too few accounts), so it joins Engagement on its next signal; the runner-up is the leadership action',
         dict(segment='Engagement', fallback=True, runnerUp='Introduce Client to the new leader', cats=[]), owner=B)
sig('Thornbury Refining', r[0], 'Leadership change', 8, 'New head of operations appointed', 'News'); sig('Thornbury Refining', r[0], 'Webinar registered', 5, 'Registered for the November reliability webinar', 'Webinar platform')
# ── Controls: never reach Micro-segments ──
acct('G21', 'Upton Refining', 'No signal: watch list, not in Micro-segments', dict(tier='Watch list', rec=False))
r = acct('G22', 'Valemont Fuels', 'Fit 49 (no size, no site, distributor): below the fit floor, not in Micro-segments', dict(tier='Below fit floor', rec=False),
         revenue='', employees='', account_type='Distributor', process='', existing='N')
sig('Valemont Fuels', r[0], 'Inquiry or RFQ', 5, INQ, 'Web form')
r = acct('G23', 'Westfield Refining', 'Outside the pilot region (Australia): excluded, not in Micro-segments', dict(tier='Excluded', rec=False), country='Australia', owner=B)
sig('Westfield Refining', r[0], 'Inquiry or RFQ', 5, INQ, 'Web form')
r = acct('G24', 'Yarrow Refining', 'Pilot product already installed: knocked out, not in Micro-segments', dict(tier='Excluded', rec=False))
sig('Yarrow Refining', '', 'Installed system (current)', 300, 'Current pilot product installed on the crude unit', 'Installed base'); sig('Yarrow Refining', r[0], 'Inquiry or RFQ', 5, INQ, 'Web form')
# ── Known gaps: what should happen, which the POC does not do today ──
r = acct('G25', 'Zenith Bay Refining', "Opt-out left blank: should be Can't reach them (Prospecting marks the person not contactable)",
         dict(segment='Engagement', cats=['reach'], gap='Micro-segments drafts an email and lets the item go ahead although the opt-out is not confirmed'),
         people=(('Jon', 'Wu', PRIMARY, {'opt_out': ''}),), owner=B)
sig('Zenith Bay Refining', r[0], 'Content download', 7, 'Downloaded the alarm rationalisation checklist', 'Website')
r = acct('G26', 'Ashcombe Refining', "The only signal is from a contact who opted out: it should not count, so the account should be on the watch list",
         dict(tier='Watch list', rec=False, gap="The opted-out person's signal still counts: the account is scored, gets no recommendation and never reaches For Review"),
         people=(('Kai', 'Ng', PRIMARY, {'opt_out': 'Y'}), ('Lia', 'Chan', SECONDARY, {})))
sig('Ashcombe Refining', r[0], 'Webinar attended', 6, 'Attended the alarm management webinar', 'Webinar platform')

wb = Workbook(); ws = wb.active; ws.title = 'Lead template'; ws.append(LEAD_COLS)
for r in leads: ws.append([None if r.get(c, '') == '' else r[c] for c in LEAD_COLS])
ws2 = wb.create_sheet('Signal template'); ws2.append(SIG_COLS)
for s in sigs: ws2.append([None if v == '' else v for v in s])
for w in (ws, ws2):
    for c in w[1]: c.font = Font(bold=True)
    for col in w.columns: w.column_dimensions[col[0].column_letter].width = min(40, max(10, *(len(str(c.value or '')) + 2 for c in col)))
    w.freeze_panes = 'A2'
os.makedirs(OUT, exist_ok=True)
FILE = 'Golden_NBA_and_For_Review.xlsx'
wb.save(os.path.join(OUT, FILE))
json.dump(dict(file=FILE, asOf=AS_OF, accounts=accounts), open(SPEC, 'w'), indent=1)
print(len(accounts), 'accounts', len(leads), 'lead rows', len(sigs), 'signals')
