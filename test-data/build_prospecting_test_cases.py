"""Builds Prospecting_Test_Cases.xlsx: unit, component, smoke and UAT test cases for 10-prospecting.html,
with the result of a first run against Lead_Research_Sample_Dataset.xlsx (3 Oct 2026, headless Chromium).

Usage: python3 test-data/build_prospecting_test_cases.py test-data/Prospecting_Test_Cases.xlsx
"""
import sys

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

DS = 'Lead_Research_Sample_Dataset.xlsx'
F = 'Functional'
NF = lambda kind: f'Non-functional · {kind}'

# (id, test case, function / component under test, aspect, preconditions & test data, steps, expected result, priority, how to automate, status, observed)
UNIT = [
    ('UT-01', 'CSV parser handles quotes, embedded commas, escaped quotes, line breaks and a BOM', 'parseCSV()', F,
     'String: BOM + a,"b,c","d ""q""" CRLF 1,"x\\ny",3', 'Call DemandAI.parseCSV(text)', 'Two rows; "b,c" kept as one cell; d "q" unescaped; the line break stays inside the cell; BOM stripped',
     'High', 'node:test, no browser', 'Pass', 'Parsed exactly as expected'),
    ('UT-02', 'CSV writer round-trips through the parser', 'toCSV() + parseCSV()', F, 'Cells with a comma, a quote and a line break',
     'parseCSV(toCSV(rows))', 'Output equals input', 'Medium', 'node:test, property-based (fast-check) for random strings', 'Pass', 'Round-trip identical'),
    ('UT-03', 'Header row is found under the title row, and the format-hint row is skipped', 'readTable()', F,
     'Grid: title row, header row, "Text*" hint row, 1 data row', 'processLeads(grid)', 'rowsRead = 1; the hint row is reported as info, not loaded as a contact',
     'High', 'node:test', 'Pass', 'rowsRead = 1'),
    ('UT-04', 'Header names are matched regardless of case, spaces, stars and hyphens', 'normHeader()', F,
     'Headers written " FIRST NAME* ", "Company-Name"', 'processLeads(grid)', 'All columns recognised; no "missing column" issue',
     'High', 'node:test, table-driven', 'Pass', 'Contact loaded, no column issues'),
    ('UT-05', 'A missing required column is reported once, against the header row', 'readTable()', F, 'Template without owner_email',
     'processLeads(grid)', 'Issue "Required column "owner_email" is missing" (flag); rows still processed', 'High', 'node:test', 'Pass', 'Issue raised as expected'),
    ('UT-06', 'A file without the anchor column (company_name) stops processing', 'readTable()', F, 'Grid [["a","b"],["1","2"]]',
     'processLeads(grid)', 'One stop issue: header row not found; no contacts', 'High', 'node:test', 'Pass', 'Single stop issue'),
    ('UT-07', 'Extra columns are ignored and reported as info', 'readTable()', F, 'Template + "notes" column', 'processLeads(grid)',
     '"Column "notes" isn\'t in the template", severity info', 'Low', 'node:test', 'Pass', 'Info issue raised'),
    ('UT-08', 'Y/N parsing accepts Y, N, Yes, No in any case and with spaces; rejects TRUE, 1, X', 'yesNo()', F,
     'opt_out = Yes, n, TRUE, blank, " y "', 'processLeads per value; read optOutUnknown', 'Yes/n/" y " accepted; TRUE and blank make the opt-out unknown (not contactable)',
     'High', 'node:test, table-driven', 'Pass', '[false, false, true, true, false] as expected'),
    ('UT-09', 'Numbers with $, commas or "USD" are read and flagged; text numbers are rejected', 'parseNumber()', F,
     'annual_revenue_usd = "$2,400,000,000" and "2.4B"', 'processLeads', '$2,400,000,000 → 2400000000 with a reformat flag; "2.4B" → "isn\'t a number", treated as blank',
     'High', 'node:test', 'Pass', 'Both behave as specified'),
    ('UT-10', 'Malformed emails are rejected (no @, two @, no TLD, space, placeholder)', 'EMAIL_RE', F,
     f'{DS}: Row key cases EM-NO-AT, EM-DOUBLE-AT, EM-NO-TLD, EM-SPACE, EM-PLACEHOLDER', 'processLeads on each value', 'Each flagged "malformed" (D3); email not used',
     'High', 'node:test over the Row key rows', 'Pass', '195 of 195 dataset rows flagged'),
    ('UT-11', 'Emails that pass the regex but are invalid: double dots, trailing dot, mailto:, angle brackets', 'EMAIL_RE', F,
     'a..b@nw..com, a@nw.com., mailto:a@nw.com', 'processLeads on each value', 'Each should be flagged malformed',
     'High', 'node:test', 'Fail', 'All three accepted as valid emails (only 48 of 95 dataset rows flagged, and those only for other reasons)'),
    ('UT-12', 'LinkedIn URL must be a profile URL', 'LINKEDIN_RE', F, 'company page, Sales Navigator URL, search URL, bare text',
     'processLeads on each value', 'Each flagged "isn\'t a profile URL"; LinkedIn not used', 'Medium', 'node:test', 'Pass', '70 of 70 dataset rows flagged'),
    ('UT-13', 'Duplicate by email is case- and space-insensitive', 'processLeads() dedupe', F, 'Same email, second row in upper case',
     'processLeads', 'Second row merged (D5) into the first', 'High', 'node:test', 'Pass', 'merged = 1; 80 of 80 dataset rows'),
    ('UT-14', 'Duplicate by LinkedIn ignores http/https, www, trailing slash and query string', 'normLinkedIn()', F,
     'https://www.linkedin.com/in/aditi vs http://linkedin.com/in/aditi/', 'processLeads', 'Merged (D5)', 'High', 'node:test', 'Pass', 'merged = 1'),
    ('UT-15', 'Duplicate by LinkedIn on a country subdomain (sg.linkedin.com)', 'normLinkedIn()', F, 'www.linkedin.com/in/aditi vs sg.linkedin.com/in/aditi',
     'processLeads', 'Merged (D5)', 'Medium', 'node:test', 'Fail', 'Not merged: counted as two people (11 of 70 dataset LinkedIn duplicates missed)'),
    ('UT-16', 'A merged duplicate fills blanks on the first row', 'processLeads() merge', F, 'Row 1 seniority blank, repeat has "Director"',
     'processLeads', 'Contact seniority = Director', 'Medium', 'node:test', 'Pass', 'Blank filled from the repeat'),
    ('UT-17', 'Same person with a different email alias and no LinkedIn', 'processLeads() dedupe', F, 'aditi.rao@ and a.rao@, same name and company',
     'processLeads', 'Flagged as a possible duplicate', 'Medium', 'node:test', 'Gap', 'Not detected: exact-key matching only (3 of 70 dataset rows caught)'),
    ('UT-18', 'A row without company_name is not loaded', 'processLeads()', F, 'company_name blank', 'processLeads',
     'notLoaded = 1, severity stop, no account created', 'High', 'node:test', 'Pass', '45 of 45 dataset rows not loaded'),
    ('UT-19', 'Domain must be a bare domain', 'processLeads() domain check', F, 'company_domain = https://www.nw.com/', 'processLeads',
     '"isn\'t in the form company.com"; domain not used for matching', 'Medium', 'node:test', 'Pass', 'Flagged'),
    ('UT-20', 'Persona matching on job title', 'personaOf()', F,
     'Head of Instrumentation, Senior Instrument Engineer, Process Control Engineer, Plant Manager, Project Manager, Kepala Instrumentasi',
     'personaOf(title) for each', 'Instrumentation and control roles are Primary; operations roles Secondary',
     'High', 'node:test, table-driven over a title list agreed with sales', 'Gap',
     '"Senior Instrument Engineer" and "Process Control Engineer" come back None; 41% of dataset contacts get no persona'),
    ('UT-21', 'Vertical classification and confidence', 'classify()', F, 'Industry only: Oil & Gas - Refining, Petrochemicals, LNG, Downstream Oil & Gas, blank',
     'classify(industry, "")', 'Refining/Petrochemicals/Gas processing at medium; unmapped → Other, low, needs review',
     'High', 'node:test', 'Pass', 'As expected; "Downstream Oil & Gas" falls to Other (an AI classifier would decide)'),
    ('UT-22', 'Classification is high confidence when industry and site process agree', 'classify()', F, 'industry Refining, site Crude refining',
     'classify()', 'confidence high', 'Medium', 'node:test', 'Pass', 'Covered by the existing golden test'),
    ('UT-23', 'Pilot-region knock-out ignores case', 'buildAccounts() region rule', F, 'country = singapore', 'processLeads', 'Account passes',
     'High', 'node:test', 'Pass', 'Passes'),
    ('UT-24', 'Pilot-region knock-out accepts common variants (SG, Viet Nam, Việt Nam, Phillipines)', 'buildAccounts() region rule', F,
     f'{DS}: accounts tagged FMT-COUNTRY in Account key', 'processLeads', 'Accounts in the pilot region pass',
     'High', 'node:test', 'Fail', 'All variants excluded as "outside the pilot region": about 50 in-region dataset accounts lost'),
    ('UT-25', 'Managed-separately and all-opted-out knock-outs', 'buildAccounts()', F, 'managed_separately = Y; every contact opt_out = Y',
     'processLeads', 'Excluded with the matching reason', 'High', 'node:test', 'Pass', 'Both reasons as specified'),
    ('UT-26', 'Contactability matrix: channel × consent × opt-out', 'processLeads() reachability', F,
     'Verified email + LinkedIn; unverified email + LinkedIn; unverified email only; nothing; consent Implied; opt-out blank',
     'processLeads per case', 'reachableBy = email and LinkedIn / LinkedIn / none / none; Implied or blank opt-out → not contactable',
     'High', 'node:test, table-driven', 'Pass', 'All combinations as specified'),
    ('UT-27', 'Company details that differ between rows are flagged', 'buildAccounts() consistency', F, 'Two rows, same company, different revenue',
     'processLeads', 'One "Differs from row N" issue; first row\'s value used', 'Medium', 'node:test', 'Pass', '58 of 60 dataset rows flagged; 2 not flagged, to investigate'),
    ('UT-28', 'Counts add up', 'processLeads() stats', F, f'{DS} Lead template (7,498 rows)', 'processLeads',
     'rowsRead = notLoaded + merged + contacts', 'High', 'node:test', 'Pass', '7,498 = 45 + 457 + 6,996'),
    ('UT-29', 'Same file gives the same result every time', 'processLeads()', NF('reliability'), f'{DS}', 'Run twice, compare stats',
     'Identical', 'Medium', 'node:test', 'Pass', 'Identical'),
    ('UT-30', 'Engine throughput at 1× and 10× the dataset', 'processLeads()', NF('performance'), f'{DS}, then 75k rows (10 copies)',
     'Time processLeads', 'Under 1 s for 7.5k rows; scales roughly linearly', 'Medium', 'node:test with a time budget', 'Pass', '0.18 s for 7,498 rows; 1.2 s for 74,983 rows'),
    ('UT-31', 'Page helpers: HTML escaping, initials, avatar colour', 'esc(), initials(), avColor() in the page', F,
     'esc(\'<img onerror>\'), initials("Wei Ming Tan"), avColor same id twice', 'Extract the helpers to a module, or evaluate in jsdom',
     'Escaped; "WM"; same colour each time', 'Medium', 'jsdom or Playwright page.evaluate', 'Not run', 'esc() confirmed indirectly by CT-30'),
    ('UT-32', 'Issue → check mapping covers every issue text the engine can produce', 'checkOf() in the page', F,
     'Every issue in the dataset run', 'Group issues with checkOf; list the issue texts that fall into "required" by default',
     'Only missing-field issues land in "Required fields"', 'Medium', 'Playwright page.evaluate', 'Gap',
     'Fallback bucket: "No owner rep", "isn\'t an email", "No company size" all land in "Required fields", so the counts mix different problems'),
]

