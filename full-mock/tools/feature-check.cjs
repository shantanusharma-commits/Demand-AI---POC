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
  t = await run(() => App.modTab('campaigns'), 500); chk('Campaigns and next best actions on one list: messages sent or where it stands, counts on the tabs', /Under review/i.test(t) && /In outreach/i.test(t) && !/What should we run/i.test(t) && /NBA/.test(t) && /Turnaround season 2027/i.test(t) && (await p.$$('.om')).length > 5 && /messages sent/.test(t) && /Not sent yet/.test(t) && (await p.$$('.lib-tabs .lib-n')).length === 5, 'Campaigns');
  t = await run(() => App.goCampaign('c1')); chk('NBA-11/SEG-07 campaign, touch tasks', /Touch tasks by owner/i.test(t), 'Campaigns › campaign');
  if (full) {
    t = await run(() => App.modTab('campaigns')); chk('Content studio in the menu', /Content studio/i.test(await p.innerText('.side-nav')), 'Menu'); await run(() => App.nav('studio'), 400); chk('Content studio has no campaign tabs', (await p.$$('.mod-tabs button')).length === 0, 'Content studio'); await run(() => App.modTab('campaigns'), 400); chk('No Content tab inside Campaigns (Content studio is its own screen)', !/Content/i.test(await p.$$eval('.mod-tabs button', x => x.map(y => y.textContent).join(' '))), 'Campaigns');
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
  chk('Content Library: status dashboard, usage table, Claude-style controls, artifact cards, format guide', /Under review/i.test(t) && /To approve/i.test(t) && /In outreach/i.test(t) && /Where assets are used|Assets · 12/i.test(t) && (await p.$$('.lib-tbl tbody tr')).length >= 10 && (await p.$$('.lib-tools .lib-ib')).length >= 3 && /Which format for which asset/i.test(t) && !/vehicle/i.test(t), 'Content studio › Library');
  await p.evaluate(() => { App.libListView(false); App.libMenu('topicK'); }); await p.waitForTimeout(100); await p.evaluate(() => { App.libPick('topicK', 'Initiative'); App.libMenu(null); }); await p.waitForTimeout(150); chk('Content Library: filter menu (topic) and chip', (await p.$$eval('.lc', x => x.length)) > 0 && (await p.$$eval('.lc', x => x.every(c => /Initiative/.test(c.innerText)))) && (await p.$$('.lib-chips .lib-chip')).length === 1, 'Content studio › Library');
  await p.evaluate(() => { App.libClear(); App.libListView(true); }); await p.waitForTimeout(150); chk('Content Library: list view shows usage for every asset', (await p.$$eval('.lib-tbl tbody tr', x => x.length)) >= 12, 'Content studio › Library'); await p.evaluate(() => { App.libListView(false); App.setStudioTab('write'); }); await p.waitForTimeout(200);
  chk('Write: asset-type pill with only the four asset types, no prompt chips', (await p.$$('.st-pill')).length === 2 && await p.evaluate(() => { App.stPill(); return [...document.querySelectorAll('.st-pm .lib-mi b')].map(x => x.textContent).join('|') === 'Whitepaper|Infographic|Carousel|PDF one-pager'; }) && (await p.evaluate(() => { App.setStudioType('Infographic'); return !document.querySelector('.st-sugg') && /Infographic/.test(document.querySelector('.st-ft.on').textContent); })), 'Content studio › Write'); await p.evaluate(() => App.nav(null)); await p.waitForTimeout(300);
  // round 6: open screens
  t = await run(() => { App.nav('accounts'); App.expand(); }, 500); chk('Leads: tabs Leads · Signals (micro-segments moved to Campaigns and NBA), no open box, filter-and-sort menu instead of pills', !/Who should we go after/i.test(t) && (await p.$$eval('.ob-tabs button', x => x.map(b => b.textContent).join('|'))) === 'Leads|Signals' && /Leads/.test(await p.innerText('.side-nav')) && !(await p.$('.list-tabs')) && !(await p.$('#accT')) && (await p.evaluate(() => { App.fsMenu('ld', 'root'); return document.querySelectorAll('.lib-menu .lib-mi').length; })) >= 4, 'Leads');
  await p.evaluate(() => { App.fsPick('ld', 'tier', 'B'); }); await p.waitForTimeout(200); chk('Leads: filter by tier gives a chip and only tier B', (await p.$$('.lib-chips .lib-chip')).length === 1 && (await p.$$eval('.tbl tbody tr', x => x.length > 0 && x.every(r => /\bB\b/.test(r.children[3].innerText)))), 'Leads'); await p.evaluate(() => App.fsPick('ld', 'tier', ''));
  await p.evaluate(() => { App.modTab('segments'); }); await p.waitForTimeout(400); await p.evaluate(() => App.fsPick('sg', 'mode', 'NBC')); await p.waitForTimeout(200); chk('Segments: filter menu instead of pills', !(await p.$('.fchip')) && (await p.$$('.srow')).length > 0 && (await p.$$('.lib-chips .lib-chip')).length === 1, 'Segments'); await p.evaluate(() => App.fsPick('sg', 'mode', ''));
  t = await run(() => { App.nav('campaigns'); App.expand(); }, 500); await p.evaluate(() => App.ask('A campaign for turnaround season accounts by email to book meetings')); await p.waitForTimeout(2500);
  chk('NBC: five questions at most, asked one at a time in the dock above the message box, each with Something else, starting where the brief leaves off', / of 5$/.test(await p.$eval('.qd-nav span', e => e.textContent).catch(() => '')) && !!(await p.$('#qdOther')) && !(await p.$('.oq-wrap')) && (await p.getAttribute('#composer', 'placeholder')) === 'Or reply directly…' && await p.evaluate(() => { App.qdGo(3); const a = /Day 0/.test(document.querySelector('.qd').textContent); App.qdGo(4); return a && /Recommended/.test(document.querySelector('.qd').textContent); }), 'Campaigns and NBA');
  await p.evaluate(() => App.outBuild()); await p.waitForTimeout(300); t = await body(); chk('NBC built: plan, sequence and first message, waits in Under review', /Sequence · 5 touches/i.test(t) && /First message/i.test(t) && /Under review/i.test(t), 'Campaigns and NBA');
  await p.evaluate(() => { App.outOpen(null); App.outKind('NBA'); App.outStart('Book a meeting with the new leader by email'); }); await p.waitForTimeout(200); await p.evaluate(() => { App.qdGo(1); App.qdPick(0); App.outBuild(); }); await p.waitForTimeout(300);
  chk('NBA: clarifying questions, then one action with a draft', /The action/i.test(await body()) && /When/.test(await body()), 'Campaigns and NBA');
  await p.evaluate(() => { App.outOpen(null); App.outTab('Under review'); App.outMenu('kind'); App.outPick('kind', 'NBA'); }); await p.waitForTimeout(200); chk('Campaigns and NBA: Claude-style filter and status tabs', (await p.$$eval('.lib-tbl tbody tr, .tbl tbody tr', x => x.length)) > 0 && (await p.$$('.lib-chips .lib-chip')).length === 1, 'Campaigns and NBA'); await p.evaluate(() => { App.outPick('kind', ''); App.outTab('All'); });
  t = await run(() => App.nav('studio'), 400); chk('Content studio: one screen, four cards, box, formats, assets and table', /Top performing/i.test(t) && /To approve/i.test(t) && /In outreach/i.test(t) && /Choose a format/i.test(t) && !(await p.$('.st-sugg')) && (await p.$$('.lib-tbl tbody tr')).length >= 10 && !(await p.$('.dtabs')), 'Content studio');
  await p.evaluate(() => { App.obPill('ds'); }); await p.waitForTimeout(100); chk('Design system and templates picker', (await p.$$('.ds-card')).length === 4 && /Org default/.test(await body()), 'Content studio'); await p.evaluate(() => { App.dsPick('Boardroom'); App.setStudioType('Carousel'); App.studioGo('A carousel on switching at contract end'); }); await p.waitForTimeout(300);
  chk('Template applies to the asset', /Boardroom/.test(await body()) && /--brand:#1F4E8C/.test(await p.getAttribute('#cv', 'style') || ''), 'Content studio'); await p.evaluate(() => { App.dsPick(''); App.nav(null); }); await p.waitForTimeout(300);
  // round 8: + menu pickers, split view by default, leads from a prompt, NBA signal question
  t = await run(() => App.nav('studio'), 400); await p.evaluate(() => App.obMenu('studio')); await p.waitForTimeout(100);
  chk('Studio + menu: Files, Library, Knowledge Hub; no separate brand item', (await p.$$eval('.ob-pm .ob-mh', x => x.map(e => e.textContent).join('|'))) === 'Files|Library|Knowledge Hub' && !/Brand voice and claims/.test(await p.innerText('.ob-pm')), 'Content studio');
  await p.evaluate(() => App.obAct('studio', 1, 0)); await p.waitForTimeout(100); chk('Reference an asset opens a picker of approved assets', (await p.$$('.ob-pm .ob-mi')).length >= 5 && /Only approved assets/.test(await p.innerText('.ob-pm')), 'Content studio');
  await p.evaluate(() => { App.obMenu('studio'); App.obAct('studio', 2, 0); }); await p.waitForTimeout(100); chk('Knowledge Hub lists connectors', /SharePoint/.test(await p.innerText('.ob-pm')) && /Connected/.test(await p.innerText('.ob-pm')) && /Manage connectors/.test(await p.innerText('.ob-pm')), 'Content studio');
  await p.evaluate(() => { App.obMenu(null); App.obPill('ds'); }); await p.waitForTimeout(100); chk('Voice and claims explained in the design system picker', /Brand voice/.test(await p.innerText('.ds-pm')) && /Approved claims/.test(await p.innerText('.ds-pm')), 'Content studio'); await p.evaluate(() => App.obPill(null));
  await p.evaluate(() => App.nav('approvals')); await p.waitForTimeout(600); chk('Screens open in split view by default', await p.evaluate(() => document.getElementById('ws').classList.contains('canvas-open') && !!document.querySelector('#main .cv-h')), 'Navigation');
  await p.evaluate(() => App.nav('accounts')); await p.waitForTimeout(600); await p.evaluate(() => App.ask('Refineries in Thailand with a new reliability leader')); await p.waitForTimeout(4500);
  chk('Leads: a prompt generates a list, shown in the pane', /Thailand/.test(await p.$eval('.ld-h b', e => e.textContent).catch(() => '')) && (await p.$$eval('#main .tbl tbody tr', x => x.length)) >= 10, 'Leads');
  await p.evaluate(() => { App.nav('campaigns'); }); await p.waitForTimeout(600); await p.evaluate(() => { App.outKind('NBA'); App.outStart('Get a reply'); }); await p.waitForTimeout(200); await p.evaluate(() => { App.qdGo(1); App.qdPick(0); }); await p.waitForTimeout(200);
  chk('NBA: asks which signal to lead with and fills it from the person', /Which signal should it lead with/.test(await p.$eval('.qd .qd-h b', e => e.textContent).catch(() => '')) && (await p.$$('.qd .qd-r.on')).length === 1, 'Campaigns and NBA'); await p.evaluate(() => { App.outCancel(); App.outKind('NBC'); App.nav(null); }); await p.waitForTimeout(300);
  // round 9: campaign-level messages, stage on the campaign page, clickable corpus
  t = await run(() => App.goCampaign('c5'), 600); const ov = t; t = await run(() => App.setCampTab('msgs'), 300); chk('Campaign page: messages out (or where it stands) on top; Overview, Messages, Accounts; messages edited once for every account, with a preview', !!(await p.$('.cp-hero')) && /Nothing sent yet/.test(ov) && /Delivery by step/i.test(ov) && /One sequence for/i.test(t) && !!(await p.$('.camp-pvt')) && (await p.$$('.tedit textarea')).length >= 3, 'Campaigns › campaign');
  if (full) { t = await run(() => { App.goCampaign(null); App.modTab('plays'); }, 500); await p.evaluate(() => App.corpus(0)); await p.waitForTimeout(200); t = await body(); chk('Plays: play vs campaign vs action explained; past campaigns open on click', /Play, campaign or next best action/.test(t) && /What worked/.test(t) && /Start a campaign from this/.test(t), 'Campaigns › Plays'); }
  await p.evaluate(() => App.nav(null)); await p.waitForTimeout(300);
  // round 11: questions from anywhere; ICP interview; recommendation follows the answers
  await p.evaluate(() => App.nav(null)); await p.waitForTimeout(300); await p.evaluate(() => App.ask('Build the campaign')); await p.waitForTimeout(2800);
  chk('"Build the campaign" from Today opens the questions first', (await p.evaluate(() => location.hash)) === '#campaigns' && (await p.$eval('.qd-nav span', e => e.textContent).catch(() => '')) === '1 of 5', 'Campaigns and NBA');
  await p.evaluate(() => { App.outAns('obj', 'Win the switch at contract end', 0); }); await p.waitForTimeout(300); await p.evaluate(() => App.qdGo(4)); await p.waitForTimeout(200);
  chk('Content recommendation follows the answers (switch at contract end → a one-pager or whitepaper)', /Recommended · (PDF one-pager|Whitepaper)/.test(await p.$eval('.qd .qd-r .qd-t i', e => e.textContent).catch(() => '')), 'Campaigns and NBA'); await p.evaluate(() => App.outCancel());
  await p.evaluate(() => App.nav('accounts')); await p.waitForTimeout(600); await p.evaluate(() => App.ask('Build our ICP and find leads')); await p.waitForTimeout(2500);
  chk('ICP interview on Leads, in the dock', !!(await p.$('.qd')) && !(await p.$('.icq')) && (await p.$eval('.qd-nav span', e => e.textContent).catch(() => '')) === '1 of 5' && /What do you sell/.test(await p.$eval('.qd .qd-h b', e => e.textContent).catch(() => '')), 'Leads');
  await p.evaluate(() => { App.icpAns('ind', 'Refining', 1); App.icpAns('geo', 'Malaysia', 1); App.icpAns('roles', 'Reliability leader', 1); App.icpBuild(); }); await p.waitForTimeout(600);
  chk('ICP interview saves a new ICP version and finds the leads', /ICP v\d+ leads/.test(await p.$eval('.ld-h b', e => e.textContent).catch(() => '')) && (await p.$$eval('#main .tbl tbody tr', x => x.length)) >= 10, 'Leads');
  await p.evaluate(() => App.ask('Our product page is vantera.example/products/migration')); await p.waitForTimeout(2500);
  chk('ICP drafted from a web page, every answer pre-picked for review', /ICP drafted from vantera\.example/i.test(await p.$eval('.qd .qd-k', e => e.textContent).catch(() => '')) && (await p.$$('.qd-rv .qd-r')).length === 5, 'Leads'); await p.evaluate(() => { App.icpCancel(); App.nav(null); }); await p.waitForTimeout(300);
  // round 13: questions before routing; content opens the asset; one question at a time
  await p.evaluate(() => { App.nav(null); App.newChat(); }); await p.waitForTimeout(400);
  for (const x of ['Find prospects like my last 10 wins', 'Score this list']) { await p.evaluate(v => App.ask(v), x); await p.waitForTimeout(4500); }
  await p.evaluate(() => App.ask('Route to NBA and NBC')); await p.waitForTimeout(3000);
  chk('Route to NBA and NBC asks first, only what is needed (objective, channels, steps, content), in the dock', (await p.$eval('.qd-nav span', e => e.textContent).catch(() => '')) === '1 of 4' && !(await p.$('.route')) && !(await p.$('#thread .rq')), 'Chat › routing');
  await p.click('.qd .qd-r >> nth=0'); await p.waitForTimeout(300); chk('Picking an answer moves to the next question', (await p.$eval('.qd-nav span', e => e.textContent).catch(() => '')) === '2 of 4', 'Chat › routing');
  await p.evaluate(() => App.qdGo(99)); await p.waitForTimeout(300); chk('Review shows every answer before it routes', (await p.$$('.qd-rv .qd-r')).length === 4, 'Chat › routing');
  await p.evaluate(() => App.rqGo()); await p.waitForTimeout(4500); chk('Routed result shows the answers and the content, linked', !!(await p.$('.rq-ans')) && (await p.$$('.route .as-open')).length >= 1, 'Chat › routing');
  const ct = await p.$eval('.route .as-open', e => e.textContent); await p.click('.route .as-open'); await p.waitForTimeout(800);
  chk('Clicking the content opens that asset in Content studio', (await p.evaluate(() => location.hash)) === '#studio' && (await p.$eval('.cv-t', e => e.textContent).catch(() => '')) === ct, 'Content studio');
  await p.evaluate(() => App.nav(null)); await p.waitForTimeout(300);
  // round 14: prospecting follows the prompt
  await p.evaluate(() => { App.nav(null); App.newChat(); }); await p.waitForTimeout(300); await p.evaluate(() => App.ask('Find prospects for refineries in Thailand with a new reliability leader')); await p.waitForTimeout(5000);
  chk('Find prospects builds the list from the prompt (place, industry, role, signal), not lookalikes', /Thailand/.test(await body()) && /new leader in the team/i.test(await body()) && !/last 10 wins · scored/i.test(await body()), 'Chat › prospecting');
  await p.evaluate(() => { App.nav(null); App.newChat(); }); await p.waitForTimeout(300); await p.evaluate(() => App.ask('Find prospects')); await p.waitForTimeout(3000);
  chk('Find prospects with nothing to go on starts the ICP interview', !!(await p.$('.qd')) && /Who should I look for/.test(await body()), 'Chat › prospecting'); await p.evaluate(() => { App.qdClose(); App.nav(null); }); await p.waitForTimeout(300);
  // round 15: Other answers; micro-segments in Campaigns and NBA; a list's next best actions open in their micro-segments
  await p.evaluate(() => { App.nav('campaigns'); }); await p.waitForTimeout(600);
  chk('Micro-segments is a tab in Campaigns and NBA', (await p.$$eval('.mod-tabs button', x => x.map(e => e.textContent))).includes('Micro-segments'), 'Campaigns and NBA');
  await p.evaluate(() => App.ask('Build the campaign')); await p.waitForTimeout(2800); await p.fill('#qdOther', 'Get them to a site visit'); await p.press('#qdOther', 'Enter'); await p.waitForTimeout(400);
  chk('A Something else answer is kept and moves to the next question', (await p.$eval('.qd-nav span', e => e.textContent).catch(() => '')) === '2 of 5' && await p.evaluate(() => { App.qdGo(0); return [...document.querySelectorAll('.qd .qd-r.on .qd-t b')].some(e => e.textContent === 'Get them to a site visit'); }), 'Campaigns and NBA'); await p.evaluate(() => App.outCancel());
  await p.evaluate(() => { App.nav(null); App.newChat(); }); await p.waitForTimeout(300);
  for (const x of ['Find prospects like my last 10 wins', 'Score this list']) { await p.evaluate(v => App.ask(v), x); await p.waitForTimeout(4500); }
  await p.evaluate(() => App.ask('Route to NBA and NBC')); await p.waitForTimeout(3000); await p.evaluate(() => { App.rqAns('obj', 'Book meetings', 0); App.rqGo(); }); await p.waitForTimeout(4500);
  await p.click('.route button:has-text("Open next best actions")'); await p.waitForTimeout(800);
  chk('"Open next best actions" opens the micro-segments with those actions', (await p.evaluate(() => location.hash)) === '#segments' && (await p.$$('#main .srow')).length >= 1 && /From your list/.test(await body()), 'Campaigns and NBA › Micro-segments');
  await p.evaluate(() => { App.sgOnlyClear(); App.nav(null); }); await p.waitForTimeout(300);
  // round 16: add to campaign asks one thing; cohorts; one view per campaign; page chats are sessions; quick actions wait
  await p.evaluate(() => { App.nav(null); App.newChat(); }); await p.waitForTimeout(300);
  for (const x of ['Find prospects like my last 10 wins', 'Score this list']) { await p.evaluate(v => App.ask(v), x); await p.waitForTimeout(4500); }
  await p.evaluate(() => App.addToCampaign()); await p.waitForTimeout(300);
  chk('Add to campaign asks one thing: which campaign (or a new one)', /to which campaign/.test(await p.$eval('.qd .qd-h b', e => e.textContent).catch(() => '')) && !(await p.$('.qd-nav')) && (await p.$$('.qd .qd-r:not(.qd-other)')).length >= 3, 'Chat › list');
  await p.click('.qd .qd-r >> text=Rival contract ending'); await p.waitForTimeout(500); t = await run(() => App.goCampaign('c2', 'coh'), 700);
  chk('A campaign runs several cohorts; the list joined as one', (await p.$$('.coh')).length >= 3 && /Lookalikes of your last 10 wins/.test(t), 'Campaigns › cohorts');
  t = await run(() => App.openSegment('s2'), 700); chk('A campaign micro-segment opens the campaign itself (one view), no "Proven" card', !!(await p.$('.cp-hero')) && !/from the outcome cache/.test(t), 'Campaigns');
  await p.evaluate(() => App.nav('accounts')); await p.waitForTimeout(600); await p.evaluate(() => App.ask('Find refineries in Thailand with a new reliability leader')); await p.waitForTimeout(5000);
  chk('A conversation on a page becomes its own chat in Recent chats', /Reliability managers · Bangkok/.test(await p.innerText('.side-recent')), 'Chat sessions');
  await p.evaluate(() => { App.nav(null); App.newChat(); }); await p.waitForTimeout(300); await p.evaluate(() => { const b = [...document.querySelectorAll('.dd-i')].find(x => /Find prospects/.test(x.textContent)); b.click(); }); await p.waitForTimeout(300);
  chk('Find prospects is selected in Start something new and waits for the prompt', /Find prospects/.test(await p.$eval('.cmp-pill', e => e.textContent)) && (await p.inputValue('#composer')) === '' && (await p.$$('#thread .msg.me')).length === 0, 'Chat'); await p.evaluate(() => App.actClear());
  await p.evaluate(() => { document.getElementById('composer').value = ''; App.nav(null); }); await p.waitForTimeout(300);
  // round 17: pages start with a fresh chat; cohort switcher scopes the campaign
  await p.evaluate(() => App.nav('accounts')); await p.waitForTimeout(500); await p.evaluate(() => App.ask('Find refineries in Malaysia with a new plant head')); await p.waitForTimeout(5000); await p.evaluate(() => App.nav(null)); await p.waitForTimeout(300); await p.evaluate(() => App.nav('accounts')); await p.waitForTimeout(600);
  chk('A page opens with a fresh chat; the earlier one is in Recent chats', (await p.$$('#thread .msg.me')).length === 0 && /Heads of Operations · Kuala Lumpur/.test(await p.innerText('.side-recent')), 'Chat sessions');
  t = await run(() => App.goCampaign('c2'), 800); await p.evaluate(() => App.campCoh('w1')); await p.waitForTimeout(300);
  chk('Cohort switcher scopes the campaign page (numbers, delivery, accounts)', (await p.$$('.coh-chip')).length >= 3 && /10 of 15 messages sent/.test(await p.innerText('.cp-big')) && await p.evaluate(() => { App.setCampTab('acc'); return document.querySelectorAll('#main .tbl tbody tr').length === 5; }), 'Campaigns › cohorts');
  await p.evaluate(() => { App.campCoh('all'); App.nav(null); }); await p.waitForTimeout(300);
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
