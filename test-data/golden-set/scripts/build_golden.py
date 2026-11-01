"""Adds the golden answer key and the review script to the golden workbook.
Usage: python3 build_golden.py <folder> <golden_spec.json> <golden_results.json>"""
import json, os, sys
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule

d, spec, res = sys.argv[1], json.load(open(sys.argv[2])), json.load(open(sys.argv[3]))
F = 'Arial'
thin = Side(style='thin', color='FFBFBFBF'); B = Border(left=thin, right=thin, top=thin, bottom=thin)
HDR = PatternFill('solid', fgColor='FF1F1F1F'); GAP = PatternFill('solid', fgColor='FFFFF2CC')
CAT = {'sensitive': 'Sensitive content', 'claim': 'Unsupported claim', 'low': 'Low confidence', 'small': 'Segment too small',
       'deal': 'Below deal size', 'brand': 'Brand or rule check', 'reach': "Can't reach them", 'other': 'Other'}
DUE = {0: 'Same day (by 5 pm)', 1: '1 working day', 2: '2 working days'}
REP = {'rep.a@client-sample.com': 'Rep A (Sofia Ahlgren)', 'rep.b@client-sample.com': 'Rep B (Marco Lindqvist)'}
STATUS = '"Not run,Pass,Fail,Blocked"'
A = {a['id']: a for a in res['accounts']}

def table(wb, title, head, rows, widths, status_col=None, gap_rows=()):
    if title in wb.sheetnames: del wb[title]
    ws = wb.create_sheet(title); ws.append(head)
    for c in ws[1]: c.font = Font(name=F, size=10, bold=True, color='FFFFFFFF'); c.fill = HDR; c.border = B; c.alignment = Alignment(wrap_text=True, vertical='center')
    for r in rows: ws.append(r)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.font = Font(name=F, size=10); c.border = B; c.alignment = Alignment(wrap_text=True, vertical='top')
            if c.row - 2 in gap_rows: c.fill = GAP
    for i, w in enumerate(widths): ws.column_dimensions[ws.cell(1, i + 1).column_letter].width = w
    ws.freeze_panes = 'C2'; ws.auto_filter.ref = ws.dimensions
    if status_col and ws.max_row > 1:
        n = ws.max_row
        dv = DataValidation(type='list', formula1=STATUS, allow_blank=True); ws.add_data_validation(dv); dv.add(f'{status_col}2:{status_col}{n}')
        for r in range(2, n + 1):
            ws[f'{status_col}{r}'] = 'Not run'
            for col in range(ws[f'{status_col}{r}'].column, len(head) + 1): ws.cell(r, col).font = Font(name=F, size=10, color='FF0000FF')
        for t, col in (('Pass', 'FFE2F0D9'), ('Fail', 'FFF8D7DA'), ('Blocked', 'FFFFF2CC')):
            ws.conditional_formatting.add(f'{status_col}2:{status_col}{n}', FormulaRule(formula=[f'${status_col}2="{t}"'], fill=PatternFill('solid', fgColor=col)))
    return ws

wb = load_workbook(os.path.join(d, spec['file']))
for n in list(wb.sheetnames):
    if n not in ('Lead template', 'Signal template'): del wb[n]
accs = res['accounts']
recs = [a for a in accs if a['got']['rec']]
queue = [a for a in recs if a['got']['cats']]
ahead = [a for a in recs if not a['got']['cats']]
st = res['stats']
tiers = {}
for a in accs: tiers[a['got']['tier']] = tiers.get(a['got']['tier'], 0) + 1
own = lambda xs, rep: [a['id'] for a in xs if a['got']['owner'] == rep]