COMPONENT = [
    ('CT-01', 'Upload card renders with required fields and pilot region', 'renderStart("upload")', F, 'Fresh page', 'Open 10-prospecting.html',
     'Drop zone, "Use sample data", "Download lead template", required-field list and the 6 pilot countries visible', 'High', 'Playwright', 'Pass', 'All visible; loaded in 162 ms'),
    ('CT-02', 'Choosing a file opens the checks pop-up', 'Drop zone + #fileInput → onFile()', F, DS, 'setInputFiles(#fileInput)', 'Checks pop-up appears',
     'High', 'Playwright setInputFiles', 'Pass', 'Pop-up after 1.5 s (read + parse + rules)'),
    ('CT-03', 'Drag and drop a file onto the drop zone', 'dropZone drop handler', F, DS, 'Dispatch dragover / drop with a DataTransfer',
     'Border highlights on dragover; file processed on drop', 'Medium', 'Playwright dispatchEvent with DataTransfer', 'Not run', ''),
    ('CT-04', 'Wrong file type is refused with a message', 'readFileToGrids()', F, 'bad.txt', 'Upload', 'Toast "Use a .csv or .xlsx file"; nothing processed',
     'High', 'Playwright', 'Pass', 'Toast shown'),
    ('CT-05', 'Excel library unavailable (CDN blocked)', 'readFileToGrids()', NF('reliability'), 'Block cdnjs.cloudflare.com', 'Upload an .xlsx',
     'Toast tells the user to save as CSV', 'Medium', 'Playwright route.abort()', 'Not run', ''),
    ('CT-06', 'Multi-sheet workbook: the "Lead template" sheet is used, guide and answer-key sheets ignored', 'pickSheet()', F, f'{DS} (9 sheets)',
     'Upload', 'Sheet badge reads "Lead template"; 7,498 rows read', 'High', 'Playwright', 'Pass', '7,498 rows read from "Lead template"'),
    ('CT-07', 'Checks pop-up runs all 12 steps and shows a result for each', 'openChecks()', F, DS, 'Upload; wait for footer',
     'Each step turns green/amber/red/grey with a count and the first 5 rows; progress bar reaches 100%', 'High', 'Playwright', 'Pass',
     'e.g. Email format 197 found; Duplicates 457; Opt-outs 259; Classification 854 need review; Knock-outs 275 excluded'),
    ('CT-08', 'Checks footer totals match the engine', 'openChecks() footer', F, DS, 'Read footer text',
     '"7,382 issues · 1,168 of 1,443 accounts pass · 4,933 contacts in the list"', 'High', 'Playwright vs node engine run', 'Pass', 'Matches the engine exactly'),
    ('CT-09', 'Checks pop-up timing', 'openChecks() animation', NF('performance / usability'), DS, 'Time from upload to "View the list"',
     'Under 5 s', 'Low', 'Playwright timing', 'Fail', '6.4 s: 1.5 s processing plus a fixed 4.6 s animation (12 × 380 ms), even for tiny files'),
    ('CT-10', 'Stat cards show rows, issues, accounts, excluded and final list', 'renderRun() stats', F, DS, 'View the list',
     'Rows read 7,498 (45 not loaded · 457 merged); Issues 7,382; Accounts 1,443; Excluded 275; Final list 4,933 of 6,996', 'High', 'Playwright', 'Pass', 'All five values correct'),
    ('CT-11', 'Final list table renders every contact with 15 columns', 'drawListRows()', F, DS, 'View the list; count rows',
     '6,996 rows; email shows Verified / Not verified / Malformed', 'High', 'Playwright', 'Pass', '6,996 rows rendered'),
    ('CT-12', 'Final list render time and DOM size at 7.5k rows', 'drawListRows()', NF('performance'), DS, 'Time "View the list" → table visible',
     'Under 2 s; DOM under 50k nodes (virtualised or paginated)', 'High', 'Playwright + performance.now', 'Fail', '7.3 s; 275,831 DOM nodes; no pagination or virtual scrolling'),
    ('CT-13', 'Status filter pills', 'visibleContacts() filt', F, DS, 'Click All / In the final list / Not contactable / Not in the list',
     'Row counts add up to 6,996; In the final list = 4,933', 'High', 'Playwright', 'Pass', 'In the final list = 4,933 rows (0.9 s to redraw)'),
    ('CT-14', 'Search by name, company or title', 'visibleContacts() q', F, DS, 'Type "refin"', 'Only matching rows; case-insensitive',
     'High', 'Playwright', 'Pass', '877 rows match "refin"'),
    ('CT-15', 'Search responsiveness while typing', 'toolbar oninput → drawListRows()', NF('performance'), DS, 'Type one character in the search box',
     'Under 200 ms per keystroke (debounced)', 'High', 'Playwright + performance.now', 'Fail',
     '2.5 s of script on the first keystroke (redraws ~6,900 rows, no debounce); 14 s end to end in headless Chromium'),
    ('CT-16', 'Search with no match shows the empty state', 'table() empty', F, 'Search "zzzz"', 'Type', '"No contacts match."', 'Low', 'Playwright', 'Pass', 'Empty state shown'),
    ('CT-17', 'Only contacts in the list can be selected', 'selectable()', F, DS, 'Look at the checkbox column for excluded / opted-out contacts',
     'Checkbox only on "In the list" and "Not contactable" rows; "—" on others', 'High', 'Playwright', 'Pass', 'Sample: 14 checkboxes for 14 selectable of 17 contacts'),
    ('CT-18', 'Select all respects the filter and shows a partial state', 'toggleAll(), updateSelBar()', F, DS,
     'Filter "In the final list" → select all; then untick one', 'All 4,933 selected; header box becomes indeterminate after unticking one',
     'High', 'Playwright', 'Pass', '4,933 selected in 1.0 s; button reads "Send 4933 selected to Scoring →"'),
    ('CT-19', 'Selection bar count and Clear', 'selBar', F, 'Select 3 contacts', 'Read bar; click Clear', '"3 prospects selected"; Clear empties it',
     'Medium', 'Playwright', 'Pass', 'As expected'),
    ('CT-20', 'Accounts tab: columns, money format, classification reason, knock-out reason', 'drawAccRows()', F, DS, 'Open Accounts',
     '1,443 rows; revenue as USD 2.4bn / USD 850m; excluded rows show the reason', 'High', 'Playwright', 'Pass', '1,443 rows in 0.46 s'),
    ('CT-21', 'Accounts filters: Pass / Excluded / Needs review', 'drawAccRows() filt', F, DS, 'Click each pill',
     'Pass 1,168; Excluded 275; Needs review = accounts with no mapping match', 'High', 'Playwright', 'Pass', 'Needs review = 854 (59% of accounts)'),
    ('CT-22', 'Issue cell shows the first issue, "+N more", and every issue on hover', 'issueCell()', F, 'Row with 3+ issues', 'Hover the cell',
     'Dot colour = worst severity; tooltip lists all issues with fixes', 'Medium', 'Playwright title attribute', 'Not run', ''),
    ('CT-23', 'Duplicate issue appears on the row it was merged into', 'issuesFor()', F, 'Row key DUP-EXACT pair', 'Find the original row',
     'Shows "Duplicate of row N" against the kept row', 'Medium', 'Playwright', 'Not run', ''),
    ('CT-24', 'Issues for rows not loaded are listed above the table', 'unattachedNotice()', F + ' + usability', DS, 'View the list',
     'Panel lists the rows not loaded', 'Medium', 'Playwright', 'Fail',
     '289 issues listed one per line in a panel above the table, pushing the list down several screens'),
    ('CT-25', 'Save pop-up: default name, Enter to save, Cancel, click outside to close', 'openSave(), saveList()', F, 'Sample data',
     'Open Save list; check name; press Enter', 'Name = file name · date; saved; toast "Saved as …"', 'High', 'Playwright', 'Pass', 'Works for the sample and for 50 selected rows'),
    ('CT-26', 'Save the full screened list from a 7.5k-row file', 'saveList() → localStorage', NF('capacity / reliability'), DS,
     'View the list → Save list → Save', 'List saved, or a clear message about the size limit', 'Critical', 'Playwright', 'Fail',
     'Not saved: the list is 8.1 MB, more than the ~5 MB localStorage limit. Message wrongly says "This browser blocks storage… Allow site data"; pop-up stays open'),
    ('CT-27', 'Saved lists tab: list appears with counts, rename, delete', 'renderStart("saved"), startRename(), removeList()', F, 'One saved list',
     'Open Saved lists; rename (Enter and Escape); delete', 'Counts shown; rename saved on Enter, cancelled on Escape; delete removes it', 'High', 'Playwright', 'Pass', 'Saved list shown with counts; rename and delete not run'),
    ('CT-28', '"Score →" and "Save and go to Scoring" open Scoring with the list id', 'saveList(true)', F, 'Saved list',
     'Click Score →', '11-scoring.html?list=<id>', 'High', 'Playwright waitForURL', 'Pass', 'Opened 11-scoring.html?list=list-…'),
    ('CT-29', 'Save buttons disabled when no account passes', 'renderRun()', F, 'CSV with no recognisable header', 'Upload; view the list',
     'Save list and Go to Scoring disabled', 'Medium', 'Playwright', 'Pass', 'Disabled'),
    ('CT-30', 'Script in file contents is shown as text, not run', 'esc() in every renderer', NF('security'), 'CSV with <img onerror> and <script> in name and company',
     'Upload; view list and accounts', 'Text displayed literally; nothing runs', 'Critical', 'Playwright', 'Pass', 'No script executed'),
    ('CT-31', 'Download lead template', 'downloadTemplate()', F, '—', 'Click "Download lead template (.csv)"', 'lead_template.csv with the 24 column names',
     'Medium', 'Playwright waitForEvent("download")', 'Pass', 'lead_template.csv downloaded'),
    ('CT-32', 'Role switcher hides the page for roles without access', 'applyRoleToNav()', F + ' + security', 'Role Viewer, then Sales rep',
     'Switch role (demo) → Viewer; reload', 'Viewer sees "Not available for this role"; Sales rep sees the page', 'Medium', 'Playwright', 'Pass', 'As expected'),
    ('CT-33', 'Keyboard access: upload, tabs, filter pills', 'dropZone, .ftab, .seg-pill', NF('accessibility'), '—', 'Tab through the page; try to upload without a mouse',
     'Every control reachable and operable by keyboard', 'High', 'Playwright keyboard + axe-core', 'Fail',
     'Drop zone not focusable (file input is display:none); tabs and filter pills are <div onclick>, not buttons'),
]

