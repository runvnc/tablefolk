# Rendering (Babylon.js)

Babylon.js 9.30 on WebGPU (WebGL2 with `?webgl=1`), Havok physics, loaded
unversioned from cdn.babylonjs.com by `app/preflight.js`. The look (since
2026-11-20) is weathered, muted, semi-realistic painterly fantasy: matte PBR
with each model's own maps, one sun or moon with soft shadows, ground that
blends, land running on to a hazy horizon. `app/look.js` has the materials
and post-processing, `app/sky.js` the light, sky and time of day,
`app/terrain.js` the ground and what lies beyond the board, `app/walls.js`
the walls, `app/roofs.js` the roofs.

## Materials (look.js)

`TABLEFOLK_LOOK.matte(m)` is the finish of everything (the old
`plasticFinish`, `toyFinish`, `applyClayLook` call it): the material's own
base colour, normal, metallic-roughness and AO maps; plain roughness raised
to .55 at least (metals, by a metallic map or a metal name, .3); a roughness
map clamped in the shader by a material plugin (`TfMatte`: a regex injection
after `reflectivityOut.roughness`), since glTF's factor can only lower it; no
clear coat, no clay detail normal; environment intensity at most .55;
metallic 0 unless a map or the name says metal (glTF's default
metallicFactor 1 made props chrome). The startup pass in `main()` runs it on
every material (water and sea keep their sheen). Tone mapping: neutral,
exposure set by the hour (sky.js), contrast 1.06, no colour curves (the teal
shadow grade is gone). Medium/high: bloom threshold .9 weight .14, a light
neutral vignette, FXAA, mild sharpen; SSAO (strength 1.6) only at high.

## Light, sky and time of day (sky.js)

- Two global lights, never added or removed (that recompiles every
  material): `sun`, a DirectionalLight that is the sun by day and the moon by
  night, and `sky_fill`, a HemisphericLight. The old point "key" light with
  its cubemap shadow, the teal rim and the cool fill are gone. Local lights
  (lamps, fires, spells, lava) are unchanged and budgeted as before.
- One ShadowGenerator on the sun (PCF; 2048 and QUALITY_MEDIUM at medium,
  HIGH at high; 1024, QUALITY_LOW, refreshed every second frame at light),
  a fixed frustum (`shadowFrustumSize`) fitted each frame around the camera's
  target (1.05 x the camera radius, 10-70 m; 14 m in first person), its
  centre snapped to whole shadow texels in the light's frame so it doesn't
  shimmer while the camera glides; `shadowMinZ` 1, `shadowMaxZ` 240, the
  light 120 m back. `transparencyShadow` so alpha-tested leaves cast
  through their cut-outs. `?sunshadow=0|1` overrides; the Graphics pane's
  "sun and moon shadows" (old key `keyShadowEnabled`) switches it. The
  contact-shadow discs under figures stay at every quality.
- `setTimeOfDay(hours)` interpolates keyframes (00, 04:36, 05:42, 07, 10, 15,
  16:36, 17:30 golden, 18:36, 19:24 dusk, 20:24): sun colour and intensity
  (3.8 at midday), moon intensity (.6-.75), sky top and horizon colours,
  hemi sky/ground colours and intensity (.74 by day), environment intensity,
  exposure (1.3 by day: sunlit plaster near-white cream, a shadowed cobble
  mid-grey), cloud colour, star alpha. The sun rises in the east (-x), is
  highest in the SOUTH (+z, the default follow camera's side, which looks
  north: faces toward the camera are lit and shadows fall away to the side
  and back; pass 1 had it in the north and the scene came out backlit and
  murky) and sets in the west: morning from the south-east, evening from the
  south-west. Between 20:24 and 04:36 the moon (fixed, high in the
  south-west, cool blue) takes the same light. The haze is the horizon colour
  leaned a little blue (aerial perspective); dusk is blue-violet. `setLighting(mode)`: bright 10:00, dim
  19:00, night 23:00. Published as `tablefolk.setTimeOfDay` (installWorldAPI)
  and `tablefolkLook.setTimeOfDay`; clock.js's quarter-hour hook calls it.
- `setWorld({ underground, fogNear, fogFar, sky })` (terrain.js sets it by
  the world's outside): underground worlds get no sun (intensity 0, still
  there), a cool fill (.32, blue-grey) so unlit explored stone is dim but
  legible, exposure 1.25, black fog and clear colour, no sky.
- Fog is linear, from `radius + fogNear` to `radius + fogNear + fogFar` (the
  camera's distance to its target; land 30/200, street 8/32, underground
  6/26), recomputed each frame, so the board is
  clear at any zoom; its colour is the horizon's (the clear colour too).
- Sky: a 1000 m back-faced sphere (`sky_dome`, infinite distance, no fog)
  wearing a 512 x 256 DynamicTexture repainted when the hour's colours change
  (gradient, horizon band = fog colour, ~420 stars at night); `sky_clouds`, a
  900 m sheet at 110 m with a tiling fbm cloud texture drifting (vertex alpha
  fades it toward the horizon); `sky_sun`, an additive billboard disc in the
  light's direction (smaller and pale as the moon). Off in the tabletop view.
- House windows (walls.js) glow by the hour: `tablefolkWalls.setNight(k)`.

## Board and floors (terrain.js, 2026-11-20)

- `rebuildBoard()` (app.js) only keeps the logic's cells (`state.boardCells`,
  sea cells excluded) and calls `tablefolkTerrain.rebuild()`. The old sculpted
  tiles, baked tiles and edge columns are gone.
- Meshes: `board_terrain` over the board and an 8-cell margin, vertices every
  half cell, y 0 on every walkable cell; a vertex whose every touching cell is
  sea dips to -.75. `board_terrain_far`, a 3 m grid (4 m at light) out to
  170 m with the inner rectangle skipped (its vertices there at -.04):
  hills (fbm, height only from 4 m outside the board, rising over 40 m) in
  land mode, the sea floor where the sea is, flat in street/rock mode (and
  short). `sea` (900 m, y -.22, dark, roughness .14, alpha .88) when there is
  any sea; `state.seaLevel` is its height (falls).
