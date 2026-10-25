#!/usr/bin/env python3
"""Design voices from text descriptions with fal.ai (Qwen3-TTS Voice Design)
and save a sample of each as assets/voices/<id>.mp3; Pocket-TTS clones the
sample in the browser (app/tts/pocket-tts-manager.js, "pack voices").

  python3 tools/fal-voices.py [id ...]     (none: every voice in tools/voices.json)

tools/voices.json lists { id, gender, name, description (the prompt), tag (what
the generator and the builder show) }. Paid (a few cents a clip): ask first.
FAL_API_KEY from .env, never printed. Rewrites assets/voices/voices.json.
"""
import json, os, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets/voices')
LINE = "Well met, traveller. The road ahead is long and the nights are cold, but I will walk it with you."

def key():
    for line in open(os.path.join(ROOT, '.env')):
        if line.startswith('FAL_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"\'')
    sys.exit('FAL_API_KEY missing from .env')

def call(endpoint, payload, k):
    req = urllib.request.Request(f'https://queue.fal.run/{endpoint}', data=json.dumps(payload).encode(), headers={'Authorization': f'Key {k}', 'Content-Type': 'application/json'})
    sub = json.load(urllib.request.urlopen(req))
    t0 = time.time()
    while True:
        time.sleep(2)
        st = json.load(urllib.request.urlopen(urllib.request.Request(sub['status_url'], headers={'Authorization': f'Key {k}'})))
        if st['status'] == 'COMPLETED': break
        if time.time() - t0 > 300: sys.exit(f'timed out: {st}')
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(sub['response_url'], headers={'Authorization': f'Key {k}'})))
    except urllib.error.HTTPError as e:
        sys.exit(f'failed: {e.code} {e.read().decode()[:500]}')

def main():
    voices = json.load(open(os.path.join(ROOT, 'tools/voices.json')))
    want = set(sys.argv[1:]); k = key(); os.makedirs(OUT, exist_ok=True)
    for v in voices:
        if want and v['id'] not in want: continue
        path = os.path.join(OUT, v['id'] + '.mp3')
        if os.path.exists(path) and not want: print('have', v['id']); continue
        r = call('fal-ai/qwen-3-tts/voice-design/1.7b', {'text': v.get('line', LINE), 'prompt': v['description'], 'language': 'English'}, k)
        urllib.request.urlretrieve(r['audio']['url'], path)
        print('saved', v['id'], round(r['audio'].get('duration', 0), 1), 's', os.path.getsize(path) // 1024, 'KB', flush=True)
    index = [{'id': v['id'], 'name': v['name'], 'gender': v['gender'], 'description': v['tag'], 'file': v['id'] + '.mp3'} for v in voices if os.path.exists(os.path.join(OUT, v['id'] + '.mp3'))]
    json.dump(index, open(os.path.join(OUT, 'voices.json'), 'w'), indent=1)

if __name__ == '__main__':
    main()
