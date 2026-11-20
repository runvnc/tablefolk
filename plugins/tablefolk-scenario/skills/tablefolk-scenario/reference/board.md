# The board

The world is a board of 1 x 1 squares: the logic's grid (walking, paths,
sight). On screen it is one continuous ground whose materials blend into
each other, and the land carries on past the board's edge (hills and trees
outdoors, rock around a dungeon, a street around a lone building, the sea
around an island). This chapter covers its size and coordinates, the base
maps, how the map layers combine, floors, walls, what lies beyond the edge,
light, darkness and roofs.

## Size and coordinates

`"size": [cols, rows]`: odd numbers, 5 to 63 (default 23 x 17). Cells run
from -(cols-1)/2 to (cols-1)/2 in x, and likewise in z, around the centre
(0, 0); with the default, x -11..11 and z -8..8.

**North = -z, south = +z, east = -x, west = +x.** The player starts at the
south by default. In a centred grid of R rows x C columns, row r and column c
is x = (C-1)/2 - c, z = r - (R-1)/2 (top row north, left column west).

`sea` cells are water: that's how you draw coasts and islands (a sandy
shore blends into them). Walking onto sea is a fall; walking off the board
where there is no water just stops at the edge. A house model takes about 2 x 2 cells; wide items
(`table bench workbench desk sofa`, and pack items 1.3 or more wide) take two;
everything else one.

## Base maps (`base`)

- `plain` (default): the blank board.
- `island`: a ready 15 x 13 island (grass, trees, a house, boulders, a fence,
  a lantern, a campfire, flowers, lily pads) laid down as ordinary objects
  and paint, so a scenario adds to them and **From current world** exports
  them as such. Its grid is `ISLAND` in `app/scenario.js`.
- `clearing`: the same land with only the campfire.
- `dungeon`: a stone floor and a closed ring of walls on the rim.

The island grid, centred (`,` grass, `-` sea; `%` tree, `H` house about 2x2
at (4,-1), `X` campfire at (0,0), `j` lantern at (3,1), `f` fence, `r`
boulder, `*` flowers, `;` tuft, `q` lily pad):

```
---------------    z = -6 (north)
----,,,,,,-----
--,%,,%,,,,%,--
-,,,,,,*,,,,,%-
-%,;,,,,,,;,,,-
-,,H,,,,,,,r,,-
-,,,,,,X,,,,,%-    z = 0
--,,j,,,,,,,,,-
-%,,,,,,,*,,,--
-,,ffff,,,,,%,-
--,,,;,,r,,,,--
---%,,,,,,,----
------q----q---    z = 6 (south); x = 7 (west, left) .. -7 (east, right)
```

With a bigger `size` the island stays in the middle and every cell outside
it is already sea, so you only draw what you add. The old fixed HD island is
shelved behind `?island=1`.

## Layers (later wins on each cell)

1. **base**: its sea, grass floor and objects;
2. **grid**: every glyph replaces the base's floor on that cell (`,` grass or
   `=` wood on base sea makes land, jetties, islets; `-` turns land into
   sea), and its objects are added; `.` leaves the cell as it was. Nothing
   removes base objects except a `plain` base;
3. **`objects`** and **`paint`**, explicit;
4. **map lines**, laid out on the free land that is left.

Then walk-in buildings are expanded ([things.md](things.md)). In code:
`expandBuildings(expandGrid(expandBase(normalizeScenario(json))))` in
`app/scenario.js`, then the layout engine.

## Islets and getting around

Draw islets as land glyphs in the sea. Walking onto sea is a fall, so
**connect islets with `=` wooden jetties** if the player should walk there.
Chat reaches a character at any distance, but `give` and `sell` need the
player within 3 cells. Lily pads go on sea: `q` in the grid, or an object on
a sea cell.

```jsonc
// 31 x 21 archipelago on the island base: an islet to the east with a jetty
"base": "island", "size": [31, 21],
"grid": [ /* 21 rows of 31; only these rows differ from all '.' */ ],
// row 10 (z = 0): "....................=====,2,,,."
//   columns 20-24 are a jetty from the island's east coast (x -5..-9),
//   25-29 an islet with agent 2 on it (x -10..-14); all other rows '.'.
```

Walking finds a way around walls, painted water and lava and solid props (A*
over the grid, smoothed into straight legs). `"pathfinding": false` restores
straight-line walking that stops at the first obstacle: a guide-them-through-
the-maze puzzle.

## Floors

`floor` paints the whole board; `paint` (or a map line `paint`, or grid
glyphs) paints cells. Materials: `stone flagstone dirt wood sand grass water
lava` and modern `oak tile concrete carpet`. Water and lava block walking and
placement; lava glows and lights its surroundings. `sea` makes the cell
water.

