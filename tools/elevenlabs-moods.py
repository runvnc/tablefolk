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
want = set(sys.argv[1:])
for v in cfg:
    if (want and v['id'] not in want) or 'moods' not in v: continue
    e = next(x for x in idx if x['id'] == v['id']); vid = e['elevenlabs_voice_id']; e['moods'] = {}
    for mood, text in v['moods'].items():
        r = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128', data=json.dumps({'text': text, 'model_id': 'eleven_v4', 'voice_settings': {'stability': .3, 'similarity_boost': .8}}).encode(), headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
        audio = urllib.request.urlopen(r, timeout=240).read(); name = f'mood/{v["id"]}.{mood}.mp3'; open(f'{OUT}/{name}', 'wb').write(audio); e['moods'][mood] = name
        print(v['id'], mood, len(audio) // 1024, 'KB', flush=True)
    e['v'] = time.strftime('%Y%m%d%H%M')
json.dump(idx, open(idx_path, 'w'), indent=1)
