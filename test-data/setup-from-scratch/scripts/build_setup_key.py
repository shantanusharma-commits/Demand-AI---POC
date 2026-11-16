"""Setup_Test_3_Answer_key.xlsx: what to enter in Setup, the expected results after set-up, and, for each one-at-a-time
change S1 to S13, exactly which accounts change and how (everything else must stay the same). From the engine runs.
Usage: python3 build_setup_key.py <out.xlsx> <spec.json> <results.json>"""
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
OUT, spec, res = sys.argv[1], json.load(open(sys.argv[2])), json.load(open(sys.argv[3]))
B, W, H = Font(bold=True), Alignment(wrap_text=True, vertical='top'), PatternFill('solid', fgColor='DDEBF7')
wb = Workbook()
def sheet(t, cols, rows, widths):
    ws = wb.create_sheet(t); ws.append(cols)
    for c in ws[1]: c.font, c.fill = B, H
    for r in rows: ws.append(r)
    for row in ws.iter_rows():
        for c in row: c.alignment = W
    for i, w in enumerate(widths): ws.column_dimensions[chr(65 + i)].width = w
    ws.freeze_panes = 'A2'
S = spec['setup']
sheet('1 How to run', ['#', 'Where', 'Do', 'Expect'], [
 (1, 'Setup (Admin)', 'Start from the default settings. All AI switches off. Note the run in the run record.', ''),
 (2, 'Prospecting, Account Scoring', 'BEFORE any set-up: upload Setup_Test_1_Prospects.xlsx, score with Setup_Test_2_Signals.xlsx (score date 16 Nov 2026). Hand off and build.', 'Sheet 3, column "Before set-up": only the 3 end-of-support accounts score; everything else is "Other" vertical and below the fit floor. This proves the defaults can’t handle this market.'),
 (3, 'Setup (Admin)', 'Enter everything on sheet 2, from scratch: the two verticals, the buying roles, the new rubric part and weights, the two signal types, the two segments and the four actions.', 'Each item saved and listed. No approval needed: the Admin set them up.'),
 (4, 'Account Scoring, NBA', 'Re-score the same list with the same signal file; hand off; build.', 'Sheet 3, column "After set-up", and sheet 4 in full. Segments: Open tenders 5, Compliance deadline 5, Modernisation 3.'),
 (5, 'Setup', 'Run S1 to S13 one at a time (sheet 5): change the one setting, re-score and rebuild, compare, then put the setting back.', 'Only the accounts listed for that test change, exactly as listed. Every other account stays as on sheet 4.'),
 (6, 'Setup', 'Manual tests on sheet 6 (invalid values, roles, audit log).', 'As listed.')], [4, 22, 70, 80])
rows = [['Vertical', v['name'], f"Level: {v['level'].title()}. Match words: {', '.join(v['words'])}"] for v in S['verticals']]
rows += [['Buying role (primary)', r, 'Ideal customer › Personas'] for r in S['primary']] + [['Buying role (secondary)', r, 'Ideal customer › Personas'] for r in S['secondary']]
p = S['part']; rows += [['Rubric part (new)', p['label'], f"Weight {p['weight']}. Column {p['column']}: at least 200,000 = 100 points; at least 50,000 = 60; otherwise 20"]]
rows += [['Rubric weights', ', '.join(f'{k} {v}' for k, v in S['weights'].items()), 'Size and Site profile go from 20 to 15 each, to make room for Plant capacity (total 100)']]
rows += [['Signal type (new)', t['name'], f"Strength {t['level']}; full weight {t['full']} days; gone after {t['zero']} days; segment {t['segment']}. About: {t['about']}"] for t in S['types']]
rows += [['Segment (new)', g['name'], g['theme']] for g in S['segments']]
rows += [['Action', a, f"Segment {seg}, order {i + 1}"] for seg, acts in S['actions'].items() for i, a in enumerate(acts)]
sheet('2 Enter in Setup', ['What', 'Name or value', 'Details'], rows, [24, 40, 90])
def idx(r):
    rec = {x['account']: x for x in r['recs']}
    return {a['name']: dict(vertical=a.get('vertical'), fit=a.get('fit'), tier=a['tier'], score=a.get('score'), ex=a['ex'], seg=(rec.get(a['name']) or {}).get('segment'),
                            action=(rec.get(a['name']) or {}).get('action'), route=(rec.get(a['name']) or {}).get('route'),
                            reasons='; '.join((rec.get(a['name']) or {}).get('reasons') or [])) for a in r['accounts']}
