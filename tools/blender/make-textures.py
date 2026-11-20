#!/usr/bin/env python3
"""Builds the tileable CC0 environment texture set in assets/textures/env/.

Run from the repo root (downloads go to work/env-nature/textures/dl/, git-ignored):
    python3 -I tools/blender/make-textures.py fetch            # download every source (2k)
    python3 -I tools/blender/make-textures.py build [names...] # process, write webp + manifest + LICENSE
Needs Python 3 with Pillow (WebP support) and numpy. Sources are CC0 from Poly Haven and
ambientCG; each material's recipe below names its sources, real-world tile size and colour
correction. Colour correction: in linear light, scale the channels to a target mean colour,
then mute saturation / contrast so the whole set sits together under one warm sun.
Normal maps are OpenGL (+Y green), as Poly Haven nor_gl, ambientCG NormalGL and glTF.
"""
import sys, os, json, glob, time, zipfile, urllib.request, concurrent.futures as cf
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DL = f'{ROOT}/work/env-nature/textures/dl'
OUT = f'{ROOT}/assets/textures/env'
UA = {'User-Agent': 'tablefolk-textures/1.0'}
Q = dict(color=76, normal=66, rough=50, ao=45)          # WebP qualities (size budget ~55 MB)

# name: kind, tile (m one repeat covers), src (site:id) or blend, colour target (sRGB mean), sat, contrast,
# flat: 0..1 how much of the large-scale (> ~1/6 tile) light/dark blotching to remove, so repeats do not show
R = {
    'grass_meadow':      dict(kind='ground', tile=4.2, blend='grass', target=(84, 104, 46), sat=0.9, note='blend of ambientCG Grass004 (3x3, native 1.4 m) and Grass001 (2x2, 2.1 m) through a tileable ~1 m noise mask; colour-corrected to a fresh mid-green'),
    'grass_dry':         dict(kind='ground', tile=1.4, src='acg:Grass003', target=(116, 108, 68), sat=0.75),
    'forest_floor':      dict(kind='ground', tile=3.15, src='ph:forest_ground_04', target=(92, 78, 60), sat=0.9, flat=0.6),
    'dirt_path':         dict(kind='ground', tile=2.0, src='ph:rocky_trail', target=(136, 112, 84), sat=0.85, flat=0.5),
    'mud':               dict(kind='ground', tile=2.25, src='ph:muddy_tracks', target=(84, 68, 54), sat=0.9, flat=0.5),
    'sand':              dict(kind='ground', tile=1.8, src='ph:dense_sand', target=(178, 158, 122), sat=0.9, flat=0.5),
    'gravel':            dict(kind='ground', tile=2.0, src='ph:rocks_ground_01', target=(128, 120, 108), sat=0.85, flat=0.6),
    'cobblestone':       dict(kind='ground', tile=2.4, src='ph:cobblestone_05', target=(120, 113, 102), sat=0.85, flat=0.4),
    'flagstone':         dict(kind='ground', tile=3.0, src='ph:grey_stone_path', target=(112, 109, 102), sat=0.75, flat=0.5),
    'stone_floor_rough': dict(kind='ground', tile=3.0, src='ph:rock_ground_02', target=(98, 94, 88), sat=0.8, flat=0.8),
    'wood_planks_worn':  dict(kind='ground', tile=2.0, src='ph:wood_floor_worn', target=(122, 92, 64), sat=0.85, flat=0.6),
    'wood_planks_dark':  dict(kind='ground', tile=2.0, src='ph:dark_wooden_planks', target=(72, 56, 44), sat=0.9, flat=0.4),
    'snow':              dict(kind='ground', tile=2.5, src='acg:Snow006', target=(220, 222, 226), sat=0.7),
    'farmland':          dict(kind='ground', tile=2.1, src='ph:farm_furrows', target=(100, 80, 58), sat=0.6, flat=0.3),
    'stone_wall_rubble': dict(kind='wall', tile=2.0, src='ph:stone_wall', target=(130, 122, 108), sat=0.8, flat=0.5),
    'stone_blocks_large': dict(kind='wall', tile=3.5, src='acg:Bricks076A', target=(112, 110, 104), sat=0.8, flat=0.4),
    'plaster_aged':      dict(kind='wall', tile=4.0, src='ph:plastered_wall_03', target=(196, 186, 162), sat=0.9),
    'timber_dark':       dict(kind='wall', tile=1.0, src='acg:Wood062', target=(68, 54, 42), sat=1.0),
    'brick_old':         dict(kind='wall', tile=2.0, src='ph:medieval_red_brick', target=(116, 80, 66), sat=0.5, flat=0.6),
    'thatch':            dict(kind='roof', tile=2.0, src='acg:ThatchedRoof001A', target=(146, 120, 80), sat=1.0, flat=0.4),
    'clay_roof_tiles':   dict(kind='roof', tile=2.5, src='ph:clay_roof_tiles_02', target=(126, 80, 62), sat=0.55, flat=0.4),
    'slate_roof':        dict(kind='roof', tile=1.5, src='ph:grey_roof_tiles_02', target=(84, 88, 94), sat=0.8, flat=0.8),
}