- Material: one PBRMaterial with the `TfTerrain` plugin (WGSL for WebGPU and
  GLSL for the WebGL fallback). Each cell's layer: paint (grass ->
  grass_meadow, stone -> cobblestone or flagstone underground, flagstone,
  dirt -> dirt_path, sand, wood/oak/carpet -> wood_planks_worn, tile ->
  flagstone, concrete/lava -> stone_floor_rough, water -> mud, sea -> sand),
  else the default: grass_meadow (forest_floor for a generated forest),
  wood_planks_worn for unpainted cells inside rooms (roofs.js findRooms),
  flagstone underground. Outside the board: the commonest natural layer on
  the board's rim (land), cobblestone (street), sand next to rim sea cells.
  Layers are ordered by use; past the limit (4 light, 8 medium/high) a layer
  maps to the nearest kept one by mean colour.
- Textures: two `RawTexture2DArray`s built from the env WebPs (decoded with
  `createImageBitmap` + OffscreenCanvas, mipmapped): colour.rgb + roughness
  in alpha; normal.rg + AO in b + a height (luminance) in a. 1k at light and
  medium, 2k at high (memory: 8 layers x 2 arrays at 1k is ~85 MB with
  mips, at 2k ~340 MB). Samplers: these two and two control maps.
- Control maps: two RGBA8 `RawTexture`s (layers 0-3, 4-7) at 8 texels a
  cell over board + margin, each layer's 0/1 mask blurred twice with a box
  of radius .5 cell (wide) and .14 cell (tight); per texel the result mixes
  toward tight as the amount of built ground (cobbles, flagstones, planks)
  nearby rises, so natural ground blends softly and built edges stay crisp;
  normalised. Clamped: past the margin the edge texels carry on.
- Shader (`CUSTOM_FRAGMENT_UPDATE_ALPHA`): world xz is the UV; the control
  lookup is wobbled by two octaves of value noise (amplitude .32 cell) so
  edges wander and never follow the grid; each layer with weight > .003 is
  sampled with `textureSampleGrad` at its real tile size (`tileMeters`)
  plus a per-layer offset (gradients from outside the branch: WGSL
  uniformity), weighted pow(w, 1.6) x (.15 + height) (stones poke through
  grass); colour to linear (pow 2.2), a low-frequency macro variation
  (.16); the normal (OpenGL +Y: T = +x, B = cross(N, T)) replaces `normalW`;
  roughness and AO (medium/high) go in through a regex replacement of
  `var roughness: f32=reflectivityOut.roughness;` (also `aoOut`). Grid
  overlay: lines at half-integers inside the board when `tfParams.x` is 1
  (Graphics pane "show grid", `tablefolkTerrain.setGrid`, on in the tabletop
  view). Never call `dpdx`/`fwidth` inside a branch (a WGSL error that only
  showed with the shadow map off).
- Before the textures arrive (and if the plugin fails) vertex colours carry
  the layers' mean colours.
- Floors: wood, oak, tile and concrete are flat textures in the terrain now
  (no plank geometry, `floorLiftAt` 0); the rug (`buildRug`) still stands
  3 cm up. Water and lava stay overlays (`rebuildPaint`): water is dark
  (.05,.09,.10), roughness .12, alpha .8, over mud, so its shore blends.
- Variation (pass 2): natural layers (`tfKind` 1) get patches of drier,
  yellower and of lusher grass at 6-15 m (`tfPat` noise); dirt_path (`tfKind`
  2) a lighter worn centre and darker edges by its control weight; on land
  boards the far ground outside the board gets a rotated field patchwork
  (26 x 17 m cells, three crop tints, soft darker seams, from 12 m out).
  JS has the same noise (`patchAt`) so the tufts' instance colours follow
  the patches.
- Local lights: the terrain and the dungeon rock (`board_terrain`,
  `board_rock`) take the local lights nearest the camera target (scenery.js
  budget); before pass 2 floors got only the glow decals, so torch pools on
  the ground were faint.
- Ground cover (medium/high): `env-nature/cover` grass_tufts (4 meshes),
  flowers (3), pebbles (5) as thin instances, deterministic per board seed,
  on grass and forest-floor cells (open grass one tuft on about a third of the
  cells, edges .6 + 1.5 per neighbouring path/wall/floor, kept .45 cell off a
  path's side, none in rooms, on paths, floors or doorways), pebbles only by
  paths and objects; instance colours (tufts lightened, tinted by the grass
  patches); capped at 3500 (light: pebbles only, 500). Seen from above, open
  tufts read as dark specks: hence the thin spread. They don't cast shadows.
- `rebuildBoardSupport()` builds the physics ground and the pick plane as
  before.
- Terrain modes and the outside: see "The edge of the world" below.
## Instances and lights

- Repeated things use thin instances (`thinInstanceSetBuffer('matrix' |
  'color')`; per-instance colour works with PBR). Meshes that share geometry
  must call `makeGeometryUnique()` before getting their own instance buffers,
  or one mesh's colour buffer leaks into the other and the frame goes black.
- Every model file loads once; placed copies share geometry, materials and
  textures. Each model's pieces are merged by finish when it loads
  (`mergeContainerLooks`, in `loadModelInstance`): pieces whose PBR
  materials differ only in plain colour become one mesh with the colours in
  vertex colours and a white copy of the material (`lookKey`: the material's
  serialization without its `albedo`); textured or transparent pieces merge
  only with pieces of the same material; skinned, animated and morphing
  models are left alone. A bookcase went from 14 draw calls to 1. The merged
  meshes are the object's children like the pieces were (proxy, picking,
  physics unchanged). New meshes must copy `sideOrientation` from glTF
  pieces: the default showed a merged body's insides.
