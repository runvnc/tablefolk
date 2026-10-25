---
name: tablefolk-scenario
description: Create, edit and share tablefolk.world scenarios - small 3D worlds where in-browser LLM characters (Gemma, WebGPU) talk and act, described as JSON and shared as a #s= link. Use when the user wants a tablefolk.world map, scene, game, puzzle or roleplay ("make a tablefolk map with a shopkeeper and a dragon", "a tavern where X and Y argue"), wants to decode or change a scenario link, or wants to run tablefolk.world, its world builder or server locally.
---

# tablefolk.world scenarios

A scenario is a JSON object: a map, objects, one or more LLM characters, the
commands they may use, and an optional goal. The JSON is compressed into the
URL hash (`#s=...`), so **the link is the scenario**: no server, nothing to
upload. Opening the link builds the world and starts it.

Typical job: the user describes a scene → you write the JSON → run
`scripts/scenario_link.py encode` → hand the user the link the script printed
(and save the JSON next to it, e.g. `scenarios/<slug>.json`, so it can be
edited and re-encoded).

This file is the overview. The details are in `reference/`, one chapter per
topic: read only the chapters the job needs (table below).

## Run the app

```bash
git clone --depth 1 https://github.com/runvnc/tablefolk.git
cd tablefolk
bun server/server.js 8000               # serves http://localhost:8000/app/
```

- Needs desktop Chrome or Edge with WebGPU. The first time a character
  speaks, the page asks before downloading the model (Gemma 4 E2B, ~2 GB,
  cached afterwards). Never approve the download on the user's behalf.
- Open links in the user's own browser (`xdg-open`, `open`, `start`) or just
  print them.
- `/world/<prompt>` on the server writes a whole world from a prompt
  ([reference/world-builder.md](reference/world-builder.md)).

## Make a link

```bash
python3 scripts/scenario_link.py encode scene.json                 # prints the link
python3 scripts/scenario_link.py encode scene.json --base https://example.com/app/
python3 scripts/scenario_link.py decode '<link>'                   # back to JSON
python3 scripts/scenario_link.py encode scene.json --html scene.html   # + a page that opens it
```

`encode` prints warnings for obvious mistakes; layout problems show only in
the app's 🎯 Scenario pane ("layout notes").

## A small scenario

```json
{
  "v": 1, "title": "The Stubborn Shopkeeper", "seed": 7, "size": [15, 11],
  "intro": "Mog runs the only shop in the village.",
  "player": { "name": "Traveller", "gold": 20 },
  "allowed": ["say", "walk", "emote", "give", "sell", "inventory"],
  "agents": [{
    "id": "mog", "model": "villager", "role": "shopkeeper", "style": "grumpy old shopkeeper",
    "personality": "Mog, the grumpy shopkeeper. You complain about the weather. You never give discounts to people who are rude.",
    "inventory": { "items": ["magic sword", { "name": "healing potion", "qty": 3 }] },
    "prices": { "magic sword": [50, 18], "healing potion": 8 }
  }],
  "map": [
    "floor wood",
    "place counter against north_wall",
    "place mog behind counter",
    "place barrel x3 beside counter",
    "place note \"No refunds\" in_front_of counter"
  ],
  "goal": { "text": "Get the magic sword. You have 20 gold.",
            "win": { "player_has": "magic sword" }, "lose": { "turns_over": 12 } }
}
```

Four ways to make the map, combinable: an ASCII `grid` (exact rooms), map
lines (`map`, quick natural scenes), explicit `objects` / `paint`, and
`generate` (a whole procedural dungeon or village, fastest for big places).

## Chapters (`reference/`)

| chapter | read it for |
|---|---|
| [format.md](reference/format.md) | every field of the JSON: top level, the player, characters, bodies (`model`), a full open-ended example |
| [board.md](reference/board.md) | size and coordinates (north = -z, east = -x), base maps and the island sketch, layers, islets and jetties, floors, walls and `wallHeight`, light, darkness, roofs |
| [grid.md](reference/grid.md) | the ASCII grid: glyph table, legend, wide items, export |
| [map-lines.md](reference/map-lines.md) | the `place` / `paint` / `path` language and how the layout engine places things |
| [generated.md](reference/generated.md) | `generate`: dungeons and villages, room and building kinds, `in`, auto-placement by role, fixed layouts |
| [things.md](reference/things.md) | the object catalogue and where the lists live, walk-in buildings, notes, loot, locked doors, asset packs |
| [characters.md](reference/characters.md) | commands (`allowed`), earshot and whisper, what characters see, sight, trading and prices, minds (mood, needs, memory, lore), voices |
| [combat.md](reference/combat.md) | hit points, weapons, hostile monsters and talking enemies, looting bodies |
| [living.md](reference/living.md) | worlds that live on their own: `live`, `pace`, the director and `events`, writing personalities for it, showcase worlds |
| [goals.md](reference/goals.md) | win / lose predicates and scores |
| [workflows.md](reference/workflows.md) | step-by-step routines that keep small models on track |
| [skills-and-roles.md](reference/skills-and-roles.md) | skills (magic, trade...) and roles (shopkeeper, guard...): using and writing them |
| [packages.md](reference/packages.md) | `tablefolk.json` packages (items, skills, roles, workflows, code), finding and publishing them |
| [links-and-testing.md](reference/links-and-testing.md) | links, the Scenario pane, the example scenarios, testing tactics |
| [playing.md](reference/playing.md) | the app for players: controls, cameras, panes, dev mode, brains, voices, URL flags, the tabletop view |
| [world-builder.md](reference/world-builder.md) | `/world/<prompt>`: where the model runs, the map editor, AI changes, tiles |
| [server.md](reference/server.md) | running the Bun server: settings, routes, the admin page, visitor limits, local models |

To find one thing quickly: `grep -n '^#' reference/*.md` lists every heading;
from the repository root, `python3 tools/docs.py <words>` prints the matching
sections of every chapter.

## Checklist before handing over a link

1. Every agent has a unique `id` and a `personality`; ids used in map lines and
   goals match exactly.
2. `allowed` (or the agent's own list, role or skill) contains every command
   the personality or goal relies on (a `player_has` goal needs `give`,
   `sell`, a chest or a pick-up).
3. Items a goal refers to exist in some inventory or on the map; a locked
   door's key exists somewhere.
4. Islets the player must reach are connected by jetties; anyone who sells or
   gives can be reached on foot.
5. With doors, `wallHeight` is 2.
6. `encode` printed no warnings. Save the JSON next to the link.
