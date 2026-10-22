"""Builds the input rows for the POC test sets (TS1-TS5) as JSON. build_poc_test_sets.py turns them into workbooks."""
import json, sys

AS_OF = '2026-10-20'
LEAD_COLS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
             'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
             'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
             'capacity_unit', 'consent_basis', 'opt_out', 'owner_email']
SIG_COLS = ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product']
REPS = ['aisha.rahman@client-sample.com', 'daniel.tan@client-sample.com', 'priya.nair@client-sample.com']

def lead(**k):
    return [k.get(c, '') for c in LEAD_COLS]

# ---------- TS1: the end-to-end set (16 accounts, 3 contacts each, all clean) ----------
# name, domain, country, city, industry, revenue, employees, type, existing, site, process, capacity, unit, intent
TS1_ACCOUNTS = [
    ('Northgate Refining', 'northgate-refining.com', 'Singapore', 'Jurong Island', 'Oil refining', 4200000000, 3800, 'Owner-operator', 'N', 'Jurong Refinery', 'Crude refining', 290000, 'bpd'),
    ('Kestrel Petrochemicals', 'kestrelpetchem.com', 'Malaysia', 'Kerteh', 'Petrochemicals', 1800000000, 2600, 'Owner-operator', 'Y', 'Kerteh Cracker', 'Petrochemicals', 600000, 'tpa'),
    ('Selatan LNG', 'selatanlng.co.id', 'Indonesia', 'Bontang', 'LNG', 2600000000, 2100, 'Owner-operator', 'N', 'Bontang Train 3', 'LNG liquefaction', 4500000, 'tpa'),
    ('Tanjung Refinery', 'tanjungrefinery.com.my', 'Malaysia', 'Melaka', 'Refining', 3100000000, 3300, 'Owner-operator', 'Y', 'Melaka Refinery', 'Refining', 170000, 'bpd'),
    ('Andaman Petrochem', 'andamanpetrochem.co.th', 'Thailand', 'Map Ta Phut', 'Petrochemicals', 950000000, 1500, 'Owner-operator', 'N', 'Map Ta Phut Aromatics', 'Aromatics', 400000, 'tpa'),
    ('Visayas Gas Processing', 'visayasgas.ph', 'Philippines', 'Batangas', 'Gas processing', 700000000, 1200, 'Owner-operator', 'N', 'Batangas Gas Plant', 'Gas processing', 250, 'mmscfd'),
    ('Mekong Delta Refining', 'mekongdeltarefining.vn', 'Vietnam', 'Dung Quat', 'Refining', 2200000000, 2500, 'Owner-operator', 'N', 'Dung Quat Refinery', 'Refining', 148000, 'bpd'),
    ('Java Aromatics', 'javaaromatics.co.id', 'Indonesia', 'Cilegon', 'Petrochemicals', 1300000000, 1900, 'Owner-operator', 'N', 'Cilegon Complex', 'Petrochemicals', 500000, 'tpa'),
    ('Borneo LNG Partners', 'borneolng.com.my', 'Malaysia', 'Bintulu', 'LNG', 3600000000, 2800, 'Owner-operator', 'Y', 'Bintulu Train 9', 'LNG liquefaction', 3600000, 'tpa'),
    ('Lagoon Refining', 'lagoonrefining.co.th', 'Thailand', 'Sriracha', 'Refining', 2700000000, 2900, 'Owner-operator', 'N', 'Sriracha Refinery', 'Refining', 275000, 'bpd'),
    ('Malacca Olefins', 'malaccaolefins.com.my', 'Malaysia', 'Pasir Gudang', 'Petrochemicals', 1100000000, 1600, 'Owner-operator', 'N', 'Pasir Gudang Olefins', 'Olefins', 700000, 'tpa'),
    ('Luzon Gas Processing', 'luzongas.ph', 'Philippines', 'Bataan', 'Gas processing', 600000000, 1100, 'Owner-operator', 'N', 'Bataan Gas Plant', 'Gas processing', 180, 'mmscfd'),
    ('Chao Phraya Refining', 'chaophrayarefining.co.th', 'Thailand', 'Rayong', 'Refining', 2400000000, 2700, 'Owner-operator', 'N', 'Rayong Refinery', 'Refining', 215000, 'bpd'),
    ('Sumatra Petrochemicals', 'sumatrapetchem.co.id', 'Indonesia', 'Dumai', 'Petrochemicals', 1500000000, 2000, 'Owner-operator', 'Y', 'Dumai Complex', 'Petrochemicals', 450000, 'tpa'),
    ('Penang Refining', 'penangrefining.com.my', 'Malaysia', 'Prai', 'Refining', 1900000000, 2300, 'Owner-operator', 'N', 'Prai Refinery', 'Refining', 120000, 'bpd'),
    ('Delta Biofuels Trading', 'deltabiofuels.vn', 'Vietnam', 'Ho Chi Minh City', 'Biofuels trading', 80000000, 140, 'Distributor', 'N', '', '', '', ''),
]
PEOPLE = [  # (first, last, title, seniority) per account, primary persona first
    [('Wei Ming', 'Lim', 'Instrumentation & Control Manager', 'Manager'), ('Farah', 'Iskandar', 'Plant Manager', 'Director'), ('Kenneth', 'Goh', 'Finance Director', 'Director')],
    [('Hafiz', 'Rahman', 'Automation Lead', 'Manager'), ('Siti', 'Aminah', 'Maintenance Manager', 'Manager'), ('Jason', 'Wong', 'HR Business Partner', 'Senior')],
    [('Budi', 'Santoso', 'Control Systems Engineer', 'Senior'), ('Dewi', 'Lestari', 'Operations Director', 'Director'), ('Agus', 'Pratama', 'Finance Manager', 'Manager')],
    [('Arif', 'Hassan', 'Head of Automation', 'Director'), ('Nurul', 'Huda', 'Reliability Manager', 'Manager'), ('Raymond', 'Teo', 'Commercial Manager', 'Manager')],
    [('Somchai', 'Wongsa', 'I&C Manager', 'Manager'), ('Ploy', 'Charoen', 'Procurement Manager', 'Manager'), ('Anan', 'Kittisak', 'Legal Counsel', 'Senior')],
    [('Jose', 'Reyes', 'DCS Engineer', 'Senior'), ('Maria', 'Santos', 'Plant Manager', 'Director'), ('Paolo', 'Cruz', 'IT Manager', 'Manager')],
    [('Minh', 'Nguyen', 'Automation Manager', 'Manager'), ('Lan', 'Tran', 'Project Director', 'Director'), ('Huy', 'Le', 'Finance Manager', 'Manager')],
    [('Rizky', 'Hidayat', 'E&I Manager', 'Manager'), ('Putri', 'Utami', 'Operations Manager', 'Manager'), ('Andi', 'Wijaya', 'Marketing Manager', 'Manager')],
    [('Azlan', 'Ismail', 'Control Systems Lead', 'Manager'), ('Mei Ling', 'Chong', 'Maintenance Director', 'Director'), ('Victor', 'Ng', 'Treasury Manager', 'Manager')],
    [('Krit', 'Suwan', 'Automation Engineer', 'Senior'), ('Nok', 'Prasert', 'Plant Manager', 'Director'), ('Tawan', 'Boonmee', 'Sustainability Lead', 'Manager')],
    [('Ravi', 'Kumar', 'Instrumentation Manager', 'Manager'), ('Aishah', 'Yusof', 'Procurement Lead', 'Manager'), ('Gary', 'Lee', 'Strategy Manager', 'Manager')],
    [('Ramon', 'Garcia', 'Control Systems Engineer', 'Senior'), ('Liza', 'Mendoza', 'Operations Manager', 'Manager'), ('Mark', 'Villanueva', 'Finance Director', 'Director')],
    [('Prasit', 'Chaiyo', 'Head of Instrumentation', 'Director'), ('Kanya', 'Siri', 'Reliability Engineer', 'Senior'), ('Chai', 'Wattana', 'Corporate Affairs Manager', 'Manager')],
    [('Fajar', 'Nugroho', 'Automation Manager', 'Manager'), ('Rina', 'Kusuma', 'Maintenance Manager', 'Manager'), ('Hendra', 'Saputra', 'Logistics Manager', 'Manager')],
    [('Daniel', 'Chin', 'I&C Lead', 'Manager'), ('Nadia', 'Zainal', 'Plant Manager', 'Director'), ('Eric', 'Khoo', 'Finance Manager', 'Manager')],
    [('Thanh', 'Pham', 'Trading Manager', 'Manager'), ('Quang', 'Vo', 'Logistics Lead', 'Manager'), ('Hoa', 'Dang', 'Accounts Manager', 'Manager')],
]

