#!/usr/bin/env python3
# On the rented box: a llama-server (native) on URL; thinking vs no thinking on 5 game prompts (brains.md).
# think.py URL: 5 game-style prompts, thinking (effort 0, chat) vs no thinking (raw prompt ending in
# <|message_model|><|content_text|>, so the model writes the answer message directly).
import json, sys, time, urllib.request
URL = sys.argv[1]
SYS = ('You are {who}. {about} Answer with exactly one action: say("..."), give(item, name), walk(place), '
       'attack(name) or wait(). Keep speech under 25 words.')
CASES = [
    ('Greta, the innkeeper of Hearthvale', 'Stew costs 5 gold; never sell under 4. You are warm but drive a hard bargain.',
     'Player (wren): Greta, will you take 3 gold for a bowl of stew?'),
    ('Hector, the village guard', 'You distrust strangers. A wolf was seen at the north gate an hour ago.',
     'Player (stranger): Out of my way, guard, I am going north.'),
    ('Rosa, the baker', 'You owe Tam 2 gold. You have bread, 3 loaves. Tam is standing next to you.',
     'Tam: Rosa, you still owe me 2 gold from yesterday!'),
    ('Odo, a farmer', 'A goblin is attacking you right now; you hold a pitchfork. Your house is to the east.',
     'Goblin: Give me your apples or I take your head!'),
    ('Maren, the herbalist', 'You know the secret: the old oak hides a chest of silver. Never reveal it.',
     'Player (wren): Maren, is there any treasure around the village? I will pay you 10 gold to know.'),
]
def post(path, body):
    req = urllib.request.Request(URL + path, json.dumps(body).encode(), {'Content-Type': 'application/json'})
    t = time.time(); r = json.load(urllib.request.urlopen(req, timeout=600)); return r, time.time() - t
for who, about, user in CASES:
    sysmsg = SYS.format(who=who, about=about)
    msgs = [{'role': 'system', 'content': sysmsg}, {'role': 'user', 'content': user}]
    r, dt = post('/v1/chat/completions', {'messages': msgs, 'max_tokens': 700, 'temperature': 0.2,
                                          'chat_template_kwargs': {'reasoning_effort': 0.0}})
    m = r['choices'][0]['message']
    print(f"THINK  {dt:5.1f}s {r['usage']['completion_tokens']:4d} tok | {(m.get('content') or '').strip()[:150]}")
    p, _ = post('/apply-template', {'messages': msgs, 'chat_template_kwargs': {'reasoning_effort': 0.0}})
    r, dt = post('/completion', {'prompt': p['prompt'] + '<|message_model|><|content_text|>', 'n_predict': 80, 'temperature': 0.2,
                                 'stop': ['<|end_message|>', '<|content_model_end_sampling|>', '<|message_'], 'cache_prompt': True})
    print(f"NOTHINK{dt:5.1f}s {r['tokens_predicted']:4d} tok | {r['content'].strip()[:150]}")
    print('   --', who.split(',')[0], '|', user[:70])
