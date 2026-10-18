---
name: tablefolk-scenario
description: Create, edit and share tablefolk.world scenarios - small 3D worlds where in-browser LLM characters (Gemma, WebGPU) talk and act, described as JSON and shared as a #s= link. Use when the user wants a tablefolk.world map, scene, game, puzzle or roleplay ("make a tablefolk map with a shopkeeper and a dragon", "a tavern where X and Y argue"), wants to decode or change a scenario link, or wants to run tablefolk.world locally.
---

# tablefolk.world scenarios

A scenario is a JSON object: a base map, objects, one or more LLM characters,
the commands they may use, and an optional goal. The JSON is compressed into the
URL hash (`#s=...`), so **the link is the scenario**: no server, nothing to upload.
Opening the link builds the world and starts it.

Typical job: the user describes a scene → you write the JSON → run
`scripts/scenario_link.py encode` → hand the user the link (and save the JSON
next to it so it can be edited later).

## Run the app

```bash
git clone --depth 1 https://github.com/runvnc/tablefolk.git
cd tablefolk
python3 tablefolk_server.py 8000        # serves http://localhost:8000/app/
```

- Needs desktop Chrome or Edge with WebGPU. The first time a character speaks,
  the page asks before downloading the model (Gemma 4 E2B, ~2 GB, cached
  afterwards in the browser).
- A link works on any host serving the app; `scenario_link.py --base` sets it
  (default `http://localhost:8000/app/`).
- Open links in the user's own browser (`xdg-open`, `open`, `start`) or just
  print them. Never approve the model download on the user's behalf.

## Make a link

```bash
python3 scripts/scenario_link.py encode scene.json                 # prints the link
python3 scripts/scenario_link.py encode scene.json --base https://example.com/app/
python3 scripts/scenario_link.py decode '<link>'                   # back to JSON
python3 scripts/scenario_link.py encode scene.json --html scene.html   # + a page that opens it (double-click)
```

`encode` prints warnings for obvious mistakes. Layout problems (an unknown word
in a map line, a placement that had to be relaxed) only show in the app, in the
🎯 Scenario pane's "layout notes".

In the app, the 🎯 **Scenario** pane is the editor: example picker, JSON box,
map-lines box, seed / re-roll, **Play**, **Copy link**, **From current world**
(exports whatever you built in the sandbox, with exact positions) and
**Generate** (the loaded model writes map lines from a one-line description).

## Format

```jsonc
{
  "v": 1,
  "title": "The Stubborn Shopkeeper",
  "subtitle": "",                  // banner text for open scenarios (no goal)
  "intro": "Mog runs the only shop on the island.",   // shown on load
  "seed": 7,                       // layout randomness; same JSON + seed = same map
  "base": "plain",                 // plain (blank board, default) | island | clearing | dungeon
  "size": [23, 17],                // board cells [cols, rows], odd, 5-63 (default 23x17)
  "lighting": "bright",            // or "night"
  "walls": "tabletop",             // or "modern" (painted panels) | "block"
  "floor": "stone",                // optional: paint the whole floor (materials below)
  "campfire": true,                // island: false drops its campfire; plain: true adds one
  "pathfinding": true,             // false: walks go straight and stop at walls (maze puzzles)
  "safety": false,                 // true: crisis-line banner if a message mentions self-harm
  "player": { "name": "Traveller", "gold": 20, "items": [], "at": [0, 3] },
                                   // + "avatar": false, "model": rogue|knight|mage|ranger|barbarian|critter
  "allowed": ["say", "sell", "inventory", "emote"],
  "agents": [{
    "id": "mog",                   // 1-24 chars [A-Za-z0-9_-]; also the name used in map lines
    "personality": "a grumpy shopkeeper. The magic sword costs 50 gold, never below 40.",
    "quest": "",                   // optional private aim
    "model": "critter",              // critter (default) | woman | rogue | knight | mage | ranger | barbarian
    "style": "grumpy old shopkeeper",   // what the character is, for its prompt
    "inventory": { "gold": 0, "items": [{ "name": "magic sword", "qty": 1 }] },
    "at": [0, -3], "facing": "s",  // optional; or place it with a map line
    "ttsVoiceId": "builtin:jean",  // alba azelma cosette eponine fantine javert jean marius
    "thinking": false, "showThoughts": true,
    "chaos": 10,                   // 0-100 randomness
    "fireballTemptation": 0        // 0-100, only matters with spell.fireball allowed
  }],
  "objects": [{ "type": "barrel", "x": 2, "z": 1 }],   // exact positions; "ry" (radians) turns it, notes take "text"
  "paint": [{ "x": 0, "z": 0, "mat": "water" }],        // exact floor tiles
  "packs": ["https://example.com/my-pack/pack.json"],  // optional extra asset packs (below)
  "map": [                                             // or let the layout engine place things
    "place counter against north_wall",
    "place mog behind counter",
    "place barrel x3 beside counter",
    "place note \"No refunds\" in_front_of counter"
  ],
  "goal": {                        // omit (or null) for an open scenario that never ends
    "text": "Get the magic sword. You only have 20 gold.",
    "win":  { "player_has": "magic sword" },
    "lose": { "turns_over": 12 },  // or "maxTurns": 12
    "winText": "Mog grumbles and hands it over.",
    "loseText": "Mog closes the shop for the day.",
    "score": "player_gold"         // player_gold | turns | turns_left | agent_gold:<id>
  }
}
```

