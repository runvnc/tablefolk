#!/usr/bin/env python3
"""Ground-cover atlas: four grass tufts and three wildflower clumps (1024 px RGBA).

    python3 -I tools/blender/make-cover-atlas.py [#rrggbb]   -> work/env-nature/cover/cover_atlas.png

The tufts' mean colour is matched to grass_meadow's (the hex given, else the
mean_hex of grass_meadow in assets/textures/env/manifest.json) so they sit in
the ground instead of floating on it as darker, bluer bundles.
Layout (pixels): tufts 512 x 384 at (0,0) (512,0) (0,384) (512,384);
flowers 341 x 256 along the bottom: daisy (0,768), yellow (341,768), blue (682,768).
Tufts are drawn blade by blade (no source images). Flower heads come from
Poly Haven's celandine_01 (CC0): its yellow flower, and the same flower
recoloured white (daisy-like, yellow eye) and violet-blue.
"""
import os, sys, json, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import leaf_parts as L

OUT = os.path.join(L.ROOT, 'work', 'env-nature', 'cover')
SS = 3
TUFT = (512, 384)
FLOWER = (341, 256)


def meadow_hex():
    if len(sys.argv) > 1: return sys.argv[1]
    m = os.path.join(L.ROOT, 'assets', 'textures', 'env', 'manifest.json')
    try:
        man = json.load(open(m))
        items = man['materials'] if isinstance(man, dict) and 'materials' in man else man
        for it in (items.values() if isinstance(items, dict) else items):
            if it.get('name') == 'grass_meadow':
                return it.get('mean_hex') or it.get('meanColor') or it.get('mean_colour_hex')
    except Exception as e: print('no meadow manifest:', e)
    return '#5d7134'


def blade(dr, x0, y0, L_, w0, ang, bend, base, tip, segs=12):
    pts = []; x, y = x0, y0
    for k in range(segs + 1):
        t = k / segs; a = ang + bend * t * t
        pts.append((x, y, t)); x += math.sin(a) * L_ / segs; y -= math.cos(a) * L_ / segs
    for k in range(segs):
        (xa, ya, ta), (xb, yb, tb) = pts[k], pts[k + 1]
        nx, ny = -(yb - ya), (xb - xa); nl = math.hypot(nx, ny) or 1; nx /= nl; ny /= nl
        wa, wb = w0 * (1 - ta) ** 0.7, w0 * (1 - tb) ** 0.7
        c = tuple(int(base[j] + (tip[j] - base[j]) * ta ** 0.9) for j in range(3))
        dr.polygon([(xa - nx * wa, ya - ny * wa), (xa + nx * wa, ya + ny * wa), (xb + nx * wb, yb + ny * wb), (xb - nx * wb, yb - ny * wb)], fill=(*c, 255))
    return pts[-1]


def tuft(kind, seed, target):
    random.seed(seed); W, H = TUFT[0] * SS, TUFT[1] * SS
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(img)
    t = np.array(target, float)
    n, hmin, hmax, wmin, wmax, spread, bendk, xs = {
        'fine':   (190, 0.45, 0.95, 1.6, 3.0, 14, 0.45, 0.09),
        'wispy':  (110, 0.6, 0.97, 1.4, 2.4, 13, 0.6, 0.07),
        'clump':  (240, 0.25, 0.6, 1.8, 3.2, 28, 0.5, 0.13),
        'broad':  (46, 0.4, 0.92, 4.5, 7.5, 19, 0.7, 0.06),
    }[kind]
    tips = []
    for i in range(n):
        x0 = W / 2 + random.gauss(0, W * xs); y0 = H * 0.995
        ang = math.radians(max(-2 * spread, min(2 * spread, random.gauss(0, spread)))); L_ = H * random.uniform(hmin, hmax)
        bend = random.gauss(0, bendk) + (0.35 * math.copysign(1, ang) if abs(ang) > 0.3 else 0)
        dry = random.random() < (0.16 if kind != 'broad' else 0.05)
        jit = random.uniform(0.85, 1.15)
        base = t * 0.55 * jit; tip = t * np.array([1.25, 1.25, 1.1]) * jit
        if dry: tip = np.array([196, 182, 120]) * random.uniform(0.8, 1.0); base = t * 0.7
        tips.append(blade(dr, x0, y0, L_, SS * random.uniform(wmin, wmax), ang, bend, base, tip))
    if kind == 'wispy':   # a few seed heads
        for (x, y, _) in random.sample(tips, 14):
            for k in range(7):
                ex, ey = x + random.gauss(0, 3 * SS), y + k * 4 * SS
                dr.ellipse([ex - 2.4 * SS, ey - 4.5 * SS, ex + 2.4 * SS, ey + 4.5 * SS], fill=(176, 160, 104, 255))
    im = img.resize(TUFT, Image.LANCZOS)
    return match_mean(im, t)