- Code-built things merge same-material parts with `mergeUnder(node,
  meshes)` (relative transforms baked; missing vertex colours white, missing
  UV2 the bevel map's flat centre): a door's iron leaf and rings, a
  lantern's post and arm (parent them first: their positions are local).
- Static scenery (roots matching `STATIC_ROOTS`: walls, board, paint,
  floors, rugs, roofs, door frames, fences; not props, not moving bodies)
  has its world matrix frozen 1 s and 4 s after a world starts
  (`freezeStaticScenery`). A mesh moved after that would not move: unfreeze
  it first.
- A material takes at most 8 lights (6 at light quality: `graphics-settings.js`
  clamps the `maxSimultaneousLights` setter of StandardMaterial and
  PBRMaterial, `window.TABLEFOLK_MAX_LIGHTS`; every light is computed for
  every pixel, and 8 -> 4 saved 5.4 ms of the Oracle's 9 ms GPU frame). There
  are 2 global lights (sky.js: sun, sky_fill; 4 before 2026-11-20); local lights (`scenery.js` `trackLight`; at light
  quality also the crystal lamps' `lamp_light`) are restricted with
  `includedOnlyMeshes`, each mesh getting the nearest that fit under the cap
  (refreshed every second, assigned only when a light's list changed:
  assigning marks every mesh's lighting dirty). Board meshes (`board_*`) get a glow decal instead. A merged floor
  once took the first 8 lights in scene order and lava's light vanished: that
  is why the nearest-4 rule exists. Hidden meshes keep their nearby lights.

### Start-up (look pass 3)

Measured with `startup.mjs`-style timing (scene ready, world active =
scenario and player avatar, dressed = mesh count steady 3 s; hearthvale,
light, this machine): control maps at 4 texels a cell (8 cost ~470 ms of
main thread a build), terrain rebuilds coalesced (120 ms) and skipped when
size, mode, paint, walls and grid are unchanged, ground texture arrays
decoded once after `tablefolk-scenario-started` (vertex mean colours until
then), roofs one a frame, the post-start wall rebuild skipped when every
wall's look is unchanged, surroundings trees loaded in parallel, static
props as hardware instances (`loadModelInstance`). `window.__tfMarks`
holds the summed ms and counts of terrain control/arrays/build/cover, walls,
roofs and surroundings. Most of what is left is Babylon's shader
preprocessing, as on main.

Start-up with the model (2026-11-20, later; `tools/browser-test/startup-time.mjs`,
a fresh headless test Chrome per run, three runs, medians, light quality,
Gemma 4 E2B cached; s from navigation):

| | world active before look / merged / now | brain ready before / merged / now | fully dressed (art) before / merged / now |
|---|---|---|---|
| hearthvale | 5.5 / 5.9 / 6.6 | 20.9 / 23.2 / 22.1 | 8.6 / 10.1 / 10.2 |
| goblin-bakery | 3.3 / 3.1 / 3.6 | 16.4 / 16.1 / 16.1 | 5.1 / 5.0 / 4.9 |
| deepdelve-camp | 3.8 / 4.4 / 5.4 | 19.1 / 20.3 / 20.2 | 8.6 / 8.0 / 8.4 |

The "8 s before, 25-39 s after" seen in live-eval was two different
measures: the LiteRT worker outlives a page in the same Chrome, so a second
load there has the brain in 5-6 s (warm), while a fresh Chrome loads the
weights again (16-23 s); live-eval's `fps=10` also slows a big world's
start (one run: world active at 18 s). What was slow: `libs/device`'s card
memory probe (cards sold with 6 or 12 GB) asked for a device from an adapter
the bandwidth measure had already used, failed, retried after 2 s and kept
no answer, so every start spent 2-13 s in `pickForDevice` before the model
began (fixed: a fresh adapter, and a can't-tell kept for a day). The model
now starts 1.2 s after the world is up (it waited for 45 frames, up to 6 s),
and the dressing (ground texture layers, ground cover, the trees around,
shells after the first roof) waits while the model loads or answers
(`window.tablefolkDressGate`, `TABLEFOLK_MODEL_BUSY`), so "fully dressed"
with a model comes after the brain (about 22 s in hearthvale). The model's
own set-up (weights onto the card, warm-up: 9-13 s) is GPU-bound: the main
thread is idle through most of it. The bandwidth figure cached in the test
profile (30 GB/s, measured under load once) is kept 30 days.

### The edge of the world (terrain.js, surroundings.js)

`tablefolkTerrain.mode()`: the scenario's `"outside"` (land | sea | rock |
street | none), else: rock for dark worlds, the dungeon base and generated
dungeons/caves/crypts/castles/keeps/mines; sea when more than 60% of the
board's rim is sea; street when the walls make rooms and under a quarter of
the ground is outside them (a world that is all one building); else land.

- land: the margin and the far mesh carry the rim's ground into hills and
  haze (fog near 10, far 150 m); sea cells on the rim carry on outward as
  sea (a coast). surroundings.js puts trees on the hills for every land
  board: `"surroundings"` forest | fields | none, default forest for a
  generated forest, else fields. Trees are the env-nature `.med` models at
  real size (8-15 m), each model's meshes baked and drawn as thin
  instances, standing at `tablefolkTerrain.heightAt`; forest: a 3.2 m
  lattice from 3.5 m out to 60 m, thickening; fields: a 5 m lattice to 95 m,
  lone trees and clumps (a sine pattern), a tree line at 55-75% of the
  depth; half at light. Not pickable, no physics, no shadows.
- rock: `board_rock`, solid rock at wall-top height over every cell outside
  the rooms (roofs.js `findRooms().outside`, minus painted floors) and the
  outer half of every wall cell facing it (half-cell quads; corners by the
  diagonal rule), 10 cells past the board, with vertical faces where it
  meets floor; stone_wall_rubble darkened, world UVs, single-sided, never
  cut by the cutaway. Underground light (sky.js), black fog. In a dark world
  the unexplored squares are rock too (darkness.js `known`): the rock is
  rebuilt (throttled 350 ms, `refreshRock`) as the player explores, and
  darkness.js draws no fog boxes in rock worlds. No sea plane in rock worlds
  (the dungeon generator's "sea" squares are under the rock, dark stone).
- street: cobblestone past the walls, fog at 3-29 m, the sky stays.
- sea: sand under shallow water at the edge, the sea floor falling to
  -2.6 m, open water to the horizon.
- Walking off the board where `tablefolkTerrain.waterAt` is false stops the
  walk at the edge (animate in app.js); into water it is still a fall.

## Glows and magic

- Unlit glows are `StandardMaterial` with `disableLighting`, the colour in
  `emissiveColor` and the shape in `opacityTexture` (additive). Never put the
  texture in `emissiveTexture` to tint it: Babylon *adds* an emissive texture
  to `emissiveColor`, so a white flare came out white whatever the colour
  (that was the fireball's white blob over the caster). Only a texture drawn
  in colour (the crystal ball's nebula) is an emissive texture, with a black
  `emissiveColor`.
- Additive layers saturate to white where many overlap. Fire that must stay
  orange is alpha-blended tongues (`spells.js` `T.fire`, `blend: 'std'`) with
  a small additive core; the explosion is the same plus a short additive flash.
- Gold or coloured inlays over a coloured floor are alpha-blended
  (`ALPHA_COMBINE`), not additive: additive gold over the blue rug turned white.
- Floor decals and glow pools are excluded from the glow layer
  (`state.glowLayer.addExcludedMesh`); the rune circle is dimmer above light
  quality, where bloom spreads it.
- Arcane scenery (`scenery.js`: `crystal_ball`, `scrying_pool`, `rune_circle`):
  a glossy pedestal (lathe column, `plasticFinish`) and unlit additive layers
  with one small point light each (in the nearest-4 budget), a glow decal on
  the floor (floors take no local lights), up to ~25 CPU particles, one
  `onBeforeRender` observer each. Per-object materials are listed in
  `state.sharedAssetMats` so `disposeWorldObject` doesn't dispose their shared
  canvas textures, and are disposed by the object's `cleanup` a microtask later.
  `?art=1` is still mode (no animation, no particles): add `&still=0` to see them move.

## Walls and doors

- Styles: `stone` and `tabletop` (the default) are drawn by walls.js;
  `modern` (painted panels) and `block` (cubes) keep app.js's builders.
- walls.js (2026-11-20): every wall cell is one wall object for the logic;
  the picture is a continuous run .32 thick through the cell centres (arms to
  each wall neighbour, a post where runs meet), boxes with world-space UVs in
  metres (faces projected on their dominant axis; the u axis turned so
  opposite faces aren't mirrored) and the env textures scaled to their real
  size, so courses run across cells and corners. Looks: `rubble`
  (stone_wall_rubble, a stone_blocks_large cap .11 tall and .08 wider),
  `blocks` underground (stone_blocks_large), `house` for walls next to a room
  roofs.js will roof (`tablefolkRoofs.planned()`): a rubble plinth .42 high,
  plaster_aged above, timber_dark sill, top plate, posts at corners and at
  every even cell edge, one brace per even cell, and a window every 3 cells on
  straight outside runs longer than 3 (a dark pane that glows warm at
  dusk/night, a timber frame, mullion and transom; visual only). Cracked:
  broken uneven tops, no cap; burned: dark vertex colour. Materials: colour,
  OpenGL normal (`invertNormalMapX` true, `invertNormalMapY` false), the
  roughness map as the metallic texture's green (`useMetallnessFromMetallicTextureBlue`
  false, or the grey map made walls metallic), AO above light. 1k textures
  (2k at high).
- `wallH() = WALL_H * state.wallHeightScale`; doors are `max(.55, min(1.45,
  wallH() - .3))` tall. Over a door the wall carries on (plaster and top plate,
  or stone and cap). Frames: timber jambs and lintel (house) or cut stone,
  a timber threshold. The leaf is app.js `buildDoorLeaf` with the plank parts
  in wood_planks_dark (`useVertexColors` off) and the iron straps and rings
  as before. A door swings open as anyone approaches; locked ones stay shut.
- Walls are rebuilt again 650 ms after a scenario starts (the rooms and the
  outside are known then).
- `app/cutaway.js`: with the follow camera, walls between the camera and the
  player are cut per pixel in the walls' own materials (a material plugin
  discards fragments above a stub height in the cut squares); geometry is
  never changed. Every mesh in `state.wallVisuals` is cut, so walls.js's
  meshes need nothing more. walls.js materials are not back-face culled, and
  the plugin draws a back face seen through a cut as a flat dark section
  (`tfCutArea.w` 1; the fog boxes' instance 0), so a cut wall reads solid
  rather than hollow with timber "teeth". Cut squares get a stone lid. The free camera uses
  a second mode (`half()`, uniform `tfCut.z` = 2): every wall fragment above
  half the wall height is discarded, with no lids; the fog boxes' plugin
  (`attach(mat, true)`) ignores that mode. `suspend(true)` returns the mode,
  `suspend(mode)` restores it.

## Darkness

Reveal modes (`reveal`, 2026-11-20): `start(dark, reveal)`. `"rooms"` uses
roofs.js `findRooms` (rooms re-found when the room count or sizes change):
any room with a square in the player's sight is revealed whole
(`revealedRooms`, `revealedCells` for saving); `known(x, z)` (terrain.js's
rock) is the revealed rooms (and everything outside rooms) in that mode,
the explored squares otherwise, so lit dungeons show rooms under solid rock
until seen into; dark worlds with rooms draw their black boxes only inside
revealed rooms. roofs.js keeps an unrevealed room's roof or shell at full
opacity (no camera-ray fade). Outdoors with `"cells"` and no dark: sight is a
radius of 6 squares (no line of sight); `board_mist_low` (y .12, alpha .68)
and `board_mist_high` (y 1.4, alpha .22), two ground planes over the board
and 3 squares round it sharing one `DynamicTexture` opacity mask (8 px a
square, the unexplored squares white, thinning past the edge, blurred with
the canvas `filter`), redrawn only when the explored set grows; grey, lit
(diffuse .36-.55, a little emissive). Characters and loot (`LOOT` types and
`ITEM_CATALOG`) in what is still hidden are disabled (`_fogHidden`).
`save()`/`restore()` carry the explored squares and revealed room squares.

Link markers (sections.js, look pass 4): code-built boxes merged per
material into `link_<kind>_<material>` meshes (one draw call a material),
not saved: stairs down is a real stairwell (terrain.js `setHoles`: up to four
squares where the terrain's fragments are discarded, `tfHole0-3` in the
TfTerrain plugin; six steps going down to -1 m, darker step by step through
vertex colours, stone sides, a black floor and back, a kerb), stairs up (six
steps and cheeks against the wall, a black opening in a stone frame), cave
(seven tilted boulders as an arch over a black mouth, a lintel rock), gate
(stone footings, timber posts, braces, a small roof, open leaves with iron
bands), trapdoor (a frame, planks, two straps, a ring); a billboard label
names the destination. No glow disc. Edge links: two waymarker stones either
side of the road where it leaves, a signpost whose arm names the place
(DynamicTexture), and a faint ground arrow shown only while the player is
within 3 squares. A click-walk to a rim square by an edge (or past the board,
clamped to the rim) travels when the player arrives (scenario.js
`edgeClick`, `state.clickTarget`).

Outdoor mist (pass 4): one unlit sheet (`board_mist_low`, y .09, colour
(.13,.155,.19), alpha .62) over the board and six squares round it; its
opacity mask (8 px a square) is the unexplored squares blurred by about two
squares, fading smoothly to nothing past the rim (no rectangle). Unlit and
darker than lit ground, so it never whitens a sunny board.

`app/darkness.js`: fog of war as thin-instance boxes (black for unseen,
dim for remembered, a flat lid at floor level where there is neither floor
nor wall, so wall outsides show). Remembered squares are a floor film (boxes
looked like dark glass). In first person, black distance fog replaces the
boxes. Carried torches: a torch mesh at the hand's position kept upright
(parenting it to the hand bone pointed the flame at the floor), a
`PointLight` tracked by scenery, a lamp pool, and a dimmed particle flame
(bloom blew it out).

Cutaway, pass 4: terrain.js's rock over the outer half of wall cells is its
own mesh (`board_rock_wall`, a double-sided clone of the rock material with
the cutaway plugin), so it is cut with the walls; left whole it stood as a
row of "teeth" above cut walls. Wall lamps (scenery.js `lanternVisual`
sconces, listed in `window.tablefolkSconces`) on cut walls are hidden, their
light kept (cutaway.js `sconces`).

Dungeon walls (pass 4): the `blocks` tint is (.7,.74,.82) and lanterns light
(1,.8,.58) (the old (1,.72,.34) turned grey stone olive); the `TfDamp`
plugin darkens and greens the albedo low on the walls (under ~.75 m) in
value-noise patches.

## Roofs

`app/roofs.js`: rooms are found by flood-filling the board from its edge over
everything that is not a wall or door (a one-square gap between two walls
counts as a doorway); a room that fills its rectangle gets a gable roof built
in a local frame: courses of roofing (each a box tipped a little steeper), a
rolled eave and ridge, timber bargeboards, double-faced plaster gables, a tie
beam and king post, and on some a chimney. Roofing by house (seeded): thatch
for rooms of 16 cells or fewer (and some others), else clay_roof_tiles or
slate_roof; the env textures (turned a quarter so the courses run along the
ridge, `wAng`), plaster_aged gables (UVs given to the triangles),
timber_dark, rubble chimneys. Materials are shared by every roof of a kind,
so the fade is per roof through each mesh's `visibility` (and roofs are
disposed without their materials). Pieces are merged per material with
`BABYLON.Mesh.MergeMeshes`; one roof a frame, nearest the player first (all
at once took ~2.5 s of one frame in a big village).

Building shells (look pass 3): homes and workplaces stay walk-in rooms
(jobs.js needs their beds and stations on the same map), but outside a room
gets the matching env building model as its exterior instead of a code roof
(`planShell`, `buildShell`): chosen by the room's role from `state.places`
(tavern/inn: inn, smithy: blacksmith, stable/barn, guardhouse: barracks,
mill, homes and shops: house, fantasy, stone or tall house; a home or
farmhouse too big for those: inn, mill house, barracks), seeded, the last
choice avoided; turned so its +z front faces the room's door side; scaled
non-uniformly to the room's outer size when within 0.75-1.25 on both axes
(else the code roof). A shell is a roof entry: it fades with the same rule
(gone while the player is in the room or its doorway, also in first person;
see-through when the follow camera's ray to the player crosses its bounding
box), and while it stands the characters inside are hidden (`g._shellHidden`,
kept apart from the fog of war's `_fogHidden`). Visual only: walls, door,
sight and paths are the room's; the room's code walls sit inside the model's
walls. `"shells": false` (scenario or `generate`) keeps code roofs.
`tablefolkRoofs.shells()` lists them. Pass 4: a house room's walls,
door frame and door leaf are drawn per room (walls.js `roomMeshes(room)`)
and disabled while its shell stands opaque (the models' walls are inset from
their footprints and the code walls poked through); the shell slides along
its front, widened up to 1.25 x, or mirrored, so the model's door (`DOOR_X`,
read off each model's front view) is over the room's door (`doorFit`); dark,
cool texels on upright faces of the building models (shells and props) glow
warm with `TABLEFOLK_NIGHT` (walls.js `setNight`; roofs.js `windowGlow`, a
material plugin adding to `finalColor` before fog), since the models have no
emissive mask. Speech bubbles, badges and the 💬 chip of a character whose
root is disabled (indoors under a shell, in the fog) are hidden. `planned()` lists the rooms that get (or will
get) a roof (walls.js), `findRooms()` the rooms and the outside squares
(terrain.js). Fade rule: 0 when the player is inside (or roofs are lifted by
`tablefolkRoofs.toggle()` in tests), .22 when the follow camera's ray hits
it, else 1; never in the free camera.

## Characters

- KayKit people's body parts (one material) are merged into one skinned mesh
  after the mouth is placed (`mergePersonParts`): each part comes with its
  own copy of the skeleton and its own bind pose; a part joins the first
  part's skeleton when its inverse bind matrices are the first's times one
  fixed offset (checked on every bone) and its vertices are moved by that
  offset. 7-9 draw calls and skeletons a person became 1; the spare
  skeletons are disposed. The `_Head` mesh is gone after the first frame.

- Finish: every person (`createFigure`, `createPerson`) gets `toyFinish()`,
  now look.js `matte()`: the model's own maps, roughness at least .55 (metal
  .3), no clear coat (2026-11-20; it was a glossy toy plastic).
- Bodies are in `FIGURES` (`app/app.js`): KayKit chibi people with the 8
  KayKit animation packs, Quaternius models with their own clips mapped to
  the game's names (`FIG_CLIPS`, `figClipName`), Universal-rig figures, Meshy
  monsters. `importedRoot.rotation` is reset to zero (figures faced
  backwards); Meshy models need no turn. Hair tint is matched by material
  name (`/hair/i`). Weapons follow the hand bone, falling back to
  `Wrist.R`, `Arm.R_end`, `LowerArm.R`.
- Facing: `faceToward(g, other)` points `g.dir` (the logic's eight
  directions) at someone and lets `bodyYaw` turn the body smoothly to face
  them exactly for a while (7 s, until it walks). `say()` turns a speaker to
  `addresseeOf(g, text)` (someone in earshot it names, else whoever spoke to
  it in the last 30 s, `g._heard`, else the player when near, else the
  nearest) and the listener back; the player's chat turns the character to
  the player. The same distance sets how loud the line is (`level` to the
  TTS manager: .55 beside, .75 near, 1 across a room, .35 whispered).
- Hand-overs (`startHandover`, from `give`, `sell` and the player's gives in
  `play.js`): a token (the item's tile picture as a billboard, coins, else a
  parcel) moves from the giver's right hand to the receiver's over 1.6 s;
  both reach with the right arm (`poseReach`, the carry code's two-bone IK);
  it waits while either walks. Universal-rig arms are `UpperArm.R`,
  `LowerArm.R`, `Wrist.R` in `findBones`.
- Meshy models also carry 42 KayKit clips under their KayKit names
  (`createFigure` puts every clip in `rigAnims` under its own name; a
  `FIG_CLIPS` mapping wins only for melee attacks, the model's own `Attack`):
  sitting, lying, work, running, waving... ([assets.md](assets.md)).
- Using things (`app/uses.js`): `g.pose` (sitting or lying) makes `playRig`
  play the pose clip for idle and talk, and anything else stands it up first;
  `bodyYaw` holds the pose's facing. The model is lifted onto the seat or
  mattress by moving `rigRoot` (not the root, which the logic places),
  measured from the thigh or hip bones a frame after the clip starts, and
  its hips centred over the seat, so any rig fits. Getting onto a seat is a
  teleport with the TELEPORT prestep: an ANIMATED collider moved with the
  usual ACTION prestep sweeps there within one physics step and flings any
  light thing on the way (it threw a chair 3900 units). A light seat is
  ANIMATED while someone sits on it.
- Meshy idle clips are calmed in the GLB (`CALM=0.3 tools/finish-monster.sh`:
  keys pulled toward the bone's mean pose, head/neck/hips half again): the
  raw clip turned the head and hips about 90 degrees.
- Speech bubbles sit a fixed 42 px above the projected head. The head bone's
  Y scale flaps while TTS speaks (`speechstart` / `speechend`) for rigs
  without a mouth.
- `showSpeechBubble` (app.js) makes every speech bubble (say, whisper, the
  player's chat): up to 256 characters (`clipBubble`), wrapped (`.bubble` is
  `white-space:normal`, `width:max-content`, 320 px at most; `.long` over 90
  characters is lighter). A voiced line's bubble has `waitVoice` (only when
  `tablefolkTTS.ready`: a voice still downloading would hold it a minute) and
  a 60 s ttl until the TTS `speechend` whose `text` matches (else the
  speaker's oldest waiting bubble) sets 1.4 s; `ok:false` gives the reading
  time instead. Each line also goes to `g._lines` (20 kept).
- The history card (`setupSpeechHistory`, state in `HIST`): the hovered
  character is found by projecting its feet and head to the screen and
  testing the pointer against that box (no ray pick; `pointermove` on the
  canvas, ignored while a button is held, so orbiting opens nothing). A 💬
  chip (`g._chip`, removed in `disposeCharacter`) floats over a character for
  45 s after its last line when no bubble is up, and while the character is
  hovered; only the chip (with an 8 px `::before` margin) opens the card. The card (`.speech-history`)
  hides that character's live bubbles while open (it lists them) and is
  clamped to the screen; ▶ calls `tablefolkTTS.speak` again.
- Talking mouths: `g.mouth = {influence, apply()}` is driven each frame by
  `updateMouth` from `tablefolkTTS.level()` (the playing voice's RMS, x7)
  when that voice is the character's, else a procedural chatter while an
  unvoiced bubble shows; 0 when silent or with TTS off. Three sources: the
  critter's runtime morph (`addMouthMorph`), KayKit people's dark sphere on
  the head bone scaled open (`addPersonMouth`), and any figure whose GLB has
  morph targets named `mouth_open` (`createFigure` collects them all):
  wizard.glb's `Mouth` mesh (lips, teeth, cavity; built in the file by
  `tools/wizard-extras.mjs`) and its beard on the `Face` mesh, which drops
  with the lower lip like a jaw. The mouth sits in front of the skull's flat
  face (Face space y -.875; deeper and the body mesh hides it).
- First person hides the avatar and draws forearms in rendering group 1
  (`app/fp-hands.js`); post-process pipelines move to the first-person
  camera.

## Notes

Note textures are rendered from HTML with html2canvas (`note-svg.js` is the
fallback). Wall notes are sized and placed from `wallH()`; notes have no
emissive and slightly grey paper (bloom washed them out). Floor notes sit at
y .075 (they were buried) and turn to read from the south.

## Light quality (`?gfx=light`, Graphics pane)

Since 2026-11-20 (the new look): light has the sun's shadow map (1024,
QUALITY_LOW, every second frame), 1k terrain textures with at most 4 layers
and constant roughness, walls and roofs with colour and normal maps only,
the `.med` trees and `.1k` env models, pebbles but no grass or flowers, no
post-process pipeline, SSAO or glow, `adaptToDeviceRatio` off, at most 6
lights per material. Medium: shadow every second frame, 1k terrain with
roughness and AO (8 layers), 1k env models, ground cover, bloom; high: 2k
everything, SSAO, the shadow every frame.

Measured 2026-11-20 (RTX 2060, 1920x1080, headless Chrome, `profile.mjs`
QUICK with 40 s to settle; WebGPU timestamps read 0 on this driver, so the
GPU figure is the median submit-to-done latency, `lat`; memory is the Chrome
GPU process in a fresh Chrome after 35 s; the GPU is shared with another
job's model, so expect +-1-2 ms noise):

| scene | tier | CPU render ms before / after | lat ms before / after | draw calls before / after | GPU MiB before / after |
|---|---|---|---|---|---|
| the Oracle | light | 5.8 / 4.6 | 4.3 / 3.9 | 72 / 164 | 304 / 525-602 |
| the Oracle | medium | 5.8 / 6.9 | 3.8 / 4.9 | 154 / 274 | - |
| market village | light | 6.7 / 7.4 | 3.2 / 4.9 | 79 / 328 | 815 / 850-863 |
| market village | medium | 8.7 / 10.6 | 4.0 / 6.5-10.9 | 172 / 202 | 953 / 1204 |

After pass 2 (same method, 45 s to settle): the Oracle light 4.5 ms CPU,
3.3 lat, 158 draws, 418-426 MiB; medium 6.8 / 4.6 / 276; market village
light 6.4 / 3.8 / 251, 858 MiB; medium 9.2 / 5.3 / 358, 1260 MiB.

After pass 3 (props as instances, small things cast no sun shadow): the
Oracle light 4.1 ms CPU, 3.4 lat, 131 draws; medium 7.2 / 4.8 / 245; market
village light 6.5 / 3.6 / 149; medium 8.4 / 5.1 / 247. Start-up, warm cache
(world active / fully dressed, s): hearthvale light main 5.3 / 9.3, now 5.5 /
10.2; the Oracle 3.8 / 6.6 vs 3.8 / 7.3; goblin-bakery 3.3 / 5.1 vs 4.5 / 6.4.

The extra draw calls are the shadow pass (every caster again), the
real-model trees (several meshes each), the ground cover kinds and the
surroundings' tree meshes. Without the shadow map the market village at
medium drew 200 calls instead of 442 (before the every-second-frame refresh).

Pass 2 (light-tier memory, the Oracle, fresh Chrome, +-50 MiB noise): all
on 517 MiB; without the surroundings' trees 419; without ground cover,
without the terrain's texture arrays or without the sun's shadow map, no
change beyond the noise. So at light quality the surroundings use three
tree models that share bark and leaf textures and drop their normal and
roughness maps, the terrain arrays are 512 px, walls and roofs have colour
and normal maps only, and wall materials are made on first use.

Before 2026-11-20:

Measured on the haunted tavern (2026-10-31): the test Chrome's GPU process
281 MiB at light, 620 at medium. Light: the simple voxel island and sea, no
post-process pipeline, SSAO or glow; no shadow generators at all (the key
light's 1024 and the campfire's 512 cubemaps were still allocated, 32 MB,
when only switched off); `adaptToDeviceRatio` off (one pixel per screen
point); fieldstone wall stones from an icosphere of subdivision 2, not 3
(2.25x fewer vertices; at 1 they became pointed lenses with gaps); the
baked board tile (box tiles wearing the sculpted tile's look, see Board and
floors) on every board; at most 6 lights per material; spells add no point
light (their glows, sprites, floor pools and sky flash carry them); the `.1k` copies (`critter_rigged.1k.glb` made with
`tools/shrink-textures.mjs`, textures only, so the mouth morph's vertex
layout is untouched). Every quality now drops the critter walking clip's
materials and textures after its animation is taken (2 x 21 MB a critter).
The tavern went from 1.95 M to 1.02 M vertices and from 272 to 166 MB of
textures.

### Profile (2026-11-08, RTX 2060, 1080p, headless Chrome with timestamp queries)

How to measure: `tools/browser-test/gpu-profile/profile.mjs` (render-pass GPU time
from WebGPU timestamp queries patched into `beginRenderPass`/`queue.submit`,
Babylon's own counter stalls; per-phase CPU time from the scene observables;
ablations, each against a fresh baseline). Babylon draws everything in one
4x MSAA main pass.

- The Oracle, light: GPU 8.8 -> about 5 ms a frame. The sculpted tiles were
  4.7 ms (466k triangles), the hidden columns 3.4, lights 4.6 (8 per
  material), MSAA 4x 2.7, walls 1.3 (1547 rock instances 0.9), the Oracle
  0.7, the rug 0.6; everything else under 0.3. CPU `scene.render` about 3 ms
  (draw phase 2.1 for 94 draw calls, active-mesh evaluation 0.7, the sea's
  vertex wave 0.17).
- Market village, light: CPU-bound. `scene.render` 8-11 ms (draw phase 5 ms
  for 156 draw calls, active-mesh evaluation 2.3 ms over 709 meshes); bone
  textures re-uploaded through a new staging buffer per skeleton per frame
  (bones are uniforms now, `onNewSkeletonAddedObservable`); the feet check
  skinned whole figures every 8th frame (11.6 ms spikes for two seconds; now
  only each mesh's lowest vertices, `lowestSkinnedY`). Then merges: draw
  calls 156 -> 91 (the Oracle 94 -> 72), CPU 7.4-8.9 -> 5.8-6.2 ms in an A/B
  on the same (down-clocked) machine: props by finish, people's parts,
  doors, lanterns, plus frozen static scenery. Untried: WebGPU snapshot
  rendering (render bundles; needs a reset whenever meshes, materials or the
  visible set change, which this game does constantly), roofs (already about
  one mesh per material per building), trees (one mesh each, already).
- First spell: Dawn creates Vulkan render pipelines synchronously in the GPU
  process, ~30 ms each, the first time a material/blend/vertex layout is
  drawn; the page's calls return at once, so it shows only as missing frames
  (a Chrome trace: `DeviceBase::APICreateRenderPipeline` on CrGpuMain). The
  first lightning lost 194 ms; `spells.js` `prewarm()` draws each glow kind
  and both particle kinds once in front of the camera (black/clear) after a
  world starts, keeping the particle systems (disposing them let their
  effects go), and `reactions.js` draws the hit flash's overlay once, clear:
  60-80 ms left. Adding or removing a light recompiles every material it
  reaches (2-7 s stalls when toggled scene-wide).
- Frame pacing: at most 2 frames in flight, and Chrome reports a frame done
  ~17 ms late, so uncapped frame rates stop near 100 fps whatever the scene
  costs; the timestamps, not fps, measure it.

## Cameras and views

- Window view (`app/head-window.js`, H, Graphics pane): head-coupled
  perspective from the webcam. MediaPipe's FaceDetector (tasks-vision
  1.2.0, WebAssembly from jsdelivr, CPU delegate; the 230 KB BlazeFace
  short-range model in `assets/models/mediapipe/`, 640x480 video) gives the
  face box's centre averaged with the eyes' midpoint, and the box's width
  for nearness; against a neutral pose (the median of the first 15 frames,
  then a slow drift) a One Euro filter per axis (x, y: 0.5 Hz, beta 3;
  nearness 0.25 Hz) steadies it, and the view eases to it between camera
  frames. Since 2026-11-01 it is a real window, not an orbit: the camera's
  angles and radius are untouched and the head goes into a projection matrix
  frozen each frame (`freezeProjectionMatrix`): the eye moves by the head's
  offset times `strength` (default 2.4, `tablefolkHeadWindow.strength`,
  saved) screen widths per frame width, and the frustum is skewed so the
  screen's rectangle at the target's distance stays fixed (off-axis:
  m[8] = ex/hw, m[9] = ey/hh, the scale by D'/D for leaning, then the eye's
  translation in front). The glass stands at `glass` (0.55, saved) of the
  distance to the target, in front of the board like a diorama box's front,
  so the whole board slides behind the frame; at 1 (the first version) the
  target's plane never moved and leaning in only widened the edges, which
  read as no response at all. Leaning (the face box's width against the
  neutral one, to the power 1.6 x strength / 2.4, 0.5-2.5; filter 0.6 Hz,
  beta 4) moves the eye towards the glass: `lean` 'magnify' (default, the
  Graphics pane's "leaning in") keeps the lens (the off-centre terms scaled
  by D/D') and the board comes closer; 'window' keeps the glass fixed, so
  you see more and the board gets smaller on screen, as through a real
  window (true to life, but the user found it backwards: 2026-11-01). SSAO2 rebuilds positions with a centred lens and painted black
  blocks under the skewed projection: it is detached from the camera while
  the view runs. Picking uses the same matrix. Free and follow cameras; not first person or an orthographic
  camera. The orbit version (alpha/beta offsets, radius for leaning) read
  as the board turning, not a window, and the face detector's eye points
  jittered. `tablefolkHeadWindow.setHead(x, y, near)` simulates a head for
  tests; headless Chrome takes a fake camera with
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- Free camera ('overview', the default with an avatar since 2026-10-30;
  `freeCameraStart`): starts at 19, stays where you put it
  (`TABLEFOLK_FREE_FOLLOW` brings back the glide after the avatar), walls at
  half height. Follow camera: starts high behind the player (alpha π/2, beta
  0.78, radius 16), zooms 2.5-30, and keeps its target eased onto the avatar
  (`followAvatarCamera` moves only the target). Since 2026-11-07 left-drag
  turns it about the avatar (alpha free, beta in the free camera's
  0.22-1.42; `lockCamera(cam,true)` only switches panning off): the angle
  stays while it follows and is restored the next time you come back to it
  (`state.followAlpha/followBeta`, like `followRadius`). The keys walk along
  the view (`cameraCardinal`). cutaway.js's cut is shaped for a view from the
  south, so it is used only within 0.5 rad of that heading; turned further,
  every wall stands at half height (`half()`), and roofs.js's see-through
  roof works from any side (a ray from the eye to the head). A drag under
  4 px is a click (walk, select). C / the camera button
  (`toggleCameraMode`): first person -> free, free -> follow, follow -> free
  (the first C from The Oracle's first person went straight to follow before);
  the button names where it goes. The wheel (`setupMouseWheelZoom`, 2026-11-07): the free
  camera zooms about the point under the pointer, a real pick
  (`pivotUnderPointer`: a head, a wall top, the ground; the ground's plane
  where nothing is hit, never the target's height, which drifted up into
  the air notch by notch and made the zoom slip). First the target moves
  along the line of sight to that point's depth (`retargetToDepth`: same
  eye, same direction, only the radius changes), then eye and target scale
  about the point, so it stays under the pointer to within a pixel, down to
  0.45 from it (`ZOOM_NEAR`; `lowerRadiusLimit` 0.25, since Babylon clamps
  the radius each frame and a clamp there is a slip). First person
  (`fpZoomAt`, 2026-11-08): the field of view narrows (0.15-1.3) and the
  view turns at once (yaw and pitch, a few corrections with the real
  picking ray) so the direction under the pointer stays under it: moving
  the mouse aims the zoom, no drag; zooming out undoes it. The near clip follows
  the radius (`minZ` = radius x 0.08 in 0.04-0.5, in `followAvatarCamera`;
  skipped while senses.js poses the camera, which clears the limits). The
  follow camera only changes the radius; first person narrows the field of
  view (0.15-1.3). Left-drag (`setupPivotOrbit`; the follow camera: above)
  orbits the free camera about the point
  under the pointer where the drag began: the target first moves along the
  view to its depth, then eye and target turn rigidly about it (yaw about
  the vertical, pitch about the horizontal across the view), so the point
  stays put on screen; beta keeps its limits. Babylon's pointer input stays
  attached for pinch zoom, its turning switched off (angular sensibility
  1e12). Right-drag pans and keeps the target's height. The scenario's
  `"view"` (`overview` | `follow` | `first`, `?view=` / `&view=` win) is
  applied after the avatar spawns (`setCameraView`; subworlds keep the view
  you had). In first person a click never walks.
- Tabletop (`app/tabletop.js`): an orthographic FreeCamera with rotation (π/2,
  π, 0), so screen right is -x and screen down is +z;
  `toPx(v,x,z) = [(hw-(x-cx))/(2hw)*cw, (hh+(z-cz))/(2hh)*ch]`. PNGs come from
  `BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync`; the 2D overlay is
  drawn with the view of the frame on screen, after the GPU finished it.
  No post pipeline, shadows, fog or sea in tabletop mode.
- `look()` with sight renders the character's view by posing the main camera
  at its eyes for one frame (render targets from a second camera came out
  black or white), with the fog and cutaway lifted and its own body hidden.
- Start-up: rendering is held for the whole model setup, with GPU
  back-pressure, and the world draws its first 45 frames before the model
  starts; otherwise the picture froze for seconds (GPU frame times of 1-6.5 s,
  invisible to main-thread timing; `tools/browser-test/jank.mjs` measures it).

## Tiles

`app/tile-render.js` renders every object (seen from the south, about the
follow camera's angle), body (idle, facing the camera) and floor (straight
down) at a shared pixels-per-unit on a transparent background, recording
each anchor; `assets/tiles/tiles.json` lists them. The map editor draws
these, and renders missing ones on the spot in a hidden frame.
