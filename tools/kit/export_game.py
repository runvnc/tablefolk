# The building kit's files for the game (2026-11-27): graded textures -> assets/textures/kit/ as WebP,
# hero pieces -> assets/models/kit/ through tools/compress-glb.sh (AVIF + meshopt).
#   python3 tools/kit/export_game.py [--tex] [--pieces]      (both when neither is given)
# Textures: <mat>_<color|normal|rough>.webp at 1024 and <mat>_<kind>_512.webp (light quality, rough maps
# at medium). Look fixes from round 2 are applied here, not in make_textures.py: grey shingle darker and
# with more contrast between shingles (the concepts' roofs).
import os, sys, subprocess, json
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'work/kit/tex'); DST = os.path.join(ROOT, 'assets/textures/kit')
PSRC = os.path.join(ROOT, 'work/kit/pieces'); PDST = os.path.join(ROOT, 'assets/models/kit')
MATS = ['plaster', 'fieldstone', 'quoin', 'timber', 'siding', 'floor', 'shingle', 'thatch', 'tile']
a = sys.argv[1:]; doTex = '--tex' in a or not ('--pieces' in a); doPieces = '--pieces' in a or not ('--tex' in a)

def grade(m, kind, im):
    if m == 'shingle' and kind == 'color':
        im = ImageEnhance.Contrast(im).enhance(1.45)
        im = ImageEnhance.Brightness(im).enhance(.78)
    return im

if doTex:
    os.makedirs(DST, exist_ok=True)
    tiles = {}
    man = json.load(open(os.path.join(SRC, 'manifest.json')))
    for m in MATS:
        for kind in ('color', 'normal', 'rough'):
            ext = 'png' if kind == 'normal' else 'jpg'
            im = Image.open(os.path.join(SRC, f'{m}_{kind}.{ext}')).convert('RGB' if kind != 'rough' else 'L')
            im = grade(m, kind, im)
            q = 90 if kind == 'normal' else 82
            im.save(os.path.join(DST, f'{m}_{kind}.webp'), 'WEBP', quality=q, method=6)
            im.resize((512, 512), Image.LANCZOS).save(os.path.join(DST, f'{m}_{kind}_512.webp'), 'WEBP', quality=q, method=6)
        tiles[m] = man[m]['tileMeters']
    json.dump({'tileMeters': tiles, 'note': 'tools/kit/export_game.py from work/kit/tex (make_textures.py)'}, open(os.path.join(DST, 'manifest.json'), 'w'), indent=1)
    print('textures', sum(os.path.getsize(os.path.join(DST, f)) for f in os.listdir(DST)) // 1024, 'KB')

if doPieces:
    os.makedirs(PDST, exist_ok=True)
    for f in sorted(os.listdir(PSRC)):
        if not f.endswith('.glb'): continue
        # texture memory (the game sits beside a 5-12 GB model): the pieces seen at arm's length (door, leaf,
        # window) keep 1024, the rest 512; LOD files keep their 256; light quality loads <name>_512.glb
        name = f[:-4]; big = name in ('door', 'door_leaf', 'window')
        run = lambda mx, out: subprocess.run([os.path.join(ROOT, 'tools/compress-glb.sh'), '--max', str(mx), os.path.join(PSRC, f), os.path.join(PDST, out)],
                                             check=True, stdout=subprocess.DEVNULL)
        run(1024 if big else 512, f)
        if big: run(512, name + '_512.glb')
    meta = json.load(open(os.path.join(PSRC, 'pieces.json')))
    json.dump(meta, open(os.path.join(PDST, 'pieces.json'), 'w'), indent=1)
    print('pieces', sum(os.path.getsize(os.path.join(PDST, f)) for f in os.listdir(PDST)) // 1024, 'KB')
