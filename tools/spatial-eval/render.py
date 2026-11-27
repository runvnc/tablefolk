#!/usr/bin/env python3
"""render.py MAPDIR: a top-down picture of each spatial-eval map (<id>.json -> <id>.png).

Drawn from the cell map (not rendered by the game): one coloured square a cell,
grid lines, every column and row numbered on all four edges, buildings and
places outlined and labelled. 24 px a cell, so 45 x 35 cells is about 1.2k x 0.9k px.
"""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

CELL, M = 24, 30  # cell size, margin for the numbers
COL = {'.': (150, 196, 110), ':': (196, 164, 112), '=': (176, 176, 176), '#': (90, 70, 60), '+': (230, 150, 40), 'o': (222, 205, 170),
       'H': (120, 80, 70), '~': (70, 130, 210), 'B': (150, 110, 60), '%': (40, 110, 50), 'r': (120, 120, 120), 'f': (170, 130, 80),
       '*': (210, 190, 60), 'x': (150, 100, 160)}
SYM = {'%': 'T', 'r': 'o', 'x': 'x', '+': 'D', 'f': '|'}


def font(size, bold=False):
    for p in ['/usr/share/fonts/TTF/DejaVuSans%s.ttf' % ('-Bold' if bold else ''), '/usr/share/fonts/liberation/LiberationSans-%s.ttf' % ('Bold' if bold else 'Regular')]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def render(m, out):
    W, H = m['W'], m['H']
    img = Image.new('RGB', (W * CELL + 2 * M, H * CELL + 2 * M), (255, 255, 255))
    d = ImageDraw.Draw(img)
    f_num, f_sym, f_lab = font(11), font(12, True), font(13, True)
    for y, row in enumerate(m['rows']):
        for x, ch in enumerate(row):
            x0, y0 = M + x * CELL, M + y * CELL
            d.rectangle([x0, y0, x0 + CELL - 1, y0 + CELL - 1], fill=COL.get(ch, (255, 0, 255)))
            if ch in SYM:
                d.text((x0 + CELL / 2, y0 + CELL / 2), SYM[ch], fill=(255, 255, 255) if ch in '%+' else (40, 40, 40), font=f_sym, anchor='mm')
    for x in range(W + 1):
        d.line([M + x * CELL, M, M + x * CELL, M + H * CELL], fill=(60, 60, 60) if x % 5 == 0 else (110, 110, 110), width=1)
    for y in range(H + 1):
        d.line([M, M + y * CELL, M + W * CELL, M + y * CELL], fill=(60, 60, 60) if y % 5 == 0 else (110, 110, 110), width=1)
    for x in range(W):
        cx = M + x * CELL + CELL / 2
        d.text((cx, M / 2), str(x), fill=(0, 0, 0), font=f_num, anchor='mm')
        d.text((cx, M + H * CELL + M / 2), str(x), fill=(0, 0, 0), font=f_num, anchor='mm')
    for y in range(H):
        cy = M + y * CELL + CELL / 2
        d.text((M / 2, cy), str(y), fill=(0, 0, 0), font=f_num, anchor='mm')
        d.text((M + W * CELL + M / 2, cy), str(y), fill=(0, 0, 0), font=f_num, anchor='mm')
    for p in m['places']:
        x0, y0, x1, y1 = p.get('outer') or p['rect']
        if p['kind'] not in ('road', 'water'):
            d.rectangle([M + x0 * CELL, M + y0 * CELL, M + (x1 + 1) * CELL - 1, M + (y1 + 1) * CELL - 1], outline=(255, 255, 255), width=2)
        cx, cy = M + (x0 + x1 + 1) * CELL / 2, M + (y0 + y1 + 1) * CELL / 2
        if p['kind'] == 'road':  # label the road arm near its outer end
            cx = M + (x0 + 1.5) * CELL if x0 == 0 and x1 > y1 - y0 else (M + (x1 - 1.5) * CELL if x1 == W - 1 and x1 - x0 > y1 - y0 else cx)
            cy = M + (y0 + 2.5) * CELL if y0 == 0 and y1 - y0 > x1 - x0 else (M + (y1 - 1.5) * CELL if y1 == H - 1 and y1 - y0 > x1 - x0 else cy)
        if p['kind'] == 'water':
            cy = M + (y0 + 1.5) * CELL
        bb = d.textbbox((cx, cy), p['id'], font=f_lab, anchor='mm')
        d.rectangle([bb[0] - 2, bb[1] - 1, bb[2] + 2, bb[3] + 1], fill=(255, 255, 255))
        d.text((cx, cy), p['id'], fill=(0, 0, 0), font=f_lab, anchor='mm')
    img.save(out)


if __name__ == '__main__':
    d = sys.argv[1]
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.json'):
            m = json.load(open(os.path.join(d, fn)))
            render(m, os.path.join(d, m['id'] + '.png'))
            print('wrote', m['id'] + '.png')
