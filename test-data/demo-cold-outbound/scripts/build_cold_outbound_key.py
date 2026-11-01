"""Cold_Outbound_3_Answer_key.xlsx from the engine run, with each account's design checked against it.
Usage: python3 build_cold_outbound_key.py <out.xlsx> <spec.json> <results.json>"""
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

OUT, spec, res = sys.argv[1], json.load(open(sys.argv[2])), json.load(open(sys.argv[3]))
B, WRAP, HEAD = Font(bold=True), Alignment(wrap_text=True, vertical='top'), PatternFill('solid', fgColor='DDEBF7')
OK, BAD = PatternFill('solid', fgColor='E2EFDA'), PatternFill('solid', fgColor='F8CBAD')
wb = Workbook()

def sheet(title, cols, rows, widths, fills=None):
    ws = wb.create_sheet(title); ws.append(cols)
    for c in ws[1]: c.font, c.fill = B, HEAD
    for i, r in enumerate(rows):
        ws.append(r)
        if fills and fills[i]:
            for c in ws[ws.max_row]: c.fill = fills[i]
    for row in ws.iter_rows():
        for c in row: c.alignment = WRAP
    for i, w in enumerate(widths): ws.column_dimensions[chr(65 + i)].width = w
    ws.freeze_panes = 'A2'

STRENGTH = {'Strong': 'Strong (weight 100)', 'Medium': 'Medium (weight 60)', 'Light': 'Light (weight 30)'}
sheet('1 Add these signals first', ['Signal name (exactly)', 'What it means (the "about" field)', 'Strength', 'Full weight for', 'Gone after', 'Usual micro-segment', 'Where the data comes from', 'Source'],
      [[t['name'], t['about'], STRENGTH[t['level']], f"{t['full']} days", f"{t['zero']} days", t['segment'], t['data'], t['source']] for t in spec['newTypes']],
      [24, 60, 18, 14, 12, 18, 34, 12])

steps = [
    ('Setup (Admin)', 'Add the three signal types on sheet 1: Setup → Signals → + Add a signal. Names must match exactly.', 'They appear in the signal list as Added, with their segment.'),
    ('Prospecting', 'Upload Cold_Outbound_1_Prospects.xlsx.', '13 contacts in 12 net-new accounts. One note: Ken Ong (Fenwick Refining) opted out, so he is never contacted.'),
    ('Account Scoring', 'Set the score date to 2 Nov 2026. Upload Cold_Outbound_2_Signals.xlsx and score.', '13 signals: 12 qualified, 1 too old (Ashby). Brightline Retail is below the fit floor; Fenwick is excluded (no one contactable).'),
    ('Account Scoring', 'Look at the tiers.', 'Tier A: Meridian 59.2, Larkspur 45.5, Saltmarsh 45.5. Tier B: six accounts at 27.3. Ashby is on the Watch list.'),
    ('Hand-off', 'Hand off the default selection.', '9 prospects handed off, 0 held back.'),
    ('NBA', 'Build micro-segments.', 'Two segments form from the new signals: Project 6 (new plants, growing teams) and Modernisation 3 (LinkedIn comments). All 9 go ahead on their own.'),
    ('NBA', 'Open Meridian, then Oakhurst, and compare with the Draft text sheet.', 'Each email opens with the behaviour the system saw, then cites one approved case study.'),
]
sheet('2 How to run', ['Where', 'Do', 'Expect'], steps, [16, 70, 80])

def find(name): return next((a for a in res['accounts'] if a['name'] == name), None)
def rec(name): return next((r for r in res['recs'] if r['account'] == name), None)
rows, checks, fills, fails = [], [], [], 0
for a in spec['accounts']:
    s, r, e = find(a['name']), rec(a['name']), a['expect']
    rows.append([a['id'], a['name'], a['story'], s and s.get('fit'), s and s['tier'], s and s.get('score'),
                 r and (r['segment'] or 'none'), r and r['action'], r and r['contact'], r and r['claim'], r and r['route']])
    tests = []
    if 'tier' in e: tests.append(('Tier', e['tier'], s and s['tier']))
    if 'segment' in e: tests.append(('Segment', e['segment'], r and r['segment']))
    if e.get('optOut'): tests.append(('Never contacted', 'not handed off', 'not handed off' if not r else 'handed off'))
    if 'segment' in e: tests.append(('Route', 'Released', r and r['route']))
    for what, want, got in tests:
        ok = want == got; fails += not ok
        checks.append([a['id'], what, str(want), str(got), 'PASS' if ok else 'FAIL']); fills.append(OK if ok else BAD)
sheet('3 Expected', ['ID', 'Account', 'What it shows', 'Fit', 'Tier', 'Score', 'Segment', 'Action', 'Contact', 'Claim', 'Route'], rows,
      [5, 22, 60, 6, 13, 7, 15, 36, 15, 7, 10])
sheet('4 Draft text', ['Account', 'Contact', 'Why now', 'Subject', 'Email'],
      [[r['account'], r['contact'], r['why'], r['subject'], r['text']] for r in res['recs']], [22, 15, 40, 14, 90])
sheet('5 Engine check', ['ID', 'Check', 'Designed', 'Engine result', 'Result'], checks, [6, 18, 24, 24, 9], fills)
del wb['Sheet']; wb.save(OUT)
print(len(checks), 'checks', 'FAILS', fails)
sys.exit(1 if fails else 0)
