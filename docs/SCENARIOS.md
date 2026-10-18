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
  "base": "plain",                                       // plain (blank board, default) | island | clearing | dungeon
  "size": [23, 17],                                      // board in cells, odd numbers (section 2c)
  "walls": "tabletop",                                   // or "stone" (natural rock), "modern" (smooth panels), "block" (old cubes)
  "campfire": true,                                      // island/clearing: false drops their campfire; plain/dungeon: true adds one
  "pathfinding": true,                                   // false: walks go in straight lines and stop at walls
  "earshot": 6,                                          // cells within which characters hear and see each other (default 6)
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
  `counter` (a row of three wall sections), outdoor pieces `tree house boulder
  flowers grass_tuft campfire lantern light fence signpost lily_pad`, the items `chest table bench stool
  workbench cauldron anvil weapon_stand axe pickaxe bucket bag potion scroll
  coin_pile apple_crate carrot_crate`, the modern set `desk office_chair
  armchair sofa coffee_table floor_lamp plant bookshelf` (front faces south;
  give `ry` in `objects` to turn them), or an agent id (places that character).
- **floor tiles**: `paint <material> [xN] <placement>` lays painted tiles
  (`stone flagstone dirt wood sand grass water lava`, modern `oak tile concrete
  carpet`; water and lava block
  walking and placement), e.g. `paint water x6 cluster at east` for a pond.
  `sea` is not a floor: it removes the board tile there, so the sea shows
  through (coasts, islands, channels; walking onto it is a fall).
  `floor <material>` paints the whole board. Painted patches can be refs
  (`place lamp beside water`).
- **placements**:
  - `at <area>`, where area is `center`, `north`, `south`, `east`, `west`,
    `northeast`, `northwest`, `southeast`, `southwest` or `random`
  - `against <edge>_wall`: along that edge of the land
  - `beside X`, `near X`, `behind X`, `in_front_of X`, `around X`
  - arrangements, which can be combined with the above: `row`, `cluster`,
    `scattered`, e.g. `place barrel x4 row against west_wall`
- **refs** (X): any thing placed earlier (`house`, `campfire`, `tree`...), an
  agent id or `player` (your avatar). `place player ...` positions your
  avatar (default: at south).
- Directions follow the game's convention: north = −Z, south = +Z,
  east = −X, west = +X. "Front" of a thing is the side facing the middle of the
  board; "behind" is the side away from it.

Unknown words are ignored and reported, not fatal, because small models
improvise.

## 2b. ASCII grid

`grid` draws the board directly: one glyph per cell, **top row = north, left =
west**, centred on the board. Without a `size`, the board is the grid plus two
cells on every side, or exactly the grid when its outer ring is all sea (`-`).
Cells outside a smaller `size` are skipped with a warning. Use odd sizes so
the grid centres exactly. `.` and spaces are empty. The grid is laid down first; `objects` and `map` lines are added on top,
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
| `-` sea | | `%` tree | `H` house | `r` boulder | `X` campfire | `f` fence | `I` signpost |
| | | `j` lantern | `*` flowers | `;` grass tuft | `q` lily pad | | |

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

## 2c. The board

The world is a board of 1 x 1 tiles standing in the sea. `"size": [cols, rows]`
sets it (odd numbers, 5 to 63; default 23 x 17); cells run from
-(cols-1)/2 to (cols-1)/2 in x, likewise in z. `sea` cells are holes. A
house takes about 2 x 2 cells; everything else one cell (wide items two).

Light: the scene keeps its key, rim and fill lights (scaled with the board).
`campfire` and `lantern` bring their own warm light; `light` is an invisible
point light for anything else:

```jsonc
{ "type": "light", "x": 2, "z": -1, "color": "#ffb060", "intensity": 3, "range": 6, "y": 2 }
```

A light only lights props and characters within its range; floors get a glow
decal instead, so a board can have many. Lights keep their options when
exported and stay in `objects` in an ASCII export.

Characters see the whole board in their map, or on boards bigger than 25 x 19
the 25 x 19 window around them. Flowers, grass tufts, lily pads and lights are
decoration: no collision, and not on the characters' map.

**Layers.** Later wins on each cell: the base (its sea, grass and objects),
then the `grid` (any glyph replaces the base's floor there, so `,` or `=` on
the island base's sea makes land, jetties or islets; `.` leaves the cell),
then explicit `objects`/`paint`, then map lines on the free land that is left.
With `base: "island"` and a bigger `size`, everything outside the 15 x 13
island is sea (the island's grid is `ISLAND` in `app/scenario.js` and is
sketched in the skill). Characters with no position are placed near the
middle. `give` and `sell` need the player within 3 cells, so connect islets
that hold traders with jetties.

## 3. Layout engine (deterministic)

1. **Grid.** Integer cells of the board. A cell is *solid* when it has a tile
   (it isn't `sea`) under its centre and four probes 0.35 out. (With the
   shelved `?island=1` terrain, *blocked* also covers that island's fixed
   scenery, from one pass over its meshes' triangles.)
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
| `agent_near` | `["mog", "campfire", 1.5]` (target: agent, `player`, object type, or `[x, z]`) |
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

- **Base maps**: `plain` (the default) is the blank board. `island` is
  content laid on it: a 15 x 13 board, land shaped by sea cells, a grass floor,
  and trees, a house, boulders, flowers, grass tufts, a fence, a lantern, lily
  pads and a campfire, all ordinary objects and paint (a scenario adds to them,
  and **From current world** exports them as such). `clearing` is the same land
  with only the campfire. `dungeon` adds a stone floor and a closed ring of
  walls on the rim; those are ordinary walls and paint too. The old fixed HD
  island is shelved behind `?island=1`.
- **Walls** default to tabletop sections: stone-block walls about 1.1 tall that
  join to neighbouring wall cells. `"walls": "modern"` makes them smooth
  painted panels with a baseboard; `"walls": "stone"` natural dry-stone walls
  of rounded rocks with capstones; `"walls": "block"` keeps the old cubes.
- **Painted floors**: also a click-to-spawn brush in the World pane.
- **Earshot.** A character only hears and sees what other characters do
  closer than `earshot` cells to it (default 6). When you talk to one character,
  the others in earshot of you overhear it (as context, marked "(to bram)",
  without having to answer). `whisper(text)` is speech only the player hears:
  allow it in `allowed` for characters with secrets.
- `give(item)` needs the player within 3 cells (when there's an avatar), and hands an item to the player when the character actually has it
  in its inventory (otherwise it's just said).
- **Walking** finds a way around walls, painted water/lava and solid props
  (A* over the grid, smoothed into straight legs). Walking to a spot off the
  board (or onto sea) still walks straight off the edge (and falls). `"pathfinding": false`
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
      // or "fit": "height" | "footprint": scale the model to h, or to w/d, and
      // stand it on the box floor (for models of unknown scale)
      // "decor": true: no collision, not on the characters' map (flowers...)
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
- Each model file loads once; every placed copy shares its geometry,
  materials and textures, so fifty trees cost one tree's textures.
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
