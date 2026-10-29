"""Builds the Content library test pack: one brand guideline in two styles and five formats, a claims sheet, a
messaging-frameworks sheet, and the test cases with what to expect today and after the AI change.
Usage: python3 make_content_pack.py <pack folder> <rules_today.json from read_rules.mjs, or nothing on the first pass>"""
import json, os, subprocess, sys, tempfile
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule

OUT = sys.argv[1]
TODAY = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
os.makedirs(os.path.join(OUT, 'guidelines'), exist_ok=True)

# ───────── The guideline's content (fictional; the client is "Client") ─────────
RULES = [  # what the guideline says, and what should end up in the library
    ('Negative keyword', 'synergy'), ('Negative keyword', 'world-class'), ('Negative keyword', 'game-changing'), ('Negative keyword', 'revolutionary'),
    ('Negative keyword', 'best-in-class'), ('Negative keyword', 'cutting-edge'), ('Competitor', 'Rivalco'), ('Competitor', 'Acmetrol'),
    ('Competitor', 'Northstar Controls'), ('Voice', 'Formal'), ('Banned opener', 'Just checking in'), ('Banned opener', 'I hope this email finds you well'),
    ('Rule', 'No exclamation marks'), ('Email length', '110'), ('Sentence length', '22'), ('Sign-off', 'Client Process Automation Team'),
]
WRITING = [  # guidance only an AI can apply: there is no field for it in the library today
    'Use British English spelling (modernise, programme, organisation).',
    "Name the customer's site or unit when the signal gives it, never just the company.",
    'Never promise a delivery date, a price or a saving.',
    'Write for an engineer: name the system or the unit, not "your operations".',
]
PLAYS = [  # messaging framework per segment: angle, likely objection and the answer
    ('Inquiry', 'Answer the question they asked while it is still live, and offer a specialist.', 'We are only gathering information for now.', 'A short call now saves a round of back-and-forth later, with no commitment.'),
    ('Modernisation', 'Plan the move around one shutdown so the order of work is settled early.', 'The current system still works.', 'It works today; spares and support end on a known date, so planning now keeps the choice yours.'),
    ('Service renewal', 'Check the cover still matches how the site runs before renewing.', 'We just renew what we had.', 'A short review often finds cover the site no longer needs and gaps it now has.'),
    ('Project', 'Fix the control scope at front-end design, before it is expensive to change.', 'It is too early to talk about control systems.', 'Front-end design is when control decisions are cheapest to make.'),
    ('Leadership', 'Offer something useful for a new leader\'s first months, then a light ask.', 'I am still finding my feet.', 'That is why we keep it short: one page on what peers prioritised first.'),
    ('Engagement', 'Build on the topic they engaged with and relate it to their site.', 'I was just browsing.', 'Then one practical example from a comparable site may be useful, nothing more.'),
]
FRAMEWORKS = [  # objective, name, steps, how often, what the reader is asked to do
    ('Book a first meeting', 'Trigger, insight, ask', ['Their trigger: the signal that makes it timely', 'One insight or one approved claim', 'One clear ask'], 'Often', 'Book a meeting; reply'),
    ('Answer an inquiry', 'Question, answer, next step', ['Restate what they asked', 'Answer it in two sentences', 'Offer a short call with a specialist'], 'Often', 'Request a call'),
    ('Start a migration conversation', 'Problem, cost of waiting, approach', ['The problem they face', 'What waiting costs them', 'The approach that solves it'], 'Sometimes', 'Book a meeting; read a guide'),
    ('Introduce ourselves to a new leader', 'Give, then ask', ['Something useful for their first months', 'A light ask'], 'Sometimes', 'Read content; book a meeting'),
]
TITLE = 'Client brand and messaging guideline (test copy)'
ABOUT = ('Client supplies process control and safety systems to refineries, petrochemical plants and gas processors in Southeast Asia. '
         'Our customers are engineers and plant leaders who value specifics over slogans.')
NOT_RULES = ['Our customers are refiners and petrochemical producers across Southeast Asia.', 'Use the approved claims library for any number you quote.']

