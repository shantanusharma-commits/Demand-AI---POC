"""Boundary_3_Answer_key.xlsx from the engine run, each account checked against its designed boundary.
Usage: python3 build_boundary_key.py <out.xlsx> <spec.json> <results.json>"""
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
OUT, spec, res = sys.argv[1], json.load(open(sys.argv[2])), json.load(open(sys.argv[3]))
B, W, H = Font(bold=True), Alignment(wrap_text=True, vertical='top'), PatternFill('solid', fgColor='DDEBF7')
OK, BAD = PatternFill('solid', fgColor='E2EFDA'), PatternFill('solid', fgColor='F8CBAD')
wb = Workbook()
def sheet(t, cols, rows, widths, fills=None):
    ws = wb.create_sheet(t); ws.append(cols)
    for c in ws[1]: c.font, c.fill = B, H
    for i, r in enumerate(rows):
        ws.append(r)
        if fills and fills[i]:
            for c in ws[ws.max_row]: c.fill = fills[i]
    for row in ws.iter_rows():
        for c in row: c.alignment = W
    for i, w in enumerate(widths): ws.column_dimensions[chr(65 + i)].width = w
    ws.freeze_panes = 'A2'
sheet('1 How to run', ['Where', 'Do', 'Expect'], [
 ('Setup', 'Default settings. All AI switches off. Note the run in the run record.', 'Fit floor 50; tiers A 35, B 20; inquiry window 90 days; deal-size threshold USD 250k.'),
 ('Prospecting', 'Upload Boundary_1_Prospects.xlsx.', '18 contacts in 18 accounts. Notes: BV02 blank account type; BV14 opted out; BV15 opt-out blank; BV16 no consent basis; BV17 no usable channel; BV18 email not verified (LinkedIn only).'),
 ('Account Scoring', 'Set the score date to 16 Nov 2026. Upload Boundary_2_Signals.xlsx and score.', 'Compare every account with sheet 2. The pairs BV01/02, 03/04, 05/06 and 07/08 sit either side of a rule.'),
 ('Hand-off', 'Hand off the default selection.', '10 handed off; 3 held back (BV15, BV16, BV17).'),
 ('Micro-segments & NBA', 'Build.', 'Inquiry 3 and Project 3 form. Leadership (BV09, BV10) has only 2 accounts, so both go to For Review as "Segment too small".')], [22, 60, 90])
acc = {a['name']: a for a in res['accounts']}; rec = {r['account']: r for r in res['recs']}; sig = {s['company']: s for s in res['signals']}
rows, checks, fills, fails = [], [], [], 0
for a in spec['accounts']:
    x, r, s, e = acc[a['name']], rec.get(a['name']), sig[a['name']], a['expect']
    rows.append([a['id'], a['name'], a['tests'], x.get('fit'), x['tier'], x.get('score'), s['status'], r and (r['segment'] or 'none'), r and r['channel'], r and r['route'], r and '; '.join(r['reasons']), 'yes' if r else 'no'])
    tests = []
    if 'fit' in e: tests.append(('Fit', e['fit'], x.get('fit')))
    if 'tier' in e: tests.append(('Tier', e['tier'], x['tier']))
    if 'score' in e: tests.append(('Score', e['score'], x.get('score')))
    if 'signal' in e: tests.append(('Signal status', e['signal'], s['status']))
    if 'segment' in e: tests.append(('Segment', e['segment'] or 'none', r and (r['segment'] or 'none')))
    if 'route' in e: tests.append(('Route', e['route'], r and r['route']))
    if 'channel' in e: tests.append(('Channel', e['channel'], r and r['channel']))
    if e.get('handoff') is False: tests.append(('Handed off', 'no', 'yes' if r else 'no'))
    for what, want, got in tests:
        ok = want == got; fails += not ok
        checks.append([a['id'], what, str(want), str(got), 'PASS' if ok else 'FAIL']); fills.append(OK if ok else BAD)
sheet('2 Expected', ['ID', 'Account', 'Boundary tested', 'Fit', 'Tier', 'Score', 'Signal', 'Segment', 'Channel', 'Route', 'Reasons held', 'Handed off'], rows, [6, 20, 46, 6, 13, 7, 10, 10, 9, 11, 40, 9])
sheet('3 File issues', ['Row | field | issue | outcome'], [[i] for i in res['issues']], [110])
sheet('4 Engine check', ['ID', 'Check', 'Designed', 'Engine result', 'Result'], checks, [6, 14, 22, 22, 9], fills)
del wb['Sheet']; wb.save(OUT); print(len(checks), 'checks FAILS', fails); sys.exit(1 if fails else 0)
