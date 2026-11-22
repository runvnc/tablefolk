#!/usr/bin/env python3
"""pose_score.py <pose dir> <name> <concept_rgba.png> <out_png> [res]
Scores pose_fit.py's silhouettes against a concept cut-out's alpha: the concept's mask is scaled (uniformly, by
the mean of the width and height ratios of the two bounding boxes) and moved onto the render's bounding box,
then IoU. Prints the five best. Writes the concept re-framed for the best camera (RGBA, res px, the same
framing as that camera's render: what Pixal3D's multi-view input needs, as it never crops or rescales views)
and <out_png>.json with that camera (c2w, fov in radians, az, el, IoU)."""
import sys, json, os, glob
import numpy as np
from PIL import Image
D, NAME, CON, OUT = sys.argv[1:5]; RES = int(sys.argv[5]) if len(sys.argv) > 5 else 1024
cams = json.load(open(os.path.join(D, NAME + '_cams.json')))['cams']
con = Image.open(CON).convert('RGBA'); ca = np.array(con)[:, :, 3] > 127
ys, xs = np.nonzero(ca); cb = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)

def place(im, rb, src_b, size, resample):
    """scale+move the region src_b of im onto bbox rb of a size x size canvas"""
    sw, sh = src_b[2] - src_b[0], src_b[3] - src_b[1]; rw, rh = rb[2] - rb[0], rb[3] - rb[1]
    k = (rw / sw + rh / sh) / 2
    nw, nh = max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))
    big = im.resize((nw, nh), resample)
    cx, cy = (src_b[0] + src_b[2]) / 2 * k, (src_b[1] + src_b[3]) / 2 * k
    tx, ty = (rb[0] + rb[2]) / 2 - cx, (rb[1] + rb[3]) / 2 - cy
    canvas = Image.new(im.mode, (size, size), (0, 0, 0, 0) if im.mode == 'RGBA' else 0)
    canvas.paste(big, (round(tx), round(ty)))
    return canvas

res = []
cm = Image.fromarray((ca * 255).astype(np.uint8))
for f, cam in cams.items():
    r = np.array(Image.open(os.path.join(D, f)))[:, :, 3] > 127
    ys, xs = np.nonzero(r)
    if len(xs) == 0: continue
    rb = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    m = np.array(place(cm, rb, cb, r.shape[0], Image.BILINEAR)) > 127
    iou = (m & r).sum() / max(1, (m | r).sum())
    res.append((iou, f, rb))
res.sort(reverse=True)
for iou, f, _ in res[:5]: print('%.3f' % iou, f)
iou, f, rb = res[0]; k = RES / np.array(Image.open(os.path.join(D, f))).shape[0]
rb = tuple(v * k for v in rb)
place(con, rb, cb, RES, Image.LANCZOS).save(OUT)
c = cams[f]; import math
json.dump(dict(file=f, iou=float(iou), az=c['az'], el=c['el'], fov_deg=c['fov'], camera_angle_x=math.radians(c['fov']), d=c['d'], c2w=c['c2w']), open(OUT + '.json', 'w'), indent=1)
