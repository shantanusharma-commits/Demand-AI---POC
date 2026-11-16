"""Scorecard_and_Defect_Log.xlsx for the intelligence and accuracy test plan: run record, scorecard (one row per step),
Setup, Content library and boundary checklists, and the defect log. Usage: python3 make_scorecard.py <out.xlsx>"""
import sys
from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
OUT = sys.argv[1]
B, W, HEAD = Font(bold=True, color='FFFFFF'), Alignment(wrap_text=True, vertical='top'), PatternFill('solid', fgColor='1B1F2A')
GREEN, RED, AMBER = PatternFill('solid', fgColor='E2EFDA'), PatternFill('solid', fgColor='F8CBAD'), PatternFill('solid', fgColor='FCEFC7')
wb = Workbook()
def sheet(title, cols, rows, widths, blank=0, lists=None):
    ws = wb.create_sheet(title); ws.append(cols)
    for c in ws[1]: c.font, c.fill, c.alignment = B, HEAD, W
    for r in rows: ws.append(list(r))
    for _ in range(blank): ws.append([''] * len(cols))
    for row in ws.iter_rows(min_row=2):
        for c in row: c.alignment = W
    for i, w in enumerate(widths): ws.column_dimensions[chr(65 + i)].width = w
    ws.freeze_panes = 'B2'
    last = ws.max_row
    for col, opts in (lists or {}).items():
        dv = DataValidation(type='list', formula1='"' + ','.join(opts) + '"', allow_blank=True); ws.add_data_validation(dv); dv.add(f'{col}2:{col}{max(last, 200)}')
        if 'PASS' in opts:
            ws.conditional_formatting.add(f'{col}2:{col}{max(last, 200)}', CellIsRule(operator='equal', formula=['"PASS"'], fill=GREEN))
            ws.conditional_formatting.add(f'{col}2:{col}{max(last, 200)}', CellIsRule(operator='equal', formula=['"FAIL"'], fill=RED))
        if 'Blocker' in opts:
            ws.conditional_formatting.add(f'{col}2:{col}{max(last, 200)}', CellIsRule(operator='equal', formula=['"Blocker"'], fill=RED))
            ws.conditional_formatting.add(f'{col}2:{col}{max(last, 200)}', CellIsRule(operator='equal', formula=['"Major"'], fill=AMBER))
    return ws
PF = ['PASS', 'FAIL', 'Blocked', 'Not run']
ws = wb.active; ws.title = 'Summary'
summary = [('Intelligence and accuracy test: summary', None), ('', None),
 ('Steps passed', '=COUNTIF(Scorecard!H:H,"PASS")'), ('Steps failed', '=COUNTIF(Scorecard!H:H,"FAIL")'), ('Steps not run yet', '=COUNTIF(Scorecard!H:H,"Not run")'),
 ('', None), ('Open Blockers', '=COUNTIFS(\'Defect log\'!H:H,"Blocker",\'Defect log\'!J:J,"<>Closed")'), ('Open Majors', '=COUNTIFS(\'Defect log\'!H:H,"Major",\'Defect log\'!J:J,"<>Closed")'),
 ('Open Minors', '=COUNTIFS(\'Defect log\'!H:H,"Minor",\'Defect log\'!J:J,"<>Closed")'), ('', None),
 ('Go rule', 'Every accuracy step PASS, the intelligence pass marks met, and 0 open Blockers.')]
for k, v in summary: ws.append([k, v])
ws['A1'].font = Font(bold=True, size=14); ws.column_dimensions['A'].width = 28; ws.column_dimensions['B'].width = 80
sheet('Run record', ['Run ID', 'Date', 'Tester', 'Commit', 'Config version', 'AI switches on', 'Model version', 'Prompt versions', 'As-of (score) date', 'Test set', 'Notes'],
      [('R01', '2026-11-16', 'Shantanu', '', '', 'None (all AI off)', '', '', '2026-11-16', 'Golden A, B, C; Boundary values', 'Accuracy baseline')], [7, 11, 12, 12, 12, 24, 14, 16, 12, 28, 30], blank=30)
