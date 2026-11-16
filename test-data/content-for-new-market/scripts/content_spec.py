"""Content library runs on top of the setup-from-scratch set-up (water treatment). Usage: python3 content_spec.py <setup spec.json> <out spec.json>
Each run is one Content library change; 'from' is the run it builds on. All claims and names are invented."""
import json, sys
s = json.load(open(sys.argv[1])); b = s['specs']['BASE'] if 'specs' in s else s
C = lambda i, t, y, title, seg, exp, claim, status='approved': dict(id=i, type=t, year=y, title=title, segments=seg, expiry=exp, claim=claim, status=status, owner='Marketing')
CLAIMS = {
 'WT-01': C('WT-01', 'Case study', 2026, 'Pre-bid clarification at a coastal utility', ['Open tenders'], '2027-12-31', 'A comparable utility held one pre-bid technical call and avoided two rounds of written clarifications.'),
 'WT-02': C('WT-02', 'One-pager', 2025, 'Reporting change checklist', ['Compliance deadline'], '2026-10-31', 'A water-quality review lists every reporting change well before the deadline.'),
 'WT-03': C('WT-03', 'Peer story', 2026, 'Gap assessment results (draft)', ['Compliance deadline'], '2027-12-31', 'Plants that ran a gap assessment reduced late filings by 20%.', 'draft'),
 'WT-04': C('WT-04', 'One-pager', 2026, 'Gap assessment overview', ['Compliance deadline'], '2027-06-30', 'A gap assessment takes three days on site and lists the changes needed to meet the new limits.'),
 'WT-05': C('WT-05', 'Case study', 2024, 'Old tender win story', ['Open tenders'], '2027-12-31', 'A utility chose our reference design after a short technical call.', 'retired'),
}
PLAYS = {'Open tenders': dict(angle='Help them get the technical scope right before the tender closes', objection='We cannot talk to bidders outside the tender process.',
                              response='Understood. A clarification call on the published scope is allowed, and it is logged with the tender team.', questions=['When does the tender close?', 'Who answers technical clarifications?']),
         'Compliance deadline': dict(angle='Work back from the date the new limit applies', objection='We will deal with it closer to the date.',
                              response='That is an option. Most of the work is in the changes upstream, which take longer than the date suggests.', questions=['Which limit applies to your plant, and from when?', 'What does your current monitoring show?'])}
RUNS = [
 ('C0', None, 'Starting content library, nothing added for the new market', {}),
 ('C1', 'C0', 'Add claim WT-01 (approved, Open tenders, expires 31 Dec 2027)', {'addClaims': [CLAIMS['WT-01']]}),
 ('C2', 'C1', 'Add claim WT-02 (approved, Compliance deadline, but expired 31 Oct 2026)', {'addClaims': [CLAIMS['WT-02']]}),
 ('C3', 'C2', 'Add claim WT-03 as a draft (Compliance deadline)', {'addClaims': [CLAIMS['WT-03']]}),
 ('C4', 'C3', 'Add claim WT-04 (approved, Compliance deadline, expires 30 Jun 2027)', {'addClaims': [CLAIMS['WT-04']]}),
 ('C5', 'C4', 'Add claim WT-05 as retired (Open tenders)', {'addClaims': [CLAIMS['WT-05']]}),
 ('C6', 'C5', 'Voice and tone: Direct to Formal', {'voice': {'preset': 'Formal'}}),
 ('C7', 'C6', 'Sign-off: Client Team to Client Water Team', {'voice': {'signoff': 'Client Water Team'}}),
 ('C8', 'C7', 'Banned opener added: "Noticed"', {'voice': {'bannedOpeners': ['I hope this email finds you well', 'Just checking in', 'Hope you are well', 'Noticed']}}),
 ('C9', 'C7', 'Negative keyword added: "SCADA"', {'addNegative': ['SCADA']}),
 ('C10', 'C7', 'Email length: 120 to 40 words', {'voice': {'maxWords': 40}}),
 ('C11', 'C7', 'Sentence length: 35 to 12 words', {'voice': {'maxSentenceWords': 12}}),
 ('C12', 'C7', 'Plays added for Open tenders and Compliance deadline', {'plays': PLAYS}),
 ('C13', 'C7', 'Retire CS-01 (the starting Modernisation case study)', {'claimStatus': {'CS-01': {'status': 'retired'}}}),
 ('C14', 'C7', 'WT-01 expiry moved to 15 Nov 2026 (yesterday)', {'claimStatus': {'WT-01': {'expiry': '2026-11-15'}}}),
 ('C15', 'C7', 'Competitor added: Hydrolux', {'addCompetitors': ['Hydrolux']}),
]
TYPED = [
 ('C9', 'Our SCADA upgrade is world-class.'),
 ('C15', 'Hydrolux quoted a longer shutdown for the same scope.'),
 ('C15', 'Just checking in on the tender.'),
 ('C15', 'Great news on the tender!'),
 ('C15', 'We can offer a 10% discount on the first phase.'),
 ('C15', 'The new discharge regulation applies from 2027.'),
 ('C15', CLAIMS['WT-01']['claim']),
 ('C15', 'A comparable utility held a pre-bid call and reduced clarifications by 50%.'),
 ('C15', CLAIMS['WT-02']['claim']),
 ('C15', CLAIMS['WT-03']['claim']),
 ('C15', CLAIMS['WT-05']['claim']),
 ('C15', 'Our upgrade guarantees zero downtime.'),
 ('C14', CLAIMS['WT-01']['claim']),
]
b['brandRuns'] = [dict(id=i, **({'from': f} if f else {}), what=w, patch=p) for i, f, w, p in RUNS]
b['typed'] = [dict(pack=p, text=t) for p, t in TYPED]
b['claims'] = CLAIMS; b['plays'] = PLAYS
json.dump(b, open(sys.argv[2], 'w'), indent=1)
