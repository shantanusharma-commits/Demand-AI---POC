"""New_Signals_3_Answer_key.xlsx from the engine run (run_new_signals.mts), with each account's design checked against it.
Usage: python3 build_new_signals_key.py <out.xlsx> <spec.json> <results.json>"""
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

sheet('1 Segments (set up first)', ['Segment name (exactly)', 'Theme', 'Where'],
      [[g['name'], g['theme'], 'Setup → Segments → + Add a segment (Admin)'] for g in spec['segments']], [28, 70, 40])
STRENGTH = {'Strong': 'Strong (weight 100)', 'Medium': 'Medium (weight 60)', 'Light': 'Light (weight 30)'}
sheet('2 Signal types (set up first)', ['Signal name (exactly)', 'What it means (the "about" field)', 'Strength', 'Full weight for', 'Gone after', 'Usual micro-segment', 'Where the data comes from', 'Source'],
      [[t['name'], t['about'], STRENGTH[t['level']], f"{t['full']} days", f"{t['zero']} days", t['segment'], t['data'], t['source']] for t in spec['newTypes']],
      [22, 60, 18, 13, 11, 28, 34, 12])
sheet('3 Actions (set up first)', ['Action (exactly)', 'Micro-segment', 'Order', 'When to use it'],
      [[a, g['name'], i + 1, w] for g in spec['segments'] for i, (a, w) in enumerate(g['actions'])], [58, 28, 7, 60])
steps = [
    ('Setup → Segments (Admin)', 'Add the three segments on sheet 1.', 'Three segments listed. No approval needed: the Admin set them up.'),
    ('Setup → Signals (Admin)', 'Add the three signal types on sheet 2, each with its micro-segment. Leadership change, Webinar attended and Content download are built in: nothing to add.', 'Three signal types listed as Added.'),
    ('Setup → Actions (Admin)', 'Add the six actions on sheet 3, each linked to its segment, order 1 first.', 'Six actions, Active.'),
    ('Prospecting', 'Upload New_Signals_1_Prospects.xlsx.', '27 contacts in 24 net-new accounts. One note: Ivan Ho (Westmere Refining) opted out, so he is never contacted.'),
    ('Account Scoring', f"Set the score date to {int(spec['asOf'][8:])} Nov 2026. Upload New_Signals_2_Signals.xlsx and score.",
     '30 signal rows: 26 qualified; 2 rejected (Fairhaven 120 days old, Rosewood not in the list); 2 not used (Sunleaf below the fit floor, Westmere opted out).'),
    ('Account Scoring', 'Look at the ranking.', 'Top: Blackwater 59.2 (new plant + hiring stack). Tier A: 8 accounts (45.5 down to 35.6). Tier B: 11 (27.3 down to 20.5). Tier C: Fernhill and Quarry Bay (old signals). Fairhaven on the Watch list. Fresher signals and bigger sites rank higher; see sheet 5.'),
    ('Hand-off', 'Hand off the default selection.', '20 prospects handed off, 0 held back. Tier C is not handed off.'),
    ('Micro-segments & NBA', 'Build.', 'Five segments: Talking about ageing systems 6, New plants 4, Expanding teams 3 (each with its new first action), Engagement 3 and Leadership 3 (built-in actions). All 19 accounts go ahead on their own.'),
    ('Check', 'Open an Engagement item, then a new-segment item.', 'Engagement: an email citing an approved claim. New segments and Leadership: a task for the owner, because no approved claim fits them (and a claim cannot yet be tagged to a new segment).'),
]
sheet('4 How to run', ['Where', 'Do', 'Expect'], steps, [24, 70, 80])

find = lambda n: next((a for a in res['accounts'] if a['name'] == n), None)
rec = lambda n: next((r for r in res['recs'] if r['account'] == n), None)
rows, checks, fills, fails = [], [], [], 0
for a in spec['accounts']:
    s, r, e = find(a['name']), rec(a['name']), a['expect']
    rows.append([a['id'], a['name'], a['story'], s and s.get('fit'), s and s['tier'], s and s.get('score'),
                 r and (r['segment'] or 'none'), r and r['action'], r and r['contact'], r and r['channel'], r and r['route'], r and '; '.join(r['reasons'])])
    tests = []
    if 'tier' in e: tests.append(('Tier', e['tier'], s and s['tier']))
    if 'segment' in e: tests.append(('Segment', str(e['segment']), str(r and r['segment'])))
    if e.get('segment'):
        first = next((g['actions'][0][0] for g in spec['segments'] if g['name'] == e['segment']), None)
        if first: tests.append(('First action', first, r and r['action']))
        tests.append(('Route', 'Released', r and r['route']))
    if 'route' in e: tests.append(('Route', e['route'], r and r['route']))
    if e.get('handoff') is False: tests.append(('Handed off', 'no', 'yes' if r else 'no'))
    if e.get('optOut'): tests.append(('Never contacted', 'not handed off', 'not handed off' if not r else 'handed off'))
    for what, want, got in tests:
        ok = want == got; fails += not ok
        checks.append([a['id'], what, str(want), str(got), 'PASS' if ok else 'FAIL']); fills.append(OK if ok else BAD)
sheet('5 Expected', ['ID', 'Account', 'What it shows', 'Fit', 'Tier', 'Score', 'Segment', 'Action', 'Contact', 'Channel', 'Route', 'Reasons'], rows,
      [5, 20, 55, 6, 13, 7, 22, 40, 14, 8, 11, 20])
sheet('6 Task text', ['Account', 'Contact', 'Why now', 'Task for the owner'], [[r['account'], r['contact'], r['why'], r['text']] for r in res['recs']], [20, 14, 50, 90])
sheet('7 Signal rows', ['Row', 'Company', 'Signal type', 'Status', 'Weight', 'Reason'],
      [[x['row'], x['company'], x['type'], x['status'], x.get('weight'), x.get('reason') or ''] for x in res['signals']], [6, 22, 22, 11, 8, 60])
sheet('8 Engine check', ['ID', 'Check', 'Designed', 'Engine result', 'Result'], checks, [6, 16, 50, 50, 9], fills)
sheet('9 For Shrihari', ['Change', 'Why'], [
    ['Let a claim be tagged to any segment in the Content library, including ones added in Setup → Segments', 'Today the checkboxes list only the six built-in segments, so every item in a new segment is a task, not an email.']], [80, 80])
del wb['Sheet']; wb.save(OUT)
print(len(checks), 'checks', 'FAILS', fails); sys.exit(1 if fails else 0)
