#!/usr/bin/env python3
"""Pack the trees from make-trees.py into assets/models/props/env-nature/.

    python3 tools/blender/pack-trees.py            # trees
    python3 tools/blender/pack-trees.py cover      # ground cover (make-cover.py) into env-nature/cover/

For every work/env-nature/out/<name>.gltf: textures become shared AVIF files
beside the models (one copy of each atlas and bark set for all trees, as the
other glTF props do: EXT_texture_avif, 1024 px at most), geometry gets
meshopt compression (gltf-transform 4.5.1 through npx, like
tools/compress-glb.sh). Then writes manifest.json from out/report.json.
Needs avifenc (libavif) and Node.
"""
import os, sys, json, shutil, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'work', 'env-nature', 'out')
DST = os.path.join(ROOT, 'assets', 'models', 'props', 'env-nature')
GT = ['npx', '-y', '@gltf-transform/cli@4.5.1']

# what each type replaces in assets/pack.json (the type keeps its name; variants are new)
REPLACES = {
    'oak_tree': 'oak_tree', 'oak_tree_b': 'oak_tree (variant)', 'oak_tree_c': 'oak_tree (variant)',
    'tree': 'tree', 'tall_tree': 'tall_tree', 'autumn_tree': 'autumn_tree', 'dead_tree': 'dead_tree',
    'pine_tree': 'pine_tree', 'pine_tree_b': 'pine_tree (variant)', 'pine_tree_c': 'pine_tree (variant)',
    'tall_pine': 'tall_pine', 'flower_bush': 'flower_bush', 'red_bush': 'red_bush', 'fern': 'fern',
}
VARIANTS = {'oak_tree': ['oak_tree_b', 'oak_tree_c'], 'pine_tree': ['pine_tree_b', 'pine_tree_c']}
SPECIES = {  # Sapling preset each grew from (see make-trees.py), for the manifest
    'oak_tree': 'cambridge_oak', 'oak_tree_b': 'cambridge_oak', 'oak_tree_c': 'coast_live_oak', 'tree': 'acer',
    'tall_tree': 'black_tupelo', 'autumn_tree': 'acer', 'dead_tree': 'black_oak', 'pine_tree': 'european_larch',
    'pine_tree_b': 'european_larch', 'pine_tree_c': 'balsam_fir', 'tall_pine': 'douglas_fir',
    'flower_bush': 'coyote_brush', 'red_bush': 'coyote_brush', 'fern': '(hand-built fronds)',
}


