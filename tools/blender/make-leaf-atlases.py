#!/usr/bin/env python3
"""Leaf-cluster atlases for the procedural trees (tools/blender/make-trees.py).

    python3 tools/blender/env-fetch.py               # once: CC0 sources from Poly Haven
    python3 -I tools/blender/make-leaf-atlases.py    # -> work/env-nature/atlases/*.png

Three 1024 px RGBA atlases, four 512 px cells each (cell order: 0 top-left,
1 top-right, 2 bottom-left, 3 bottom-right). Every cell is one spray: a twig
from the bottom centre carrying leaves, needles or fronds, so a card planted
at a twig tip grows out of it.

  broadleaf: 0 oak (small dark elliptic leaves, island_tree_01), 1 generic
             broadleaf (heart leaves, shrub_03), 2 tall tree (serrated,
             shrub_01), 3 flowering bush (shrub_04 leaves + celandine_01
             flowers turned pink and white)
  autumn:    0 orange/red heart leaves, 1 yellow-orange elliptic, 2 red bush
             with berries, 3 mixed autumn
  conifer:   0 fir spray (fir_tree_01 twigs), 1 drooping fir spray, 2 long
             pine needles (pine_tree_01), 3 two fern fronds (fern_02)

Leaves are recoloured toward a muted, warm mid-green; each leaf gets a little
hue/value jitter and leaves drawn first (behind) are darker. Transparent
texels get the nearby leaf colour (no dark fringes in mipmaps).
"""
import os, sys, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import leaf_parts as L

OUT = os.path.join(L.ROOT, 'work', 'env-nature', 'atlases')
S = 512          # cell size
SS = 2           # supersampling


def pick(lst, idx): return [lst[i] for i in idx if i < len(lst)]


def grade(im, hue=0.0, sat=1.0, val=1.0, tint=None, tint_k=0.0):
    """recolour an RGBA leaf: hue shift (0..1 of the wheel), saturation, value, optional tint blend"""
    al = im.getchannel('A'); rgb = im.convert('RGB')
    if hue:
        h, s, v = rgb.convert('HSV').split()
        h = h.point(lambda p: int(p + hue * 256) % 256); rgb = Image.merge('HSV', (h, s, v)).convert('RGB')
    if sat != 1: rgb = ImageEnhance.Color(rgb).enhance(sat)
    if val != 1: rgb = ImageEnhance.Brightness(rgb).enhance(val)
    if tint is not None and tint_k > 0:
        a = np.array(rgb).astype(float); lum = a.mean(2, keepdims=True) / 128.0
        t = np.array(tint, float)[None, None, :] * lum
        rgb = Image.fromarray(np.clip(a * (1 - tint_k) + t * tint_k, 0, 255).astype(np.uint8))
    out = rgb.copy(); out.putalpha(al); return out


def to_green(im, target=(78, 104, 46), k=0.55):
    """pull a leaf toward a target mean colour (keeps its own detail)"""
    a = np.array(im).astype(float); al = a[..., 3] > 128
    if al.sum() == 0: return im
    m = a[al][:, :3].mean(0); t = np.array(target, float)
    a[..., :3] = a[..., :3] * ((1 - k) + k * t / np.maximum(m, 1))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def place(img, part, cx, cy, length, angle_deg, shade):
    """paste a part (upright, stem at its bottom) with its stem at (cx,cy), pointing along angle (0 = up)"""
    sc = length / part.size[1]
    p = part.resize((max(2, int(part.size[0] * sc)), max(2, int(length))), Image.LANCZOS)
    p = p.rotate(-angle_deg, expand=True, resample=Image.BICUBIC)
    if shade != 1:
        al = p.getchannel('A'); p = ImageEnhance.Brightness(p.convert('RGB')).enhance(shade); p.putalpha(al)
    # the stem point moves when rotating about the centre: put it back on (cx,cy)
    r = math.radians(angle_deg); half = length / 2
    ox, oy = math.sin(r) * half, -math.cos(r) * half        # stem -> centre
    img.alpha_composite(p, (int(cx + ox - p.size[0] / 2), int(cy + oy - p.size[1] / 2)))


