#!/usr/bin/env python3
"""Turn a tablefolk.world scenario JSON file into a playable link, or a link back into JSON.

  scenario_link.py encode my-scenario.json [--base URL]   -> prints the link
  scenario_link.py decode '<link or code>'                -> prints the JSON

The link format is the app's own: #s=<base64url(deflate-raw(JSON))>, no padding.
Only the standard library is used.
"""
import argparse, base64, html, json, re, sys, zlib

DEFAULT_BASE = 'http://localhost:8000/app/'
BASES = {'island', 'clearing', 'dungeon', 'plain'}
# procgen.js places ("in"): dungeon rooms, village buildings and spots.
ROOMS = {'entrance', 'throne', 'lair', 'treasure', 'library', 'shrine', 'barracks', 'storage', 'kitchen', 'prison', 'crypt', 'alchemy', 'room'}
BUILDINGS = {'tavern', 'smithy', 'shop', 'temple', 'alchemist', 'guardhouse', 'library', 'house', 'stable', 'square', 'pond', 'garden'}
FOREST = {'clearing', 'camp', 'ruins', 'grove', 'shrine', 'pond', 'hut', 'cave', 'meadow'}
FARM = {'yard', 'farmhouse', 'barn', 'pasture', 'field', 'orchard', 'coop'}
CAVE = {'entrance', 'lair', 'crystals', 'grotto', 'pool', 'treasure', 'bones', 'camp', 'mine', 'chamber'}
# procgen.js applyToScenario KINDS: kind (and its other names) -> its places
GEN_KINDS = {'dungeon': ROOMS, 'castle': ROOMS, 'keep': ROOMS, 'fortress': ROOMS, 'crypt': ROOMS, 'tomb': ROOMS, 'catacombs': ROOMS,
             'village': BUILDINGS, 'town': BUILDINGS, 'hamlet': BUILDINGS, 'forest': FOREST, 'woods': FOREST, 'wilds': FOREST, 'wilderness': FOREST,
             'farm': FARM, 'farmstead': FARM, 'cave': CAVE, 'caves': CAVE, 'cavern': CAVE, 'mine': CAVE}
# jobs/<id>/job.json (built in); a package or a URL may bring others
JOBS = {'farmer', 'baker', 'innkeeper', 'cook', 'smith', 'woodcutter', 'miner', 'hunter', 'fisher', 'herder', 'merchant', 'guard', 'healer', 'ratcatcher', 'scholar', 'child', 'labourer', 'idler'}
THREAT_KINDS = {'raid', 'rats', 'bandits'}
# app.js FIGURES + AVATAR_MODELS (the bodies an agent's or the player's "model" may name);
# a pack or package can bring more: list their ids in the scenario's "bodies"
MODELS = {'critter', 'woman', 'rogue', 'knight', 'mage', 'ranger', 'barbarian', 'woodsman', 'huntress', 'peasant', 'peasant_woman', 'adventurer',
          'adventurer_woman', 'hooded', 'king', 'farmer', 'villager', 'witch', 'wizard', 'swordswoman', 'sorceress', 'swordsman', 'wanderer',
          'villager_woman', 'dwarf', 'elf', 'priest', 'guard', 'merchant', 'skeleton', 'skeleton_warrior', 'skeleton_farmer', 'zombie', 'goblin',
          'kobold', 'orc', 'troll', 'demon', 'giant', 'rat', 'spider', 'wolf', 'bat', 'dragon', 'ghost', 'slime', 'wyrmling', 'imp',
          'mushroom_warrior', 'bunny', 'snake', 'wasp', 'frog', 'minotaur', 'lizardman', 'werewolf', 'mummy', 'ogre', 'gnoll', 'lich', 'vampire',
          'bear', 'bandit', 'cultist', 'gargoyle', 'dark_knight', 'red_dragon', 'cow', 'bull', 'horse', 'white_horse', 'donkey', 'deer', 'stag',
          'fox', 'dog', 'husky', 'alpaca', 'pig', 'sheep', 'king_classic', 'woodsman_classic', 'huntress_classic', 'peasant_woman_classic',
          'adventurer_classic', 'adventurer_woman_classic', 'villager_classic', 'witch_classic', 'skeleton_classic', 'skeleton_warrior_classic',
          'zombie_classic', 'goblin_classic', 'kobold_classic', 'orc_classic', 'demon_classic', 'giant_classic', 'imp_classic'}
