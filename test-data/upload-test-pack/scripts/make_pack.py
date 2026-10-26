"""Writes the drag-and-drop upload test pack: one small Excel file per use case, ready to drop into the POC as it is.
Also writes manifest.json (what each file and row tests) for run_pack.js and build_expected.py.
Usage: python3 make_pack.py <pack folder> <manifest.json> [<scenario_inputs.json from ../poc-test-sets/make_scenarios.py>]"""
import json, os, sys
from openpyxl import Workbook
from openpyxl.styles import Font

PACK, MANIFEST = sys.argv[1], sys.argv[2]
SCEN = sys.argv[3] if len(sys.argv) > 3 else None
AS_OF = '2026-10-20'
LEAD_COLS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
             'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
             'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
             'capacity_unit', 'consent_basis', 'opt_out', 'owner_email']
SIG_COLS = ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product']
REP_A, REP_B = 'rep.a@client-sample.com', 'rep.b@client-sample.com'
slug = lambda v: v.lower().replace(' ', '').replace('&', '')

# Company profiles: every company is invented; domains end in .example
def co(name, country='Singapore', industry='Refining', revenue=2400000000, employees=3200, account_type='Owner-operator', existing='N',
       managed='N', process='Crude refining', owner=REP_A):
    return dict(company_name=name, company_domain=slug(name) + '.example', country=country, city='', industry=industry,
                annual_revenue_usd=revenue, employee_count=employees, account_type=account_type, existing_customer=existing,
                managed_separately=managed, site_name=(name.split()[0] + ' site') if process else '', site_process_type=process,
                site_capacity=150000 if process else '', capacity_unit='bpd' if process else '', owner_email=owner)

def person(company, first, last, title='Instrumentation Manager', seniority='Manager', **k):
    d = dict(company)
    d.update(first_name=first, last_name=last, job_title=title, seniority=seniority, email_verified='Y',
             consent_basis='existing customer' if company['existing_customer'] == 'Y' else 'legitimate interest', opt_out='N')
    d['email'] = f"{slug(first)}.{slug(last)}@{company['company_domain']}"
    d['linkedin_url'] = f"https://www.linkedin.com/in/{slug(first)}-{slug(last)}-{slug(company['company_name'])[:6]}"
    d.update(k)
    return d

