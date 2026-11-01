"""Writes Prospect_to_Signal_Map.xlsx: for every prospect list in the three test packs, the signal file to use with it.
Usage: python3 make_signal_map.py   (run from test-data/)"""
import json, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

F = 'Arial'
thin = Side(style='thin', color='FFBFBFBF'); B = Border(left=thin, right=thin, top=thin, bottom=thin)
HDR = PatternFill('solid', fgColor='FF1F1F1F'); SAME = PatternFill('solid', fgColor='FFF2F2F2')
AS_OF = '2026-10-20'
LT, ST = 'Lead template', 'Signal template'
rows = []
def add(pack, lst, lsheet, sig, ssheet, asof, how, key, note=''):
    rows.append([pack, lst, lsheet, sig, ssheet, asof, how, key, note])

# upload-test-pack
U = 'upload-test-pack'
for f in sorted(os.listdir(f'{U}/1-Prospecting')):
    if f.endswith('_SIGNALS.xlsx') or not f.endswith('.xlsx'): continue
    sig = f.replace('.xlsx', '_SIGNALS.xlsx')
    if os.path.exists(f'{U}/1-Prospecting/{sig}'):
        add(U + '/1-Prospecting', f, LT, sig, ST, AS_OF, 'Account Scoring: "Upload a prospect file" = the list; drop the signal file on box 2.',
            'Expected_Results.xlsx: "Prospecting rows", "Signal rows", "Scoring accounts"')
    else:
        add(U + '/1-Prospecting', f, '(see the file)', 'None', '', '', 'Prospecting only.', 'Expected_Results.xlsx: "Files"',
            'The list loads nothing on purpose (wrong file, no company column, or empty), so there is nothing to score.')
for folder in ('2-Account-Scoring', '3-Signal-rules'):
    for f in sorted(os.listdir(f'{U}/{folder}')):
        if f.startswith('S00') or not f.endswith('.xlsx'): continue
        note = 'Also score on 2026-12-20 and 2027-04-20 to see signals fade.' if f.startswith('S01') else \
               'Setup test: switch off "Content download" in Setup and score again.' if f.startswith('G01') else ''
        add(f'{U}/{folder}', 'S00_prospect_list_for_scoring_and_signals.xlsx', LT, f, ST, AS_OF,
            'Upload S00 once as the prospect file (it is saved as a list); then choose that list and drop the signal file on box 2.',
            'Expected_Results.xlsx: "Signal rows", "Scoring accounts"', note)
for f in sorted(os.listdir(f'{U}/4-Micro-segments-and-Review')):
    add(f'{U}/4-Micro-segments-and-Review', f, LT, f + ' (same file)', ST, AS_OF, 'Upload the file as the prospect file, then drop the same file as the signals; send on to Micro-segments.',
        'poc-test-sets answer keys (TS6, TS8, TS9, TS10)')
# poc-test-sets
P = 'poc-test-sets'
add(P, 'TS1_End_to_end.xlsx', LT, 'TS1_End_to_end.xlsx (same file)', ST, AS_OF, 'Prospecting, save as "TS1"; Scoring with that list; drop the same file.', 'TS1: "Answer key - accounts", "Answer key - signals"')
add(P, 'TS1_End_to_end.xlsx', LT, 'TS3_Signal_edge_cases.xlsx', ST, AS_OF, 'Use the saved "TS1" list; drop TS3 on box 2.', 'TS3: "Answer key - signals"')
for d in ('2026-11-20', '2026-12-20', '2027-01-20', '2027-04-20'):
    add(P, 'TS1_End_to_end.xlsx', LT, 'TS1_End_to_end.xlsx (same file)', ST, d, f'Use the saved "TS1" list; Score as of {d}.', 'TS11_Score_date_answer_key.xlsx')
add(P, 'TS2_Prospecting_edge_cases.xlsx', LT, 'None', '', '', 'Prospecting only.', 'TS2: "Answer key - rows"', 'Prospecting checks only; carry TS1 forward instead.')
add(P, 'TS4_Microsegments_from_file.xlsx', '(none: prospects and signals in one sheet)', 'TS4_Microsegments_from_file.xlsx (same file)', 'Prospects with signals', AS_OF,
    'Micro-segments & NBA > "Upload a CSV…". Optional: only if lists scored outside the POC are in scope.', 'TS4: "Answer key"')
