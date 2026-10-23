#!/usr/bin/env python3
"""Generate a rigged, animated monster with fal.ai (Meshy v6 + Meshy rigging).

  python3 tools/fal-monster.py <name> "<prompt>" [--height 1.8] [--out work/monsters]

Steps (each a paid fal.ai call; FAL_API_KEY from .env, never printed):
  1. fal-ai/meshy/v6/text-to-3d       textured model (A-pose for rigging)
  2. fal-ai/meshy/rigging/multi-animation   humanoid rig + clips:
       0 Idle, 30 Casual_Walk, 4 Attack, 178 Hit_Reaction, 8 Dead
Downloads everything into <out>/<name>/ and writes result.json. Merging the
clips into one game-ready GLB: tools/merge-clips.mjs.
"""
import json, os, sys, time, urllib.request, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIPS = {0: 'Idle', 30: 'Walk', 4: 'Attack', 178: 'HitReact', 8: 'Death'}

def key():
    for line in open(os.path.join(ROOT, '.env')):
        if line.startswith('FAL_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"\'')
    sys.exit('FAL_API_KEY missing from .env')

def call(endpoint, payload, k, label):
    req = urllib.request.Request(f'https://queue.fal.run/{endpoint}', data=json.dumps(payload).encode(),
                                 headers={'Authorization': f'Key {k}', 'Content-Type': 'application/json'})
    sub = json.load(urllib.request.urlopen(req))
    status_url, resp_url = sub['status_url'], sub['response_url']
    print(f'[{label}] queued {sub["request_id"]}', flush=True)
    t0 = time.time()
    while True:
        time.sleep(5)
        st = json.load(urllib.request.urlopen(urllib.request.Request(status_url, headers={'Authorization': f'Key {k}'})))
        if st['status'] == 'COMPLETED': break
        if time.time() - t0 > 1500: sys.exit(f'[{label}] timed out: {st}')
    try:
        out = json.load(urllib.request.urlopen(urllib.request.Request(resp_url, headers={'Authorization': f'Key {k}'})))
    except urllib.error.HTTPError as e:
        sys.exit(f'[{label}] failed: {e.code} {e.read().decode()[:600]}')
    print(f'[{label}] done in {int(time.time() - t0)} s', flush=True)
    return out

def fetch(url, path):
    urllib.request.urlretrieve(url, path)
    print('  saved', os.path.relpath(path, ROOT), os.path.getsize(path) // 1024, 'KB', flush=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('name'); ap.add_argument('prompt')
    ap.add_argument('--height', type=float, default=1.8)
    ap.add_argument('--out', default=os.path.join(ROOT, 'work/monsters'))
    ap.add_argument('--polycount', type=int, default=12000)
    a = ap.parse_args()
    k, d = key(), os.path.join(a.out, a.name)
    os.makedirs(d, exist_ok=True)
    res = {'name': a.name, 'prompt': a.prompt}
    gen = call('fal-ai/meshy/v6/text-to-3d', {
        'prompt': a.prompt, 'mode': 'full', 'pose_mode': 'a-pose', 'target_polycount': a.polycount,
        'should_remesh': True, 'symmetry_mode': 'on', 'enable_pbr': False, 'enable_safety_checker': False,
    }, k, a.name + ' model')
    res['model'] = gen['model_glb']['url']
    fetch(res['model'], os.path.join(d, 'model.glb'))
    if gen.get('thumbnail'): fetch(gen['thumbnail']['url'], os.path.join(d, 'thumb.png'))
    rig = call('fal-ai/meshy/rigging/multi-animation', {
        'model_url': res['model'], 'animation_action_ids': list(CLIPS), 'height_meters': a.height, 'enable_safety_checker': False,
    }, k, a.name + ' rig')
    fetch(rig['rigged_character_glb']['url'], os.path.join(d, 'rigged.glb'))
    res['clips'] = {}
    for c in rig.get('animations', []):
        name = CLIPS.get(c['action_id'], str(c['action_id']))
        fetch(c['animation_glb']['url'], os.path.join(d, f'clip_{name}.glb'))
        res['clips'][name] = c['action_id']
    json.dump(res, open(os.path.join(d, 'result.json'), 'w'), indent=2)
    print('DONE', a.name, flush=True)

if __name__ == '__main__':
    main()