def email_for(first, last, domain):
    return f"{first.split()[0].lower()}.{last.lower()}@{domain}"

ts1 = []
primary_email = {}
for i, (name, dom, ctry, city, ind, rev, emp, typ, ex, site, proc, cap, unit) in enumerate(TS1_ACCOUNTS):
    for j, (fn, ln, title, sen) in enumerate(PEOPLE[i]):
        e = email_for(fn, ln, dom)
        if j == 0: primary_email[name] = e
        ts1.append(lead(first_name=fn, last_name=ln, job_title=title, seniority=sen, email=e, email_verified='Y',
                        linkedin_url=f"https://www.linkedin.com/in/{fn.split()[0].lower()}-{ln.lower()}-{i+1}{j+1}",
                        company_name=name, company_domain=dom, country=ctry, city=city, industry=ind,
                        annual_revenue_usd=rev, employee_count=emp, account_type=typ, existing_customer=ex,
                        managed_separately='N', site_name=site, site_process_type=proc, site_capacity=cap, capacity_unit=unit,
                        consent_basis='existing customer' if ex == 'Y' else 'legitimate interest', opt_out='N', owner_email=REPS[i % 3]))

# TS1 signals: every one named to the account's primary contact, ages measured against AS_OF
def sig(company, ref, typ, date, detail, source='CRM', product=''):
    return [company, ref, typ, date, detail, source, product]
