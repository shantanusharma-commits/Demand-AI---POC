"""Kit for showing new segments and new actions without the AI: a seed signal file (one account per new signal type,
so each lands in For Review as "Segment too small" and a person creates the segment there), and the setup sheet.
Usage: python3 make_new_segments_kit.py <output folder> <spec.json>"""
import json, os, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
OUT, spec = sys.argv[1], json.load(open(sys.argv[2]))
# Three companies of their own (not in the main list), so releasing them here does not set main-list accounts aside
# as already engaged ("engage once") in the real build.
from datetime import date, timedelta
ago = lambda n: (date.fromisoformat(spec['asOf']) - timedelta(days=n)).isoformat()
SEEDS = [('Pinecove Refining', 'Nora', 'Aziz', 'New plant announced', 10, 'the new isomerisation unit you announced', 'News'),
         ('Marlow Refining', 'Dev', 'Menon', 'Team expanding', 7, 'your team is hiring two automation engineers', 'Job boards'),
         ('Eastvale Refining', 'Ana', 'Cruz', 'Commented on LinkedIn', 4, 'your comment on a post about keeping an old DCS running', 'LinkedIn')]
slug = lambda v: ''.join(ch for ch in v.lower() if ch.isalnum())
lead_rows, sig_rows = [], []
for co, fn, ln, typ, days, det, src in SEEDS:
    dom = slug(co) + '.example'; em = f'{slug(fn)}.{slug(ln)}@{dom}'
    row = dict(first_name=fn, last_name=ln, job_title='Instrumentation Manager', seniority='Manager', email=em, email_verified='Y',
               linkedin_url=f'https://www.linkedin.com/in/{slug(fn)}-{slug(ln)}', company_name=co, company_domain=dom, country='Malaysia', city='',
               industry='Refining', annual_revenue_usd=1800000000, employee_count=2400, account_type='Owner-operator', existing_customer='N',
               managed_separately='N', site_name=co.split()[0] + ' site', site_process_type='Crude refining', site_capacity=120000, capacity_unit='bpd',
               consent_basis='legitimate interest', opt_out='N', owner_email='priya.nair@client-sample.com')
    lead_rows.append([row.get(c, '') for c in spec['leadCols']])
    sig_rows.append([co, em, f'{fn} {ln}', typ, ago(days), det, src, '', ''])
def simple(path, sheet, cols, data):
    w = Workbook(); x = w.active; x.title = sheet; x.append(cols)
    for r in data: x.append([None if v == '' else v for v in r])
    for c in x[1]: c.font = Font(bold=True)
    w.save(path)
simple(os.path.join(OUT, 'Cold_Outbound_0_Seed_Prospects.xlsx'), 'Lead template', spec['leadCols'], lead_rows)
simple(os.path.join(OUT, 'Cold_Outbound_0_Seed_Signals.xlsx'), 'Signal template', spec['sigCols'], sig_rows)
rows = sig_rows
SEGS = [('Expanding teams', 'Team expanding', 'Sites building up their control and automation teams', 'Marlow Refining',
         ['Offer a technical onboarding session for the new engineers', 'Invite the new team to a hands-on training day']),
        ('New plants', 'New plant announced', 'Companies that announced a new plant or unit, while the control scope is still open', 'Pinecove Refining',
         ['Propose a front-end design session for the new plant', 'Share a reference plant of a similar size']),
        ('Talking about ageing systems', 'Commented on LinkedIn', 'People who said publicly that their site is living with ageing control systems', 'Eastvale Refining',
         ['Send a short point of view on the problem they raised', 'Invite them to a peer roundtable on the same problem'])]
B, WRAP, HEAD = Font(bold=True), Alignment(wrap_text=True, vertical='top'), PatternFill('solid', fgColor='DDEBF7')
kb = Workbook()
def sheet(title, cols, data, widths):
    s = kb.create_sheet(title); s.append(cols)
    for c in s[1]: c.font, c.fill = B, HEAD
    for d in data: s.append(d)
    for row in s.iter_rows():
        for c in row: c.alignment = WRAP
    for i, w in enumerate(widths): s.column_dimensions[chr(65 + i)].width = w
    s.freeze_panes = 'A2'