STEPS = [
 (1, 'List checks (Prospecting)', 'Accuracy', '100% of planted issues found; 0 opted-out people contacted', 'Golden A; Boundary'),
 (2, 'Fit score', 'Accuracy', '100% match with the key', 'Golden A; Boundary; Setup pack'),
 (3, 'Signal reading', 'Accuracy', '100% match; unknown type rejected (AI off) or held as "Unrecognised" (AI on)', 'Golden A; New signals; Boundary'),
 (4, 'Tiers and ranking', 'Both', 'Tiers 100%; 8 of top 10 match each expert, or as many as the experts share', 'Golden A; Boundary; Expert set'),
 (5, 'Micro-segments', 'Both', 'Key 100%; expert agrees 9 in 10', 'Golden B; Setup pack; Boundary'),
 (6, 'Next best action and channel', 'Both', 'Avg 4+ and 80% rated 4 or 5; 0 consent breaks', 'Golden B; Expert set'),
 (7, 'First message', 'Both', '0 unapproved or expired claims; avg 4+ and 80% rated 4 or 5', 'Golden B; Content check set'),
 (8, 'Review routing', 'Accuracy', '100%; 0 risky items released', 'Golden C; Boundary; Stress pack'),
 (9, 'Copilot answers', 'Both', '18 of 20 correct; 0 made-up numbers', 'Copilot questions'),
 (10, 'Analytics (G1, G2)', 'Accuracy', 'Exact match with a hand recount', 'Decision log after the runs'),
 (11, 'Setup', 'Accuracy', '100% of Setup tests (see Setup tests sheet)', 'Setup pack'),
 (12, 'Copilot on Prospecting', 'Both', '27 of 30 correct; 0 made-up numbers or names', 'Golden A'),
 (13, 'Content library', 'Both', 'Every C test passes; generated content avg 4+', 'Content check set'),
 (14, 'Prospecting chat (Prospeo search)', 'Both', 'Right search 27 of 30; 80% of first 25 people relevant', 'Prospeo messages'),
 (15, 'Why-now lines', 'Accuracy', '0 facts not in the signal rows; no AI line for C or Watch list', 'Golden A'),
 (16, 'Industry classification', 'Accuracy', '95% of in-ICP right; 0 out-of-ICP called Core', 'Industry list'),
 (17, 'Unknown signal types', 'Both', '9 in 10 proposals right; 0 applied without approval', 'Unknown types file'),
 (18, 'AI in the Content library', 'Both', '9 of 10 planted rules found; 0 invented claims; 0 figures changed', 'Guideline doc; claims'),
 (19, 'Learning loop, outcomes, Autopilot', 'Both', 'Every expected change seen; 0 sensitive items auto-approved', 'Decision sequences'),
 (20, 'Explanations', 'Accuracy', '100% true; "move up a tier" really moves it', 'Golden A'),
 (21, 'Safety across all AI inputs', 'Accuracy', '100%; any failure is a Blocker', 'Stress pack'),
 ('BV', 'Boundary values', 'Accuracy', 'All 30 checks in the boundary answer key', 'Boundary values'),
 ('CON', 'Consistency', 'Accuracy', 'Scores and tiers identical; AI: 90% same segment, 85% same action over 3 runs', 'Golden B, run 3 times')]
sheet('Scorecard', ['Step', 'What', 'Kind', 'Pass mark', 'Test set', 'Run ID', 'Result measured', 'Pass / fail', 'Defect IDs', 'Notes'],
      [(s, n, k, p, t, '', '', 'Not run', '', '') for s, n, k, p, t in STEPS], [6, 30, 10, 48, 28, 8, 28, 11, 12, 30], lists={'H': PF})
