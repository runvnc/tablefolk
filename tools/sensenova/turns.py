#!/usr/bin/env python3
"""Game-shaped turns against a llama-server (brains.md, "SenseNova-Loop-9B").

The innkeeper prompt of tools/wllama-inkling/inkling-test.html (~3,000 tokens
of shared prefix), in SenseNova's ChatML: prime the prefix once (a hybrid model
rolls back only to checkpoints, so a checkpoint must sit at the prefix's end),
then three player lines. Thinking off = the template's empty think block.
  turns.py [http://127.0.0.1:8081] [--think] [--n=64] [--noprime]
Prints one JSON line per call (wall seconds, tokens read / reused, tok/s, text).
"""
import json, sys, time, urllib.request

args = [a for a in sys.argv[1:] if not a.startswith('--')]
URL = (args[0] if args else 'http://127.0.0.1:8081').rstrip('/')
THINK = '--think' in sys.argv
N = next((int(a[4:]) for a in sys.argv if a.startswith('--n=')), 64)

names = ['rosa', 'tam', 'odo', 'maren', 'hector', 'brann', 'jory', 'wren']
lines = [f"[{8 + i // 6:02d}:{(i * 7) % 60:02d}] {names[i % 8]} walks to the well near the bakery, looks at the apples in the cart, "
         f"and says to {names[(i + 3) % 8]}: \"The harvest is thin this year; bread costs {2 + i % 4} gold now.\"" for i in range(70)]
system = ('You are Greta, the innkeeper of Hearthvale. You are warm but drive a hard bargain. Stew costs 5 gold; never sell under 4. '
          'Answer with one action: say("..."), give(item, name), walk(place) or wait(). Keep it under 30 words.\n\nWhat happened today:\n' + '\n'.join(lines))
users = ["Player (wren): Greta, I'd like a bowl of stew. Will you take 3 gold?",
         'Player (wren): Fine. What about 4 gold, and you tell me the news?',
         'Player (tam): Greta! Did you see the crows in the orchard?']
prefix = f'<|im_start|>system\n{system}<|im_end|>\n'


def call(prompt, n):
    body = json.dumps({'prompt': prompt, 'n_predict': n, 'temperature': 0.2, 'cache_prompt': True,
                       'stop': ['<|im_end|>', '<|im_start|>']}).encode()
    t = time.time()
    r = json.load(urllib.request.urlopen(urllib.request.Request(URL + '/completion', body, {'Content-Type': 'application/json'}), timeout=900))
    tm = r.get('timings', {})
    return {'wall_s': round(time.time() - t, 2), 'read': tm.get('prompt_n'), 'reused': tm.get('cache_n'),
            'read_tps': round(tm.get('prompt_per_second') or 0, 1), 'written': tm.get('predicted_n'),
            'write_tps': round(tm.get('predicted_per_second') or 0, 1), 'text': r.get('content', '')[:300]}


if '--noprime' not in sys.argv:
    print(json.dumps({'prime': call(prefix, 1)}), flush=True)
for u in users:
    opener = '<think>\n' if THINK else '<think>\n\n</think>\n\n'
    print(json.dumps(call(prefix + f'<|im_start|>user\n{u}<|im_end|>\n<|im_start|>assistant\n{opener}', N * (8 if THINK else 1))), flush=True)
