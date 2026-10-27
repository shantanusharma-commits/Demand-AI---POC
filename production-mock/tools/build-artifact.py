"""Build a copy of production-mock/ that can be published as a claude.ai artifact.

The artifact host wraps the main page in its own <html>/<head>/<body>, so the sign-in page (index.html) is written
without those tags. Every other page is published as its own file and keeps its full document.

Usage:  python3 production-mock/tools/build-artifact.py <out-dir>
Prints the files map (published path -> source path) as JSON.
"""
import json
import os
import re
import shutil
import sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'tools'}
SKIP_FILES = {'README.md'}


def strip_document(html):
    html = re.sub(r'<!doctype html>\s*', '', html, flags=re.I)
    html = re.sub(r'</?html[^>]*>\s*', '', html, flags=re.I)
    html = re.sub(r'</?head>\s*', '', html, flags=re.I)
    html = re.sub(r'</?body>\s*', '', html, flags=re.I)
    html = re.sub(r'<meta charset="utf-8"/>\s*', '', html)
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
            if name in SKIP_FILES:
                continue
            dest = os.path.join(out, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if rel == 'index.html':
                with open(os.path.join(SRC, rel), encoding='utf-8') as fh:
                    page = strip_document(fh.read())
                with open(dest, 'w', encoding='utf-8') as fh:
                    fh.write(page)
                continue
            shutil.copyfile(os.path.join(SRC, rel), dest)
            files[rel.replace(os.sep, '/')] = dest
    print(json.dumps(files, indent=1))


if __name__ == '__main__':
    main(os.path.abspath(sys.argv[1]))
