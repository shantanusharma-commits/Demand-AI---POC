"""Builds a large, realistic test dataset for Lead discovery and research (features 3.1 to 3.6).

Fills the Lead template sheet of the client's workbook with ~8,000 contact rows across
~1,400 fictional accounts, adds a matching Signal template sheet, and writes an answer key
so every injected defect can be checked against what the platform reports.

Every company, person and domain is fictional. The client is referred to as "Client" and
sales reps use client-sample.com, as in demandai-sample-data.js.

Usage: python3 test-data/generate_lead_dataset.py <template.xlsx> <output.xlsx>
"""
import random
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from copy import copy
from datetime import date, timedelta

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

SEED = 20261003
AS_OF = date(2026, 9, 30)  # same scoring date as demandai-sample-data.js
N_ACCOUNTS = 1400
rng = random.Random(SEED)

COLS = ['first_name', 'last_name', 'job_title', 'seniority', 'email', 'email_verified', 'linkedin_url',
        'company_name', 'company_domain', 'country', 'city', 'industry', 'annual_revenue_usd', 'employee_count',
        'account_type', 'existing_customer', 'managed_separately', 'site_name', 'site_process_type', 'site_capacity',
        'capacity_unit', 'consent_basis', 'opt_out', 'owner_email']
SIG_COLS = ['company_name', 'contact_email_or_linkedin', 'signal_type', 'event_date', 'detail', 'source', 'product']
PILOT = ['Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Indonesia', 'Vietnam']


def chance(p):
    return rng.random() < p


def pick(seq, weights=None):
    return rng.choices(seq, weights=weights, k=1)[0] if weights else rng.choice(seq)


def ascii_slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '', s.lower())


# ─── Geography: country → TLD, cities, name pools, reps ───
GEO = {
    'Singapore': dict(tld=['com.sg', 'com'], cities=['Singapore'] * 3 + ['Jurong Island', 'Tuas'],
                      first=['Wei Ming', 'Jun Jie', 'Hui Min', 'Kelvin', 'Shirley', 'Daniel', 'Muhammad Faris', 'Nurul', 'Rajesh', 'Priya',
                             'Melvin', 'Grace', 'Benjamin', 'Siew Ling', 'Arun', 'Farhan', 'Joanne', 'Eugene', 'Cheryl', 'Marcus'],
                      last=['Tan', 'Lim', 'Lee', 'Ng', 'Wong', 'Goh', 'Chua', 'Teo', 'Koh', 'Ong', 'Rahman', 'Kumar', 'Pillai', 'Yeo', 'Chan', 'Sim']),
    'Malaysia': dict(tld=['com.my', 'com'], cities=['Kuala Lumpur', 'Johor Bahru', 'Pengerang', 'Kerteh', 'Bintulu', 'Port Dickson', 'Kuantan', 'Melaka', 'Pasir Gudang', 'Miri', 'Labuan'],
                     first=['Ahmad Faizal', 'Nur Aisyah', 'Hafiz', 'Siti Nurhaliza', 'Mohd Azlan', 'Mei Ling', 'Chee Keong', 'Ganesh', 'Kavitha', 'Farah',
                            'Hassan', 'Aisha', 'Rizal', 'Kok Wai', 'Syafiq', 'Nadia', 'Vincent', 'Suresh', 'Zulkifli', 'Hui Ying'],
                     last=['Ismail', 'Hassan', 'Yusof', 'Razak', 'Idris', 'Aziz', 'Lim', 'Tan', 'Chong', 'Subramaniam', 'Abdullah', 'Rahim', 'Ong', 'Krishnan', 'Hamid', 'Lau']),
    'Thailand': dict(tld=['co.th', 'com'], cities=['Rayong', 'Map Ta Phut', 'Bangkok', 'Sriracha', 'Chonburi', 'Songkhla', 'Saraburi'],
                     first=['Somchai', 'Supachai', 'Nattapong', 'Kanya', 'Siriporn', 'Pornthip', 'Wichai', 'Anong', 'Thanakorn', 'Pimchanok',
                            'Kittipong', 'Apinya', 'Chatchai', 'Ratana', 'Niran', 'Sakda', 'Wanida', 'Phongsak'],
                     last=['Srisuk', 'Charoenkul', 'Wongsawat', 'Thongchai', 'Saelim', 'Rattanakorn', 'Boonmee', 'Kittisak', 'Chaiyaporn', 'Suwannarat',
                           'Prasert', 'Jaidee', 'Sombat', 'Phrommin']),
    'Philippines': dict(tld=['com.ph', 'com'], cities=['Bataan', 'Batangas', 'Manila', 'Makati', 'Cebu', 'Taguig', 'Limay', 'Davao'],
                        first=['Jose', 'Maria', 'Mark Anthony', 'Kristine', 'Jericho', 'Rhea', 'Paolo', 'Angelica', 'Ramon', 'Carmela',
                               'Jun', 'Patricia', 'Miguel', 'Lourdes', 'Christian', 'Joy'],
                        last=['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Villanueva', 'dela Cruz', 'Ramos', 'Aquino',
                              'Castillo', 'Navarro', 'de Leon', 'Fernandez']),
    'Indonesia': dict(tld=['co.id', 'com'], cities=['Jakarta', 'Cilacap', 'Balikpapan', 'Dumai', 'Cilegon', 'Bontang', 'Tuban', 'Surabaya', 'Gresik', 'Plaju', 'Batam'],
                      first=['Budi', 'Agus', 'Dewi', 'Siti', 'Rina', 'Hendra', 'Wahyu', 'Putri', 'Eko', 'Indah', 'Rudi', 'Ayu',
                             'Bambang', 'Fitri', 'Arief', 'Yuliana', 'Dimas', 'Ratna'],
                      last=['Santoso', 'Wijaya', 'Pratama', 'Saputra', 'Hidayat', 'Kusuma', 'Lestari', 'Nugroho', 'Setiawan', 'Gunawan',
                            'Siregar', 'Harahap', 'Purnomo', 'Susanto'],
                      mononym=0.06),
    'Vietnam': dict(tld=['vn', 'com.vn', 'com'], cities=['Ho Chi Minh City', 'Hanoi', 'Vung Tau', 'Dung Quat', 'Nghi Son', 'Ba Ria', 'Hai Phong', 'Quang Ngai'],
                    first=['Linh', 'Minh', 'Thanh', 'Huong', 'Quang', 'Tuan', 'Lan', 'Duc', 'Hoa', 'Khanh', 'Phuong', 'Trung', 'Thao', 'Hieu'],
                    last=['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Phan', 'Vu', 'Dang', 'Bui', 'Do', 'Ngo', 'Duong'],
                    diacritic={'Nguyen': 'Nguyễn', 'Tran': 'Trần', 'Le': 'Lê', 'Pham': 'Phạm', 'Hoang': 'Hoàng', 'Duc': 'Đức',
                               'Huong': 'Hương', 'Phuong': 'Phương', 'Thao': 'Thảo', 'Hieu': 'Hiếu'}),
    # Out of the pilot region
    'Australia': dict(tld=['com.au'], cities=['Brisbane', 'Perth', 'Melbourne', 'Gladstone', 'Karratha'],
                      first=['Tom', 'Sarah', 'Liam', 'Emma', 'Jack', 'Chloe', 'Nathan', 'Megan'], last=['Barker', 'Mitchell', 'Walsh', 'Hughes', 'Fraser', 'Kelly']),
    'India': dict(tld=['co.in', 'com'], cities=['Mumbai', 'Jamnagar', 'Chennai', 'Vadodara', 'Kochi'],
                  first=['Rahul', 'Anjali', 'Vikram', 'Sneha', 'Arjun', 'Deepa', 'Sanjay'], last=['Sharma', 'Iyer', 'Patel', 'Menon', 'Desai', 'Reddy', 'Joshi']),
    'Japan': dict(tld=['co.jp'], cities=['Yokohama', 'Chiba', 'Osaka', 'Kawasaki'],
                  first=['Kenji', 'Yuki', 'Hiroshi', 'Aiko', 'Takeshi', 'Naoko'], last=['Sato', 'Suzuki', 'Takahashi', 'Watanabe', 'Ito', 'Nakamura']),
    'South Korea': dict(tld=['co.kr'], cities=['Ulsan', 'Yeosu', 'Seoul', 'Daesan'],
                        first=['Min-jun', 'Seo-yeon', 'Ji-ho', 'Hye-jin', 'Dong-hyun'], last=['Kim', 'Park', 'Choi', 'Jung', 'Kang']),
    'United Arab Emirates': dict(tld=['ae', 'com'], cities=['Abu Dhabi', 'Ruwais', 'Dubai'],
                                 first=['Ahmed', 'Fatima', 'Khalid', 'Omar', 'Mariam'], last=['Al Mansoori', 'Al Hashimi', 'Al Nuaimi', 'Haddad', 'Saleh']),
    'Saudi Arabia': dict(tld=['com.sa'], cities=['Jubail', 'Yanbu', 'Dammam', 'Riyadh'],
                         first=['Abdullah', 'Faisal', 'Nora', 'Saud', 'Hana'], last=['Al Qahtani', 'Al Ghamdi', 'Al Harbi', 'Al Otaibi']),
    'United States': dict(tld=['com'], cities=['Houston', 'Baton Rouge', 'Corpus Christi', 'Lake Charles'],
                          first=['Michael', 'Jennifer', 'David', 'Ashley', 'Robert', 'Laura'], last=['Johnson', 'Miller', 'Davis', 'Anderson', 'Thompson', 'Clark']),
    'Germany': dict(tld=['de'], cities=['Ludwigshafen', 'Hamburg', 'Leuna', 'Cologne'],
                    first=['Lukas', 'Anna', 'Felix', 'Katrin', 'Jonas'], last=['Müller', 'Schmidt', 'Becker', 'Hoffmann', 'Wagner']),
    'China': dict(tld=['com.cn', 'com'], cities=['Shanghai', 'Ningbo', 'Huizhou', 'Dalian'],
                  first=['Wei', 'Jing', 'Hao', 'Xiu Ying', 'Lei'], last=['Zhang', 'Wang', 'Li', 'Liu', 'Chen']),
    'Taiwan': dict(tld=['com.tw'], cities=['Kaohsiung', 'Mailiao', 'Taipei'],
                   first=['Chia-hao', 'Yi-ting', 'Chun-wei', 'Mei-hua'], last=['Chen', 'Lin', 'Huang', 'Chang']),
}
OUT_REGION = [c for c in GEO if c not in PILOT]

# Reps own territories; one manager mailbox appears as an owner too.
REPS = {
    'Singapore': ['daniel.koh', 'meera.nair'], 'Malaysia': ['aiman.yusof', 'jessica.tan', 'meera.nair'],
    'Thailand': ['pichit.wong', 'natalie.chen'], 'Philippines': ['carlo.reyes', 'natalie.chen'],
    'Indonesia': ['rizky.halim', 'sari.wibowo'], 'Vietnam': ['minh.vo', 'jessica.tan'],
}
OUT_REPS = ['global.desk', 'daniel.koh', 'meera.nair']
REP_DOMAIN = 'client-sample.com'