REF = re.compile(r'^(https?://|npm:|gh:)|^[a-z0-9_-]+$', re.I)
TRIGGER_ON = {'flag', 'given', 'start'}
ACTION_KEYS = {'take', 'set', 'say', 'reply', 'act', 'give', 'start', 'workflow', 'stop', 'anim', 'sound'}
STEP_KEYS = {'prompt', 'choose', 'if', 'command', 'await', 'set', 'take', 'menu', 'do'}
COMMANDS = {'say', 'whisper', 'walk', 'face', 'look', 'touch', 'push', 'pull', 'carry', 'drop', 'throw', 'dig', 'build', 'repair',
            'panic', 'emote', 'note', 'give', 'give_quest', 'sell', 'inventory', 'goal', 'spell.push', 'spell.spark', 'spell.fireball', 'attack', 'wield', 'workflow', 'cast', 'steal', 'bandage', 'sing',
            'spell.firebreath', 'spell.lightning', 'spawn', 'remember', 'feel', 'eat', 'drink', 'use', 'put', 'take', 'close', 'paint'}


def encode(obj):
    data = json.dumps(obj, separators=(',', ':'), ensure_ascii=False).encode()
    c = zlib.compressobj(9, zlib.DEFLATED, -15)  # raw deflate, like CompressionStream('deflate-raw')
    raw = c.compress(data) + c.flush()
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def decode(code):
    m = re.search(r's(?:cenario)?=([A-Za-z0-9_-]+)', code)
    code = m.group(1) if m else code.strip()
    raw = base64.urlsafe_b64decode(code + '=' * (-len(code) % 4))
    return json.loads(zlib.decompress(raw, -15))