# ── Golden accounts ──
rows, gaps = [], []
for i, a in enumerate(accs):
    g = a['got']
    if a['expect'].get('gap'): gaps.append(i)
    rev = '; '.join(CAT[c] for c in g['cats']) if g['cats'] else ('Goes ahead on its own' if g['rec'] else 'Not in Micro-segments')
    rows.append([a['id'], a['name'], a['story'], g['tier'], g['score'] if g['score'] is not None else '', g['confidence'],
                 g['segment'] or ('No segment: exception' if g['rec'] else '—'), 'Yes' if g['fallback'] else '', g['action'], g['runnerUp'],
                 f"{g['contact']} ({g['persona']})" if g['contact'] else '', g['channel'], g['subject'], g['conf'], g['status'],
                 REP.get(g['owner'], g['owner']), rev, DUE.get(g['dueDays'], '') if g['cats'] else '',
                 f"USD {g['deal']:,}" if g['deal'] else '', a['expect'].get('gap', ''), 'Not run', ''])
table(wb, 'Golden - accounts', ['ID', 'Account', 'What it is designed to show', 'Tier', 'Score', 'Confidence (scoring)', 'Micro-segment', 'Joined on its next signal',
      'Recommended action', 'Runner-up action', 'Contact (persona)', 'Channel', 'Email subject', 'Confidence badge (NBA)', 'Status', 'Owner',
      'For Review', 'Due', 'Estimated first deal', 'Known gap: what the POC does today instead', 'Status', 'What actually happened'],
      rows, [6, 22, 48, 8, 7, 10, 16, 9, 30, 30, 22, 9, 20, 11, 15, 20, 30, 16, 13, 40, 11, 30], status_col='U', gap_rows=gaps)

# ── The review queue ──
FIX = {'low': 'Click "Yes, <name> is the right person", or switch to another contact', 'reach': 'Add a work email (tick Verified) or a LinkedIn URL and Save contact',
       'small': 'Pick a micro-segment in the workspace, then Approve', 'deal': 'Decide: approve anyway or reject (a person must look)',
       'sensitive': 'Sales manager: Approvals > Review > Approve, Send back or Reject', 'claim': 'Remove the claim or replace it with an approved one',
       'brand': 'Edit the draft to remove the flagged words'}
qrows = []
for a in sorted(queue, key=lambda a: (a['got']['dueDays'], a['id'])):
    g = a['got']
    qrows.append([a['id'], f"{g['contact']} · {a['name']}", g['route'], '; '.join(CAT[c] for c in g['cats']), '\n'.join(g['reasons']), DUE[g['dueDays']],
                  REP.get(g['owner']), g['segment'] or '(none)', g['action'], '\n'.join(FIX[c] for c in g['cats']), 'Not run', ''])
table(wb, 'Golden - review queue', ['ID', 'Item', 'Where (manager view)', 'Why it needs you (tags)', 'Reasons as written', 'Due', 'Owner', 'Micro-segment', 'Recommended action',
      'How to clear it', 'Status', 'What actually happened'], qrows, [6, 34, 14, 30, 52, 18, 22, 16, 30, 46, 11, 30], status_col='K')

