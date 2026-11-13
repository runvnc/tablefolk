"""Strands Decider 2B test: a character choosing a direction and a command (14 situations).
Needs llama-server on port 8091 with the decider GGUF and decide.py next to this
script (both from huggingface.co/ArminBurkhardt/strands-decider-2B-qwen3.5-v1-2610-GGUF;
in decide.py set SERVER to http://localhost:8091 and HEAD to the head.safetensors path):
    llama-server -m strands-decider-2B-qwen3.5-v1-2610-Q8_0.gguf --embeddings -c 8192 -b 4096 -ub 4096 --port 8091 -ngl 99
    python3 decider-control.py
Results 2026-11-12 (RTX 2060): brains.md, "Strands Decider".
"""
import sys, time, json
sys.path.insert(0, '.')
from decide import decide
DIRS = {"north": "walk north", "east": "walk east", "south": "walk south", "west": "walk west", "stay": "stay where you are"}
CMDS = {"say": "say something to someone nearby", "walk": "walk somewhere", "attack": "attack someone", "give": "give an item or gold to someone",
        "sell": "sell an item to someone who wants to buy", "take": "pick up an item lying nearby", "wait": "do nothing this turn"}
def S(who, goal, around, heard=''):
    return f"You are {who}. Your goal: {goal}\nAround you (you face north):\n{around}" + (f"\nJust now: {heard}" if heard else '')
CASES = [
  (S('Wren, a kind healer', 'reach the well to fetch water', '- east (to your right): the well 4 steps at (4,0)\n- west (to your left): a barrel 2 steps at (-2,0)'), 'east', 'walk'),
  (S('Bram, a guard', 'stop the goblin thief', '- north (ahead): Grub the goblin (hostile, carrying a stolen pie) 1 step at (0,1)'), 'stay', 'attack'),
  (S('Mira, a shy farmer', 'stay safe', '- south (behind you): a wolf (hostile, snarling) 2 steps at (0,-2)\n- north (ahead): the village gate 5 steps at (0,5)'), 'north', 'walk'),
  (S('Tobin, a merchant', 'sell your swords', '- west (to your left): Tess the traveller 1 step at (-1,0)', 'Tess says: "I would like to buy a sword."'), 'stay', 'sell'),
  (S('Old Hale, an innkeeper', 'greet guests', '- south (behind you): Tess the traveller 2 steps at (0,-2)', 'Tess says: "Hello! Is there a room free tonight?"'), 'stay', 'say'),
  (S('Pip, a hungry boy', 'find food', '- west (to your left): an apple 1 step at (-1,0)\n- east (to your right): a rock 3 steps at (3,0)'), 'west', 'take'),
  (S('Wren, a kind healer', 'help the wounded', '- north (ahead): Bram the guard (badly hurt, bleeding) 1 step at (0,1)', 'Bram says: "Please, I need a potion!"'), 'stay', 'give'),
  (S('Bram, a guard', 'guard the gate', '- north (ahead): the gate 1 step at (0,1)\n- nothing else nearby'), 'stay', 'wait'),
  (S('Grub, a goblin thief', 'escape with the pie', '- east (to your right): Bram the guard (angry, sword drawn) 2 steps at (2,0)\n- west (to your left): the forest edge 6 steps at (-6,0)'), 'west', 'walk'),
  (S('Lysa, a blacksmith', 'go home to the smithy', '- south (behind you): the smithy 8 steps at (0,-8)\n- north (ahead): the market 3 steps at (0,3)'), 'south', 'walk'),
  (S('Tess, a traveller', 'pay your debt to Hale', '- east (to your right): Old Hale the innkeeper 1 step at (1,0)', 'Old Hale says: "You still owe me 10 gold for the room."'), 'stay', 'give'),
  (S('Fen, a scout', 'find the lost sheep', '- north (ahead): a sheep (lost, bleating) 5 steps at (0,5)\n- east (to your right): a fence 2 steps at (2,0)'), 'north', 'walk'),
  (S('Mira, a shy farmer', 'tend your field', '- north (ahead): your field 1 step at (0,1)', 'A stranger says: "Nice weather today, isn\'t it?"'), 'stay', 'say'),
  (S('Bram, a guard', 'keep the peace', '- west (to your left): Tess the traveller (friendly, smiling) 1 step at (-1,0)'), 'stay', 'say'),
]
okd = okc = 0; times = []
for state, wd, wc in CASES:
    t = time.time()
    r = decide(state, {"dir": {"type": "choice", "instructions": "Which way should you go now?", "criteria": DIRS},
                       "cmd": {"type": "choice", "instructions": "What should you do now?", "criteria": CMDS}})
    dt = time.time() - t; times.append(dt)
    d, c = r["dir"], r["cmd"]; okd += d["choice"] == wd; okc += c["choice"] == wc
    who = state.split('.')[0][8:]
    print(f'{who[:28]:28} dir {d["choice"]:5} ({d["confidence"]:.2f}) {"ok  " if d["choice"]==wd else "MISS "+wd:9} cmd {c["choice"]:6} ({c["confidence"]:.2f}) {"ok" if c["choice"]==wc else "MISS "+wc}  {dt*1000:.0f} ms', flush=True)
print(f'direction {okd}/{len(CASES)}, command {okc}/{len(CASES)}, median {sorted(times)[len(times)//2]*1000:.0f} ms (two questions)')
