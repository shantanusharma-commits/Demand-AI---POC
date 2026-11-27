/* Admin configuration: the ICP rubric, signals and tiers, the signal registry, exclusions, opt-outs and
   suppression, team routing, who decides what, and the backtest accounts. Everything here is editable by the
   admin and saved in this browser (localStorage dmock_admin); every change is logged with who and when. */
(function () {
  if (!document.querySelector('[data-pane]')) return;
  var M = window.MOCK || {}, USERS = M.USERS || {}, REPS = M.REPS || [];
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var K = 'dmock_admin', A = {}; try { A = JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch (e) { A = {}; }
  var ME = 'Rajiv Nair';
  var now = function () { var d = new Date(); return 'Today ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  var uid = function () { return 'x' + Math.random().toString(36).slice(2, 8); };
  var uname = function (id) { return (USERS[id] || {}).name || id; };
  var say = function (m) { if (window.toast) window.toast(m); };
  function persist(what, area) { (A.log = A.log || []).unshift({ at: now(), by: ME, what: what, area: area || '' }); A.log = A.log.slice(0, 80); try { localStorage.setItem(K, JSON.stringify(A)); } catch (e) {} say(what); draw(); }
  function lastChange(area) { var l = (A.log || []).find(function (x) { return x.area === area; }); return l ? 'Last change: ' + esc(l.what.replace(/\.$/, '')) + ' · ' + esc(l.by) + ', ' + esc(l.at) : ''; }
  var nextVer = function () { A.ver = (A.ver || 1) + 1; return '2026.11.' + A.ver; };

  /* ─── Defaults ─── */
  A.rubric = A.rubric || [
    { id: 'r1', name: 'Industry', kind: 'List of values', vals: 'Refining, petrochemicals, gas processing', rule: 'Full points on a match; half for LNG and specialty chemicals', src: 'CRM industry field, then the data provider', w: 30, req: true },
    { id: 'r2', name: 'Region', kind: 'List of values', vals: 'Singapore, Malaysia, Thailand, Indonesia, Vietnam, Philippines', rule: 'Full points inside these countries; none outside', src: 'CRM billing country', w: 20, req: true },
    { id: 'r3', name: 'Company size', kind: 'Range', vals: '500 to 5,000 staff', rule: 'Full inside the range; half for 300 to 500', src: 'Data provider headcount', w: 20, req: false },
    { id: 'r4', name: 'Buyer role', kind: 'List of values', vals: 'Reliability, maintenance and operations leaders', rule: 'Full for a head or VP; half for a manager', src: 'Data provider title', w: 20, req: false },
    { id: 'r5', name: 'Installed control system age', kind: 'Number threshold', vals: '15 years or older', rule: 'Full at 15 years or more; scaled down to none at 5', src: 'Technographics', w: 10, req: false }];
  A.tiers = A.tiers || [
    { t: 1, pts: 100, full: 3, zero: 14, ex: 'Tender or capex announced, champion moves, new plant head, rival contract ending' },
    { t: 2, pts: 60, full: 14, zero: 60, ex: 'Hiring surge, tech-stack change, M&A, a LinkedIn comment on a relevant post' },
    { t: 3, pts: 30, full: 60, zero: 90, ex: 'Regulatory deadline, a like or a share, market news' }];
  A.sigs = A.sigs || [['Funding announcement', 'Company', 'Crunchbase', 1], ['Hiring surge', 'Company', 'Job postings feed', 2], ['Tender, capex or expansion', 'Company', 'Tender portals, filings', 1], ['Tech-stack change', 'Company', 'Technographics', 2], ['New plant head', 'Company', 'Job-change alerts', 1], ['Rival contract ending', 'Competitor', 'Contract data', 1], ['Researching a rival', 'Competitor', 'G2 Buyer Intent', 1], ['Rival named in job posts', 'Competitor', 'Job postings feed', 2], ['New executive hire', 'Personal', 'Job-change alerts', 1], ['Champion changes job', 'Personal', 'Job-change alerts', 1], ['LinkedIn comment on a relevant post', 'Personal', 'LinkedIn engagement', 2], ['LinkedIn like or share', 'Personal', 'LinkedIn engagement', 3], ['Regulatory deadline', 'Market', 'Regulatory calendars', 3], ['Sector news', 'Market', 'News feeds', 3], ['Visited the pricing page', 'First-party', 'GA4', 1], ['Content download', 'First-party', 'Marketing automation', 2], ['Email click', 'First-party', 'Sequencer', 2], ['Webinar attendance', 'First-party', 'Webinar platform', 1], ['AI-assistant referral', 'First-party', 'GA4', 2]].map(function (s, i) { return { id: 's' + i, name: s[0], level: s[1], src: s[2], tier: s[3], on: true, full: '', zero: '', persona: '', why: '' }; });
  A.excl = A.excl || [
    { id: 'e1', type: 'Competitor', val: 'rival-controls.example', why: 'A competitor', scope: 'Everywhere', until: '', by: 'Rajiv Nair', at: 'Mon 2 Nov' },
    { id: 'e2', type: 'Partner', val: 'partner-integrator.example', why: 'A partner: we sell through them', scope: 'Everywhere', until: '', by: 'Rajiv Nair', at: 'Mon 2 Nov' },
    { id: 'e3', type: 'Industry', val: 'Defence and military', why: 'We do not sell into defence', scope: 'Everywhere', until: '', by: 'Daniel Brooks', at: 'Fri 30 Oct' },
    { id: 'e4', type: 'Country or region', val: 'Myanmar', why: 'Trade-compliance policy', scope: 'Everywhere', until: '', by: 'Rajiv Nair', at: 'Thu 29 Oct' },
    { id: 'e5', type: 'Company size', val: 'Under 300 staff', why: 'Too small to buy a migration', scope: 'Lists and scoring', until: '', by: 'Daniel Brooks', at: 'Wed 28 Oct' }];
  A.opt = A.opt || [
    { id: 'o1', who: 'Zul Ismail', email: 'zul.ismail@mangrove-aromatics.example', co: 'Mangrove Aromatics', ch: 'All channels', src: 'Reply: "please remove me"', at: 'Wed 28 Oct', auto: true },
    { id: 'o2', who: 'Jia Hui Goh', email: 'jiahui.goh@nautilus-lng.example', co: 'Nautilus LNG', ch: 'All channels', src: 'Reply classified as Opted out', at: 'Mon 26 Oct', auto: true },
    { id: 'o3', who: 'Peter Lam', email: 'p.lam@harrowgas.example', co: 'Harrow Gas Processing', ch: 'Email', src: 'Unsubscribe link', at: 'Thu 22 Oct', auto: true }];
  A.sup = A.sup || [
    { id: 'u1', kind: 'Rule', val: 'Accounts with an open opportunity in the CRM', why: 'The owner is already selling', until: 'While the deal is open', src: 'CRM rule' },
    { id: 'u2', kind: 'Rule', val: 'Anyone touched in the last 14 days', why: 'Recent-touch window', until: 'Rolling 14 days', src: 'Policy' },
    { id: 'u3', kind: 'Rule', val: 'Hard-bounced email addresses', why: 'Bounce', until: 'Until re-verified', src: 'Sequencer' },
    { id: 'u4', kind: 'Domain', val: 'kingsbay-refining.example', why: 'Legal hold requested by the customer', until: '31 Dec 2026', src: 'Rajiv Nair' },
    { id: 'u5', kind: 'Account', val: 'Saltmarsh Gas', why: 'Budget frozen to April (call note)', until: '30 Apr 2027', src: 'Marco Lindqvist' }];
  A.teams = A.teams || [
    { id: 't1', name: "Sofia's pod", members: ['sofia'], how: 'Account owner first, then round robin' },
    { id: 't2', name: 'Kenji and Aisha', members: ['kenji', 'aisha'], how: 'Round robin' },
    { id: 't3', name: 'Enterprise', members: ['marco'], how: 'Least loaded' }];
  A.routes = A.routes || [
    { id: 'q1', field: 'Territory', op: 'is any of', val: 'Singapore, Malaysia', to: 'team:t1' },
    { id: 'q2', field: 'Territory', op: 'is any of', val: 'Thailand, Vietnam, Philippines, Indonesia', to: 'team:t2' },
    { id: 'q3', field: 'Deal size (USD)', op: 'over', val: '1,000,000', to: 'person:marco' },
    { id: 'q4', field: 'Product line', op: 'is any of', val: 'Safety systems', to: 'person:aisha' }];
  A.fallback = A.fallback || 'person:pavan';
  var AFTER = ['It expires and the account re-ranks', 'Individual next best actions', 'The touch is skipped', 'Stays held', 'Stays unmatched', 'A generic persona', 'Not counted', 'Lists use the last confirmed ICP', 'Blocks go-live', 'Stays off', 'Nothing ships until reviewed', 'Escalate to the sales manager', 'None'];
  A.esc = A.esc || [
    ['2', 'Message verification failed', 'Owning rep', '3 days', AFTER[0]], ['3', 'Identity tier I3 or I5', 'Owning rep', '3 days', AFTER[0]], ['4', 'Segment set to require approval', 'Owning rep', '3 days', AFTER[0]],
    ['5', 'A protective check could not run', 'Owning rep sees why; admin alerted', 'No due time', 'Stays held', 1], ['6', 'No draft produced', 'Owning rep', '3 days', AFTER[0]], ['7', 'No verified channel', 'Owning rep', '3 days', AFTER[0]],
    ['8', 'A campaign (10+ accounts in a micro-segment in 7 days)', 'Sales manager', '3 days', AFTER[1]], ['9', 'A campaign touch fails its re-check', 'Owning rep', '1 day', AFTER[2]],
    ['10', 'A held record (identity dispute, name-only CRM match)', 'Owning rep; admin for configuration', 'No due time', 'Stays held', 1], ['11', 'An unmatched reply', 'Owning rep', '3 days', 'Stays unmatched'], ['12', 'Unclear niche or persona', 'Owning rep', '3 days', 'A generic persona'],
    ['–', 'A meeting to confirm as qualified', 'Sales manager', '5 working days', 'Not counted'], ['13', 'The ICP is not confirmed yet', 'The rep or manager, in chat', 'No due time', 'Lists use the last confirmed ICP'],
    ['14', 'Setup: the closed-won field, weights and thresholds', 'Admin', 'No due time', 'Blocks go-live', 1], ['15', 'Backtest below the bar', 'Admin', 'No due time', 'Blocks go-live', 1], ['16', 'Enabling autopilot for a segment', 'Admin with the sales manager', 'No due time', 'Stays off', 1],
    ['–', 'Status watch or an anomaly alert', 'Owning rep', 'No due time', 'None'], ['–', 'A source underperforms; the weekly learning review', 'Admin', '7 days', 'Nothing ships until reviewed']].map(function (r, i) { return { id: 'w' + i, n: r[0], what: r[1], who: r[2], due: r[3], after: r[4], lock: !!r[5] }; });

  /* Backtest set: closed-won, closed-lost and random accounts, each with its own fields; scored with the rubric */
  var PRE = ['Amberley', 'Bayfront', 'Coralis', 'Dunmore', 'Eastwater', 'Fairhaven', 'Glenrock', 'Highgate', 'Ironbark', 'Juniper', 'Kestrel', 'Larkfield', 'Merrow', 'Northcape', 'Oakridge', 'Pinecrest', 'Quayside', 'Redcliff', 'Silverton', 'Tamarind', 'Upland', 'Valemont', 'Westmere', 'Yarrow', 'Zephyr'];
  function mk(i, set, ind, ctry, staff, tm, date, val) { var nm = PRE[(i * 7 + (set === 'won' ? 0 : set === 'lost' ? 3 : 11)) % PRE.length] + ' ' + (/Gas/.test(ind) ? 'Gas Processing' : /Petro/.test(ind) ? 'Petrochem' : /Refin/.test(ind) ? 'Refining' : /LNG/.test(ind) ? 'LNG' : /Food/.test(ind) ? 'Foods' : /Power/.test(ind) ? 'Power' : 'Industries'); return { id: set + i, name: nm, dom: nm.toLowerCase().replace(/[^a-z]+/g, '') + '.example', ind: ind, ctry: ctry, staff: staff, tm: tm, date: date, val: val, src: set === 'random' ? 'Random draw' : 'CRM', set: set }; }
  function seedBt() {
    var W = [['Refining', 'Singapore', 2400, 92], ['Petrochemicals', 'Malaysia', 1800, 88], ['Gas processing', 'Thailand', 1200, 84], ['Refining', 'Thailand', 3100, 80], ['Petrochemicals', 'Indonesia', 4200, 78], ['Gas processing', 'Malaysia', 900, 75], ['Refining', 'Vietnam', 1600, 72], ['Petrochemicals', 'Singapore', 2900, 70], ['Gas processing', 'Indonesia', 750, 66], ['Refining', 'Philippines', 1300, 64], ['Petrochemicals', 'Thailand', 2200, 62], ['Gas processing', 'Vietnam', 1100, 60], ['Refining', 'Malaysia', 650, 44], ['Petrochemicals', 'Philippines', 420, 40], ['LNG', 'Australia', 1500, 70]];
    var L = [['Refining', 'Singapore', 2000, 81], ['Gas processing', 'Malaysia', 1400, 74], ['Petrochemicals', 'Thailand', 1700, 50], ['Refining', 'Indonesia', 380, 52], ['Gas processing', 'Vietnam', 900, 41], ['Petrochemicals', 'Malaysia', 260, 58], ['Refining', 'Philippines', 1200, 38], ['LNG', 'Japan', 3000, 66], ['Power', 'Singapore', 2500, 60], ['Gas processing', 'Thailand', 1100, 34], ['Petrochemicals', 'Indonesia', 600, 30], ['Food and beverage', 'Malaysia', 1800, 70], ['Refining', 'Vietnam', 340, 47], ['Gas processing', 'Indonesia', 480, 36], ['Petrochemicals', 'Philippines', 700, 28]];
    var R = [['Refining', 'Thailand', 2600, 82], ['Food and beverage', 'Australia', 900, 40], ['Petrochemicals', 'Malaysia', 1200, 45], ['Power', 'Vietnam', 3000, 55], ['Gas processing', 'Indonesia', 700, 30], ['Mining', 'Australia', 5200, 60], ['Refining', 'Singapore', 1900, 74], ['Logistics', 'Singapore', 800, 50], ['Petrochemicals', 'Thailand', 350, 35], ['Food and beverage', 'Philippines', 1500, 20], ['Gas processing', 'Malaysia', 1000, 26], ['Power', 'Indonesia', 2200, 44], ['Retail', 'Malaysia', 4000, 70], ['Refining', 'Philippines', 280, 40], ['Mining', 'Indonesia', 1300, 30]];
    var mon = ['Mar 2026', 'Jan 2026', 'Nov 2025', 'Aug 2025', 'Jun 2025'];
    A.bt = W.map(function (x, i) { return mk(i, 'won', x[0], x[1], x[2], x[3], 'Closed won ' + mon[i % 5], 'USD ' + (120 + (i * 37) % 300) + 'k'); })
      .concat(L.map(function (x, i) { return mk(i, 'lost', x[0], x[1], x[2], x[3], 'Closed lost ' + mon[(i + 2) % 5], 'USD ' + (90 + (i * 53) % 260) + 'k'); }))
      .concat(R.map(function (x, i) { return mk(i, 'random', x[0], x[1], x[2], x[3], 'Drawn from the market', ''); }));
    return A.bt;
  }
  if (!A.bt) seedBt();
  A.btTab = A.btTab || 'won';
  /* Niche taxonomy (SEG-01): the client's ontology; each niche says which words in a company place it there */
  A.niches = A.niches || [
    { id: 'n1', name: 'Refining', parent: '', kw: 'refining, refinery' }, { id: 'n2', name: 'Complex refineries', parent: 'n1', kw: 'refining' , note: 'Fit 80 or more' },
    { id: 'n3', name: 'Petrochemicals', parent: '', kw: 'petrochem, petrochemicals' }, { id: 'n4', name: 'Olefins and crackers', parent: 'n3', kw: 'olefins' }, { id: 'n5', name: 'Aromatics', parent: 'n3', kw: 'aromatics' },
    { id: 'n6', name: 'Gas processing', parent: '', kw: 'gas processing, gas' }, { id: 'n7', name: 'LNG terminals', parent: 'n6', kw: 'lng' }];
  /* ICP tag library (SEG-09): the tags micro-segments are built from */
  A.tags = A.tags || [['Industry', 'Refining', 'refin'], ['Industry', 'Petrochemicals', 'petro|olefin|aromatic'], ['Industry', 'Gas processing', 'gas'], ['Industry', 'LNG', 'lng'],
    ['Region', 'Singapore', 'singapore'], ['Region', 'Malaysia', 'malaysia'], ['Region', 'Thailand', 'thailand'], ['Region', 'Indonesia', 'indonesia'], ['Region', 'Vietnam', 'vietnam'], ['Region', 'Philippines', 'philippines'],
    ['Size', '500 to 1,000 staff', '500-1000'], ['Size', '1,000 to 5,000 staff', '1000-5000'], ['Size', '5,000+ staff', '5000-1000000'],
    ['Role', 'Reliability leader', 'reliab'], ['Role', 'Operations leader', 'operat'], ['Role', 'Plant head', 'plant'], ['Role', 'Technical lead (I&C)', 'technical|i&c|instrument'], ['Role', 'Maintenance leader', 'mainten'],
    ['Trigger', 'New exec hire', 'new exec|hire'], ['Trigger', 'Turnaround announced', 'turnaround'], ['Trigger', 'Rival contract ending', 'rival'], ['Trigger', 'Expansion approved', 'expansion|capex'], ['Trigger', 'Hiring surge', 'hiring'],
    ['Motive', 'Cost: lower lifecycle cost', 'cost'], ['Motive', 'Growth: add capacity', 'growth'], ['Motive', 'Risk: protect a planned shutdown', 'turnaround|shutdown'], ['Motive', 'Capacity: staff the build-out', 'hiring']].map(function (x, i) { return { id: 'g' + i, type: x[0], name: x[1], m: x[2] }; });

  /* ─── Scoring a backtest account with the current rubric ─── */
  function fitOf(a) {
    var tot = 0, wsum = 0;
    A.rubric.forEach(function (v) {
      var w = +v.w || 0, m = 0.5, vals = String(v.vals || '').toLowerCase(); wsum += w;
      if (/industr|sector/i.test(v.name)) m = vals.indexOf(String(a.ind).toLowerCase().split(' ')[0].slice(0, 6)) >= 0 ? 1 : /lng|chemical/i.test(a.ind) && /half/i.test(v.rule || '') ? 0.5 : 0;
      else if (/region|country|territor|geograph/i.test(v.name)) m = vals.indexOf(String(a.ctry).toLowerCase()) >= 0 ? 1 : 0;
      else if (/size|staff|employee|headcount/i.test(v.name)) { var n = String(v.vals).replace(/,/g, '').match(/\d+/g) || [], lo = +(n[0] || 0), hi = +(n[1] || 1e9); m = a.staff >= lo && a.staff <= hi ? 1 : a.staff >= lo * 0.6 && a.staff < lo ? 0.5 : 0; }
      if (v.req && m === 0) tot = -1e9;
      tot += w * m;
    });
    return Math.max(0, Math.round(wsum ? tot / wsum * 100 : 0));
  }
  function tierOf(a) { var s = fitOf(a) * (+a.tm || 0) / 100; return s >= 60 ? 'A' : s >= 45 ? 'B' : s >= 30 ? 'C' : 'D'; }
  function btBars() {
    var won = A.bt.filter(function (x) { return x.set === 'won'; }), lost = A.bt.filter(function (x) { return x.set === 'lost'; }), rnd = A.bt.filter(function (x) { return x.set === 'random'; });
    var ab = function (L) { return L.filter(function (x) { return /[AB]/.test(tierOf(x)); }).length; }, wA = ab(won), lA = ab(lost), rA = rnd.filter(function (x) { return tierOf(x) === 'A'; }).length;
    var wNeed = Math.ceil(won.length * 2 / 3), lMax = Math.floor(lost.length * 4 / 15), rPct = rnd.length ? Math.round(rA / rnd.length * 100) : 0;
    return [['Won accounts in Tier A or B (at least ' + wNeed + ' of ' + won.length + ')', wA + ' of ' + won.length, won.length ? wA / won.length : 0, wA >= wNeed && won.length > 0],
      ['Lost accounts in Tier A or B (at most ' + lMax + ' of ' + lost.length + ')', lA + ' of ' + lost.length, lost.length ? lA / lost.length : 0, lA <= lMax],
      ['Random accounts in Tier A (no more than 40%)', rPct + '%', rPct / 100, rPct <= 40]];
  }

  /* ─── Drawer form ─── */
  var CUR = null;
  function fieldHtml(f) {
    var id = 'acf-' + f.k, v = f.val == null ? '' : f.val, inp;
    if (f.type === 'select') inp = '<select class="sel" id="' + id + '">' + f.opts.map(function (o) { var ov = Array.isArray(o) ? o[0] : o, ol = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(ov) + '"' + (String(ov) === String(v) ? ' selected' : '') + '>' + esc(ol) + '</option>'; }).join('') + '</select>';
    else if (f.type === 'textarea') inp = '<textarea id="' + id + '" rows="' + (f.rows || 3) + '" placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea>';
    else if (f.type === 'checks') inp = '<div class="ac-checks" id="' + id + '">' + f.opts.map(function (o) { return '<label><input type="checkbox" value="' + esc(o[0]) + '"' + ((v || []).indexOf(o[0]) >= 0 ? ' checked' : '') + '> ' + esc(o[1]) + '</label>'; }).join('') + '</div>';
    else if (f.type === 'toggle') inp = '<label class="ac-tg"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> ' + esc(f.text || '') + '</label>';
    else inp = '<input id="' + id + '" type="' + (f.type || 'text') + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || '') + '">';
    return '<div class="field ac-f"><label for="' + id + '">' + esc(f.label) + (f.req ? ' <i>required</i>' : '') + '</label>' + inp + (f.hint ? '<div class="sm muted">' + f.hint + '</div>' : '') + '</div>';
  }
  function form(title, sub, fields, onSave, label) {
    CUR = { fields: fields, onSave: onSave };
    var el = document.getElementById('acDrawer'); if (!el) { el = document.createElement('div'); el.id = 'acDrawer'; document.body.appendChild(el); }
    el.className = 'wz-on';
    el.innerHTML = '<div class="wz-bg" onclick="AC.close()"></div><aside class="wz ac-wz" role="dialog" aria-label="' + esc(title) + '"><div class="wz-h"><div class="grow"><b>' + esc(title) + '</b><div class="sm muted">' + esc(sub || '') + '</div></div><button class="btn sm ghost" onclick="AC.close()" aria-label="Close">✕</button></div><div class="wz-b ac-form">' + fields.map(fieldHtml).join('') + '</div><div class="wz-f"><button class="btn" onclick="AC.close()">Cancel</button><span style="flex:1"></span><button class="btn pri" onclick="AC.submit()">' + esc(label || 'Save') + '</button></div></aside>';
    var f0 = el.querySelector('input,select,textarea'); if (f0) f0.focus();
  }
  function vals() { var o = {}; CUR.fields.forEach(function (f) { var el = document.getElementById('acf-' + f.k); if (!el) return; o[f.k] = f.type === 'checks' ? [].slice.call(el.querySelectorAll('input:checked')).map(function (x) { return x.value; }) : f.type === 'toggle' ? el.checked : el.value.trim(); }); return o; }

  /* ─── Renderers ─── */
  var badge = function (t, cls) { return '<span class="badge ' + (cls || 'b-grey') + ' nodot">' + esc(t) + '</span>'; };
  var ibtn = function (fn, label, cls) { return '<button class="btn sm ' + (cls || 'ghost') + '" onclick="' + fn + '">' + label + '</button>'; };
  function rubricCard() {
    var tot = A.rubric.reduce(function (n, v) { return n + (+v.w || 0); }, 0);
    return '<div class="card-h"><span class="lbl">ICP rubric</span><span class="muted sm">the variables that make up the fit score · admin only · backtested before reps see a change</span></div><div class="card-b" style="padding:0"><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th>Variable</th><th>What counts</th><th>How it scores</th><th>Data from</th><th style="width:96px">Weight</th><th></th></tr></thead><tbody>'
      + A.rubric.map(function (v) { return '<tr><td><div class="nm">' + esc(v.name) + '</div><div class="ac-tags">' + badge(v.kind) + (v.req ? badge('Must have', 'b-ter') : '') + '</div></td><td class="sm">' + esc(v.vals) + '</td><td class="sm">' + esc(v.rule) + '</td><td class="sm">' + esc(v.src) + '</td><td><input class="ac-w" type="number" min="0" max="100" value="' + v.w + '" aria-label="Weight for ' + esc(v.name) + '" onchange="AC.rubW(\'' + v.id + '\',this.value)"></td><td class="ac-act">' + ibtn("AC.rubEdit('" + v.id + "')", 'Edit') + ibtn("AC.rubDel('" + v.id + "')", 'Remove') + '</td></tr>'; }).join('')
      + '</tbody></table></div><div class="ac-foot"><span class="ac-tot ' + (tot === 100 ? 'ok' : 'bad') + '">Weights add up to <b>' + tot + '</b> of 100</span><span class="sm muted">Fit = each weight × its match (none, half or full). A must-have that misses keeps the account out. Score = Fit × Timing ÷ 100.</span><span class="sp"></span>' + ibtn('AC.rubEdit()', '+ Add a variable', '') + ibtn('AC.rubSave()', 'Save as a rules version', 'pri') + '</div><div class="ac-last">' + lastChange('rubric') + '</div></div>';
  }
  function signalsPane() {
    return '<div class="card c12"><div class="card-h"><span class="lbl">Signal tiers</span><span class="muted sm">points, how long a signal keeps full weight, and when it reaches zero</span></div><div class="card-b" style="padding:0"><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th>Tier</th><th style="width:110px">Points</th><th style="width:130px">Full weight (days)</th><th style="width:130px">Zero by (day)</th><th>Examples</th><th></th></tr></thead><tbody>'
      + A.tiers.map(function (x, i) { return '<tr><td class="nm">' + x.t + '</td><td><input class="ac-w" type="number" min="0" max="200" value="' + x.pts + '" onchange="AC.tierSet(' + i + ',\'pts\',this.value)" aria-label="Points for tier ' + x.t + '"></td><td><input class="ac-w" type="number" min="0" max="365" value="' + x.full + '" onchange="AC.tierSet(' + i + ',\'full\',this.value)" aria-label="Full weight days for tier ' + x.t + '"></td><td><input class="ac-w" type="number" min="1" max="730" value="' + x.zero + '" onchange="AC.tierSet(' + i + ',\'zero\',this.value)" aria-label="Zero by day for tier ' + x.t + '"></td><td><input class="ac-in" value="' + esc(x.ex) + '" onchange="AC.tierSet(' + i + ',\'ex\',this.value)" aria-label="Examples for tier ' + x.t + '"></td><td class="ac-act">' + (A.tiers.length > 1 && i === A.tiers.length - 1 ? ibtn('AC.tierDel()', 'Remove') : '') + '</td></tr>'; }).join('')
      + '</tbody></table></div><div class="ac-foot"><span class="sm muted">Strength 1 to 5 scales a signal from × 0.6 to × 1.0. A date in the source overrides the window. Timing = strongest + ½ second + ¼ third …, capped at 100.</span><span class="sp"></span>' + ibtn('AC.tierAdd()', '+ Add a tier', '') + ibtn('AC.tierSave()', 'Save as a rules version', 'pri') + '</div><div class="ac-last">' + lastChange('tiers') + '</div></div></div>'
      + '<div class="card c6"><div class="card-h"><span class="lbl">Every signal must pass</span></div><div class="card-b"><div class="chk"><span class="dot ok">1</span><div class="grow"><b>Observable</b><div class="sm">Verifiable from a public source</div></div></div><div class="chk"><span class="dot ok">2</span><div class="grow"><b>Predictive</b><div class="sm">A documented link to buying in this category</div></div></div><div class="chk"><span class="dot ok">3</span><div class="grow"><b>Time-bound</b><div class="sm">A finite relevance window</div></div></div><div class="sm muted" style="margin-top:8px">Before the tests, the entry gate checks recency and repeats and merges the same event from several sources. A failed test discards the signal and keeps the reason.</div></div></div>'
      + '<div class="card c6"><div class="card-h"><span class="lbl">Category research</span><span class="muted sm">refreshed monthly</span></div><div class="card-b"><div class="sm"><b>Who buys:</b> reliability, maintenance and operations leaders at refineries, petrochemical and gas-processing plants. <b>Why:</b> unplanned downtime, an ageing control system, a support contract ending. <b>Problems they cite:</b> outage windows, migration risk, slow vendor support. These feed the fit match, the signal tests and the message angles.</div><div style="margin-top:10px">' + ibtn("location.hash='#registry'", 'Edit the signals in the registry', '') + '</div></div></div>';
  }
  function winOf(s) { var t = A.tiers.find(function (x) { return +x.t === +s.tier; }) || A.tiers[0]; return (s.full !== '' && s.full != null ? s.full : t.full) + ' days full, zero by ' + (s.zero !== '' && s.zero != null ? s.zero : t.zero) + (s.full !== '' && s.full != null ? ' <i class="muted">(own window)</i>' : ''); }
  function registryPane() {
    var q = (A.sigQ || '').toLowerCase(), L = A.sigs.filter(function (s) { return !q || (s.name + s.level + s.src).toLowerCase().indexOf(q) >= 0; });
    return '<div class="card c12"><div class="card-h"><span class="lbl">Signal registry</span><span class="muted sm">every signal: its level, source, tier and window · ' + A.sigs.filter(function (s) { return s.on; }).length + ' on, ' + A.sigs.filter(function (s) { return !s.on; }).length + ' off</span></div><div class="card-b" style="padding:0"><div class="ac-bar"><input class="ac-in" style="max-width:280px" placeholder="Search signals" value="' + esc(A.sigQ || '') + '" oninput="AC.sigQ(this.value)" aria-label="Search signals"><span class="sp"></span>' + ibtn('AC.sigEdit()', '+ Add a signal', 'pri') + '</div><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th>Signal</th><th>Level</th><th>Source</th><th style="width:90px">Tier</th><th>Window</th><th>On</th><th></th></tr></thead><tbody>'
      + L.map(function (s) { return '<tr class="' + (s.on ? '' : 'ac-off') + '"><td><div class="nm">' + esc(s.name) + '</div>' + (s.persona ? '<div class="sm muted">Concerns: ' + esc(s.persona) + '</div>' : '') + '</td><td class="sm">' + esc(s.level) + '</td><td class="sm">' + esc(s.src) + '</td><td><select class="sel ac-sel" onchange="AC.sigTier(\'' + s.id + '\',this.value)" aria-label="Tier for ' + esc(s.name) + '">' + A.tiers.map(function (t) { return '<option value="' + t.t + '"' + (+t.t === +s.tier ? ' selected' : '') + '>' + t.t + '</option>'; }).join('') + '</select></td><td class="sm">' + winOf(s) + '</td><td><span class="switch' + (s.on ? ' on' : '') + '" role="switch" tabindex="0" aria-checked="' + !!s.on + '" aria-label="' + esc(s.name) + ' on" onclick="AC.sigOn(\'' + s.id + '\')"></span></td><td class="ac-act">' + ibtn("AC.sigEdit('" + s.id + "')", 'Edit') + ibtn("AC.sigDel('" + s.id + "')", 'Remove') + '</td></tr>'; }).join('') + (L.length ? '' : '<tr><td colspan="7" class="sm muted">No signal matches.</td></tr>')
      + '</tbody></table></div><div class="ac-foot"><span class="sm muted">A signal uses its tier\'s window unless you give it its own. A champion\'s move removes the signal tied to the old role and creates a new one at the new company.</span></div><div class="ac-last">' + lastChange('signals') + '</div></div></div>';
  }
  function exclPane() {
    var sh = {}; try { sh = JSON.parse(sessionStorage.getItem('dmock_shared') || '{}') || {}; } catch (e) {}
    var fromApp = Object.keys(sh.optouts || {}).map(function (id) { var a = (M.ACCOUNTS || []).find(function (x) { return x.id === id; }); return a ? { id: 'app-' + id, who: a.contact.name, email: (a.contact.email || first(a.contact.name).toLowerCase() + '@' + a.name.toLowerCase().replace(/[^a-z]+/g, '') + '.example'), co: a.name, ch: 'All channels', src: 'Added by ' + sh.optouts[id].by + ' on the account page', at: sh.optouts[id].at, auto: true } : null; }).filter(Boolean);
    var custN = (M.ACCOUNTS || []).filter(function (a) { return a.crm && a.crm.customer; }).length;
    var OPT = fromApp.concat(A.opt);
    var tcls = { Competitor: 'b-neg', Partner: 'b-sec', Industry: 'b-ter', 'Country or region': 'b-ter', 'Company size': 'b-grey' };
    return '<div class="card c12"><div class="card-h"><span class="lbl">Exclusions</span><span class="muted sm">who we never target · checked before anything is scored or routed</span></div><div class="card-b" style="padding:0"><div class="ac-bar"><span class="sm muted">Anything can be an exclusion: a company, a domain, an industry you don\'t sell into, a country, a size band, a job title, a competitor, a partner, a technology, or a rule in your own words.</span><span class="sp"></span>' + ibtn('AC.exEdit()', '+ Add an exclusion', 'pri') + '</div><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th>Type</th><th>What</th><th>Why</th><th>Applies to</th><th>Until</th><th>Added</th><th></th></tr></thead><tbody>'
      + '<tr class="ac-lock"><td>' + badge('Customers', 'b-sec') + '</td><td class="nm">Every account marked closed-won in the CRM</td><td class="sm">Already a customer (' + custN + ' today)</td><td class="sm">Everywhere</td><td class="sm">While a customer</td><td class="sm">CRM field Opportunity.Stage</td><td class="ac-act"><span class="sm muted">From the CRM</span></td></tr>'
      + A.excl.map(function (x) { return '<tr><td>' + badge(x.type, tcls[x.type] || 'b-grey') + '</td><td class="nm">' + esc(x.val) + '</td><td class="sm">' + esc(x.why) + '</td><td class="sm">' + esc(x.scope) + '</td><td class="sm">' + esc(x.until || 'Until removed') + '</td><td class="sm">' + esc(x.by) + '<div class="muted">' + esc(x.at) + '</div></td><td class="ac-act">' + ibtn("AC.exEdit('" + x.id + "')", 'Edit') + ibtn("AC.exDel('" + x.id + "')", 'Remove') + '</td></tr>'; }).join('')
      + '</tbody></table></div><div class="ac-last">' + lastChange('excl') + '</div></div></div>'
      + '<div class="card c12"><div class="card-h"><span class="lbl">Opt-out list</span><span class="muted sm">people who asked not to be contacted · permanent, for every rep and campaign</span></div><div class="card-b" style="padding:0"><div class="ac-bar"><span class="sm muted">Replies classified as opted out and unsubscribe clicks are added automatically within minutes; reps add one from the account page. Add one here, or import a list.</span><span class="sp"></span>' + ibtn('AC.optImport()', 'Import a list', '') + ibtn('AC.optEdit()', '+ Add an opt-out', 'pri') + '</div><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th>Person</th><th>Email</th><th>Company</th><th>Channels</th><th>How we heard</th><th>Added</th><th></th></tr></thead><tbody>'
      + OPT.map(function (o) { return '<tr><td class="nm">' + esc(o.who) + '</td><td class="sm mono">' + esc(o.email) + '</td><td class="sm">' + esc(o.co) + '</td><td>' + badge(o.ch, o.ch === 'All channels' ? 'b-neg' : 'b-warn') + '</td><td class="sm">' + esc(o.src) + '</td><td class="sm">' + esc(o.at) + '</td><td class="ac-act">' + (/^app-/.test(o.id) ? '<span class="sm muted">From the workspace</span>' : ibtn("AC.optDel('" + o.id + "')", 'Remove')) + '</td></tr>'; }).join('')
      + '</tbody></table></div><div class="ac-last">' + lastChange('opt') + '</div></div></div>'
      + '<div class="card c12"><div class="card-h"><span class="lbl">Suppression list</span><span class="muted sm">temporary or conditional holds · ends on its date or when the condition clears</span></div><div class="card-b" style="padding:0"><div class="ac-bar"><span class="sm muted">Use suppression when someone shouldn\'t be contacted for now: an open deal, a legal hold, a budget freeze, a recent touch, a bounce. Unlike an opt-out, it ends.</span><span class="sp"></span>' + ibtn('AC.supEdit()', '+ Add a suppression', 'pri') + '</div><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th>Kind</th><th>What</th><th>Why</th><th>Until</th><th>Set by</th><th></th></tr></thead><tbody>'
      + A.sup.map(function (x) { return '<tr><td>' + badge(x.kind, x.kind === 'Rule' ? 'b-sec' : 'b-warn') + '</td><td class="nm">' + esc(x.val) + '</td><td class="sm">' + esc(x.why) + '</td><td class="sm">' + esc(x.until) + '</td><td class="sm">' + esc(x.src) + '</td><td class="ac-act">' + ibtn("AC.supEdit('" + x.id + "')", 'Edit') + ibtn("AC.supDel('" + x.id + "')", 'Remove') + '</td></tr>'; }).join('')
      + '</tbody></table></div><div class="ac-last">' + lastChange('sup') + '</div></div></div>';
  }
  function first(n) { return String(n || '').split(' ')[0]; }
  function toLabel(to) { if (!to) return '–'; var p = to.split(':'); if (p[0] === 'team') { var t = A.teams.find(function (x) { return x.id === p[1]; }); return t ? 'Team · ' + t.name : 'A removed team'; } return uname(p[1]); }
  function toOpts() { return A.teams.map(function (t) { return ['team:' + t.id, 'Team · ' + t.name]; }).concat(Object.keys(USERS).map(function (id) { return ['person:' + id, uname(id) + ((USERS[id] || {}).role === 'rep' ? ' · rep' : (USERS[id] || {}).role ? ' · ' + USERS[id].role : '')]; })); }
  function escalPane() {
    var WHO = ['Owning rep', "The owning rep's team", 'Sales manager', 'Admin', 'Admin with the sales manager', 'Owning rep sees why; admin alerted', 'Owning rep; admin for configuration', 'The rep or manager, in chat'], DUE = ['1 day', '2 days', '3 days', '5 days', '5 working days', '7 days', 'No due time'];
    var sel = function (id, f, cur, L, dis) { var o = L.indexOf(cur) >= 0 ? L : [cur].concat(L); return '<select class="sel ac-sel" ' + (dis ? 'disabled ' : '') + 'onchange="AC.escSet(\'' + id + '\',\'' + f + '\',this.value)">' + o.map(function (x) { return '<option' + (x === cur ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>'; };
    return '<div class="card c12"><div class="card-h"><span class="lbl">Teams</span><span class="muted sm">groups that routing can send work to · work is shared out inside the team</span></div><div class="card-b" style="padding:0"><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th>Team</th><th>Members</th><th>Shared out by</th><th></th></tr></thead><tbody>'
      + A.teams.map(function (t) { return '<tr><td class="nm">' + esc(t.name) + '</td><td><div class="ac-tags">' + t.members.map(function (m) { return badge(uname(m), 'b-sec'); }).join('') + '</div></td><td class="sm">' + esc(t.how) + '</td><td class="ac-act">' + ibtn("AC.teamEdit('" + t.id + "')", 'Edit') + ibtn("AC.teamDel('" + t.id + "')", 'Remove') + '</td></tr>'; }).join('')
      + '</tbody></table></div><div class="ac-foot"><span class="sp"></span>' + ibtn('AC.teamEdit()', '+ Add a team', '') + '</div><div class="ac-last">' + lastChange('teams') + '</div></div></div>'
      + '<div class="card c12"><div class="card-h"><span class="lbl">Team routing</span><span class="muted sm">route to a team, not only a person · rules run top to bottom; the first match wins</span></div><div class="card-b" style="padding:0"><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th style="width:40px">#</th><th>Rule</th><th>Goes to</th><th></th></tr></thead><tbody>'
      + A.routes.map(function (r, i) { return '<tr><td class="sm">' + (i + 1) + '</td><td class="nm">' + esc(r.field) + ' <span class="muted" style="font-weight:400">' + esc(r.op) + '</span> ' + esc(r.val) + '</td><td class="sm">' + esc(toLabel(r.to)) + '</td><td class="ac-act"><button class="ic-btn" title="Move up" ' + (i === 0 ? 'disabled' : '') + ' onclick="AC.routeMove(' + i + ',-1)">↑</button><button class="ic-btn" title="Move down" ' + (i === A.routes.length - 1 ? 'disabled' : '') + ' onclick="AC.routeMove(' + i + ',1)">↓</button>' + ibtn("AC.routeEdit('" + r.id + "')", 'Edit') + ibtn("AC.routeDel('" + r.id + "')", 'Remove') + '</td></tr>'; }).join('')
      + '<tr class="ac-lock"><td class="sm">–</td><td class="nm">Anything no rule matches</td><td><select class="sel ac-sel" onchange="AC.fallback(this.value)" aria-label="Fallback">' + toOpts().map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === A.fallback ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></td><td class="ac-act"><span class="sm muted">Fallback</span></td></tr>'
      + '</tbody></table></div><div class="ac-foot"><span class="sm muted">An account that already has an owner in the CRM keeps that owner.</span><span class="sp"></span>' + ibtn('AC.routeEdit()', '+ Add a rule', 'pri') + '</div><div class="ac-last">' + lastChange('routes') + '</div></div></div>'
      + '<div class="card c12"><div class="card-h"><span class="lbl">Who decides what</span><span class="muted sm">the AI decides what it can; everything else goes to a named person · ' + A.esc.filter(function (x) { return x.lock; }).length + ' safety rows can\'t be loosened</span></div><div class="card-b" style="padding:0"><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th style="width:40px">#</th><th>What reaches a person</th><th>Who</th><th>Due in</th><th>If nobody acts</th></tr></thead><tbody>'
      + A.esc.map(function (x) { return '<tr class="' + (x.lock ? 'ac-lock' : '') + '"><td class="sm">' + esc(x.n) + '</td><td class="nm">' + esc(x.what) + (x.lock ? ' <span class="ac-lk" title="A safety rule: the default can\'t be loosened">🔒</span>' : '') + '</td><td>' + sel(x.id, 'who', x.who, WHO) + '</td><td>' + sel(x.id, 'due', x.due, DUE, x.lock) + '</td><td>' + sel(x.id, 'after', x.after, AFTER, x.lock) + '</td></tr>'; }).join('')
      + '</tbody></table></div><div class="ac-foot"><span class="sm muted">Locked rows fail closed: when a check can\'t run, or setup or the backtest isn\'t done, nothing goes out. You can still choose who is told.</span><span class="sp"></span>' + ibtn('AC.escSave()', 'Save as a rules version', 'pri') + '</div><div class="ac-last">' + lastChange('esc') + '</div></div></div>';
  }
  function backtestPane() {
    var B = btBars(), ok = B.every(function (b) { return b[3]; }), tab = A.btTab, L = A.bt.filter(function (x) { return x.set === tab; }), cnt = function (s) { return A.bt.filter(function (x) { return x.set === s; }).length; };
    var exp = { won: /[AB]/, lost: /[CD]/, random: /./ }[tab];
    return '<div class="card c12"><div class="card-h"><span class="lbl">Scoring backtest · ' + cnt('won') + ' won, ' + cnt('lost') + ' lost, ' + cnt('random') + ' random</span>' + badge(ok ? 'Passed' : 'Failed: go-live blocked', ok ? 'b-pos' : 'b-neg') + '</div><div class="card-b"><div class="ctl-bars">'
      + B.map(function (b) { return '<div class="ctl-bar"><span>' + b[0] + '</span><div class="ctl-track"><i style="width:' + Math.round(b[2] * 100) + '%;background:' + (b[3] ? 'var(--pos)' : 'var(--neg)') + '"></i></div><span class="mono">' + b[1] + '</span></div>'; }).join('')
      + '</div><div class="ac-foot" style="padding:12px 0 0;border:0"><span class="sm muted">' + (A.btRun ? 'Last run ' + esc(A.btRun.at) + ' by ' + esc(A.btRun.by) + ' with the current rubric and tiers.' : 'Runs with the current rubric and tiers.') + ' The sales leader approves go-live in Approvals once all three bars pass.</span><span class="sp"></span>' + ibtn('AC.btRun()', 'Run the backtest', 'pri') + '</div></div></div>'
      + '<div class="card c12"><div class="card-h"><span class="lbl">Backtest accounts</span><span class="muted sm">the accounts the rules are tested on · pulled from the CRM, corrected or added here</span></div><div class="card-b" style="padding:0"><div class="ac-bar"><div class="seg ac-seg">' + [['won', 'Closed won'], ['lost', 'Closed lost'], ['random', 'Random']].map(function (t) { return '<button class="' + (tab === t[0] ? 'on' : '') + '" onclick="AC.btTab(\'' + t[0] + '\')">' + t[1] + ' · ' + cnt(t[0]) + '</button>'; }).join('') + '</div><span class="sp"></span>' + (tab === 'random' ? ibtn('AC.btDraw()', 'Draw a new random set', '') : ibtn('AC.btPull()', 'Pull again from the CRM', '')) + ibtn('AC.btImport()', 'Import a list', '') + ibtn('AC.btEdit()', '+ Add an account', 'pri') + '</div><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th>Account</th><th>Industry</th><th>Country</th><th>Staff</th><th>' + (tab === 'random' ? 'Drawn from' : 'Outcome') + '</th><th>Source</th><th>Fit</th><th>Tier now</th><th></th></tr></thead><tbody>'
      + L.map(function (x) { var t = tierOf(x), good = tab === 'random' || exp.test(t); return '<tr><td><div class="nm">' + esc(x.name) + '</div><div class="sm muted mono">' + esc(x.dom) + '</div></td><td class="sm">' + esc(x.ind) + '</td><td class="sm">' + esc(x.ctry) + '</td><td class="sm">' + Number(x.staff).toLocaleString('en-US') + '</td><td class="sm">' + esc(x.date) + (x.val ? '<div class="muted">' + esc(x.val) + '</div>' : '') + (x.note ? '<div class="muted">' + esc(x.note) + '</div>' : '') + '</td><td class="sm">' + esc(x.src) + '</td><td class="mono">' + fitOf(x) + '</td><td>' + badge('Tier ' + t, t === 'A' ? 'b-pos' : t === 'B' ? 'b-sec' : t === 'C' ? 'b-warn' : 'b-grey') + (tab !== 'random' ? ' <span class="ac-ok ' + (good ? 'y' : 'n') + '" title="' + (good ? 'As expected' : 'Not what we expect for this outcome') + '">' + (good ? '✓' : '✗') + '</span>' : '') + '</td><td class="ac-act">' + ibtn("AC.btEdit('" + x.id + "')", 'Edit') + ibtn("AC.btDel('" + x.id + "')", 'Remove') + '</td></tr>'; }).join('') + (L.length ? '' : '<tr><td colspan="9" class="sm muted">No accounts in this set yet.</td></tr>')
      + '</tbody></table></div><div class="ac-foot"><span class="sm muted">What the backtest needs: 15 closed-won, 15 closed-lost and 15 random accounts from the last 18 months, with industry, country and staff (the rubric\'s variables), the outcome date and the deal value. ✓ means the rules tier the account the way its outcome says they should.</span></div><div class="ac-last">' + lastChange('bt') + '</div></div></div>';
  }

  /* ─── Niches and tags ─── */
  var ACC = (M.ACCOUNTS || []).filter(function (a) { return !a.fromList; });
  function nicheAccts(n) { var kws = String(n.kw || '').toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(Boolean); return ACC.filter(function (a) { var s = (a.name + ' ' + a.industry).toLowerCase(); return kws.some(function (k) { return s.indexOf(k) >= 0; }) && (!/Fit 80/.test(n.note || '') || a.fit >= 80); }); }
  function nichesPane() {
    var tops = A.niches.filter(function (n) { return !n.parent; }), kids = function (id) { return A.niches.filter(function (n) { return n.parent === id; }); };
    var row = function (n, lvl) { var c = nicheAccts(n).length; return '<tr><td class="nm" style="padding-left:' + (14 + lvl * 22) + 'px">' + (lvl ? '└ ' : '') + esc(n.name) + (n.note ? ' <span class="muted sm">· ' + esc(n.note) + '</span>' : '') + '</td><td class="sm mono">' + esc(n.kw) + '</td><td>' + c + '</td><td class="ac-act">' + ibtn("AC.nicheEdit('" + n.id + "')", 'Edit') + (lvl ? '' : ibtn("AC.nicheEdit(null,'" + n.id + "')", '+ Sub-niche')) + ibtn("AC.nicheDel('" + n.id + "')", 'Remove') + '</td></tr>'; };
    return '<div class="card c12"><div class="card-h"><span class="lbl">Niche taxonomy</span><span class="muted sm">the client\'s ontology as niches · leads, micro-segments and message angles are grouped by it</span></div><div class="card-b" style="padding:0"><div class="ac-bar"><span class="sm muted">Each niche says which words in a company\'s name or industry place it there. A company matches the most specific niche it fits. ' + ACC.length + ' accounts, ' + ACC.filter(function (a) { return !A.niches.some(function (n) { return nicheAccts(n).indexOf(a) >= 0; }); }).length + ' in no niche.</span><span class="sp"></span>' + ibtn('AC.nicheEdit()', '+ Add a niche', 'pri') + '</div><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th>Niche</th><th>Matches on</th><th>Accounts</th><th></th></tr></thead><tbody>'
      + tops.map(function (n) { return row(n, 0) + kids(n.id).map(function (k) { return row(k, 1); }).join(''); }).join('') + '</tbody></table></div><div class="ac-last">' + lastChange('niches') + '</div></div></div>';
  }
  function tagAccts(g) { var re; try { re = new RegExp(g.m, 'i'); } catch (e) { return []; } return ACC.filter(function (a) {
    if (g.type === 'Size') { var r = String(g.m).split('-'), n = +String(a.size).replace(/[^\d]/g, ''); return n >= +r[0] && n < +(r[1] || 1e9); }
    var s = g.type === 'Industry' ? a.industry + ' ' + a.name : g.type === 'Region' ? a.country : g.type === 'Role' ? (a.contact || {}).title : g.type === 'Trigger' ? (a.signals || []).map(function (x) { return x.type; }).join(' ') : (a.motivation || '') + ' ' + (a.signals || []).map(function (x) { return x.type; }).join(' ');
    return re.test(String(s || '')); }); }
  function segTags(sg) { var t = (sg.trigger || '') + ' ' + (sg.name || ''); return A.tags.filter(function (g) { if (!/Trigger|Motive/.test(g.type)) return false; try { return new RegExp(g.m, 'i').test(t); } catch (e) { return false; } }); }
  function tagsPane() {
    var types = ['Industry', 'Region', 'Size', 'Role', 'Trigger', 'Motive'];
    return '<div class="card c12"><div class="card-h"><span class="lbl">ICP tag library</span><span class="muted sm">the tags accounts carry · micro-segments are built from them</span></div><div class="card-b" style="padding:0"><div class="ac-bar"><span class="sm muted">Every account gets a tag of each type it matches. A micro-segment is a combination of tags, usually a trigger plus a motive within the ICP.</span><span class="sp"></span>' + ibtn('AC.tagEdit()', '+ Add a tag', 'pri') + '</div><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th style="width:110px">Type</th><th>Tags · accounts with each</th></tr></thead><tbody>'
      + types.map(function (ty) { return '<tr><td class="nm">' + ty + '</td><td><div class="ac-tags">' + A.tags.filter(function (g) { return g.type === ty; }).map(function (g) { return '<button class="ac-tag" onclick="AC.tagEdit(\'' + g.id + '\')" title="Edit, merge or remove">' + esc(g.name) + ' <b>' + tagAccts(g).length + '</b></button>'; }).join('') + '</div></td></tr>'; }).join('')
      + '</tbody></table></div><div class="ac-last">' + lastChange('tags') + '</div></div></div>'
      + '<div class="card c12"><div class="card-h"><span class="lbl">Micro-segments built from tags</span><span class="muted sm">trigger and motive tags behind each micro-segment</span></div><div class="card-b" style="padding:0"><div class="tbl-wrap"><table class="tbl ac-t"><thead><tr><th>Micro-segment</th><th>Built from</th><th>Mode</th></tr></thead><tbody>'
      + (M.SEGMENTS || []).map(function (sg) { var T = segTags(sg); return '<tr><td class="nm">' + esc(sg.name) + '</td><td><div class="ac-tags">' + (T.length ? T.map(function (g) { return badge(g.type + ': ' + g.name, g.type === 'Trigger' ? 'b-ter' : 'b-sec'); }).join('') : badge('Trigger: ' + (sg.trigger || '–'))) + '</div></td><td class="sm">' + esc(sg.mode || '') + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>';
  }
  /* ─── Mount ─── */
  function pane(name) { var P = document.querySelectorAll('[data-pane="' + name + '"]'); for (var i = 1; i < P.length; i++) P[i].parentNode.removeChild(P[i]); return P[0]; }
  function mount() {
    var wt = document.getElementById('wtRows'); if (wt) { var card = wt.closest('.card'); var c = document.createElement('div'); c.className = 'card c12'; c.id = 'acRubric'; card.parentNode.replaceChild(c, card); }
    ['niches', 'tags', 'signals', 'registry', 'exclusions', 'escal', 'backtest'].forEach(function (n) { var p = pane(n); if (p) { p.innerHTML = ''; p.id = 'ac-' + n; } });
  }
  function draw() {
    var set = function (id, h) { var el = document.getElementById(id); if (el) el.innerHTML = h; };
    set('acRubric', rubricCard()); set('ac-signals', signalsPane()); set('ac-registry', registryPane()); set('ac-exclusions', exclPane()); set('ac-escal', escalPane()); set('ac-backtest', backtestPane()); set('ac-niches', nichesPane()); set('ac-tags', tagsPane());
  }
  var find = function (L, id) { return L.find(function (x) { return x.id === id; }); };
  window.AC = {
    close: function () { var el = document.getElementById('acDrawer'); if (el) { el.className = ''; el.innerHTML = ''; } CUR = null; },
    submit: function () { var v = vals(), miss = CUR.fields.find(function (f) { return f.req && !(Array.isArray(v[f.k]) ? v[f.k].length : v[f.k]); }); if (miss) { say('Fill in: ' + miss.label); return; } var cb = CUR.onSave; AC.close(); cb(v); },
    /* niches and tags */
    nicheEdit: function (id, parent) { var n = id ? find(A.niches, id) : { name: '', parent: parent || '', kw: '' };
      form(id ? 'Edit the niche' : 'Add a niche', 'Part of the client\'s ontology', [
        { k: 'name', label: 'Niche', req: 1, val: n.name, ph: 'e.g. Specialty chemicals, Fertilisers' },
        { k: 'parent', label: 'Inside', type: 'select', val: n.parent, opts: [['', 'Top level']].concat(A.niches.filter(function (x) { return !x.parent && x.id !== id; }).map(function (x) { return [x.id, x.name]; })) },
        { k: 'kw', label: 'Matches on', req: 1, val: n.kw, ph: 'Words in the company name or industry, separated by commas', hint: 'e.g. fertiliser, urea, ammonia' }],
        function (o) { if (id) Object.assign(n, o); else A.niches.push(Object.assign({ id: uid() }, o)); persist((id ? 'Niche changed: ' : 'Niche added: ') + o.name + ' (' + nicheAccts(id ? n : A.niches[A.niches.length - 1]).length + ' accounts).', 'niches'); }, id ? 'Save' : 'Add the niche'); },
    nicheDel: function (id) { var n = find(A.niches, id); A.niches = A.niches.filter(function (x) { return x.id !== id && x.parent !== id; }); persist('Niche removed: ' + n.name + ' and its sub-niches.', 'niches'); },
    tagEdit: function (id) { var g = id ? find(A.tags, id) : { type: 'Trigger', name: '', m: '' };
      form(id ? 'Edit the tag' : 'Add a tag', 'Accounts carry it when they match', [
        { k: 'type', label: 'Type', type: 'select', val: g.type, opts: ['Industry', 'Region', 'Size', 'Role', 'Trigger', 'Motive'] },
        { k: 'name', label: 'Tag', req: 1, val: g.name, ph: 'e.g. Flaring incident, Brownfield expansion' },
        { k: 'm', label: 'Matches when', req: 1, val: g.m, ph: 'Words to look for, separated by |', hint: 'For a size, give the range as low-high, e.g. 1000-5000.' },
        { k: 'merge', label: 'Merge into', type: 'select', val: '', opts: [['', 'Keep as its own tag']].concat(A.tags.filter(function (x) { return x.id !== id; }).map(function (x) { return [x.id, x.type + ': ' + x.name]; })) }],
        function (o) { if (o.merge && id) { var into = find(A.tags, o.merge); into.m = into.m + '|' + g.m; A.tags = A.tags.filter(function (x) { return x.id !== id; }); persist('Tag merged: ' + g.name + ' into ' + into.name + '.', 'tags'); return; } delete o.merge; if (id) Object.assign(g, o); else A.tags.push(Object.assign({ id: uid() }, o)); persist((id ? 'Tag changed: ' : 'Tag added: ') + o.type + ' · ' + o.name + '.', 'tags'); }, id ? 'Save' : 'Add the tag'); },
    /* rubric */
    rubW: function (id, v) { find(A.rubric, id).w = Math.max(0, Math.min(100, +v || 0)); try { localStorage.setItem(K, JSON.stringify(A)); } catch (e) {} draw(); },
    rubEdit: function (id) { var v = id ? find(A.rubric, id) : { name: '', kind: 'List of values', vals: '', rule: 'Full points on a match', src: 'CRM field', w: 10, req: false };
      form(id ? 'Edit the variable' : 'Add a variable to the ICP rubric', 'A variable is one thing the fit score looks at', [
        { k: 'name', label: 'Variable', req: 1, val: v.name, ph: 'e.g. Installed DCS vendor, Number of sites, Ownership' },
        { k: 'kind', label: 'Type', type: 'select', val: v.kind, opts: ['List of values', 'Range', 'Number threshold', 'Yes or no', 'Technology installed', 'Custom rule'] },
        { k: 'vals', label: 'What counts', req: 1, val: v.vals, ph: 'e.g. Honeywell, Yokogawa · 2 to 10 sites · state-owned', hint: 'Separate values with commas. For a range, give the low and high numbers.' },
        { k: 'rule', label: 'How it scores', val: v.rule, ph: 'e.g. Full points on a match; half for a partial match' },
        { k: 'src', label: 'Data from', type: 'select', val: v.src, opts: ['CRM field', 'CRM industry field, then the data provider', 'CRM billing country', 'Data provider', 'Data provider headcount', 'Data provider title', 'Technographics', 'Company website', 'Signal history', 'Manual list'] },
        { k: 'w', label: 'Weight', type: 'number', val: v.w, hint: 'All weights should add up to 100.' },
        { k: 'req', label: 'Must have', type: 'toggle', val: v.req, text: 'A miss keeps the account out, whatever its other scores' }],
        function (o) { o.w = +o.w || 0; if (id) Object.assign(v, o); else A.rubric.push(Object.assign({ id: uid() }, o)); persist((id ? 'Rubric variable changed: ' : 'Rubric variable added: ') + o.name + '.', 'rubric'); }, id ? 'Save' : 'Add the variable'); },
    rubDel: function (id) { var v = find(A.rubric, id); A.rubric = A.rubric.filter(function (x) { return x.id !== id; }); persist('Rubric variable removed: ' + v.name + '. Re-balance the weights to 100.', 'rubric'); },
    rubSave: function () { var tot = A.rubric.reduce(function (n, v) { return n + (+v.w || 0); }, 0); if (tot !== 100) { say('The weights add up to ' + tot + '. Make them 100 first.'); return; } var v = nextVer(); A.btRun = { at: now(), by: ME }; persist('ICP rubric saved as rules ' + v + '. The backtest ran with it: ' + (btBars().every(function (b) { return b[3]; }) ? 'passed' : 'failed, so go-live stays blocked') + '.', 'rubric'); },
    /* tiers */
    tierSet: function (i, f, v) { A.tiers[i][f] = f === 'ex' ? v : Math.max(0, +v || 0); try { localStorage.setItem(K, JSON.stringify(A)); } catch (e) {} draw(); },
    tierAdd: function () { var l = A.tiers[A.tiers.length - 1]; A.tiers.push({ t: +l.t + 1, pts: Math.max(5, Math.round(l.pts / 2)), full: l.full * 2, zero: l.zero + 60, ex: '' }); persist('Tier ' + (+l.t + 1) + ' added.', 'tiers'); },
    tierDel: function () { var l = A.tiers.pop(); A.sigs.forEach(function (s) { if (+s.tier === +l.t) s.tier = A.tiers[A.tiers.length - 1].t; }); persist('Tier ' + l.t + ' removed; its signals moved to tier ' + A.tiers[A.tiers.length - 1].t + '.', 'tiers'); },
    tierSave: function () { var bad = A.tiers.find(function (t) { return +t.zero <= +t.full; }); if (bad) { say('Tier ' + bad.t + ': "zero by" must be later than the full-weight days'); return; } persist('Signal tiers saved as rules ' + nextVer() + '. Past decisions keep the version they ran under.', 'tiers'); },
    /* registry */
    sigQ: function (q) { A.sigQ = q; draw(); var i = document.querySelector('#ac-registry .ac-bar input'); if (i) { i.focus(); i.setSelectionRange(q.length, q.length); } },
    sigTier: function (id, t) { var s = find(A.sigs, id); s.tier = +t; persist(s.name + ' moved to tier ' + t + '.', 'signals'); },
    sigOn: function (id) { var s = find(A.sigs, id); s.on = !s.on; persist(s.name + (s.on ? ' switched on.' : ' switched off: it is no longer read or scored.'), 'signals'); },
    sigDel: function (id) { var s = find(A.sigs, id); A.sigs = A.sigs.filter(function (x) { return x.id !== id; }); persist('Signal removed: ' + s.name + '.', 'signals'); },
    sigEdit: function (id) { var s = id ? find(A.sigs, id) : { name: '', level: 'Company', src: '', tier: 2, full: '', zero: '', persona: '', why: '', on: true };
      form(id ? 'Edit the signal' : 'Add a signal', 'It has to pass the three tests: observable, predictive, time-bound', [
        { k: 'name', label: 'Signal', req: 1, val: s.name, ph: 'e.g. New HSE director, Flaring incident reported' },
        { k: 'level', label: 'Level', type: 'select', val: s.level, opts: ['Company', 'Personal', 'Competitor', 'Market', 'First-party'] },
        { k: 'src', label: 'Source', req: 1, val: s.src, ph: 'e.g. Job-change alerts, News feeds, GA4', hint: 'A connected source, or one to connect in Connectors.' },
        { k: 'tier', label: 'Tier', type: 'select', val: s.tier, opts: A.tiers.map(function (t) { return [t.t, 'Tier ' + t.t + ' · ' + t.pts + ' points · ' + t.full + ' days full, zero by ' + t.zero]; }) },
        { k: 'full', label: 'Own window: full weight (days)', type: 'number', val: s.full, hint: 'Leave empty to use the tier\'s window.' },
        { k: 'zero', label: 'Own window: zero by (day)', type: 'number', val: s.zero },
        { k: 'persona', label: 'Who it concerns', val: s.persona, ph: 'e.g. Reliability leader, the company' },
        { k: 'why', label: 'Why it predicts buying', type: 'textarea', val: s.why, ph: 'The documented link to buying in this category' }],
        function (o) { o.tier = +o.tier; if (id) Object.assign(s, o); else A.sigs.unshift(Object.assign({ id: uid(), on: true }, o)); persist((id ? 'Signal changed: ' : 'Signal added: ') + o.name + ' (tier ' + o.tier + ').', 'signals'); }, id ? 'Save' : 'Add the signal'); },
    /* exclusions */
    exEdit: function (id) { var x = id ? find(A.excl, id) : { type: 'Company', val: '', why: '', scope: 'Everywhere', until: '' };
      form(id ? 'Edit the exclusion' : 'Add an exclusion', 'Checked before anything is scored or routed', [
        { k: 'type', label: 'What kind', type: 'select', val: x.type, opts: ['Company', 'Domain', 'Industry', 'Country or region', 'Company size', 'Job title or persona', 'Competitor', 'Partner', 'Technology', 'Rule in your own words'] },
        { k: 'val', label: 'What', req: 1, val: x.val, ph: 'e.g. Acme Refining · acme.example · Defence · Under 300 staff · Procurement interns', hint: 'For a rule, write it plainly, e.g. "State-owned companies in Vietnam".' },
        { k: 'why', label: 'Why', req: 1, val: x.why, ph: 'e.g. A competitor, a partner, we don\'t sell there' },
        { k: 'scope', label: 'Applies to', type: 'select', val: x.scope, opts: [['Everywhere', 'Everywhere: never scored, listed or contacted'], ['Lists and scoring', 'Lists and scoring: never added to a list'], ['Outreach only', 'Outreach only: scored, but never contacted']] },
        { k: 'until', label: 'Until', type: 'date', val: x.until, hint: 'Optional. Leave empty to keep it until you remove it.' }],
        function (o) { if (id) Object.assign(x, o); else A.excl.unshift(Object.assign({ id: uid(), by: ME, at: now() }, o)); persist((id ? 'Exclusion changed: ' : 'Excluded: ') + o.val + '. Matching accounts leave every queue on the next run.', 'excl'); }, id ? 'Save' : 'Add the exclusion'); },
    exDel: function (id) { var x = find(A.excl, id); A.excl = A.excl.filter(function (e) { return e.id !== id; }); persist('Exclusion removed: ' + x.val + '.', 'excl'); },
    optEdit: function () {
      form('Add an opt-out', 'Permanent: covers every rep, campaign and next best action', [
        { k: 'who', label: 'Person', req: 1, ph: 'Full name' }, { k: 'email', label: 'Email', req: 1, ph: 'name@company.example' }, { k: 'co', label: 'Company', ph: 'Company' },
        { k: 'ch', label: 'Channels', type: 'select', val: 'All channels', opts: ['All channels', 'Email', 'LinkedIn', 'Phone'] },
        { k: 'src', label: 'How we heard', type: 'select', val: 'Asked by email', opts: ['Asked by email', 'Asked on a call', 'Asked on LinkedIn', 'Unsubscribe link', 'Legal or data-protection request', 'Other'] }],
        function (o) { A.opt.unshift(Object.assign({ id: uid(), at: now() }, o)); persist(o.who + ' opted out (' + o.ch.toLowerCase() + '). Any queued touch to them is cancelled.', 'opt'); }, 'Add the opt-out'); },
    optImport: function () {
      form('Import opt-outs', 'One person per line: name, email, company', [{ k: 'csv', label: 'Paste the list', type: 'textarea', rows: 8, req: 1, ph: 'Lena Ong, lena.ong@pacificaromatics.example, Pacific Aromatics\nTom Reyes, t.reyes@visayasgas.example, Visayas Gas' }, { k: 'src', label: 'Where the list came from', val: 'Imported list', ph: 'e.g. The previous sequencer\'s unsubscribe list' }],
        function (o) { var n = 0; o.csv.split('\n').forEach(function (l) { var p = l.split(',').map(function (s) { return s.trim(); }); if (p[0] && p[1]) { A.opt.unshift({ id: uid(), who: p[0], email: p[1], co: p[2] || '', ch: 'All channels', src: o.src || 'Imported list', at: now() }); n++; } }); persist(n + ' opt-out' + (n === 1 ? '' : 's') + ' imported.', 'opt'); }, 'Import'); },
    optDel: function (id) { var x = find(A.opt, id); A.opt = A.opt.filter(function (e) { return e.id !== id; }); persist('Opt-out removed for ' + x.who + '. Only do this with their consent; it is logged.', 'opt'); },
    supEdit: function (id) { var x = id ? find(A.sup, id) : { kind: 'Account', val: '', why: '', until: '' };
      form(id ? 'Edit the suppression' : 'Add a suppression', 'A hold that ends on its date or when the condition clears', [
        { k: 'kind', label: 'What kind', type: 'select', val: x.kind, opts: ['Account', 'Domain', 'Email address', 'Person', 'Rule'] },
        { k: 'val', label: 'What', req: 1, val: x.val, ph: 'e.g. Saltmarsh Gas · kingsbay.example · anyone in a live tender' },
        { k: 'why', label: 'Why', req: 1, val: x.why, ph: 'e.g. Legal hold, budget frozen, in a tender quiet period' },
        { k: 'until', label: 'Until', req: 1, val: x.until, ph: 'e.g. 31 Dec 2026, or "While the deal is open"' }],
        function (o) { if (id) Object.assign(x, o); else A.sup.unshift(Object.assign({ id: uid(), src: ME }, o)); persist((id ? 'Suppression changed: ' : 'Suppressed: ') + o.val + ' until ' + o.until + '.', 'sup'); }, id ? 'Save' : 'Add the suppression'); },
    supDel: function (id) { var x = find(A.sup, id); A.sup = A.sup.filter(function (e) { return e.id !== id; }); persist('Suppression lifted: ' + x.val + '.', 'sup'); },
    /* teams and routing */
    teamEdit: function (id) { var t = id ? find(A.teams, id) : { name: '', members: [], how: 'Round robin' };
      form(id ? 'Edit the team' : 'Add a team', 'Routing can send work to a team; it is shared out inside it', [
        { k: 'name', label: 'Team name', req: 1, val: t.name, ph: 'e.g. Malaysia pod, Enterprise desk' },
        { k: 'members', label: 'Members', type: 'checks', req: 1, val: t.members, opts: Object.keys(USERS).map(function (u) { return [u, uname(u) + ((USERS[u] || {}).title ? ' · ' + USERS[u].title.split('·')[0].trim() : '')]; }) },
        { k: 'how', label: 'Share work out by', type: 'select', val: t.how, opts: ['Round robin', 'Least loaded', 'Account owner first, then round robin', 'Territory owner first'] }],
        function (o) { if (id) Object.assign(t, o); else A.teams.push(Object.assign({ id: uid() }, o)); persist((id ? 'Team changed: ' : 'Team added: ') + o.name + ' (' + o.members.map(uname).join(', ') + ').', 'teams'); }, id ? 'Save' : 'Add the team'); },
    teamDel: function (id) { var t = find(A.teams, id), used = A.routes.filter(function (r) { return r.to === 'team:' + id; }).length; if (used) { say(t.name + ' is used by ' + used + ' routing rule' + (used > 1 ? 's' : '') + '. Change those first.'); return; } A.teams = A.teams.filter(function (x) { return x.id !== id; }); persist('Team removed: ' + t.name + '.', 'teams'); },
    routeEdit: function (id) { var r = id ? find(A.routes, id) : { field: 'Territory', op: 'is any of', val: '', to: 'team:' + (A.teams[0] || {}).id };
      form(id ? 'Edit the routing rule' : 'Add a routing rule', 'When an account matches, its work goes to this team or person', [
        { k: 'field', label: 'When', type: 'select', val: r.field, opts: ['Territory', 'Industry', 'Deal size (USD)', 'Product line', 'Micro-segment', 'Account tier', 'Company size (staff)', 'Lead source', 'Signal'] },
        { k: 'op', label: 'Condition', type: 'select', val: r.op, opts: ['is any of', 'is not', 'over', 'under', 'contains'] },
        { k: 'val', label: 'Value', req: 1, val: r.val, ph: 'e.g. Singapore, Malaysia · 1,000,000 · Safety systems' },
        { k: 'to', label: 'Goes to', type: 'select', val: r.to, opts: toOpts(), hint: 'A team shares the work out by its own rule (Teams, above).' }],
        function (o) { if (id) Object.assign(r, o); else A.routes.push(Object.assign({ id: uid() }, o)); persist((id ? 'Routing rule changed: ' : 'Routing rule added: ') + o.field + ' ' + o.op + ' ' + o.val + ' → ' + toLabel(o.to) + '.', 'routes'); }, id ? 'Save' : 'Add the rule'); },
    routeDel: function (id) { var r = find(A.routes, id); A.routes = A.routes.filter(function (x) { return x.id !== id; }); persist('Routing rule removed: ' + r.field + ' ' + r.op + ' ' + r.val + '.', 'routes'); },
    routeMove: function (i, d) { var j = i + d; if (j < 0 || j >= A.routes.length) return; var t = A.routes[i]; A.routes[i] = A.routes[j]; A.routes[j] = t; persist('Routing order changed: rule ' + (i + 1) + ' is now ' + (j + 1) + '.', 'routes'); },
    fallback: function (v) { A.fallback = v; persist('Unmatched accounts now go to ' + toLabel(v) + '.', 'routes'); },
    escSet: function (id, f, v) { var x = find(A.esc, id); x[f] = v; A.escDirty = true; try { localStorage.setItem(K, JSON.stringify(A)); } catch (e) {} },
    escSave: function () { A.escDirty = false; persist('Who decides what saved as rules ' + nextVer() + '. Cards already open keep their due time.', 'esc'); },
    /* backtest */
    btTab: function (t) { A.btTab = t; try { localStorage.setItem(K, JSON.stringify(A)); } catch (e) {} draw(); },
    btRun: function () { A.btRun = { at: now(), by: ME }; var ok = btBars().every(function (b) { return b[3]; }); persist('Backtest run: ' + (ok ? 'passed. Go-live can be approved.' : 'failed. Go-live stays blocked.'), 'bt'); },
    btEdit: function (id) { var x = id ? find(A.bt, id) : { name: '', dom: '', ind: 'Refining', ctry: 'Singapore', staff: '', date: '', val: '', set: A.btTab, note: '' };
      form(id ? 'Edit the backtest account' : 'Add an account to the backtest', 'Give it the rubric\'s variables so the rules can score it', [
        { k: 'set', label: 'Set', type: 'select', val: x.set, opts: [['won', 'Closed won'], ['lost', 'Closed lost'], ['random', 'Random']] },
        { k: 'name', label: 'Company', req: 1, val: x.name }, { k: 'dom', label: 'Domain', val: x.dom, ph: 'company.example' },
        { k: 'ind', label: 'Industry', type: 'select', val: x.ind, opts: ['Refining', 'Petrochemicals', 'Gas processing', 'LNG', 'Power', 'Specialty chemicals', 'Mining', 'Food and beverage', 'Logistics', 'Retail', 'Other'] },
        { k: 'ctry', label: 'Country', type: 'select', val: x.ctry, opts: ['Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'Vietnam', 'Philippines', 'Australia', 'Japan', 'India', 'Other'] },
        { k: 'staff', label: 'Staff', type: 'number', req: 1, val: x.staff },
        { k: 'date', label: 'Outcome and date', val: x.date, ph: 'e.g. Closed won Mar 2026' }, { k: 'val', label: 'Deal value', val: x.val, ph: 'e.g. USD 240k' },
        { k: 'note', label: 'Why it was won or lost', type: 'textarea', val: x.note, ph: 'Optional: what decided it' }],
        function (o) { o.staff = +o.staff || 0; if (!o.dom) o.dom = o.name.toLowerCase().replace(/[^a-z]+/g, '') + '.example'; if (!o.date) o.date = o.set === 'won' ? 'Closed won' : o.set === 'lost' ? 'Closed lost' : 'Drawn from the market'; if (id) Object.assign(x, o); else A.bt.push(Object.assign({ id: uid(), src: 'Added by ' + first(ME), tm: o.set === 'won' ? 75 : o.set === 'lost' ? 45 : 50 }, o)); A.btTab = o.set; persist((id ? 'Backtest account changed: ' : 'Added to the backtest: ') + o.name + ' (' + { won: 'closed won', lost: 'closed lost', random: 'random' }[o.set] + '). It is now tier ' + tierOf(id ? x : A.bt[A.bt.length - 1]) + '.', 'bt'); }, id ? 'Save' : 'Add the account'); },
    btDel: function (id) { var x = find(A.bt, id); A.bt = A.bt.filter(function (e) { return e.id !== id; }); persist('Removed from the backtest: ' + x.name + '.', 'bt'); },
    btImport: function () {
      form('Import backtest accounts', 'One account per line: company, industry, country, staff, won or lost, date, deal value', [{ k: 'csv', label: 'Paste the list', type: 'textarea', rows: 8, req: 1, ph: 'Pacific Aromatics, Petrochemicals, Malaysia, 1400, won, Feb 2026, USD 310k\nVisayas Gas, Gas processing, Philippines, 600, lost, Dec 2025, USD 150k' }],
        function (o) { var n = 0; o.csv.split('\n').forEach(function (l) { var p = l.split(',').map(function (s) { return s.trim(); }); if (!p[0] || !p[3]) return; var set = /lost/i.test(p[4] || '') ? 'lost' : /rand/i.test(p[4] || '') ? 'random' : 'won'; A.bt.push({ id: uid(), name: p[0], dom: p[0].toLowerCase().replace(/[^a-z]+/g, '') + '.example', ind: p[1] || 'Other', ctry: p[2] || 'Other', staff: +p[3] || 0, set: set, date: (set === 'won' ? 'Closed won ' : set === 'lost' ? 'Closed lost ' : '') + (p[5] || ''), val: p[6] || '', src: 'Imported', tm: set === 'won' ? 75 : set === 'lost' ? 45 : 50 }); n++; }); persist(n + ' account' + (n === 1 ? '' : 's') + ' imported into the backtest.', 'bt'); }, 'Import'); },
    btPull: function () { var keep = A.bt.filter(function (x) { return x.set === 'random' || x.src !== 'CRM'; }); seedBt(); A.bt = A.bt.filter(function (x) { return x.set !== 'random'; }).concat(keep); persist('Pulled closed-won and closed-lost accounts again from the CRM (last 18 months). Accounts you added are kept.', 'bt'); },
    btDraw: function () { A.bt.filter(function (x) { return x.set === 'random'; }).forEach(function (x, i) { x.tm = Math.round(20 + ((x.tm * 7 + i * 13) % 60)); }); persist('Drew a new random set of 15 from the market.', 'bt'); }
  };
  mount(); draw();
})();