The personality is the character's whole brief, and the models are small:
write it in plain second-person-friendly sentences, state hard facts (prices,
secrets, what it will and won't do) explicitly, and mention commands by name
when the character should use them ("Use give() to hand something over.").

### The board and coordinates

The world is a board of 1x1 tiles standing in the sea, `"size": [cols, rows]`
cells (odd numbers). Cells run from -(cols-1)/2 to (cols-1)/2 in x and
likewise in z, around the centre (0, 0); with the default 23 x 17, x -11..11
and z -8..8. `sea` cells are holes: that's how you draw coasts and islands.
**north = -z, south = +z, east = -x, west = +x.** The player starts at the
south by default. Wide items (`table bench workbench desk sofa`) take two
cells, a house about 2x2.

`base: "island"` gives a ready 15 x 13 island (grass, trees, house, boulders,
fence, lantern, campfire, flowers) as ordinary objects to build on;
`"clearing"` the same land with only the campfire; `"dungeon"` a stone floor
and a ring of walls. The default `"plain"` is the blank board.

### Objects (`objects[].type` and map-line things)

- props: `crate barrel mushroom lamp wall note`, `counter` (a row of three walls)
- items: `chest table bench stool workbench cauldron anvil weapon_stand axe
  pickaxe bucket bag potion scroll coin_pile apple_crate carrot_crate`
- modern: `desk office_chair armchair sofa coffee_table floor_lamp plant
  bookshelf` (front faces south; `ry` turns them)
- outdoors: `tree house boulder campfire lantern fence signpost` (solid),
  `flowers grass_tuft lily_pad` (decoration: no collision, characters don't
  see them; lily pads float on sea cells), `fence` is one cell along x (`ry`
  1.5708 turns it north-south)
- `light`: an invisible point light, `{"type": "light", "x": 2, "z": -1,
  "color": "#ffb060", "intensity": 3, "range": 6, "y": 2}`. Campfires and
  lanterns light themselves; add lights for lamps, windows, magic.

The authoritative list is the core pack, `assets/pack.json` in the repo
(item types, sizes, aliases); read it when unsure. More types can come from
extra **asset packs**: a folder with a `pack.json` (glTF/GLB files plus size,
physics and aliases per item, paths relative to the manifest) on any static
host with CORS. List them in the scenario's `"packs"` and use their types like
built-in ones. Format: `docs/SCENARIOS.md` section 4c; minimal example:
`tools/browser-test/test-pack/pack.json`.

### Floor materials (`floor`, `paint`, map `paint`)

`stone flagstone dirt wood sand grass water lava` and modern `oak tile
concrete carpet`. Water and lava block walking and placement. `sea` removes
the tile (a hole to the sea; walking onto it is a fall).

### Commands (`allowed`)

`say walk face look touch push pull carry drop throw dig build repair panic
emote note give give_quest sell inventory goal spell.push spell.spark
spell.fireball`. Allow only what the scene needs: fewer choices make small
models behave. `say` is almost always wanted; add `walk` for movement, `give`
/ `sell` / `inventory` for trading, `emote` for flavour.

## ASCII grid (exact rooms, easiest to write)

```jsonc
"grid": [
  "#########",
  "#KK...v.#",
  "#.tt..F.#",
  "#.1...F.#",
  "#RRR..2.#",
  "#x..N.~~#",
  "#..Y..~~#"
],
"legend": { "R": "carpet", "x": "chest on stone", "N": "note \"Quiet please\"" }
```

One glyph per cell, **top row = north, left = west**, centred on the board;
odd sizes centre exactly. Without `"size"` the board is the grid plus two cells
on every side (or exactly the grid if its outer ring is all `-` sea). `.` =
empty. Defaults: floors `~` water (a pond) `,` grass `:` dirt `^` stone `&`
lava `=` wood `_` oak, `-` sea (a hole); outdoors `%` tree `H` house `r`
boulder `X` campfire `f` fence `I` signpost `j` lantern `*` flowers `;`
grass_tuft `q` lily_pad; objects `#` wall `C` crate `B` barrel
`M` mushroom `L` lamp `N` note `h` chest `w` workbench `t` table `n` bench `s`
stool `o` cauldron `a` anvil `W` weapon_stand `/` axe `p` pickaxe `u` bucket `b`
bag `P` potion `S` scroll `$` coin_pile `D` desk `c` office_chair `A` armchair
`F` sofa `T` coffee_table `l` floor_lamp `v` plant `K` bookshelf; `1`-`9` = the
agents in order; `Y` = player. `legend` maps extra glyphs to an object, a
material, an agent id, `"<thing> on <material>"` or `note "text"`. Wide items
(`table bench workbench desk sofa`) use two equal glyphs side by side (`tt`) or
stacked (turned). Things needing rotation go in `objects` with `ry`. Grid,
`objects` and `map` lines combine (grid first). Prefer the grid for rooms and
buildings; use map lines for loose, natural scatter.

## Map lines (layout engine)

```
place <thing> [xN] [row|cluster|scattered] [<placement>]
paint <material> [xN] [<placement>]
path from <ref|area> to <ref|area>        ("stone path from ...")
floor <material>
```

- placement: `at center|north|south|east|west|northeast|northwest|southeast|southwest|random`,
  `against north_wall` (any edge), `beside X`, `near X`, `behind X`, `in_front_of X`, `around X`
- X is anything placed earlier, an agent id, `player`, `house` or `campfire`
- `place <agent id> ...` positions a character; `place player ...` the avatar
- unknown words are ignored and reported; impossible placements are relaxed,
  never fatal. Change `seed` to re-roll a layout.

Use explicit `objects` for rooms that must look exact (walls, a furnished
office); use map lines for quick, natural-looking scenes. They can be mixed:
explicit objects go first and the layout engine works around them.

## Goals

Predicates are plain JSON (a link can't run code):

| predicate | example |
|---|---|
| `player_has` | `"magic sword"` or `["magic sword", 2]` |
| `player_gold` | `[">=", 10]` |
| `agent_has` | `["mog", "magic sword"]` |
| `agent_gold` | `["mog", ">=", 30]` |
| `agent_near` | `["mog", "campfire", 1.5]` (target: agent, object type, scenery or `[x, z]`) |
| `object_near` | `["barrel", "house", 2]`; `["barrel", "campfire", 2, 2]` = at least 2 |
| `object_count` | `["barrel", "<", 3]` |
| `prop_state` | `["crate", "burned"]` |
| `said` | `["mog", "deal"]` (substring; `"any"` = anyone) |
| `turns_over` | `12` (one character reply = one turn) |
| combinators | `{"all": [...]}`, `{"any": [...]}`, `{"not": {...}}` |

Item names match loosely ("potion" matches "healing potion").

## Example: two characters, open-ended

```json
{
  "v": 1, "title": "The Last Ferry", "seed": 4, "base": "clearing", "lighting": "night",
  "intro": "The last ferry left an hour ago. Two strangers wait at the dock with you.",
  "subtitle": "Find out who they are.",
  "player": { "name": "Traveller", "gold": 5, "items": [] },
  "allowed": ["say", "walk", "emote", "give"],
  "agents": [
    { "id": "ines", "model": "woman", "style": "tired ferry clerk", "ttsVoiceId": "builtin:fantine",
      "personality": "Ines, the ferry clerk. You missed your own ferry home and are annoyed about it, but you are kind to travellers. You know Bram is lying about being a fisherman." },
    { "id": "bram", "model": "rogue", "style": "nervous man in a wet coat", "ttsVoiceId": "builtin:javert",
      "personality": "Bram. You say you are a fisherman, but you are a smuggler hiding a small chest. You change the subject when asked about the chest." }
  ],
  "map": [
    "paint water x10 row against north_wall",
    "place lamp x2 row beside water",
    "place ines near lamp",
    "place chest at east",
    "place bram beside chest",
    "place crate x3 cluster at west"
  ],
  "goal": null
}
```

More examples live in the app (`app/scenario.js`, `EXAMPLES`: shop, guard,
lure, jailer, fire drill, maze, the Sounding Board office) and the full
reference is `docs/SCENARIOS.md` in the repository.

## Checklist before handing over a link

1. Every agent has a unique `id` and a `personality`; ids used in map lines and
   goals match exactly.
2. `allowed` contains every command the personality or goal relies on (a goal
   of `player_has` needs `give` or `sell`).
3. Items a goal refers to exist in some inventory or on the map.
4. `encode` printed no warnings. Save the JSON (e.g. `scenarios/<slug>.json`)
   next to the link so it can be edited and re-encoded.
