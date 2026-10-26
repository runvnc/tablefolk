#!/usr/bin/env python3
"""Design character voices with ElevenLabs Voice Design, then record each one
performing a short three-emotion script with Eleven v4 (audio tags), and put
the result in assets/voices/<id>.mp3 (the sample Pocket-TTS clones; the admin
page plays it).

  ELEVENLABS_API_KEY=... python3 tools/elevenlabs-voices.py [id ...]

For each voice in tools/voices-eleven.json: three design previews of the
description (model eleven_multilingual_ttv_v2, which reads tags aloud, so the
preview text is plain), Gemini 4 Argon (OPENROUTER_API_KEY in .env) listens to
each and the one nearest the wanted gender and age is saved as a voice in the
account (one voice slot each, kept in the account: delete in the ElevenLabs
voice library to free it), then the script is spoken by eleven_v4 with that
voice. voices.json gets "elevenlabs_voice_id". Paid (characters of the
ElevenLabs plan, a few cents of OpenRouter); ask first.
"""
import base64, json, os, sys, urllib.request, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets/voices')
EL = os.environ.get('ELEVENLABS_API_KEY') or sys.exit('ELEVENLABS_API_KEY not set')
OR = [l.split('=', 1)[1].strip().strip('"\'') for l in open(os.path.join(ROOT, '.env')) if l.startswith('OPENROUTER_API_KEY=')][0]

def el(path, body=None, raw=False):
    r = urllib.request.Request('https://api.elevenlabs.io' + path, data=json.dumps(body).encode() if body is not None else None, headers={'xi-api-key': EL, 'Content-Type': 'application/json'})
    try:
        resp = urllib.request.urlopen(r, timeout=240); return resp.read() if raw else json.load(resp)
    except urllib.error.HTTPError as e: sys.exit(f'ElevenLabs {path}: {e.code} {e.read().decode()[:400]}')

PROMPT = ("Listen to this clip and describe ONLY what you hear as JSON: gender, apparent_age (years range like 20-30), accent, timbre, "
          "emotional_expressiveness (1-10), emotions_heard (list), audio_quality_notes, naturalness (1-10), one_sentence_summary. Be critical.")
def argon(path):
    data = base64.b64encode(open(path, 'rb').read()).decode()
    body = {'model': 'google/gemini-4-argon', 'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': PROMPT}, {'type': 'input_audio', 'input_audio': {'data': data, 'format': 'mp3'}}]}], 'max_tokens': 3000, 'reasoning': {'effort': 'low'}, 'temperature': 0.2}
    r = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + OR, 'Content-Type': 'application/json'})
    for attempt in range(3):
        try:
            t = json.load(urllib.request.urlopen(r, timeout=180))['choices'][0]['message']['content']
            return json.loads(t[t.index('{'): t.rindex('}') + 1])
        except Exception: time.sleep(2)
    return {}

def age_mid(s):
    try: a, b = str(s).replace('+', '-100').split('-')[:2]; return (float(a) + float(b)) / 2
    except Exception: return 40

def score(d, v):
    ok = str(d.get('gender', '')).lower().startswith(v['gender'][0])
    return (3 if ok else 0) - abs(age_mid(d.get('apparent_age')) - v['age']) / 15 + float(d.get('naturalness') or 5) / 5

def main():
    cfg = json.load(open(os.path.join(ROOT, 'tools/voices-eleven.json')))
    want = set(sys.argv[1:]); index_path = os.path.join(OUT, 'voices.json'); index = json.load(open(index_path))
    for v in cfg:
        if want and v['id'] not in want: continue
        print('==', v['id'], flush=True)
        best = None
        for rnd in range(3):   # up to three rounds of three previews until one fits
            prev = el('/v1/text-to-voice/design', {'voice_description': v['description'], 'text': v['preview_text'], 'model_id': 'eleven_multilingual_ttv_v2'})['previews']
            for i, p in enumerate(prev):
                f = os.path.join(OUT, f'_{v["id"]}_prev.mp3'); open(f, 'wb').write(base64.b64decode(p['audio_base_64']))
                d = argon(f); s = score(d, v); os.remove(f)
                print(f'  round {rnd} preview {i}: {d.get("gender")} {d.get("apparent_age")} {d.get("accent")} | nat {d.get("naturalness")} | score {s:.2f}', flush=True)
                if not best or s > best[0]: best = (s, p)
            if best[0] >= 3.5: break
        if best[0] < 2: print('  warning: no preview fit well; using the best of them', flush=True)
        vid = el('/v1/text-to-voice', {'voice_name': v['name'] + ' (tablefolk)', 'voice_description': v['description'], 'generated_voice_id': best[1]['generated_voice_id']})['voice_id']
        audio = el(f'/v1/text-to-speech/{vid}?output_format=mp3_44100_128', {'text': v['script'], 'model_id': 'eleven_v4', 'voice_settings': {'stability': v.get('stability', .35), 'similarity_boost': .8}}, raw=True)
        open(os.path.join(OUT, v['id'] + '.mp3'), 'wb').write(audio)
        for e in index:
            if e['id'] == v['id']: e['elevenlabs_voice_id'] = vid; e['v'] = time.strftime('%Y%m%d%H%M')
        print('  saved', v['id'], len(audio) // 1024, 'KB voice', vid, flush=True)
    json.dump(index, open(index_path, 'w'), indent=1)

if __name__ == '__main__':
    main()
