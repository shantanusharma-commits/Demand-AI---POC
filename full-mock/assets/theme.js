/* Appearance: the theme an admin picks in Settings > Appearance, applied to every page.
   Stored in this browser only (mock). Status colours (ready, review, blocked) never change. */
(function () {
  var T = window.DM_THEMES = {
    zinger:   { name: 'Zinger',   desc: 'Default · design system', accent: '#0FB1AB', dark: '#087571', text: '#0B1626', icons: '#2C3E50', rail: '#0B1F22', fd: 'Sora', fb: 'Plus Jakarta Sans' },
    ocean:    { name: 'Ocean',    desc: 'Calm blue',               accent: '#2563EB', dark: '#1E3A8A', text: '#0B1626', icons: '#1F2A44', rail: '#0B1530', fd: 'Space Grotesk', fb: 'Inter' },
    forest:   { name: 'Forest',   desc: 'Deep green',              accent: '#2E7D5A', dark: '#1F4D3A', text: '#0F1F17', icons: '#2C3E37', rail: '#0C1A14', fd: 'Manrope', fb: 'DM Sans' },
    plum:     { name: 'Plum',     desc: 'Violet accents · DemandAI today', accent: '#7D52A2', dark: '#5E3A80', text: '#141A21', icons: '#4A5664', rail: '#130D1C', fd: 'Sora', fb: 'Plus Jakarta Sans' },
    ember:    { name: 'Ember',    desc: 'Warm and editorial',      accent: '#C2410C', dark: '#7C2D12', text: '#1C1210', icons: '#3B2A24', rail: '#1C110C', fd: 'Source Serif 4', fb: 'IBM Plex Sans' },
    graphite: { name: 'Graphite', desc: 'Neutral, low colour',     accent: '#334155', dark: '#0F172A', text: '#0F172A', icons: '#334155', rail: '#0F141C', fd: 'Inter', fb: 'Inter' }
  };
  window.DM_DEFAULT = 'plum';
  function rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(h, t) { var c = rgb(h); return '#' + c.map(function (v) { return Math.round(v + (255 - v) * t).toString(16).padStart(2, '0'); }).join(''); }
  function lum(h) { return rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  window.DM_contrast = function (a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  var loaded = {};
  function font(f) {
    if (!f || loaded[f] || f === 'Sora' || f === 'Plus Jakarta Sans') return; loaded[f] = 1;
    var l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + f.replace(/ /g, '+') + ':wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }
  window.DM_applyTheme = function (th) {
    var r = document.documentElement.style, c = rgb(th.accent);
    r.setProperty('--brand', th.accent); r.setProperty('--brand-dk', th.dark);
    r.setProperty('--brand-lt', mix(th.accent, 0.9)); r.setProperty('--brand-mid', mix(th.accent, 0.55));
    r.setProperty('--i1', th.text); r.setProperty('--icon', th.icons);
    r.setProperty('--rail', th.rail || '#130D1C'); r.setProperty('--ract', 'rgba(' + c.join(',') + ',.24)');
    r.setProperty('--fd', '"' + th.fd + '",system-ui,sans-serif'); r.setProperty('--fb', '"' + th.fb + '",-apple-system,sans-serif');
    font(th.fd); font(th.fb);
  };
  window.DM_savedTheme = function () {
    try { var s = JSON.parse(localStorage.getItem('dmock_theme') || 'null'); if (s && s.accent) return s; } catch (e) {}
    var d = T[window.DM_DEFAULT]; return Object.assign({ key: window.DM_DEFAULT }, d);
  };
  try { var s = JSON.parse(localStorage.getItem('dmock_theme') || 'null'); if (s && s.accent) window.DM_applyTheme(s); } catch (e) {}
})();
