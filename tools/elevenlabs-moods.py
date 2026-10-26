#!/usr/bin/env python3
"""One short sample per mood (calm joy anger fear sadness: mind.js's moods) for each
designed voice that has "moods" in tools/voices-eleven.json, spoken by Eleven v4
with the voice saved by tools/elevenlabs-voices.py (its id is in assets/voices/voices.json).
Writes assets/voices/mood/<id>.<mood>.mp3 and "moods" into voices.json; the game
speaks a character in the clone of the sample for its dominant mood.

  ELEVENLABS_API_KEY=... python3 tools/elevenlabs-moods.py [id ...]     (paid: ElevenLabs characters)
"""
import json, os, sys, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'assets/voices'); os.makedirs(OUT + '/mood', exist_ok=True)
KEY = os.environ.get('ELEVENLABS_API_KEY') or sys.exit('ELEVENLABS_API_KEY not set')
cfg = json.load(open(os.path.join(ROOT, 'tools/voices-eleven.json'))); idx_path = OUT + '/voices.json'; idx = json.load(open(idx_path))
want = set(a for a in sys.argv[1:] if not a.startswith('--')); only = [a[7:] for a in sys.argv[1:] if a.startswith('--only=')]   # --only=seductive: just that mood, the rest kept
for v in cfg:
    if (want and v['id'] not in want) or 'moods' not in v: continue
    e = next(x for x in idx if x['id'] == v['id'])
    if not e.get('elevenlabs_voice_id'): print('skip (no designed voice yet):', v['id']); continue
    vid = e['elevenlabs_voice_id']; e['moods'] = dict(e.get('moods') or {}) if only else {}
    # one seed and steady settings for every sample of a voice (stability .3 let the identity drift: the dwarf scored 5 of 10 for "same speaker", 9 with these)
    def say(text):
        r = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128', data=json.dumps({'text': text, 'model_id': 'eleven_v4', 'seed': v.get('seed', 4242), 'voice_settings': {'stability': v.get('mood_stability', .5), 'similarity_boost': v.get('mood_similarity', .95), 'use_speaker_boost': True, 'style': 0}}).encode(), headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
        return urllib.request.urlopen(r, timeout=240).read()
    for mood, text in v['moods'].items():
        if only and mood not in only: continue
        audio = say(text); name = f'mood/{v["id"]}.{mood}.mp3'; open(f'{OUT}/{name}', 'wb').write(audio); e['moods'][mood] = name
        print(v['id'], mood, len(audio) // 1024, 'KB', flush=True)
    if not only: open(f'{OUT}/{v["id"]}.mp3', 'wb').write(say(v['script'])); print(v['id'], 'main sample', flush=True)
    e['v'] = time.strftime('%Y%m%d%H%M')
json.dump(idx, open(idx_path, 'w'), indent=1)