# ─── Industries: how the industry is held, the site it implies, and whether it is in the ICP ───
# icp: core / adjacent / out. Several 'as held' spellings per vertical, including ones the
# vertical map won't match (they test the classifier's "needs review" path).
IND = {
    'refining': dict(icp='core', held=['Oil & Gas - Refining'] * 4 + ['Refining'] * 3 + ['Petroleum Refining', 'Oil Refining', 'Downstream Oil & Gas', 'Oil & Gas - Downstream', 'Fuels & Lubricants'],
                     suffix=['Refining', 'Refining', 'Refinery Corporation', 'Petroleum', 'Energy', 'Oil Refining'],
                     sites=['{c} Refinery', '{c} Refining Complex'], process=['Crude refining'] * 5 + ['Hydrocracking', 'Lube base oil refining', 'Residue upgrading', 'Condensate splitting'],
                     cap=(25000, 420000, 'barrels/day', 1000), types=['Owner-operator'] * 9 + ['Other']),
    'petrochem': dict(icp='adjacent', held=['Petrochemicals'] * 4 + ['Chemicals - Petrochemicals', 'Petrochemical', 'Olefins & Polymers', 'Basic Chemicals', 'Plastics & Polymers'],
                      suffix=['Petrochem', 'Petrochemicals', 'Polymers', 'Olefins', 'Aromatics', 'Chemicals'],
                      sites=['{c} Plant', '{c} Petrochemical Complex', '{c} Cracker'], process=['Petrochemicals, continuous'] * 3 + ['Olefins cracking', 'Polypropylene production', 'Aromatics (BTX)', 'PTA production', 'Polyethylene production'],
                      cap=(80000, 1600000, 'tonnes/year', 10000), types=['Owner-operator'] * 9 + ['Other']),
    'gas': dict(icp='adjacent', held=['Gas processing'] * 3 + ['Oil & Gas - Gas Processing', 'LNG', 'Oil & Gas - LNG', 'Natural Gas', 'Midstream Gas'],
                suffix=['Gas Processing', 'Gas', 'LNG', 'Gas Ventures', 'Midstream'],
                sites=['{c} Gas Plant', '{c} LNG Terminal', '{c} Gas Processing Plant'], process=['Gas processing'] * 3 + ['LNG liquefaction', 'LNG regasification', 'Gas separation'],
                cap=(80, 2400, 'MMscfd', 10), types=['Owner-operator'] * 9 + ['Other']),
    'upstream': dict(icp='out', held=['Oil & Gas - Upstream', 'Exploration & Production', 'Oil & Gas'],
                     suffix=['Exploration', 'Offshore', 'Petroleum E&P', 'Energy Resources'],
                     sites=['{c} Offshore Field', '{c} Production Platform'], process=['Offshore production', 'Oil & gas production'],
                     cap=(5000, 150000, 'barrels of oil equivalent/day', 500), types=['Owner-operator']),
    'specialty': dict(icp='out', held=['Specialty Chemicals', 'Chemicals', 'Fine Chemicals', 'Agrochemicals'],
                      suffix=['Chemicals', 'Specialty Chemicals', 'Chemical Industries', 'Coatings'],
                      sites=['{c} Plant', '{c} Chemical Works'], process=['Specialty chemicals, batch', 'Batch chemicals', 'Coatings & resins', 'Agrochemical formulation'],
                      cap=(5000, 120000, 'tonnes/year', 1000), types=['Owner-operator']),
    'oleo': dict(icp='out', held=['Oleochemicals', 'Palm Oil Refining', 'Edible Oils'],
                 suffix=['Oleochem', 'Oleo', 'Palm Products', 'Agri Industries'],
                 sites=['{c} Oleochemical Plant', '{c} Palm Oil Refinery'], process=['Oleochemicals', 'Palm oil refining', 'Fatty acid distillation'],
                 cap=(50000, 900000, 'tonnes/year', 5000), types=['Owner-operator']),
    'power': dict(icp='out', held=['Power Generation', 'Utilities - Power', 'Energy - Power'],
                  suffix=['Power', 'Power Generation', 'Energy', 'Generation'],
                  sites=['{c} Power Station', '{c} Combined Cycle Plant'], process=['Combined cycle gas turbine', 'Coal-fired power', 'Biomass power'],
                  cap=(50, 2400, 'MW', 10), types=['Owner-operator']),
    'pulp': dict(icp='out', held=['Pulp & Paper', 'Paper & Packaging'], suffix=['Paper', 'Pulp & Paper', 'Packaging'],
                 sites=['{c} Mill'], process=['Pulp & paper, continuous', 'Tissue paper'], cap=(100000, 2500000, 'tonnes/year', 10000), types=['Owner-operator']),
    'fnb': dict(icp='out', held=['Food & Beverage', 'Food Manufacturing', 'Beverages'], suffix=['Foods', 'Beverages', 'Dairy', 'Breweries'],
                sites=['{c} Factory', '{c} Brewery'], process=['Food processing, batch', 'Brewing', 'Dairy processing'], cap=(5000, 150000, 'tonnes/year', 1000), types=['Owner-operator']),
    'pharma': dict(icp='out', held=['Pharmaceuticals', 'Life Sciences'], suffix=['Pharma', 'Life Sciences', 'Biologics'],
                   sites=['{c} API Plant', '{c} Biologics Facility'], process=['Pharmaceutical, batch', 'Biologics manufacturing'], cap=(50, 5000, 'tonnes/year', 10), types=['Owner-operator']),
    'water': dict(icp='out', held=['Water & Wastewater', 'Utilities - Water'], suffix=['Water', 'Water Services', 'Utilities'],
                  sites=['{c} Water Treatment Plant', '{c} Desalination Plant'], process=['Water treatment', 'Desalination'], cap=(20, 900, 'MLD', 5), types=['Owner-operator']),
    'mining': dict(icp='out', held=['Mining & Metals', 'Metals - Steel', 'Cement'], suffix=['Mining', 'Steel', 'Cement', 'Metals', 'Nickel'],
                   sites=['{c} Smelter', '{c} Cement Plant', '{c} Steel Works'], process=['Nickel smelting', 'Cement, kiln', 'Steelmaking'], cap=(200000, 6000000, 'tonnes/year', 50000), types=['Owner-operator']),
    'marine': dict(icp='out', held=['Marine Services', 'Shipping & Logistics', 'Shipbuilding'], suffix=['Marine', 'Shipyard', 'Offshore Services', 'Logistics'],
                   sites=[], process=[], cap=None, types=['Other']),
    'epc': dict(icp='influencer', held=['Engineering services'] * 3 + ['Engineering & Construction', 'EPC', 'Construction'],
                suffix=['EPC', 'Engineering', 'Engineering & Construction', 'Projects', 'Constructors'],
                sites=[], process=[], cap=None, types=['EPC contractor'] * 8 + ['Other', 'System integrator']),
    'si': dict(icp='influencer', held=['Industrial automation', 'Systems Integration', 'Automation & Controls', 'Electrical & Instrumentation'],
               suffix=['Automation', 'Process Systems', 'Controls', 'Integration', 'Systems'],
               sites=[], process=[], cap=None, types=['System integrator'] * 8 + ['Other']),
    'dist': dict(icp='out', held=['Industrial Distribution', 'Trading', 'Instrumentation Distribution', 'Wholesale - Industrial'],
                 suffix=['Trading', 'Supply', 'Industrial Supplies', 'Instruments', 'Technical Sales'],
                 sites=[], process=[], cap=None, types=['Distributor'] * 9 + ['Other']),
}
IND_WEIGHTS_PILOT = dict(refining=17, petrochem=17, gas=11, upstream=5, specialty=7, oleo=5, power=5, pulp=2, fnb=3, pharma=2, water=2,
                         mining=3, marine=3, epc=9, si=6, dist=5)
IND_WEIGHTS_OUT = dict(refining=30, petrochem=25, gas=15, specialty=8, epc=10, power=5, si=4, dist=3)

# ─── Company names: invented two-part names, checked unique ───
NAME_A = ['Northwind', 'Meridian', 'Coral Bay', 'Andaman', 'Straits', 'Sunda', 'Mekong', 'Borneo', 'Lotus', 'Harbourline', 'Kestrel', 'Tamarind',
          'Celebes', 'Banyan', 'Monsoon', 'Equator', 'Archipelago', 'Sulu', 'Cendana', 'Halcyon', 'Orchid', 'Teakwood', 'Nusa', 'Crescent', 'Bluewater',
          'Silverleaf', 'Redcliff', 'Ironbark', 'Saltmarsh', 'Pelican', 'Kingfisher', 'Hornbill', 'Ember', 'Palmyra', 'Cinnabar', 'Jadeport', 'Seabreeze',
          'Riverstone', 'Summit', 'Lantern', 'Tideway', 'Granite', 'Amber', 'Cobalt', 'Vantage', 'Zenith', 'Pinnacle', 'Horizon', 'Lighthouse', 'Mangrove',
          'Rainforest', 'Typhoon', 'Volcano Ridge', 'Southern Cross', 'East Gate', 'Westport', 'Twin River', 'Golden Delta', 'Red River', 'Pearl Coast',
          'Emerald Bay', 'Sapphire', 'Topaz', 'Garnet', 'Onyx', 'Basalt', 'Juniper', 'Cypress', 'Magnolia', 'Frangipani', 'Rambutan', 'Durian Coast',
          'Mahakam', 'Kapuas', 'Chao Phraya', 'Tonle', 'Sarawak Ridge', 'Kinabalu', 'Selat', 'Malacca Gate', 'Bintang', 'Tanjung', 'Pulau', 'Laguna',
          'Visayas', 'Mindoro', 'Palawan Coast', 'Halong', 'Annam', 'Siam Bay', 'Isthmus', 'Kra', 'Lombok', 'Flores', 'Komodo', 'Raja', 'Garuda Ridge',
          'Merlion Bay', 'Clearwater', 'Stonebridge', 'Oakridge', 'Brightwater', 'Falcon', 'Osprey', 'Heron', 'Ibis', 'Egret', 'Cormorant', 'Albatross']
NAME_B = ['', '', '', '', '', 'Asia', 'Pacific', 'Eastern', 'Southern', 'United', 'National', 'Global', 'Allied', 'Integrated', 'Consolidated', 'Premier', 'First']
LEGAL = {'Singapore': ['Pte Ltd'], 'Malaysia': ['Sdn Bhd', 'Berhad'], 'Thailand': ['Co., Ltd.', 'Public Company Limited'], 'Philippines': ['Inc.', 'Corporation'],
         'Indonesia': ['PT', 'Tbk'], 'Vietnam': ['JSC', 'Co., Ltd.'], 'Australia': ['Pty Ltd'], 'India': ['Pvt Ltd', 'Limited'], 'Japan': ['K.K.', 'Co., Ltd.'],
         'South Korea': ['Co., Ltd.'], 'United Arab Emirates': ['LLC', 'PJSC'], 'Saudi Arabia': ['Company'], 'United States': ['Inc.', 'LLC'], 'Germany': ['GmbH', 'AG'],
         'China': ['Co., Ltd.'], 'Taiwan': ['Corp.']}

used_names, used_domains = set(), set()


def company_name(ind):
    for _ in range(200):
        a, b, s = pick(NAME_A), pick(NAME_B), pick(IND[ind]['suffix'])
        n = ' '.join(x for x in [a, b, s] if x)
        if n.lower() not in used_names:
            used_names.add(n.lower())
            return n
    raise RuntimeError('ran out of names')