P = primary_email
ts1_sig = [
    sig('Northgate Refining', P['Northgate Refining'], 'Inquiry or RFQ', '2026-10-12', 'Sent an RFQ for a DCS migration at the Jurong unit', 'Web form'),
    sig('Northgate Refining', P['Northgate Refining'], 'Webinar attended', '2026-10-05', 'Attended the legacy-control migration webinar', 'Webinar platform'),
    sig('Kestrel Petrochemicals', P['Kestrel Petrochemicals'], 'Inquiry or RFQ', '2026-10-14', 'Asked for budget pricing on safety system upgrades', 'Email'),
    sig('Selatan LNG', P['Selatan LNG'], 'Inquiry or RFQ', '2026-10-08', 'Requested a call about alarm management', 'Web form'),
    sig('Tanjung Refinery', P['Tanjung Refinery'], 'Installed system near end of support', '2026-08-01', 'DCS on the crude unit reaches end of support in 2027', 'Installed base'),
    sig('Andaman Petrochem', P['Andaman Petrochem'], 'Installed system near end of support', '2026-06-15', 'Control system at the aromatics plant goes out of support next year', 'Installed base'),
    sig('Visayas Gas Processing', P['Visayas Gas Processing'], 'Installed system near end of support', '2026-09-01', 'Legacy PLCs at the gas plant are end of life', 'Installed base'),
    sig('Mekong Delta Refining', P['Mekong Delta Refining'], 'Capital project', '2026-09-20', 'Announced a refinery expansion with a new hydrocracker', 'News'),
    sig('Java Aromatics', P['Java Aromatics'], 'Capital project', '2026-08-25', 'FEED awarded for a new paraxylene unit', 'News'),
    sig('Borneo LNG Partners', P['Borneo LNG Partners'], 'Capital project', '2026-10-01', 'Final investment decision on Train 10', 'News'),
    sig('Lagoon Refining', P['Lagoon Refining'], 'Webinar attended', '2026-10-06', 'Attended the alarm management webinar', 'Webinar platform'),
    sig('Malacca Olefins', P['Malacca Olefins'], 'Content download', '2026-10-10', 'Downloaded the migration planning guide', 'Website'),
    sig('Luzon Gas Processing', P['Luzon Gas Processing'], 'Email clicked', '2026-10-15', 'Clicked the lifecycle services email', 'Email platform'),
    sig('Chao Phraya Refining', P['Chao Phraya Refining'], 'Leadership change', '2026-10-01', 'New head of operations appointed', 'News'),
    sig('Sumatra Petrochemicals', P['Sumatra Petrochemicals'], 'Service contract renewal', '2026-09-25', 'Service contract renews on 31 Dec 2026', 'CRM'),
    sig('Sumatra Petrochemicals', P['Sumatra Petrochemicals'], 'Webinar registered', '2026-10-13', 'Registered for the November reliability webinar', 'Webinar platform'),
    sig('Delta Biofuels Trading', P['Delta Biofuels Trading'], 'Inquiry or RFQ', '2026-10-16', 'Asked about storage tank gauging', 'Web form'),
]