def twig_path(dr, x0, y0, ang, length, width, segs=8, wobble=7, colour=(72, 58, 42, 255)):
    pts = [(x0, y0)]; x, y = x0, y0; a = ang
    for _ in range(segs):
        a += random.uniform(-wobble, wobble)
        x += math.sin(math.radians(a)) * length / segs; y -= math.cos(math.radians(a)) * length / segs; pts.append((x, y))
    for i in range(segs):
        w = max(1, int(width * (1 - i / segs) + 1))
        dr.line([pts[i], pts[i + 1]], fill=colour, width=w)
    return pts


def leafy_spray(leaves, seed, n_leaves, leaf_len, twigs=5, spread=70, prep=None, extras=None, envelope=1.0):
    """a twig fanning into sub-twigs, leaves along them. Returns an S x S RGBA cell."""
    random.seed(seed); W = S * SS
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0)); dr = ImageDraw.Draw(img)
    base = (W / 2, W * 0.985)
    main = twig_path(dr, base[0], base[1], random.uniform(-6, 6), W * 0.55 * envelope, 7 * SS)
    paths = [main]
    for t in range(twigs):
        j = random.randint(2, len(main) - 2); x0, y0 = main[j]
        side = -1 if t % 2 == 0 else 1
        ang = side * random.uniform(spread * 0.4, spread) * (1 - j / len(main) * 0.4)
        paths.append(twig_path(dr, x0, y0, ang, W * random.uniform(0.28, 0.42) * envelope, 4 * SS))
    items = []
    for i in range(n_leaves):
        pts = random.choice(paths); k = random.uniform(0.1, 1.0); j = min(len(pts) - 2, int(k * (len(pts) - 1)))
        (x0, y0), (x1, y1) = pts[j], pts[j + 1]
        dirang = math.degrees(math.atan2(x1 - x0, -(y1 - y0)))
        ang = dirang + random.choice((-1, 1)) * random.uniform(20, 75)
        if j >= len(pts) - 2 and random.random() < 0.5: ang = dirang + random.uniform(-15, 15)
        L_ = leaf_len * SS * random.uniform(0.7, 1.15) * (0.75 + 0.25 * k)
        x0 += random.gauss(0, 10 * SS); y0 += random.gauss(0, 10 * SS)
        items.append((random.random(), x0, y0, ang, L_))
    items.sort()
    for depth, x0, y0, ang, L_ in items:
        lf = random.choice(leaves)
        if prep: lf = prep(lf)
        if random.random() < 0.5: lf = lf.transpose(Image.FLIP_LEFT_RIGHT)
        place(img, lf, x0, y0, L_, ang, (0.62 + 0.42 * depth) * random.uniform(0.92, 1.08))
    if extras: extras(img, paths)
    return img.resize((S, S), Image.LANCZOS)


def conifer_spray(sprays, seed, droop=0.0, side_len=0.42, n_side=7, tip=0.35, stem_col=(84, 66, 46, 255)):
    """a fir branch tip: a stem with needle sprays alternating along it, shorter toward the tip"""
    random.seed(seed); W = S * SS
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0)); dr = ImageDraw.Draw(img)
    pts = twig_path(dr, W / 2, W * 0.985, 0, W * 0.8, 6 * SS, segs=10, wobble=3, colour=stem_col)
    items = []
    for i in range(n_side):
        t = 0.08 + 0.85 * i / max(1, n_side - 1); j = min(len(pts) - 2, int(t * (len(pts) - 1)))
        x0, y0 = pts[j]; side = -1 if i % 2 == 0 else 1
        ang = side * random.uniform(48, 68) + droop * side * (1 - t)
        L_ = W * side_len * (1.05 - 0.6 * t) * random.uniform(0.85, 1.1)
        items.append((random.random(), x0, y0, ang, L_))
    items.append((1.0, *pts[-3], random.uniform(-6, 6), W * tip))
    items.sort()
    for depth, x0, y0, ang, L_ in items:
        sp = random.choice(sprays)
        if random.random() < 0.5: sp = sp.transpose(Image.FLIP_LEFT_RIGHT)
        place(img, sp, x0, y0, L_, ang, (0.72 + 0.32 * depth) * random.uniform(0.94, 1.06))
    return img.resize((S, S), Image.LANCZOS)


