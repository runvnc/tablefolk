#!/usr/bin/env python3
"""sheet.py out.jpg cols rows-label:files...  - a labelled grid of images (rows of equal-size tiles).
  python3 tools/kit/sheet.py out.jpg 320 "meshy:a.png,b.png" "rodin:c.png,d.png" """
import sys
from PIL import Image, ImageDraw
out, tw = sys.argv[1], int(sys.argv[2]); rows = [r.split(':', 1) for r in sys.argv[3:]]
n = max(len(f.split(',')) for _, f in rows); lab = 110
S = Image.new('RGB', (lab + n * tw, len(rows) * tw), (30, 30, 30)); d = ImageDraw.Draw(S)
for i, (name, fs) in enumerate(rows):
    d.text((6, i * tw + tw // 2), name, fill=(255, 255, 0))
    for j, f in enumerate(fs.split(',')):
        try: im = Image.open(f).convert('RGB')
        except Exception: continue
        im.thumbnail((tw, tw)); S.paste(im, (lab + j * tw, i * tw))
S.save(out, quality=88); print(out, S.size)
