# Generated dungeons and villages (`generate`)

The fastest way to a big place: the app builds the whole map from a seed, and
you say which place each character belongs in. `app/procgen.js` (seeded, no
dependencies) is loaded by both the browser and the Bun server, so both get
the same result.

```json
{
  "v": 1, "title": "The Sorceress Below", "seed": 7,
  "generate": { "kind": "dungeon", "rooms": 9 },
  "agents": [
    { "id": "vexa", "model": "wizard", "style": "proud sorceress", "in": "throne", "personality": "..." },
    { "id": "grub", "model": "goblin", "style": "goblin guard", "personality": "..." }
  ],
  "objects": [{ "type": "chest", "in": "treasure", "gold": 40 }],
  "locked": [{ "in": "treasure", "key": "silver key" }]
}
```

```json
"generate": { "kind": "dungeon", "rooms": 9, "size": [33, 25], "boss": "throne", "outside": "sea" }
"generate": { "kind": "village", "buildings": 7, "size": [35, 27] }
```

## What it makes

It runs inside `normalizeScenario`, before everything else. The result is an
ordinary `grid` + `legend`, `objects` (one `light` per room or building),
`size`, `lighting` (night for dungeons), `walls` (`stone`), `wallHeight` (2,
so the person-height doors fit; set `1` for low tabletop walls), a `+` door
in every doorway, and a position for every character and the player. The
link keeps the short form; same seed, same map. Change `"seed"` for another
layout. `"lighting"`, `"walls"`, `"grid"` (replaces the generated one),
`"legend"`, more `"objects"` and `"goal"` all work as usual.

### Dungeon (`"kind": "dungeon"`)

BSP rooms, a spanning tree of L-shaped corridors plus a loop or two, one-cell
walls around floors only, the sea outside (`"outside": "table"` keeps the bare
board). Options: `"rooms"` (3-16), `"size"`, `"boss": "throne" | "lair"`.

Room purposes come from the room graph: the `entrance` is nearest the south
edge (the player starts there), the room furthest from it is the `throne` or
`lair`, a dead end is the `treasure` room, the rest `library shrine barracks
storage kitchen prison crypt alchemy` (`room N` otherwise). Each kind is
furnished from the normal object set (`ROOM_FURNISH` in `app/procgen.js`); a
connectivity pass clears any furniture that would cut a corridor off.

Dungeons are `dark` unless `"dark": false`: crypts, prisons, storerooms, lairs
and plain rooms get no light (the player's torch shows them), every other room
a light, and a standing torch (one more to pick up) waits in the entrance.

### Village (`"kind": "village"`)

Two crossing dirt roads, a flagstone `square` (campfire, lanterns, signpost;
the player starts here), buildings facing the roads with a door and a path
(`tavern smithy shop temple alchemist guardhouse library stable house N`,
furnished by `BUILDING_FURNISH`), a `pond`, a fenced flower `garden`, trees,
flowers and boulders. Options: `"buildings"` (3-14), `"size"`. Buildings get
thatched roofs ([board.md](board.md)).

## Putting things in places

- `"in": "<place>"` on an agent, an object or the player puts it in a free
  cell of that place (`house` = any house; `room 3`). Any place named in an
  `in` is always built.
- An agent with neither `at` nor `in` is matched by words in its id, style
  and personality: goblins and monsters to the lair, rulers and sorcerers to
  the throne room, guards to barracks, priests to the shrine or temple,
  smiths to the smithy, innkeepers to the tavern, merchants to the shop...
- Unknown places are reported in the Scenario pane.
- `locked` with `"in"` locks every door into that place ([things.md](things.md)).
- Characters can walk to places by name: `walk(tavern)`.

`normalizeScenario` keeps `places` (id, kind, centre, bounds, who is there) on
the result for tools and prompts; characters' prompts say which place they are
in and which they can walk to (`app/senses.js`).

## Fixed layouts (`freezeLayout`)

`tablefolkScenario.freezeLayout()` (the tabletop view's "use this layout",
and the world builder's first edit) turns the running world back into a
scenario with every object, floor tile and character at an exact position:
`generate`, `grid` and `map` are dropped; `objects`, `paint`, `size` and
`base` hold the board; `places` keeps the rooms (a scenario with `places` and
no `generate` keeps them as they are). The world builder's AI change box keeps
such big lists on the server and lets the model use `add_objects`,
`remove_objects` ([x, z] or [x, z, type]) and `add_paint` instead.