def berries(colour=(150, 28, 30), n=26, r=9):
    def draw(img, paths):
        dr = ImageDraw.Draw(img)
        for _ in range(n):
            pts = random.choice(paths); x, y = random.choice(pts[2:])
            for _k in range(random.randint(2, 4)):
                bx, by = x + random.gauss(0, 14 * SS), y + random.gauss(0, 14 * SS); rr = r * SS * random.uniform(0.75, 1.2)
                c = tuple(int(v * random.uniform(0.8, 1.1)) for v in colour)
                dr.ellipse([bx - rr, by - rr, bx + rr, by + rr], fill=(*[int(v * 0.55) for v in c], 255))
                dr.ellipse([bx - rr * 0.85, by - rr * 0.9, bx + rr * 0.8, by + rr * 0.75], fill=(*c, 255))
                dr.ellipse([bx - rr * 0.45, by - rr * 0.55, bx - rr * 0.1, by - rr * 0.2], fill=(*[min(255, int(v * 1.6) + 40) for v in c], 255))
    return draw


def blossoms(flowers, n=16, size=70):
    def draw(img, paths):
        for _ in range(n):
            pts = random.choice(paths); x, y = random.choice(pts[3:])
            f = random.choice(flowers)
            pink = random.random() < 0.8
            f = grade(f, sat=0.0, val=1.0, tint=(226, 150, 166) if pink else (232, 222, 210), tint_k=0.8)
            # a warm yellow eye: brighten the centre
            sz = int(size * SS * random.uniform(0.75, 1.15)); f = f.resize((sz, sz), Image.LANCZOS)
            f = f.rotate(random.uniform(0, 360), resample=Image.BICUBIC)
            d = ImageDraw.Draw(f); c = sz / 2; e = sz * 0.11
            d.ellipse([c - e, c - e, c + e, c + e], fill=(222, 182, 70, 255))
            img.alpha_composite(f, (int(x - sz / 2 + random.gauss(0, 10 * SS)), int(y - sz / 2 + random.gauss(0, 10 * SS))))
    return draw


def bleed(img):
    """fill transparent texels with the blurred leaf colour (no dark mip fringes)"""
    rgb = np.array(img.convert('RGB')).astype(float); al = np.array(img.getchannel('A'))
    acc = np.zeros_like(rgb); w = np.zeros(al.shape, float)
    for rad in (4, 16, 48):
        bl = np.array(img.filter(ImageFilter.GaussianBlur(rad))).astype(float)
        a = bl[..., 3:] / 255.0
        with np.errstate(invalid='ignore', divide='ignore'):
            c = np.nan_to_num(bl[..., :3] / a)
        m = (a[..., 0] > 0.02) & (w == 0)
        acc[m] = c[m]; w[m] = 1
    acc[w == 0] = rgb[al > 128].mean(0) if (al > 128).any() else 0
    out = np.where((al > 8)[..., None], rgb, acc).clip(0, 255).astype(np.uint8)
    res = Image.fromarray(out); res.putalpha(Image.fromarray(al)); return res