SMOKE = [
    ('SM-01', 'Page opens without script errors', 'Page load', F, 'Network on', 'Open 10-prospecting.html', 'No console errors other than blocked fonts', 'Critical', 'Playwright console listener', 'Pass', 'Only font requests failed (blocked in the test)'),
    ('SM-02', 'Page title and heading', 'Page load', F, '—', 'Read title and topbar', '"Prospecting — DemandAI Pilot"; "Lead discovery and research"', 'High', 'Playwright', 'Pass', ''),
    ('SM-03', 'Page loads quickly', 'Page load', NF('performance'), '—', 'Measure load', 'Under 2 s', 'High', 'Playwright', 'Pass', '162 ms (local file)'),
    ('SM-04', 'Excel library loads from the CDN', 'xlsx.full.min.js', NF('availability'), 'Real network', 'Check window.XLSX', 'Defined', 'Critical', 'Playwright', 'Not run', 'Served locally in this run'),
    ('SM-05', 'Upload zone, sample button and template button visible', 'renderStart()', F, '—', 'Look', 'All three visible', 'Critical', 'Playwright', 'Pass', ''),
    ('SM-06', 'Sample data runs end to end', 'useSample()', F, 'Built-in sample', 'Click Use sample data', '6 issues · 9 of 12 accounts pass · 14 contacts in the list', 'Critical', 'Playwright', 'Pass', 'Exact match'),
    ('SM-07', 'Generated dataset uploads', 'onFile()', F, DS, 'Upload', 'Checks pop-up opens', 'Critical', 'Playwright', 'Pass', ''),
    ('SM-08', 'Correct sheet picked from the workbook', 'pickSheet()', F, DS, 'Read the sheet badge', '"Lead template"', 'Critical', 'Playwright', 'Pass', ''),
    ('SM-09', 'All rows read', 'processLeads()', F, DS, 'Read "Rows read"', '7,498', 'Critical', 'Playwright', 'Pass', ''),
    ('SM-10', 'Checks complete', 'openChecks()', F, DS, 'Wait for "View the list →"', 'Footer shows totals', 'Critical', 'Playwright', 'Pass', '6.4 s'),
    ('SM-11', 'Issues found on a dirty file', 'processLeads()', F, DS, 'Read Issues card', '> 0, with stop / flag / info split', 'High', 'Playwright', 'Pass', '45 stop · 3,629 flag · 3,708 info'),
    ('SM-12', 'Final list opens', 'renderRun()', F, DS, 'Click View the list', 'Table with rows', 'Critical', 'Playwright', 'Pass', 'Slow: 7.3 s'),
    ('SM-13', 'Some accounts pass and some are excluded', 'buildAccounts()', F, DS, 'Read Accounts / Excluded cards', 'Both non-zero', 'High', 'Playwright', 'Pass', '1,168 pass · 275 excluded'),
    ('SM-14', 'Accounts tab opens', 'renderAccountsTab()', F, DS, 'Click Accounts', 'Table with 1,443 rows', 'High', 'Playwright', 'Pass', ''),
    ('SM-15', 'A filter works', 'Filter pills', F, DS, 'Click "In the final list"', '4,933 rows', 'High', 'Playwright', 'Pass', ''),
    ('SM-16', 'Search works', 'Search box', F, DS, 'Type a company name', 'Rows narrow to that company', 'High', 'Playwright', 'Pass', ''),
    ('SM-17', 'Select a contact', 'Checkbox', F, DS, 'Tick one row', 'Bar shows "1 prospect selected"', 'High', 'Playwright', 'Pass', ''),
    ('SM-18', 'Save a list (small)', 'saveList()', F, 'Sample data or 50 selected', 'Save', 'Toast "Saved as …"', 'Critical', 'Playwright', 'Pass', ''),
    ('SM-19', 'Save a list (full dataset)', 'saveList()', F, DS, 'Save list → Save', 'Saved', 'Critical', 'Playwright', 'Fail', 'Storage quota exceeded (see CT-26)'),
    ('SM-20', 'Saved list appears and survives a reload', 'loadLists()', NF('persistence'), 'One saved list', 'Reload; open Saved lists', 'List still there', 'High', 'Playwright', 'Pass', 'Still listed after reload'),
    ('SM-21', 'Go to Scoring from a saved list', 'Score →', F, 'One saved list', 'Click Score →', '11-scoring.html opens with the list', 'Critical', 'Playwright', 'Pass', ''),
    ('SM-22', 'Template downloads', 'downloadTemplate()', F, '—', 'Click', 'lead_template.csv', 'Medium', 'Playwright', 'Pass', ''),
    ('SM-23', 'Wrong file type refused', 'readFileToGrids()', F, 'bad.txt', 'Upload', 'Toast', 'High', 'Playwright', 'Pass', ''),
    ('SM-24', 'File with no header refused safely', 'readTable()', F, 'CSV without template headers', 'Upload', '1 stop issue; save disabled', 'High', 'Playwright', 'Pass', ''),
    ('SM-25', 'Role without access is blocked', 'applyRoleToNav()', F, 'Role Viewer', 'Reload', 'No-access screen', 'High', 'Playwright', 'Pass', ''),
    ('SM-26', 'Narrow screen does not scroll sideways', 'Layout', NF('compatibility'), '390 × 844 viewport', 'Open the upload screen', 'No horizontal page scroll', 'Medium', 'Playwright viewport', 'Pass', 'Upload screen only; result tables not checked'),
    ('SM-27', 'Other browsers', 'Whole page', NF('compatibility'), 'Firefox, Safari (WebKit)', 'Repeat SM-01 to SM-18', 'Same results', 'Medium', 'Playwright projects', 'Not run', ''),
]

