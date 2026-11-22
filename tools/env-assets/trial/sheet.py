#!/usr/bin/env python3
"""sheet.py out.jpg "label=prefix" ["label=prefix" ...]
One row per model: its _far, _back, _door, _close renders (from render_trial.py) side by side, labelled."""
import sys
from PIL import Image, ImageDraw
out, rows = sys.argv[1], [x.split('=', 1) for x in sys.argv[2:]]
S = 400; cols = ('far', 'back', 'door', 'close')
m = Image.new('RGB', (S * 4, S * len(rows)), 'white'); d = ImageDraw.Draw(m)
for r, (lab, p) in enumerate(rows):
    for c, k in enumerate(cols):
        try: im = Image.open(f'{p}_{k}.png').convert('RGB').resize((S, S))
        except FileNotFoundError: continue
        m.paste(im, (c * S, r * S))
    d.rectangle((0, r * S, 9 * len(lab) + 10, r * S + 18), fill='black'); d.text((5, r * S + 4), lab, fill='white')
m.save(out, quality=85); print(out)
