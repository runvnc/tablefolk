"""Cut single leaves, needle sprays, fronds and flowers out of Poly Haven's
CC0 plant textures (diffuse + alpha), for make-leaf-atlases.py.

Each part comes back as an RGBA PIL image standing upright (stem at the
bottom), with a few stats. Plain Python (PIL + numpy), no scipy.
"""
import os
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DL = os.path.join(ROOT, 'work', 'env-nature', 'dl', 'models')


def load(model, stem):
    """diffuse and alpha of <model>/textures/<model>_<stem>_{diff,alpha}_2k"""
    d = f'{DL}/{model}/textures/{model}_{stem}diff_2k.jpg'
    a = [f'{DL}/{model}/textures/{model}_{stem}alpha_2k.{e}' for e in ('png', 'jpg')]
    a = next(p for p in a if os.path.exists(p))
    return Image.open(d).convert('RGB'), Image.open(a).convert('L')


def components(alpha, step=4, min_px=300):
    """bounding boxes of the opaque islands (labelled on a 1/step grid)"""
    a = np.array(alpha)[::step, ::step] > 128
    lab = np.zeros(a.shape, np.int32); n = 0; out = []
    H, W = a.shape
    for y in range(H):
        for x in range(W):
            if a[y, x] and not lab[y, x]:
                n += 1; q = deque([(y, x)]); lab[y, x] = n; ys = [y]; xs = [x]
                while q:
                    cy, cx = q.popleft()
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        yy, xx = cy + dy, cx + dx
                        if 0 <= yy < H and 0 <= xx < W and a[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n; q.append((yy, xx)); ys.append(yy); xs.append(xx)
                if len(ys) * step * step >= min_px:
                    out.append(((min(xs) * step, min(ys) * step, max(xs) * step + step, max(ys) * step + step), len(ys) * step * step))
    return out


def largest_only(alpha, step=2):
    """zero the alpha of every island but the largest (bits of neighbours inside the crop box)"""
    a = np.array(alpha); m = a[::step, ::step] > 128
    H, W = m.shape; lab = np.zeros(m.shape, np.int32); best, bestn, n = 0, 0, 0
    for y in range(H):
        for x in range(W):
            if m[y, x] and not lab[y, x]:
                n += 1; q = deque([(y, x)]); lab[y, x] = n; c = 1
                while q:
                    cy, cx = q.popleft()
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                        yy, xx = cy + dy, cx + dx
                        if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n; q.append((yy, xx)); c += 1
                if c > bestn: best, bestn = n, c
    keep = np.repeat(np.repeat(lab == best, step, 0), step, 1)[:a.shape[0], :a.shape[1]]
    # grow the kept mask by a pixel so antialiased edges survive
    k2 = keep.copy(); k2[1:] |= keep[:-1]; k2[:-1] |= keep[1:]; k2[:, 1:] |= keep[:, :-1]; k2[:, :-1] |= keep[:, 1:]
    return Image.fromarray(np.where(k2, a, 0).astype(np.uint8))


def parts(model, stem='', min_px=3000, green=True, max_fill=1.0, min_fill=0.0, rotate=0, keep=None, region=None):
    """RGBA parts of one texture. green: drop bark/junk islands that are not leaf-coloured.
    rotate: degrees to turn each part so it stands upright. region: (x0,y0,x1,y1) fractions to search."""
    D, A = load(model, stem)
    if region:
        W, H = D.size; box = (int(region[0] * W), int(region[1] * H), int(region[2] * W), int(region[3] * H))
        D, A = D.crop(box), A.crop(box)
    res = []
    for (b, area) in components(A, min_px=min_px):
        w, h = b[2] - b[0], b[3] - b[1]
        fill = area / max(1, w * h)
        if fill > max_fill or fill < min_fill: continue
        rgb = np.array(D.crop(b)).astype(float); al = np.array(A.crop(b)) > 128
        if al.sum() < 50: continue
        m = rgb[al].mean(0)
        if green and not (m[1] >= m[2] * 1.05 and m[1] >= m[0] * 0.8): continue
        if green and (rgb[al].std(0).mean() < 6): continue        # smeared UV-padding strips
        im = D.crop(b).copy(); im.putalpha(largest_only(A.crop(b)))
        if rotate: im = im.rotate(rotate, expand=True, resample=Image.BICUBIC)
        res.append(im)
    if keep: res = [res[i] for i in keep if i < len(res)]
    return res


def sheet(parts_, path, cell=200):
    n = len(parts_); cols = 8; rows = (n + cols - 1) // cols
    s = Image.new('RGB', (cols * cell, max(1, rows) * cell), (190, 190, 200))
    for i, p in enumerate(parts_):
        q = p.copy(); q.thumbnail((cell - 8, cell - 8))
        s.paste(q, ((i % cols) * cell + 4, (i // cols) * cell + 4), q)
    s.save(path)
