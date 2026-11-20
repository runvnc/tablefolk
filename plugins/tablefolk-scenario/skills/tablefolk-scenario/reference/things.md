# Things: objects, buildings, notes, loot, doors and asset packs

Everything on the board that is not a character or a floor. Put things in
`objects` at exact positions, in a `grid`, or with map lines.

```jsonc
"objects": [
  { "type": "barrel", "x": 2, "z": 1 },
  { "type": "sofa", "x": -3, "z": 2, "ry": 1.5708 },          // ry: turn in radians
  { "type": "chest", "x": 4, "z": -2, "gold": 25, "items": ["silver key"] },
  { "type": "note", "x": 0, "z": -3, "wall": "north", "text": "Back in five minutes" },
  { "type": "stable", "x": -6, "z": 0, "ry": 3.1416 },
  { "type": "light", "x": 2, "z": -1, "color": "#ffb060", "intensity": 3, "range": 6 }
]
```

## Where the lists live

The catalogue below is complete for the built-in types, but the source of
truth is in files:

| what | file |
|---|---|
| model-based object types (sizes, aliases, tags, physics) | `assets/pack.json` (the core asset pack) |
| scenery built in code (campfire, lantern, light, fence, signpost, lily pad, crystal ball, scrying pool, rune circle) | `app/scenery.js` |
| props built in code (crate, barrel, mushroom, lamp, wall, door, note, counter, picture) | `app/app.js` (`makeObject`) |
| bodies | `FIGURES` in `app/app.js` ([format.md](format.md)) |
| walk-in buildings and their furniture | `WALK_IN`, `WALK_IN_THINGS` in `app/procgen.js` |
| pick-ups and body loot | `PICKUPS`, `BODY_LOOT` in `app/play.js` |
| weapons and damage | `app/combat.js` |
| foods | `FOOD` in `app/mind.js`, pack items tagged `food`, the scenario's `food` |
| 2D tiles of every object, body and floor | `assets/tiles/tiles.json` and `assets/tiles/{objects,characters,floors}/` |
| sounds | `assets/sounds/kenney-rpg/`, `assets/sounds/kenney-impact/` (`app/sfx.js`) |
| licences | `LICENSE.txt` files beside the models and sounds |

## Catalogue

- **Props**: `crate barrel mushroom lamp wall door note`, `counter` (a row of
  three walls).
- **Items**: `chest table bench stool workbench cauldron anvil weapon_stand
  axe pickaxe bucket bag potion scroll coin_pile apple_crate carrot_crate`.
- **Village**: `well market_stand market_stalls cart broken_cart tent logs
  bed double_bed bookcase banner wall_banner target dummy pumpkin statue
  torch iron_chest house fantasy_house stable windmill watch_tower
  bell_tower`.
- **Closed buildings** (scenery, not entered; Quaternius, CC0; front faces
  south at `ry` 0): `inn stone_house tall_house mill_house sawmill blacksmith
  barracks gazebo`, farm buildings `barn big_barn small_barn open_barn silo
  silo_barn chicken_coop stone_windmill`. They take 3-5 cells; generated
  villages and farms place them ([generated.md](generated.md)).
- **Nature** (Quaternius Stylized Nature, CC0): `pine_tree tall_pine oak_tree
  tall_tree autumn_tree dead_tree red_bush flower_bush fern mushroom_cluster
  shelf_fungus mossy_rock` (solid; trees by the trunk), `tall_grass heather
  flower_patch` (decoration).
- **Farm and camp**: `hay sacks fence_section farm_fence fire_pit log
  backpack shovel scythe frying_pan bear_trap`.
- **Arms, armour and treasure** (Quaternius RPG items, CC0; light, carried and
  found): `sword greatsword dagger spear war_hammer hunting_bow shield
  round_shield leather_armor plate_armor crown necklace coin_pouch gold_bars
  crystals book open_book skull bone`.
- **Dungeon dressing** (Quaternius Fantasy Props MegaKit, CC0): `candelabra
  candles cabinet lectern cage chains wooden_chair nightstand apple_barrel
  pot vase broken_pot iron_crate`, and the pick-ups `key chalice rope`.
