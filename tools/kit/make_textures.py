#!/usr/bin/env python3
"""Building-kit texture set (2026-11-27): grades the Patina PBR sets in work/kit/mat/<name>/ (and the
CC0 plaster_aged from assets/textures/env) to one warm palette and writes work/kit/tex/:
  <name>_color.jpg (sRGB), <name>_normal.png (OpenGL +Y, as Patina gives it), <name>_rough.jpg
at 1024 px (the trim strip 1024 x 256), plus a manifest (tileMeters: the size one repeat covers in
game units, 1 square = 1 unit). Grading: the image is scaled per channel so its mean is the target
colour (sRGB), then large-scale tone is flattened a little (so repeats do not show).
  python3 tools/kit/make_textures.py
"""
import os, glob, json
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAT, OUT, ENV = (os.path.join(ROOT, p) for p in ('work/kit/mat', 'work/kit/tex', 'assets/textures/env'))
# name: (source, target mean sRGB, tileMeters [u, v], flatten 0..1)
SETS = {
    'plaster':    ('env:plaster_aged', (206, 190, 158), [3.0, 3.0], .5),
    'fieldstone': ('fieldstone', (128, 121, 110), [2.2, 2.2], .2),
    'quoin':      ('quoin', (150, 143, 130), [2.4, 2.4], .2),
    'thatch':     ('thatch', (160, 126, 66), [2.0, 2.0], .3),
    'shingle':    ('shingle', (98, 88, 78), [1.6, 1.6], .3),
    'floor':      ('floor', (112, 82, 58), [2.0, 2.0], .2),
    'siding':     ('siding', (118, 96, 74), [2.0, 2.0], .3),
    'timber':     ('timber', (76, 58, 44), [2.0, .5], .2),
}


def load(src, kind):
    if src.startswith('env:'):
        n = src[4:]; f = {'basecolor': 'color', 'normal': 'normal', 'roughness': 'rough'}[kind]
        return Image.open(f'{ENV}/{n}_{f}.webp')
    return Image.open(glob.glob(f'{MAT}/{src}/*_{kind}.png')[0])


def grade(im, target, flat):
    a = np.asarray(im.convert('RGB'), np.float32) / 255
    lin = a ** 2.2
    if flat:   # even out the low-frequency luminance a little (wrap-around blur keeps it tileable)
        h, w = lin.shape[:2]; L = lin.mean(2); r = max(h, w) / 8
        fy, fx = np.fft.fftfreq(h)[:, None], np.fft.fftfreq(w)[None, :]   # periodic gaussian blur
        bl = np.real(np.fft.ifft2(np.fft.fft2(L) * np.exp(-2 * (np.pi * r) ** 2 * (fx * fx + fy * fy))))
        lin = lin * ((bl.mean() / np.maximum(bl, 1e-3)) ** flat)[..., None]
    t = (np.array(target, np.float32) / 255) ** 2.2
    lin = lin * (t / lin.reshape(-1, 3).mean(0))
    return Image.fromarray((np.clip(lin, 0, 1) ** (1 / 2.2) * 255 + .5).astype(np.uint8))


def main():
    os.makedirs(OUT, exist_ok=True); man = {}
    for name, (src, target, tile, flat) in SETS.items():
        size = (1024, 256) if name == 'timber' else (1024, 1024)
        grade(load(src, 'basecolor'), target, flat).resize(size, Image.LANCZOS).save(f'{OUT}/{name}_color.jpg', quality=92)
        load(src, 'normal').convert('RGB').resize(size, Image.LANCZOS).save(f'{OUT}/{name}_normal.png')
        load(src, 'roughness').convert('L').resize(size, Image.LANCZOS).save(f'{OUT}/{name}_rough.jpg', quality=92)
        man[name] = {'tileMeters': tile, 'source': src if src.startswith('env:') else 'fal-ai/patina/material', 'mean': target}
        print(name, size)
    json.dump(man, open(f'{OUT}/manifest.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
