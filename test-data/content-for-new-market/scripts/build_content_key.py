"""Builds Content_Test_Answer_key.xlsx from the spec and the engine's output (run_content.mts).
Usage: python3 build_content_key.py <spec.json> <out.json> <out folder>"""
import json, os, sys
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
spec, out, OUT = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), sys.argv[3]
runs = {r['id']: r for r in out['runs']}; meta = {r['id']: r for r in spec['brandRuns']}
B = Font(bold=True); WRAP = Alignment(wrap_text=True, vertical='top'); HEAD = PatternFill('solid', fgColor='DCE6F1')
wb = Workbook()
def sheet(title, cols, rows, widths):
    ws = wb.create_sheet(title); ws.append(cols)
    for c in ws[1]: c.font = B; c.fill = HEAD
    for r in rows: ws.append(r)
    for i, w in enumerate(widths): ws.column_dimensions[chr(65 + i)].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row: c.alignment = WRAP
    ws.freeze_panes = 'A2'; return ws
def short(r):
    s = f"{r['channel']}" + (f" with {r['claim']}" if r['claim'] else '') + f"; {r['route']}"
    return s + (f" ({'; '.join(r['reasons'])})" if r['reasons'] else '')
def diff(a, b):
    A = {r['account']: r for r in runs[a]['recs']}; lines = []
    for r in runs[b]['recs']:
        p = A[r['account']]; ch = []
        for k, lab in [('channel', 'Draft'), ('claim', 'Claim'), ('route', 'Route')]:
            if p[k] != r[k]: ch.append(f"{lab}: {p[k] or '—'} → {r[k] or '—'}")
        if p['reasons'] != r['reasons']: ch.append(f"Held for: {'; '.join(p['reasons']) or '—'} → {'; '.join(r['reasons']) or '—'}")
        if p['flags'] != r['flags'] and r['flags']: ch.append('Flag: ' + '; '.join(f for f in r['flags'] if f not in p['flags']))
        if p['body'] != r['body'] and r['channel'] == 'Email' and p['channel'] == 'Email' and not ch: ch.append('Text changes (see sheet 5)')
        if p['angle'] != r['angle']: ch.append(f"Brief angle: {p['angle']} → {r['angle']}")
        if ch: lines.append(f"{r['account']}: " + '; '.join(ch))
    return '\n'.join(lines) or 'Nothing changes'
# 1 How to run
ws = wb.active; ws.title = '1 How to run'
for r in [('#', 'Do', 'Expect'),
 (1, 'Finish the setup-from-scratch test first (BASE on sheet 2 of Setup_Test_3_Answer_key.xlsx): same prospect and signal files, score date 16 Nov 2026, all AI off. Content library at its starting version.', 'Run C0 on sheet 4: Open tenders and Compliance deadline items are Tasks for the account owner, because no claim fits those segments yet. Modernisation items are emails with CS-01.'),
 (2, 'Content library: make the change for C1 (sheet 2 has the exact wording), publish it, then Micro-segments: build again.', 'Sheet 3, test CN for that run: only the accounts listed change, exactly as listed. Every other item stays as before.'),
 (3, 'Carry on in order. C1 to C7 build on each other. C8 to C15 each start from C7: make the one change, publish, build, compare, then restore the C7 version in Versions (that is test CN-22).', 'Sheet 4 has every item for every run; sheet 5 the full text of each draft at C7.'),
 (4, 'Type each line from sheet 6 into a Content studio piece and into a message in For Review.', 'Each flagged exactly as listed.'),
 (5, 'Manual tests on sheet 3 (claim form checks, versions, roles).', 'As listed.'),
 (6, 'Log anything different in the Defect log of Scorecard_and_Defect_Log.xlsx (step 13).', ''),
 ('Note', 'Every expected result comes from the latest app code, run with the same content library (scripts/run_content.mts). Read sheet 7 before you start: three places where the code suggests a test will fail.', '')]:
    ws.append(r)
for c in ws[1]: c.font = B; c.fill = HEAD
for col, w in zip('ABC', (6, 90, 90)): ws.column_dimensions[col].width = w
for row in ws.iter_rows(min_row=2):
    for c in row: c.alignment = WRAP
# 2 What to enter
rows = []
for c in spec['claims'].values():
    rows.append(('Approved claims', c['id'] + ' (the library gives its own ID: note it)', f"{c['claim']}\nType {c['type']}, {c['year']}; title: {c['title']}; segment: {', '.join(c['segments'])}; expires {c['expiry']}; status {c['status']}"))
for k, p in spec['plays'].items():
    rows.append(('Plays by situation', k, f"Angle: {p['angle']}\nObjection: {p['objection']}\nAnswer: {p['response']}"))
