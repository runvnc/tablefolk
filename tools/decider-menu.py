"""Strands Decider 2B test: menu choices from what the player said (18 cases).
Needs llama-server on port 8091 with the decider GGUF and decide.py next to this
script (both from huggingface.co/ArminBurkhardt/strands-decider-2B-qwen3.5-v1-2610-GGUF;
in decide.py set SERVER to http://localhost:8091 and HEAD to the head.safetensors path):
    llama-server -m strands-decider-2B-qwen3.5-v1-2610-Q8_0.gguf --embeddings -c 8192 -b 4096 -ub 4096 --port 8091 -ngl 99
    python3 decider-menu.py
Results 2026-11-12 (RTX 2060): brains.md, "Strands Decider".
"""
import sys, time, json
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else '.')
from decide import decide
ITEMS = {"buy": "Buy a sword (30 gold)", "wolves": "Ask about the wolves", "repair": "Get my armour repaired", "hit": "Attack her", "bye": "Leave",
         "none": "None of these: the player wants something else"}
CASES = [('can you fix my armor', 'repair'), ('I need a new blade', 'buy'), ("what's going on with those beasts in the forest", 'wolves'), ('goodbye then', 'bye'),
  ("let's fight", 'hit'), ('how much for a weapon', 'buy'), ('my chainmail is dented', 'repair'), ('heard anything about the howling at night?', 'wolves'),
  ('what is the weather like', 'none'), ('do you sell potions', 'none'), ('tell me a joke', 'none'), ('I have to go now', 'bye'),
  # harder ones
  ('the second one', 'wolves'), ('I will take the blade', 'buy'), ('never mind, see you', 'bye'), ('can I buy a shield', 'none'), ('die, smith!', 'hit'), ('those wolves took my sheep', 'wolves')]
ok = 0; times = []
for text, want in CASES:
    state = f'A game menu. Brakka the smith asks: "What do you need, traveller?" The choices are: ' + '; '.join(f'{i+1}. {v}' for i, v in enumerate(list(ITEMS.values())[:-1])) + f'.\nThe player said: "{text}"'
    t = time.time()
    r = decide(state, {"pick": {"type": "choice", "instructions": "Which choice did the player pick with what they said?", "criteria": ITEMS}})["pick"]
    dt = time.time() - t; times.append(dt)
    good = r["choice"] == want; ok += good
    print(('ok  ' if good else 'MISS'), json.dumps(text).ljust(48), '->', r["choice"].ljust(7), f'conf {r["confidence"]:.2f}', f'p {r["probabilities"][r["choice"]]:.2f}', f'(want {want}) {dt*1000:.0f} ms', flush=True)
print(f'{ok}/{len(CASES)}  median {sorted(times)[len(times)//2]*1000:.0f} ms')