def check(obj):
    """Cheap sanity checks; the app itself is lenient and reports layout problems in the pane."""
    problems = []
    if not isinstance(obj, dict): return ['scenario must be a JSON object']
    if obj.get('v', 1) != 1: problems.append('"v" must be 1')
    if obj.get('base', 'plain') not in BASES: problems.append(f'"base" must be one of {sorted(BASES)}')
    ids = [a.get('id') for a in obj.get('agents', [])]
    if not ids: problems.append('no agents: add at least one character with an "id"')
    for i in ids:
        if not i or not re.fullmatch(r'[A-Za-z0-9_-]{1,24}', str(i)): problems.append(f'agent id {i!r}: use 1-24 letters, digits, _ or -')
    if len(set(ids)) != len(ids): problems.append('agent ids must be unique')
    has_packages = bool(obj.get('packages'))
    for where, cmds in [('"allowed"', obj.get('allowed', []))] + [(f'agent {a.get("id")!r} "allowed"', a['allowed']) for a in obj.get('agents', []) if 'allowed' in a]:
        if not isinstance(cmds, list): problems.append(f'{where} must be a list of commands'); continue
        for c in cmds:
            # a package may bring commands (a module's "commands"): unknown names pass when it loads one
            if c not in COMMANDS and not (has_packages and re.fullmatch(r'[a-z][a-z0-9_]{0,31}', str(c))):
                problems.append(f'{where}: unknown command {c!r} (known: {" ".join(sorted(COMMANDS))}; a package can bring more)')
    # bodies: built in, or listed in "bodies" (the ids its packs and packages bring)
    bodies = obj.get('bodies', [])
    if not isinstance(bodies, list) or not all(isinstance(b, str) and re.fullmatch(r'[a-z][a-z0-9_]{0,31}', b) for b in bodies):
        problems.append('"bodies" must be a list of body ids (lowercase letters, digits, _) that its packs and packages bring'); bodies = []
    for who, m in [(f'agent {a.get("id")!r}', a.get('model')) for a in obj.get('agents', [])] + [('player', (obj.get('player') or {}).get('model'))]:
        if m and m not in MODELS and m not in bodies:
            problems.append(f'{who} "model": {m!r} is not a built-in body (a package\'s body must be listed in "bodies"; else the game uses a critter)')
    for key in ('packages', 'packs'):
        v = obj.get(key, [])
        if not isinstance(v, list) or not all(isinstance(r, str) and r for r in v): problems.append(f'"{key}" must be a list of references (strings)')
    for r in obj.get('packages', []) if isinstance(obj.get('packages'), list) else []:
        if isinstance(r, str) and not REF.match(r): problems.append(f'package {r!r}: a built-in name, a URL, npm:<name>@<version> or gh:<user>/<repo>@<tag>')
    problems += check_script(obj)
    # Goal predicates whose first argument is a character id.
    def walk_goal(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ('agent_has', 'agent_gold', 'agent_near', 'said') and isinstance(v, list) and v:
                    who = v[0]
                    if who not in ids and not (k == 'said' and who == 'any') and not (k == 'agent_near' and who == 'player'):
                        problems.append(f'goal {k}: {who!r} is not an agent id ({", ".join(map(str, ids))})')
                walk_goal(v)
        elif isinstance(node, list):
            for v in node: walk_goal(v)
    walk_goal(obj.get('goal'))
    import os
    skills_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'skills')
    for ref in set(obj.get('skills', []) + [r for a in obj.get('agents', []) for r in a.get('skills', [])] + (obj.get('player') or {}).get('skills', [])):
        r = str(ref)
        if not (r.startswith(('http://', 'https://', 'npm:', 'gh:')) or os.path.exists(os.path.join(skills_dir, r, 'skill.json')) or r in ('magic', 'healing', 'thievery', 'bard', 'trade', 'painting') or obj.get('packages')):
            problems.append(f'skill {r!r}: not a built-in skill (magic healing thievery bard trade painting), a URL / npm: / gh: reference, or from a package')
    for u in obj.get('packs', []):
        if not isinstance(u, str) or not u.endswith('.json'):
            problems.append(f'"packs": {u!r} should be the URL of a pack.json')
    gen = obj.get('generate')
    if gen is not None:
        kind = str((gen or {}).get('kind', 'dungeon')).lower() if isinstance(gen, dict) else None
        if kind not in GEN_KINDS: problems.append('"generate" must be {"kind": "dungeon" | "village" | "forest" | "farm" | "cave", ...}')
        known = GEN_KINDS.get(kind, ROOMS)
        for thing in obj.get('agents', []) + obj.get('objects', []) + [obj.get('player') or {}]:
            for key in ('in', 'home', 'workplace'):
                where = thing.get(key)
                if where is not None and re.sub(r'\s+\d+$', '', str(where).lower()) not in known and not (key != 'in' and re.sub(r'\s+\d+$', '', str(where).lower()) in ('house',)):
                    problems.append(f'"{key}": {where!r} is not a {kind} place ({" ".join(sorted(known))})')
    for a in obj.get('agents', []):
        j = a.get('job')
        if isinstance(j, str) and j.lower() not in JOBS and not j.startswith(('http://', 'https://', 'npm:', 'gh:')) and not has_packages:
            problems.append(f'agent {a.get("id")!r} "job": {j!r} is not a built-in job ({" ".join(sorted(JOBS))}); a package or a URL can bring one')
        if a.get('temper') is not None and a.get('temper') not in ('short', 'normal', 'long'):
            problems.append(f'agent {a.get("id")!r} "temper" must be short, normal or long')
    for t in obj.get('threats', []) or []:
        if not isinstance(t, dict) or not isinstance(t.get('kind'), str): problems.append(f'threat {t!r} needs a "kind"')
        elif t['kind'] not in THREAT_KINDS and not has_packages: problems.append(f'threat kind {t["kind"]!r}: built in are raid, rats, bandits (a package can add more)')
    tm = obj.get('time')
    if tm is not None and not (isinstance(tm, str) and re.fullmatch(r'\d{1,2}:\d{2}', tm)): problems.append('"time" must be "HH:MM", e.g. "07:00"')
    for o in obj.get('objects', []):
        if gen is not None and o.get('in') is not None and o.get('type'): continue
        if not all(isinstance(o.get(k), (int, float)) for k in ('x', 'z')) or not o.get('type'):
            problems.append(f'object {o!r} needs "type", numeric "x" and "z"')
    grid = obj.get('grid') or []
    if isinstance(grid, str): grid = grid.split('\n')
    size = obj.get('size')
    if size is not None and not (isinstance(size, list) and len(size) == 2 and all(isinstance(n, int) and 5 <= n <= 63 for n in size)):
        problems.append('"size" must be [cols, rows], whole numbers 5-63 (odd numbers centre exactly)')
    gw, gh = max(map(len, grid), default=0), len(grid)
    legend = obj.get('legend') or {}
    for d in sorted({ch for row in grid for ch in row if ch in '123456789' and ch not in legend}):
        if int(d) > len(ids): problems.append(f'"grid": digit {d} but only {len(ids)} agent(s); digits are the agents in order')
    if gw > 63 or gh > 63:
        problems.append(f'"grid" is {gw} x {gh}; the board is at most 63 x 63')
    elif grid and isinstance(size, list) and len(size) == 2 and (gw > size[0] or gh > size[1]):
        problems.append(f'"grid" is {gw} x {gh} but "size" is {size[0]} x {size[1]}; cells outside the board are dropped')
    if not isinstance(obj.get('map', []), list): problems.append('"map" must be a list of lines')
    return problems