for rid in ['C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C13', 'C14', 'C15']:
    rows.append(('Change for ' + rid, meta[rid]['what'], 'Starting point: ' + (meta[rid].get('from') or 'start')))
sheet('2 What to enter', ['Content library tab', 'Item', 'Exactly what to enter'], rows, [22, 46, 110])
# 3 Test cases
T = []
def t(i, area, do, exp, pri='High'): T.append([i, area, do, exp, pri, 'Not run', '', ''])
t('CN-01', 'Before content', 'Run C0: after the Setup BASE, build Micro-segments with the starting library', 'Open tenders and Compliance deadline items: Task for the account owner, "No approved claim for <segment>". Modernisation: email with CS-01.\n' + '\n'.join(f"{r['account']}: {short(r)}" for r in runs['C0']['recs']))
t('CN-02', 'Claims', 'Add a claim: is "Open tenders" offered as a micro-segment to tick?', 'Yes: the new segments from Setup are offered next to the six starting ones. (See sheet 7: the code lists only the six starting segments.)')
t('CN-03', 'Claims', 'C1: add WT-01 tagged Open tenders; publish; build', diff('C0', 'C1'))
t('CN-04', 'Claims', 'C2: add WT-02, already expired', diff('C1', 'C2') + '\nThe library shows WT-02 as Expired. The Compliance deadline tasks say "No approved claim for Compliance deadline (WT-02 expired 31 Oct 2026)".')
t('CN-05', 'Claims', 'C3: add WT-03 as a draft. It has a figure (20%) with no figure source', 'Adding it as approved is refused: "A figure with no source …"; you can add it as a draft. ' + diff('C2', 'C3') + ': a draft claim is never used.')
t('CN-06', 'Claims', 'C4: add WT-04 tagged Compliance deadline', diff('C3', 'C4'))
t('CN-07', 'Claims', 'C5: add WT-05 as retired', diff('C4', 'C5') + ': a retired claim is never used.')
t('CN-08', 'Voice and tone', 'C6: Direct to Formal', diff('C5', 'C6').replace('Text changes (see sheet 5)', 'opens "Dear <first>," and closes "Kind regards,"'))
t('CN-09', 'Voice and tone', 'C7: sign-off to Client Water Team', diff('C6', 'C7').replace('Text changes (see sheet 5)', 'last line "Client Water Team"'))
t('CN-10', 'Voice and tone', 'C8 (from C7): banned opener "Noticed"', diff('C7', 'C8'))
t('CN-11', 'Negative keywords', 'C9 (from C7): negative keyword "SCADA"', diff('C7', 'C9') + '\nOnly the two drafts whose signal mentions SCADA are held.')
t('CN-12', 'Voice and tone', 'C10 (from C7): email length 40 words', diff('C7', 'C10') + '\nThe Open tenders and Compliance emails are 31 to 36 words, so they stay released.')
t('CN-13', 'Voice and tone', 'C11 (from C7): sentence length 12 words', diff('C7', 'C11'))
t('CN-14', 'Plays', 'C12 (from C7): add the plays for Open tenders and Compliance deadline', diff('C7', 'C12') + '\nThe email text does not change: the play feeds the brief and the call script (objection and answer). Before, these segments used the Engagement play.')
t('CN-15', 'Claims', 'C13 (from C7): retire CS-01, a claim in use', diff('C7', 'C13') + '\nApproved claims: CS-01 shows Retired; its "where used" no longer lists new items.')
t('CN-16', 'Claims', 'C14 (from C7): WT-01 expiry to yesterday (15 Nov 2026)', diff('C7', 'C14') + '\nThe tasks say "No approved claim for Open tenders (WT-01 expired 15 Nov 2026)".')
t('CN-17', 'Negative keywords', 'C15 (from C7): competitor Hydrolux', 'No draft changes (no draft names Hydrolux). Sheet 6 line 2 is flagged "Competitor name".')
t('CN-18', 'Checks', 'Sheet 6: type each line in Content studio', 'Each flagged exactly as listed on sheet 6')
t('CN-19', 'Checks', 'Sheet 6: type the same lines into a message in For Review', 'Flagged the same way as in Content studio')
t('CN-20', 'Claims', 'Add a claim with no segment ticked whose words name no topic, e.g. "A utility met its new limits on time."', 'Refused: "This claim names no topic: tick the micro-segments it fits"')
t('CN-21', 'Claims', 'Add a claim with a spelling mistake, AI on: "A gap asessment takes three days on site."', 'Refused until fixed: "Spelling or grammar to fix first …", with the correction offered; or add it as a draft', 'Medium')
t('CN-22', 'Versions', 'After each of C8 to C15: Versions, restore the C7 version, build again', 'Every item matches run C7 on sheet 4. Drafts written earlier keep the version they were written with.')
t('CN-23', 'Versions', 'Open Versions after the run', 'One version per publish, each with who, when and what changed, section by section')
t('CN-24', 'Roles', 'Sign in as a rep; then as a sales manager', 'Rep: can read the Content library, cannot edit or publish. Sales manager: as set in Setup roles (note what you see)', 'Medium')
t('CN-25', 'Drafts', 'At C7, read every email on sheet 5', 'Each claim word for word, no citation; one ask; Formal greeting and close; Client Water Team')
ws = sheet('3 Test cases', ['ID', 'Area', 'Do this', 'Expected', 'Priority', 'Status', 'Actual', 'Defect IDs'], T, [8, 16, 46, 90, 9, 10, 40, 12])
dv = DataValidation(type='list', formula1='"Not run,Pass,Fail,Blocked"'); ws.add_data_validation(dv); dv.add(f'F2:F{len(T)+1}')
# 4 Expected by run
rows = []
for rid, r in runs.items():
    for x in r['recs']:
        rows.append([rid, meta[rid]['what'], x['account'], x['contact'], x['segment'], x['action'], x['channel'], x['claim'] or '—', x['route'], '; '.join(x['reasons']) or '—', '; '.join(x['flags']) or '—', x['taskWhy'] or '—'])
