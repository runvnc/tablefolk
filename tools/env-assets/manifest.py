#!/usr/bin/env python3
"""Update assets/models/props/env/manifest.json in place after finish.sh: footprint_m, height_m, triangles and kb
of the named models (default all) from $ENV_WORK/proc/<name>.stats and the asset files. Other fields are kept.

  python3 tools/env-assets/manifest.py [name ...]
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
WORK = os.environ.get('ENV_WORK', os.path.join(ROOT, 'work/env')); A = os.path.join(ROOT, 'assets/models/props/env')
path = os.path.join(A, 'manifest.json'); man = json.load(open(path))
names = set(sys.argv[1:])
for it in man['items']:
    n = it['type']
    if names and n not in names: continue
    st = os.path.join(WORK, 'proc', n + '.stats')
    if not os.path.exists(st): continue
    s = json.loads(re.search(r'STATS (.*)', open(st).read()).group(1))
    x, y, z = s['size_xyz_blender']
    it['footprint_m'] = [round(x, 2), round(y, 2)]; it['height_m'] = round(z, 2); it['triangles'] = s['tris']
    it['kb'] = {'full': os.path.getsize(os.path.join(A, n + '.glb')) // 1024, '1k': os.path.getsize(os.path.join(A, n + '.1k.glb')) // 1024}
    print(n, it['footprint_m'], it['height_m'], it['triangles'], it['kb'])
json.dump(man, open(path, 'w'), indent=1)