def domain_for(name, country):
    words = [w for w in re.split(r'[^A-Za-z]+', name) if w and w not in ('PT', 'Pte', 'Ltd', 'Sdn', 'Bhd', 'Berhad', 'and')]
    lead = [w for w in words if w not in NAME_B] or words
    tld = pick(GEO[country]['tld'])
    head = ''.join(lead[:-1]).lower() if len(lead) > 1 else lead[0].lower()
    tail = lead[-1].lower() if len(lead) > 1 else ''
    opts = [head + tail, f'{head}-{tail}' if tail else head, head, head + 'group', head + 'asia']
    if len(lead) > 2:
        opts.append(''.join(w[0] for w in lead[:-1]).lower() + tail)
    rng.shuffle(opts)
    opts.sort(key=lambda o: len(o) > 18)  # prefer short domains, as real ones are
    for o in opts + [head + tail + str(rng.randint(2, 99))]:
        d = f'{o.strip("-")}.{tld}'
        if len(o) >= 4 and d not in used_domains:
            used_domains.add(d)
            return d
    raise RuntimeError(name)


# ─── Roles: title, seniority, persona weight ───
TITLES = [  # (title, seniority, weight)
    ('Head of Instrumentation', 'Director', 5), ('Instrumentation Manager', 'Manager', 6), ('Senior Instrument Engineer', 'Engineer', 6),
    ('Instrument Engineer', 'Engineer', 6), ('I&C Manager', 'Manager', 4), ('I&C Engineer', 'Engineer', 4), ('E&I Superintendent', 'Manager', 3),
    ('Head of Automation', 'Director', 3), ('Automation Manager', 'Manager', 4), ('Automation Engineer', 'Engineer', 4),
    ('Control Systems Lead', 'Manager', 4), ('Control Systems Engineer', 'Engineer', 5), ('DCS Engineer', 'Engineer', 3),
    ('Process Control Engineer', 'Engineer', 4), ('Advanced Process Control Lead', 'Manager', 2), ('OT Cybersecurity Lead', 'Manager', 2),
    ('Plant Manager', 'Director', 4), ('General Manager, Operations', 'Director', 2), ('Operations Director', 'Director', 3), ('Operations Manager', 'Manager', 4),
    ('Shift Superintendent', 'Manager', 2), ('Maintenance Manager', 'Manager', 5), ('Head of Maintenance', 'Director', 2), ('Reliability Engineer', 'Engineer', 4),
    ('Reliability Manager', 'Manager', 2), ('Procurement Lead', 'Manager', 3), ('Procurement Manager', 'Manager', 3), ('Category Manager, MRO', 'Manager', 2),
    ('Project Director', 'Director', 3), ('Project Manager', 'Manager', 4), ('Engineering Manager', 'Manager', 3), ('Technical Director', 'Director', 2),
    ('VP Operations', 'VP', 1), ('VP Engineering', 'VP', 1), ('Chief Operating Officer', 'C-level', 1), ('Managing Director', 'C-level', 1),
    ('Chief Executive Officer', 'C-level', 1), ('Chief Technology Officer', 'C-level', 1),
    # not matched to a persona
    ('HSE Manager', 'Manager', 2), ('Process Safety Engineer', 'Engineer', 2), ('Finance Manager', 'Manager', 1), ('HR Business Partner', 'Manager', 1),
    ('Marketing Executive', 'Staff', 1), ('Business Development Manager', 'Manager', 2), ('Sales Engineer', 'Engineer', 1), ('IT Manager', 'Manager', 2),
    ('Digital Transformation Lead', 'Manager', 2), ('Process Engineer', 'Engineer', 3), ('Mechanical Engineer', 'Engineer', 2), ('Graduate Engineer', 'Staff', 1),
    ('Executive Assistant', 'Staff', 1), ('Planner', 'Staff', 1),
]
SI_TITLES = [('Managing Director', 'C-level', 2), ('Technical Director', 'Director', 2), ('Project Manager', 'Manager', 4), ('Automation Engineer', 'Engineer', 5),
             ('Control Systems Engineer', 'Engineer', 4), ('Sales Manager', 'Manager', 3), ('Head of Engineering', 'Director', 2), ('Bid Manager', 'Manager', 2),
             ('Instrumentation Lead', 'Manager', 3), ('Procurement Manager', 'Manager', 2), ('Project Director', 'Director', 3), ('Lead E&I Engineer', 'Engineer', 3)]
DIST_TITLES = [('Sales Manager', 'Manager', 4), ('Product Manager', 'Manager', 3), ('Managing Director', 'C-level', 2), ('Account Executive', 'Staff', 3),
               ('Sales Engineer', 'Engineer', 3), ('Purchasing Executive', 'Staff', 2), ('Operations Manager', 'Manager', 2)]

CONSENT_OK = ['Legitimate interest', 'Existing customer', 'Opted in']