- **Modern**: `desk office_chair armchair sofa coffee_table floor_lamp plant
  bookshelf` (front faces south; `ry` turns them).
- **Outdoors**: `tree boulder campfire lantern fence signpost` (solid);
  `flowers grass_tuft lily_pad` (decoration: no collision, and characters
  don't see them; lily pads float on sea cells). `fence` is one cell along x
  (`ry` 1.5708 turns it north-south).
- `light`: an invisible point light ([board.md](board.md)).
- **Arcane** (built in code, they glow and move): `crystal_ball` (a scrying
  crystal on a gilded pedestal, violet light swirling inside the glass),
  `scrying_pool` (a shallow golden bowl of glowing water on a pedestal,
  ripples and a faint rising mist), `rune_circle` (a ring of gold runes and a
  seven-pointed star inlaid in the floor, about 2.3 m across, turning slowly;
  characters stand and walk on it, so it can sit under someone). Each lights
  its surroundings a little; `"color": "#rrggbb"` tints one (the crystal's
  wisps keep their colours). The ball and the pool are solid and too heavy to
  carry; characters see all three ("crystal ball next to you"). Map words:
  `crystal ball`, `orb`, `scrying pool`/`scrying bowl`, `rune circle`/`magic
  circle`; `spawn()` can conjure them. The Oracle stands on a rune circle
  between a crystal ball and a scrying pool.

Wide items (`table bench workbench desk sofa`, and pack items 1.3 or more
wide) take two cells. Bookcases, wall banners, cabinets and nightstands turn
their backs to an adjacent wall. Objects keep one size: a carried crate is
the same crate (notes are the one exception, below).

Characters can carry, drop and throw light things; chests, beds and other
heavy furniture are too heavy to carry. Beds, seats, anvils, trees and other
things with a use are used with `use(thing)` (characters) or E (the player):
[characters.md](characters.md#using-things).

## Walk-in buildings

`house`, `fantasy_house` (shown as "timber house") and `stable` placed as one
object (in `objects`, a grid glyph, or a map line) become real buildings to
walk into:

| type | size with walls | floor | standard furniture |
|---|---|---|---|
| `house` | 5 x 5 | wood | bed, bookcase, table, cabinet |
| `fantasy_house` | 6 x 5 | oak | bed, nightstand, bookcase, cabinet, table, chair |
| `stable` | 7 x 5 | dirt | fence stalls, logs, barrel, bucket, apple barrel, crate |

- The walls go round the object's square, with a door in the middle of the
  front; the front faces south (+z) at `ry` 0 and turns with `ry` in quarter
  turns.
- The building gets a floor, a roof, and a place name characters know
  (`house 1`, `timber house`, `stable`).
- Things already placed inside replace the standard furniture, so a house can
  be furnished by hand (the world builder shows the interior cells and a
  ghost of the default furniture). Outdoor things (trees, flowers, tufts,
  boulders, lily pads) inside are removed, and anyone standing on the walls
  is moved inside the door.
- One that would leave the board or cross other walls, or has
  `"enter": false`, stays the old closed model (with a layout warning).
- `windmill`, `watch_tower` and `bell_tower` stay closed models.

### Keeping the model: `"keep": true` and subworlds

`{"type": "stable", "x": 0, "z": -3, "keep": true}` leaves the building's own
3D model standing and makes its inside a **subworld**: a separate small map
(the same walls, floor and furniture as above) the player walks into. The
world builder's "keep building models" box (on by default) sets it on new
buildings, and the inspector has the box for each one.

- The door square is the square in front of the model (two squares from its
  centre; the builder draws it gold, the game as a glowing disc). Stepping
  onto it from another square swaps the map for the inside at once; stepping
  out through the inside's door onto its disc (or the banner's "leave"
  button) puts you back, one square outside.
- What you leave is kept as it was (characters, objects, doors, what they
  remember); the player, the pack and hit points carry across. The goal is
  checked inside too (below, "Sections").
- A kept building with no square in front of it on the board has no way in
  (a layout note says so).

The same mechanism is open to authors: see "Sections" below.

Code: `expandBuildings` in `app/scenario.js`, templates in `WALK_IN` in
`app/procgen.js` (`walkInFootprint` gives the cells).

## Sections: worlds bigger than one map (`subworlds`, `links`)

A world can be several maps joined by **links**: dungeon levels joined by
stairs, a village with the forest, the farmland and the cave next to it, a
house's cellar. Each map is a **section**; only the one the player is in is
built, and moving between them swaps the map (a short fade).

```json
"links": [
  { "in": "mine", "to": "workings", "name": "the Old Workings", "kind": "stairs_down" },
  { "edge": "east", "to": "wolfwood", "name": "the Wolfwood" },
  { "at": [4, 3], "to": "scenarios/the-oracle.json", "name": "the Oracle's hut", "kind": "gate" },
  { "at": [-4, 3], "to": { "generate": { "kind": "cave", "size": [21, 17], "seed": 5 } }, "name": "a dark cave", "kind": "cave" },
  { "at": [-4, -3], "to": "vault", "name": "the vault", "kind": "trapdoor", "key": "brass key" }
],
"subworlds": {
  "workings": { "title": "The Old Workings", "generate": { "kind": "dungeon", "rooms": 7 },
    "agents": [{ "id": "bat1", "model": "bat", "in": "lair" }],
    "links": [{ "in": "lair", "to": "galleries", "kind": "stairs_down", "name": "the Deep Galleries" }],
    "subworlds": { "galleries": { "title": "The Deep Galleries", "generate": { "kind": "dungeon", "rooms": 6 }, "dark": true, "reveal": "rooms" } } },
  "wolfwood": { "title": "The Wolfwood", "generate": { "kind": "forest", "places": ["ruins"] } },
  "vault": { "title": "The Vault", "size": [11, 9], "objects": [{ "type": "gold_bars", "x": 0, "z": 0 }] }
}
```

**Where a link is**: `at` (a square; stepping onto it from another square
travels), `in` (a place of a generated map: a free square in it, by a wall,
chosen once and kept), or `edge` (`north`, `south`, `east` or `west`: the
whole rim of that side is a way out; walking off it travels, and you arrive
at the matching place on the other map's opposite rim, so maps tile like a
region; `at` on an edge link is where its road leaves the board, default a
path on the rim, else the middle). The land past an edge link shows a dirt
road running on, with no trees on it.

**Where it goes** (`to`):
- a key of `subworlds`: looked up in this section, then in the sections
  above it (so a forest next to the village can lead to the village's cave);
- `"back"`: where you came from (you arrive where you left);
- another scenario: a path (`"scenarios/the-oracle.json"`), a URL or a `#s=`
  code; fetched the first time ("Travelling..."), then kept like a subworld.
  A fetch that fails leaves you where you are, with a message;
- `{ "generate": { "kind", "size", "seed", "style", "agents", "objects",
  "threats", "dark", "reveal", "title" } }`: built by the procedural
  generator the first time you go in (no model), the same map ever after.

**What it looks like** (`kind`): `door` (the default: a glowing disc),
`stairs_down` (steps going down into the dark, a stone rim), `stairs_up`
(steps rising to a dark opening), `cave` (a dark mouth in a rock mound),
`gate` (posts and bars), `trapdoor` (a hatch with an iron ring), `edge`. A
stair runs toward the wall beside it (or `"facing": "n"`). Every one but a
door has its destination's name on a small label.

**Other fields**: `name` (shown, and said when you go: "You go down into The
Old Workings."), `arrive` (`[x, z]`, or the `name` of a link in the target:
where you land; default: on the target's way back to where you came from,
else its `player.at`), `back` (where you stand when you come back through
this link; default its own square), `key` (an item: a locked link opens only
for a player carrying it, like a locked door, and stays open after).

**The way back is made for you**: a section with no link back to where you
came from gets one where you arrive (stairs up under stairs down, the
opposite edge for an edge). The banner's "↩ back to ..." button goes back
too, and its 🗺 map button lists every section (the one you are in, the ones
you have seen, the ones you have not) and the ways out of each.

**One world**:
- Every section keeps its state: what it was when you left it (characters
  and where they stood, objects, chests, doors, stock, what you explored) is
  what you find when you come back, however deep. Unvisited sections are
  built from their definition the first time.
- The player, their pack, gold, hit points and quests, the story flags and
  facts, the clock (one clock, it keeps running) and the goal belong to the
  whole world. The goal is checked in every section; a condition about a
  character or a thing in another section uses that section's saved state
  (`agent_has`, `agent_defeated`, `chest_has`, `stock_at_least` and the
  like); `agent_near` and `object_near` are only true in the same section.
- Time passes elsewhere, coarsely: coming back after game time has passed,
  the stock has grown back at its rates, the stores have fed the residents,
  hunger and tiredness are where the day leaves them (never starving),
  workers stand where their job puts them at this hour (in bed at night, at
  work by day, the tavern in the evening) and raiders left behind are gone.
  No model is asked; threats and fights only happen in the section you are
  in (each section's own `threats`).
- Companions (the `companion` role, anything with the `follow` behaviour)
  and animals following you come along when they are near you.
- The whole journey is saved in the browser: a reload comes back to the
  section you were in, every visited section as you left it (`?fresh=1` in
  the address, or the banner's restart, starts again).

A section is any scenario (grid, objects, `generate`, characters, its own
`threats`, `reveal`, `dark`, `lighting`, `surroundings`); it takes its
parent's `walls`, `wallHeight` and `lighting` unless it sets its own.
World-level fields (`goal`, `time`, `live`, `flags`, `packages`) are read
from the top map; a section's own `flags` only give defaults for new ones.
The world builder makes such worlds ([world-builder.md](world-builder.md)).
For package code: `tablefolkScenario.travel(link)`, `.section`, `.here()`,
`.sections()` and the `tablefolk-section` event ([api.md](api.md)).

Code: `app/scenario.js` (sections: links, travel, saved states, the
journey), `app/sections.js` (the markers, the catch-up, the map card).

## Notes

```jsonc
{ "type": "note", "x": 2, "z": -3, "text": "Meet me at midnight." }                   // on the floor
{ "type": "note", "x": 0, "z": -4, "wall": "north", "text": "RULES: no dragons." }    // on a wall
```

A note lies on the floor; with `"wall": "north"` (south, east, west) it hangs
upright on that wall of its square, about a square tall and sized to the wall,
readable from the room (signs, posters, rules). Carried, a note is
paper-sized in the hand. The player takes one with E: it is read, and goes in
the pack with its words (give it to someone and they know what it says; drop
it and it lies on the floor again). A character's `note(text)` writes one
(facing a wall, it is pinned to the wall); `carry(note)` picks one up and
reads it. Map lines and grid legends take `note "text"`.

A note can carry a picture above its words: `"image"` (a data URL or a URL)
or, in the world builder, `"prompt"` (what it shows, painted for you): a
wanted poster's face, a treasure map, a child's drawing.

## Pictures (`picture`): signs, paintings, tapestries

```jsonc
{ "type": "picture", "style": "sign", "x": 3, "z": -4, "wall": "north",
  "title": "The Sleeping Fox", "prompt": "a red fox asleep on a tankard",
  "image": "data:image/jpeg;base64,..." }
{ "type": "picture", "style": "tapestry", "in": "throne", "prompt": "a dragon coiled around a tower" }
```

- **style**: `painting` (a framed square picture, the default), `tapestry`
  (tall, woven, a rod's worth of cloth) or `sign` (a wide board: the picture
  above its `title`; with no picture, the title alone).
- **Where**: `"wall"` hangs it on that side of its square, facing into it,
  like a pinned note. Without `"wall"` it hangs on a wall beside its square
  if there is one; `"wall": "none"` or no wall near: it stands on two posts
  (an inn's sign outside, a painting on show). In a generated map, `"in":
  "tavern"` puts it on a free square against a wall of that place.
- **image**: the picture, a data URL or URL. **prompt**: what it shows, in a
  few words (no text: the small image model cannot write letters; a sign's
  name is `title`). The world builder paints every picture that has a
  `prompt` and no `image` (tiny-sd in the browser: see
  [world-builder.md](world-builder.md)), small JPEGs kept in the world.
  Without an image the game draws a plain board with the title. A painting's
  prompt is painted as "painting ..." and a tapestry's as "woven tapestry ..."
  when it does not name its kind (the painter heeds the start of a prompt
  most); the map editor starts a new one's words that way. Paintings and
  tapestries are matte (no shine).
- It is scenery: not carried, no physics. Map lines: `place picture against
  north_wall` (also `painting`, `tapestry`, `portrait`).

## Books: knowledge bases characters read (`books`)

A book is a document (a PDF, a text or Markdown file) a character can read
and answer from: an herbal for the village healer, a ship's log, the rules of
a game, a product manual for a shop assistant. It is an item, named by its
title, so it is given, sold, put in chests and handed between characters
like anything else, and it is drawn in the world with its own cover and spine.

```jsonc
"books": {
  "herbal": {
    "title": "The Herbalist's Companion",      // the item's name
    "author": "Mother Elsa", "about": "healing plants and poisons",
    "color": "#2d5b3a",                         // the drawn cover, back and spine
    "cover": "data:image/jpeg;base64,...",      // optional pictures (URL or data URL);
    "spine": "data:image/jpeg;base64,...",      //   without them the title is drawn
    "coverPrompt": "a herb wreath around a mortar",   // the builder paints the cover from this
    "chunks": ["Willowbark eases fever ...", "Comfrey, called knitbone, ..."],
    "vectors": "<base64>", "dim": 256, "model": "embeddinggemma-2"   // written by the world builder
  }
},
"agents": [{ "id": "mira", "readsBooks": true, "inventory": { "items": ["The Herbalist's Companion"] } }],
"objects": [{ "type": "book", "book": "herbal", "x": 2, "z": 1 }]      // or lying on the floor
```

- **Making one**: the world builder's **Books** tab. Add a book from a file:
  its text is taken out (PDFs with real text; a scanned PDF has none), cut
  into passages of about 110 words and indexed in your browser with the
  memory model (EmbeddingGemma, 175 MB once). Give it a title, author, a
  line on what it is about, a colour, cover and spine pictures, and say where
  it is: a character's pack, the player's pack, or on the floor.
- **Reading**: a character with `"readsBooks": true` (Characters tab:
  "reads its books") that carries a book looks up what was just said to it,
  by the player or another character, in every book it carries: keywords and
  meaning together, then the best passages re-read with the question by a
  small re-ranking model (23 MB, loaded the first time). The passages that are
  really about the question go into its prompt right after the words
  ("Your book ... says about this: ..."), and it answers from them in its own
  words. Small talk finds nothing and adds nothing. Give the book away and the
  new owner can answer from it (if it reads); the old one can't.
- Hand-written `chunks` without `vectors` work: keywords at once, meaning once
  the game has worked the vectors out (a fraction of a second for a short
  book).
- The player can read a book's title and opening from the pack, give it, or
  drop it (it lies on the floor again).
- **Size**: the text is in the world, so a book of a few hundred pages makes
  a long `#s=` link; share big worlds as a file (`?scenario=<url>`). Up to
  3000 passages (about 300 pages). The AI that changes a world in the builder
  sees only each book's title and summary.
- Off when the world has `"memory": false` or smart memory is off in the
  Graphics pane: then keywords only.

## Loot and pick-ups

- `chest` and `iron_chest` take `"gold"` and `"items"`; the player opens one
  with E and takes everything (E again on the open, empty chest closes it).
  A chest without either holds a little gold and sometimes a healing potion.
  Characters open and close chests, take from them and store in them
  (`use`, `take`, `put`: [characters.md](characters.md#using-things)); what
  a chest holds is kept with it. Chests, anvils and cauldrons stay where they
  are put (static).
- `coin_pile` takes `"gold"` (default 10-30) and is picked up by walking over
  it.
- `potion scroll axe pickaxe bag bucket key chalice rope torch` are picked up
  with E (`"name"` renames the item). Picking up a weapon while bare-handed
  wields it.
- E on a fallen character searches it ([combat.md](combat.md)).

## Locked doors (`locked`)

```json
"locked": [{ "in": "treasure", "key": "silver key" }, { "at": [3, -2], "key": "iron key" }]
```

`"in"` locks every door into a generated map's place; `"at"` one door
(`app/locks.js`). A locked door blocks everyone and stays shut. The player
opens it by walking into it (or E) carrying the key: any item with "key" in
its name that matches (a picked-up `key` object is called "key"); it then
stays open. Without the key a note says what it needs. Put the key
somewhere: the generators check it exists.

## Stock and stores

In a world with a clock ([living.md](living.md#the-clock-time-daymINUTES-clock)) things run out and come back.
A thing with stock holds a count of an item; each `use()` takes one, and at
0 it fades and cannot be used until it grows back:

| thing | gives | count | grows back (game hours a unit) |
|---|---|---|---|
| trees (`tree`, `pine_tree`, `oak_tree`, ...) | firewood | 3 | 8 |
| `logs`, `log`, `dead_tree` | firewood | 4, 2, 2 | never |
| `boulder`, `mossy_rock` | stone | 4, 3 | 12 |
| `crystals` | crystal | 3 | 24 |
| `apple_barrel`, `apple_crate`, `carrot_crate` | apple, carrot | 6 | never: `put(apple, apple_barrel)` refills it |
| `tall_grass` (a field) | wheat | 3 | 3 (twice as fast once someone sows it: `use()` on a bare field) |
| `pumpkin` (a field) | pumpkin | 2 | 6 |
| `bear_trap` (a snare) | meat | 1 | 4 |
| `lily_pad` (a fishing spot) | fish | 3 | 3 |
| `well` | water to drink | always | |

On a scenario object, `"stock": 5` sets the count and `"crop": "carrot"`
what a field gives: `{"type": "tall_grass", "x": 3, "z": 1, "crop": "wheat", "stock": 2}`.
A pack or package item says the same in data ([packages.md](packages.md)).

**Stores.** A chest, `barrel`, `crate` or `iron_crate` holds things:
`put(item, barrel)` and `take(item, barrel)` work on all of them, and
`"items"`/`"gold"` fill one at the start. Jobs keep what they make in the
store in their workplace or home (a chest in the bakery); a store in no
one's house or workplace (a granary in the open) belongs to the village, and
taking from someone else's store is paid for.

## Asset packs (`packs`)

More object types come from **asset packs**: a folder with a `pack.json`
manifest (glTF/GLB files plus size, physics and aliases per item, paths
relative to the manifest) on any static host that allows CORS (GitHub Pages,
Hugging Face, R2/S3, a home server). List them in `"packs"`; their types and
aliases then work everywhere a built-in type does: `objects`, map lines
(`place big_anvil near table`), grid `legend` values, goals.

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
      // or "fit": "height" | "footprint": scale the model to h, or to w/d,
      // and stand it on the box floor (for models of unknown scale)
      // "decor": true: no collision, not on the characters' map (flowers...)
      "mass": 4, "static": false, "shape": "BOX", "material": "metal", "flammable": false,
      "aliases": ["forge"],                // extra words for map lines
      "tags": ["fantasy"],                 // "food" (+ "nourish": 0-1) makes it edible
      "loop": "Glow", "use": {}            // packages only: packages.md
    }
  }
}
```

- The **core pack** is `pack.json` in the assets base: `?assets=<url>` on the
  app URL, else `window.TABLEFOLK_ASSETS`, else the local `assets/` folder.
  All other assets (textures, tiles, characters) resolve from the same base.
- A scenario's packs load before the layout. The first pack to define a type
  keeps it, so packs can't replace core items.
- A relative pack URL resolves against the app's assets folder; an absolute
  URL must be reachable wherever the link is opened (a `localhost` pack only
  works locally).
- Each model file loads once; every placed copy shares its geometry,
  materials and textures, so fifty trees cost one tree's textures.
- Packs are data (JSON and models), never code; packages can bring code
  ([packages.md](packages.md)). Minimal example:
  `tools/browser-test/test-pack/pack.json`.
- Prepare models with `tools/compress-glb.sh model.glb` (AVIF textures,
  meshopt geometry, 1024 px cap).
- A new item has no 2D tile for the world builder until one is rendered: the
  map editor renders it on the spot and keeps it ([world-builder.md](world-builder.md)).