SETUP = [('S0', 'Before any set-up', 'Only W09–W11 score; the rest Other and below the fit floor'), ('BASE', 'Full set-up from scratch (sheet 2 of the Setup answer key)', 'Open tenders 5, Compliance deadline 5, Modernisation 3; as sheet 4'),
 ('S1', 'Fit floor 50 to 70', 'Only W12 Lagoon Desal drops below the floor'), ('S2', 'Vertical 30 to 40, Plant capacity 10 to 0', '7 accounts change fit, as listed'),
 ('S3', 'Tiers A 45, B 25', 'W01–W03 to B; W06, W08 to C and out of the segment'), ('S4', 'Remove Desalination vertical', 'W12 becomes Other; fit 53.5; held'),
 ('S5', 'Remove buying role "process engineer"', 'W02, W05, W07, W10 lose fit; W02, W10 held'), ('S6', 'Remove Vietnam', 'W04, W15 excluded'),
 ('S7', 'Tender published: gone after 60 days', 'W04 and W05 lose the tender’s weight'), ('S8', 'Switch off Regulation deadline', 'W05–W08 and W15 drop; Compliance deadline segment gone'),
 ('S9', 'New signal type mapped to a new segment', 'Covered by BASE'), ('S10', 'Regulation deadline moved to Open tenders', 'Open tenders 10; Compliance deadline gone'),
 ('S11', '"+ Add a segment"', 'Covered by BASE; no approval needed'), ('S12', 'Reorder Open tenders actions', 'Its 5 accounts get "Share a reference plant…" first'),
 ('S13a', 'Deal-size threshold 0', 'Only W08 loses its deal-size reason'), ('S13b', 'Deal-size threshold USD 1m', '8 accounts held for deal size'),
 ('S15a–d', 'Invalid values', 'Each rejected, nothing saved'), ('Roles', 'Rep and sales manager permissions', 'As listed in the Setup answer key'), ('Audit', 'Audit log', 'Every change with who and when')]
sheet('Setup tests', ['Test', 'Change', 'Expected (detail in Setup_Test_3_Answer_key.xlsx, sheet 5)', 'Actual', 'Pass / fail', 'Defect IDs'], [(*r, '', 'Not run', '') for r in SETUP], [8, 38, 60, 40, 11, 12], lists={'E': PF})
CONTENT = [('C1', 'Brand guidelines', 'Upload the sample guideline'), ('C2', 'Voice and tone', 'Warm to Formal; add a guidance line'), ('C3', 'Negative keywords', 'Add a banned word and a competitor'),
 ('C4', 'Approved claims', 'Claim with a figure but no source'), ('C5', 'Approved claims', 'Claim with a spelling mistake'), ('C6', 'Approved claims', 'Expire a claim in use'),
 ('C7', 'Approved claims', 'Tag a claim to one segment'), ('C8', 'Frameworks and plays', 'Add a framework; edit a play'), ('C9', 'Content', 'Generate a piece'),
 ('C10', 'Content', 'Add to library; attach to an account'), ('C11', 'Versions', 'Restore an earlier version'), ('C12', 'Permissions', 'Sign in as a rep')]
sheet('Content tests', ['Test', 'Tab', 'Change or action', 'Expected (see the test plan)', 'Actual', 'Pass / fail', 'Defect IDs'], [(*r, '', '', 'Not run', '') for r in CONTENT], [7, 22, 36, 40, 40, 11, 12], lists={'F': PF})
sheet('Defect log', ['ID', 'Date', 'Run ID', 'Step', 'Test set and row', 'What happened', 'What should happen', 'Severity', 'Owner', 'Status', 'Re-test run', 'Notes'],
      [('D001', '2026-11-16', 'R01', '7', 'Golden B, account B07 (example: delete this row)', 'The draft cited a case study that expired in October', 'The expired claim is skipped and the next approved one used', 'Major', 'Shrihari', 'Open', '', '')],
      [7, 11, 7, 6, 26, 44, 44, 10, 11, 11, 10, 26], blank=60, lists={'H': ['Blocker', 'Major', 'Minor'], 'J': ['Open', 'Fixed', 'Re-tested', 'Closed']})
sheet('Severity guide', ['Severity', 'Means', 'Examples'], [('Blocker', 'Stops the go decision until fixed and re-tested', 'Wrong facts in a message; a risky or sensitive item released; an opted-out person contacted; a made-up number or name; a hidden instruction followed'),
 ('Major', 'Wrong result a person would act on', 'Wrong tier, segment or action; a rating of 1 that is not a Blocker; a Setup change with the wrong effect'), ('Minor', 'Wording or display', 'Awkward phrasing; a label or layout issue')], [12, 40, 90])
wb.save(OUT); print('written')