# ---------- TS2: data-quality edge cases for Prospecting (one problem per row) ----------
def base(**k):
    d = dict(first_name='Test', last_name='Contact', job_title='Instrumentation Manager', seniority='Manager', email_verified='Y',
             company_name='Coral Bay Refining', company_domain='coralbayrefining.com', country='Singapore', city='Jurong Island',
             industry='Refining', annual_revenue_usd=1500000000, employee_count=1800, account_type='Owner-operator',
             existing_customer='N', managed_separately='N', site_name='Coral Bay Refinery', site_process_type='Refining',
             site_capacity=150000, capacity_unit='bpd', consent_basis='legitimate interest', opt_out='N', owner_email=REPS[0])
    d.update(k)
    slug = lambda v: v.lower().replace(' ', '')
    if 'email' not in k: d['email'] = f"{slug(d['first_name'])}.{slug(d['last_name'])}@{d['company_domain']}"
    if 'linkedin_url' not in k: d['linkedin_url'] = f"https://www.linkedin.com/in/{slug(d['first_name'])}-{slug(d['last_name'])}"
    return lead(**d)

# (row, expect: list of (field, code), intent) built alongside so the answer key says what each row tests
TS2 = []
def add(row, tests, intent): TS2.append((row, tests, intent))
add(base(first_name='Ahmad', last_name='Karim'), [], 'Control row: clean, in the final list')
add(base(first_name='Lina', last_name='Ong', email='lina.ong@coralbay'), [('email', 'D3')], 'Email with no domain ending')
add(base(first_name='Marcus', last_name='Yeo', email='marcus yeo@coralbayrefining.com'), [('email', 'D3')], 'Email with a space')
add(base(first_name='Joanne', last_name='Sim', email_verified='TRUE'), [('email_verified', 'D3')], 'TRUE instead of Y')
add(base(first_name='Keith', last_name='Lau', email_verified='N'), [], 'Email not verified: loaded, email not used as a channel')
add(base(first_name='Priya', last_name='Menon', linkedin_url='https://www.linkedin.com/company/coral-bay-refining'), [('linkedin_url', 'D3')], 'LinkedIn company page, not a profile')
add(base(first_name='Sean', last_name='Koh', email='', linkedin_url=''), [('email / linkedin_url', 'D3')], 'No email and no LinkedIn')
add(base(first_name='Ahmad', last_name='Karim', email='AHMAD.KARIM@CORALBAYREFINING.COM', job_title='I&C Manager'), [('email', 'D5')], 'Same email as row 1 in capitals: merged')
add(base(first_name='Grace', last_name='Teh', email='grace.teh@coralbayrefining.com', linkedin_url='https://www.linkedin.com/in/grace-teh'), [], 'Control row for the LinkedIn duplicate below')
add(base(first_name='Grace', last_name='Teh', email='', linkedin_url='http://linkedin.com/in/grace-teh/'), [('linkedin_url', 'D5')], 'Same LinkedIn profile, different URL form: merged')
add(base(first_name='Irfan', last_name='Malik', opt_out='Y'), [], 'Opted out: suppressed, never contacted')
add(base(first_name='Cheryl', last_name='Poh', opt_out=''), [('opt_out', 'D3')], 'Opt-out blank: not contactable')
add(base(first_name='Victor', last_name='Seah', consent_basis='marketing list'), [('consent_basis', 'D3')], 'Consent basis not recognised')
add(base(first_name='Nora', last_name='Aziz', consent_basis=''), [('consent_basis', 'D3')], 'No consent basis')
add(base(first_name='Leon', last_name='Chua', owner_email='Aisha'), [('owner_email', 'D3')], 'Owner is a name, not an email')
add(base(first_name='Ben', last_name='Ho', job_title=''), [('job_title', 'D3')], 'Job title missing')
add(base(first_name='', last_name='Lim', email='m.lim@coralbayrefining.com', linkedin_url='https://www.linkedin.com/in/m-lim-cbr'), [('first_name', 'D3')], 'First name missing')
add(base(first_name='Omar', last_name='Said', company_name=''), [('company_name', 'D3')], 'Company name missing: row not loaded')
hp = dict(company_name='Harbour Point Petrochemicals', company_domain='harbourpoint.co.th', country='Thailand', city='Rayong', industry='Petrochemicals', site_name='Rayong Olefins', site_process_type='Olefins')
add(base(first_name='Narong', last_name='Sakul', **{**hp, 'annual_revenue_usd': '$2,400,000,000'}), [('annual_revenue_usd', 'D3')], 'Revenue with $ and commas: read as a number')
add(base(first_name='Suda', last_name='Rak', **{**hp, 'annual_revenue_usd': '$2,400,000,000', 'employee_count': 'about 3000'}), [('annual_revenue_usd', 'D3'), ('employee_count', 'D3')], 'Employees not a number')
add(base(first_name='Pim', last_name='Thong', **{**hp, 'annual_revenue_usd': '$2,400,000,000', 'company_domain': 'https://harbourpoint.co.th'}), [('annual_revenue_usd', 'D3'), ('company_domain', 'D3')], 'Domain given as a full URL')
add(base(first_name='Ton', last_name='Chai', **{**hp, 'annual_revenue_usd': '$2,400,000,000', 'account_type': 'Operator'}), [('annual_revenue_usd', 'D3'), ('account_type', 'D3')], 'Account type not on the list')
add(base(first_name='Liam', last_name='Carter', company_name='Tasman Fuels', company_domain='tasmanfuels.com.au', country='Australia', city='Geelong'), [], 'Outside the pilot region: account excluded')
add(base(first_name='Wen', last_name='Tay', company_name='Straits Terminal Holdings', company_domain='straitsterminal.sg', managed_separately='Y'), [], 'Managed separately: account excluded')
add(base(first_name='Ramil', last_name='Dela Cruz', company_name='Palawan Oleochem', company_domain='palawanoleo.ph', country='Philippines', city='Puerto Princesa', industry='Oleochemicals', opt_out='Y'), [], 'Every contact opted out: account excluded')
add(base(first_name='Joy', last_name='Bautista', company_name='Palawan Oleochem', company_domain='palawanoleo.ph', country='Philippines', city='Puerto Princesa', industry='Oleochemicals', opt_out='Y'), [], 'Second opted-out contact at the same account')
add(base(first_name='Tuan', last_name='Bui', company_name='Mekong Process Systems', company_domain='mekongprocess.vn', country='Vietnam', city='Can Tho', industry='Industrial services', site_name='', site_process_type=''), [], 'Industry not in the mapping: vertical Other, held for review')
add(base(first_name='Kittipong', last_name='Rat', company_name='Ayutthaya Refining', company_domain='ayutthayarefining.co.th', country='Thailand', city='Ayutthaya'), [], 'First row for an account whose details differ on the next row')
add(base(first_name='Malee', last_name='Srisuk', company_name='Ayutthaya Refining', company_domain='ayutthayarefining.co.th', country='Thailand', city='Ayutthaya', industry='Petrochemicals'), [('industry', 'D3')], 'Industry differs from the first row of the same company')
add(base(first_name='Khanh', last_name='Do', company_name='Saigon Gas Processing', company_domain='saigongas.vn', country='Vietnam', city='Vung Tau', industry='Gas processing', existing_customer='maybe', managed_separately=''), [('existing_customer', 'D3'), ('managed_separately', 'D3')], 'Y/N fields with a bad value and a blank')
add(base(first_name='Ika', last_name='Purnama', company_name='Cirebon Refining', company_domain='cirebonrefining.co.id', country='Indonesia', city='Cirebon', annual_revenue_usd='', employee_count=''), [('annual_revenue_usd / employee_count', 'D3')], 'No company size at all')
add(base(first_name='Hui Min', last_name='Goh', company_name='Lion City Chemicals', company_domain='lioncitychem.sg', country='SG', city='Singapore', industry='Petrochemicals'), [], 'Country as "SG": the region check fails (see note)')