def structured_md():
    """Style A: one rule per line, written the way the POC's rules parser reads them."""
    L = [f'# {TITLE}', '', ABOUT, '', '## Words to avoid', '- Never use: synergy, world-class, game-changing, revolutionary', '- Avoid: best-in-class, cutting-edge',
         '- Competitors: Rivalco, Acmetrol', '- Do not mention Northstar Controls', '', '## Voice', '- Tone: formal',
         '- Never open with: Just checking in, I hope this email finds you well', '- No exclamation marks.', '', '## Length',
         '- Keep emails under 110 words.', '- Keep sentences under 22 words.', '', '## Sign-off', '- Always sign off as: Client Process Automation Team', '',
         '## Writing guidance'] + [f'- {w}' for w in WRITING] + ['', '## Messaging by situation']
    for seg, angle, obj, resp in PLAYS: L += [f'### {seg}', f'- Angle: {angle}', f'- Likely objection: "{obj}"', f'- Answer: {resp}', '']
    L += ['## Messaging frameworks']
    for o, n, steps, use, ask in FRAMEWORKS: L += [f'### {o}: {n} ({use})', *[f'{i}. {s}' for i, s in enumerate(steps, 1)], f'Ask the reader to: {ask}', '']
    L += ['## Not rules (should not be picked up)', *NOT_RULES]
    return '\n'.join(L) + '\n'

def narrative_paragraphs():
    """Style B: the same rules written as a marketing team would, in prose. The rules parser reads almost none of it."""
    P = [('h1', TITLE), ('p', ABOUT),
         ('h2', 'How we sound'),
         ('p', 'We write in a formal register: complete sentences, courteous, never chatty. A busy engineer should be able to read any sentence at a glance, so we keep each one to '
               'twenty-two words at most, and a whole email stays within a hundred and ten. We never end a sentence with an exclamation mark.'),
         ('p', 'Please steer clear of hype. Words such as synergy, world-class, game-changing and revolutionary have no place in our writing, and the same goes for '
               '"best-in-class" and "cutting-edge". Openings like "Just checking in" or "I hope this email finds you well" waste the reader\'s first line, so we never use them.'),
         ('p', 'We do not talk about other suppliers. In particular, Rivalco, Acmetrol and Northstar Controls are never named in anything we send.'),
         ('p', 'Every message closes with the team name, Client Process Automation Team, rather than an individual\'s name.'),
         ('h2', 'Writing for engineers'), *[('p', w) for w in WRITING],
         ('h2', 'What we say in each situation')]
    for seg, angle, obj, resp in PLAYS: P.append(('p', f'{seg}: {angle} If they say "{obj}", we answer: {resp}'))
    P.append(('h2', 'How we structure a message'))
    for o, n, steps, use, ask in FRAMEWORKS: P.append(('p', f'To {o[0].lower() + o[1:]} ({use.lower()}), we use "{n}": ' + '; then '.join(s[0].lower() + s[1:] for s in steps) + f'. We ask the reader to {ask[0].lower() + ask[1:].replace("; ", " or ")}.'))
    P += [('h2', 'Background'), *[('p', t) for t in NOT_RULES]]
    return P

def md_to_paras(md):
    out = []
    for line in md.splitlines():
        if not line.strip(): continue
        if line.startswith('### '): out.append(('h3', line[4:]))
        elif line.startswith('## '): out.append(('h2', line[3:]))
        elif line.startswith('# '): out.append(('h1', line[2:]))
        elif line.startswith('- '): out.append(('li', line[2:]))
        else: out.append(('p', line))
    return out

def write_docx(paras, path):
    import docx
    d = docx.Document()
    for k, t in paras:
        if k == 'h1': d.add_heading(t, 0)
        elif k == 'h2': d.add_heading(t, 1)
        elif k == 'h3': d.add_heading(t, 2)
        elif k == 'li': d.add_paragraph(t, style='List Bullet')
        else: d.add_paragraph(t)
    d.save(path)