def match_mean(im, target, k=1.0):
    a = np.array(im).astype(float); m = a[..., 3] > 128
    mean = a[m][:, :3].mean(0)
    a[..., :3] *= (1 - k) + k * target / np.maximum(mean, 1)
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def flower_clump(heads, colourise, seed, target, leaves):
    random.seed(seed); W, H = FLOWER[0] * SS, FLOWER[1] * SS
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(img)
    t = np.array(target, float)
    # a few leaves and grass blades at the foot
    for i in range(26):
        blade(dr, W / 2 + random.gauss(0, W * 0.12), H * 0.995, H * random.uniform(0.2, 0.45), SS * random.uniform(1.6, 3), math.radians(random.gauss(0, 30)), random.gauss(0, 0.6), t * 0.55, t * 1.15)
    nh = random.randint(5, 7)
    for i in range(nh):
        x1 = W / 2 + random.gauss(0, W * 0.2); y1 = H * random.uniform(0.08, 0.45)
        x0 = W / 2 + random.gauss(0, W * 0.06)
        dr.line([(x0, H), ((x0 + x1) / 2 + random.gauss(0, 8 * SS), (H + y1) / 2), (x1, y1)], fill=tuple(int(v) for v in t * 0.8) + (255,), width=int(1.6 * SS))
        f = colourise(random.choice(heads)); sz = int(H * random.uniform(0.16, 0.24))
        f = f.resize((sz, sz), Image.LANCZOS).rotate(random.uniform(0, 360))
        # seen a little from the side: squash
        f = f.resize((sz, int(sz * random.uniform(0.55, 0.8))), Image.LANCZOS)
        img.alpha_composite(f, (int(x1 - f.size[0] / 2), int(y1 - f.size[1] / 2)))
    return img.resize(FLOWER, Image.LANCZOS)


def recolour(rgb_petal, eye=(214, 170, 52)):
    def f(im):
        a = np.array(im).astype(float); l0 = a[..., :3].mean(2, keepdims=True); lum = l0 / max(1.0, np.percentile(l0[a[..., 3] > 128], 92))
        out = np.clip(lum * np.array(rgb_petal, float), 0, 255)
        h, w = a.shape[:2]; yy, xx = np.mgrid[:h, :w]; r = np.hypot(xx - w / 2, yy - h / 2) / (min(h, w) / 2)
        eyem = (r < 0.2)[..., None]
        out = np.where(eyem, np.array(eye, float) * np.clip(lum, 0.6, 1.2), out)
        a[..., :3] = out; return Image.fromarray(a.astype(np.uint8))
    return f


def main():
    os.makedirs(OUT, exist_ok=True)
    hx = meadow_hex().lstrip('#'); target = tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4))
    print('meadow mean', target)
    os.makedirs(OUT, exist_ok=True); json.dump({'hex': '#' + hx}, open(f'{OUT}/meadow.json', 'w'))
    A = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    for i, (k, sd) in enumerate((('fine', 1), ('wispy', 2), ('clump', 3), ('broad', 4))):
        A.alpha_composite(tuft(k, sd, target), ((i % 2) * 512, (i // 2) * 384))
    cel = L.parts('celandine_01', green=False)
    heads = [cel[i] for i in (1, 2, 3)]
    leaves = []
    for i, (col, sd) in enumerate((((246, 242, 232), 11), (None, 12), ((128, 112, 214), 13))):
        fn = (lambda im: im) if col is None else recolour(col, (214, 170, 52) if i == 0 else (236, 220, 150))
        A.alpha_composite(flower_clump(heads, fn, sd, target, leaves), (i * 341, 768))
    # bleed colour under transparent texels
    rgb = np.array(A.convert('RGB')).astype(float); al = np.array(A.getchannel('A'))
    bl = np.array(A.filter(ImageFilter.GaussianBlur(10))).astype(float)
    with np.errstate(invalid='ignore', divide='ignore'):
        fill = np.nan_to_num(bl[..., :3] / (bl[..., 3:] / 255.0)).clip(0, 255)
    fill[bl[..., 3] < 3] = np.array(target, float)
    out = np.where((al > 8)[..., None], rgb, fill).astype(np.uint8)
    res = Image.fromarray(out); res.putalpha(Image.fromarray(al)); res.save(f'{OUT}/cover_atlas.png')
    bg = Image.new('RGBA', res.size, tuple(target) + (255,)); bg.alpha_composite(res); bg.convert('RGB').save(f'{OUT}/cover_atlas_on_meadow.jpg', quality=88)
    tufts = np.array(res)[:768]; m = tufts[..., 3] > 128
    print('tuft mean', tufts[m][:, :3].mean(0).astype(int))


if __name__ == '__main__': main()