UAT = [
    ('UAT-01', 'Sales ops can upload the client\'s file and get a validation result in under a minute', '3.1 Upload and map', NF('performance') + ' + ' + F, DS,
     'Upload the file as received', 'Result visible within 60 s, columns mapped automatically', 'Critical', 'Manual, timed', 'Pass', '6.4 s to the check summary, 13.7 s to the list'),
    ('UAT-02', 'Columns in any order and with stars or different case are mapped', '3.1 Upload and map', F, 'Template with shuffled, upper-case columns',
     'Upload', 'No column issues', 'High', 'Manual', 'Pass', 'Covered by UT-04'),
    ('UAT-03', 'Every missing required field is reported with a plain fix', '3.2 Check', F + ' + usability', 'Row key MF-* rows', 'Look up 10 MF rows in the list',
     'Each row shows the problem, what happens and how to fix it', 'Critical', 'Manual sample of 10 rows', 'Pass', '100% of MF-* rows flagged'),
    ('UAT-04', 'Duplicates are merged so nobody is contacted twice', '3.2 Check', F, 'Row key DUP-EXACT, DUP-EMAIL-CASE, DUP-UPDATED', 'Search the duplicated names',
     'One contact each; "Duplicate of row N" shown', 'Critical', 'Manual', 'Pass', '280 of 280 merged'),
    ('UAT-05', 'Likely duplicates the rules can\'t prove (alias emails, same name and company) are shown for review', '3.2 Check', F, 'Row key DUP-FUZZY',
     'Search the names', 'Flagged as possible duplicates', 'High', 'Manual', 'Gap', '67 of 70 not flagged: the same person can be contacted twice'),
    ('UAT-06', 'One company written two ways is treated as one account', '3.2 Check', F, 'Account key name_variant_used', 'Open Accounts; search the company',
     'One account', 'High', 'Manual', 'Gap', '43 extra accounts created (1,443 shown vs 1,400 real)'),
    ('UAT-07', 'Invalid emails are never used as a channel', '3.2 Check', F, 'Row key EM-* rows', 'Check "Reachable by" for those contacts',
     'Email not listed as a channel', 'Critical', 'Manual', 'Fail', 'Double-dot, trailing-dot and mailto: addresses still count as usable email (see UT-11)'),
    ('UAT-08', 'Personal, role and mismatched-domain emails are flagged for review', '3.2 Check', F, 'Row key EM-PERSONAL, EM-ROLE, EM-DOMAIN-MISMATCH',
     'Look at the Issues column', 'Flagged', 'High', 'Manual', 'Gap', 'Not flagged; gmail and info@ addresses are treated as valid work emails'),
    ('UAT-09', 'Out-of-region accounts are excluded and the reason is logged', '3.5 Knock-outs', F, 'Account key ICP-REGION', 'Accounts → Excluded',
     'Each shows "Outside the pilot region (country)"', 'Critical', 'Manual', 'Pass', ''),
    ('UAT-10', 'In-region accounts with a country written differently are kept', '3.5 Knock-outs', F, 'Account key FMT-COUNTRY', 'Accounts → Excluded',
     'Not excluded', 'Critical', 'Manual', 'Fail', 'SG, Viet Nam, Phillipines and similar are excluded as out of region'),
    ('UAT-11', 'Accounts managed by a separate team are excluded', '3.5 Knock-outs', F, 'Account key ICP-MANAGED', 'Accounts → Excluded',
     '"Managed separately by Client"', 'Critical', 'Manual', 'Pass', '49 managed accounts: 41 excluded for this reason, 8 already excluded for region (that rule runs first)'),
    ('UAT-12', 'Opted-out contacts never reach the final list', '3.6 Suppression', F, 'Row key SUP-OPTOUT, SUP-OPTOUT-CONFLICT', 'Filter "In the final list"; search them',
     'None present', 'Critical', 'Manual + automated check', 'Pass', '0 opted-out or unconfirmed contacts in the final list'),
    ('UAT-13', 'Contacts with no or unknown consent basis are not contactable', '3.6 Suppression', F, 'Row key MF-CONSENT, FMT-CONSENT', 'Filter "Not contactable"',
     'All present with the reason', 'Critical', 'Manual', 'Pass', ''),
    ('UAT-14', 'Consent basis is recorded per contact', '3.6 Suppression', F, DS, 'Final list Consent column', 'Every contact shows its basis', 'High', 'Manual', 'Pass', ''),
    ('UAT-15', 'Each account gets a vertical, account type, confidence and one-line reason', '3.4 Classify', F, DS, 'Accounts tab',
     'All four shown for every account', 'High', 'Manual', 'Pass', ''),
    ('UAT-16', 'The "needs review" pile is manageable', '3.4 Classify', NF('usability'), DS, 'Accounts → Needs review',
     'A small share of accounts', 'Medium', 'Manual', 'Gap', '854 of 1,443 (59%); every out-of-ICP industry lands here until the AI classifier is connected'),
    ('UAT-17', 'Instrumentation and control engineers are recognised as the primary persona', '3.4 Classify', F, 'Titles from the dataset',
     'Filter by title "Instrument Engineer"', 'Persona = Primary', 'High', 'Manual', 'Fail', 'Shown as "None" (see UT-20)'),
    ('UAT-18', 'Out-of-ICP industries and distributors end up below the fit floor in Scoring', '3.4 → Scoring', F, 'Account key ICP-INDUSTRY, ICP-DISTRIBUTOR',
     'Save the list; score it', 'Below fit floor', 'High', 'Manual across pages', 'Not run', 'Blocked for the full file by CT-26'),
    ('UAT-19', 'Validation report can be sent back to the client', '3.2 Check ("the report goes back")', F, DS, 'Look for an export of issues',
     'Download of every issue with row, field, problem and fix', 'Critical', 'Manual', 'Gap', 'No export on this page; issues can only be read on screen'),
    ('UAT-20', 'Every problem carries a data-quality code (D1–D6)', '3.3 Readiness gate', F, DS, 'Look at the Issues column', 'Code visible per issue',
     'High', 'Manual', 'Gap', 'Codes exist in the engine but are not shown in the table'),
    ('UAT-21', 'Readiness gate: is the data sufficient to start measuring?', '3.3 Readiness gate', F, DS, 'Look for coverage, recency, contactability, baseline summary',
     'A go / no-go readiness report', 'High', 'Manual', 'Gap', 'Not on this page (only the check list and counts)'),
    ('UAT-22', 'Nothing is changed silently', '3.2 Check', F, 'Rows with $ numbers, Yes/No, whitespace', 'Compare list values to the file',
     'Original values shown; every reformat has an issue', 'High', 'Manual', 'Pass', ''),
    ('UAT-23', 'Rep can send a chosen subset to Scoring', 'Hand off', F, DS, 'Select 50 contacts → Send to Scoring', 'Scoring opens with those 50',
     'High', 'Manual', 'Pass', 'Saved as "… · 50 selected"; Scoring opens with the list id'),
    ('UAT-24', 'Manager can save the whole screened universe and hand it to Scoring', 'Hand off', F + ' + capacity', DS, 'Save and go to Scoring',
     'Scoring opens with all 1,168 accounts', 'Critical', 'Manual', 'Fail', 'Fails at save: list too large for browser storage (CT-26)'),
    ('UAT-25', 'Working through 7.5k rows is comfortable', 'Final list', NF('performance / usability'), DS, 'Search, filter, scroll for 5 minutes',
     'No freezes over 1 s', 'High', 'Manual', 'Fail', 'Each keystroke freezes the page for 2.5 s or more; first render 7.3 s'),
    ('UAT-26', 'Screens are clear without training', 'Whole page', NF('usability'), 'New user', 'Think-aloud session: upload, find the problems, save',
     'Completes without help', 'Medium', 'Moderated session', 'Not run', ''),
    ('UAT-27', 'Lead data stays in the browser during the PoC', 'Whole page', NF('security / privacy'), DS, 'Watch network traffic during upload and save',
     'No request carries contact data', 'High', 'DevTools / Playwright request log', 'Not run', 'Code reads the file locally; to confirm with a request log'),
    ('UAT-28', 'A corrected file produces fewer issues', '3.2 Check', F, f'{DS} with 20 Row key rows fixed', 'Re-upload', 'Issue count drops by those rows',
     'Medium', 'Manual', 'Not run', ''),
    ('UAT-29', 'Each role sees what it should', 'Roles', F + ' + security', 'Admin, Sales manager, Sales rep, Viewer', 'Switch roles',
     'Viewer blocked; reps see only their accounts', 'Medium', 'Manual', 'Gap', 'Viewer blocked; reps still see every rep\'s accounts (owner not used to filter)'),
    ('UAT-30', 'Sample data is clearly marked as sandbox', 'Sample data', F, 'Use sample data', 'Save; open Saved lists', 'Marked sandbox everywhere',
     'Low', 'Manual', 'Not run', ''),
]

