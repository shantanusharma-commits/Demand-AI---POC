"""No_Approvals_3_Answer_key.xlsx from the engine run (run_no_approvals.mts), with each account checked against its design.
Usage: python3 build_no_approvals_key.py <out.xlsx> <spec.json> <results.json>"""
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
n, segs = len(spec['accounts']), ', '.join(f'{a} {b}' for a, b in res['segments'])
emails = sum(r['channel'] == 'Email' for r in res['recs']); tasks = len(res['recs']) - emails
top = max(res['accounts'], key=lambda a: a.get('score') or 0)
tiers = {t: sum(a['tier'] == t for a in res['accounts']) for t in ('A', 'B')}
sheet('1 How to run', ['Where', 'Do', 'Expect'], [
    ('Setup', 'Nothing to add. Every signal type, segment and action in this list is built in.', 'No new signal type, segment or action, so nothing waits for approval.'),
    ('Prospecting', 'Upload No_Approvals_1_Prospects.xlsx.', f'{len(spec["leads"])} contacts in {n} accounts. No issues.'),
    ('Account Scoring', f"Set the score date to {int(spec['asOf'][8:])} Nov 2026. Upload No_Approvals_2_Signals.xlsx and score.",
     f'{len(spec["signals"])} signal rows, all qualified. Tier A {tiers["A"]}, tier B {tiers["B"]}. Top: {top["name"]} {top["score"]}.'),
    ('Hand-off', 'Hand off the default selection.', f'{len(res["handoff"])} prospects handed off, 0 held back.'),
    ('Micro-segments & NBA', 'Build.', f'All six built-in segments form: {segs}. All {len(res["recs"])} go ahead on their own.'),
    ('For Review', 'Open the exception queue and Approvals.', 'Both empty: nothing to approve. (The weekly spot-check may still draw a few released items to look at; that is a check, not an approval.)'),
    ('Check', 'Open the released items.', f'{emails} emails, each citing an approved claim. {tasks} Leadership items are tasks for the owner: no approved claim fits Leadership in the starting content.'),
], [22, 70, 80])
rec = lambda nm: next((r for r in res['recs'] if r['account'] == nm), None)
acc = lambda nm: next((a for a in res['accounts'] if a['name'] == nm), None)
rows, checks, fills, fails = [], [], [], 0
for a in sorted(spec['accounts'], key=lambda a: -(acc(a['name']).get('score') or 0)):
    s, r = acc(a['name']), rec(a['name'])
    rows.append([a['id'], a['name'], a['story'], s.get('fit'), s['tier'], s.get('score'), r and r['segment'], r and r['action'], r and r['contact'], r and r['channel'], r and r['claim'], r and r['route']])
    for what, want, got in [('Segment', a['expect']['segment'], r and r['segment']), ('Route', 'Released', r and r['route'])]:
        ok = want == got; fails += not ok
        checks.append([a['id'], what, want, str(got), 'PASS' if ok else 'FAIL']); fills.append(OK if ok else BAD)
sheet('2 Expected (ranked)', ['ID', 'Account', 'What it shows', 'Fit', 'Tier', 'Score', 'Segment', 'Action', 'Contact', 'Channel', 'Claim', 'Route'], rows,
      [5, 22, 55, 6, 6, 7, 15, 40, 14, 8, 7, 10])
sheet('3 Draft text', ['Account', 'Contact', 'Why now', 'Subject', 'Email or task'], [[r['account'], r['contact'], r['why'], r['subject'], r['text']] for r in res['recs']], [22, 14, 40, 16, 90])
sheet('4 Engine check', ['ID', 'Check', 'Designed', 'Engine result', 'Result'], checks, [6, 12, 20, 20, 9], fills)
del wb['Sheet']; wb.save(OUT)
print(len(checks), 'checks', 'FAILS', fails); sys.exit(1 if fails else 0)
