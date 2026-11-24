// Content sync check: node full-mock/tools/content-sync-check.cjs <production-mock|full-mock>. Admin adds, approves and retires assets and changes a template; Content studio must show it, and a rep's saved asset must reach the admin.
const { chromium } = require('playwright');
const OUT = require('os').tmpdir() + '/';
const m = process.argv[2] || 'full-mock', base = 'file:///home/user/Demand-AI---POC/' + m + '/';
(async () => {
  const b = await chromium.launch(); const E = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => E.push(e.message)); await p.route(/fonts|cdnjs/, r => r.abort());
  await p.goto(base + 'index.html'); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('dmock_user', 'rajiv'); localStorage.setItem('demandai_role', 'Admin'); });
  // admin: assets
  await p.goto(base + 'admin/07-content.html?tab=content'); await p.waitForTimeout(800);
  console.log('admin tabs:', await p.$$eval('.ftab', x => x.map(e => e.textContent.trim()).join(' | ')));
  console.log('admin assets rows:', await p.$$eval('.as-t tbody tr', x => x.length));
  if (m === 'full-mock') await p.screenshot({ path: OUT + 'lib-admin-assets.png' });
  await p.evaluate(() => asSet('l3', 'Completed')); await p.evaluate(() => asSet('l7', 'Retired'));
  await p.evaluate(() => asAdd()); await p.waitForTimeout(200); await p.fill('#asT', 'How a peer refinery cut restart delays by a third'); await p.selectOption('#asY', 'PDF one-pager'); await p.selectOption('#asS', 'Turnaround season 2027');
  if (m === 'full-mock') await p.screenshot({ path: OUT + 'lib-admin-add.png' });
  await p.evaluate(() => asAddSave()); await p.waitForTimeout(300);
  // admin: templates
  await p.evaluate(() => go('templates')); await p.waitForTimeout(300);
  if (m === 'full-mock') await p.screenshot({ path: OUT + 'lib-admin-templates.png' });
  await p.evaluate(() => tplDefault('t5')); await p.waitForTimeout(200);
  console.log('templates rows:', await p.$$eval('.tp-r', x => x.length));
  // studio as a rep
  await p.evaluate(() => { localStorage.setItem('dmock_user', 'sofia'); localStorage.setItem('demandai_role', 'Sales rep'); });
  await p.goto(base + 'app.html'); await p.waitForTimeout(500); await p.evaluate(() => App.nav('studio')); await p.waitForTimeout(500);
  const names = await p.$$eval('.lib-tbl tbody tr', x => x.map(r => r.innerText.split('\n')[0]));
  console.log('studio sees admin asset:', names.some(n => /restart delays by a third/.test(n)), '| retired gone:', !names.some(n => /Scope expansion automation/.test(n)), '| l3 approved:', await p.evaluate(() => (window.CONTENT_LIB.all().find(a => a.id === 'l3') || {}).st));
  console.log('whitepaper tile template:', await p.$eval('.st-ft', e => e.innerText.replace(/\n/g, ' · ')));
  if (m === 'full-mock') await p.screenshot({ path: OUT + 'lib-studio.png' });
  await p.evaluate(() => { App.setStudioType('Whitepaper'); App.studioGo('A whitepaper on turnaround readiness for refinery operations managers'); }); await p.waitForTimeout(400);
  console.log('doc template badge:', await p.$eval('.doc-tags', e => e.innerText.replace(/\n/g, ' | ')));
  await p.evaluate(() => App.addToLibrary()); await p.waitForTimeout(200);
  // admin sees the rep's asset to approve
  await p.evaluate(() => { localStorage.setItem('dmock_user', 'rajiv'); localStorage.setItem('demandai_role', 'Admin'); });
  await p.goto(base + 'admin/07-content.html?tab=content'); await p.waitForTimeout(800);
  await p.evaluate(() => { ASF = 'To approve'; render(); }); await p.waitForTimeout(200);
  console.log('admin To approve:', await p.$$eval('.as-t tbody tr', x => x.map(r => r.innerText.split('\n')[0])));
  console.log('recent changes:', await p.$$eval('.as-log span:first-child', x => x.slice(0, 5).map(e => e.textContent)));
  console.log('errors', E); await b.close();
})();