# ---------- TS3: signal edge cases, scored against the TS1 list ----------
TS3 = []
def s3(row, expect, intent): TS3.append((row, expect, intent))
s3(sig('Northgate Refining', P['Northgate Refining'], 'Inquiry or RFQ', '2026-10-12', 'Control: a fresh RFQ'), ('Qualified', ''), 'Control row')
s3(sig('Unknown Petroleum Co', 'x.y@unknownpetroleum.com', 'Inquiry or RFQ', '2026-10-12', 'RFQ from a company not in the list'), ('Rejected', 'D4'), 'Company not in the lead file')
s3(sig('Kestrel Petrochemicals', 'new.person@kestrelpetchem.com', 'Webinar attended', '2026-10-05', 'Someone not in the lead file attended'), ('Rejected', 'D4'), 'Person not in the lead file: suggested as a new contact')
s3(sig('Selatan LNG', P['Selatan LNG'], 'Capital project', '', 'No date given'), ('Rejected', 'D3'), 'No event date')
s3(sig('Tanjung Refinery', P['Tanjung Refinery'], 'Capital project', '12/09/2026', 'Date written day/month/year'), ('Rejected', 'D3'), 'Date not in YYYY-MM-DD form')
s3(sig('Andaman Petrochem', P['Andaman Petrochem'], 'Capital project', '2026-11-30', 'Date after the scoring date'), ('Rejected', 'D3'), 'Future date')
s3(sig('Visayas Gas Processing', P['Visayas Gas Processing'], 'Trade show visit', '2026-10-01', 'Visited the stand at an expo'), ('Rejected', 'D3'), 'Signal type not on the list')
s3(sig('Mekong Delta Refining', P['Mekong Delta Refining'], 'Newsletter sign-up', '2026-10-01', 'Signed up to the newsletter'), ('Rejected', 'D1'), 'Newsletter sign-up does not predict buying')
s3(sig('Java Aromatics', P['Java Aromatics'], 'Email clicked', '2026-05-01', 'Clicked an email in May'), ('Rejected', 'D2'), 'Stale: older than the 60 days an email click counts for')
s3(sig('Lagoon Refining', P['Lagoon Refining'], 'Webinar attended', '2026-10-06', 'First record of the webinar'), ('Qualified', ''), 'Control for the duplicate below')
s3(sig('Lagoon Refining', P['Lagoon Refining'], 'Webinar attended', '2026-10-06', 'Same webinar sent twice'), ('Rejected', 'D5'), 'Duplicate of the row above')
s3(sig('Penang Refining', '', 'Installed system (current)', '2026-09-01', 'Pilot product already installed at Prai', 'Installed base', 'Pilot product'), ('Used for a knock-out', ''), 'Knock-out: the account is excluded in Scoring')
s3(sig('Malacca Olefins', '', 'Content download', '2026-10-10', 'Download with no person named'), ('Qualified', ''), 'No person named: auto-assigned to the primary contact')
s3(sig('Luzon Gas Processing', P['Luzon Gas Processing'], 'webinar ATTENDED', '2026-10-09', 'Type written in mixed case'), ('Qualified', ''), 'Type matched regardless of case')
s3(sig('Chao Phraya Refining', P['Chao Phraya Refining'], 'Leadership change', '2026-10-01', ''), ('Qualified', ''), 'No detail: qualified, why-now line names only the type')
s3(sig('', P['Borneo LNG Partners'], 'Capital project', '2026-10-01', 'Company left blank'), ('Rejected', 'D3'), 'No company name')