for f in ('TS6_Segment_boundaries.xlsx', 'TS7_Scoring_boundaries.xlsx', 'TS8_Contactability_and_channel.xlsx', 'TS9_For_Review_routing.xlsx',
          'TS10_Rep_ownership.xlsx', 'TS12_Realistic_mixed_list.xlsx'):
    add(P, f, LT, f + ' (same file)', ST, AS_OF, 'Prospecting (or Scoring upload) with the file; then drop the same file as the signals.', f.split('_')[0] + ': "Answer key - accounts"')
# golden-set
add('golden-set', 'Golden_1_Prospects.xlsx', LT, 'Golden_2_Signals.xlsx', ST, AS_OF,
    'Prospecting with Golden_1; Scoring with the saved list and Golden_2; "Send tier A and B to NBA"; then For Review.', 'Golden_3_Answer_key.xlsx')
# realistic-sets
R = 'realistic-sets'
for f in sorted(os.listdir(R)):
    if not f.startswith('R') or 'Guide' in f or not f.endswith('.xlsx'): continue
    asof = '2026-10-27' if f.startswith('R4') else AS_OF
    add(R, f, LT, f + ' (same file)', ST, asof, 'Upload the file as the prospect list, then drop the same file as the signals.', f.split('_')[0] + ': "Answer key - summary", "Answer key - accounts"',
        'Run after R2, once you have decided R2\'s items in For Review.' if f.startswith('R4') else '')

wb = Workbook(); ws = wb.active; ws.title = 'Map'
hdr = ['#', 'Pack / folder', 'Prospect list (file)', 'Sheet with the leads', 'Signal file to use', 'Sheet with the signals', 'Score as of', 'How to run it',
       'Answer key', 'Notes', 'Status']
ws.append(hdr)
for i, r in enumerate(rows, 1): ws.append([i] + [v if v != '' else None for v in r] + ['Not run'])
for c in ws[1]:
    c.font = Font(name=F, size=10, bold=True, color='FFFFFFFF'); c.fill = HDR; c.border = B; c.alignment = Alignment(wrap_text=True, vertical='center')
for row in ws.iter_rows(min_row=2):
    for c in row:
        c.font = Font(name=F, size=10, color='FF0000FF' if c.column == 11 else 'FF000000'); c.border = B; c.alignment = Alignment(wrap_text=True, vertical='top')
    if 'same file' in str(row[4].value).lower(): row[4].fill = SAME
for i, w in enumerate([5, 30, 46, 16, 46, 18, 11, 56, 40, 44, 11]): ws.column_dimensions[ws.cell(1, i + 1).column_letter].width = w
ws.freeze_panes = 'C2'; ws.auto_filter.ref = ws.dimensions
dv = DataValidation(type='list', formula1='"Not run,Pass,Fail,Blocked,Not in scope"', allow_blank=True); ws.add_data_validation(dv); dv.add(f'K2:K{ws.max_row}')
hw = wb.create_sheet('How to use', 0); hw.column_dimensions['A'].width = 120
for i, l in enumerate([
        'Which signal file goes with which prospect list',
        'A signal file only works with the list it was made for: its company names and people must be on that list, or every row is rejected as "not in the list".',
        'Find the prospect list in column C and use the signal file in column E, with the Score as of date in column G.',
        '"(same file)" means the workbook holds both: it reads "Lead template" when uploaded as the prospect list, and "Signal template" when dropped as the signals.',
        'upload-test-pack/1-Prospecting: each list has its own signal file with the same name plus _SIGNALS.',
        'upload-test-pack/2 and 3: every S and G signal file goes with one list, S00. Upload S00 once; it stays saved in Account Scoring.',
        f'{len(rows)} pairings in total.'], 1):
    c = hw.cell(i, 1, l); c.font = Font(name=F, size=11 if i == 1 else 10, bold=i == 1); c.alignment = Alignment(wrap_text=True, vertical='top')
wb.save('Prospect_to_Signal_Map.xlsx')
print(len(rows), 'pairings')