SUMMARY = [
    ('Engine is fast; the page is the bottleneck',
     'The rules engine processes 7,498 rows in 0.18 s and 75k rows in 1.2 s. The page takes 7.3 s to show the list and builds 275,831 DOM nodes, and every keystroke in search re-renders all rows (2.5 s of script). Paginate or virtualise the tables and debounce search before the client\'s real file arrives.',
     'CT-12, CT-15, UAT-25, UT-30'),
    ('The full list cannot be saved or sent to Scoring',
     'A screened list from this file is 8.1 MB; browser storage holds about 5 MB, so Save fails and the message wrongly blames browser settings. Any file over about 4,000 rows will hit this. Store lists in IndexedDB or on the server, and say clearly when a list is too large.',
     'CT-26, SM-19, UAT-24'),
    ('Validation rules miss real-world mess',
     'Malformed-looking emails (double dots, trailing dot, mailto:), webmail and role mailboxes pass; country codes and spelling variants knock in-region accounts out; alias-email duplicates and company-name variants slip through. The dataset\'s Row key lists every affected row, so each fix can be checked by re-running the same file.',
     'UT-11, UT-15, UT-17, UT-24, UAT-05 to UAT-10'),
    ('Persona and classification rules are too narrow',
     '41% of contacts get no persona because "Instrument Engineer" doesn\'t match "instrumentation"; 59% of accounts need review because unmapped industries fall to "Other". Expect the AI classifier and a wider persona list to carry most of the load.',
     'UT-20, UT-21, UAT-16, UAT-17'),
    ('Parts of the PDF flow are not on this page yet',
     'There is no downloadable validation report for the client (3.2), no D1–D6 codes shown per issue, and no readiness go/no-go (3.3). Owner email doesn\'t limit what a rep sees.',
     'UAT-19 to UAT-21, UAT-29'),
    ('What works well',
     'Every count on screen matches the engine; all missing-field, malformed-email, exact-duplicate, opt-out and consent cases in the dataset were caught; HTML in the file is escaped; the right sheet is picked from a 9-sheet workbook; and small lists save and reload.',
     'CT-08, CT-30, SM-06 to SM-18, UAT-03, UAT-04, UAT-12'),
    ('Accessibility needs a pass',
     'The upload can\'t be reached by keyboard and the tabs and filters are clickable <div>s. Run axe-core in the component suite.',
     'CT-33'),
]