base, before = idx(res['BASE']), idx(res['S0'])
fmt = lambda x: f"{x['vertical']}; fit {x['fit']}; {x['tier']}" + (f" {x['score']}" if x['score'] is not None else '') + (f"; {x['seg']}" if x['seg'] else '') + (f"; {x['route']}" if x['route'] else '') + (f" ({x['ex']})" if x['ex'] else '')
sheet('3 Before vs after', ['ID', 'Account', 'What it shows', 'Before set-up', 'After set-up'],
      [[a['id'], a['name'], a['note'], fmt(before[a['name']]), fmt(base[a['name']])] for a in spec['accounts']], [5, 22, 40, 50, 60])
sheet('4 Expected after set-up', ['ID', 'Account', 'Vertical', 'Fit', 'Tier', 'Score', 'Segment', 'First action', 'Route', 'Reasons held'],
      [[a['id'], a['name'], *(base[a['name']][k] for k in ('vertical', 'fit', 'tier', 'score', 'seg', 'action', 'route', 'reasons'))] for a in spec['accounts']], [5, 22, 16, 6, 13, 7, 20, 44, 11, 44])
FIELDS = [('vertical', 'Vertical'), ('fit', 'Fit'), ('tier', 'Tier'), ('score', 'Score'), ('seg', 'Segment'), ('action', 'Action'), ('route', 'Route'), ('reasons', 'Held for'), ('ex', 'Excluded')]
rows = []
for rid, what in spec['runs']:
    if rid in ('S0', 'BASE'): continue
    r = idx(res[rid]); changes = []
    for a in spec['accounts']:
        b, n = base[a['name']], r[a['name']]
        diff = [f"{lab}: {b[k] if b[k] not in (None, '') else '—'} → {n[k] if n[k] not in (None, '') else '—'}" for k, lab in FIELDS if b[k] != n[k]]
        if diff: changes.append(f"{a['id']} {a['name']}: " + '; '.join(diff))
    segs = ', '.join(f'{s} {n}' for s, n in res[rid]['segments'])
    rows.append([rid, what, '\n'.join(changes) or 'No account changes', segs, 'Put the setting back; results return to sheet 4'])
sheet('5 Setup changes S1-S13', ['Test', 'Change in Setup', 'Expected: only these accounts change', 'Segments after', 'Then'], rows, [7, 40, 100, 40, 30])
sheet('6 Manual tests', ['Test', 'Do', 'Expected'], [
 ('S9, S11', 'Covered by the set-up itself: new signal types mapped to new segments, and segments added with "+ Add a segment".', 'Sheet 4: Open tenders and Compliance deadline form, with no approval step.'),
 ('S15a', 'Enter a fit floor of 150.', 'Rejected with a clear message; nothing saved.'),
 ('S15b', 'Add a segment with an empty name.', 'Rejected; nothing saved.'),
 ('S15c', 'Set rubric weights that don’t add up to 100.', 'Rejected or flagged before saving.'),
 ('S15d', 'Add a signal type whose "gone after" is shorter than its full-weight days.', 'Rejected: "gone after" must be longer.'),
 ('Roles', 'Sign in as a rep; then as a sales manager.', 'Rep: cannot open Setup. Sales manager: can add segments and actions, cannot change signal types or the rubric.'),
 ('Audit', 'After the tests, open the audit log.', 'Every change above listed with who made it and when.'),
 ('Note', 'Compliance deadline items go to Approvals.', 'Expected: their drafts mention a regulation, which is a sensitive topic and always needs the sales manager.')], [10, 70, 80])
del wb['Sheet']; wb.save(OUT); print('written')