# ── Expected totals ──
def ids(xs): return ', '.join(xs) or 'none'
q = [a for a in queue if a['got']['route'] == 'Queue']; ap = [a for a in queue if a['got']['route'] == 'Approvals']
qa = own(q, 'rep.a@client-sample.com')
summary = [
    ['Prospecting', f"{st['rowsRead']} rows read; {st['accounts']} accounts, {st['accountsPass']} pass (Westfield excluded: Australia); {st['inFinalList']} contacts in the final list; {st['issuesBySeverity']['flag']} flagged rows (G13, G14, G25 contact details)."],
    ['Account Scoring', 'Accounts by tier: ' + ', '.join(f'{k} {v}' for k, v in tiers.items()) + '. Yarrow is knocked out by "Installed system (current)". G17 is the only tier C.'],
    ['Send to NBA', 'The button reads "Send tier A and B to NBA": 21 prospects go (tier C and the rest stay behind). Micro-segments opens with "Sent from Scoring" and builds on its own.'],
    ['Micro-segments', 'Segments: ' + ', '.join(f"{x['name']} {x['n']}" for x in res['segments']) + f". Leadership does not form (2 accounts). {res['exceptions']} exception: G19 Silverton."],
    ['Recommendations', f"{len(recs)}: {len(ahead)} go ahead on their own (G11 after one automatic rewrite), {len(q)} wait in the queue, {len(ap)} waits in Approvals (G04)."],
    ['For Review: sales manager', f"Approvals 1: G04. Queue {len(q) + 2}: {ids([a['id'] for a in q])}, plus 2 spot-checks (one per rep, drawn at random from the items that went ahead)."],
    ['For Review: sales rep (Rep A)', f"My queue {len(qa) + 1}: {ids(qa)}, plus 1 spot-check. No Approvals tab. Rep B's items ({ids(own(q, 'rep.b@client-sample.com'))}) are not shown."],
    ['Due', 'G04 and G03 same day (sensitive; inquiry). G13, G14, G18 in 1 working day (can\'t reach them). G08, G10, G19 in 2 working days. Spot-checks by Friday.'],
    ['Not in Micro-segments', 'G17 (tier C), G21 (watch list), G22 (below the fit floor), G23 (outside the region), G24 (knocked out). G26 should be here too (known gap).'],
    ['Known gaps', 'G25 should be "Can\'t reach them" (opt-out not confirmed) but goes ahead. G26: an opted-out person\'s signal still scores the account.'],
    ['Note on brand checks', 'A draft that fails a brand check is rewritten once without the signal wording before routing, so with the default brand pack a file cannot put a "Brand or rule check" item in the queue (G11 shows this). The check shows up when a person edits a draft (script step 20).'],
]
table(wb, 'Golden - expected totals', ['Where', 'What you should see'], summary, [28, 120])