# ---------- TS4: a scored-prospects file uploaded straight into Micro-segments & NBA ----------
SEG_COLS = ['first_name', 'last_name', 'job_title', 'email', 'email_verified', 'linkedin_url', 'company_name',
            'industry', 'country', 'existing_customer', 'consent_basis', 'score', 'signal_type', 'event_date', 'detail', 'source', 'owner_email',
            'annual_revenue_usd', 'employee_count', 'account_type']
def seg(first, last, title, company, dom, ind, ctry, score, typ, date, detail, consent='legitimate interest', owner=REPS[1]):
    e = f"{first.lower()}.{last.lower()}@{dom}"
    return [first, last, title, e, 'Y', f'https://www.linkedin.com/in/{first.lower()}-{last.lower()}', company, ind, ctry, 'N', consent,
            score, typ, date, detail, 'CRM', owner, 1200000000, 1500, 'Owner-operator']
TS4 = []
def s4(row, intent): TS4.append((row, intent))
for (f, l, co, dom, ctry) in [('Hakim', 'Yunus', 'Kuantan Refining', 'kuantanrefining.com.my', 'Malaysia'), ('Ploy', 'Narin', 'Chonburi Refining', 'chonburirefining.co.th', 'Thailand'), ('Dimas', 'Arya', 'Balikpapan Refining', 'balikpapanref.co.id', 'Indonesia')]:
    s4(seg(f, l, 'Automation Manager', co, dom, 'Refining', ctry, 72, 'Inquiry or RFQ', '2026-10-14', 'Asked for a quote on a controller upgrade'), 'Inquiry segment (3 accounts): forms')
