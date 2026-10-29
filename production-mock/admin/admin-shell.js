/* Admin console shell: one menu for every admin page (new and legacy), the same lockup and collapse as the sales workspace. */
(function () {
  var I = {
    home: '<path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    plug: '<path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    rules: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    audit: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    up: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    pulse: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    bars: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    plane: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    spark: '<path d="M12 3l1.9 5.8L20 10l-5 3.6L16.2 20 12 16.6 7.8 20 9 13.6 4 10l6.1-1.2z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/>'
  };
  var NAV = [
    [null, [['index.html', 'Admin home', 'home']]],
    ['Set up', [['09-setup.html', 'Data and signals', 'data'], ['integrations.html', 'Integrations and email', 'plug'], ['07-content.html', 'Content library', 'book'], ['users.html', 'Users and roles', 'users']]],
    ['Govern', [['rules.html', 'Rules', 'rules'], ['14-review.html', 'Review queue', 'check'], ['audit.html', 'Audit log', 'audit'], ['settings.html', 'Settings', 'gear']]],
    ['The process behind the chat', [['chats.html', 'All chat flows', 'chat'], ['process.html#find', 'Find prospects', 'up'], ['process.html#score', 'Score', 'pulse'], ['process.html#route', 'Segment and route', 'layers'], ['process.html#nba', 'Next best actions', 'bolt'], ['process.html#campaigns', 'Campaigns', 'plane'], ['process.html#replies', 'Replies and hand-off', 'mail'], ['process.html#content', 'Content', 'pen'], ['process.html#objectives', 'Objectives and catch-up', 'flag'], ['process.html#analytics', 'Analytics', 'bars'], ['process.html#learning', 'Learning loop', 'spark']]],
    ['Measure', [['13-analytics.html', 'Analytics', 'bars']]]
  ];
  function svg(n, s) { return '<svg class="nav-ic" width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + I[n] + '</svg>'; }
  var here = (location.pathname.split('/').pop() || 'index.html');
  if (here === '08-users.html') here = 'users.html';
  var col = false; try { col = localStorage.getItem('dmock_nav') === '1'; } catch (e) {}
  function draw() {
    var nav = document.querySelector('nav.nav'); if (!nav) return;
    document.body.classList.toggle('nav-col', col);
    var h = '<div class="nav-brand"><img src="../assets/logo.png" alt="Zinger"' + (col ? ' onclick="ADM.toggleNav()" title="Expand the menu" style="cursor:pointer"' : '') + '><div class="lockup"><span class="wm">Zinger</span><i></i><span class="prod">Demand AI</span></div><button class="nav-pin" onclick="ADM.toggleNav()" title="' + (col ? 'Expand the menu' : 'Collapse the menu to icons') + '">' + svg('panel', 15) + '</button></div>';
    h += '<div class="nav-tag">Admin console</div><div class="nav-body">';
    if (col) h += '<a class="nav-item nav-exp" href="#" onclick="ADM.toggleNav();return false" title="Expand the menu">' + svg('panel') + '</a>';
    NAV.forEach(function (g, gi) {
      if (gi) h += '<div class="nav-div"></div>';
      if (g[0]) h += '<div class="nav-sec">' + g[0] + '</div>';
      var cur = here + (here === 'process.html' ? (location.hash || '#find') : '');
      g[1].forEach(function (it) { h += '<a class="nav-item ' + (it[0] === cur ? 'active' : '') + '" href="' + it[0] + '" title="' + it[1] + '">' + svg(it[2]) + '<span class="nav-lbl">' + it[1] + '</span></a>'; });
    });
    h += '</div><div class="nav-foot"><div class="nav-user"><div class="nav-av">RN</div><div class="nav-ut"><div class="nav-un">Rajiv Nair</div><div class="nav-ur">Admin</div></div></div>' +
      '<div class="nav-links"><a href="../app.html" onclick="try{localStorage.setItem(\'dmock_user\',\'pavan\')}catch(e){}">Sales workspace</a><a href="../index.html">Sign out</a></div></div>';
    nav.innerHTML = h;
  }
  window.ADM = {
    toggleNav: function () { col = !col; try { localStorage.setItem('dmock_nav', col ? '1' : ''); } catch (e) {} draw(); },
    tabs: function (root) {
      var bar = document.querySelector(root || '.a-tabs'); if (!bar) return;
      function show(t) {
        bar.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); });
        document.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = p.dataset.pane !== t; });
        try { history.replaceState(null, '', '#' + t); } catch (e) {}
        var cv = document.querySelector('.a-canvas'); if (cv) cv.scrollTop = 0;
      }
      bar.addEventListener('click', function (e) { var b = e.target.closest('button[data-t]'); if (b) show(b.dataset.t); });
      var first = bar.querySelector('button[data-t]'), want = (location.hash || '').slice(1);
      show(bar.querySelector('button[data-t="' + want + '"]') ? want : first.dataset.t);
      window.addEventListener('hashchange', function () { var w = location.hash.slice(1); if (bar.querySelector('button[data-t="' + w + '"]')) show(w); });
    }
  };
  if (!window.toast) window.toast = function (m) { document.querySelectorAll('.toast').forEach(function (t) { t.remove(); }); var t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3000); };
  window.addEventListener('hashchange', function () { if (here === 'process.html') draw(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', draw); else draw();
})();