# ------------------------------------------------------------------ download
def url_of(src):
    site, i = src.split(':')
    return f'https://polyhaven.com/a/{i}' if site == 'ph' else f'https://ambientcg.com/view?id={i}'

def _get(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0: return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    for _ in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r: data = r.read()
            open(dst + '.part', 'wb').write(data); os.replace(dst + '.part', dst); return
        except Exception as e:
            print('retry', url, e, flush=True); time.sleep(4)
    raise RuntimeError('failed ' + url)

def fetch(src):
    site, i = src.split(':'); d = f'{DL}/{site}/{i}'
    if site == 'ph':
        files = json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.polyhaven.com/files/{i}', headers=UA), timeout=60))
        for m in ('Diffuse', 'nor_gl', 'Rough', 'AO'):
            if m in files and '2k' in files[m]:
                u = files[m]['2k']['jpg']['url']; _get(u, f'{d}/{os.path.basename(u)}')
    else:
        z = f'{d}/{i}_2K-JPG.zip'; _get(f'https://ambientcg.com/get?file={i}_2K-JPG.zip', z)
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                if n.endswith('.jpg') and '/' not in n and not os.path.exists(f'{d}/{n}'): zf.extract(n, d)
    print('ok', src, flush=True)

def sources(name):
    r = R[name]
    return {'grass': ['acg:Grass004', 'acg:Grass001']}[r['blend']] if r.get('blend') else [r['src']]

# ------------------------------------------------------------------ maps
def paths(src):
    site, i = src.split(':'); d = f'{DL}/{site}/{i}'
    g = lambda p: (glob.glob(f'{d}/{p}') or [None])[0]
    if site == 'ph':
        return dict(color=g('*_diff_2k.jpg'), normal=g('*_nor_gl_2k.jpg'), rough=g('*_rough_2k.jpg'), ao=g('*_ao_2k.jpg'))
    return dict(color=g('*_Color.jpg'), normal=g('*_NormalGL.jpg'), rough=g('*_Roughness.jpg'), ao=g('*_AmbientOcclusion.jpg'))

def load(p, size=2048, grey=False):
    im = Image.open(p).convert('L' if grey else 'RGB')
    if im.size != (size, size): im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0

def to_lin(s): return np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)
def to_srgb(l): l = np.clip(l, 0, 1); return np.where(l <= 0.0031308, l * 12.92, 1.055 * l ** (1 / 2.4) - 0.055)
LW = np.array([0.2126, 0.7152, 0.0722], np.float32)

def correct(rgb, target, sat=1.0, contrast=1.0):
    lin = to_lin(rgb); t = to_lin(np.array(target, np.float32) / 255.0)
    for _ in range(3):
        lin = lin * (t / lin.reshape(-1, 3).mean(0))
        if sat != 1.0:
            L = (lin @ LW)[..., None]; lin = np.clip(L + (lin - L) * sat, 0, None); sat = 1.0
        if contrast != 1.0:
            lin = t * (np.clip(lin, 1e-5, None) / t) ** contrast; contrast = 1.0
    return to_srgb(lin)

