#!/usr/bin/env python3
"""De-light a base colour texture: flatten low-frequency luminance (baked shadows and highlights) within each
material, keep the detail and each material's own lightness.

  delight.py in.png out.png [strength 0..1] [radius px at 2048]

Texels are grouped into k colour clusters (chroma and lightness, k-means on a sample); per cluster a blurred
luminance (normalized convolution: only that cluster's texels count, so dark timber never darkens the plaster
next to it in the atlas) is compared with the cluster's median, and the texel's colour is scaled by
(median / blurred)^strength, clamped to 0.6-1.6. Also used by proc.py (option delight)."""
import sys
import numpy as np

def blur(a, r):
    # three box passes ~ a Gaussian of sigma ~ r, edges clamped
    for _ in range(3):
        for ax in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(2)], mode='edge'), axis=ax, dtype=np.float64)
            a = ((np.take(c, range(2 * r + 1, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - 2 * r - 1), axis=ax)) / (2 * r + 1)).astype(np.float32)
    return a

def delight(rgb, strength=0.6, radius=40, k=6, seed=1):
    """rgb: float32 HxWx3 in 0..1 (sRGB). Returns the de-lit image."""
    H, W, _ = rgb.shape; r = max(2, int(radius * W / 2048))
    lin = np.power(np.clip(rgb, 0, 1), 2.2); L = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32) + 1e-4
    ch = rgb / np.maximum(rgb.sum(2, keepdims=True), 1e-3)          # chromaticity
    feat = np.concatenate([ch[..., :2] * 4, np.log(L)[..., None] * 0.35], 2).reshape(-1, 3)
    rng = np.random.default_rng(seed); smp = feat[rng.choice(len(feat), 20000, replace=False)]
    cen = smp[rng.choice(len(smp), k, replace=False)]
    for _ in range(12):
        lab = np.argmin(((smp[:, None] - cen[None]) ** 2).sum(2), 1)
        cen = np.array([smp[lab == j].mean(0) if (lab == j).any() else cen[j] for j in range(k)])
    lab = np.empty(len(feat), np.int32)
    for s in range(0, len(feat), 1 << 20): lab[s:s + (1 << 20)] = np.argmin(((feat[s:s + (1 << 20), None] - cen[None]) ** 2).sum(2), 1)
    lab = lab.reshape(H, W); logL = np.log(L); gain = np.zeros((H, W), np.float32)
    # work at a quarter resolution for the blur (the field is smooth), then bilinear-ish upsample by repeat+blur
    f = 4; Hs, Ws = H // f, W // f
    for j in range(k):
        m = (lab == j).astype(np.float32)
        if m.sum() < 50: gain += m; continue
        med = np.median(logL[lab == j])
        ms = m.reshape(Hs, f, Ws, f).mean((1, 3)); ls = (logL * m).reshape(Hs, f, Ws, f).mean((1, 3))
        bm = blur(ms, max(1, r // f)); bl = blur(ls, max(1, r // f)); low = bl / np.maximum(bm, 1e-4)
        g = np.exp((med - low) * strength); g = np.repeat(np.repeat(g, f, 0), f, 1)
        gain += m * np.clip(g, 0.6, 1.6)
    out = np.power(np.clip(lin * gain[..., None], 0, 1), 1 / 2.2)
    return out.astype(np.float32)

if __name__ == '__main__':
    from PIL import Image
    a = np.asarray(Image.open(sys.argv[1]).convert('RGB'), np.float32) / 255
    s = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6; rad = int(sys.argv[4]) if len(sys.argv) > 4 else 40
    Image.fromarray((delight(a, s, rad) * 255 + 0.5).astype(np.uint8)).save(sys.argv[2])
