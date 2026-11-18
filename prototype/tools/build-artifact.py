"""Build a copy of prototype/ that can be published as a claude.ai artifact.

The artifact host wraps the main page in its own <html>/<head>/<body>, so index.html is written without those tags.
Scripts, styles, logos and the seed are published as files beside it. tools/, tests/, docs/ and the seed JSON files
(the same data as seed/seed.js) are left out.

Usage:  python3 prototype/tools/build-artifact.py <out-dir>
Prints the files map (published path -> source path) as JSON.
"""
import json
import os
import re
import shutil
import sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'tools', 'tests', 'docs'}


def strip_document(html):
    html = re.sub(r'<!doctype html>\s*', '', html, flags=re.I)
    html = re.sub(r'</?html[^>]*>\s*', '', html, flags=re.I)
    html = re.sub(r'</?head>\s*', '', html, flags=re.I)
    html = re.sub(r'</?body>\s*', '', html, flags=re.I)
    html = re.sub(r'<meta charset="utf-8">\s*', '', html)
    html = re.sub(r'<meta name="viewport"[^>]*>\s*', '', html)
    return html


def main(out):
    if os.path.exists(out):
        shutil.rmtree(out)
    files = {}
    for root, dirs, names in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            rel = os.path.relpath(os.path.join(root, name), SRC)
            if name.endswith('.md') or (rel.startswith('seed' + os.sep) and name.endswith('.json')):
                continue
            dest = os.path.join(out, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if rel == 'index.html':
                with open(os.path.join(root, name), encoding='utf-8') as f:
                    page = strip_document(f.read())
                with open(dest, 'w', encoding='utf-8') as f:
                    f.write(page)
                continue
            shutil.copyfile(os.path.join(root, name), dest)
            files[rel.replace(os.sep, '/')] = dest
    print(json.dumps(files, indent=1))


if __name__ == '__main__':
    main(sys.argv[1])
