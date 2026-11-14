#!/usr/bin/env python3
"""A detailed animal for an existing rigged low-poly one (paid fal.ai calls).

  python3 tools/fal-animal.py image <name> "<description>"   # FLUX concept: work/animals/<name>/concept.png
  python3 tools/fal-animal.py model <name>                   # Meshy v6 image-to-3D (no rig): work/animals/<name>/model.glb
  blender -b -P tools/blender/reskin-animal.py -- <old rigged glb> work/animals/<name>/model.glb <out glb>

The new mesh is fitted onto the old model's skeleton in Blender and takes its
skin weights from the old mesh (nearest surface), so every clip of the old
model (Quaternius Animated Animal Pack: Walk, Idle, Eating, Attack...) still
plays. 2026-11-14.
"""
import json, os, sys, base64, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module
fc = import_module('fal-character')

STYLE = ("one single animal only, full body in exact side profile view facing left, standing square and still with all four paws flat on the ground, head level looking ahead, "
         "tail and head fully visible, plain light grey background, soft even lighting, stylized painterly fantasy game creature art, detailed fur, natural colours, centered, nothing else in the picture, no text, no watermark, no signature, no rider, no saddle")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('step', choices=['image', 'model']); ap.add_argument('name'); ap.add_argument('prompt', nargs='?'); ap.add_argument('--polycount', type=int, default=12000)
    a = ap.parse_args(); k = fc.key(); d = os.path.join(fc.ROOT, 'work', 'animals', a.name); os.makedirs(d, exist_ok=True)
    if a.step == 'image':
        r = fc.call('fal-ai/flux-pro/v1.1', {'prompt': (a.prompt or a.name) + ', ' + STYLE, 'image_size': {'width': 1280, 'height': 960}, 'num_images': 1, 'output_format': 'png', 'safety_tolerance': '4'}, k, a.name + ' image')
        fc.fetch(r['images'][0]['url'], os.path.join(d, 'concept.png'))
    else:
        b64 = base64.b64encode(open(os.path.join(d, 'concept.png'), 'rb').read()).decode()
        r = fc.call('fal-ai/meshy/v6/image-to-3d', {'image_url': 'data:image/png;base64,' + b64, 'should_texture': True, 'enable_pbr': True, 'target_polycount': a.polycount, 'should_remesh': True, 'symmetry_mode': 'auto', 'enable_safety_checker': False}, k, a.name + ' model')
        fc.fetch(r['model_glb']['url'], os.path.join(d, 'model.glb'))
        json.dump({'model': r['model_glb']['url']}, open(os.path.join(d, 'result.json'), 'w'))

if __name__ == '__main__':
    main()