TYPES = [
    ('Unit', 'Tests one function at a time, with no browser: the rules engine (demandai-engine.js) and the page\'s pure helpers.',
     'node --test (already in package.json); table-driven cases; the dataset\'s Row key as the oracle', 'Every commit', 'UNIT'),
    ('Component', 'Tests one piece of the page (upload, checks pop-up, tables, filters, selection, save, saved lists, roles) in a real browser, with controlled input.',
     'Playwright with routes that serve the Excel library locally and block fonts', 'Every pull request', 'COMPONENT'),
    ('Smoke', 'A short, fast run over the critical path to decide whether a build is worth testing further. Stop at the first failure.',
     'Playwright, one spec, under 2 minutes', 'Every deploy', 'SMOKE'),
    ('User acceptance', 'Business scenarios from the Lead discovery and research flow (3.1–3.6), run by sales ops or the client with the generated dataset and its answer key.',
     'Manual, with the Row key and Account key sheets as the expected results; timed where performance matters', 'Before each client milestone', 'UAT'),
]

HEAD = ['ID', 'Test case', 'Function / component under test', 'Aspect', 'Preconditions and test data', 'Steps', 'Expected result', 'Priority',
        'How to automate', 'First run (3 Oct 2026)', 'Observed']
WIDTH = [9, 46, 30, 24, 40, 34, 48, 10, 30, 14, 56]
FONT = 'Arial'
hdr_font = Font(name=FONT, size=10, bold=True, color='FFFFFF')
hdr_fill = PatternFill('solid', fgColor='1F3A5F')
body = Font(name=FONT, size=10)
bold = Font(name=FONT, size=10, bold=True)
title = Font(name=FONT, size=13, bold=True)
wrap = Alignment(wrap_text=True, vertical='top')
STATUS_FILL = {'Pass': 'E2F0D9', 'Fail': 'F8D7DA', 'Gap': 'FFF2CC', 'Not run': 'EDEDED'}