def size_for(ind, managed, out_region):
    """Revenue (USD) and employees, loosely correlated; some accounts are small."""
    big = managed or (ind in ('refining', 'petrochem', 'gas', 'upstream', 'mining') and chance(0.15))
    if ind in ('dist', 'si'):
        rev = rng.randint(4, 220) * 1_000_000
    elif ind in ('marine', 'fnb', 'pharma', 'water'):
        rev = rng.randint(20, 1500) * 1_000_000
    elif big:
        rev = rng.randint(2000, 24000 if managed else 12000) * 1_000_000
    else:
        rev = int(rng.lognormvariate(20.4, 1.0)) // 1_000_000 * 1_000_000
        cap = 9_000_000_000 if ind in ('refining', 'petrochem', 'gas', 'upstream', 'mining') else 2_500_000_000
        rev = max(15_000_000, min(rev, cap))
    emp = min(45000, max(25, int(rev / rng.uniform(300_000, 1_200_000)) // 10 * 10))
    return rev, emp


# ─── Build clean accounts and contacts ───
accounts = []
for i in range(N_ACCOUNTS):
    out_region = chance(0.11)
    country = pick(OUT_REGION) if out_region else pick(PILOT, [14, 22, 18, 13, 20, 13])
    ind = pick(list(IND_WEIGHTS_OUT), list(IND_WEIGHTS_OUT.values())) if out_region else pick(list(IND_WEIGHTS_PILOT), list(IND_WEIGHTS_PILOT.values()))
    spec = IND[ind]
    name = company_name(ind)
    if country in ('Singapore', 'Malaysia') and chance(0.10):
        name = f'{name} {pick(LEGAL[country])}'
    if country == 'Indonesia' and chance(0.10):
        name = f'PT {name}'
    dom = domain_for(name.replace('PT ', '').replace('Pte Ltd', '').replace('Sdn Bhd', '').replace('Berhad', ''), country)
    geo = GEO[country]
    city = pick(geo['cities'])
    # national-oil-company style accounts are handled by a separate team
    managed = ind in ('refining', 'petrochem', 'gas', 'upstream') and chance(0.07)
    rev, emp = size_for(ind, managed, out_region)
    acct_type = pick(spec['types'])
    existing = chance(0.30 if ind in ('refining', 'petrochem', 'gas') else 0.15)
    site = proc = cap = unit = ''
    if spec['sites'] and chance(0.82):
        site = pick(spec['sites']).format(c=city)
        proc = pick(spec['process'])
        lo, hi, unit, step = spec['cap']
        cap = rng.randint(lo // step, hi // step) * step
    if out_region:
        owner = pick(OUT_REPS)
    else:
        owner = pick(REPS[country])
    accounts.append(dict(
        idx=i, name=name, domain=dom, country=country, city=city, ind=ind, industry=pick(spec['held']), revenue=rev, employees=emp,
        account_type=acct_type, existing='Y' if existing else 'N', managed='Y' if managed else 'N', site=site, process=proc, capacity=cap,
        unit=unit, owner=f'{owner}@{REP_DOMAIN}', out_region=out_region, icp=spec['icp'], tags=set(), contacts=[]))

# Some accounts report revenue only, some employees only
for a in accounts:
    r = rng.random()
    if r < 0.12:
        a['revenue'] = ''
    elif r < 0.17:
        a['employees'] = ''


def email_local(first, last, pattern):
    f, l = ascii_slug(first), ascii_slug(last)
    return {'first.last': f'{f}.{l}', 'flast': f'{f[0]}{l}', 'first': f, 'firstl': f'{f}{l[:1]}', 'f.last': f'{f[0]}.{l}',
            'first_last': f'{f}_{l}', 'last.first': f'{l}.{f}'}[pattern]


used_people = set()
for a in accounts:
    geo = GEO[a['country']]
    n = max(1, min(18, int(rng.lognormvariate(1.55, 0.6))))
    if a['ind'] == 'dist':
        n = min(n, 4)
    titles = SI_TITLES if a['ind'] in ('epc', 'si') else DIST_TITLES if a['ind'] == 'dist' else TITLES
    pattern = pick(['first.last'] * 6 + ['flast', 'first', 'firstl', 'f.last', 'first_last', 'last.first'])
    consent_default = 'Existing customer' if a['existing'] == 'Y' and chance(0.8) else 'Legitimate interest'
    for _ in range(n):
        for _ in range(50):
            first, last = pick(geo['first']), pick(geo['last'])
            if (a['idx'], first, last) not in used_people:
                break
        used_people.add((a['idx'], first, last))
        title, seniority, _w = rng.choices(titles, weights=[t[2] for t in titles])[0]
        local = email_local(first, last, pattern)
        slug = f"{ascii_slug(first)}-{re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', last).encode('ascii', 'ignore').decode().lower()).strip('-')}"
        has_email = chance(0.90)
        has_li = chance(0.80) or not has_email
        c = dict(first_name=first, last_name=last, job_title=title, seniority=seniority if chance(0.9) else '',
                 email=f'{local}@{a["domain"]}' if has_email else '',
                 email_verified=('Y' if chance(0.82) else 'N') if has_email else '',
                 linkedin_url=f'https://www.linkedin.com/in/{slug}-{rng.randint(10, 9999):x}' if has_li else '',
                 consent_basis='Opted in' if chance(0.06) else consent_default,
                 opt_out='Y' if chance(0.035) else 'N', tags=[], acct=a)
        # Vietnamese contacts are sometimes written with diacritics, as exported from local CRMs
        if a['country'] == 'Vietnam' and chance(0.25):
            c['last_name'] = geo['diacritic'].get(last, last)
            c['first_name'] = geo['diacritic'].get(first, first)
        a['contacts'].append(c)

# Accounts where everyone has opted out (fails "at least one contact left after suppression")
for a in rng.sample([a for a in accounts if not a['out_region'] and len(a['contacts']) <= 3], 12):
    for c in a['contacts']:
        c['opt_out'] = 'Y'
    a['tags'].add('ACC-ALL-OPTED-OUT')

# ─── Defect injection ───
# Each injected problem gets a test-case id; the key sheet lists them per row with the expected result.
CATALOG = {}


def case(cid, category, step, description, expected, code):
    CATALOG[cid] = dict(id=cid, category=category, step=step, description=description, expected=expected, code=code, count=0)


case('MF-FIRST', 'Missing fields', '3.2', 'first_name blank', 'Loaded; flagged "First name is missing"; greeting needs editing', 'D3')
case('MF-LAST', 'Missing fields', '3.2', 'last_name blank (incl. Indonesian single-name contacts)', 'Loaded; flagged "Last name is missing"', 'D3')
case('MF-TITLE', 'Missing fields', '3.2', 'job_title blank', 'Loaded; persona set to none', 'D3')
case('MF-COMPANY', 'Missing fields', '3.2', 'company_name blank', 'Row NOT loaded (stop): cannot be grouped into an account', 'D3')
case('MF-DOMAIN', 'Missing fields', '3.2', 'company_domain blank', 'Loaded; signals matched by company name only', 'D3')
case('MF-COUNTRY', 'Missing fields', '3.2', 'country blank', 'Flagged; account fails the region check if it is the account\'s first row', 'D3')
case('MF-INDUSTRY', 'Missing fields', '3.2', 'industry blank', 'Flagged; vertical set to Other, held for review', 'D3')
case('MF-SIZE', 'Missing fields', '3.2', 'Both annual_revenue_usd and employee_count blank', 'Flagged "No company size"; size scores 0', 'D3')
case('MF-CHANNEL', 'Missing fields', '3.2', 'No email and no LinkedIn URL', 'Kept on the account, not contactable', 'D3')
case('MF-EXISTING', 'Missing fields', '3.2', 'existing_customer blank', 'Treated as N; flagged', 'D3')
case('MF-MANAGED', 'Missing fields', '3.2', 'managed_separately blank', 'Treated as N; confirm before outreach', 'D3')
case('MF-CONSENT', 'Missing fields', '3.6', 'consent_basis blank', 'Not contactable (no consent basis)', 'D3')
case('MF-OPTOUT', 'Missing fields', '3.6', 'opt_out blank', 'Not contactable: opt-out not confirmed', 'D3')
case('MF-OWNER', 'Missing fields', '3.2', 'owner_email blank', 'Only the sales manager sees the account', 'D3')
case('MF-ACCTTYPE', 'Missing fields', '3.2', 'account_type blank (recommended field)', 'Info; scores 0 for account type', '—')
case('MF-VERIFIED', 'Missing fields', '3.2', 'email present, email_verified blank', 'Email not used as a channel', '—')

case('DUP-EXACT', 'Duplicates', '3.2', 'Exact repeat of an earlier row (re-export / list merge)', 'Merged into the earlier row', 'D5')
case('DUP-EMAIL-CASE', 'Duplicates', '3.2', 'Same email in different case / with spaces, other fields slightly different', 'Detected as duplicate after normalising; merged', 'D5')
case('DUP-LINKEDIN', 'Duplicates', '3.2', 'Same LinkedIn profile (http vs https, trailing slash, query string), different or no email', 'Detected as duplicate by LinkedIn; merged', 'D5')
case('DUP-UPDATED', 'Duplicates', '3.2', 'Same person re-exported later with a new title and blanks filled', 'Merged; blanks on the first row filled from the repeat', 'D5')
case('DUP-FUZZY', 'Duplicates', '3.2', 'Same person, different email alias (a.rao@ vs aditi.rao@) and no LinkedIn: not an exact key match', 'Not caught by exact-key matching; candidate for fuzzy matching (name + company)', 'D5 (fuzzy)')
case('DUP-ACCOUNT-VARIANT', 'Duplicates', '3.2', 'Company written differently on some rows (legal suffix, case, "&" vs "and") with the same domain', 'Split into two accounts by name; should be merged by domain', 'D5 (account)')
case('DUP-CROSS-COMPANY', 'Duplicates', '3.2', 'Same person listed under two companies (moved jobs / EPC on owner project)', 'Second row merged by email; account attribution needs review', 'D5')

case('EM-NO-AT', 'Invalid emails', '3.2', 'Email with no @', 'Flagged malformed; email not used', 'D3')
case('EM-DOUBLE-AT', 'Invalid emails', '3.2', 'Email with two @', 'Flagged malformed', 'D3')
case('EM-NO-TLD', 'Invalid emails', '3.2', 'Email domain has no TLD (name@company)', 'Flagged malformed', 'D3')
case('EM-SPACE', 'Invalid emails', '3.2', 'Space inside the address', 'Flagged malformed', 'D3')
case('EM-DOUBLE-DOT', 'Invalid emails', '3.2', 'Consecutive dots (name@company..com, name..x@)', 'Should be flagged; a simple regex lets it through', 'D3')
case('EM-TRAILING-DOT', 'Invalid emails', '3.2', 'Trailing dot or comma (name@company.com.)', 'Should be flagged', 'D3')
case('EM-BAD-CHAR', 'Invalid emails', '3.2', 'Illegal characters / mailto: prefix / angle brackets', 'Should be flagged', 'D3')
case('EM-PLACEHOLDER', 'Invalid emails', '3.2', 'Placeholder text (n/a, -, none, TBC, unknown)', 'Flagged malformed', 'D3')
case('EM-PERSONAL', 'Invalid emails', '3.2', 'Personal webmail (gmail/yahoo/outlook) instead of work email', 'Syntactically valid; should be flagged as not a work email', 'D3 (rule gap)')
case('EM-DOMAIN-MISMATCH', 'Invalid emails', '3.2', 'Email domain differs from company_domain (old domain, typo, agency)', 'Should be flagged for review', 'D3 (rule gap)')
case('EM-ROLE', 'Invalid emails', '3.2', 'Role mailbox (info@, sales@, procurement@) instead of a person', 'Should be flagged: not a personal contact', 'D3 (rule gap)')
case('EM-TYPO-DOMAIN', 'Invalid emails', '3.2', 'Domain typo (.con, .co instead of .com, gmial)', 'Should be flagged', 'D3 (rule gap)')
case('EM-UNVERIFIED', 'Invalid emails', '3.2', 'Valid email, email_verified = N', 'Info; email not used as a channel', '—')

case('FMT-YN', 'Format', '3.1', 'Y/N fields written as Yes/No/y/n', 'Accepted (Yes/No normalised to Y/N)', '—')
case('FMT-YN-BAD', 'Format', '3.1', 'Y/N fields written as TRUE, 1, X, Verified, Unknown', 'Flagged "isn\'t Y or N"', 'D3')
case('FMT-NUMBER', 'Format', '3.1', 'Revenue/employees with commas, $ or USD', 'Read after stripping; flagged to reformat', 'D3')
case('FMT-NUMBER-BAD', 'Format', '3.1', 'Revenue/employees as text (2.4B, ~500, 1-5k, approx. 3000)', 'Flagged "isn\'t a number"; treated as not provided', 'D3')
case('FMT-DOMAIN', 'Format', '3.1', 'Domain as URL (https://www.x.com/), with path, or without a dot', 'Flagged; domain not used for matching', 'D3')
case('FMT-LINKEDIN', 'Format', '3.1', 'LinkedIn URL that is not a profile (company page, Sales Navigator, search, bare text)', 'Flagged; LinkedIn not used', 'D3')
case('FMT-ACCTTYPE', 'Format', '3.1', 'account_type not on the list (Owner operator, EPC, OEM, End user, Reseller)', 'Treated as Other; flagged', 'D3')
case('FMT-CONSENT', 'Format', '3.6', 'consent_basis not a recognised basis (Implied, GDPR consent, Opt-in, Contract, Trade show)', 'Not contactable until confirmed', 'D3')
case('FMT-COUNTRY', 'Format', '3.1', 'Country as ISO code / variant spelling / typo (SG, MY, Viet Nam, Phillipines, Kingdom of Thailand)', 'Fails the region check by exact match; should be normalised', 'D1 (region) / normalisation gap')
case('FMT-WHITESPACE', 'Format', '3.1', 'Leading/trailing spaces, double spaces, ALL CAPS or lower-case names', 'Trimmed; values still match', '—')
case('FMT-OWNER', 'Format', '3.2', 'owner_email not an email (a rep\'s name, initials)', 'Flagged; only the sales manager sees the account', 'D3')
case('FMT-INCONSISTENT', 'Format', '3.2', 'Company details differ between rows of the same company (revenue, industry, country, type)', 'Flagged "Differs from row N"; first row\'s value used', 'D3')
case('FMT-TITLE-NOISE', 'Format', '3.4', 'Job title in local language, abbreviation or with noise (Mgr., Sr., Inst. & Ctrl, Kepala Instrumentasi)', 'Persona may be missed; test persona matching', '—')
case('FMT-ENCODING', 'Format', '3.1', 'Non-ASCII names (diacritics, umlauts), mojibake', 'Loaded unchanged; check display and email slugging', '—')

case('ICP-REGION', 'Out-of-ICP', '3.5', 'Account outside the pilot region', 'Account excluded: outside the pilot region', 'D1')
case('ICP-MANAGED', 'Out-of-ICP', '3.5', 'managed_separately = Y (key account / national oil company)', 'Account excluded: managed separately', 'D1')
case('ICP-INDUSTRY', 'Out-of-ICP', '3.4', 'Industry outside the pilot vertical and adjacencies (power, F&B, pharma, mining...)', 'Classified Other / low confidence; likely below the fit floor', 'D1')
case('ICP-INDUSTRY-UNMAPPED', 'Out-of-ICP', '3.4', 'In-ICP business held under an unmapped industry label (Downstream Oil & Gas, Fuels & Lubricants, Natural Gas)', 'No lookup match: held for the classifier / review', '—')
case('ICP-DISTRIBUTOR', 'Out-of-ICP', '3.4', 'Distributor / reseller account', 'Scores 20 on account type; usually below the fit floor', 'D1')
case('ICP-SMALL', 'Out-of-ICP', '3.4', 'Company below the size bands (< USD 250m and < 1,000 employees)', 'Size scores 0; may fall below the fit floor', 'D1')
case('ICP-INSTALLED', 'Out-of-ICP', '3.5', 'Pilot product already installed (Installed system (current) signal)', 'Account excluded in Scoring; logged as knock-out', 'D1')
case('ACC-ALL-OPTED-OUT', 'Suppression', '3.6', 'Every contact at the account has opted out', 'Account excluded: no contacts left after suppression', 'D1')
case('SUP-OPTOUT', 'Suppression', '3.6', 'Contact opted out (opt_out = Y)', 'Suppressed: never contacted', '—')
case('SUP-OPTOUT-CONFLICT', 'Suppression', '3.6', 'opt_out = Y but consent_basis = Opted in', 'Opt-out wins; suppressed; flag the conflict', '—')
case('ICP-PERSONA-NONE', 'Out-of-ICP', '3.4', 'Contact title matches no buying persona (HR, finance, marketing...)', 'Persona none; contact ranks last', '—')

# Signal file cases
case('SIG-QUALIFIED', 'Signals', '3.1', 'Valid, recent, known type, person named', 'Qualified and weighted', '—')
case('SIG-AUTOASSIGN', 'Signals', '3.1', 'No person named', 'Attached to the primary-persona contact; flagged auto-assigned', '—')
case('SIG-KNOCKOUT', 'Signals', '3.5', 'Installed system (current)', 'Used for a knock-out: account excluded', 'D1')
case('SIG-NEWSLETTER', 'Signals', '3.2', 'Newsletter sign-up', 'Rejected: does not predict buying', 'D1')
case('SIG-STALE', 'Signals', '3.3', 'Event older than its type\'s window', 'Rejected as stale', 'D2')
case('SIG-NO-COMPANY', 'Signals', '3.2', 'company_name blank', 'Rejected', 'D3')
case('SIG-UNKNOWN-COMPANY', 'Signals', '3.2', 'Company not in the lead file', 'Rejected: not in the target universe', 'D4')
case('SIG-NAME-VARIANT', 'Signals', '3.2', 'Company written differently from the lead file (Pte Ltd, case, abbreviation)', 'Rejected D4 unless names are normalised', 'D4')
case('SIG-UNKNOWN-PERSON', 'Signals', '3.2', 'Person not in the lead file for that account', 'Rejected; suggested as a new contact', 'D4')
case('SIG-NO-DATE', 'Signals', '3.2', 'event_date blank', 'Rejected', 'D3')
case('SIG-BAD-DATE', 'Signals', '3.2', 'Date not YYYY-MM-DD (18/09/2026, Sept 2026, 2026-02-30)', 'Rejected', 'D3')
case('SIG-FUTURE', 'Signals', '3.2', 'Date after the scoring date', 'Rejected', 'D3')
case('SIG-BAD-TYPE', 'Signals', '3.2', 'Signal type not on the list (Trade show visit, Website visit, Price request)', 'Rejected', 'D3')
case('SIG-TYPE-CASE', 'Signals', '3.1', 'Known type in different case (webinar attended, CAPITAL PROJECT)', 'Accepted; type normalised', '—')
case('SIG-DUP', 'Signals', '3.2', 'Same event repeated (same account, person, type, date)', 'Rejected as duplicate', 'D5')
case('SIG-NO-DETAIL', 'Signals', '3.2', 'detail blank', 'Qualified; why-now line can only name the type', '—')
case('SIG-OPTED-OUT-PERSON', 'Signals', '3.6', 'Signal names a contact who opted out', 'Signal kept for the account; person never contacted', '—')
case('SIG-EXCLUDED-ACCOUNT', 'Signals', '3.5', 'Signal on an account excluded by region / managed separately', 'Qualified but not used: account excluded', '—')


def tag(c, cid):
    c['tags'].append(cid)


# Account-level out-of-ICP tags
SMALL = lambda a: (a['revenue'] == '' or a['revenue'] < 250e6) and (a['employees'] == '' or a['employees'] < 1000) and not (a['revenue'] == '' and a['employees'] == '')
for a in accounts:
    if a['out_region']:
        a['tags'].add('ICP-REGION')
    if a['managed'] == 'Y':
        a['tags'].add('ICP-MANAGED')
    if a['icp'] == 'out' and a['ind'] != 'dist':
        a['tags'].add('ICP-INDUSTRY')
    if a['ind'] == 'dist' or a['account_type'] == 'Distributor':
        a['tags'].add('ICP-DISTRIBUTOR')
    if a['industry'] in ('Downstream Oil & Gas', 'Oil & Gas - Downstream', 'Fuels & Lubricants', 'Natural Gas', 'Midstream Gas', 'Basic Chemicals',
                         'Plastics & Polymers', 'Olefins & Polymers', 'Oil & Gas - LNG', 'LNG') and a['icp'] in ('core', 'adjacent'):
        # "LNG" matches the map; the rest don't
        if not re.search(r'refin|petrochem|gas processing|\blng\b', a['industry'], re.I):
            a['tags'].add('ICP-INDUSTRY-UNMAPPED')
    if SMALL(a):
        a['tags'].add('ICP-SMALL')

# Same persona patterns as CONFIG.personas in demandai-engine.js (primary + secondary)
PERSONA_RE = re.compile(r'instrumentation|\bi&c\b|\be&i\b|automation|control systems?\b|\bdcs\b|plant manager|operations|procurement|project director|maintenance|reliability', re.I)
all_contacts = [c for a in accounts for c in a['contacts']]
for c in all_contacts:
    if c['opt_out'] == 'Y':
        tag(c, 'SUP-OPTOUT')
    if c['email'] and c['email_verified'] == 'N':
        tag(c, 'EM-UNVERIFIED')
    if not PERSONA_RE.search(c['job_title']):
        tag(c, 'ICP-PERSONA-NONE')
    if any(ch for ch in c['first_name'] + c['last_name'] if ord(ch) > 127):
        tag(c, 'FMT-ENCODING')


def victims(k, cond=lambda c: True):
    pool = [c for c in all_contacts if cond(c) and not c.get('mutated')]
    out = rng.sample(pool, min(k, len(pool)))
    for c in out:
        c['mutated'] = True
    return out


# Missing fields
for c in victims(70):
    c['first_name'] = ''; tag(c, 'MF-FIRST')
for c in victims(60, lambda c: c['acct']['country'] != 'Indonesia'):
    c['last_name'] = ''; tag(c, 'MF-LAST')
for c in victims(55, lambda c: c['acct']['country'] == 'Indonesia'):  # single-name Indonesians
    c['last_name'] = ''; tag(c, 'MF-LAST')
for c in victims(140):
    c['job_title'] = ''; c['seniority'] = ''; tag(c, 'MF-TITLE')
for c in victims(140):
    c['email'] = ''; c['email_verified'] = ''; c['linkedin_url'] = ''; tag(c, 'MF-CHANNEL')
for c in victims(160, lambda c: c['email']):
    c['email_verified'] = ''; tag(c, 'MF-VERIFIED')
for c in victims(110):
    c['consent_basis'] = ''; tag(c, 'MF-CONSENT')
for c in victims(80):
    c['opt_out'] = ''; tag(c, 'MF-OPTOUT')
for c in victims(25, lambda c: c['opt_out'] == 'Y'):
    c['consent_basis'] = 'Opted in'; tag(c, 'SUP-OPTOUT-CONFLICT')

# Row-level company fields (as if one exporter left a cell empty): company_name, domain, country, industry...
ROW_BLANKS = [('company_name', 'MF-COMPANY', 45), ('company_domain', 'MF-DOMAIN', 90), ('country', 'MF-COUNTRY', 70), ('industry', 'MF-INDUSTRY', 90),
              ('existing_customer', 'MF-EXISTING', 75), ('managed_separately', 'MF-MANAGED', 75), ('owner_email', 'MF-OWNER', 70), ('account_type', 'MF-ACCTTYPE', 100)]
for field, cid, k in ROW_BLANKS:
    for c in victims(k):
        c.setdefault('blank', set()).add(field); tag(c, cid)
# Whole accounts with no size at all
for a in rng.sample([a for a in accounts if a['revenue'] != '' or a['employees'] != ''], 45):
    a['revenue'] = ''; a['employees'] = ''; a['tags'].add('MF-SIZE')
    a['tags'].discard('ICP-SMALL')
# Whole accounts with no domain at all
for a in rng.sample(accounts, 20):
    a['domain_blank'] = True; a['tags'].add('MF-DOMAIN')

# Invalid emails
BAD_EMAIL = {
    'EM-NO-AT': lambda l, d: f'{l}{d}' if chance(.5) else f'{l} at {d}',
    'EM-DOUBLE-AT': lambda l, d: f'{l}@@{d}' if chance(.5) else f'{l}@{d.split(".")[0]}@{d}',
    'EM-NO-TLD': lambda l, d: f'{l}@{d.split(".")[0]}',
    'EM-SPACE': lambda l, d: f'{l.replace(".", ". ", 1)}@{d}' if '.' in l else f'{l} @{d}',
    'EM-DOUBLE-DOT': lambda l, d: f'{l}@{d.replace(".", "..", 1)}' if chance(.5) else f'{l.replace(".", "..")}@{d}' if '.' in l else f'{l}..x@{d}',
    'EM-TRAILING-DOT': lambda l, d: f'{l}@{d}.' if chance(.6) else f'{l}@{d},',
    'EM-BAD-CHAR': lambda l, d: pick([f'mailto:{l}@{d}', f'<{l}@{d}>', f'{l}@{d};', f'{l}(work)@{d}', f'"{l}"@{d}']),
    'EM-PLACEHOLDER': lambda l, d: pick(['n/a', '-', 'none', 'TBC', 'unknown', 'N/A', 'no email', '0']),
    'EM-PERSONAL': lambda l, d: f'{l.replace(".", "")}{rng.randint(1, 99)}@{pick(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "yahoo.co.id", "ymail.com"])}',
    'EM-DOMAIN-MISMATCH': lambda l, d: f'{l}@{pick(["old", "corp", "mail", "group", "intl"])}-{d}' if chance(.5) else f'{l}@{d.split(".")[0]}group.com',
    'EM-ROLE': lambda l, d: f'{pick(["info", "sales", "procurement", "enquiries", "admin", "contact", "hr", "plant.ops"])}@{d}',
    'EM-TYPO-DOMAIN': lambda l, d: f'{l}@{re.sub(r"(com)$", pick(["con", "cm", "comm", "om"]), d)}' if d.endswith('com') else f'{l}@{d[:-1]}',
}
for cid, k in [('EM-NO-AT', 45), ('EM-DOUBLE-AT', 30), ('EM-NO-TLD', 40), ('EM-SPACE', 35), ('EM-DOUBLE-DOT', 30), ('EM-TRAILING-DOT', 30),
               ('EM-BAD-CHAR', 35), ('EM-PLACEHOLDER', 45), ('EM-PERSONAL', 90), ('EM-DOMAIN-MISMATCH', 70), ('EM-ROLE', 55), ('EM-TYPO-DOMAIN', 40)]:
    for c in victims(k, lambda c: c['email']):
        local, dom = c['email'].split('@')
        c['email'] = BAD_EMAIL[cid](local, dom)
        tag(c, cid)

# LinkedIn format
BAD_LI = [lambda s: f'https://www.linkedin.com/company/{s.split("-")[0]}-industries', lambda s: 'https://www.linkedin.com/sales/lead/ACwAAB' + str(rng.randint(10**6, 10**7)),
          lambda s: f'linkedin {s}', lambda s: 'https://www.linkedin.com/search/results/people/?keywords=' + s.replace('-', '%20'),
          lambda s: 'https://www.linkedin.com/in/', lambda s: f'www.linkedin.com/{s}']
for c in victims(70, lambda c: c['linkedin_url']):
    slug = c['linkedin_url'].rsplit('/', 1)[-1]
    c['linkedin_url'] = pick(BAD_LI)(slug); tag(c, 'FMT-LINKEDIN')

# Y/N variants
YN_FIELDS = ['email_verified', 'existing_customer', 'managed_separately', 'opt_out']
for c in victims(180):
    f = pick(YN_FIELDS)
    c.setdefault('override', {})[f] = 'okyn'; tag(c, 'FMT-YN')
for c in victims(70):
    f = pick(YN_FIELDS)
    c.setdefault('override', {})[f] = pick(['TRUE', 'FALSE', '1', '0', 'X', 'Verified', 'Unknown', '?', 'Y/N'])
    tag(c, 'FMT-YN-BAD')

for c in victims(60):
    c['consent_basis'] = pick(['Implied', 'GDPR consent', 'Opt-in', 'Contract', 'Trade show', 'Business card', 'Consent', 'LI', 'Customer'])
    tag(c, 'FMT-CONSENT')
for c in victims(25):
    c['consent_basis'] = pick(['legitimate interest', 'LEGITIMATE INTEREST', ' Existing customer ', 'opted in'])
    tag(c, 'FMT-WHITESPACE')

for c in victims(50):
    c.setdefault('override', {})['owner_email'] = pick(['Daniel Koh', 'MN', 'meera', 'rep.c', 'tbd', 'jessica.tan@client-sample', 'Sales team'])
    tag(c, 'FMT-OWNER')

for c in victims(110):
    which = pick(['upper', 'lower', 'pad', 'double'])
    if which == 'upper':
        c['first_name'], c['last_name'] = c['first_name'].upper(), c['last_name'].upper()
    elif which == 'lower':
        c['first_name'], c['last_name'] = c['first_name'].lower(), c['last_name'].lower()
    elif which == 'pad':
        c['first_name'] = f' {c["first_name"]} '; c['job_title'] = f'{c["job_title"]}  '
    else:
        c['job_title'] = c['job_title'].replace(' ', '  ', 1)
    tag(c, 'FMT-WHITESPACE')

TITLE_NOISE = {'Instrumentation Manager': ['Instr. Mgr', 'Mgr - Instrumentation', 'Inst. & Ctrl Manager', 'Manager, I&C (Acting)'],
               'Maintenance Manager': ['Maint. Mgr.', 'Mgr Maintenance', 'Maintenance Mgr (Mech/Elec)'],
               'Plant Manager': ['Plant Mgr', 'GM - Plant', 'Factory Manager'],
               'Control Systems Engineer': ['Sr. Ctrl Sys Engr', 'Control Sys. Engr.', 'Ctrl Systems Eng'],
               'Senior Instrument Engineer': ['Sr. Instrument Engr', 'Snr Inst Engineer', 'Lead Instr. Eng.'],
               'Procurement Manager': ['Purchasing Mgr', 'Head - Purchasing', 'Supply Chain Manager'],
               'Head of Automation': ['Automation Head', 'VP, Automation & Digital', 'Hd. of Automation']}
LOCAL_TITLES = {  # (country, English title) -> title as held in a local-language CRM
    'Indonesia': {'Instrumentation Manager': 'Kepala Instrumentasi', 'Maintenance Manager': 'Kepala Pemeliharaan', 'Plant Manager': 'Kepala Pabrik',
                  'Procurement Manager': 'Manajer Pengadaan'},
    'Thailand': {'Maintenance Manager': 'ผู้จัดการฝ่ายซ่อมบำรุง', 'Plant Manager': 'ผู้จัดการโรงงาน', 'Instrumentation Manager': 'ผู้จัดการแผนกเครื่องมือวัด'},
    'Vietnam': {'Plant Manager': 'Giám đốc nhà máy', 'Control Systems Engineer': 'Kỹ sư điều khiển', 'Maintenance Manager': 'Trưởng phòng bảo trì'},
    'Japan': {'Plant Manager': '工場長', 'Instrumentation Manager': '計装課長'},
    'China': {'Plant Manager': '厂长', 'Instrumentation Manager': '仪表经理'},
}
for c in victims(120, lambda c: c['job_title'] in TITLE_NOISE):
    local = LOCAL_TITLES.get(c['acct']['country'], {}).get(c['job_title'])
    c['job_title'] = local if local and chance(0.5) else pick(TITLE_NOISE[c['job_title']])
    tag(c, 'FMT-TITLE-NOISE')

for c in victims(15, lambda c: any(ord(ch) > 127 for ch in c['first_name'] + c['last_name'])):
    c['first_name'] = c['first_name'].encode('utf-8').decode('latin-1', errors='replace')
    c['last_name'] = c['last_name'].encode('utf-8').decode('latin-1', errors='replace')
    tag(c, 'FMT-ENCODING')

# Account-level format problems, applied to every row of the account
for a in rng.sample(accounts, 70):
    a['revenue_fmt'] = pick(['commas', 'dollar', 'usd']); a['tags'].add('FMT-NUMBER')
for a in rng.sample([a for a in accounts if a['revenue'] != ''], 35):
    a['revenue_bad'] = pick([f'{a["revenue"] / 1e9:.1f}B', f'{a["revenue"] / 1e6:.0f}M', f'approx. {a["revenue"] / 1e6:.0f} million', 'USD 1-5 bn', 'confidential', 'n/a'])
    a['tags'].add('FMT-NUMBER-BAD')
for a in rng.sample([a for a in accounts if a['employees'] != ''], 30):
    a['employees_bad'] = pick([f'~{a["employees"]}', f'{a["employees"]}+', '1-5k', '500-1000', 'approx. 3000', f'{a["employees"]:,}'])
    a['tags'].add('FMT-NUMBER-BAD' if not a['employees_bad'].replace(',', '').isdigit() else 'FMT-NUMBER')
for a in rng.sample(accounts, 40):
    a['domain_fmt'] = pick([f'https://www.{a["domain"]}/', f'www.{a["domain"]}', f'http://{a["domain"]}', f'{a["domain"]}/en/home', a['domain'].split('.')[0], f'{a["domain"]} '])
    a['tags'].add('FMT-DOMAIN')
for a in rng.sample(accounts, 50):
    bad = {'Owner-operator': ['Owner operator', 'Owner/Operator', 'End user', 'Operator'], 'EPC contractor': ['EPC', 'Contractor', 'EPCM'],
           'System integrator': ['SI', 'Integrator', 'Systems Integrator'], 'Distributor': ['Reseller', 'Dealer', 'Channel partner'], 'Other': ['OEM', 'Consultant', 'Other (see notes)']}
    a['account_type'] = pick(bad[a['account_type']]); a['tags'].add('FMT-ACCTTYPE')
COUNTRY_VAR = {'Singapore': ['SG', 'Republic of Singapore', 'singapore', 'Singapore '], 'Malaysia': ['MY', 'Malaysia ', 'MALAYSIA', 'Malasia'],
               'Thailand': ['TH', 'Kingdom of Thailand', 'Thai', 'Thailand'], 'Philippines': ['PH', 'Phillipines', 'The Philippines', 'Philippine'],
               'Indonesia': ['ID', 'Republic of Indonesia', 'Indonesia ', 'INDONESIA'], 'Vietnam': ['VN', 'Viet Nam', 'Vietnam ', 'Việt Nam']}
for a in rng.sample([a for a in accounts if not a['out_region']], 70):
    v = pick(COUNTRY_VAR[a['country']])
    a['country_fmt'] = v
    a['tags'].add('FMT-COUNTRY' if v.strip().lower() != a['country'].lower() else 'FMT-WHITESPACE')

# Inconsistent company details across rows of the same account
for a in rng.sample([a for a in accounts if len(a['contacts']) >= 3], 60):
    c = rng.choice(a['contacts'][1:])
    f = pick(['revenue', 'industry', 'country', 'account_type', 'existing', 'employees'])
    alt = {'revenue': lambda: (a['revenue'] or 500_000_000) + rng.choice([-1, 1]) * rng.randint(1, 9) * 50_000_000,
           'employees': lambda: (a['employees'] or 1000) + rng.randint(10, 900),
           'industry': lambda: pick([h for h in IND[a['ind']]['held'] if h != a['industry']] or ['Oil & Gas']),
           'country': lambda: pick([p for p in PILOT if p != a['country']]),
           'account_type': lambda: pick(['Owner-operator', 'EPC contractor', 'Other', 'Distributor']),
           'existing': lambda: 'N' if a['existing'] == 'Y' else 'Y'}[f]()
    c.setdefault('acct_override', {})[f] = alt
    tag(c, 'FMT-INCONSISTENT')

# ─── Assemble rows ───
FIELD_FROM_ACCT = {'company_name': 'name', 'company_domain': 'domain', 'country': 'country', 'city': 'city', 'industry': 'industry',
                   'annual_revenue_usd': 'revenue', 'employee_count': 'employees', 'account_type': 'account_type', 'existing_customer': 'existing',
                   'managed_separately': 'managed', 'site_name': 'site', 'site_process_type': 'process', 'site_capacity': 'capacity',
                   'capacity_unit': 'unit', 'owner_email': 'owner'}


def fmt_number(v, how):
    if v == '' or how is None:
        return v
    return {'commas': f'{v:,}', 'dollar': f'${v:,}', 'usd': f'USD {v:,}'}[how]


def yn_variant(v):
    return {'Y': pick(['Yes', 'yes', 'y', 'YES']), 'N': pick(['No', 'no', 'n', 'NO'])}.get(v, v)


def row_for(c):
    a = c['acct']
    r = {}
    for f in COLS:
        if f in FIELD_FROM_ACCT:
            r[f] = a[FIELD_FROM_ACCT[f]]
        else:
            r[f] = c[f]
    if a.get('domain_fmt'):
        r['company_domain'] = a['domain_fmt']
    if a.get('domain_blank'):
        r['company_domain'] = ''
    if a.get('country_fmt'):
        r['country'] = a['country_fmt']
    r['annual_revenue_usd'] = a.get('revenue_bad') or fmt_number(a['revenue'], a.get('revenue_fmt'))
    if a.get('employees_bad'):
        r['employee_count'] = a['employees_bad']
    for f, v in c.get('acct_override', {}).items():
        r[{'revenue': 'annual_revenue_usd', 'employees': 'employee_count', 'industry': 'industry', 'country': 'country',
           'account_type': 'account_type', 'existing': 'existing_customer'}[f]] = v
    for f, v in c.get('override', {}).items():
        r[f] = yn_variant(r[f]) if v == 'okyn' else v
    for f in c.get('blank', ()):
        r[f] = ''
    return r


# Order: grouped by account, accounts shuffled, as a CRM export by account would look
rng.shuffle(accounts)
rows = []  # (row dict, contact, tags)
for a in accounts:
    for c in a['contacts']:
        rows.append(dict(r=row_for(c), c=c, tags=list(c['tags'])))

# ─── Duplicates, inserted after their originals ───
dups = []


def insert_later(orig_pos, new_row):
    pos = rng.randint(orig_pos + 1, min(len(rows), orig_pos + 4000))
    dups.append((pos, new_row))


def sample_rows(k, cond):
    pool = [i for i, x in enumerate(rows) if cond(x)]
    return rng.sample(pool, min(k, len(pool)))


valid_email = lambda x: re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', x['r']['email'] or '') and x['r']['company_name']
for i in sample_rows(140, valid_email):
    insert_later(i, dict(r=dict(rows[i]['r']), c=rows[i]['c'], tags=['DUP-EXACT'], dup_of=rows[i]))
for i in sample_rows(80, valid_email):
    r = dict(rows[i]['r'])
    r['email'] = pick([r['email'].upper(), f' {r["email"]}', r['email'].title(), f'{r["email"]} '])
    r['seniority'] = r['seniority'] or 'Manager'
    insert_later(i, dict(r=r, c=rows[i]['c'], tags=['DUP-EMAIL-CASE'], dup_of=rows[i]))
for i in sample_rows(70, lambda x: re.search(r'linkedin\.com/in/[^\s/]+', x['r']['linkedin_url'] or '') and x['r']['company_name']):
    r = dict(rows[i]['r'])
    r['linkedin_url'] = pick([r['linkedin_url'].replace('https://', 'http://'), r['linkedin_url'] + '/', r['linkedin_url'] + '?trk=public_profile',
                              r['linkedin_url'].replace('https://www.', 'https://'), r['linkedin_url'].replace('www.linkedin', 'sg.linkedin')])
    r['email'] = '' if chance(0.6) else r['email']
    if not r['email']:
        r['email_verified'] = ''
    insert_later(i, dict(r=r, c=rows[i]['c'], tags=['DUP-LINKEDIN'], dup_of=rows[i]))
for i in sample_rows(60, valid_email):
    r = dict(rows[i]['r'])
    r['job_title'] = pick(['Senior ' + r['job_title'] if r['job_title'] else 'Instrumentation Manager', 'Head of Instrumentation', 'Plant Manager', 'Operations Director'])
    r['seniority'] = pick(['Director', 'Manager'])
    r['site_name'] = r['site_name'] or f'{r["city"]} Plant'
    insert_later(i, dict(r=r, c=rows[i]['c'], tags=['DUP-UPDATED'], dup_of=rows[i]))
for i in sample_rows(70, lambda x: valid_email(x) and x['r']['first_name'] and x['r']['last_name'] and '.' in x['r']['email'].split('@')[0]):
    r = dict(rows[i]['r'])
    local, dom = r['email'].split('@')
    f, l = local.split('.', 1)
    r['email'] = pick([f'{f[0]}.{l}@{dom}', f'{f}{l[0]}@{dom}', f'{l}.{f}@{dom}', f'{f}.{l}2@{dom}'])
    r['linkedin_url'] = ''
    if chance(0.5):
        r['first_name'] = r['first_name'][0] + '.'
    insert_later(i, dict(r=r, c=rows[i]['c'], tags=['DUP-FUZZY'], dup_of=rows[i]))
# Same person under a second company (moved jobs, or EPC staff on an owner's project)
epcs = [a for a in accounts if a['ind'] in ('epc', 'si')]
for i in sample_rows(30, lambda x: valid_email(x) and x['c']['acct']['ind'] in ('refining', 'petrochem', 'gas')):
    other = pick(epcs)
    r = row_for(dict(rows[i]['c'], acct=other, override={}, blank=set(), acct_override={}))
    r['email'] = rows[i]['r']['email']
    insert_later(i, dict(r=r, c=rows[i]['c'], tags=['DUP-CROSS-COMPANY'], dup_of=rows[i]))

for pos, new in sorted(dups, key=lambda t: -t[0]):
    rows.insert(pos, new)

# Company name variants: some rows of an account carry a different spelling, same domain
for a in rng.sample([a for a in accounts if len(a['contacts']) >= 3 and not a['name'].endswith(('Ltd', 'Bhd', 'Berhad'))], 45):
    variant = pick([f'{a["name"]} {pick(LEGAL[a["country"]])}', a['name'].upper(), a['name'].replace(' and ', ' & ') if ' and ' in a['name'] else a['name'].replace(' & ', ' and ') if ' & ' in a['name'] else f'{a["name"]} Group',
                    re.sub(r'(Refining|Petrochemicals|Engineering)$', lambda m: {'Refining': 'Ref.', 'Petrochemicals': 'Petrochem', 'Engineering': 'Eng.'}[m.group(1)], a['name'])])
    if variant.lower() == a['name'].lower():
        variant = a['name'] + ' Pte Ltd' if a['country'] == 'Singapore' else a['name'] + ' Group'
    a['variant'] = variant
    mine = [x for x in rows if x['c']['acct'] is a and x['r']['company_name'] == a['name']]
    for x in rng.sample(mine[1:], max(1, len(mine) // 3)):
        x['r']['company_name'] = variant
        x['tags'].append('DUP-ACCOUNT-VARIANT')
    a['tags'].add('DUP-ACCOUNT-VARIANT')

# ─── Signals ───
companies_in_file = defaultdict(list)
for idx, x in enumerate(rows):
    companies_in_file[x['c']['acct']['idx']].append(x)
SIGNAL_TYPES = {  # type: (weight, max age for a fresh event, detail templates, source)
    'Inquiry or RFQ': (6, 60, ['Asked about migrating a legacy control system during the {y} turnaround', 'Requested budgetary quote for DCS upgrade at {site}',
                               'RFQ for safety instrumented system on new unit', 'Enquiry via website on alarm management'], ['CRM leads', 'Website form', 'Distributor referral']),
    'Installed system near end of support': (5, 500, ['Control system X R{r} at {site} reaches end of support in {y}', 'Legacy DCS controllers at {site} out of support from {y}'], ['Installed base']),
    'Service contract renewal': (4, 120, ['Lifecycle service contract ends {d}', 'Annual maintenance agreement up for renewal in {m}'], ['Service records']),
    'Capital project': (6, 250, ['{unit} expansion at front-end engineering design stage; control-system decision due {q}', 'Board approved {unit} revamp; FEED tender issued',
                                 'Announced new {unit} at {site}; EPC award expected {q}'], ['Account plan', 'Press release', 'Industry news']),
    'Leadership change': (4, 90, ['{name} appointed {title}', 'New plant director appointed at {site}', 'New head of engineering joined from a competitor'], ['Customer meeting notes', 'LinkedIn', 'Press release']),
    'Webinar attended': (7, 150, ['Modernising legacy control systems', 'Cybersecurity for refinery control systems', 'Alarm management best practice', 'Digital twins for process plants'], ['Event platform export']),
    'Webinar registered': (5, 100, ['Modernising legacy control systems', 'Cybersecurity for refinery control systems', 'APC for crude units'], ['Event platform export']),
    'Content download': (8, 150, ['Case study: refinery migration in one shutdown', 'Whitepaper: gas plant control modernisation', 'Guide: DCS migration planning', 'eBook: OT security checklist'], ['Marketing automation']),
    'Email clicked': (9, 50, ['Clicked "Migration planning guide"', 'Clicked "Lifecycle services overview"', 'Clicked "Webinar replay"'], ['Campaign tool export']),
    'Installed system (current)': (2, 30, ['Control system X R{r} running at {site}'], ['Installed base']),
    'Newsletter sign-up': (2, 60, ['Subscribed to the process automation newsletter'], ['Marketing automation']),
}
STALE_AGE = {'Inquiry or RFQ': (95, 400), 'Installed system near end of support': (740, 1100), 'Service contract renewal': (185, 500), 'Capital project': (370, 900),
             'Leadership change': (125, 600), 'Webinar attended': (185, 700), 'Webinar registered': (125, 500), 'Content download': (185, 700), 'Email clicked': (65, 400)}
UNITS = ['crude unit', 'hydrocracker', 'Train 2', 'cracker', 'polypropylene line', 'aromatics unit', 'LNG train', 'utilities block', 'tank farm']


def detail_for(t, a, person):
    tmpl = pick(SIGNAL_TYPES[t][2])
    return tmpl.format(y=rng.choice([2027, 2028]), site=a['site'] or a['city'], r=rng.randint(3, 7), d=(AS_OF + timedelta(days=rng.randint(20, 120))).strftime('%d %b %Y'),
                       m=pick(['November', 'December', 'January', 'February']), unit=pick(UNITS), q=pick(['Q1 2027', 'Q2 2027', 'Q3 2027', 'H2 2027']),
                       name=(person['r']['first_name'] + ' ' + person['r']['last_name']).strip() if person else 'A new director',
                       title=person['r']['job_title'] if person else 'plant director')


signals = []


def add_sig(company, ref, t, d, detail, source, product, tags):
    signals.append(dict(r=dict(company_name=company, contact_email_or_linkedin=ref, signal_type=t, event_date=d, detail=detail, source=source, product=product), tags=tags))


def ref_for(x):
    e, li = x['r']['email'], x['r']['linkedin_url']
    good_e = re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', e or '')
    if good_e and (not li or chance(0.75)):
        return e
    if li and 'linkedin.com/in/' in li and len(li) > 30:
        return li
    return e or ''


types = [t for t in SIGNAL_TYPES if t not in ('Installed system (current)', 'Newsletter sign-up')]
sig_accounts = [a for a in accounts if a['idx'] in companies_in_file and chance(0.55 if a['icp'] in ('core', 'adjacent') else 0.25)]
for a in sig_accounts:
    people = [x for x in companies_in_file[a['idx']] if 'DUP-EXACT' not in x['tags'] and x['r']['company_name'] == a['name']]
    if not people:
        continue
    for _ in range(max(1, int(rng.expovariate(1 / 2.6)))):
        t = rng.choices(types, weights=[SIGNAL_TYPES[k][0] for k in types])[0]
        person = pick(people)
        named = chance(0.85) or t in ('Webinar attended', 'Content download', 'Email clicked', 'Webinar registered')
        ref = ref_for(person) if named else ''
        tags = []
        if named and not ref:
            ref = ''
        if not ref:
            tags.append('SIG-AUTOASSIGN')
        if chance(0.12):
            age = rng.randint(*STALE_AGE[t]); tags.append('SIG-STALE')
        else:
            age = rng.randint(0, SIGNAL_TYPES[t][1])
        if ref and person['r']['opt_out'] in ('Y', 'Yes', 'yes', 'y', 'YES'):
            tags.append('SIG-OPTED-OUT-PERSON')
        if a['out_region'] or a['managed'] == 'Y':
            tags.append('SIG-EXCLUDED-ACCOUNT')
        if not tags or tags == ['SIG-AUTOASSIGN']:
            tags.append('SIG-QUALIFIED')
        product = f'Control system X R{rng.randint(3, 6)}' if t == 'Installed system near end of support' else ''
        add_sig(a['name'], ref, t, (AS_OF - timedelta(days=age)).isoformat(), detail_for(t, a, person), pick(SIGNAL_TYPES[t][3]), product, tags)

# Installed-base knock-outs and newsletter sign-ups
for a in rng.sample([a for a in sig_accounts if a['icp'] in ('core', 'adjacent') and not a['out_region']], 45):
    person = pick(companies_in_file[a['idx']])
    r = rng.randint(6, 8)
    add_sig(a['name'], ref_for(person) if chance(.5) else '', 'Installed system (current)', (AS_OF - timedelta(days=rng.randint(0, 30))).isoformat(),
            f'Control system X R{r} running at {a["site"] or a["city"]}', 'Installed base', f'Control system X R{r}', ['SIG-KNOCKOUT'])
    a['tags'].add('ICP-INSTALLED')
for a in rng.sample(sig_accounts, 60):
    person = pick(companies_in_file[a['idx']])
    if ref_for(person):
        add_sig(a['name'], ref_for(person), 'Newsletter sign-up', (AS_OF - timedelta(days=rng.randint(1, 60))).isoformat(),
                'Subscribed to the process automation newsletter', 'Marketing automation', '', ['SIG-NEWSLETTER'])

# Signal defects
base = [s for s in signals if s['tags'] == ['SIG-QUALIFIED'] and s['r']['contact_email_or_linkedin']]
rng.shuffle(base)
it = iter(base)


def take(k):
    return [next(it) for _ in range(k)]


for s in take(40):
    signals.append(dict(r=dict(s['r']), tags=['SIG-DUP']))
for s in take(35):
    s['r']['event_date'] = pick([lambda d: d.strftime('%d/%m/%Y'), lambda d: d.strftime('%m/%d/%Y'), lambda d: d.strftime('%b %Y'), lambda d: d.strftime('%d-%b-%y'),
                                 lambda d: d.strftime('%Y/%m/%d'), lambda d: f'{d.year}-02-30'])(date.fromisoformat(s['r']['event_date']))
    s['tags'] = ['SIG-BAD-DATE']
for s in take(25):
    s['r']['event_date'] = ''; s['tags'] = ['SIG-NO-DATE']
for s in take(20):
    s['r']['event_date'] = (AS_OF + timedelta(days=rng.randint(3, 200))).isoformat(); s['tags'] = ['SIG-FUTURE']
for s in take(35):
    s['r']['signal_type'] = pick(['Trade show visit', 'Website visit', 'Price request', 'Demo request', 'Site visit', 'Webinar', 'Inquiry', 'RFQ']); s['tags'] = ['SIG-BAD-TYPE']
for s in take(30):
    s['r']['signal_type'] = pick([s['r']['signal_type'].lower(), s['r']['signal_type'].upper(), f' {s["r"]["signal_type"]} '])
    s['tags'] = ['SIG-TYPE-CASE']
for s in take(30):
    s['r']['detail'] = ''; s['tags'] = ['SIG-NO-DETAIL']
for s in take(15):
    s['r']['company_name'] = ''; s['tags'] = ['SIG-NO-COMPANY']
for s in take(35):
    s['r']['company_name'] = pick([s['r']['company_name'].upper(), s['r']['company_name'] + ' Pte Ltd', s['r']['company_name'] + ' Group',
                                   ''.join(w[0] for w in s['r']['company_name'].split()) if len(s['r']['company_name'].split()) > 1 else s['r']['company_name'] + ' Co.'])
    s['tags'] = ['SIG-NAME-VARIANT']
for s in take(40):
    ref = s['r']['contact_email_or_linkedin']
    dom = ref.split('@')[1] if '@' in ref else None
    geo = GEO['Malaysia']
    newp = f'{ascii_slug(pick(geo["first"]))}.{ascii_slug(pick(geo["last"]))}'
    s['r']['contact_email_or_linkedin'] = f'{newp}@{dom}' if dom else f'https://www.linkedin.com/in/{newp.replace(".", "-")}-new'
    s['tags'] = ['SIG-UNKNOWN-PERSON']
# Companies that are not in the lead file at all
for _ in range(45):
    ind = pick(['refining', 'petrochem', 'marine', 'power', 'epc'])
    nm = company_name(ind)
    d = domain_for(nm, 'Malaysia')
    t = pick(types)
    add_sig(nm, f'{pick(["ops", "info", "j.tan", "a.rahman", "procurement"])}@{d}', t, (AS_OF - timedelta(days=rng.randint(1, 60))).isoformat(),
            detail_for(t, dict(site='', city='Johor Bahru'), None), pick(SIGNAL_TYPES[t][3]), '', ['SIG-UNKNOWN-COMPANY'])
rng.shuffle(signals)
signals.sort(key=lambda s: (not s['r']['company_name'], s['r']['company_name'].lower(), 'SIG-DUP' in s['tags']))  # exported sorted by company, like the sample

# ─── Write the workbook ───
wb = openpyxl.load_workbook(sys.argv[1])
# Mocks never carry the real client's name: the guide sheets are anonymised to "Client", as in the prototype
for gs in wb.worksheets:
    for row in gs.iter_rows():
        for cell in row:
            if isinstance(cell.value, str) and re.search(r'yokogawa', cell.value, re.I):
                cell.value = re.sub(r'yokogawa-sample\.com', REP_DOMAIN, cell.value, flags=re.I)
                cell.value = re.sub(r'yokogawa', 'Client', cell.value, flags=re.I)
ws = wb['Lead template']
body_font = Font(name='Arial', size=10)
START = 4
for i, x in enumerate(rows):
    x['row'] = START + i
for i, x in enumerate(rows):
    for j, f in enumerate(COLS):
        v = x['r'][f]
        cell = ws.cell(row=x['row'], column=j + 1, value=v if v != '' else None)
        cell.font = body_font
# Rows past the template's styled block: copy alignment from row 4
for row in ws.iter_rows(min_row=204, max_row=START + len(rows) - 1):
    for cell in row:
        cell.alignment = Alignment(wrap_text=False, vertical='top')
last = START + len(rows) - 1
ws.data_validations.dataValidation = []
dv_yn = DataValidation(type='list', formula1='"Y,N"', allow_blank=True, showErrorMessage=False)
dv_at = DataValidation(type='list', formula1='"Owner-operator,EPC contractor,System integrator,Distributor,Other"', allow_blank=True, showErrorMessage=False)
for col in 'FPQW':
    dv_yn.add(f'{col}4:{col}{last}')
dv_at.add(f'O4:O{last}')
ws.add_data_validation(dv_yn)
ws.add_data_validation(dv_at)
ws.auto_filter.ref = f'A2:X{last}'
ws.freeze_panes = 'C4'

# Duplicate references now that row numbers are final
for x in rows:
    if x.get('dup_of'):
        x['note'] = f'Repeat of row {x["dup_of"]["row"]}'

hdr_font = Font(name='Arial', size=10, bold=True, color='FFFFFF')
hdr_fill = PatternFill('solid', fgColor='1F3A5F')
hint_font = Font(name='Arial', size=9, color='44546A')
hint_fill = PatternFill('solid', fgColor='EEF2F7')
title_font = Font(name='Arial', size=11, bold=True)


def sheet(title, header, hints, data, widths, note):
    s = wb.create_sheet(title)
    s['A1'] = note
    s['A1'].font = title_font
    for j, h in enumerate(header):
        c = s.cell(row=2, column=j + 1, value=h)
        c.font, c.fill = hdr_font, hdr_fill
        c.alignment = Alignment(wrap_text=True, vertical='center')
        if hints:
            c = s.cell(row=3, column=j + 1, value=hints[j])
            c.font, c.fill = hint_font, hint_fill
            c.alignment = Alignment(wrap_text=True, vertical='top')
        s.column_dimensions[openpyxl.utils.get_column_letter(j + 1)].width = widths[j]
    r0 = 4 if hints else 3
    for i, row in enumerate(data):
        for j, v in enumerate(row):
            c = s.cell(row=r0 + i, column=j + 1, value=v if v != '' else None)
            c.font = body_font
    s.freeze_panes = s.cell(row=r0, column=1)
    s.auto_filter.ref = f'A{r0 - 1}:{openpyxl.utils.get_column_letter(len(header))}{r0 + len(data) - 1}'
    return s


# Signal template (the Scoring page picks the sheet named "Signal template")
sig_hints = ['Text* · as in the lead file', 'Email or LinkedIn URL · blank = auto-assign', 'Text* · from the list', 'Date* · YYYY-MM-DD', 'Text*', 'Text', 'Text · installed base only']
sheet('Signal template', SIG_COLS, sig_hints, [[s['r'][f] for f in SIG_COLS] for s in signals], [30, 42, 34, 14, 70, 22, 22],
      f'Signal template: one row per signal event · * = required · scoring date {AS_OF.isoformat()}')
for i, s in enumerate(signals):
    s['row'] = 4 + i

# Count cases
for x in rows:
    for t in x['tags']:
        CATALOG[t]['count'] += 1
for a in accounts:
    for t in a['tags']:
        if t in CATALOG and CATALOG[t]['category'] in ('Out-of-ICP', 'Suppression') or t in ('MF-SIZE', 'FMT-NUMBER', 'FMT-NUMBER-BAD', 'FMT-DOMAIN', 'FMT-ACCTTYPE', 'FMT-COUNTRY', 'DUP-ACCOUNT-VARIANT'):
            pass
for s in signals:
    for t in s['tags']:
        CATALOG[t]['count'] += 1
acct_case_counts = Counter(t for a in accounts for t in a['tags'])

# Account key: one row per account with expected classification and knock-outs
first_row = {}
n_rows = Counter()
for x in rows:
    a = x['c']['acct']
    first_row.setdefault(a['idx'], x['row'])
    n_rows[a['idx']] += 1
vertical = {'refining': 'Refining (core)', 'petrochem': 'Petrochemicals (adjacent)', 'gas': 'Gas processing (adjacent)', 'epc': 'Influencer (EPC)', 'si': 'Influencer (SI)'}
acct_rows = []
for a in sorted(accounts, key=lambda a: first_row.get(a['idx'], 10**9)):
    ko = [t for t in ('ICP-REGION', 'ICP-MANAGED', 'ACC-ALL-OPTED-OUT', 'ICP-INSTALLED') if t in a['tags']]
    risk = [t for t in ('ICP-INDUSTRY', 'ICP-DISTRIBUTOR', 'ICP-SMALL', 'ICP-INDUSTRY-UNMAPPED', 'MF-SIZE') if t in a['tags']]
    status = 'Excluded' if ko else 'In scope, likely below fit floor' if set(risk) & {'ICP-INDUSTRY', 'ICP-DISTRIBUTOR'} else 'In scope'
    acct_rows.append([a['name'], a.get('variant', ''), a['domain'], a['country'], 'Y' if not a['out_region'] else 'N', a['industry'],
                      vertical.get(a['ind'], 'Out of ICP (' + a['ind'] + ')'), a['account_type'], first_row.get(a['idx'], ''), n_rows[a['idx']],
                      status, '; '.join(ko), '; '.join(sorted(set(a['tags']) - set(ko)))])
sheet('Account key', ['company_name', 'name_variant_used', 'company_domain', 'true_country', 'in_pilot_region', 'industry_as_held', 'true_vertical',
                      'account_type_as_held', 'first_row', 'rows_in_file', 'expected_status', 'knock_out_cases', 'other_account_cases'], None, acct_rows,
      [32, 30, 30, 16, 10, 28, 28, 20, 10, 10, 30, 36, 60],
      'Answer key: one row per account · what the platform should conclude about it (not part of the upload)')

# Row key: one row per lead/signal row that carries a test case
row_key = []
INFO = ('EM-UNVERIFIED', 'ICP-PERSONA-NONE', 'SUP-OPTOUT', 'FMT-ENCODING')
for x in rows:
    tags = [t for t in x['tags'] if t not in INFO]
    info = [t for t in x['tags'] if t in INFO]
    a = x['c']['acct']
    acct_ko = [t for t in ('ICP-REGION', 'ICP-MANAGED', 'ACC-ALL-OPTED-OUT') if t in a['tags']]
    if tags or info or acct_ko:
        row_key.append(['Lead template', x['row'], x['r']['company_name'] or f'({a["name"]})', '; '.join(tags), '; '.join(info), '; '.join(acct_ko),
                        x.get('note', ''), ' | '.join(CATALOG[t]['expected'] for t in tags[:3])])
for s in signals:
    row_key.append(['Signal template', s['row'], s['r']['company_name'], '; '.join(s['tags']), '', '', '', ' | '.join(CATALOG[t]['expected'] for t in s['tags'])])
sheet('Row key', ['sheet', 'row', 'company', 'row_cases', 'info_cases', 'account_knock_outs', 'note', 'expected_result'], None, row_key, [16, 8, 32, 46, 30, 30, 22, 90],
      'Answer key: every row that carries a test case, by spreadsheet row number (not part of the upload)')

# Test scenarios: the catalogue with counts
scen = []
for c in CATALOG.values():
    n = c['count'] + acct_case_counts.get(c['id'], 0)
    unit = 'accounts' if acct_case_counts.get(c['id']) and not c['count'] else 'rows'
    scen.append([c['id'], c['category'], c['step'], c['description'], c['code'], c['expected'], n, unit])
sheet('Test scenarios', ['case_id', 'category', 'pdf_step', 'what is in the data', 'dq_code', 'expected platform behaviour', 'count', 'unit'], None, scen,
      [24, 16, 9, 70, 16, 70, 9, 10], 'Test scenarios built into this dataset · steps refer to Lead discovery and research 3.1–3.6')

# Dataset summary at the front of the answer-key sheets
lead_rows = len(rows)
summary = [
    ['Lead template rows (contacts)', lead_rows], ['Distinct accounts (true)', len(accounts)],
    ['Accounts in the pilot region', sum(not a['out_region'] for a in accounts)], ['Accounts outside the pilot region', sum(a['out_region'] for a in accounts)],
    ['Accounts managed separately', sum(a['managed'] == 'Y' for a in accounts)], ['Existing-customer accounts', sum(a['existing'] == 'Y' for a in accounts)],
    ['Duplicate rows inserted', sum(1 for x in rows if x.get('dup_of'))], ['Rows with at least one defect case (excluding info-only cases)', sum(1 for x in rows if set(x['tags']) - set(INFO))],
    ['Signal template rows', len(signals)], ['Signal accounts not in the lead file', CATALOG['SIG-UNKNOWN-COMPANY']['count']],
    ['Scoring date for signals', AS_OF.isoformat()], ['Random seed', SEED],
    ['Note', 'All companies, people, domains and reps are fictional. The answer-key sheets (this one, Test scenarios, Account key, Row key) are not part of the upload; '
             'the platform reads only "Lead template" and "Signal template".'],
]
s = sheet('Dataset summary', ['measure', 'value'], None, summary, [44, 110], 'Sample dataset for Lead discovery and research testing')
wb.move_sheet('Dataset summary', offset=-(len(wb.sheetnames) - 5))

wb.save(sys.argv[2])
print(f'lead rows {lead_rows}, accounts {len(accounts)}, signals {len(signals)}, row-key {len(row_key)}')
