#!/usr/bin/env python3
"""Have Gemini 4 Argon (OpenRouter, OPENROUTER_API_KEY in .env) listen to candidate sound clips and rate them (what it hears, quality, fit, best role, the best start-end window). Used to pick assets/sounds/voices (2026-11-14).
usage: judge.py out.json group "what we want" file1 file2 ...
Writes/extends out.json with {file: {...}}."""
import sys, os, json, base64, subprocess, tempfile, urllib.request, re

def key():
    for l in open('/mnt/files/tablefolk/.env'):
        if l.startswith('OPENROUTER_API_KEY='): return l.split('=', 1)[1].strip().strip('"\'')

def clip(f):
    t = tempfile.mktemp(suffix='.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f, '-t', '6', '-ac', '1', '-ar', '22050', '-b:a', '48k', t], check=True)
    d = base64.b64encode(open(t, 'rb').read()).decode(); os.remove(t); return d

out, group, want, files = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
res = json.load(open(out)) if os.path.exists(out) else {}
content = [{'type': 'text', 'text': f'''You are a sound designer choosing sound effects for a 3D fantasy role-playing game with clay-figure characters (people, monsters and farm/wild animals).
Group: {group}. What we need: {want}.
Below are {len(files)} audio clips (each cut to at most 6 seconds). Listen to each one carefully.
For EACH clip return an object with:
 "n": its number, "heard": what it actually sounds like (be specific and honest: e.g. "man grunting", "synth whoosh", "cow mooing", "silence", "noisy field recording with wind"),
 "quality": 1-10 (clean, punchy, no background noise or clipping, game-ready),
 "fit": 1-10 for the need above,
 "use": the best single role from: human_hurt, human_death, female_hurt, female_death, monster_hurt, monster_death, monster_attack, beast_growl, beast_roar, small_creature, undead, insect, slime, cow, bull, pig, horse, donkey, sheep, goat, dog, wolf, fox, deer, alpaca, frog, snake, rabbit, bird, weapon_hit, other, unusable,
 "start" and "end": seconds that hold the single best clean instance of that sound (0.3-2.5 s long; for a death up to 3 s).
Answer with only a JSON array.'''}]
for i, f in enumerate(files):
    content.append({'type': 'text', 'text': f'Clip {i + 1}:'})
    content.append({'type': 'input_audio', 'input_audio': {'data': clip(f), 'format': 'mp3'}})
body = json.dumps({'model': 'google/gemini-4-argon', 'messages': [{'role': 'user', 'content': content}], 'temperature': 0.2}).encode()
req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', body, {'Authorization': 'Bearer ' + key(), 'Content-Type': 'application/json'})
r = json.load(urllib.request.urlopen(req, timeout=240))
txt = r['choices'][0]['message']['content']
m = re.search(r'\[.*\]', txt, re.S)
arr = json.loads(m.group(0))
for a in arr:
    f = files[int(a['n']) - 1]; a['group'] = group; res[f] = a
    print(f"{a.get('fit'):>2} {a.get('quality'):>2} {a.get('use'):<15} {a.get('start')}-{a.get('end')} {os.path.basename(f)}: {a.get('heard')}")
json.dump(res, open(out, 'w'), indent=1)
print('cost', r.get('usage', {}).get('cost'))