wb = openpyxl.Workbook()
ov = wb.active
ov.title = 'Overview'
ov['A1'] = 'Test cases for 10-prospecting.html (Lead discovery and research)'
ov['A1'].font = title
ov['A2'] = (f'Test data: {DS} (7,498 lead rows, answer key in its Row key and Account key sheets). First run: 3 Oct 2026, headless Chromium, '
            'with the Excel library served locally. Timings depend on the machine; treat them as relative.')
ov['A2'].font, ov['A2'].alignment = body, wrap
ov.merge_cells('A2:F2')
ov.row_dimensions[2].height = 30

r = 4
for j, h in enumerate(['Test type', 'What it covers', 'Tooling', 'When to run', 'Cases', 'Pass', 'Fail', 'Gap', 'Not run']):
    c = ov.cell(row=r, column=j + 1, value=h)
    c.font, c.fill, c.alignment = hdr_font, hdr_fill, wrap
for name, what, tool, when, sheet in TYPES:
    r += 1
    sn = {'UNIT': 'Unit', 'COMPONENT': 'Component', 'SMOKE': 'Smoke', 'UAT': 'UAT'}[sheet]
    last = 3 + len(globals()[sheet])
    vals = [name, what, tool, when, f"=COUNTA('{sn}'!A4:A{last})"] + [f"=COUNTIF('{sn}'!J4:J{last},\"{s}\")" for s in ('Pass', 'Fail', 'Gap', 'Not run')]
    for j, v in enumerate(vals):
        c = ov.cell(row=r, column=j + 1, value=v)
        c.font, c.alignment = body, wrap
