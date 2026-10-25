#!/usr/bin/env python3
"""Make a rigged, animated person with fal.ai: a concept image, then Meshy v6
image-to-3D (PBR, A-pose), then Meshy rigging with the game's five clips.

  python3 tools/fal-character.py image <name> "<prompt>"   # step 1: a picture to approve (cheap)
  python3 tools/fal-character.py model <name>              # step 2: 3D from work/people/<name>/concept.png
  python3 tools/fal-character.py rig   <name> [--height 1.7]   # step 3: rig + clips

then tools/finish-monster.sh <name> work/people (merges the clips, compresses,
writes assets/models/characters/meshy/<name>.glb). Every step is a paid fal.ai
call (FAL_API_KEY from .env, never printed): ask first.
"""
import json, os, sys, time, urllib.request, argparse, base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIPS = {0: 'Idle', 30: 'Walk', 4: 'Attack', 178: 'HitReact', 8: 'Death'}
STYLE = ("full body character design, front view, standing in a neutral A-pose with arms slightly away from the body and legs slightly apart, "
         "head to feet fully visible, plain light grey background, soft even lighting, stylized Japanese RPG character art, clean detailed costume, no weapon in hands, no text")

def key():
    for line in open(os.path.join(ROOT, '.env')):
        if line.startswith('FAL_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"\'')
    sys.exit('FAL_API_KEY missing from .env')

def call(endpoint, payload, k, label, poll=5):
    req = urllib.request.Request(f'https://queue.fal.run/{endpoint}', data=json.dumps(payload).encode(), headers={'Authorization': f'Key {k}', 'Content-Type': 'application/json'})
    sub = json.load(urllib.request.urlopen(req))
    print(f'[{label}] queued', flush=True); t0 = time.time()
    while True:
        time.sleep(poll)
        st = json.load(urllib.request.urlopen(urllib.request.Request(sub['status_url'], headers={'Authorization': f'Key {k}'})))
        if st['status'] == 'COMPLETED': break
        if time.time() - t0 > 1500: sys.exit(f'[{label}] timed out: {st}')
    try:
        out = json.load(urllib.request.urlopen(urllib.request.Request(sub['response_url'], headers={'Authorization': f'Key {k}'})))
    except urllib.error.HTTPError as e:
        sys.exit(f'[{label}] failed: {e.code} {e.read().decode()[:600]}')
    print(f'[{label}] done in {int(time.time() - t0)} s', flush=True); return out

def fetch(url, path):
    urllib.request.urlretrieve(url, path); print('  saved', os.path.relpath(path, ROOT), os.path.getsize(path) // 1024, 'KB', flush=True)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('step', choices=['image', 'model', 'rig']); ap.add_argument('name'); ap.add_argument('prompt', nargs='?')
    ap.add_argument('--height', type=float, default=1.7); ap.add_argument('--out', default=os.path.join(ROOT, 'work/people')); ap.add_argument('--polycount', type=int, default=20000)
    a = ap.parse_args(); k, d = key(), os.path.join(a.out, a.name); os.makedirs(d, exist_ok=True)
    if a.step == 'image':
        r = call('fal-ai/flux-pro/v1.1', {'prompt': (a.prompt or '') + ', ' + STYLE, 'image_size': {'width': 768, 'height': 1280}, 'num_images': 1, 'output_format': 'png', 'safety_tolerance': '4'}, k, a.name + ' image')
        fetch(r['images'][0]['url'], os.path.join(d, 'concept.png'))
    elif a.step == 'model':
        b64 = base64.b64encode(open(os.path.join(d, 'concept.png'), 'rb').read()).decode()
        r = call('fal-ai/meshy/v6/image-to-3d', {'image_url': 'data:image/png;base64,' + b64, 'should_texture': True, 'enable_pbr': True, 'pose_mode': 'a-pose', 'target_polycount': a.polycount, 'should_remesh': True, 'symmetry_mode': 'auto', 'enable_safety_checker': False}, k, a.name + ' model')
        fetch(r['model_glb']['url'], os.path.join(d, 'model.glb'))
        if r.get('thumbnail'): fetch(r['thumbnail']['url'], os.path.join(d, 'thumb.png'))
        json.dump({'model': r['model_glb']['url']}, open(os.path.join(d, 'result.json'), 'w'))
    else:
        res = json.load(open(os.path.join(d, 'result.json')))
        rig = call('fal-ai/meshy/rigging/multi-animation', {'model_url': res['model'], 'animation_action_ids': list(CLIPS), 'height_meters': a.height, 'enable_safety_checker': False}, k, a.name + ' rig')
        fetch(rig['rigged_character_glb']['url'], os.path.join(d, 'rigged.glb'))
        for c in rig.get('animations', []):
            fetch(c['animation_glb']['url'], os.path.join(d, f"clip_{CLIPS.get(c['action_id'], c['action_id'])}.glb"))
        print('DONE', a.name)

if __name__ == '__main__':
    main()