def write_pptx(paras, path):
    from pptx import Presentation
    from pptx.util import Pt
    prs = Presentation(); slide = None; body = None
    for k, t in paras:
        if k in ('h1', 'h2') or slide is None or (body is not None and len(body.paragraphs) > 9):
            slide = prs.slides.add_slide(prs.slide_layouts[1]); slide.shapes.title.text = t if k in ('h1', 'h2') else 'continued'
            body = slide.placeholders[1].text_frame; body.clear(); first = True
            if k in ('h1', 'h2'): continue
        p = body.paragraphs[0] if first else body.add_paragraph(); first = False
        p.text = t; p.font.size = Pt(14 if k != 'h3' else 16); p.font.bold = k == 'h3'
    prs.save(path)

def to_pdf(docx_path, out_dir):
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', out_dir, docx_path], check=True, capture_output=True, timeout=180)

G = os.path.join(OUT, 'guidelines')
md = structured_md()
open(os.path.join(G, 'A_structured_guideline.md'), 'w').write(md)
open(os.path.join(G, 'A_structured_guideline.txt'), 'w').write(md.replace('### ', '').replace('## ', '').replace('# ', ''))
write_docx(md_to_paras(md), os.path.join(G, 'A_structured_guideline.docx'))
write_pptx(md_to_paras(md), os.path.join(G, 'A_structured_guideline.pptx'))
to_pdf(os.path.join(G, 'A_structured_guideline.docx'), G)
nar = narrative_paragraphs()
open(os.path.join(G, 'B_narrative_guideline.txt'), 'w').write('\n\n'.join(t for _, t in nar) + '\n')
write_docx(nar, os.path.join(G, 'B_narrative_guideline.docx'))
to_pdf(os.path.join(G, 'B_narrative_guideline.docx'), G)
FILES = ['A_structured_guideline.md', 'A_structured_guideline.txt', 'A_structured_guideline.docx', 'A_structured_guideline.pdf', 'A_structured_guideline.pptx',
         'B_narrative_guideline.txt', 'B_narrative_guideline.docx', 'B_narrative_guideline.pdf']
json.dump({'files': FILES, 'texts': {f: open(os.path.join(G, f)).read() for f in FILES if f.endswith(('.md', '.txt'))}}, open(os.path.join(OUT, 'scripts', 'texts.json'), 'w'))
if TODAY is None:
    print('guidelines written; now run read_rules.mjs, then this script again with its output'); sys.exit(0)

# ───────── Workbook ─────────
F = 'Arial'; thin = Side(style='thin', color='FFBFBFBF'); B = Border(left=thin, right=thin, top=thin, bottom=thin); HDR = PatternFill('solid', fgColor='FF1F1F1F')
def sheet(wb, title, head, rows, widths, status_col=None, first=False):
    ws = wb.active if first else wb.create_sheet(title); ws.title = title; ws.append(head)
    for r in rows: ws.append(r)
    for row in ws.iter_rows():
        for c in row:
            c.font = Font(name=F, size=10, bold=c.row == 1, color='FFFFFFFF' if c.row == 1 else 'FF000000'); c.border = B; c.alignment = Alignment(wrap_text=True, vertical='top')
            if c.row == 1: c.fill = HDR
    for i, w in enumerate(widths): ws.column_dimensions[ws.cell(1, i + 1).column_letter].width = w
    ws.freeze_panes = 'B2'
    if status_col and ws.max_row > 1:
        n = ws.max_row; dv = DataValidation(type='list', formula1='"Not run,Pass,Fail,Blocked"', allow_blank=True); ws.add_data_validation(dv); dv.add(f'{status_col}2:{status_col}{n}')
        for r in range(2, n + 1):
            ws[f'{status_col}{r}'] = 'Not run'
            for col in range(ws[f'{status_col}{r}'].column, len(head) + 1): ws.cell(r, col).font = Font(name=F, size=10, color='FF0000FF')
        for t, col in (('Pass', 'FFE2F0D9'), ('Fail', 'FFF8D7DA'), ('Blocked', 'FFFFF2CC')):
            ws.conditional_formatting.add(f'{status_col}2:{status_col}{n}', FormulaRule(formula=[f'${status_col}2="{t}"'], fill=PatternFill('solid', fgColor=col)))
    return ws