def periodic_noise(n, feat_px, seed):
    """Tileable smooth noise in [0,1]: white noise low-passed in Fourier space (periodic by construction)."""
    rng = np.random.default_rng(seed); w = rng.standard_normal((n, n)).astype(np.float32)
    f = np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2
    v = np.real(np.fft.ifft2(np.fft.fft2(w) * np.exp(-f * (feat_px ** 2) * 2 * np.pi ** 2)))
    return (v - v.min()) / (v.max() - v.min())

def periodic_blur(a, sigma_px):
    n = a.shape[0]; f = np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-f * sigma_px ** 2 * 2 * np.pi ** 2))).astype(np.float32)

def flatten(rgb, amount):
    """Divide out large-scale luminance variation (periodic blur keeps the result tileable)."""
    lin = to_lin(rgb); L = lin @ LW; low = periodic_blur(L, rgb.shape[0] / 12)
    ratio = np.clip(low / L.mean(), 0.2, 5); return to_srgb(lin / (ratio ** amount)[..., None])

def tile(a, k, n):
    """Source map a (H,W[,C]) repeated k x k into an n x n image."""
    s = n // k; im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((s, s), Image.LANCZOS)
    b = np.asarray(im, dtype=np.float32) / 255.0
    return np.tile(b, (k, k) + ((1,) if b.ndim == 3 else ()))

def blend_grass():
    n = 4032; A, B = paths('acg:Grass004'), paths('acg:Grass001')
    m = periodic_noise(n, n / 4.2 * 0.55, 7); m = np.clip((m - 0.38) / 0.26, 0, 1); m = m * m * (3 - 2 * m)  # ~1 m patches
    m2 = periodic_noise(n, n / 4.2 * 0.18, 11)                                                     # fine brightness break-up
    out = {}
    for k in ('color', 'normal', 'rough', 'ao'):
        g = k in ('rough', 'ao')
        a, b = tile(load(A[k], grey=g), 3, n), tile(load(B[k], grey=g), 2, n)
        mm = m if g else m[..., None]
        if k == 'color':
            # match the two grasses' means before mixing so the mask makes patches of tone, not of species colour
            la, lb = to_lin(a), to_lin(b); lb = lb * (la.reshape(-1, 3).mean(0) / lb.reshape(-1, 3).mean(0)) * np.array([0.9, 0.95, 0.92])
            v = la * (1 - mm) + lb * mm; v = v * (0.9 + 0.2 * m2[..., None]); out[k] = to_srgb(v)
        elif k == 'normal':
            v = (a * 2 - 1) * (1 - mm) + (b * 2 - 1) * mm; v /= np.linalg.norm(v, axis=2, keepdims=True) + 1e-6; out[k] = v * 0.5 + 0.5
        else:
            out[k] = a * (1 - mm) + b * mm
    return out

# ------------------------------------------------------------------ build
def save(a, path, q, grey=False, size=2048):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'L' if grey else 'RGB')
    if im.size != (size, size): im = im.resize((size, size), Image.LANCZOS)
    im.save(path, 'WEBP', quality=q, method=6)

def hexs(c): return '#%02x%02x%02x' % tuple(int(round(x)) for x in c)