# ── Review script: click by click (checked in the prototype) ──
S = [
 ('Setup', 'Sales manager', 'Start from a clean browser. Prospecting: upload this file, View the list, Save and go to Scoring. Scoring: Score as of 2026-10-20, drop this same file, View the scores.', 'Prospecting and Scoring totals as in "Golden - expected totals".'),
 ('Scoring', 'Sales manager', 'Find G17 Queensway Refining in the ranked list.', 'Tier C, score 15 (one email click).'),
 ('Scoring', 'Sales manager', 'Click "Send tier A and B to NBA".', '21 prospects sent; Micro-segments opens with "Sent from Scoring" and builds on its own. View the micro-segments.'),
 ('NBA', 'Sales manager', 'Micro-segments tab.', ', '.join(f"{x['name']} {x['n']}" for x in res['segments']) + '. No Leadership segment; 1 exception (G19).'),
 ('NBA', 'Sales manager', 'Recommendations: open G02 Bellwether Refining.', 'Contact Ben Tan (the inquiry), not Cara Ong (the webinar). Net-new.'),
 ('NBA', 'Sales manager', 'Open G20 Thornbury Refining.', 'Engagement, joined on its next signal; runner-up "Introduce Client to the new leader", explained by its strongest signal (Leadership) having too few accounts.'),
 ('NBA', 'Sales manager', 'Open G05 Eastmere Refining, then "Compare them side by side".', 'Inquiry (fresh) wins over the older end-of-support signal; runner-up "Route the inquiry to the sales owner".'),
 ('NBA', 'Sales manager', 'Open G15 Oakmont Refining.', 'A LinkedIn connection note (no email on file).'),
 ('NBA', 'Sales manager', 'Open G11 Kingsmere Refining.', 'Proceeded. The message is version 2: "Regenerated once" after the pricing wording failed the brand check.'),
 ('For Review', 'Sales manager', 'For Review: Approvals tab.', 'Only G04 Driftline Refining (sensitive: "incident").'),
 ('For Review', 'Sales manager', 'Queue tab, grouped by reason.', f"{len(q)} items ({ids([a['id'] for a in q])}) and 2 spot-checks, with the reasons and due dates in \"Golden - review queue\"."),
 ('For Review', 'Sales rep', 'Switch role to Sales rep (Rep A). Open For Review.', f"\"My queue\" only, no Approvals tab: {ids(qa)} and 1 spot-check."),
 ('For Review', 'Sales rep', 'Open G03 Copperline Refining. Reject with "Wrong contact" (R7).', '"An alternative came back": the item returns with the next contact, Eli Goh, marked "Alternative offered", due in 1 working day.'),
 ('For Review', 'Sales rep', 'Reject G03 again with any reason.', '"Second rejection: the account is closed for the pilot".'),
 ('For Review', 'Sales rep', 'Open G19 Silverton Refining. Approve.', '"Assign a micro-segment first". Pick Engagement, then Approve: released into Engagement.'),
 ('For Review', 'Sales rep', 'Open G08 Harrowgate Petrochem. Reject with "Wrong fit" (R1).', '"The account is set aside for the pilot".'),
 ('For Review', 'Sales rep', 'Open G13 Millbrook Refining. Add a work email, tick Verified, Save contact.', 'The "Can\'t reach them" reason clears and the draft becomes an email; Approve releases it.'),
 ('For Review', 'Sales rep', 'Open the spot-check in My queue and rate it.', 'It leaves the queue; Today\'s spot-check count goes up.'),
 ('For Review', 'Sales manager', 'Switch to Sales manager. Approvals: open G04 (Review).', 'Buttons: Send back, Reject, Approve. Approve: "No more approvals waiting".'),
 ('For Review', 'Sales manager', 'Queue: open G10 Juniper Bay (unsupported claim). In the message, add "Results are guaranteed!".', 'The live checks flag the banned word and the exclamation mark (brand). Remove it and the "reduced downtime by 20%" claim: the checks clear; Approve.'),
 ('For Review', 'Sales manager', 'Open G18 Ravenhill Petrochem (three reasons). Reject with "Already engaged" (R4).', '"Engage-once applies"; it leaves the queue.'),
 ('For Review', 'Sales manager', 'Open G14 Northgate Fuels (no consent). Put on hold.', '"On hold: it waits at the end of your queue"; it shows an "On hold" tag.'),
 ('For Review', 'Sales manager', 'Decision log tab.', 'Every system routing step and every decision above, with who, when, the code and the outcome.'),
 ('Today', 'Sales manager', 'Open Today.', 'In For Review, Approvals (0), spot-checks and the gates reflect the decisions above.'),
 ('Engage-once', 'Sales manager', 'Micro-segments: build again from the same scoring.', 'Every account released in the first run (the 12 that went ahead, G04, G13, G19) and G18 (R4) is set aside as "Engaged once".'),
]
table(wb, 'Review script', ['#', 'Area', 'Role', 'Do this', 'You should see', 'Status', 'What actually happened'],
      [[i] + list(s) for i, s in enumerate(S, 1)], [5, 12, 14, 70, 70, 11, 34], status_col='F')

# ── How to use ──
if 'How to use' in wb.sheetnames: del wb['How to use']
hw = wb.create_sheet('How to use'); hw.column_dimensions['A'].width = 125
for i, l in enumerate([
        'Golden dataset: Micro-segments & NBA and For Review',
        f"{len(accs)} accounts, each designed for one outcome, run the default way: Prospecting > Account Scoring > Micro-segments > For Review. Every NBA and For Review rule shows up at least once.",
        '',
        'Steps',
        '1. Prospecting: upload this file (it reads "Lead template"). Save the list as "Golden".',
        '2. Account Scoring: choose the "Golden" list, set Score as of to 2026-10-20, and drop this same file (it reads "Signal template"). Save the scored list.',
        '3. In the ranked list click "Send tier A and B to NBA" (the default: tier C stays behind). Micro-segments opens with "Sent from Scoring" chosen: Build micro-segments.',
        '4. Check "Golden - expected totals", then each account in "Golden - accounts" and each queue item in "Golden - review queue".',
        '5. Follow "Review script" step by step: it decides items in For Review with each kind of decision and says what must happen.',
        '',
        'What is covered',
        'NBA: the default hand-off (tier A and B only), all five segments that can form, one that cannot (Leadership, 2 accounts), an account joining a segment on its next signal, runner-ups, two people at one account, '
        'email, LinkedIn and no-channel drafts, confidence badges, net-new and existing customers, Rep A and Rep B owners, and accounts that never reach Micro-segments.',
        'For Review: every reason (sensitive, claim, brand, low confidence, can\'t reach, segment too small, below deal size), several reasons on one item, every due time, '
        'sensitive items going straight to the manager, the automatic rewrite after a brand check, rep vs manager views, spot-checks, fix-it actions, reject codes R1, R4, R7 and R8, a second rejection, hold, edit, the decision log, and engage-once.',
        '',
        'Yellow rows are known gaps: what should happen, which the POC does not do today. They are expected to fail until fixed.',
        'Start each full run from a clean browser (or clear the site data), so earlier decisions and engage-once do not change the results.',
        'The answer key was produced by reading this file the way the POC does and running it through the POC\'s own rules (legacy/demandai-engine.js and the routing in legacy/demandai-nba.js). The run, the queues and the decisions in the review script were also clicked through in the prototype.',
        'All companies, people and domains are invented.'], 1):
    c = hw.cell(i, 1, l); c.font = Font(name=F, size=11 if i == 1 else 10, bold=i in (1, 4, 11)); c.alignment = Alignment(wrap_text=True, vertical='top')
