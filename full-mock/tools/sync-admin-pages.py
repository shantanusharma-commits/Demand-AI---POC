"""Copy the legacy prototype pages into production-mock/admin/ as the admin console.

legacy/ is never modified. Each copy gets the admin sidebar, is fixed to the Admin role, and links
that pointed at the old Today page go to the admin home instead. The admin pages written for the mock
(index.html, integrations.html, settings.html) get the same sidebar through an <!--ADMIN_NAV--> marker.

Run from the repository root after legacy/ changes:  python3 production-mock/tools/sync-admin-pages.py
"""
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEGACY = os.path.join(ROOT, 'legacy')
ADMIN = os.path.join(ROOT, 'production-mock', 'admin')

LEGACY_PAGES = ['07-content.html', '08-users.html', '09-setup.html', '10-prospecting.html', '11-scoring.html',
                '12-nba.html', '13-analytics.html', '14-review.html', '15-content-studio.html']
LEGACY_SCRIPTS = ['demandai-content.js', 'demandai-copilot.js', 'demandai-engine.js', 'demandai-logos.js',
                  'demandai-nba.js', 'demandai-sample-data.js']
MOCK_PAGES = ['index.html', 'integrations.html', 'settings.html']

ICONS = {
    'home': '<path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    'gear': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    'plug': '<path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
    'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    'pen': '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    'sliders': '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    'users': '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    'pulse': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    'bolt': '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    'check': '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    'bars': '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
}

NAV = [
    (None, [('index.html', 'Admin home', 'home')]),
    ('Set up', [('09-setup.html', 'Data and signals', 'gear'), ('integrations.html', 'Integrations and email', 'plug'),
                ('07-content.html', 'Content library', 'book'), ('settings.html', 'Templates and settings', 'sliders'),
                ('08-users.html', 'Users and roles', 'users')]),
    ('The process behind the chat', [('10-prospecting.html', 'Prospecting', 'upload'), ('11-scoring.html', 'Account Scoring', 'pulse'),
                                     ('12-nba.html', 'Micro-segments & NBA', 'bolt'), ('15-content-studio.html', 'Content studio', 'pen'),
                                     ('14-review.html', 'Review queue', 'check')]),
    ('Measure', [('13-analytics.html', 'Analytics', 'bars')]),
]

FOOT_LINKS = ('<div style="display:flex;justify-content:space-between;gap:6px;padding:8px 8px 0;font-size:10.5px">'
              '<a href="../app.html" onclick="localStorage.setItem(\'dmock_user\',\'pavan\')" style="color:var(--brand-mid);text-decoration:none">Sales workspace →</a>'
              '<a href="../index.html" style="color:var(--r3)">Sign out</a></div>')


def nav_html(active):
    out = []
    for i, (sec, items) in enumerate(NAV):
        if i:
            out.append('    <div class="nav-div"></div>')
        if sec:
            out.append(f'    <div class="nav-sec">{sec}</div>')
        for href, label, icon in items:
            out.append(f'    <a class="nav-item {"active" if href == active else ""}" href="{href}">\n'
                       f'      <svg class="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">{ICONS[icon]}</svg>\n'
                       f'      <span class="nav-lbl">{label}</span>\n    </a>')
    return '\n'.join(out)


def patch_legacy(name, html):
    html = re.sub(r'(<div class="nav-body">\n).*?(\n  </div>\n  <div class="nav-foot">)',
                  lambda m: m.group(1) + nav_html(name) + m.group(2), html, count=1, flags=re.S)
    html = html.replace('</div>\n  </div>\n</nav>', '</div>\n    ' + FOOT_LINKS + '\n  </div>\n</nav>', 1)
    # The admin console is always the Admin role; the demo role switcher is not needed here.
    html = html.replace("localStorage.getItem('demandai_role') || 'Sales manager'", "'Admin'")
    html = html.replace("a.style.display = allowed.includes(href) ? '' : 'none';", "a.style.display = '';")
    html = html.replace('function renderRoleSwitcher(){', 'function renderRoleSwitcher(){ return;')
    html = html.replace('00-today.html', 'index.html')
    return html


def main():
    os.makedirs(ADMIN, exist_ok=True)
    for f in LEGACY_SCRIPTS:
        shutil.copyfile(os.path.join(LEGACY, f), os.path.join(ADMIN, f))
    for f in LEGACY_PAGES:
        with open(os.path.join(LEGACY, f), encoding='utf-8') as fh:
            html = patch_legacy(f, fh.read())
        with open(os.path.join(ADMIN, f), 'w', encoding='utf-8') as fh:
            fh.write(html)
    for f in MOCK_PAGES:
        path = os.path.join(ADMIN, f)
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as fh:
            html = fh.read()
        html = re.sub(r'<!--ADMIN_NAV-->.*?<!--/ADMIN_NAV-->',
                      lambda m: '<!--ADMIN_NAV-->\n' + nav_html(f) + '\n    <!--/ADMIN_NAV-->', html, flags=re.S)
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(html)
    print('admin pages synced:', len(LEGACY_PAGES), 'legacy,', len(MOCK_PAGES), 'mock')


if __name__ == '__main__':
    main()