for (f, l, co, dom, ctry) in [('Arjun', 'Pillai', 'Kemaman Gas', 'kemamangas.com.my', 'Malaysia'), ('Carlo', 'Lim', 'Mindanao Gas Processing', 'mindanaogas.ph', 'Philippines'), ('Long', 'Hoang', 'Nam Con Son Gas', 'namconsongas.vn', 'Vietnam')]:
    s4(seg(f, l, 'Control Systems Engineer', co, dom, 'Gas processing', ctry, '', 'Installed system near end of support', '2026-07-01', 'Control system out of support next year'), 'Modernisation segment (3 accounts), score worked out from the signal')
for (f, l, co, dom, ctry) in [('Siew', 'Lan', 'Johor Aromatics', 'johoraromatics.com.my', 'Malaysia'), ('Arisa', 'Phan', 'Rayong Olefins', 'rayongolefins.co.th', 'Thailand')]:
    s4(seg(f, l, 'I&C Manager', co, dom, 'Petrochemicals', ctry, 55, 'Webinar attended', '2026-10-02', 'Attended the alarm webinar'), 'Engagement: only 2 accounts, so no segment forms; goes to For Review')
s4(seg('Bayu', 'Setiawan', 'Plant Manager', 'Cilacap Refining', 'cilacapref.co.id', 'Refining', 'Indonesia', 140, 'Capital project', '2026-09-15', 'Expansion approved'), 'Score 140 is outside 0 to 100: worked out from the signal instead')
s4(seg('Ana', 'Reyes', 'Automation Lead', 'Subic Refining', 'subicref.ph', 'Refining', 'Philippines', 60, 'Newsletter sign-up', '2026-10-01', 'Newsletter'), 'Newsletter sign-up: rejected (D1)')
s4(seg('Tien', 'Ly', 'DCS Engineer', 'Cam Ranh Refining', 'camranhref.vn', 'Refining', 'Vietnam', 60, 'Email clicked', '2026-04-01', 'Clicked an old email'), 'Stale email click: rejected (D2)')
s4(seg('Mira', 'Halim', 'Automation Manager', 'Port Dickson Refining', 'pdrefining.com.my', 'Refining', 'Malaysia', 65, 'Inquiry or RFQ', '2026-10-11', 'RFQ for a safety system', consent='purchased list'), 'Consent "purchased list" not recognised: kept, call only')

