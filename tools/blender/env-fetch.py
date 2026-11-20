#!/usr/bin/env python3
"""Download the CC0 Poly Haven sources the tree generator uses (bark textures,
leaf/needle/frond textures from plant models) into work/env-nature/dl/.

    python3 tools/blender/env-fetch.py            # everything below, 2k
Retries (the maintainer's network drops). Poly Haven assets are CC0.
"""
import os, sys, json, time, urllib.request, concurrent.futures as cf
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DL = os.path.join(ROOT, 'work', 'env-nature', 'dl')
UA = {'User-Agent': 'tablefolk-asset-fetch/1.0'}
TEXTURES = ['jolcham_oak_bark_01', 'pine_bark', 'bark_willow_02', 'tree_bark_03', 'bark_brown_02']
MODELS = ['island_tree_01', 'island_tree_02', 'fir_tree_01', 'pine_tree_01', 'fir_sapling', 'shrub_01', 'shrub_02',
          'shrub_03', 'shrub_04', 'fern_02', 'jacaranda_tree', 'celandine_01', 'periwinkle_plant', 'dandelion_01']

def fetch(url, tries=8):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return r.read()
        except Exception as e:
            print('retry', url, e, file=sys.stderr); time.sleep(3 + 3 * i)
    raise RuntimeError('failed ' + url)

def get(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0: return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    data = fetch(url); open(dst + '.part', 'wb').write(data); os.replace(dst + '.part', dst)

def main(res='2k'):
    jobs = []
    for a in TEXTURES:
        files = json.loads(fetch(f'https://api.polyhaven.com/files/{a}'))
        for m in ('Diffuse', 'nor_gl', 'Rough', 'AO'):
            if m in files and res in files[m]:
                u = files[m][res]['jpg']['url']; jobs.append((u, f'{DL}/tex/{a}/{os.path.basename(u)}'))
    for a in MODELS:
        files = json.loads(fetch(f'https://api.polyhaven.com/files/{a}'))
        g = files['gltf'][res]['gltf']; d = f'{DL}/models/{a}'
        jobs.append((g['url'], f'{d}/{os.path.basename(g["url"])}'))
        for k, v in g['include'].items(): jobs.append((v['url'], f'{d}/{k}'))
        for k, v in files.items():   # cut-out masks are not in the glTF (the leaves are modelled): fetch them too
            if 'alpha' in k.lower() and res in v:
                fmt = 'png' if 'png' in v[res] else 'jpg'; u = v[res][fmt]['url']
                jobs.append((u, f'{d}/textures/{os.path.basename(u)}'))
    with cf.ThreadPoolExecutor(6) as ex: list(ex.map(lambda j: get(*j), jobs))
    print('ok', len(jobs), 'files in', DL)

if __name__ == '__main__': main(*(sys.argv[1:2] or ['2k']))