wb = Workbook()
# Files and what the parser finds today vs what the AI should find
frows = []
for f in FILES:
    found = TODAY.get(f)
    today = 'No rules suggested (only .txt and .md are read)' if found is None else f'{len(found)} of 16 rules suggested: ' + '; '.join(f'{k}: {v}' for k, v in found)
    frows.append([f, 'Structured: one rule per line' if f.startswith('A_') else 'Narrative: rules written in prose', today,
                  'All 16 rules suggested for a person to confirm; the writing guidance, the six situation plays and the four frameworks read into their tabs; the two "Background"/"Not rules" lines ignored', 'Not run', ''])
sheet(wb, 'Guideline files', ['File', 'Style', 'TODAY: what the rules parser suggests', 'AFTER the AI change: what should be suggested', 'Status', 'What actually happened'],
      frows, [30, 26, 70, 70, 11, 30], status_col='E', first=True)
sheet(wb, 'Expected rules', ['Kind of rule', 'Value', 'Library tab it lands in'],
      [[k, v, {'Negative keyword': 'Negative keywords', 'Competitor': 'Negative keywords (competitors)', 'Sign-off': 'Voice and tone', 'Voice': 'Voice and tone', 'Banned opener': 'Voice and tone',
               'Rule': 'Voice and tone', 'Email length': 'Voice and tone', 'Sentence length': 'Voice and tone'}[k]] for k, v in RULES]
      + [['Writing guidance (AI only)', w, 'Voice and tone: notes'] for w in WRITING], [26, 60, 34])
sheet(wb, 'Messaging plays', ['Micro-segment', 'Angle', 'Likely objection', 'Answer', 'Expect in a message for that segment'],
      [[s, a, o, r, 'The opening follows the angle; the objection and answer appear in the call script and brief'] for s, a, o, r in PLAYS], [16, 50, 34, 50, 40])
sheet(wb, 'Messaging frameworks', ['Objective', 'Framework', 'Steps', 'How often', 'Ask the reader to', 'Expect'],
      [[o, n, ' → '.join(s), u, a, 'After the change: a message with this objective follows these steps in order and ends with this ask'] for o, n, s, u, a in FRAMEWORKS], [30, 30, 60, 10, 26, 46])
CLAIMS = [
    ('CL-T1', 'Case study', 2026, 'Two-shutdown migration at a coastal refinery', 'A comparable refinery moved its crude unit to a current control platform within one planned shutdown.', '2027-12-31', 'approved',
     'Modernisation emails (end of support)', 'Used word for word, without a citation'),
    ('CL-T2', 'One-pager', 2026, 'Renewal review checklist', 'A renewal review takes one hour and lists the cover the site no longer needs.', '2027-06-30', 'approved',
     'Service renewal emails', 'Used word for word'),
    ('CL-T3', 'Case study', 2025, 'Front-end design on a gas plant expansion', 'On a comparable gas plant expansion, settling the control scope at front-end design kept the project on schedule.', '2027-12-31', 'approved',
     'Project emails', 'Used word for word'),
    ('CL-T4', 'Datasheet', 2026, 'Alarm rationalisation results', 'Sites that rationalised their alarms cut nuisance alarms by about a third in the first year.', '2027-12-31', 'approved',
     'Emails after the alarm management webinar or checklist download', 'TODAY: its words fit no segment keyword, so it can be used anywhere; AFTER: picked only where the signal is about alarms'),
    ('CL-T5', 'Brochure', 2025, 'Old lifecycle brochure', 'Lifecycle plans can cover upgrades as well as support.', '2026-09-30', 'approved',
     'Nowhere: expired on 30 Sep 2026', 'Shown as Expired; never used; an action that needs proof and has no other becomes a task'),
    ('CL-T6', 'Peer story', 2026, 'New leader peer story (draft)', 'A new plant director set three automation priorities in their first month.', '2027-12-31', 'draft',
     'Nowhere until approved', 'Shown as Draft; never used'),
    ('CL-T7', 'Case study', 2024, 'Retired migration story', 'A refinery replaced its legacy system without any unplanned downtime.', '2027-12-31', 'retired',
     'Nowhere', 'Shown as Retired; never used'),
]
sheet(wb, 'Claims to add', ['ID (the library gives its own)', 'Type', 'Year', 'Title', 'Claim, word for word', 'Expiry', 'Status', 'Where it should be used', 'Expected'],
      [list(c) for c in CLAIMS], [12, 14, 6, 34, 60, 11, 10, 34, 50])