Every floor is a real-world texture on one continuous ground: grass a meadow
(forest floor in a generated forest), `stone` cobbles (flagstones
underground), `dirt` a worn path, `sand`, `wood`/`oak` planks, `tile`
flagstones, `concrete` rough stone. Natural ground (grass, dirt, sand, mud
under water) blends softly into its neighbours; built floors (cobbles,
flagstones, planks) keep a crisper edge; the edges wander and never follow
the squares. Unpainted squares inside a house are planks. `carpet` is a
woven rug standing on the floor. Outdoors on medium and high quality, grass
gets tufts, wild flowers and pebbles (thicker along paths and wall feet).

The squares' lines are off by default; the Graphics pane's **show grid**
draws them faintly (the printed tabletop map always has them).

## Walls

- `"walls": "stone"` and `"tabletop"` (the default; the same now): thick
  stone walls. Outdoors they are rubble walls with a cut-stone cap; in
  dungeons, caves and dark worlds large dressed blocks; the walls of a
  house (a room that gets a roof) are timber-framed plaster on a low stone
  plinth, with small windows on long outside walls that glow at dusk and
  night (only a picture: they don't let anyone see through). A cracked wall
  has a broken top.
- `"modern"`: smooth painted panels with a baseboard.
- `"block"`: the old cubes.

`"wallHeight"` multiplies the height (0.25-4). Doors are person-height, so
**use `wallHeight: 2` whenever there are doors** (generated maps and the
world generator always do; at 1 the door looks sunken and the first-person
head clips the lintel). A `door` fills a wall cell (`+` in a grid): a plank
door in a timber or stone frame with the wall carried over the top, swinging
open as anyone approaches.

With the follow camera, walls between the camera and the player drop to a low
stub (`app/cutaway.js`), so tall walls never hide the hero. With the free
camera every wall stands at half height; first person shows them whole.

## Beyond the edge

No board floats any more. What lies past the edge (`"outside"`):

- `"land"`: the ground carries on into gentle hills and haze; outdoor worlds.
- `"rock"`: solid rock at wall-top height fills everything outside the rooms
  and corridors and runs on into darkness; dungeons, caves, dark worlds.
- `"street"`: a cobbled street into the dusk; a world that is all one
  building (a tavern, a shop).
- `"sea"`: open water to the horizon; islands.
- `"none"`: nothing past a narrow margin.

Left out, it is chosen from the world: dark worlds, the `dungeon` base and
generated dungeons and caves get rock; a board whose rim is mostly sea gets
sea; a board that is mostly one walled building gets street; everything else
land. Sea squares on the rim of a land board carry on outward as sea (a
coast).

`"surroundings"` puts trees on the land beyond the edge: `"forest"` (woods
that thicken into the distance), `"fields"` (open country, scattered trees
and clumps, a tree line far off) or `"none"`. Every land board gets one by
default: forest for a generated forest, fields otherwise. It is only
scenery: nobody can walk there, and characters don't see it.

## Light

`lighting` sets the time of day: `bright` (default) is mid-morning,
`dim` dusk, `night` a moonlit night (readable, not black). One sun (or the
moon) casts soft shadows, the sky follows the hour (stars at night), and
fog fades the land into the horizon. In a living world the clock moves
the sun through the day. Dark worlds have no sun: torches, lamps and fires
light them. `campfire` and `lantern` bring their own warm light, candles
and standing torches too; `light` is an invisible point light:

```jsonc
{ "type": "light", "x": 2, "z": -1, "color": "#ffb060", "intensity": 3, "range": 6, "y": 2 }
```

A light only lights props and characters within its range; floors get a glow
decal instead, so a board can have many. Each mesh takes its nearest four
local lights (`app/scenery.js`). `place light ...` in a map line gets the
defaults (warm white, intensity 3, range 6, 2 up); for colours, use
`objects`.

## Darkness (`dark`)

`"dark": true` (default for generated dungeons; `app/darkness.js`):
unexplored squares are black, so the overview camera shows only what the
player has found. A square shows while it is in the player's line of sight
(walls block, doors only while the player is next to them) and lit: within
range of a room `light`, lantern, campfire, standing `torch` or candles, or
of a carried torch (3.6 squares), or right next to the player. Squares seen
before stay, dimmed, and characters on them are hidden until seen again.
Anyone with a `torch` in their inventory carries it lit in the left hand; in a
dark world the player starts with one. `?nofog=1` turns the fog off for
testing; the tabletop map never has it.

What characters themselves see follows the same rule from where they stand:
[characters.md](characters.md).

## Roofs

Walled rooms in a world that has an outside get gable roofs (`app/roofs.js`):
thatch on small houses, clay tiles or slate on bigger ones, with plaster
gables and timber trim. Rooms are found from the walls (a door, or a
one-square gap between two walls, closes a room), so generated villages,
drawn grids and hand-edited maps all get them. Not in dark worlds, dungeons,
or a world that is all one building (the roof would be the whole sky).
`"roofs": false` turns them off, `true` forces them on.

The roof of the room the player is in (or whose doorway they stand in) fades
away; with the follow camera, a roof between the camera and the player turns
see-through. The free camera never peeks: roofs stay on.