order = ['How to use', 'Lead template', 'Signal template', 'Golden - expected totals', 'Golden - accounts', 'Golden - review queue', 'Review script']
wb._sheets = [wb[n] for n in order]
wb.active = 0
wb.save(os.path.join(d, spec['file']))
print('saved', spec['file'], len(accs), 'accounts', len(queue), 'queue items', len(S), 'script steps')

# ── Split into the two upload files and the answer key ──
from openpyxl import Workbook
src = load_workbook(os.path.join(d, spec['file']))
for sheet, out in (('Lead template', 'Golden_1_Prospects.xlsx'), ('Signal template', 'Golden_2_Signals.xlsx')):
    w = Workbook(); ws = w.active; ws.title = sheet
    for r in src[sheet].iter_rows(values_only=True): ws.append(list(r))
    for c in ws[1]: c.font = Font(bold=True)
    for col in ws.columns: ws.column_dimensions[col[0].column_letter].width = min(40, max(10, *(len(str(c.value or '')) + 2 for c in col)))
    ws.freeze_panes = 'A2'; w.save(os.path.join(d, out))
for n in ('Lead template', 'Signal template'): del src[n]
SWAP = [('Prospecting: upload this file (it reads "Lead template"). Save the list as "Golden".', 'Prospecting: upload Golden_1_Prospects.xlsx. Save the list as "Golden".'),
        ('2. Account Scoring: choose the "Golden" list, set Score as of to 2026-10-20, and drop this same file (it reads "Signal template"). Save the scored list.',
         '2. Account Scoring: choose the "Golden" list, set Score as of to 2026-10-20, and drop Golden_2_Signals.xlsx on box 2.'),
        ('Prospecting: upload this file, View the list, Save and go to Scoring. Scoring: Score as of 2026-10-20, drop this same file, View the scores.',
         'Prospecting: upload Golden_1_Prospects.xlsx, View the list, Save and go to Scoring. Scoring: Score as of 2026-10-20, drop Golden_2_Signals.xlsx, View the scores.'),
        ('run the default way', 'uploaded the default way'), ('The answer key was produced by reading this file', 'The answer key was produced by reading the two files')]
for ws in src:
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value, str):
                for a, b in SWAP: c.value = c.value.replace(a, b)
hw = src['How to use']; hw.insert_rows(2)
hw['A2'] = 'Files: Golden_1_Prospects.xlsx (the lead file for Prospecting) and Golden_2_Signals.xlsx (the signal file for Account Scoring). This workbook is the answer key.'
hw['A2'].font = Font(name=F, size=10, bold=True); hw['A2'].alignment = Alignment(wrap_text=True, vertical='top')
src.save(os.path.join(d, 'Golden_3_Answer_key.xlsx'))
os.remove(os.path.join(d, spec['file']))
print('split into Golden_1_Prospects.xlsx, Golden_2_Signals.xlsx, Golden_3_Answer_key.xlsx')