NEG_TESTS = [('synergy', 'Banned word'), ('Rivalco', 'Competitor'), ('Just checking in', 'Banned opener'), ('Great news!', 'Exclamation mark'),
             ('Our upgrade guarantees zero downtime.', 'Banned word (guarantee) and an unsupported claim'), ('The upgrade reduced downtime by 30% last year.', 'Unsupported claim'),
             ('We can offer a 10% discount on pricing.', 'Pricing'), ('This follows the incident on the crude unit.', 'Sensitive: goes to the manager\'s Approvals'),
             ('A comparable refinery moved its crude unit to a current control platform within one planned shutdown.', 'Nothing: it is approved claim CL-T1, word for word'),
             ('A refinery moved its crude unit within one planned shutdown and saved money.', 'Unsupported claim: changed wording is not the approved claim')]
sheet(wb, 'Words to type', ['Type this into a message (For Review) or a Content studio piece', 'The check should flag'], [list(x) for x in NEG_TESTS], [70, 50])

# Test cases
C = []
def tc(area, title, steps, today, after, pr='High'):
    C.append([f'CL-{len(C) + 1:02d}', area, title, steps, today, after, pr])
tc('Guideline', 'Structured guideline, Markdown', 'Content library > Brand guidelines: upload guidelines/A_structured_guideline.md', f"{len(TODAY.get('A_structured_guideline.md', []))} of 16 rules suggested (see \"Guideline files\")", 'All 16 rules, plus the writing guidance, plays and frameworks offered for their tabs')
tc('Guideline', 'Structured guideline, plain text', 'Upload A_structured_guideline.txt', f"{len(TODAY.get('A_structured_guideline.txt', []))} of 16 rules suggested", 'As above')
for f in ('A_structured_guideline.docx', 'A_structured_guideline.pdf', 'A_structured_guideline.pptx', 'B_narrative_guideline.docx', 'B_narrative_guideline.pdf'):
    tc('Guideline', f'Guideline as {f.split(".")[-1].upper()} ({"narrative" if f.startswith("B_") else "structured"})', f'Upload guidelines/{f}', 'Stored and listed; no rules suggested', 'All 16 rules suggested for a person to confirm, plus the guidance, plays and frameworks')