def avif(src, dst, normal=False, alpha=False):
    from PIL import Image
    im = Image.open(src)
    if max(im.size) > 1024:
        im = im.resize((1024, 1024 * im.size[1] // im.size[0]), Image.LANCZOS)
    tmp = dst + '.png'; im.save(tmp)
    q = '68' if normal else '64'
    cmd = ['avifenc', '-q', q, '-s', '4', '-j', '4']
    if normal: cmd += ['-y', '444']   # no chroma subsampling for normal maps
    if alpha: cmd += ['--qalpha', '90']
    subprocess.run(cmd + [tmp, dst], check=True, stdout=subprocess.DEVNULL)
    os.remove(tmp)


def pack(SRC, DST, done_imgs):
    os.makedirs(DST, exist_ok=True)
    files = sorted(f for f in os.listdir(SRC) if f.endswith('.gltf'))
    for f in files:
        g = json.load(open(os.path.join(SRC, f)))
        mats = g.get('materials', [])
        # which images are normal maps / alpha atlases
        role = {}
        for m in mats:
            if 'normalTexture' in m: role[g['textures'][m['normalTexture']['index']]['source']] = 'normal'
            bc = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
            if bc is not None and m.get('alphaMode') == 'MASK': role[g['textures'][bc['index']]['source']] = 'alpha'
        for i, im in enumerate(g.get('images', [])):
            name = (im.get('name') or os.path.splitext(os.path.basename(im['uri']))[0]).replace('_2k', '')
            out = name + '.avif'
            if out not in done_imgs:
                avif(os.path.join(SRC, im['uri']), os.path.join(DST, out), role.get(i) == 'normal', role.get(i) == 'alpha')
                done_imgs[out] = os.path.getsize(os.path.join(DST, out))
            g['images'][i] = {'name': name, 'mimeType': 'image/avif', 'uri': out}
        for t in g.get('textures', []):
            t['extensions'] = {'EXT_texture_avif': {'source': t['source']}}
        for k in ('extensionsUsed', 'extensionsRequired'):
            g[k] = sorted(set(g.get(k, []) + ['EXT_texture_avif']))
        with tempfile.TemporaryDirectory() as td:
            shutil.copy(os.path.join(SRC, g['buffers'][0]['uri']), td)
            for out in {im['uri'] for im in g.get('images', [])}: shutil.copy(os.path.join(DST, out), td)
            tin = os.path.join(td, f); json.dump(g, open(tin, 'w'))
            tout = os.path.join(td, 'o', f); os.makedirs(os.path.dirname(tout))
            subprocess.run(GT + ['meshopt', tin, tout, '--level', 'medium'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            og = json.load(open(tout))
            for b in og['buffers']:
                if 'uri' not in b: continue    # meshopt's fallback buffer has no data
                shutil.copy(os.path.join(td, 'o', b['uri']), os.path.join(DST, b['uri']))
            shutil.copy(tout, os.path.join(DST, f))
        print('packed', f, flush=True)


COVER = {
    'grass_tufts.gltf': dict(nodes=['tuft_fine', 'tuft_wispy', 'tuft_clump', 'tuft_broad'], size_m='0.5-0.62 wide, 0.36-0.47 high',
                             note='three crossed cards each, normals straight up (lit like the ground), roots darkened by COLOR_0; '
                                  'colour matched to grass_meadow\'s mean'),
    'flowers.gltf': dict(nodes=['flower_daisy', 'flower_yellow', 'flower_blue'], size_m='0.4 wide, 0.3 high',
                         note='white daisy-like, yellow (celandine), violet-blue; three crossed cards, up normals'),
    'pebbles.gltf': dict(nodes=['pebble_a', 'pebble_b', 'pebble_c', 'pebble_d', 'pebble_e'], size_m='0.05-0.14',
                         note='vertex-coloured stones, 320 triangles each, no texture'),
}


def main():
    done_imgs = {}
    if sys.argv[1:2] == ['cover']:
        src = os.path.join(ROOT, 'work', 'env-nature', 'cover'); dst = os.path.join(DST, 'cover')
        pack(src, dst, done_imgs)
        man = dict(about='Ground cover for the medium/high tiers (tools/blender/make-cover-atlas.py, make-cover.py). '
                         'Each file holds one node per kind, all at the origin (instance sources). Units metres, +Y up.',
                   meadow_mean_hex=json.load(open(os.path.join(src, 'meadow.json')))['hex'] if os.path.exists(os.path.join(src, 'meadow.json')) else None,
                   files=COVER, textures={k: v for k, v in sorted(done_imgs.items())})
        json.dump(man, open(os.path.join(dst, 'manifest.json'), 'w'), indent=1)
        return
    report = json.load(open(os.path.join(SRC, 'report.json')))
    pack(SRC, DST, done_imgs)
    # manifest
    items = []
    for name in REPLACES:
        full, light = report.get(name), report.get(name + '.med')
        if not full: continue
        e = dict(type=name, replaces=REPLACES[name], sapling_preset=SPECIES[name],
                 files=dict(full=f'{name}.gltf', light=f'{name}.med.gltf'),
                 height_m=full['height'], canopy_radius_m=full['canopy_radius'],
                 triangles=dict(full=full['tris'], light=light['tris'] if light else None))
        if name in VARIANTS: e['variants'] = VARIANTS[name]
        g = json.load(open(os.path.join(DST, f'{name}.gltf')))
        e['textures'] = sorted(im['uri'] for im in g.get('images', []))
        items.append(e)
    man = dict(
        about='Procedural trees and plants (tools/blender/make-trees.py; Sapling Tree Gen skeletons, leaf-cluster cards). '
              'Full = <type>.gltf (6-10k triangles), light = <type>.med.gltf (fewer, larger, folded cards; '
              'the MED naming of app/graphics-settings.js). Textures are shared AVIF files in this folder (1024 px max). '
              'Units: metres, +Y up, origin at the trunk base. Foliage: alphaMode MASK, double-sided, COLOR_0 = baked occlusion, '
              'normals bent toward clump/crown centres (keep the file normals; do not recompute).',
        items=items, textures={k: v for k, v in sorted(done_imgs.items())})
    json.dump(man, open(os.path.join(DST, 'manifest.json'), 'w'), indent=1)
    tot = sum(os.path.getsize(os.path.join(DST, x)) for x in os.listdir(DST))
    print('total', round(tot / 1e6, 2), 'MB in', DST)


if __name__ == '__main__': main()