sheet('4 Expected by run', ['Run', 'Change', 'Account', 'Contact', 'Segment', 'Action', 'Draft', 'Claim', 'Route', 'Held for', 'Check flags', 'Why a task'], rows, [6, 40, 22, 14, 18, 36, 8, 8, 11, 40, 36, 40])
# 5 Draft text
rows = []
for rid in ['C0', 'C7']:
    for x in runs[rid]['recs']:
        rows.append([rid, x['account'], x['channel'], x['subject'] or '—', x['body'] or x['task'], x['words'] or '—', x['angle'], x['objection'], x['response']])
for x in runs['C12']['recs'][:10]:
    rows.append(['C12', x['account'], 'Brief and call script', '—', '(email as at C7)', '—', x['angle'], x['objection'], x['response']])
sheet('5 Draft text', ['Run', 'Account', 'Draft', 'Subject', 'Text', 'Words', 'Brief: angle', 'Objection', 'Answer (call script)'], rows, [6, 22, 10, 16, 70, 7, 36, 30, 40])
# 6 Words to type
rows = []
for i, x in enumerate(out['typed'], 1):
    exp = '; '.join(x['flags']) if x['flags'] else ''
    if x['unsupported']: exp += ('; ' if exp else '') + "Claim can't be verified: " + '; '.join(x['unsupported'])
    if x['verified']: exp += ('; ' if exp else '') + 'Verified claim: ' + '; '.join(x['verified'])
    rows.append([i, x['pack'], x['text'], exp or 'Nothing flagged', '', ''])
sheet('6 Words to type', ['#', 'Library at', 'Type this', 'The check should show', 'Actual', 'Pass / fail'], rows, [5, 10, 60, 80, 30, 10])
# 7 Watch for
rows = [
 ('Claims for new segments', 'The claim form lists only the six starting micro-segments (CLAIM_SEGMENTS in lib/content/brand.ts comes from the fixed segment library), and a claim\'s words are matched only to those six. So a claim cannot be tagged "Open tenders" or "Compliance deadline".', 'CN-02 fails, and CN-03/CN-06 cannot be done in the screen: every Open tenders and Compliance item stays a Task. Log it as a Major defect: a new segment from Setup can never get a message.'),
 ('Compliance items leave Approvals', 'At C0 the Compliance deadline items are in Approvals only because the task text names the action "Offer a compliance gap assessment". Once WT-04 gives them an email (C4), no word in the email is a sensitive term, so they are released.', 'Expected by the code (sheet 4). Raise with Pavan whether regulation-driven messages should always need the sales manager; if yes, it needs a rule on the signal type, not on the words.'),
 ('Wording for new signal types', 'Emails for a signal type added in Setup open "Noticed <detail>." and have the subject "quick question"; new actions get the generic ask "Worth a conversation?".', 'Works, but reads poorly ("Noticed tender for SCADA upgrade…"). Log as Minor; rate it in step 7 (first message).'),
 ('Retired claim typed in', 'Typing WT-05\'s retired wording is not flagged: it has no figure or improvement word, so the check does not see it as a claim.', 'Expected by the code (sheet 6, line 11). Note it if you think a retired claim\'s wording should always be flagged.')]
sheet('7 Watch for', ['What', 'What the code does', 'What it means for the test'], rows, [26, 90, 80])
os.makedirs(OUT, exist_ok=True); wb.save(os.path.join(OUT, 'Content_Test_Answer_key.xlsx')); print('ok', len(T), 'cases')