tc('Guideline', 'Narrative guideline, plain text', 'Upload B_narrative_guideline.txt', f"{len(TODAY.get('B_narrative_guideline.txt', []))} of 16 rules suggested: the parser misses rules written in prose", 'All 16 rules suggested')
tc('Guideline', 'Background lines are not rules', 'In any upload, look for "Our customers are refiners…" and "Use the approved claims library…"', 'Not suggested', 'Not suggested')
tc('Guideline', 'Nothing is applied without a person', 'After an upload, before clicking Add', 'Suggestions only; the live brand pack is unchanged', 'The same: the AI suggests, a person confirms each rule, then publishes')
tc('Library', 'Add the rules and publish', 'Add the 16 suggestions, See changes, Publish', 'A new brand version listing each change by section; Versions shows who and when', 'The same')
tc('Library', 'Add the claims', 'Approved claims: add the 7 claims from "Claims to add" with their status and expiry', 'Each shows Approved, Expired, Draft or Retired as listed', 'The same')
tc('Library', 'Messaging plays', 'Messaging frameworks: set the six plays from "Messaging plays"', 'Saved in the draft and published with the version', 'The same')
tc('Library', 'Messaging frameworks', 'Messaging frameworks: set the four frameworks from "Messaging frameworks"', 'Saved in the draft and published', 'The same')
tc('Checks', 'Words that must be flagged', 'For Review: open any queue item and type each line from "Words to type" into the message, one at a time', 'Each flagged as in the sheet', 'The same (the checks stay rules)')
tc('Checks', 'Same in Content studio', 'Content studio: open a piece and type the same lines', 'Flagged the same way', 'The same')
tc('Drafts', 'Voice reaches new messages', 'After publishing, build Micro-segments again (golden set)', 'New messages open "Dear <first>," and close "Kind regards, / Client Process Automation Team"; sentences over 22 words are flagged', 'The same')
tc('Drafts', 'Approved claim used word for word', 'Open a Modernisation and a Service renewal recommendation', 'CL-T1 / CL-T2 appear word for word, no citation', 'The same; and with AI drafting on, the AI picks the claim by its ID')
tc('Drafts', 'Expired, draft and retired claims never used', 'Search the messages for CL-T5, CL-T6, CL-T7 wording; Approved claims: "where used"', 'Never used', 'Never used')
tc('Drafts', 'Claim chosen by topic', 'Open an Engagement recommendation whose signal is the alarm management webinar', 'CL-T4 may appear on any item (its words match no segment keyword)', 'CL-T4 appears only on alarm-related items', 'Medium')
tc('AI drafting', 'Writing guidance followed', 'With AI drafting on: read 10 new messages', 'Not applied: the guidance has no field and is not sent to the AI', 'British spelling, the site named, no promised dates or prices, the system named')
tc('AI drafting', 'Plays followed', 'With AI drafting on: one message per segment', 'Only the play\'s angle is sent', 'The opening follows the angle; the objection and answer are in the brief and call script')
tc('AI drafting', 'Frameworks followed', 'With AI drafting on: a "Book a first meeting" and an "Answer an inquiry" message', 'Not sent to the AI', 'Each message follows its framework\'s steps in order and ends with its ask')
tc('AI drafting', 'Competitors never named', 'With AI drafting on: a brief that invites a comparison', 'The AI is told only "no competitor names"; the check still flags a name', 'The competitor list is sent; no message names Rivalco, Acmetrol or Northstar Controls')
tc('Versions', 'Restore an earlier version', 'Versions: restore the previous version, then build again', 'Earlier rules apply to new messages; messages already written keep their version', 'The same')
ws = sheet(wb, 'Test cases', ['ID', 'Area', 'Test', 'Do this', 'Expected TODAY (remediation branch)', 'Expected AFTER the AI change', 'Priority', 'Status', 'What actually happened'],
           [c + ['Not run', ''] for c in C], [8, 12, 36, 52, 52, 52, 9, 11, 30], status_col='H')
wb.move_sheet('Test cases', offset=-(len(wb.sheetnames) - 1))
hw = wb.create_sheet('How to use', 0); hw.column_dimensions['A'].width = 125
for i, l in enumerate([
        'Content library test pack',
        'Sign in as an Admin on the remediation branch. The guideline files are in guidelines/: the same guideline in two styles. Style A has one rule per line, '
        'the way the POC\'s rules parser reads them; style B writes the same rules in prose, the way marketing teams do. Both hold 16 rules, four lines of writing guidance, '
        'a messaging play for each of the six segments and four messaging frameworks.',
        'Each test case says what to expect TODAY and AFTER the AI change requested from Shrihari (section K of the change-request doc). '
        'Run the TODAY column now; rerun the AFTER column once the change is in.',
        '"Guideline files" shows, file by file, what today\'s parser suggests (worked out by running the branch\'s own readRules on each file) and what the AI should suggest.',
        'Then add the claims, plays and frameworks from their sheets, publish, and build Micro-segments again (the golden set works) so new messages use them.',
        'All names, companies and claims are invented.'], 1):
    c = hw.cell(i, 1, l); c.font = Font(name=F, size=11 if i == 1 else 10, bold=i == 1); c.alignment = Alignment(wrap_text=True, vertical='top')
wb.save(os.path.join(OUT, 'Content_Library_Test_Cases.xlsx'))
print(len(C), 'test cases; files:', ', '.join(FILES))
