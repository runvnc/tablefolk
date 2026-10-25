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
| scenery built in code (campfire, lantern, light, fence, signpost, lily pad) | `app/scenery.js` |
| props built in code (crate, barrel, mushroom, lamp, wall, door, note, counter) | `app/app.js` (`makeObject`) |
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

Wide items (`table bench workbench desk sofa`, and pack items 1.3 or more
wide) take two cells. Bookcases, wall banners, cabinets and nightstands turn
their backs to an adjacent wall. Objects keep one size: a carried crate is
the same crate (notes are the one exception, below).

Characters can carry, drop and throw light things; chests, beds and other
heavy furniture are too heavy to carry.

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

Code: `expandBuildings` in `app/scenario.js`, templates in `WALK_IN` in
`app/procgen.js` (`walkInFootprint` gives the cells).

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

## Loot and pick-ups

- `chest` and `iron_chest` take `"gold"` and `"items"`; the player opens one
  with E and takes everything. A chest without either holds a little gold
  and sometimes a healing potion.
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
