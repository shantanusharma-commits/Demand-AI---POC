"""Puts the designed cover (full-bleed photo, shade, Stratagile logo) onto slide 1 of a deck built by build_deck.js.
Usage: python3 apply_cover.py <deck.pptx>   (edits the file in place; cover files live in ../cover)"""
import os, shutil, sys, tempfile, zipfile
deck = sys.argv[1]; here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cover')
put = {'ppt/slides/slide1.xml': 'slide1.xml', 'ppt/slides/_rels/slide1.xml.rels': 'slide1.xml.rels',
       'ppt/media/cover_refinery.jpg': 'cover_refinery.jpg', 'ppt/media/stratagile_logo.png': 'stratagile_logo.png'}
tmp = tempfile.mktemp(suffix='.pptx')
with zipfile.ZipFile(deck) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename not in put: zout.writestr(item, zin.read(item.filename))
    for name, src in put.items(): zout.write(os.path.join(here, src), name)
shutil.move(tmp, deck); print('cover applied')