# ---------- TS5: a brand guideline for the Content library ----------
TS5_TEXT = """# Client brand guideline for sales emails (test file)

This file tests what the Content library reads from an uploaded guideline. Lines in the plain forms below are picked up as rules; everything else is kept for people to read.

## Words and names
- Never use: synergy, world-class, game-changing, revolutionary
- Avoid: best-in-class, cutting-edge
- Competitors: Rivalco, Acmetrol
- Do not mention Northstar Controls

## Voice
- Tone: formal
- Never open with: Just checking in, I hope this email finds you well
- No exclamation marks.

## Length
- Keep emails under 110 words.
- Keep sentences under 22 words.

## Sign-off
- Always sign off as: Client Process Automation Team

## Not rules (should not be picked up)
Our customers are refiners and petrochemical producers across Southeast Asia.
Use the approved claims library for any number you quote.
"""
TS5_EXPECT = [('Negative keyword', 'synergy'), ('Negative keyword', 'world-class'), ('Negative keyword', 'game-changing'), ('Negative keyword', 'revolutionary'),
              ('Negative keyword', 'best-in-class'), ('Negative keyword', 'cutting-edge'), ('Competitor', 'Rivalco'), ('Competitor', 'Acmetrol'),
              ('Competitor', 'Northstar Controls'), ('Voice', 'Formal'), ('Banned opener', 'Just checking in'), ('Banned opener', 'I hope this email finds you well'),
              ('Rule', 'No exclamation marks'), ('Email length', '110'), ('Sentence length', '22'), ('Sign-off', 'Client Process Automation Team')]

json.dump({'asOf': AS_OF, 'leadCols': LEAD_COLS, 'sigCols': SIG_COLS, 'segCols': SEG_COLS,
           'ts1': ts1, 'ts1sig': ts1_sig, 'ts2': TS2, 'ts3': TS3, 'ts4': TS4, 'ts5': TS5_TEXT, 'ts5expect': TS5_EXPECT},
          open(sys.argv[1], 'w'), indent=0)
print('rows: ts1', len(ts1), 'ts1sig', len(ts1_sig), 'ts2', len(TS2), 'ts3', len(TS3), 'ts4', len(TS4))