def atlas(cells):
    A = Image.new('RGBA', (2 * S, 2 * S), (0, 0, 0, 0))
    for i, c in enumerate(cells): A.alpha_composite(c, ((i % 2) * S, (i // 2) * S))
    return bleed(A)


def preview(path, im):
    bg = Image.new('RGBA', im.size, (176, 180, 190, 255)); bg.alpha_composite(im); bg.convert('RGB').save(path, quality=88)


def main():
    os.makedirs(OUT, exist_ok=True)
    island = pick(L.parts('island_tree_01', 'leaves_'), [1, 2, 3, 4, 7, 8, 9])
    heart = pick(L.parts('shrub_03', green=False), [0, 2, 4, 5, 6, 7, 8])
    serr = pick(L.parts('shrub_01', green=False), [3])
    small = pick(L.parts('shrub_04', green=False), [1, 2, 4, 5, 7, 8, 9])
    small_red = pick(L.parts('shrub_04', green=False), [3, 5, 6, 10])
    fir = pick(L.parts('fir_tree_01', 'twig_'), [1, 2, 4, 5, 6, 7, 8])
    pine = pick(L.parts('pine_tree_01', 'twig_', green=False), [1, 2])
    pine = [pine[0], pine[1].rotate(-90 if pine[1].size[0] > pine[1].size[1] else 0, expand=True)]
    fern = L.parts('fern_02', min_px=20000)
    flowers = pick(L.parts('celandine_01', green=False), [1, 2, 3])

    oakish = [grade(to_green(l, (70, 98, 38), 0.6), sat=0.95) for l in island]
    heartg = [grade(to_green(l, (76, 102, 42), 0.75), sat=0.9) for l in heart]
    serrg = [grade(to_green(l, (80, 108, 50), 0.5), sat=0.9) for l in serr]
    smallg = [grade(to_green(l, (64, 92, 38), 0.8), sat=1.0) for l in small]
    firg = [grade(to_green(l, (58, 80, 44), 0.45), sat=0.9) for l in fir]
    pineg = [grade(to_green(l, (70, 88, 46), 0.45), sat=0.9) for l in pine]
    ferng = [grade(to_green(l, (88, 118, 48), 0.6), sat=0.95) for l in fern]

    broad = atlas([
        leafy_spray(oakish, 11, 300, 74, twigs=8, spread=85, envelope=1.12),
        leafy_spray(heartg, 12, 300, 72, twigs=8, spread=85, envelope=1.12),
        leafy_spray(serrg, 13, 320, 70, twigs=8, spread=80, envelope=1.12),
        leafy_spray(smallg, 14, 260, 74, twigs=8, spread=85, envelope=1.12, extras=blossoms(flowers, 16, 44)),
    ])
    autumn_cols = [(182, 92, 36), (160, 60, 34), (196, 144, 52), (140, 76, 34)]
    def aut(l, i): return grade(to_green(l, autumn_cols[i % 4], 0.85), sat=0.9)
    aut_heart = [aut(l, i) for i, l in enumerate(heart)]
    aut_ell = [aut(l, i + 2) for i, l in enumerate(island)]
    red_small = [grade(to_green(l, (118, 44, 34) if i % 3 else (146, 80, 40), 0.8), sat=0.82) for i, l in enumerate(small + small_red)]
    autumn = atlas([
        leafy_spray(aut_heart, 21, 300, 74, twigs=8, spread=85, envelope=1.12),
        leafy_spray(aut_ell, 22, 280, 74, twigs=8, spread=85, envelope=1.12),
        leafy_spray(red_small, 23, 240, 72, twigs=8, spread=85, envelope=1.12, extras=berries(n=30)),
        leafy_spray(aut_heart + aut_ell, 24, 300, 72, twigs=8, spread=85, envelope=1.12),
    ])
    # fern cell: two fronds side by side (each a 256 x 512 strip)
    fc = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    for k, f in enumerate(ferng[:2]):
        q = f.resize((int(f.size[0] * (S * 0.98) / f.size[1]), int(S * 0.98)), Image.LANCZOS)
        fc.alpha_composite(q, (int(S / 4 + k * S / 2 - q.size[0] / 2), S - q.size[1]))
    conifer = atlas([
        conifer_spray(firg, 31, side_len=0.5, n_side=12),
        conifer_spray(firg, 32, droop=28, side_len=0.54, n_side=13),
        conifer_spray(pineg[:1] + firg[:2], 33, side_len=0.55, n_side=11, tip=0.42),
        fc,
    ])
    for name, im in (('broadleaf', broad), ('autumn', autumn), ('conifer', conifer)):
        im.save(f'{OUT}/leaves_{name}.png'); preview(f'{OUT}/leaves_{name}_preview.jpg', im)
        a = np.array(im); m = a[..., 3] > 128
        print(name, 'coverage %.2f' % m.mean(), 'mean', a[m][:, :3].mean(0).astype(int))


if __name__ == '__main__': main()