def check_script(obj):
    """Structural checks of menus, workflows and triggers (the game's @tablefolk/script validate does the rest at load)."""
    problems = []
    def actions(a, where):
        if a is None: return
        if not isinstance(a, dict): problems.append(f'{where}: "do" must be an object of actions'); return
        for k in a:
            if k not in ACTION_KEYS: problems.append(f'{where}: unknown action {k!r} (known: {" ".join(sorted(ACTION_KEYS))})')
        if 'act' in a and not isinstance(a['act'], (str, list)): problems.append(f'{where}: "act" is a command line or a list of them')
        if 'set' in a and not isinstance(a['set'], dict): problems.append(f'{where}: "set" is an object of flags')
    def menu(m, where):
        if isinstance(m, list):
            for i, x in enumerate(m): menu(x.get('menu', x) if isinstance(x, dict) else x, f'{where}[{i}]')
            return
        if isinstance(m, str): return
        if not isinstance(m, dict) or not isinstance(m.get('items'), list): problems.append(f'{where}: a menu needs "items" (a list of choices)'); return
        for i, it in enumerate(m['items']):
            if not isinstance(it, dict) or not (it.get('label') or it.get('say')): problems.append(f'{where}.items[{i}]: a choice needs a "label"'); continue
            actions({k: v for k, v in it.items() if k in ACTION_KEYS}, f'{where}.items[{i}]')
    menus = obj.get('menus', {})
    if not isinstance(menus, dict): problems.append('"menus" must be an object: { id: menu }')
    else:
        for mid, m in menus.items(): menu(m, f'menus.{mid}')
    for a in obj.get('agents', []):
        if a.get('menu') is not None: menu(a['menu'], f'agent {a.get("id")!r} "menu"')
    flows = obj.get('workflows', {})
    if not isinstance(flows, dict): problems.append('"workflows" must be an object: { name: { steps: [...] } }')
    else:
        for name, wf in flows.items():
            if not isinstance(wf, dict) or not isinstance(wf.get('steps'), list) or not wf['steps']: problems.append(f'workflows.{name}: needs "steps" (a list)'); continue
            ids = {s.get('id') for s in wf['steps'] if isinstance(s, dict) and s.get('id')}
            for i, st in enumerate(wf['steps']):
                where = f'workflows.{name}.steps[{st.get("id", i) if isinstance(st, dict) else i}]'
                if not isinstance(st, dict): problems.append(f'{where}: a step is an object'); continue
                if not (set(st) & STEP_KEYS) and not st.get('goto') and not st.get('end'): problems.append(f'{where}: no step kind ({" ".join(sorted(STEP_KEYS))})')
                for k in ('goto', 'then', 'else', 'exit', 'other', 'closed'):
                    t = st.get(k)
                    if isinstance(t, str) and t not in ids and t != '#end': problems.append(f'{where}: "{k}" names no step id {t!r}')
                if 'do' in st: actions(st['do'], where)
                if 'menu' in st: menu(st['menu'], where + '.menu')
    trigs = obj.get('triggers', [])
    if not isinstance(trigs, list): problems.append('"triggers" must be a list')
    else:
        for i, t in enumerate(trigs):
            if not isinstance(t, dict) or t.get('on') not in TRIGGER_ON: problems.append(f'triggers[{i}]: "on" must be one of {" ".join(sorted(TRIGGER_ON))}'); continue
            actions(t.get('do'), f'triggers[{i}]')
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    e = sub.add_parser('encode'); e.add_argument('file', help='scenario JSON file, or - for stdin'); e.add_argument('--base', default=DEFAULT_BASE)
    e.add_argument('--html', metavar='OUT.html', help='also write a page that opens the link (double-click it)')
    d = sub.add_parser('decode'); d.add_argument('link')
    a = ap.parse_args()
    if a.cmd == 'encode':
        obj = json.load(sys.stdin if a.file == '-' else open(a.file))
        for p in check(obj): print('warning:', p, file=sys.stderr)
        base = a.base.split('#')[0]
        link = f'{base}#s={encode(obj)}'
        print(link)
        if a.html:
            title = html.escape(str(obj.get('title', 'Tablefolk scenario')))
            with open(a.html, 'w') as f:
                f.write(f'<!doctype html><meta charset="utf-8"><title>{title}</title>'
                        f'<meta http-equiv="refresh" content="0;url={html.escape(link)}">'
                        f'<p>Opening <a href="{html.escape(link)}">{title}</a>...</p>\n')
    else:
        print(json.dumps(decode(a.link), indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
