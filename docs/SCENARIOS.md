# Scenarios

A **scenario** is a small, shareable game built on the sandbox: a world
(characters, objects, the player's purse), a set of allowed commands, and a
**goal** the player tries to reach, checked by the game state rather than by the
model. The scenario *is* a link: its JSON is compressed into the URL hash, so
sharing needs no server.

The sandbox is unchanged. Scenario mode is entered only by opening a scenario
link or pressing **Play** in the 🎯 Scenario pane, and saves to its own
localStorage key, so playing a scenario never overwrites your sandbox world.
**Exit scenario** restores the sandbox.

## 1. Format (v1)

```jsonc
{
  "v": 1,
  "title": "The Stubborn Shopkeeper",
  "intro": "Mog runs the only shop on the island.",      // shown on load
  "seed": 7,                                             // layout randomness
  "lighting": "bright",                                  // or "night" (sandbox look)
  "base": "island",                                      // island | clearing | dungeon | plain
  "walls": "tabletop",                                   // or "modern" (smooth painted panels) or "block" (old short cubes)
  "campfire": true,                                      // false hides the campfire (indoor scenes)
  "pathfinding": true,                                   // false: walks go in straight lines and stop at walls
  "floor": "stone",                                      // optional: paint the whole floor
  "paint": [{ "x": 0, "z": 0, "mat": "water" }],          // optional explicit floor tiles
  "packs": ["https://example.com/my-pack/pack.json"],    // optional extra asset packs (section 4c)
  "player": { "name": "Traveller", "gold": 20, "items": [] }, // + "avatar": false, "at": [x, z], "model": rogue|knight|mage|ranger|barbarian|critter
  "allowed": ["say", "sell", "inventory", "emote"],      // command checkboxes
  "agents": [{
    "id": "mog",
    "personality": "grumpy shopkeeper. The magic sword costs 50 gold, never below 40.",
    "quest": "",                      // optional, same as character setup
    "thinking": false, "showThoughts": true, "ttsVoiceId": "builtin:jean",
    "model": "woman",                 // optional body: woman | rogue | knight | mage | ranger | barbarian (default: critter)
    "style": "calm, kind woman",      // optional: what the character is, for its prompt
    "inventory": { "gold": 0, "items": [{ "name": "magic sword", "qty": 1 }] },
    "at": [0, -3], "facing": "s"       // optional; or place it in "map"
  }],
  "grid": ["#####", "#h.1#"], "legend": {},             // ASCII board (section 2b)
  "objects": [{ "type": "barrel", "x": 2, "z": 1 }],    // explicit positions
  "map": [                                               // laid out by code
    "place counter against north_wall",
    "place mog behind counter",
    "place barrel x3 beside counter",
    "place note \"No refunds\" in_front_of counter"
  ],
  "goal": {
    "text": "Get the magic sword. You only have 20 gold.",
    "win":  { "player_has": "magic sword" },
    "lose": { "turns_over": 12 },                       // or "maxTurns": 12
    "winText": "Mog grumbles and hands it over.",
    "loseText": "Mog closes the shop for the day.",
    "score": "player_gold"
  }
}
```

`objects` and `map` can be combined: explicit objects are placed first and the
layout engine works around them. **From current world** in the Scenario pane
exports the live world into this format with explicit positions.

## 2. Map description language

One line per instruction. The tiny model can write these, a person can type
them, and a bigger model can produce them. The game turns them into positions,
so the result is always a valid map.

```
place <thing> [xN] [<placement>]
path from <ref|area> to <ref|area>        (drawn as dirt; "stone path from ...")
paint <material> [xN] [<placement>]
floor <material>
```

- **things**: `crate barrel mushroom lamp wall note "<text>"`, the composite
  `counter` (a row of three wall sections), the items `chest table bench stool
  workbench cauldron anvil weapon_stand axe pickaxe bucket bag potion scroll
  coin_pile apple_crate carrot_crate`, the modern set `desk office_chair
  armchair sofa coffee_table floor_lamp plant bookshelf` (front faces south;
  give `ry` in `objects` to turn them), or an agent id (places that character).
- **floor tiles**: `paint <material> [xN] <placement>` lays painted tiles
  (`stone flagstone dirt wood sand grass water lava`, modern `oak tile concrete
  carpet`; water and lava block
  walking and placement), e.g. `paint water x6 cluster at east` for a pond.
  `floor <material>` paints the whole island. Painted patches can be refs
  (`place lamp beside water`).
- **placements**:
  - `at <area>`, where area is `center`, `north`, `south`, `east`, `west`,
    `northeast`, `northwest`, `southeast`, `southwest` or `random`
  - `against <edge>_wall`: along that edge of the island
  - `beside X`, `near X`, `behind X`, `in_front_of X`, `around X`
  - arrangements, which can be combined with the above: `row`, `cluster`,
    `scattered`, e.g. `place barrel x4 row against west_wall`
- **refs** (X): any thing placed earlier, an agent id, `player` (your avatar),
  or fixed scenery: `house`, `campfire`. `place player ...` positions your
  avatar (default: at south).
- Directions follow the game's convention: north = −Z, south = +Z,
  east = −X, west = +X. "Front" of a thing is the side facing the middle of the
  island; "behind" is the side away from it.

Unknown words are ignored and reported, not fatal, because small models
improvise.

## 2b. ASCII grid

`grid` draws the board directly: one glyph per cell, **top row = north, left =
west**, centred on the board (the whole board is 13 x 11). `.` and spaces are
empty. The grid is laid down first; `objects` and `map` lines are added on top,
and map lines can refer to what the grid placed (`place lamp beside water`).

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

Default glyphs (the same ones characters see in their vision map):

| floor | | objects | | | | | |
|---|---|---|---|---|---|---|---|
| `~` water | `,` grass | `#` wall | `C` crate | `B` barrel | `M` mushroom | `L` lamp | `N` note |
| `:` dirt | `^` stone | `h` chest | `w` workbench | `t` table | `n` bench | `s` stool | `o` cauldron |
| `&` lava | `=` wood | `a` anvil | `W` weapon stand | `/` axe | `p` pickaxe | `u` bucket | `b` bag |
| `_` oak | | `P` potion | `S` scroll | `$` coins | `D` desk | `c` office chair | `A` armchair |
| | | `F` sofa | `T` coffee table | `l` floor lamp | `v` plant | `K` bookshelf | |

- `1`-`9` are the scenario's agents in order; `Y` (or `@`) is the player.
- `legend` adds or overrides single-character glyphs. A value is an object
  type (any loaded pack's too), a floor material, an agent id, `player`,
  `<thing> on <material>` (`"chest on stone"`, `"wren on carpet"`), or
  `note "text"`.
- Two adjacent equal glyphs of a wide item (`table bench workbench desk sofa`)
  make one item across both cells: `tt` side by side, or one above the other
  for a turned one.
- Rotation doesn't fit in a glyph: other things face south (modern furniture)
  or their default. Put a turned piece in `objects` with `ry`.
- Unknown glyphs are skipped and listed in the layout notes; rows of
  different lengths are fine (the longest sets the width).
- The Scenario pane's **→ ASCII grid** button rewrites the JSON in the box
  as a grid (after **From current world**, that exports the sandbox).
  Whatever a glyph can't say exactly (turned or off-cell objects, tinted
  paint) stays in `objects` / `paint`, so the conversion loses nothing.

## 3. Layout engine (deterministic)

1. **Grid.** Integer cells on the island. A cell is *solid* when the island top
   is under its centre and four probes 0.35 out (no overhanging the cliff);
   that's a lookup in the plateau tiles the island builder recorded. It is
   *blocked* when fixed scenery (house, trees, boulders, fence, signpost,
   campfire, decor crates) covers it between ankle and head height, from one
   pass over those meshes' triangles. (Per-cell raycasts froze the tab.)
2. **Parse** lines into entities `{thing, count, relation, ref, arrangement}`.
3. **Order.** Explicit objects first, then lines whose refs are resolved, in
   written order. Lines waiting on a ref are deferred and retried, and `path`
   lines run as soon as both ends exist. `scattered` and `random` lines go last.
   Anything still unresolved is placed with its ref ignored, and a warning is
   recorded.
4. **Candidates → score → pick.** For each entity, take the free solid cells
   that satisfy the relation's hard filter (e.g. `beside` means touching the
   ref's cells, `against north_wall` means the northern band), score them by the
   soft preference (closeness, front/behind side, spread from others), add a
   small seeded jitter, and take the best. The same text and seed always
   produce the same map.
5. **Arrangements.** `row` searches for N free cells in a straight line
   parallel to the edge or ref. `cluster` grows outward from the first cell.
   `scattered` uses farthest-point sampling over the area, keeping a minimum
   gap.
6. **Paths** run A* pathfinding over solid, unblocked cells, reserve the
   result so later objects never block it, and paint it (dirt by default).
7. **Reachability.** Every interactive object must keep at least one free
   neighbouring cell; otherwise it is moved to the nearest cell that has one.
8. **Relaxation.** If a hard filter leaves no candidates, the constraint is
   loosened step by step (`beside` → within 2 → within 4 → anywhere in the area
   → anywhere), and the placement is recorded as a warning rather than a
   failure.
9. **Output** is ordinary world objects and agent positions, built through the
   same spawn functions as the sandbox.

## 4. Goals

`win`, `lose` and the conditions inside them are plain JSON predicates (never
code, so a link can't run script):

| predicate | example |
|---|---|
| `player_has` | `"magic sword"` or `["magic sword", 2]` |
| `player_gold` | `[">=", 10]` |
| `agent_has` | `["mog", "magic sword"]` |
| `agent_gold` | `["mog", ">=", 30]` |
| `agent_near` | `["mog", "campfire", 1.5]` (target: agent, object type, scenery, or `[x, z]`) |
| `object_near` | `["barrel", "house", 2]`, or `["barrel", "campfire", 2, 2]` for "at least 2 barrels" |
| `object_count` | `["barrel", "<", 3]` |
| `prop_state` | `["crate", "burned"]` (any crate) |
| `said` | `["mog", "deal"]` (case-insensitive substring; `"any"` for anyone) |
| `turns_over` | `12` (a turn is one character reply, however many commands it runs) |
| combinators | `{"all": [...]}`, `{"any": [...]}`, `{"not": {...}}` |

`goal` is optional: without one the scenario is **open** (it never ends; the
banner shows `subtitle` and the turn count), e.g. *The Sounding Board*.

Item names match the same way as `sell()` (case-insensitive; "potion" matches
"healing potion"). Goals are checked continuously while a scenario runs; the
first of win or lose to become true ends it. `score` is `player_gold`,
`turns`, `turns_left` or `agent_gold:<id>`, and is shown on the end screen and
in the share text.

## 4b. Base maps, walls and items

- **Base maps**: `island` is the full diorama. `clearing` is the same island
  without the house, trees, boulders, fence/signpost, lantern and decor crates.
  `dungeon` is a clearing without grass tufts, plus a stone floor and a closed
  ring of walls on the rim. The rim walls and floor are ordinary walls and
  paint, so they can be edited and are saved. `plain` is a clearing with the
  grass and tufts gone and a flat smooth floor on top (indoor and modern
  scenes, e.g. *The Sounding Board*). Clearing, dungeon and plain also hide
  the rocks on the plateau. The World pane has the same picker for the
  sandbox.
- **Walls** default to tabletop sections: stone-block walls about 1.1 tall that
  join to neighbouring wall cells. `"walls": "modern"` makes them smooth
  painted panels with a baseboard; `"walls": "block"` keeps the old cubes.
- **Painted floors**: also a click-to-spawn brush in the World pane.
- `give(item)` hands an item to the player when the character actually has it
  in its inventory (otherwise it's just said).
- **Walking** finds a way around walls, painted water/lava and solid props
  (A* over the grid, smoothed into straight legs). Walking to a spot off the
  island still walks straight off the edge (and falls). `"pathfinding": false`
  restores straight-line walking that stops at the first obstacle, which is
  what makes a guide-them-through-the-maze puzzle.

## 4c. Asset packs

Object types (`chest`, `anvil`, ...) come from **asset packs**. A pack is a
folder with a `pack.json` manifest; file paths in it are relative to the
manifest, so a pack can live on any static host that allows CORS (GitHub
Pages, Hugging Face, R2/S3, a home server) or inside the repo.

```jsonc
{
  "id": "my-pack", "name": "My pack", "version": 1,
  "license": "CC0 1.0",
  "items": {
    "big_anvil": {
      "file": "models/anvil.glb",          // glTF/GLB, relative to pack.json
      "w": 1.4, "h": 0.9, "d": 0.8,        // physics box in cells (w >= 1.3 takes two cells)
      "scale": 1.3, "visualYOffset": 0.45, // fit the model to the box
      "visualRy": 0,                       // optional model turn (radians)
      "mass": 4, "static": false, "shape": "BOX", "material": "metal", "flammable": false,
      "aliases": ["forge"],                // extra words for map lines
      "tags": ["fantasy"]
    }
  }
}
```

- The **core pack** is `pack.json` in the assets base: `?assets=<url>` on the
  app URL, else `window.TABLEFOLK_ASSETS`, else the local `assets/` folder.
  All other assets (textures, tiles, characters) resolve from the same base.
- A scenario's `"packs"` list loads extra packs before the layout; their item
  types then work in `objects`, map lines and goals like built-in ones. The
  first pack to define a type keeps it, so packs can't replace core items.
- Packs are data (JSON and models), never code. `tools/browser-test/test-pack`
  is a minimal example.
- Prepare models with `tools/compress-glb.sh model.glb` (AVIF textures,
  meshopt geometry, 1024 px cap): small props look the same and download
  several times smaller.

## 5. Links

- `#s=<data>`: the JSON, compressed with the browser's `deflate-raw`
  `CompressionStream` and base64url-encoded. The hash is never sent to a
  server. A typical scenario is a few hundred characters.
- `?scenario=<url>`: fetch the JSON from a URL (it must allow CORS), for large
  or hosted scenarios.
- Players can decode and edit a link to "win". That's fine for sharing;
  leaderboards would have to replay recorded turns on a server instead.

## 6. Generating a map with the model

The Scenario pane's **Generate** button sends a one-line description to the
loaded model with the vocabulary and two examples, and asks for map lines only.
The reply is parsed leniently (bullets, numbering and stray prose are dropped)
into the map box, where it can be edited and laid out again, or re-rolled with
a new seed.

## 7. Testing tactics automatically

The Scenario pane's **Test tactics** box replays a scenario several times per
tactic and counts wins, through the real chat path, model and checks.

```
## flattery, then a deal
Your sword is the finest craftsmanship I have ever seen.
Deal: the magic sword for 20 gold. Please complete the sale.

## llm: haggle politely; you have exactly 20 gold
turns: 6
```

- A `## name` block is a tactic, and each of its lines is one player message
  (one turn).
- `## llm: <strategy>` lets the loaded model play the player, adapting to the
  replies.
- `to: <id>` picks the character to talk to (default: the first).
- Each run restarts the scenario quietly: no intro or end card, and voices off.
  The results table shows wins per tactic, average turns on a win, and a sample
  transcript, and can be downloaded as JSON.
- Open the page with `?norender=1` while testing so the model doesn't share the
  GPU with rendering. Stop the running brains first.

## 8. Changes to the existing system

- `say()` emits a `tablefolk-say` event, used for `said` goals; world-integration
  emits `tablefolk-agent-turn` after each brain decision, which is what turns count.
- `saveWorldState` and `loadWorldState` take their key from `state.saveKey`.
  The sandbox keeps `tablefolkState`; scenarios use `tablefolkScenarioState`.
- world-integration adds `world.chatAndStep(agentId, text)`, `isBrainLoopRunning`
  and `ensureBrainLoaded` for the tester.
- The world API gains `spawnAgent`, `makeObject`, `hasGroundAt`, `sceneryAt`,
  `sceneryAnchors`, `setPlayer`, `setAllowed`, `getObjects` and
  `inventoryChanged`.
- A new `scenario.js` holds the format, layout engine, goal checker, link
  encoding, banner and end screen, and the 🎯 Scenario pane.

## Later

- Terrain zones (paint a pond or a stone floor). The HD island has no
  per-cell terrain painting yet.
- Visual paths.
- More object types and scenery anchors as assets are added.
- A scenario gallery and short links (`?s=abc123`), server-side generation with
  a bigger model, and replayed-turn verification for leaderboards.