steps = [
  (1, 'Setup → Signals (Admin)', 'Add the three signal types (answer key sheet 1), but set "Usual micro-segment" to None.', 'Three new signal types listed as Added.'),
  (2, 'Prospecting', 'Upload Cold_Outbound_0_Seed_Prospects.xlsx: a separate small list of 3 companies.', '3 accounts, 3 contacts.'),
  (3, 'Account Scoring', 'Score date 2 Nov 2026. Score the seed list with Cold_Outbound_0_Seed_Signals.xlsx. Hand off.', 'Pinecove tier A; Marlow and Eastvale tier B. 3 handed off.'),
  (4, 'Micro-segments & NBA', 'Build.', 'No segment forms (each signal has only 1 account). All 3 items go to For Review: "Segment too small".'),
  (5, 'For Review', 'Open each item and create a new micro-segment with the name and account on the "New segments" sheet.', 'Three new segments, Created by you, approved. They now appear in Setup → Segments.'),
  (6, 'Setup → Signals (Admin)', 'Set each signal type’s Usual micro-segment to its new segment.', 'Team expanding → Expanding teams; New plant announced → New plants; Commented on LinkedIn → Talking about ageing systems.'),
  (7, 'Setup → Actions (Admin)', 'Add the six actions on the "New actions" sheet, each linked to its segment, the first one listed first.', 'Six new actions, Active.'),
  (8, 'Prospecting, then Account Scoring', 'Now the real demo list: upload Cold_Outbound_1_Prospects.xlsx, score it with Cold_Outbound_2_Signals.xlsx (score date 2 Nov 2026), hand off.', '9 handed off.'),
  (9, 'Micro-segments & NBA', 'Build.', 'Three new segments form: New plants 3 (Meridian, Larkspur, Saltmarsh), Expanding teams 3 (Highgate, Wrenfield, Corran), Talking about ageing systems 3 (Oakhurst, Kelpie Bay, Thornbury). Each item has its segment’s first new action.'),
  (10, 'Check', 'Open any item.', 'Today it is a task for the owner, not an email: no approved claim is tagged to a new segment. This is the gap for Shrihari (see sheet 4).'),
]
sheet('1 Steps', ['#', 'Where', 'Do', 'Expect'], steps, [4, 24, 70, 70])
sheet('2 New segments', ['Segment name (exactly)', 'Fed by signal type', 'Theme', 'Create it on this seed item in For Review', 'Expected accounts after step 9'],
      [[n, t, th, a, {'Expanding teams': 'Highgate, Wrenfield, Corran', 'New plants': 'Meridian, Larkspur, Saltmarsh', 'Talking about ageing systems': 'Oakhurst, Kelpie Bay, Thornbury'}[n]] for n, t, th, a, _ in SEGS],
      [28, 24, 60, 30, 34])
sheet('3 New actions', ['Action (exactly)', 'Micro-segment', 'Order', 'What it means and when to use it'],
      [[x, n, i + 1, w] for n, _, _, _, acts in SEGS for i, (x, w) in enumerate(zip(acts, [
        {'Expanding teams': 'Help the new engineers get productive on the control system fast. Use when a site is hiring control or automation engineers.',
         'New plants': 'Shape the control scope while the new plant is still being designed. Use when a new plant or unit is announced.',
         'Talking about ageing systems': 'Reply to the problem they raised with a short, useful point of view. Use when someone comments publicly about ageing systems.'}[n],
        {'Expanding teams': 'Invite the new team to try the system hands-on. Use when the team is growing but not yet trained.',
         'New plants': 'Show a running plant of a similar size. Use when the project team needs proof before deciding.',
         'Talking about ageing systems': 'Bring them together with peers who solved the same problem. Use when they are not ready for a sales conversation.'}[n]]))],
      [52, 28, 7, 80])
sheet('4 For Shrihari', ['Change', 'Why'], [
  ['Let approved claims be tagged to any segment, including new ones (or let a claim with no topic fit every segment, new ones too)', 'Without it, every item in a new segment is a task for the owner instead of an email.'],
  ['Add "+ Add a segment" to Setup → Segments', 'So the Admin can create a segment up front instead of steps 3 to 5.'],
  ['Switch on AI segments, actions and drafting in the demo environment (AI_FEATURE_SEGMENTS, AI_FEATURE_NEXT_ACTION, AI_FEATURE_DRAFTING)', 'Then the AI creates the new segments and actions itself, the sales manager approves them, and drafts use claims matched by topic.'],
  ['A subject line per added signal type', 'Today every added signal type gets "quick question".']], [80, 80])
del kb['Sheet']; kb.save(os.path.join(OUT, 'Cold_Outbound_4_New_Segments_Kit.xlsx'))
print('seed rows', len(rows))