def build(name):
    r = R[name]
    if r.get('blend'): maps = blend_grass()
    else:
        p = paths(r['src']); maps = {k: load(v, grey=k in ('rough', 'ao')) for k, v in p.items() if v}
    if r.get('flat'):
        maps['color'] = flatten(maps['color'], r['flat'])
        for k in ('rough', 'ao'):   # same high-pass on the greyscale maps (large specular / occlusion bands read as repeats)
            if k in maps: g = maps[k]; maps[k] = np.clip(g - (periodic_blur(g, g.shape[0] / 12) - g.mean()) * r['flat'], 0, 1)
        if 'normal' in maps:   # remove large-scale tilt (bands of slightly tilted surface shade as repeats)
            nv = maps['normal'] * 2 - 1
            for c in (0, 1): nv[..., c] -= periodic_blur(nv[..., c], nv.shape[0] / 12) * r['flat']
            nv[..., 2] = np.sqrt(np.clip(1 - nv[..., 0] ** 2 - nv[..., 1] ** 2, 0.01, 1)); maps['normal'] = nv * 0.5 + 0.5
    maps['color'] = correct(maps['color'], r['target'], r.get('sat', 1.0), r.get('contrast', 1.0))
    if r.get('rough_add'): maps['rough'] = np.clip(maps['rough'] + r['rough_add'], 0, 1)
    files = []
    for k, a in maps.items():
        for size, suf in ((2048, ''), (1024, '_1k')):
            fn = f'{name}_{k}{suf}.webp'; save(a, f'{OUT}/{fn}', Q[k], grey=a.ndim == 2, size=size); files.append(fn)
    mean = (maps['color'].reshape(-1, 3).mean(0) * 255)
    lin = to_lin(maps['color']).reshape(-1, 3).mean(0)
    srcs = [dict(id=s.split(':')[1], site='polyhaven.com' if s.startswith('ph') else 'ambientcg.com', url=url_of(s), license='CC0') for s in sources(name)]
    note = r.get('note') or f"{srcs[0]['id']} ({srcs[0]['site']}), " + (f"large-scale blotches flattened x{r['flat']}, " if r.get('flat') else '') + f"colour-corrected to mean {hexs(r['target'])}" + \
        (f", saturation x{r['sat']}" if r.get('sat', 1) != 1 else '') + (f", contrast x{r['contrast']}" if r.get('contrast', 1) != 1 else '')
    return dict(name=name, kind=r['kind'], tileMeters=r['tile'], sources=srcs, made=note,
                meanColor=hexs(mean), meanSRGB=[round(float(x) / 255, 3) for x in mean], meanLinear=[round(float(x), 4) for x in lin],
                files=sorted(files))

def write_meta(entries):
    man = dict(
        about='Tileable CC0 PBR environment textures. tileMeters: real-world size one texture repeat covers. '
              'Each material: <name>_color (sRGB), _normal, _rough, _ao (linear) as 2048 px WebP, and _1k variants (1024 px). '
              'Built by tools/blender/make-textures.py.',
        normalConvention='Normal maps are OpenGL (+Y green up), like glTF and Poly Haven nor_gl. Babylon\'s glTF loader sets '
              'invertNormalMapX = !scene.useRightHandedSystem and invertNormalMapY = scene.useRightHandedSystem for glTF\'s OpenGL maps; '
              'code-built StandardMaterial/PBRMaterial in the game\'s left-handed scene need the same flags '
              '(invertNormalMapX = true, invertNormalMapY = false). Needs one visual check in the game (light from a known side on cobblestone).',
        roughness='single-channel greyscale WebP (read the R channel); ao likewise. ao exists only when the source provided one.',
        materials=entries)
    json.dump(man, open(f'{OUT}/manifest.json', 'w'), indent=1)
    seen = {}
    for e in entries:
        for s in e['sources']: seen.setdefault(s['url'], (s, []))[1].append(e['name'])
    lines = ['Environment textures in this folder (assets/textures/env/) are derived from CC0 (public domain) sources.',
             'CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/', 'Poly Haven license: https://polyhaven.com/license',
             'ambientCG license: https://docs.ambientcg.com/license/', '', 'Sources (all CC0):']
    for url, (s, used) in sorted(seen.items()):
        lines.append(f"  {s['site']} {s['id']}  {url}  -> {', '.join(used)}")
    lines += ['', 'Changes: resized, blended (grass_meadow), colour-corrected and re-encoded as WebP. The derived files are also CC0.']
    open(f'{OUT}/LICENSE.txt', 'w').write('\n'.join(lines) + '\n')

if __name__ == '__main__':
    cmd, names = sys.argv[1], sys.argv[2:] or list(R)
    if cmd == 'fetch':
        srcs = sorted({s for n in names for s in sources(n)})
        with cf.ThreadPoolExecutor(4) as ex: list(ex.map(fetch, srcs))
    elif cmd == 'build':
        os.makedirs(OUT, exist_ok=True)
        old = {}
        if os.path.exists(f'{OUT}/manifest.json'):
            old = {e['name']: e for e in json.load(open(f'{OUT}/manifest.json'))['materials']}
        for n in names:
            t = time.time(); old[n] = build(n); print(n, old[n]['meanColor'], f'{time.time() - t:.1f}s', flush=True)
        write_meta([old[n] for n in R if n in old])
