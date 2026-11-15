#!/usr/bin/env python3
"""Other image-to-3D models on fal for an existing concept (paid; 2026-11-14 prices).
  python3 tools/fal-3d.py trellis2 work/animals/<name>     # TRELLIS.2 (MIT) at 1024: $0.30
  python3 tools/fal-3d.py hunyuan31 work/animals/<name>    # Hunyuan3D 3.1 Pro with PBR: $0.525 (FACES=40000: $0.675)
Also writes <dir>/result.json with the model url, so `fal-character.py rig` can rig it.
Reads <dir>/concept.png, writes <dir>/<model>.glb. The fal response URL is
printed first, so a dropped run can still be fetched."""
import sys, os, json, base64, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module
fc = import_module('fal-character')
which, d = sys.argv[1], sys.argv[2]
img = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(d, 'concept.png'), 'rb').read()).decode()
k = fc.key(); t0 = time.time()
if which == 'trellis2':
    r = fc.call('fal-ai/trellis-2', {'image_url': img, 'resolution': 1024, 'texture_size': 2048, 'decimation_target': 30000}, k, 'trellis2')
elif which == 'hunyuan31':
    args = {'input_image_url': img, 'enable_pbr': True, 'enable_safety_checker': False}
    if os.environ.get('FACES'): args['face_count'] = int(os.environ['FACES'])   # 40000+; a custom count adds $0.15
    r = fc.call('fal-ai/hunyuan-3d/v3.1/pro/image-to-3d', args, k, 'hunyuan31')
else: sys.exit('trellis2 | hunyuan31')
url = (r.get('model_glb') or {}).get('url') or r.get('model_urls', {}).get('glb', {}).get('url')
if not url: sys.exit('no glb in ' + json.dumps(r)[:600])
fc.fetch(url, os.path.join(d, which + '.glb'))
# the model's url, for Meshy rigging (tools/fal-character.py rig reads result.json)
json.dump({'model': url, 'by': which}, open(os.path.join(d, 'result.json'), 'w')); print(which, 'took', int(time.time() - t0), 's')