r += 1
ov.cell(row=r, column=1, value='Total').font = bold
for j in range(5, 10):
    col = openpyxl.utils.get_column_letter(j)
    c = ov.cell(row=r, column=j, value=f'=SUM({col}5:{col}{r - 1})')
    c.font = bold

r += 2
ov.cell(row=r, column=1, value='Status key').font = bold
for s, meaning in [('Pass', 'Behaved as expected'), ('Fail', 'A defect: the page or rule does not do what it is meant to'),
                   ('Gap', 'Works as coded, but misses a business need from the PDF flow or the dataset'), ('Not run', 'Written, not yet executed')]:
    r += 1
    c = ov.cell(row=r, column=1, value=s)
    c.font, c.fill = body, PatternFill('solid', fgColor=STATUS_FILL[s])
    ov.cell(row=r, column=2, value=meaning).font = body

r += 2
ov.cell(row=r, column=1, value='What the first run tells us').font = title
r += 1
for j, h in enumerate(['Inference', 'Evidence and recommendation', 'Test cases']):
    c = ov.cell(row=r, column=j + 1, value=h)
    c.font, c.fill, c.alignment = hdr_font, hdr_fill, wrap
for inf, ev, ids in SUMMARY:
    r += 1
    for j, v in enumerate([inf, ev, ids]):
        c = ov.cell(row=r, column=j + 1, value=v)
        c.font, c.alignment = (bold if j == 0 else body), wrap
    ov.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
    ov.row_dimensions[r].height = 75
for col, w in zip('ABCDEFGHI', [26, 60, 34, 30, 9, 8, 8, 8, 9]):
    ov.column_dimensions[col].width = w

for sheet_name, cases, blurb in [('Unit', UNIT, TYPES[0][1]), ('Component', COMPONENT, TYPES[1][1]), ('Smoke', SMOKE, TYPES[2][1]), ('UAT', UAT, TYPES[3][1])]:
    ws = wb.create_sheet(sheet_name)
    ws['A1'] = f'{sheet_name} tests · {blurb}'
    ws['A1'].font = bold
    for j, h in enumerate(HEAD):
        c = ws.cell(row=3, column=j + 1, value=h)
        c.font, c.fill, c.alignment = hdr_font, hdr_fill, wrap
        ws.column_dimensions[openpyxl.utils.get_column_letter(j + 1)].width = WIDTH[j]
    for i, case in enumerate(cases):
        for j, v in enumerate(case):
            c = ws.cell(row=4 + i, column=j + 1, value=v or None)
            c.font, c.alignment = body, wrap
        ws.cell(row=4 + i, column=10).fill = PatternFill('solid', fgColor=STATUS_FILL[case[9]])
    last = 3 + len(cases)
    dv = DataValidation(type='list', formula1='"Pass,Fail,Gap,Not run,Blocked"', allow_blank=True)
    dv.add(f'J4:J{last}')
    ws.add_data_validation(dv)
    ws.freeze_panes = 'C4'
    ws.auto_filter.ref = f'A3:K{last}'

wb.calculation.fullCalcOnLoad = True  # the Overview counts are formulas; Excel computes them on open
wb.save(sys.argv[1])
print({k: len(v) for k, v in [('unit', UNIT), ('component', COMPONENT), ('smoke', SMOKE), ('uat', UAT)]})
