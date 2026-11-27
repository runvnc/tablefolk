# Generated places (`generate`): dungeons, villages, forests, farms, caves

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
"generate": { "kind": "village", "buildings": 7, "size": [35, 27], "style": "hamlet" }
"generate": { "kind": "forest", "places": ["camp", "ruins"], "style": "spooky" }
"generate": { "kind": "farm" }
"generate": { "kind": "cave", "rooms": 7, "style": "mine" }
```

Other names work too: `town`, `hamlet` (a village); `woods`, `wilds`,
`wilderness` (a forest); `farmstead`; `caves`, `cavern`, `mine` (a cave with a
mine).

## What it makes

It runs inside `normalizeScenario`, before everything else. The result is an
ordinary `grid` + `legend`, `objects` (one `light` per room or building),
`size`, `lighting` (night for dungeons), `walls` (`stone`), `wallHeight` (2,
so the person-height doors fit; set `1` for low tabletop walls), a `+` door
in every doorway, and a position for every character and the player. The
link keeps the short form; same seed, same map. Change `"seed"` for another
layout. `"size": [cols, rows]` makes any kind bigger or smaller (odd numbers,
up to 63 by 63; the world builder's Size choice: large is 51 by 39, huge 63
by 49). `"lighting"`, `"walls"`, `"grid"` (replaces the generated one),
`"legend"`, more `"objects"` and `"goal"` all work as usual.

### Dungeon (`"kind": "dungeon"`)

BSP rooms, a spanning tree of L-shaped corridors plus a loop or two, one-cell
walls around floors only, the sea outside (`"outside": "table"` keeps the bare
board). Options: `"rooms"` (3-16), `"size"`, `"boss": "throne" | "lair"`,
`"style"`: `castle` (a keep: a throne room, barracks, a library, a kitchen,
stores; lit, not dark) or `crypt` (tombs: crypts, shrines, a lair; dark).
`"kind": "castle"` (or `keep`, `fortress`) and `"kind": "crypt"` (or `tomb`,
`catacombs`) are short for those. Rooms are dressed by kind: skulls and bones
in crypts, lairs and prisons, books in libraries and shrines, a shield and a
weapon in barracks, gold bars, a crown or necklace and a coin pouch in the
treasure room, sacks in stores and kitchens, crystals in the alchemy room.

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
flowers and boulders. Options: `"buildings"` (3-14), `"size"`, `"style"`.
Buildings get thatched roofs ([board.md](board.md)). The grass left over is
built up with closed buildings you can't enter (an inn, stone and tall houses,
a mill house, a sawmill, a blacksmith's, barracks, a gazebo), each facing the
nearest road, and varied trees (pines, oaks, autumn trees); `"style":
"hamlet"` (or `"farming"`) puts barns, a silo, a coop and hay there instead;
`"extras": false` leaves the grass bare.

### Forest (`"kind": "forest"`)

Wild country: a dirt path winding from the south edge to the north, the woods
thick on both sides (pines, oaks, tall and autumn trees, with ferns, bushes,
mushrooms, rocks and flowers), and clearings along the path, each joined to it
by a trail: the `clearing` where the player starts, then several of `camp`
(tents, a campfire, a log), `ruins` (broken stone walls, a statue, a skull,
often a chest), `grove` (autumn trees round mushrooms and flowers), `shrine`
(a statue between torches), `pond`, `hut` (a little house to walk into),
`cave` (a ring of rocks round a cave mouth, crystals at the back), `meadow`
(flowers and tall grass). Places asked for (`in`, or `"places"`) are always
built. `"style"`: `spooky` (dead trees, night), `autumn`, `pine`. Bright by
day, not dark.

### Farm (`"kind": "farm"`)

A farmstead on a lane: the `yard` (a well, a cart, hay; the player starts
here), the `farmhouse` to walk into, a barn (`barn`, its front), a silo, a
chicken `coop`, often a windmill and a shed, a fenced `pasture` with a gate (for
the animals), one or two `field`s of pumpkins in furrows, an `orchard` of oaks,
trees and flowers round the edge.

### Cave (`"kind": "cave"`)

Organic caverns (a cellular automaton, kept to one connected system) with
rock walls, dark. Chambers are named by where they are: the `entrance` nearest
the south edge (the player starts there), the `lair` furthest from it, and
`crystals` (glowing crystal clusters and a violet light), `grotto` (mushrooms
and fungus), `pool` (water), `treasure` (a chest and gold), `bones`, `camp`, or
with `"style": "mine"` a `mine` (a cart, crates, a pickaxe, a lamp); the rest
are `chamber N`. Rocks, fungus and crystals line the walls. Options:
`"rooms"` (3-9 chambers), `"size"`, `"style"`.

## Links in generated maps

A link of a world in sections can stand `"in"` a place of a generated map
(`{"in": "lair", "to": "level2", "kind": "stairs_down"}`): the game picks a
free square in it, by a wall, away from its doors, and keeps it. A link's
`"to"` can also be `{"generate": {"kind": "cave", "seed": 4}}`: the place is
generated the first time the player goes in ([things.md](things.md#sections-worlds-bigger-than-one-map-subworlds-links)).

## Putting things in places

- `"in": "<place>"` on an agent, an object or the player puts it in a free
  cell of that place (`house` = any house; `room 3`). Any place named in an
  `in` is always built. Things go one to a square, by a wall, never in a
  doorway, and every bed, station and store keeps a free side reachable
  from the door. An object given `x`/`z` on a square the map already
  furnished is moved to a free cell of the same place.
- In a generated village with nothing placed by hand (no `x`/`z` on objects,
  no `at` on characters), each walk-in building's room is sized to the
  building model it wears from outside, and a few barrels, crates, sacks or
  flowers stand by some doors.
- An agent with neither `at` nor `in` is matched by words in its id, style
  and personality: goblins and monsters to the lair, rulers and sorcerers to
  the throne room, guards to barracks, priests to the shrine or temple,
  smiths to the smithy, innkeepers to the tavern, merchants to the shop,
  farm animals to the pasture (or a village's garden or square), deer to the
  grove, hunters and bandits to the camp, hermits and druids to the hut,
  miners to the mine... Its body counts too (a `cow` called "bess").
- Unknown places are reported in the Scenario pane.
- `locked` with `"in"` locks every door into that place ([things.md](things.md)).
- Characters can walk to places by name: `walk(tavern)`.

`normalizeScenario` keeps `places` (id, kind, centre, bounds, who is there) on
the result for tools and prompts; characters' prompts say which place they are
in and which they can walk to (`app/senses.js`). A place may also say what its building looks
like (`style`, `storeys`, `roof`, `jetty`, ...: [board.md](board.md#houses-and-roofs)).

## Fixed layouts (`freezeLayout`)

`tablefolkScenario.freezeLayout()` (the tabletop view's "use this layout",
and the world builder's first edit) turns the running world back into a
scenario with every object, floor tile and character at an exact position:
`generate`, `grid` and `map` are dropped; `objects`, `paint`, `size` and
`base` hold the board; `places` keeps the rooms (a scenario with `places` and
no `generate` keeps them as they are). The world builder's AI change box keeps
such big lists on the server and lets the model edit with commands instead
(on small maps it may use them too): `remove_objects` (squares, `[x, z, type]`,
or an area `{from, to}`), `move_objects` (`{from, to, type}`, keeping every
setting), `add_objects`, `paint_area` (a whole patch of floor tiles
`{from, to, mat}`), `add_paint` (one tile, replacing that square's),
`remove_paint`, `update_agents` (`{id, ...only the fields to change}`) and
`remove_agents`.

### Buildings in a generated village (2026-11-20)

A building nobody lives or works in (no character's `home`, `workplace` or
`in`, no object placed `in` it) becomes a closed building (a kit house with
its door shut; with `"kit": false` one of the real building models),
chosen by its role (a house: house, timber house, tall house or stone house;
a tavern: the inn; a smithy: the blacksmith; a guardhouse: the barracks; a
stable: the stable; and so on), seeded, no two alike in a row where another
fits. Homes and workplaces stay rooms you can walk into, because characters'
days (jobs) need their beds and work places on the same map. `"generate":
{ "models": false }` keeps every building as a room.
