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
  t = await adm('icp'); chk('PRO-01/02/05 ICP and cold start', /Path A/i.test(t), 'Admin › ICP and scoring');
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
  t = await run(() => App.goCampaign('c1')); chk('NBA-11/SEG-07 campaign, touch tasks', /Touch tasks by owner/i.test(t), 'Campaigns › campaign');
  if (full) {
    chk('Content in the rep menu', /Content/i.test(await p.innerText('.side-nav')), 'Menu');
    t = await run(() => App.modTab('plays')); chk('NBA-12 plays, CON-06 corpus, CON-08 swap, CMP-06 follow-up', /Campaign corpus/i.test(t) && /Swap asset/i.test(t) && /Persistent follow-up/i.test(t), 'Campaigns › Plays');
    t = await run(() => App.modTab('nba')); chk('NBA-13 live order', /Live order/i.test(t), 'Campaigns › Next best actions');
    t = await run(() => { App.nav('studio'); }); t = await run(() => App.setStudioTab('backlog')); chk('CON-07 content backlog', /could not answer/i.test(t), 'Content › Backlog');
    t = await run(() => App.openRecord('cedar', 'overview')); chk('SCR-07 own normal, SEG-05/06, SIG-10, RES-02', /own normal/i.test(t) && /Buying committee/i.test(t) && /Rival research/i.test(t), 'Account › Overview');
    t = await run(() => App.setRecTab('activity')); chk('RSP-03 lineage', /Lineage/i.test(t), 'Account › Activity');
    t = await run(() => App.nav('inbox')); chk('RSP-02 six statuses', /Further action/i.test(t) && /Wrong person/i.test(t), 'Inbox');
  }
  // manager
  await as('pavan'); t = await body(); chk('Manager Today: confirm campaign and meeting, coach', /Confirm the Eastgate meeting/i.test(t) && /Coach Marco/i.test(t), 'Manager › Today');
  chk('Manager menu has Team, no Inbox', /Team/i.test(await p.innerText('.side-nav')) && !/Inbox/i.test(await p.innerText('.side-nav')), 'Manager menu');
  t = await run(() => App.goCampaign('c1')); chk('NBA-11 manager confirms touch formats', /Confirm the format of each touch/i.test(t), 'Manager › Campaign');
  if (full) { t = await run(() => App.nav('analytics'), 600); chk('LRN-03 per 100, LRN-05 ledger, LRN-07 benchmark, RSP-03 by signal', /Results per 100 accounts/i.test(t) && /Qualified meeting ledger/i.test(t) && /benchmark/i.test(t) && /Reply rate by signal type/i.test(t), 'Manager › Team'); }
  const bad = R.filter(r => !r[1]); console.log(M, ':', R.length - bad.length, 'of', R.length, 'checks pass'); bad.forEach(r => console.log('  FAIL', r[0], '·', r[2])); console.log('  page errors:', E.length ? E : 'none');
  await b.close(); })();
