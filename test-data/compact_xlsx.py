"""Shrinks a workbook without changing a cell, so the sample dataset stays under Azure Repos' 1 MB file limit.

openpyxl writes every text cell inline, which makes Lead_Research_Sample_Dataset.xlsx 1.6 MB. This rewrites it:

- Each inline string (<c t="inlineStr"><is>X</is></c>) moves to xl/sharedStrings.xml, copied byte for byte, and the
  cell keeps only its index (<c t="s"><v>i</v></c>). The most used strings come first, so they get the shortest
  indices. Blank typed cells (<c t="inlineStr" />) are left as they are.
- A cell's reference (r="B10") is dropped when the cell is in the column right after the previous one in its row:
  ECMA-376 makes it optional, and Excel, SheetJS and openpyxl then take the next column. Rows keep theirs, and so
  does any cell after a gap.
- Every part is recompressed at deflate level 9, in the original order with the original timestamps.

Values, types, styles and sheets are unchanged (checked cell by cell with SheetJS on 30 Oct 2026: 1.6 MB to 0.5 MB).

Usage: python3 test-data/compact_xlsx.py <in.xlsx> <out.xlsx>   (the same path for both rewrites it in place)
"""
import re
import sys
import zipfile
from collections import Counter

src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as zin:
    infos = zin.infolist()
    parts = {i.filename: zin.read(i) for i in infos}
assert 'xl/sharedStrings.xml' not in parts, 'the workbook already has a shared-strings table'
sheets = [n for n in parts if n.startswith('xl/worksheets/sheet')]

CELL = re.compile(r'<c ([^>]*?)t="inlineStr"([^>]*)><is>(.*?)</is></c>', re.S)
counts: Counter[str] = Counter()
for n in sheets:
    counts.update(m.group(3) for m in CELL.finditer(parts[n].decode('utf-8')))
# Most used first; ties keep the order of first appearance (a Counter keeps insertion order).
index = {body: i for i, (body, _) in enumerate(sorted(counts.items(), key=lambda kv: -kv[1]))}


def col_number(letters: str) -> int:
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


TOKEN = re.compile(r'<row\b|<c r="([A-Z]+)\d+"')


def drop_implied_refs(text: str) -> str:
    prev = 0

    def sub(m: re.Match) -> str:
        nonlocal prev
        if m.group(0) == '<row':
            prev = 0
            return m.group(0)
        col = col_number(m.group(1))
        implied = col == prev + 1
        prev = col
        return '<c' if implied else m.group(0)

    return TOKEN.sub(sub, text)


for n in sheets:
    text = CELL.sub(lambda m: f'<c {m.group(1)}t="s"{m.group(2)}><v>{index[m.group(3)]}</v></c>', parts[n].decode('utf-8'))
    assert '<is>' not in text, n
    parts[n] = drop_implied_refs(text).encode('utf-8')

sst = ''.join(f'<si>{body}</si>' for body in index)
parts['xl/sharedStrings.xml'] = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{counts.total()}" '
    f'uniqueCount="{len(index)}">{sst}</sst>'
).encode('utf-8')

ct = parts['[Content_Types].xml'].decode('utf-8')
ct = ct.replace('</Types>', '<Override PartName="/xl/sharedStrings.xml" '
                'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')
parts['[Content_Types].xml'] = ct.encode('utf-8')

rels = parts['xl/_rels/workbook.xml.rels'].decode('utf-8')
ids = {int(n) for n in re.findall(r'Id="rId(\d+)"', rels)}
rels = rels.replace('</Relationships>', f'<Relationship Id="rId{max(ids) + 1}" '
                    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" '
                    'Target="sharedStrings.xml"/></Relationships>')
parts['xl/_rels/workbook.xml.rels'] = rels.encode('utf-8')

order = [i.filename for i in infos]
order.insert(order.index('xl/styles.xml'), 'xl/sharedStrings.xml')
times = {i.filename: i.date_time for i in infos}
with zipfile.ZipFile(dst, 'w') as zout:
    for name in order:
        zi = zipfile.ZipInfo(name, times.get(name, times['xl/styles.xml']))
        zi.compress_type = zipfile.ZIP_DEFLATED
        zout.writestr(zi, parts[name], compresslevel=9)

print(f'{dst}: {counts.total()} text cells, {len(index)} distinct strings')