files = []          # every file in the pack, in order
LISTS = {}          # Prospecting list id -> its contact rows, for the matching signal files
def write_book(path, header, rows, sheets=None):
    """Writes one Excel workbook. Values are written as they are:
    text stays text, so a badly written date or number reaches the POC exactly as typed. sheets: extra (name, header, rows)."""
    full = os.path.join(PACK, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    wb = Workbook(); first = True
    for name, hdr, body in [(('Signal template' if header and 'signal_type' in header else 'Lead template'), header, rows)] + (sheets or []):
        ws = wb.active if first else wb.create_sheet(); first = False
        ws.title = name
        for r in ([hdr] if hdr else []) + body: ws.append([None if v == '' else v for v in r])
        for c in ws[1]: c.font = Font(bold=True)
        for col in ws.columns: ws.column_dimensions[col[0].column_letter].width = min(40, max(10, *(len(str(c.value or '')) + 2 for c in col)))
        ws.freeze_panes = 'A2'
    wb.save(full)

def lead_file(fid, name, title, why, rows, expect, header=None, pre=None, cols=None, steps=None):
    """rows: list of (dict, what the row tests). cols: the columns to write (default: the template's)."""
    cols = cols or LEAD_COLS
    path = f'1-Prospecting/{fid}_{name}.xlsx'
    body = [list(p) for p in (pre or [])] + [[r.get(c, '') for c in cols] for r, _ in rows]
    write_book(path, header or cols, body)
    LISTS[fid] = [r for r, _ in rows]
    first_data = 2 + len(pre or [])
    files.append(dict(id=fid, folder='1-Prospecting', file=os.path.basename(path), path=path, kind='lead', title=title, why=why, expect=expect,
                      steps=steps or f'Prospecting: drop {os.path.basename(path)} on the upload box.',
                      rows=[dict(row=first_data + i, tests=t) for i, (_, t) in enumerate(rows)]))

# ═════════════ 1 · Prospecting ═════════════
H = co('Harbour Refining'); K = co('Kestrel Petrochem', 'Malaysia', 'Petrochemicals', 1800000000, 2600, process='Olefins', existing='Y')
S = co('Selatan LNG', 'Indonesia', 'LNG', 2600000000, 2100, process='LNG liquefaction', owner=REP_B)
M = co('Mekong Refining', 'Vietnam', 'Refining', 2200000000, 2500, owner=REP_B)
V = co('Visayas Gas', 'Philippines', 'Gas processing', 700000000, 1200, process='Gas processing')
lead_file('P01', 'clean_list', 'A clean list', 'The happy path: every row is fine, so nothing is flagged.',
          [(person(c, f, l, t, s), why) for c in (H, K, S, M, V) for f, l, t, s, why in [
              ('Ana', 'Lim', 'Instrumentation Manager', 'Manager', 'Primary persona, verified email and LinkedIn'),
              ('Ben', 'Cruz', 'Plant Manager', 'Director', 'Secondary persona'),
              ('Cai', 'Ng', 'Finance Manager', 'Manager', 'No persona (still in the list)')]],
          '15 rows read, 0 issues, 5 accounts, all 5 pass, 15 contacts in the final list.')
C = co('Coral Bay Refining')
lead_file('P02', 'email_problems', 'Email problems', 'Each row has one thing wrong (or nearly wrong) with the email or its verified flag.', [
    (person(C, 'Ahmad', 'Karim'), 'Control: clean'),
    (person(C, 'Lina', 'Ong', email='lina.ong@coralbay'), 'No domain ending (.com): malformed'),
    (person(C, 'Marcus', 'Yeo', email='marcus yeo@coralbayrefining.example'), 'Space inside the email: malformed'),
    (person(C, 'Joanne', 'Sim', email='joanne.sim@@coralbayrefining.example'), 'Two @ signs: malformed'),
    (person(C, 'Raj', 'Pillai', email='raj.pillai@coralbayrefining.example', linkedin_url=''), 'Clean email, no LinkedIn: email only'),
    (person(C, 'Keith', 'Lau', email='KEITH.LAU@CORALBAYREFINING.EXAMPLE'), 'Email in capitals: accepted and read in lower case'),
    (person(C, 'Tina', 'Ho', email_verified='TRUE'), 'Verified written TRUE instead of Y: flagged, email treated as not verified'),
    (person(C, 'Wen', 'Lee', email_verified='yes'), 'Verified written "yes": accepted as Y'),
    (person(C, 'Dev', 'Rao', email_verified='N'), 'Not verified: loaded, email not used; reached by LinkedIn'),
    (person(C, 'Mira', 'Tan', email_verified=''), 'Verified left blank: treated as not verified'),
    (person(C, 'Omar', 'Aziz', email='omar.aziz@coralbay', linkedin_url=''), 'Malformed email and no LinkedIn: no way to reach them'),
    (person(C, 'Pia', 'Chen', email_verified='N', linkedin_url=''), 'Not verified and no LinkedIn: not contactable'),
], 'Malformed emails and a non Y/N verified flag are flagged (D3); unverified emails are noted but not used to send.')
D = co('Delta Refining')
lead_file('P03', 'linkedin_and_no_contact_details', 'LinkedIn problems and missing contact details', 'LinkedIn URL forms, and rows with no way to contact the person.', [
    (person(D, 'Ahmad', 'Saleh'), 'Control: clean'),
    (person(D, 'Priya', 'Menon', linkedin_url='https://www.linkedin.com/company/delta-refining'), 'Company page, not a person: flagged, LinkedIn not used'),
    (person(D, 'Hui', 'Min', linkedin_url='www.facebook.com/huimin'), 'Not a LinkedIn URL: flagged'),
    (person(D, 'Jon', 'Teo', linkedin_url='linkedin.com/in/jon-teo'), 'No https:// or www: accepted'),
    (person(D, 'Ken', 'Wu', linkedin_url='https://www.linkedin.com/in/ken-wu/'), 'Trailing slash: accepted'),
    (person(D, 'Lea', 'Goh', linkedin_url='https://www.linkedin.com/pub/lea-goh'), 'Old /pub/ profile URL: accepted'),
    (person(D, 'Max', 'Yap', email='', email_verified=''), 'No email, LinkedIn only: reached on LinkedIn'),
    (person(D, 'Sean', 'Koh', email='', email_verified='', linkedin_url=''), 'No email and no LinkedIn: flagged, kept on the account, not contactable'),
], 'Bad LinkedIn URLs and rows with neither email nor LinkedIn are flagged (D3); the others load.')
E1 = co('Eastwind Refining'); E2 = co('Ferngate Refining', 'Malaysia')
lead_file('P04', 'duplicates', 'Duplicate contacts', 'The same person twice, written differently. Duplicates are merged into the first row.', [
    (person(E1, 'Grace', 'Teh', linkedin_url=''), 'First row for Grace Teh (no LinkedIn)'),
    (person(E1, 'Grace', 'Teh', email='GRACE.TEH@EASTWINDREFINING.EXAMPLE', job_title='I&C Manager'), 'Same email in capitals: merged into the row above; its LinkedIn fills the blank'),
    (person(E1, 'Ivan', 'Lo'), 'First row for Ivan Lo'),
    (person(E1, 'Ivan', 'Lo', email='', email_verified='', linkedin_url=f"http://linkedin.com/in/ivan-lo-{slug(E1['company_name'])[:6]}/"), 'Same LinkedIn profile, different URL form, no email: merged'),
    (person(E1, 'Ivan', 'Lo', email='ivan.lo2@eastwindrefining.example', linkedin_url=''), 'Same name, different email, no LinkedIn: a different contact, not merged'),
    (person(E2, 'Rosa', 'Ramos', email='grace.teh@eastwindrefining.example', linkedin_url=''), "Another company's row reusing Grace Teh's email: merged into her (worth a look)"),
], '6 rows read, 3 merged as duplicates (D5), 3 contacts left.')
F = co('Fairway Refining'); G = co('Glenrock Refining', 'Thailand')
lead_file('P05', 'consent_and_opt_out', 'Consent and opt-out', 'Every consent basis and opt-out value, and an account where everyone opted out.', [
    (person(F, 'Amy', 'Lee', consent_basis='legitimate interest'), 'legitimate interest: contactable'),
    (person(F, 'Bob', 'Tan', consent_basis='existing customer'), 'existing customer: contactable'),
    (person(F, 'Cara', 'Ong', consent_basis='opted in'), 'opted in: contactable'),
    (person(F, 'Dan', 'Lim', consent_basis='Legitimate Interest'), 'Capitalised basis: accepted'),
    (person(F, 'Eve', 'Ng', consent_basis=''), 'No consent basis: flagged, not contactable'),
    (person(F, 'Fay', 'Ho', consent_basis='purchased list'), '"purchased list" is not a recognised basis: flagged, not contactable'),
    (person(F, 'Gus', 'Wee', opt_out='Y'), 'Opted out: suppressed, never contacted'),
    (person(F, 'Hal', 'Koh', opt_out='yes'), 'Opt-out "yes": read as Y, suppressed'),
    (person(F, 'Ivy', 'Sim', opt_out=''), 'Opt-out blank: flagged, not contactable until confirmed'),
    (person(F, 'Jay', 'Teo', opt_out='maybe'), 'Opt-out "maybe": flagged, not contactable'),
    (person(G, 'Kim', 'Yeo', opt_out='Y'), 'Glenrock: first of two, opted out'),
    (person(G, 'Lou', 'Chua', opt_out='Y'), 'Glenrock: second of two, opted out, so the whole account is excluded'),
], 'Fairway passes with 4 contactable; Glenrock Refining is excluded (no contacts left after suppression).')
lead_file('P06', 'region', 'Pilot region', 'One company per country spelling. Only the six pilot countries pass; names are matched exactly (case does not matter).', [
    (person(co('Jurong Fuels', 'Singapore'), 'Ann', 'Lim'), 'Singapore: passes'),
    (person(co('Kerteh Fuels', 'Malaysia'), 'Bo', 'Tan'), 'Malaysia: passes'),
    (person(co('Rayong Fuels', 'Thailand'), 'Chai', 'Suk'), 'Thailand: passes'),
    (person(co('Bataan Fuels', 'Philippines'), 'Dina', 'Cruz'), 'Philippines: passes'),
    (person(co('Cilegon Fuels', 'Indonesia'), 'Eko', 'Putra'), 'Indonesia: passes'),
    (person(co('Vung Tau Fuels', 'Vietnam'), 'Hoa', 'Le'), 'Vietnam: passes'),
    (person(co('Changi Fuels', 'singapore'), 'Ivan', 'Goh'), 'Lower case "singapore": passes'),
    (person(co('Marina Fuels', '  Malaysia  '), 'Jo', 'Lam'), 'Spaces around the name: passes'),
    (person(co('Sentosa Fuels', 'SG'), 'Kai', 'Ong'), '"SG": excluded as outside the region (confirm with the business whether codes should count)'),
    (person(co('Perth Fuels', 'Australia'), 'Liam', 'Ward'), 'Australia: excluded, outside the pilot region'),
    (person(co('Nowhere Fuels', ''), 'Mo', 'Ali'), 'No country: flagged and excluded'),
], '11 accounts: 8 pass, 3 excluded (SG, Australia, no country).')
lead_file('P07', 'managed_separately_and_existing_customer', 'Managed separately and existing customer', 'The two Y/N company flags with every kind of value.', [
    (person(co('Anchor Refining', managed='Y'), 'Al', 'Tan'), 'Managed separately Y: excluded'),
    (person(co('Beacon Refining', managed='N'), 'Bea', 'Lim'), 'Managed separately N: passes'),
    (person(co('Cove Refining', managed=''), 'Cy', 'Ng'), 'Managed separately blank: flagged, treated as N, passes'),
    (person(co('Dune Refining', managed='X'), 'Di', 'Ho'), 'Managed separately "X": flagged, treated as N'),
    (person(co('Ember Refining', existing='Y'), 'Ed', 'Koh'), 'Existing customer Y: relationship scores full in fit'),
    (person(co('Flint Refining', existing='Yes'), 'Flo', 'Sim'), 'Existing customer "Yes": read as Y'),
    (person(co('Grove Refining', existing=''), 'Gil', 'Yeo'), 'Existing customer blank: flagged, treated as N'),
    (person(co('Haven Refining', existing='maybe'), 'Hu', 'Wu'), 'Existing customer "maybe": flagged, treated as N'),
], 'Anchor Refining excluded (managed separately); the other 7 pass; blank and invalid flags are flagged D3.')
lead_file('P08', 'company_size_formats', 'Company size formats', 'Revenue and headcount written in different ways. One company per row.', [
    (person(co('Isle Refining', revenue=2400000000), 'Ida', 'Lim'), 'Plain number: read as is'),
    (person(co('Jade Refining', revenue='2,400,000,000'), 'Jin', 'Tan'), 'Commas: flagged, read as 2400000000'),
    (person(co('Kite Refining', revenue='$2400000000'), 'Kit', 'Ng'), 'Dollar sign: flagged, read as a number'),
    (person(co('Lumen Refining', revenue='USD 900000000'), 'Lu', 'Ho'), '"USD" prefix: flagged, read as a number'),
    (person(co('Mist Refining', revenue='2.4bn'), 'Mo', 'Ong'), '"2.4bn": not a number, treated as not given; headcount used'),
    (person(co('Nova Refining', revenue='', employees=3500), 'Ned', 'Koh'), 'No revenue, 3,500 employees: size from headcount'),
    (person(co('Orchid Refining', revenue='', employees='1,200'), 'Oli', 'Sim'), 'Headcount with a comma: flagged, read as 1200'),
    (person(co('Pearl Refining', revenue='', employees=''), 'Pat', 'Yeo'), 'No size at all: flagged, size scores 0 in fit'),
    (person(co('Quill Refining', revenue='n/a', employees='n/a'), 'Qi', 'Wu'), '"n/a" in both: flagged as not numbers'),
], 'All 9 load; commas, symbols and text in size columns are flagged D3 with what was read.')
lead_file('P09', 'account_types', 'Account types', 'Each account type on the list, plus blank and one not on the list.', [
    (person(co('Reef Refining', account_type='Owner-operator'), 'Ray', 'Lim'), 'Owner-operator: full points'),
    (person(co('Sable Engineering', account_type='EPC contractor'), 'Sue', 'Tan'), 'EPC contractor'),
    (person(co('Tern Systems', account_type='System integrator'), 'Ted', 'Ng'), 'System integrator'),
    (person(co('Umber Supply', account_type='Distributor'), 'Uma', 'Ho'), 'Distributor'),
    (person(co('Vale Holdings', account_type='Other'), 'Val', 'Ong'), 'Other: 0 points'),
    (person(co('Wren Refining', account_type=''), 'Wu', 'Koh'), 'Blank: noted, scores 0'),
    (person(co('Yarrow Trading', account_type='Trader'), 'Yu', 'Sim'), '"Trader" is not on the list: flagged, treated as Other'),
    (person(co('Zephyr Refining', account_type='owner-operator'), 'Zoe', 'Yeo'), 'Lower case: accepted'),
], 'All 8 load; "Trader" is flagged D3; blank is a note.')
lead_file('P10', 'industry_classification', 'Industry and site classification', 'How each industry and site process maps to a vertical (core, adjacent or other).', [
    (person(co('Aster Refining', industry='Oil refining', process='Crude refining'), 'Al', 'Lim'), 'Industry and site both say refining: Refining (core), high confidence'),
    (person(co('Birch Petrochem', industry='Petrochemicals', process='Olefins'), 'Bo', 'Tan'), 'Petrochemicals, site not in the lookup: Petrochemicals (adjacent), from the industry'),
    (person(co('Cirrus LNG', industry='LNG', process='LNG liquefaction'), 'Cy', 'Ng'), 'LNG: Gas processing (adjacent)'),
    (person(co('Delta Gas', industry='Gas processing', process='Gas processing'), 'Di', 'Ho'), 'Gas processing (adjacent)'),
    (person(co('Echo Water', industry='Water utilities', process='Water treatment'), 'Ed', 'Ong'), 'Not in the lookup: Other, held for a person to classify'),
    (person(co('Flint Energy', industry='', process='Crude refining'), 'Fi', 'Koh'), 'No industry, refining site: flagged; Refining from the site'),
    (person(co('Gale Energy', industry='Refining', process='Petrochemicals'), 'Gi', 'Sim'), 'Industry and site disagree: industry used, medium confidence'),
    (person(co('Halo Chemicals', industry='Specialty chemicals', process='Batch chemicals'), 'Hu', 'Yeo'), 'Specialty chemicals: Other, held for review'),
], 'All 8 load; Echo Water and Halo Chemicals are held for review as Other; Flint Energy is flagged for no industry.')
T = co('Titan Refining')
lead_file('P11', 'job_titles_and_persona', 'Job titles and persona', 'Which job titles count as the primary persona (the buyer), secondary, or none.', [
    (person(T, f, l, t), w) for f, l, t, w in [
        ('Aa', 'Lim', 'Instrumentation & Control Manager', 'Primary'), ('Bb', 'Tan', 'I&C Lead', 'Primary'), ('Cc', 'Ng', 'E&I Engineer', 'Primary'),
        ('Dd', 'Ho', 'Head of Automation', 'Primary'), ('Ee', 'Ong', 'Control Systems Engineer', 'Primary'), ('Ff', 'Koh', 'DCS Specialist', 'Primary'),
        ('Gg', 'Sim', 'Plant Manager', 'Secondary'), ('Hh', 'Yeo', 'Operations Director', 'Secondary'), ('Ii', 'Wu', 'Procurement Lead', 'Secondary'),
        ('Jj', 'Lau', 'Reliability Engineer', 'Secondary'), ('Kk', 'Goh', 'Maintenance Manager', 'Secondary'), ('Ll', 'Chua', 'Project Director', 'Secondary'),
        ('Mm', 'Lee', 'Finance Manager', 'None'), ('Nn', 'Teo', 'HR Business Partner', 'None'), ('Oo', 'Wee', '', 'Blank title: flagged, persona none')]],
    'All 15 load in one account; 6 primary, 6 secondary, 3 none; the blank title is flagged.')
lead_file('P12', 'owner_rep', 'Owner rep', 'The owner_email column: who the account belongs to.', [
    (person(co('Arc Refining', owner=REP_A), 'Ai', 'Lim'), 'Rep A: the demo Sales rep sees it'),
    (person(co('Bay Refining', owner=REP_B), 'Bi', 'Tan'), 'Rep B'),
    (person(co('Cove Fuels', owner='REP.A@CLIENT-SAMPLE.COM'), 'Ci', 'Ng'), 'Rep A in capitals: read as Rep A'),
    (person(co('Dune Fuels', owner=''), 'Di', 'Ho'), 'No owner: flagged, only the sales manager sees it'),
    (person(co('Ember Fuels', owner='Rep A'), 'Ei', 'Ong'), 'A name, not an email: flagged'),
    (person(co('Flint Fuels', owner='rep.a@client-sample'), 'Fi', 'Koh'), 'Email with no domain ending: flagged'),
], 'All 6 load; blank and invalid owners are flagged D3.')
R0 = co('Ridge Refining')
lead_file('P13', 'company_details_differ', 'Company details that differ between rows', 'The same company on several rows with different details. The first row wins and the rest are flagged.', [
    (person(R0, 'Ana', 'Lim'), 'First row: its details are used for the account'),
    (person(dict(R0, country='Malaysia'), 'Ben', 'Tan'), 'Different country: flagged'),
    (person(dict(R0, industry='Petrochemicals'), 'Cai', 'Ng'), 'Different industry: flagged'),
    (person(dict(R0, annual_revenue_usd=900000000, employee_count=1000), 'Dee', 'Ho'), 'Different revenue and headcount: flagged twice'),
    (person(dict(R0, account_type='Distributor'), 'Eli', 'Ong'), 'Different account type: flagged'),
    (person(dict(R0, existing_customer='Y'), 'Fay', 'Koh', consent_basis='legitimate interest'), 'Different existing-customer flag: flagged'),
    (person(dict(R0, company_name='RIDGE  REFINING'), 'Gus', 'Sim'), 'Company name in capitals with a double space: same account'),
], '7 rows, 1 account (Ridge Refining); 6 "differs from row 2" flags.')
U = co('Upland Refining')
lead_file('P14', 'missing_values', 'Missing or badly written values', 'Required values left blank or written in the wrong form.', [
    (person(U, 'Ari', 'Lim'), 'Control: clean'),
    (person(dict(U, company_name=''), 'Bea', 'Tan'), 'No company name: row not loaded (stop)'),
    (person(U, '', 'Ng', email='c.ng@uplandrefining.example'), 'No first name: loaded, flagged (draft greeting will need editing)'),
    (person(U, 'Dov', '', email='dov@uplandrefining.example'), 'No last name: loaded, flagged'),
    (person(U, 'Eda', 'Ong', job_title=''), 'No job title: flagged, persona none'),
    (person(dict(U, company_domain=''), 'Fin', 'Koh', email='fin.koh@uplandrefining.example'), 'No domain: flagged'),
    (person(dict(U, company_domain='https://www.uplandrefining.example'), 'Gia', 'Sim', email='gia.sim@uplandrefining.example'), 'Domain written as a web address: flagged'),
    (person(dict(U, company_domain='uplandrefining'), 'Hal', 'Yeo', email='hal.yeo@uplandrefining.example'), 'Domain with no dot: flagged'),
], '8 rows read, 1 not loaded; the others load with one flag each.')
lead_file('P15', 'missing_columns', 'Columns missing from the file', 'The file has no owner_email, consent_basis or opt_out columns. Every row is treated as having them blank.', [
    (person(co('Vista Refining'), 'Ann', 'Lim'), 'Row 1'), (person(co('Vista Refining'), 'Bo', 'Tan', job_title='Plant Manager'), 'Row 2'),
    (person(co('Wave Refining'), 'Cy', 'Ng'), 'Row 3')],
    'Three "required column is missing" flags; no contact is contactable (no consent basis, opt-out not confirmed). Both accounts still pass.',
    cols=[c for c in LEAD_COLS if c not in ('owner_email', 'consent_basis', 'opt_out')])
lead_file('P16', 'no_company_name_column', 'No company_name column', 'Without company_name the file cannot be read at all.', [
    (person(co('Xeno Refining'), 'Ann', 'Lim'), 'Not read'), (person(co('Xeno Refining'), 'Bo', 'Tan'), 'Not read')],
    'File not processed: "Couldn\'t find the header row". Nothing is loaded.', cols=[c for c in LEAD_COLS if c != 'company_name'])
Y = co('Yonder Refining')
tmpl_header = [('First Name*' if c == 'first_name' else 'Company Name*' if c == 'company_name' else c.replace('_', ' ').title()) for c in LEAD_COLS] + ['Notes', 'Lead score']
hints = ['Text*', 'Text*', 'Text*', 'Text', 'Email* (or LinkedIn URL)', 'Y/N', 'URL', 'Text*', 'Domain*', 'Country*', 'Text', 'Text*', 'Number', 'Number', 'List', 'Y/N*', 'Y/N*',
         'Text', 'Text', 'Number', 'Text', 'List*', 'Y/N*', 'Email*', '', '']
rows15 = [(person(Y, 'Ana', 'Lim'), 'Data row 1'), (person(Y, 'Ben', 'Tan', job_title='Plant Manager'), 'Data row 2')]
write_book('1-Prospecting/P17_template_style_headers.xlsx', None,
          [['DemandAI lead template'] + [''] * 25, tmpl_header, hints] + [[r.get(c, '') for c in LEAD_COLS] + ['met at a trade show', '87'] for r, _ in rows15])
LISTS['P17'] = [r for r, _ in rows15]
files.append(dict(id='P17', folder='1-Prospecting', file='P17_template_style_headers.xlsx', path='1-Prospecting/P17_template_style_headers.xlsx', kind='lead',
                  title='Template layout: title row, headers with * and spaces, format-hints row, extra columns',
                  why='A file filled in on the template as people really do: a title above the headers, "First Name*" style headers, the hints row left in, and two columns of their own.',
                  expect='Header found on row 2; hints row skipped (note); "Notes" and "Lead score" ignored (notes); 2 contacts load.',
                  steps='Prospecting: drop P17_template_style_headers.xlsx.', rows=[dict(row=4, tests='Data row 1'), dict(row=5, tests='Data row 2')]))
# P18: an Excel workbook with several sheets
wb = Workbook(); ws = wb.active; ws.title = 'Instructions'; ws.append(['Fill in the Lead template sheet. company_name and signal_type are explained below.'])
ws2 = wb.create_sheet('Lead template'); ws2.append(LEAD_COLS)
Z = co('Zenith Refining')
LISTS['P18'] = [person(Z, 'Ana', 'Lim'), person(Z, 'Ben', 'Tan', job_title='Plant Manager')]
for r in LISTS['P18']: ws2.append([r.get(c, '') for c in LEAD_COLS])
ws3 = wb.create_sheet('Lookups'); ws3.append(['account_type']); [ws3.append([t]) for t in ['Owner-operator', 'EPC contractor', 'Distributor']]
os.makedirs(os.path.join(PACK, '1-Prospecting'), exist_ok=True)
wb.save(os.path.join(PACK, '1-Prospecting', 'P18_excel_with_several_sheets.xlsx'))
files.append(dict(id='P18', folder='1-Prospecting', file='P18_excel_with_several_sheets.xlsx', path='1-Prospecting/P18_excel_with_several_sheets.xlsx', kind='lead-xlsx',
                  title='Excel workbook with several sheets', why='The POC must pick the "Lead template" sheet, not the first sheet.',
                  expect='Reads the "Lead template" sheet: 2 rows, 1 account, 0 issues.', steps='Prospecting: drop P18_excel_with_several_sheets.xlsx.',
                  rows=[dict(row=2, tests='Data row 1'), dict(row=3, tests='Data row 2')]))
write_book('1-Prospecting/P19_wrong_file_signal_file.xlsx', SIG_COLS, [['Zenith Refining', 'ana.lim@zenithrefining.example', 'Inquiry or RFQ', '2026-10-10', 'Asked for a quote', 'Web form', '']])
files.append(dict(id='P19', folder='1-Prospecting', file='P19_wrong_file_signal_file.xlsx', path='1-Prospecting/P19_wrong_file_signal_file.xlsx', kind='lead',
                  title='Wrong file: a signal file dropped into Prospecting', why='Someone uploads the wrong template.',
                  expect='File not processed: the lead header row is not found. Nothing loads, with a message saying why.', steps='Prospecting: drop P19_wrong_file_signal_file.xlsx.', rows=[]))
write_book('1-Prospecting/P20_headers_only.xlsx', LEAD_COLS, [])
files.append(dict(id='P20', folder='1-Prospecting', file='P20_headers_only.xlsx', path='1-Prospecting/P20_headers_only.xlsx', kind='lead',
                  title='Empty template: headers only', why='An empty file must not break the page.', expect='0 rows read, 0 accounts; a clear empty state, no error.',
                  steps='Prospecting: drop P20_headers_only.xlsx.', rows=[]))
shuffled = LEAD_COLS[::-1]
lead_file('P21', 'columns_in_another_order', 'Columns in a different order', 'The template columns, but in reverse order.', [
    (person(co('Aurora Refining'), 'Ana', 'Lim'), 'Clean'), (person(co('Aurora Refining'), 'Ben', 'Tan', job_title='Plant Manager'), 'Clean')],
    'Reads normally: 2 rows, 1 account, 0 issues.', cols=shuffled)
Q = co('Quay Refining, Ltd')
lead_file('P22', 'commas_quotes_and_accents', 'Commas, quotes and accents inside values', 'Values with commas, quotes and accented names.', [
    (person(Q, 'José', 'Nuñez', job_title='Head of Automation, Instrumentation & Control'), 'Comma in the company name and the job title'),
    (person(Q, 'Thảo', 'Nguyễn', job_title='Plant Manager "Site A"'), 'Accented name and quotes in the title'),
    (person(Q, 'Siti', "Nur'Aini"), 'Apostrophe in the name')],
    '3 rows, 1 account "Quay Refining, Ltd"; names and titles shown exactly as written.')

# ═════════════ 2 · Account Scoring: one prospect list, many signal files ═════════════
BASE = []
def acct(name, why, people, **k):
    c = co(name, **k)
    refs = []
    for p in people:
        f, l, t = p[0], p[1], p[2] if len(p) > 2 else 'Instrumentation Manager'
        extra = p[3] if len(p) > 3 else {}
        r = person(c, f, l, t, 'Manager', **extra)
        BASE.append((r, why)); refs.append(r['email'])
    return refs
P2 = [('Kai', 'Ong'), ('Lena', 'Koh', 'Plant Manager')]
A = {}
A['apex'] = acct('Apex Refining', 'Fit 100: core, above-target revenue, refining site, existing customer, owner-operator, primary contact', P2, existing='Y')
A['bay'] = acct('Bayfront Refining', 'Fit 100', [('Mia', 'Tan'), ('Ned', 'Lim', 'Operations Director')], existing='Y')
A['cold'] = acct('Coldwater Refining', 'Fit 100', [('Oli', 'Ng'), ('Pam', 'Ho', 'Maintenance Manager')], existing='Y')
A['drift'] = acct('Driftwood Refining', 'Fit 100', [('Quin', 'Ong'), ('Rae', 'Koh', 'Plant Manager')], existing='Y')
A['east'] = acct('Eastgate Refining', 'Fit 100', [('Sam', 'Sim'), ('Tia', 'Yeo', 'Plant Manager')], existing='Y')
A['fair'] = acct('Fairhaven Refining', 'Fit 100 (gets no signal in most files: watch list)', [('Uri', 'Wu'), ('Vi', 'Lau', 'Plant Manager')], existing='Y')
A['moor'] = acct('Moorland Refining', 'Revenue USD 400m (in target): fit 94', [('Wes', 'Goh')], revenue=400000000, existing='Y')
A['pebble'] = acct('Pebblebrook Refining', 'Same as Moorland but not a customer: fit 85', [('Xin', 'Chua')], revenue=400000000)
A['new'] = acct('Newhaven Petrochem', 'Petrochemicals (adjacent), olefins site: fit 75', [('Yan', 'Lee')], industry='Petrochemicals', process='Olefins', existing='Y')
A['oak'] = acct('Oakridge Water', 'Industry not in the lookup: vertical Other, fit 60', [('Zed', 'Teo')], industry='Water utilities', process='Water treatment', existing='Y')
A['quarry'] = acct('Quarry Hill Engineering', 'EPC contractor: fit 96', [('Abe', 'Wee')], account_type='EPC contractor', existing='Y')
A['larks'] = acct('Larkspur Refining', 'No primary-persona contact: fit 97, confidence low', [('Bea', 'Ang', 'Plant Manager')], existing='Y')
A['juniper'] = acct('Juniper Fuels', 'Fit exactly 50 (core, small, no site, not a customer, distributor, no primary contact): just passes the floor',
                    [('Cal', 'Ho', 'Plant Manager')], revenue=100000000, employees=300, account_type='Distributor', process='')
A['kings'] = acct('Kingsbridge Fuels', 'Fit 49 (no size given): below the fit floor', [('Dee', 'Lim')], revenue='', employees='', account_type='Distributor', process='')
A['rose'] = acct('Rosewood Refining', 'Primary contact opted out; secondary kept', [('Eli', 'Tan', 'Instrumentation Manager', {'opt_out': 'Y'}), ('Fia', 'Ng', 'Plant Manager')], existing='Y')
A['stone'] = acct('Stonegate Refining', 'Fit 100 (used for the knock-out test)', [('Gil', 'Ong')], existing='Y')
A['tide'] = acct('Tidewater Refining', 'Outside the pilot region (Australia): excluded in the list', [('Hu', 'Koh')], country='Australia')
write_book('2-Account-Scoring/S00_prospect_list_for_scoring_and_signals.xlsx', LEAD_COLS, [[r.get(c, '') for c in LEAD_COLS] for r, _ in BASE])
files.append(dict(id='S00', folder='2-Account-Scoring', file='S00_prospect_list_for_scoring_and_signals.xlsx', path='2-Account-Scoring/S00_prospect_list_for_scoring_and_signals.xlsx',
                  kind='base', title='The prospect list for every scoring and signal file',
                  why='17 accounts, each built to a known fit. Upload it once; every S and G file is scored against it.',
                  expect="24 rows, 17 accounts, 16 pass (Tidewater Refining excluded: Australia), 22 contacts in the final list (Rosewood's primary contact opted out); Kingsbridge Fuels flagged for no company size.",
                  steps='Account Scoring > New scoring > 1 · Prospect list > "Upload a prospect file": drop S00. (Or upload it in Prospecting and save it.)',
                  rows=[dict(row=i + 2, tests=w) for i, (_, w) in enumerate(BASE)]))
APEX_P, APEX_S = A['apex']
def d(days):
    from datetime import date, timedelta
    return (date.fromisoformat(AS_OF) - timedelta(days=days)).isoformat()
def sig_file(folder, fid, name, title, why, rows, expect, cols=None, asofs=None, steps=None):
    cols = cols or SIG_COLS
    path = f'{folder}/{fid}_{name}.xlsx'
    write_book(path, cols, [[dict(zip(SIG_COLS, r)).get(c, '') for c in cols] for r, _ in rows])
    files.append(dict(id=fid, folder=folder, file=os.path.basename(path), path=path, kind='signal', title=title, why=why, expect=expect,
                      asOf=asofs or [AS_OF], steps=steps or f'Account Scoring: with the S00 list chosen, set "Score as of" to {AS_OF}, then drop {os.path.basename(path)} on box 2.',
                      rows=[dict(row=i + 2, tests=t) for i, (_, t) in enumerate(rows)]))
def S_(company, ref, typ, when, detail='', source='CRM', product=''):
    return [company, ref, typ, d(when) if isinstance(when, int) else when, detail, source, product]
INQ = 'Asked for a quote on a DCS migration'
SC = '2-Account-Scoring'
sig_file(SC, 'S01', 'mixed_signals_all_tiers', 'Every tier in one run', 'A realistic mix: strong, middling and weak signals, an account with none, one below the fit floor and one excluded.', [
    (S_('Apex Refining', APEX_P, 'Inquiry or RFQ', 5, INQ, 'Web form'), 'Apex: fresh inquiry: tier A'),
    (S_('Bayfront Refining', A['bay'][0], 'Installed system near end of support', 120, 'Control system reaches end of support in 2027', 'Installed base'), 'Bayfront: end of support: tier A'),
    (S_('Coldwater Refining', A['cold'][0], 'Capital project', 40, 'Announced a refinery expansion', 'News'), 'Coldwater: capital project (weight 80): tier A'),
    (S_('Driftwood Refining', A['drift'][0], 'Webinar attended', 10, 'Attended the alarm management webinar', 'Webinar platform'), 'Driftwood: webinar: tier B'),
    (S_('Eastgate Refining', A['east'][0], 'Email clicked', 5, 'Clicked the lifecycle services email', 'Email platform'), 'Eastgate: one email click: tier C'),
    (S_('Moorland Refining', A['moor'][0], 'Service contract renewal', 30, 'Service contract renews on 31 Mar 2027', 'CRM'), 'Moorland: service renewal'),
    (S_('Newhaven Petrochem', A['new'][0], 'Leadership change', 10, 'New plant director appointed', 'News'), 'Newhaven: leadership change'),
    (S_('Juniper Fuels', A['juniper'][0], 'Inquiry or RFQ', 5, INQ, 'Web form'), 'Juniper (fit 50): inquiry'),
    (S_('Kingsbridge Fuels', A['kings'][0], 'Inquiry or RFQ', 5, INQ, 'Web form'), 'Kingsbridge (fit 49): qualified but not used, below the fit floor'),
    (S_('Tidewater Refining', A['tide'][0], 'Inquiry or RFQ', 5, INQ, 'Web form'), 'Tidewater (excluded): qualified but not used'),
], 'Tiers A, B and C all appear; Fairhaven and others with no signal are on the watch list; Kingsbridge is below the fit floor; Tidewater excluded.',
   asofs=[AS_OF, '2026-12-20', '2027-04-20'])
sig_file(SC, 'S02', 'tier_cut_offs', 'Tier cut-offs at exactly 35 and 20', 'Inquiries aged so the scores land exactly on, and just under, each cut-off (fit 100 accounts).', [
    (S_('Apex Refining', APEX_P, 'Inquiry or RFQ', 10, INQ, 'Web form'), 'Fresh inquiry, weight 100: score 50, A'),
    (S_('Bayfront Refining', A['bay'][0], 'Inquiry or RFQ', 48, INQ, 'Web form'), '48 days: weight 70, score exactly 35: A (the cut-off is "at least 35")'),
    (S_('Coldwater Refining', A['cold'][0], 'Inquiry or RFQ', 49, INQ, 'Web form'), '49 days: weight 68.3, score 34.2: B'),
    (S_('Driftwood Refining', A['drift'][0], 'Inquiry or RFQ', 66, INQ, 'Web form'), '66 days: weight 40, score exactly 20: B'),
    (S_('Eastgate Refining', A['east'][0], 'Inquiry or RFQ', 67, INQ, 'Web form'), '67 days: weight 38.3, score 19.2: C'),
], 'Apex A 50, Bayfront A 35, Coldwater B 34.2, Driftwood B 20, Eastgate C 19.2.')
sig_file(SC, 'S03', 'same_signal_every_account_fit_effect', 'Same signal, different fit', 'Every account gets the same fresh inquiry, so differences in score come only from fit.', [
    (S_(n, A[k][0], 'Inquiry or RFQ', 5, INQ, 'Web form'), f'{n}: inquiry') for k, n in [('apex', 'Apex Refining'), ('moor', 'Moorland Refining'), ('pebble', 'Pebblebrook Refining'),
        ('new', 'Newhaven Petrochem'), ('oak', 'Oakridge Water'), ('quarry', 'Quarry Hill Engineering'), ('larks', 'Larkspur Refining'), ('juniper', 'Juniper Fuels'), ('kings', 'Kingsbridge Fuels')]],
   'Score = fit / 2 for each: Apex 50, Quarry Hill 48, Larkspur 48.5, Moorland 47, Pebblebrook 42.5, Newhaven 37.5, Oakridge 30, Juniper 25; Kingsbridge below the fit floor.')
sig_file(SC, 'S04', 'stacking_several_signals', 'Several signals on one account', 'How signals add up: one person with several, two people, the same type twice on different dates.', [
    (S_('Apex Refining', APEX_P, 'Inquiry or RFQ', 3, INQ, 'Web form'), 'Apex, Kai: inquiry (100)'),
    (S_('Apex Refining', APEX_P, 'Webinar attended', 6, 'Attended the alarm management webinar', 'Webinar platform'), 'Apex, Kai: webinar (60, counts half)'),
    (S_('Apex Refining', APEX_P, 'Email clicked', 4, 'Clicked the lifecycle services email', 'Email platform'), 'Apex, Kai: email click (30, counts a quarter): stacked 137.5, score 68.8'),
    (S_('Bayfront Refining', A['bay'][0], 'Inquiry or RFQ', 3, INQ, 'Web form'), 'Bayfront, Mia: inquiry'),
    (S_('Bayfront Refining', A['bay'][1], 'Content download', 9, 'Downloaded the migration planning guide', 'Website'), 'Bayfront, Ned: download: account 130, score 65; each person scored on their own'),
    (S_('Coldwater Refining', A['cold'][0], 'Webinar attended', 5, 'Attended the alarm management webinar', 'Webinar platform'), 'Coldwater: webinar'),
    (S_('Coldwater Refining', A['cold'][0], 'Webinar attended', 50, 'Attended the reliability webinar', 'Webinar platform'), 'Coldwater: another webinar, different date: both count'),
], 'Apex 68.8 (A), Bayfront 65 (A), Coldwater two webinars stacked.')
sig_file(SC, 'S05', 'knock_out_installed_system', 'Knock-out: pilot product already installed', 'The "Installed system (current)" type excludes the account whatever else it has.', [
    (S_('Stonegate Refining', A['stone'][0], 'Installed system (current)', 200, 'Current pilot product installed on the crude unit', 'Installed base'), 'Stonegate: knocked out'),
    (S_('Stonegate Refining', A['stone'][0], 'Inquiry or RFQ', 5, INQ, 'Web form'), 'Stonegate: inquiry is qualified but not used (account excluded)'),
    (S_('Quarry Hill Engineering', 'someone.else@quarryhillengineering.example', 'Installed system (current)', 300, 'Pilot product installed', 'Installed base'), 'Quarry Hill: knock-out naming a person not in the list: still knocks the account out'),
    (S_('Apex Refining', APEX_P, 'Installed system near end of support', 100, 'Old control system reaches end of support', 'Installed base'), 'Apex: "near end of support" is a buying signal, not a knock-out'),
], 'Stonegate Refining and Quarry Hill Engineering excluded; Apex scored normally (tier A).')
sig_file(SC, 'S06', 'headers_only_no_signals', 'No signals at all', 'A signal file with headers and no rows.', [],
         'Every passing account is on the watch list; no error.')
sig_file(SC, 'S07', 'opted_out_person_signal', 'Signal from a person who opted out (known gap)', 'Rosewood Refining: the only signal is from the primary contact, who opted out.', [
    (S_('Rosewood Refining', A['rose'][0], 'Inquiry or RFQ', 5, INQ, 'Web form'), 'Rosewood, Eli (opted out): inquiry'),
    (S_('Apex Refining', APEX_P, 'Inquiry or RFQ', 5, INQ, 'Web form'), 'Apex: control')],
   'SHOULD: the opted-out person\'s inquiry is not used, so Rosewood is on the watch list. TODAY: it counts (tier A) and Rosewood then gets no recommendation in Micro-segments. Log as a gap.')

# ═════════════ 3 · Signal file rules ═════════════
SG = '3-Signal-rules'
TYPES = [('Inquiry or RFQ', INQ), ('Installed system near end of support', 'Control system reaches end of support in 2027'), ('Service contract renewal', 'Service contract renews next quarter'),
         ('Capital project', 'Announced a refinery expansion'), ('Leadership change', 'New head of operations appointed'), ('Webinar attended', 'Attended the alarm management webinar'),
         ('Webinar registered', 'Registered for the reliability webinar'), ('Content download', 'Downloaded the migration planning guide'), ('Email clicked', 'Clicked the lifecycle services email')]
sig_file(SG, 'G01', 'every_signal_type', 'Every signal type', 'One fresh row of each type the template allows, plus "Newsletter sign-up", which is never scored. Also used for the Setup switch-off test.', [
    (S_('Apex Refining', APEX_P, t, 3 + i, dt), f'{t}: qualified') for i, (t, dt) in enumerate(TYPES)] + [
    (S_('Apex Refining', APEX_P, 'Newsletter sign-up', 4, 'Signed up for the newsletter', 'Website'), 'Newsletter sign-up: rejected D1 (does not predict buying)')],
   '9 qualified with their codes (Y2, Y1, Y1, Y4, C1c, C1w, C1w, C1w, C1x); the newsletter row rejected D1. Setup test: switch off "Content download", score again: that row is rejected OFF.')
sig_file(SG, 'G02', 'company_matching', 'Matching the company', 'How the company name in the signal file is matched to the list.', [
    (S_('Apex Refining', APEX_P, 'Webinar attended', 5, 'Attended a webinar'), 'Exact name: matched'),
    (S_('APEX REFINING', APEX_P, 'Content download', 6, 'Downloaded a guide'), 'Capitals: matched'),
    (S_('Apex  Refining ', APEX_P, 'Email clicked', 7, 'Clicked an email'), 'Double space and trailing space: matched'),
    (S_('Apex Refining Ltd', APEX_P, 'Webinar registered', 8, 'Registered for a webinar'), '"Ltd" added: not matched (D4): names must be written as in the list'),
    (S_('Unknown Refining', 'a.b@unknownrefining.example', 'Inquiry or RFQ', 5, INQ), 'Company not in the list: rejected D4'),
    (S_('', APEX_P, 'Inquiry or RFQ', 5, INQ), 'No company name: rejected D3'),
    (S_('Tidewater Refining', A['tide'][0], 'Inquiry or RFQ', 5, INQ), 'Company in the list but excluded (Australia): qualified, then not used'),
], '3 rows match Apex; "Ltd" and the unknown company are D4; the blank company is D3; Tidewater is not used.')
sig_file(SG, 'G03', 'person_matching', 'Matching the person', 'How the person column is matched: email, LinkedIn URL, unknown, or left blank.', [
    (S_('Apex Refining', APEX_P, 'Webinar attended', 5, 'Attended a webinar'), 'Email exactly as in the list: matched'),
    (S_('Apex Refining', APEX_P.upper(), 'Content download', 6, 'Downloaded a guide'), 'Email in capitals: matched'),
    (S_('Apex Refining', 'https://www.linkedin.com/in/kai-ong-apexre', 'Email clicked', 7, 'Clicked an email'), 'LinkedIn URL: matched'),
    (S_('Apex Refining', 'http://linkedin.com/in/kai-ong-apexre/', 'Webinar registered', 8, 'Registered for a webinar'), 'LinkedIn URL in another form: matched'),
    (S_('Apex Refining', 'new.person@apexrefining.example', 'Inquiry or RFQ', 5, INQ), 'Person not in the list: rejected D4, offered as a suggested new contact'),
    (S_('Bayfront Refining', '', 'Inquiry or RFQ', 5, INQ), 'No person named: given to the primary-persona contact (Mia Tan), flagged as auto-assigned'),
    (S_('Larkspur Refining', '', 'Inquiry or RFQ', 5, INQ), 'No person named, no primary contact at the account: given to Bea Ang, flagged'),
    (S_('Rosewood Refining', '', 'Inquiry or RFQ', 5, INQ), 'No person named, primary opted out: given to the secondary contact, not the opted-out one'),
], '4 rows match Kai Ong; one suggested new contact; three auto-assigned rows.')
sig_file(SG, 'G04', 'dates', 'Event dates', f'Dates in the wrong form, missing, in the future, and on the scoring date ({AS_OF}).', [
    (S_('Apex Refining', APEX_P, 'Webinar attended', '2026-10-15', 'Correct form'), 'YYYY-MM-DD: qualified'),
    (S_('Apex Refining', APEX_P, 'Content download', AS_OF, 'Same day'), 'On the scoring date (0 days old): qualified'),
    (S_('Apex Refining', APEX_P, 'Email clicked', '', 'No date'), 'Blank: rejected D3'),
    (S_('Apex Refining', APEX_P, 'Webinar registered', '15/10/2026', 'Day first'), 'DD/MM/YYYY: rejected D3'),
    (S_('Apex Refining', APEX_P, 'Inquiry or RFQ', '2026/10/15', 'Slashes'), 'YYYY/MM/DD: rejected D3'),
    (S_('Apex Refining', APEX_P, 'Leadership change', 'Oct 15, 2026', 'Words'), 'Written in words: rejected D3'),
    (S_('Apex Refining', APEX_P, 'Capital project', '2026-02-30', 'No such day'), '30 February: rejected D3'),
    (S_('Apex Refining', APEX_P, 'Service contract renewal', '2026-10-21', 'Tomorrow'), 'After the scoring date: rejected D3'),
], '2 qualified; 6 rejected D3 with the reason. (The dates are typed as text, as they arrive from a CSV export; G13 has real Excel dates.)')
sig_file(SG, 'G05', 'signal_type_spelling', 'Signal type spelling', 'Types written in other cases, misspelt, blank or not on the list.', [
    (S_('Apex Refining', APEX_P, 'inquiry or rfq', 5, INQ), 'Lower case: accepted'),
    (S_('Apex Refining', APEX_P, 'WEBINAR ATTENDED', 6, 'Attended a webinar'), 'Capitals: accepted'),
    (S_('Apex Refining', APEX_P, 'Webinar attend', 7, 'Attended a webinar'), 'Misspelt: rejected D3'),
    (S_('Apex Refining', APEX_P, 'Trade show visit', 8, 'Visited our stand'), 'Not on the list: rejected D3'),
    (S_('Apex Refining', APEX_P, 'RFQ', 9, INQ), 'Short form "RFQ": rejected D3'),
    (S_('Apex Refining', APEX_P, '', 10, 'No type'), 'Blank: rejected D3'),
], '2 accepted, 4 rejected D3.')
sig_file(SG, 'G06', 'duplicates', 'Duplicate signals', 'The same event twice, and near-duplicates that are separate events.', [
    (S_('Apex Refining', APEX_P, 'Webinar attended', 10, 'Attended a webinar'), 'First: qualified'),
    (S_('Apex Refining', APEX_P, 'Webinar attended', 10, 'Attended a webinar'), 'Same person, type and date: rejected D5'),
    (S_('Apex Refining', APEX_P.upper(), 'webinar attended', 10, 'Attended a webinar'), 'Same again, written differently: rejected D5'),
    (S_('Apex Refining', APEX_P, 'Webinar attended', 11, 'Attended a webinar'), 'Next day: a separate event, qualified'),
    (S_('Apex Refining', APEX_S, 'Webinar attended', 10, 'Attended a webinar'), 'Same day, other person: qualified'),
    (S_('Bayfront Refining', '', 'Content download', 5, 'Downloaded a guide'), 'No person named: auto-assigned'),
    (S_('Bayfront Refining', '', 'Content download', 5, 'Downloaded a guide'), 'Same row again: auto-assigned to the same person, rejected D5'),
], '3 rejected D5; 4 qualified.')
stale_rows = []
for i, (t, dt) in enumerate(TYPES):
    win = {'Inquiry or RFQ': 90, 'Installed system near end of support': 730, 'Service contract renewal': 180, 'Capital project': 365, 'Leadership change': 120,
           'Webinar attended': 180, 'Webinar registered': 120, 'Content download': 180, 'Email clicked': 60}[t]
    stale_rows.append((S_('Apex Refining', APEX_P, t, win - 1, dt), f'{t}, {win - 1} days: last day it counts, qualified with a small weight'))
    stale_rows.append((S_('Bayfront Refining', A['bay'][0], t, win, dt), f'{t}, {win} days: stale, rejected D2'))
sig_file(SG, 'G07', 'stale_window_edges', 'How long each signal counts', 'For each type, one row on the last day it still counts and one on the day it stops.', stale_rows,
         '9 qualified (small weights) on Apex; 9 rejected D2 on Bayfront.')
fade = []
for t, full, zero in [('Inquiry or RFQ', 30, 90), ('Webinar attended', 30, 180), ('Email clicked', 14, 60)]:
    for age in (full, full + 1, (full + zero) // 2):
        fade.append((S_('Apex Refining', APEX_P, t, age, f'{t} {age} days ago'), f'{t}, {age} days: weight {"full" if age <= full else "fading"}'))
sig_file(SG, 'G08', 'fading_weights', 'How weights fade', 'Three types at full weight, the first day they fade, and halfway through.', fade,
         'Each row\'s weight as in the answer key: full up to the "full" day, then falling in a straight line to 0.')
sig_file(SG, 'G09', 'missing_detail_and_optional_columns', 'Blank detail, source and product', 'Only company, type and date really matter.', [
    (S_('Apex Refining', APEX_P, 'Webinar attended', 5, '', '', ''), 'No detail, source or product: qualified, noted; the why-now line names only the type'),
    (S_('Bayfront Refining', A['bay'][0], 'Inquiry or RFQ', 5, INQ, '', ''), 'No source: qualified'),
], 'Both qualified; a "No detail" note on row 2.')
sig_file(SG, 'G10', 'missing_detail_column_and_extra_columns', 'A missing column and extra columns', 'No "detail" column; two columns that are not in the template; columns in another order.', [
    (S_('Apex Refining', APEX_P, 'Webinar attended', 5, '', 'Webinar platform', ''), 'Row 1'),
    (S_('Bayfront Refining', A['bay'][0], 'Inquiry or RFQ', 5, '', 'Web form', ''), 'Row 2')],
   '"Required column detail is missing" flag; the extra columns are ignored with a note; both rows qualify.',
   cols=['signal_type', 'event_date', 'company_name', 'contact_email_or_linkedin', 'source', 'Campaign', 'Owner'])
sig_file(SG, 'G11', 'no_signal_type_column', 'No signal_type column', 'Without signal_type the file cannot be read.', [
    (S_('Apex Refining', APEX_P, 'Webinar attended', 5, 'Attended a webinar'), 'Not read')],
   'File not processed: header row not found. Nothing is scored.', cols=[c for c in SIG_COLS if c != 'signal_type'])
write_book(f'{SG}/G12_wrong_file_lead_file.xlsx', LEAD_COLS, [[r.get(c, '') for c in LEAD_COLS] for r, _ in BASE[:2]])
files.append(dict(id='G12', folder=SG, file='G12_wrong_file_lead_file.xlsx', path=f'{SG}/G12_wrong_file_lead_file.xlsx', kind='signal', asOf=[AS_OF],
                  title='Wrong file: a lead file dropped into the signal box', why='Someone uploads the wrong template.',
                  expect='File not processed: the signal header row is not found. Nothing is scored, with a message saying why.',
                  steps='Account Scoring: with the S00 list chosen, drop G12_wrong_file_lead_file.xlsx on box 2.', rows=[]))
wb = Workbook(); ws = wb.active; ws.title = 'Read me'; ws.append(['Signals for the pilot. One row per event.'])
ws2 = wb.create_sheet('Signal template'); ws2.append(SIG_COLS)
ws2.append(['Apex Refining', APEX_P, 'Inquiry or RFQ', d(5), INQ, 'Web form', '']); ws2.append(['Bayfront Refining', A['bay'][0], 'Webinar attended', d(8), 'Attended a webinar', 'Webinar platform', ''])
ws3 = wb.create_sheet('Types'); ws3.append(['signal_type']); [ws3.append([t]) for t, _ in TYPES]
os.makedirs(os.path.join(PACK, SG), exist_ok=True)
wb.save(os.path.join(PACK, SG, 'G13_excel_with_several_sheets.xlsx'))
files.append(dict(id='G13', folder=SG, file='G13_excel_with_several_sheets.xlsx', path=f'{SG}/G13_excel_with_several_sheets.xlsx', kind='signal-xlsx', asOf=[AS_OF],
                  title='Excel workbook with several sheets', why='The POC must pick the "Signal template" sheet, and read Excel dates.',
                  expect='Reads "Signal template": 2 rows, both qualified (Excel dates read correctly).',
                  steps='Account Scoring: with the S00 list chosen, drop G13_excel_with_several_sheets.xlsx on box 2.',
                  rows=[dict(row=2, tests='Apex inquiry'), dict(row=3, tests='Bayfront webinar')]))
sig_file(SG, 'G14', 'signals_for_excluded_and_below_floor_accounts', 'Signals for accounts that are not scored', 'Excluded and below-floor accounts keep their signals out of scoring.', [
    (S_('Tidewater Refining', A['tide'][0], 'Inquiry or RFQ', 5, INQ), 'Excluded account (Australia): not used'),
    (S_('Kingsbridge Fuels', A['kings'][0], 'Inquiry or RFQ', 5, INQ), 'Below the fit floor: not used'),
    (S_('Apex Refining', APEX_P, 'Inquiry or RFQ', 5, INQ), 'Control: qualified'),
], 'Rows 2 and 3 show "Not used" with the reason; row 4 qualified.')

# ═════════════ Matching signal files for the Prospecting lists ═════════════
# One signal per person on the list, naming them the way the list does (email, else LinkedIn, else nobody), so each list
# can be carried on into Account Scoring and the effect of each row's problem shows up there too.
for fid, people in LISTS.items():
    lf = next(f for f in files if f['id'] == fid)
    if fid in ('P16', 'P19', 'P20'): continue          # these lists load nothing, so there is nothing to score
    rows = []
    for i, r in enumerate(people):
        if not r.get('company_name'): continue
        t, dt = TYPES[i % len(TYPES)]
        ref = r.get('email') or r.get('linkedin_url') or ''
        who = ' '.join(x for x in (r.get('first_name'), r.get('last_name')) if x) or '(no name)'
        rows.append((S_(r['company_name'], ref, t, 3 + (i * 5) % 40, dt), f"{who}, {r['company_name']}: {t}" + ('' if ref else ' (no person named: auto-assigned)')))
    sid = fid + 'S'
    path = f"1-Prospecting/{lf['file'].replace('.xlsx', '')}_SIGNALS.xlsx"
    write_book(path, SIG_COLS, [r for r, _ in rows])
    files.insert(files.index(lf) + 1, dict(id=sid, folder='1-Prospecting', file=os.path.basename(path), path=path, list_path=lf['path'], kind='signal', asOf=[AS_OF],
        title=f"Signals for {fid}", why=f"The matching signal file for {lf['file']}: one signal for each person on that list.",
        expect='See "Signal rows" and "Scoring accounts" for this file.',
        steps=f"Account Scoring: \"Upload a prospect file\" = {lf['file']}; Score as of {AS_OF}; drop {os.path.basename(path)} on box 2.",
        rows=[dict(row=i + 2, tests=t) for i, (_, t) in enumerate(rows)]))

# ═════════════ 4 · Micro-segments and For Review: chained pairs from the scenario sets ═════════════
if SCEN:
    sc = json.load(open(SCEN))
    names = {'TS6': ('N01', 'segment_boundaries'), 'TS8': ('N02', 'contact_and_channel'), 'TS9': ('N03', 'for_review_reasons'), 'TS10': ('N04', 'rep_ownership')}
    for st in sc['sets']:
        if st['id'] not in names: continue
        nid, nm = names[st['id']]
        lp = sp = f'4-Micro-segments-and-Review/{nid}_{nm}.xlsx'
        write_book(lp, sc['leadCols'], st['leads'], sheets=[('Signal template', sc['sigCols'], st['signals'])])
        files.append(dict(id=nid, folder='4-Micro-segments-and-Review', file=os.path.basename(lp), path=sp, lead_path=lp,
                          kind='pair', set=st['id'], asOf=[AS_OF], title=st['title'], why=st['purpose'],
                          expect=f'As in {st["id"]} (answer key in ../poc-test-sets).',
                          steps=f'Account Scoring: "Upload a prospect file" = {os.path.basename(lp)} (reads its "Lead template" sheet); Score as of {AS_OF}; drop the same file on box 2 (reads "Signal template"). Then send to Micro-segments & NBA and open For Review.',
                          rows=[]))

json.dump({'asOf': AS_OF, 'files': files}, open(MANIFEST, 'w'), indent=1)
print(len(files), 'files:', ', '.join(f['id'] for f in files))
