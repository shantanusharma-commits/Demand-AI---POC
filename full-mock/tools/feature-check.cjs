// Feature check: node full-mock/tools/feature-check.cjs <production-mock|full-mock>. Opens each screen and checks the PRD features are shown.
const { chromium } = require('playwright');
const M = process.argv[2], full = M === 'full-mock', dir = '/home/user/Demand-AI---POC/' + M;
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const E = []; p.on('pageerror', e => E.push(p.url().split('/').pop() + ': ' + e.message)); await p.route(/fonts/, r => r.abort());
  const R = []; const chk = (id, ok, where) => R.push([id, ok, where]);
  const as = async u => { await p.goto('file://' + dir + '/index.html'); await p.evaluate(u => { localStorage.setItem('dmock_user', u); }, u); await p.goto('file://' + dir + '/app.html'); await p.waitForTimeout(450); };
  const body = () => p.innerText('body'); const run = async (js, w = 450) => { await p.evaluate(js); await p.waitForTimeout(w); return body(); };
  await p.goto('file://' + dir + '/index.html'); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  // admin
  const adm = async h => { await p.goto('file://' + dir + '/admin/controls.html#' + h); await p.waitForTimeout(300); return body(); };
  let t = await adm('home'); chk('Admin Home: needs, held record, name-only', /Needs the admin/i.test(t) && /Name-only CRM match/i.test(t), 'Admin › Home');
  t = await adm('runlog'); chk('FND-12 versions, LRN-01 baseline, cost', /Versions in force/i.test(t) && /Baseline reply rate/i.test(t) && /USD/i.test(t), 'Admin › Home › Run log');
  t = await adm('connectors'); const t2 = await adm('interfaces'); chk('INT-01..04 connectors, Slack, Teams', /CRM/i.test(t) && /Slack/i.test(t + t2) && /Teams/i.test(t + t2), 'Admin › Connections');
  t = await adm('interfaces'); chk('FND-10 chat and interfaces', /Web chat/i.test(t), 'Admin › Connections › Interfaces');
  t = await adm('icp'); chk('PRO-01 ICP library and fit weights (admin)', /ICP library/i.test(t) && /Fit weights/i.test(t), 'Admin › ICP and scoring');
  await p.evaluate(() => CTL.conPick('Crunchbase', 'key', 'Signal sources', 1)); await p.waitForTimeout(150); let w1 = await body(); await p.evaluate(() => { CTL.wzAuth(); CTL.wzGo(1); }); let w2 = await body(); await p.evaluate(() => CTL.wzGo(1)); let w3 = await body(); await p.evaluate(() => CTL.wzGo(1)); let w4 = await body();
  chk('Connect flow: authorise, map, test, schedule', /Connect Crunchbase/i.test(w1) && /Funding announcement/i.test(w2) && /Connection OK/i.test(w3) && /If it fails/i.test(w4), 'Admin › Connections › Connect');
  await p.evaluate(() => { CTL.conAdd('Crunchbase'); CTL.wzClose(); });
  t = await adm('signals'); chk('SIG-12/13/15, RES-01 category research', /Observable/i.test(t) && /Category research/i.test(t), 'Admin › ICP › Signals and tiers');
  t = await adm('registry'); chk('SIG-01 registry, SIG-16 champion move', /Signal registry/i.test(t) && /champion/i.test(t), 'Admin › ICP › Signal registry');
  t = await adm('quality'); chk('PRO-07 name-only, PRO-10 held', /Name-only/i.test(t) && /Identity dispute/i.test(t), 'Admin › ICP › Data quality');
  t = await adm('exclusions'); chk('FND-05 exclusions', /Customer/i.test(t), 'Admin › ICP › Exclusions');
  t = await adm('backtest'); chk('SCR-05/FND-11 backtest', /15 won/i.test(t) || /Won accounts/i.test(t), 'Admin › ICP › Backtest');
  t = await adm('policy'); chk('NBA-08 five criteria, confidence high/medium', /Confidence: high or medium/i.test(t), 'Admin › Rules');
  t = await adm('escal'); chk('FND-14 who decides what', /What reaches a person/i.test(t), 'Admin › Rules › Who decides what');
  t = await adm('simulate'); chk('Fail closed, demo clock', /CRM unreachable/i.test(t), 'Admin › Home › Demo');
  if (full) {
    t = await adm('quality'); chk('PRO-11 refresh, PRO-12 coverage', /Profile change/i.test(t) && /Coverage by channel/i.test(t), 'Admin › ICP › Data quality');
    t = await adm('airules'); chk('SCR-06 AI-drafted rules', /drafted by the AI/i.test(t), 'Admin › ICP › AI-drafted rules');
    t = await adm('learning'); chk('FND-11 classifier, FND-12 prompts, CON-10, SEG-08, RES-03, RES-04, NBA-16, SIG-18/19/20, CON-09, RSP-05', /Reply classifier/i.test(t) && /Tuned model/i.test(t) && /Lessons by segment/i.test(t) && /transcript/i.test(t) && /Pattern cache/i.test(t) && /Anomaly/i.test(t) && /Source scoring/i.test(t), 'Admin › Home › Learning');
    t = await adm('escal'); chk('NBA-14 team routing', /Team routing/i.test(t), 'Admin › Rules');
  }
  // rep
  await as('sofia'); t = await body();
  chk('NBA-10 morning queue, confidence label', /Your day/i.test(t) && /confidence: (high|medium)/i.test(t), 'Today');
  t = await run(() => App.nav('approvals')); t = await run(() => App.expand());
  chk('NBA-09 approval cards, escalations, name-only to rep', /Message verification/i.test(t) && /name-only CRM match/i.test(t), 'Approvals');
  t = await run(() => App.openRecord('juniper', 'overview'));
  chk('SCR-01..04 score breakdown, worked example (in the collapsed panel)', /Fit/i.test(t) && /30\.5/.test(await p.evaluate(() => document.body.textContent)), 'Account › Overview › How the score is calculated');
  chk('FND-02/PRO-04 identity tier and source', /Apollo, first try/i.test(t), 'Account › Details');
  t = await run(() => App.setRecTab('graph')); chk('FND-03 context graph hub', await p.$('svg.hub') !== null, 'Account › Context graph');
  await run(() => App.send1('juniper')); t = await run(() => { App.openRecord('juniper', 'activity'); });
  chk('FND-08 send record, FND-06 timeline', /Send record/i.test(t) && /Timeline/i.test(t), 'Account › Activity');
  t = await run(() => App.openRecord('kingfisher', 'activity')); chk('SIG-16 champion moved', /Champion moved/i.test(t), 'Account › Activity');
  t = await run(() => App.ask("Show me Juniper's history"), 2500); chk('WRK-04 account history in chat', /Juniper/i.test(t), 'Chat');
  t = await run(() => App.modTab('signals')); chk('SIG-02..06 and SIG-21 signals', /Live/i.test(t) && /Discarded/i.test(t), 'Accounts › Signals');
  t = await run(() => App.modTab('campaigns'), 500); chk('Campaigns and next best actions on one screen: three status cards, open box, one list', /Under review/i.test(t) && /Approved/i.test(t) && /In outreach/i.test(t) && /What should we run/i.test(t) && /NBA/.test(t) && /Turnaround season 2027/i.test(t), 'Campaigns');
  t = await run(() => App.goCampaign('c1')); chk('NBA-11/SEG-07 campaign, touch tasks', /Touch tasks by owner/i.test(t), 'Campaigns › campaign');
  if (full) {
    t = await run(() => App.modTab('campaigns')); chk('Content studio in the menu', /Content studio/i.test(await p.innerText('.side-nav')), 'Menu'); await run(() => App.nav('studio'), 400); chk('Content studio has no campaign tabs', (await p.$$('.mod-tabs button')).length === 0, 'Content studio'); await run(() => App.modTab('campaigns'), 400); chk('Content inside Campaigns', /Content/i.test(await p.$$eval('.mod-tabs button', x => x.map(y => y.textContent).join(' '))), 'Campaigns › Content');
    t = await run(() => App.modTab('plays')); chk('NBA-12 plays, CON-06 corpus, CON-08 swap, CMP-06 follow-up', /Campaign corpus/i.test(t) && /Swap asset/i.test(t) && /Persistent follow-up/i.test(t), 'Campaigns › Plays');
    t = await run(() => App.modTab('nba')); chk('NBA-13 live order', /Live order/i.test(t), 'Campaigns › Next best actions');
    t = await run(() => { App.nav('studio'); }); t = await body(); chk('CON-07 content backlog', /could not answer/i.test(t), 'Content › Backlog');
    t = await run(() => App.openRecord('cedar', 'overview')); chk('SCR-07 own normal, SEG-05/06, SIG-10, RES-02', /own normal/i.test(t) && /Buying committee/i.test(t) && /Rival research/i.test(t), 'Account › Overview');
    t = await run(() => App.setRecTab('activity')); chk('RSP-03 lineage', /Lineage/i.test(t), 'Account › Activity');
    t = await run(() => App.nav('inbox')); chk('RSP-02 six statuses', /Further action/i.test(t) && /Wrong person/i.test(t), 'Inbox');
  }
  // round 4: admin can act on connectors; decision traces; caps; persona edit
  t = await adm('connectors'); await p.evaluate(() => { CTL.conPick('HubSpot', 'oauth'); CTL.conAdd('HubSpot'); CTL.conKey('ZoomInfo'); CTL.conLog('ZoomInfo'); }); await p.waitForTimeout(250); t = await body();
  chk('FND-01 add a connector, remove a key (cached, labelled), per-connector log', /HubSpot/.test(t) && /Cached: serving data/i.test(t) && /Run log · ZoomInfo/i.test(t), 'Admin › Connections');
  await p.evaluate(() => { CTL.conKey('ZoomInfo'); CTL.conLog('Lusha'); }); t = await body(); chk('FND-01 404 is free, 401 not retried', /404 no match/i.test(t) && /401 unauthorised → not retried/i.test(t), 'Admin › Connections › Log');
  t = await adm('traces'); await p.waitForTimeout(200); t = await body(); chk('FND-07 traces with evidence and versions; older decision keeps old version', /Decision traces/i.test(t) && /rules 2026\.10\.4/.test(t) && /Evidence/i.test(t), 'Admin › Home › Decision traces');
  await p.fill('#trF', 'oakmere'); await p.evaluate(() => CTL.trExport()); t = await body(); chk('FND-07 filter and export', (await p.$$eval('#trRows tr', r => r.length)) >= 1 && /when,decision/i.test(await p.inputValue('#trOut')), 'Admin › Home › Decision traces');
  t = await adm('runlog'); chk('FND-12 cost cap alert and stop', /alert at 80%/i.test(t), 'Admin › Home › Run log');
  await as('sofia'); t = await run(() => App.openRecord('juniper', 'overview')); await p.selectOption('#perSel', 'Technical lead'); chk('FND-03 edit persona (audited)', await p.evaluate(() => /Technical lead/.test(document.querySelector('#perSel').value)), 'Account › Details');
  await as('sofia'); t = await run(() => App.ask('What is our ICP?'), 2500); chk('ICP remembered and shown in chat', /ICP v\d/i.test(t) && /Every new list starts from it/i.test(t), 'Chat');
  t = await run(() => App.ask('Find heads of operations in Singapore'), 2500); chk('New lists use the confirmed ICP', /Used the confirmed ICP v/i.test(t), 'Chat');
  if (full) { t = await run(() => App.ask('What is our ICP?'), 2500); chk('ICP learns from reps\' edits (proposed to the rep)', /reps removed 6 sites/i.test(t), 'Chat'); }
  t = await run(() => App.nav('analytics'), 600); chk('Rep Analytics: own numbers only, no rep filter, no team numbers in chat', /Analytics/i.test(await p.innerText('.side-nav')) && /Sofia/i.test(t) && (await p.$$('.an-ctl select')).length === 0 && /your numbers/i.test(t) && !/whole team/i.test(t), 'Rep › Analytics');
  t = await run(() => App.ask('How is the turnaround campaign performing?'), 2600); chk('Chat: one campaign\'s performance', /Steps sent/i.test(t), 'Chat');
  t = await run(() => App.ask('Which campaign is performing best?'), 2600); chk('Chat: campaigns ranked', /ranked by reply rate/i.test(t), 'Chat');
  t = await run(() => App.ask("What's my reply rate?"), 2600); chk('Chat: reply rate', /Reply rate this week for you/i.test(t), 'Chat');
  t = await run(() => App.ask('How many meetings did I book this week?'), 2600); chk('Chat: meetings against target', /You booked/i.test(t), 'Chat');
  t = await run(() => App.ask('What needs my approval?'), 2600); chk('Chat: approvals', /Waiting for you/i.test(t), 'Chat');
  await run(() => { App.modTab('studio'); }, 300); t = await run(() => App.setStudioTab('saved'), 400);
  chk('Content Library: status dashboard, usage table, Claude-style controls, artifact cards, format guide', /Under review/i.test(t) && /To approve/i.test(t) && /In outreach/i.test(t) && /Where assets are used/i.test(t) && (await p.$$('.lc')).length >= 10 && (await p.$$('.lib-tools .lib-ib')).length >= 3 && /Which format for which asset/i.test(t) && !/vehicle/i.test(t), 'Content studio › Library');
  await p.evaluate(() => { App.libMenu('topicK'); }); await p.waitForTimeout(100); await p.evaluate(() => { App.libPick('topicK', 'Initiative'); App.libMenu(null); }); await p.waitForTimeout(150); chk('Content Library: filter menu (topic) and chip', (await p.$$eval('.lc', x => x.length)) > 0 && (await p.$$eval('.lc', x => x.every(c => /Initiative/.test(c.innerText)))) && (await p.$$('.lib-chips .lib-chip')).length === 1, 'Content studio › Library');
  await p.evaluate(() => { App.libClear(); App.libListView(true); }); await p.waitForTimeout(150); chk('Content Library: list view shows usage for every asset', (await p.$$eval('.lib-tbl tbody tr', x => x.length)) >= 12, 'Content studio › Library'); await p.evaluate(() => { App.libListView(false); App.setStudioTab('write'); }); await p.waitForTimeout(200);
  chk('Write: asset-type pill with only the four asset types, matching prompts', (await p.$$('.st-pill')).length === 2 && await p.evaluate(() => { App.stPill(); return [...document.querySelectorAll('.st-pm .lib-mi b')].map(x => x.textContent).join('|') === 'Whitepaper|Infographic|Carousel|PDF one-pager'; }) && (await p.evaluate(() => { App.setStudioType('Infographic'); return [...document.querySelectorAll('.st-sugg .chip')].every(c => /infographic/i.test(c.textContent)); })), 'Content studio › Write'); await p.evaluate(() => App.nav(null)); await p.waitForTimeout(300);
  // round 6: open screens
  t = await run(() => { App.nav('accounts'); App.expand(); }, 500); chk('Leads: open box, ICP pill, plus menu, tabs Leads · Signals · Segments', /Who should we go after/i.test(t) && (await p.$$eval('.ob-tabs button', x => x.map(b => b.textContent).join('|'))) === 'Leads|Signals|Segments' && /Leads/.test(await p.innerText('.side-nav')) && (await p.evaluate(() => { App.obMenu('leads'); return document.querySelectorAll('.ob-pm .lib-mi').length; })) === 4, 'Leads');
  await p.evaluate(() => App.obMenu(null));
  t = await run(() => { App.nav('campaigns'); App.expand(); }, 500); await p.evaluate(() => { App.outKind('NBC'); App.outStart('A campaign for turnaround season accounts by email to book meetings'); }); await p.waitForTimeout(200);
  chk('NBC: clarifying questions (objective, audience, channels, sequence, content) before it builds', (await p.$$('.oq-q')).length === 6 && /How long a sequence/i.test(await body()), 'Campaigns and NBA');
  await p.evaluate(() => App.outBuild()); await p.waitForTimeout(300); t = await body(); chk('NBC built: plan, sequence and first message, waits in Under review', /Sequence · 5 touches/i.test(t) && /First message/i.test(t) && /Under review/i.test(t), 'Campaigns and NBA');
  await p.evaluate(() => { App.outOpen(null); App.outKind('NBA'); App.outStart('Book a meeting with the new leader by email'); }); await p.waitForTimeout(200); await p.evaluate(() => { App.outAns('who', document.querySelectorAll('.oq-q')[1].querySelector('.chip').textContent, 0); App.outBuild(); }); await p.waitForTimeout(300);
  chk('NBA: clarifying questions, then one action with a draft', /The action/i.test(await body()) && /When/.test(await body()), 'Campaigns and NBA');
  await p.evaluate(() => { App.outOpen(null); App.outTab('Under review'); App.outMenu('kind'); App.outPick('kind', 'NBA'); }); await p.waitForTimeout(200); chk('Campaigns and NBA: Claude-style filter and status tabs', (await p.$$eval('.lib-tbl tbody tr, .tbl tbody tr', x => x.length)) > 0 && (await p.$$('.lib-chips .lib-chip')).length === 1, 'Campaigns and NBA'); await p.evaluate(() => { App.outPick('kind', ''); App.outTab('All'); });
  t = await run(() => App.nav('studio'), 400); chk('Content studio: one screen, four cards, box, formats, assets and table', /Top performing/i.test(t) && /To approve/i.test(t) && /In outreach/i.test(t) && /Formats it makes/i.test(t) && /Where assets are used/i.test(t) && (await p.$$('.lc')).length >= 10 && !(await p.$('.dtabs')), 'Content studio');
  await p.evaluate(() => { App.obPill('ds'); }); await p.waitForTimeout(100); chk('Design system and templates picker', (await p.$$('.ds-card')).length === 4 && /Org default/.test(await body()), 'Content studio'); await p.evaluate(() => { App.dsPick('Boardroom'); App.setStudioType('Carousel'); App.studioGo('A carousel on switching at contract end'); }); await p.waitForTimeout(300);
  chk('Template applies to the asset', /Boardroom/.test(await body()) && /--brand:#1F4E8C/.test(await p.getAttribute('#cv', 'style') || ''), 'Content studio'); await p.evaluate(() => { App.dsPick(''); App.nav(null); }); await p.waitForTimeout(300);
  // round 3
  t = await run(() => { App.openRecord('juniper', 'graph'); }); await p.click('g.hub-n'); await p.waitForTimeout(300); t = await body(); chk('Context graph nodes clickable with detail', /Open/i.test(t) && (await p.$('g.hub-n.on')) !== null, 'Account › Context graph');
  chk('Actions name their signal (no placeholder)', await p.evaluate(() => !MOCK.ACCOUNTS.some(a => a.nba && /Introduce Client/.test(a.nba.action)) && /Congratulate Budi/.test(MOCK.ACCOUNTS.find(a => a.id === 'juniper').nba.action)), 'Next best actions');
  t = await run(() => App.ask('What does the datasheet say about unplanned trips?'), 2500); chk('FND-09 knowledge answer with page', /page 3/i.test(t), 'Chat');
  t = await run(() => App.ask('What does the datasheet say about pricing tiers?'), 2500); chk('FND-09 not found, not invented', /Not found in the Knowledge Hub/i.test(t), 'Chat');
  t = await adm('quality'); await as('sofia'); chk('FND-02 merge, same-name pair, bounce; SCR-01 unranked; PRO-08 contradiction; FND-04 dated fact', /Merged into one/i.test(t) && /Kept as two people/i.test(t) && /Marked stale/i.test(t) && /unranked/i.test(t) && /Flagged, not accepted/i.test(t) && /expires 30 Apr/i.test(t), 'Admin › ICP › Data quality');
  if (full) {
    chk('NBA-08 autopilot sends only high; medium waits', await p.evaluate(() => MOCK.ACCOUNTS.filter(a => a.nba && a.nba.autopilot).every(a => a.nba.confidence !== 'Medium')), 'Routing');
    t = await run(() => App.ask('Make a deck on control system migration'), 3000); chk('Content: attach to outreach, assign, permission', /Use in outreach/i.test(t) && /Assign to a teammate/i.test(t) && /Let the AI attach/i.test(t), 'Content canvas');
  }
  // manager
  await as('pavan'); t = await body(); chk('Manager Today: confirm campaign and meeting, coach', /Confirm the Eastgate meeting/i.test(t) && /Coach Marco/i.test(t), 'Manager › Today');
  chk('Manager menu has Inbox and Analytics', /Analytics/i.test(await p.innerText('.side-nav')) && /Inbox/i.test(await p.innerText('.side-nav')), 'Manager menu');
  t = await run(() => App.nav('inbox'), 500); chk('Manager inbox shows the team\'s replies with an owner filter', /Inbox/i.test(t) && (await p.$('select')) !== null, 'Manager › Inbox');
  t = await run(() => App.goCampaign('c1')); chk('NBA-11 manager confirms touch formats', /Confirm the format of each touch/i.test(t), 'Manager › Campaign');
  if (full) { t = await run(() => App.nav('analytics'), 600); chk('LRN-03 per 100, LRN-05 ledger, LRN-07 benchmark, RSP-03 by signal', /Results per 100 accounts/i.test(t) && /Qualified meeting ledger/i.test(t) && /benchmark/i.test(t) && /Reply rate by signal type/i.test(t), 'Manager › Team'); }
  const bad = R.filter(r => !r[1]); console.log(M, ':', R.length - bad.length, 'of', R.length, 'checks pass'); bad.forEach(r => console.log('  FAIL', r[0], '·', r[2])); console.log('  page errors:', E.length ? E : 'none');
  await b.close(); })();
