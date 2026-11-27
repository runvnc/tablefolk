# Modular building kit: running notes (2026-11-27)

Scale: the game's square is 1 unit; a character is 1.3 units tall (FIGURES h), a storey's wall
is wallH = 1.1 x wallHeight 2 = 2.2 units, a door 1.45 (DOOR_H). Walls run through wall-cell
centres (walls.js); the kit keeps that: a room's interior is its non-wall cells, the wall centre
line is on the wall cells' centres.

## fal prices checked (2026-11-27, pricing API + model pages)
- nano-banana-pro (/edit): $0.15 an image; flux-2-pro $0.03/MP; seedream 4.5 $0.04
- patina/material: $0.01 + $0.02/MP + $0.01/MP per map -> ~$0.07 for a 1K set of 4 maps
- tripo3d h3.1: $0.30 std tex / $0.40 HD tex, +$0.20 detailed geometry, +$0.05 quad
- rodin v2.5: $0.40 (HighPack +$0.80)
- hunyuan3d-v3: Normal $0.375, +$0.15 each for PBR / multi-view / custom face count
- meshy v7.1 image-to-3d: $0.80 untextured, $1.20 textured (!)

## Phase 1: concepts
Model: nano-banana-pro/edit ($0.15, 1K), with work/kit/ref/style_strip.jpg (three of the shipped
env building inputs) as the style reference, so the look matches the approved env set. Prompts
spelled out the kit's vocabulary (grid walls, timber over every join, hero pieces). All four came
out on the first try (shots/concepts.jpg):
1. two-storey half-timber, jettied upper storey on corbels, shingle roof, side chimney, porch awning
2. stone ground floor + half-timber upper, two gables meeting (L), dormer, sign, outside stair
3. stone cottage, thick thatch, quoins, shuttered windows (also shows timber lintels/bands in stone)
4. long half-timber/plank barn-workshop with slate-shingle roof and a lean-to awning on posts
Everything in them is buildable from the kit: the walls are flat panels, all detail sits in
beams and the hero pieces. Note how much of the "interest" is the frame pattern and the jetty.

Hero piece references: door, window (leaded + open shutters), chimney at 1K one by one
(the comparison pieces), and two 2K 2x2 sheets cropped into dormer, porch, sign, corbel,
window_shut, stair, corner_post, finial (work/kit/img/pieces/; shots/pieces_a.jpg, pieces_b.jpg).
All clean, isolated, consistent. Spent after phase 1: $1.35.

## Phase 2: materials (Patina)
`fal-ai/patina/material`, 1024 px, maps basecolor/normal/roughness/height, seed 7, ~$0.073 a set
($0.03 the 1024x256 trim strip); 8 sets, $0.59 in all. Raw in work/kit/mat/<name>/ (50 MB).
- Normal maps are OpenGL (+Y): measured against the height maps (R ~ -dh/dx, G ~ +dh/dy down,
  correlation .5-.8), the same convention as assets/textures/env, so the same Babylon flags.
- 2x2 tiling (shots/mat_tiles_a.jpg, _b.jpg): no seams in colour on any set; fieldstone, quoin,
  shingle, floor, thatch and the timber strip are good. siding's normal map has a strong plank
  edge exactly on the tile border (reads as one more board joint, acceptable). plaster came out
  flat buttery yellow with a repeating ochre stain: rejected, the CC0 plaster_aged (already in the
  game) graded warm is used instead.
- Patina vs the CC0 set: thatch is far better (real straw courses; the CC0 thatch is a blur),
  wood shingle and the cut-stone quoin set have no CC0 equivalent; timber is about equal.
- tools/kit/make_textures.py grades all to one warm palette (mean colour target per set, periodic
  low-frequency flattening) -> work/kit/tex/ (shots/tex_graded.jpg).
Spent after phase 2: $1.94.

## Phase 3: hero pieces, the comparison
Inputs: the door, window and chimney references cut out (flood fill of the grey from the border,
square crop with 15% margin, RGBA). One call each per service ($7.58 for the 12):
- Tripo h3.1: texture detailed (HD), pbr, geometry standard, auto_size: $0.40
- Rodin 2.5: Gen-2.5-High, PBR, 50K Triangle, use_original_alpha, texture_delight: $0.40 (no
  bbox_condition: the others get no size hint either)
- Hunyuan3D v3: Normal + PBR: $0.525 (default 500k faces)
- Meshy 7.1 image-to-3d: texture + PBR, 30k, remesh: $1.20
Every raw went through the shipping proc.py unchanged (weld, 12k triangles, normal map baked from
the raw, de-light .6, fit by height) and was rendered at fixed views (tools/kit/render_pieces.py:
front-left, back-right, close at the upper third, clay). Sheets: shots/cmp_door.jpg,
cmp_window.jpg, cmp_chimney.jpg.

| service | raw tris | raw tex | welded open edges raw / at 12k | close-up sharpness (Laplacian var, door/window/chimney) | back side | colour vs reference | $ |
|---|---|---|---|---|---|---|---|
| Meshy 7.1 | 25-30k | 3 x 2048 | 59-291 / 65-300 | 56 / 218 / 103 | window back a solid board (opaque from inside) | faithful | 1.20 |
| Rodin 2.5 | 50k | 3 x 2048 | 0 / 0 | 103 / 106 / 89 | door back plain, window back modelled | wrong: pine orange door and window, untextured-looking grey chimney, blobby black glass | 0.40 |
| Hunyuan3D v3 | 500k | 3 x 4096 | 0 / 0 | 31 / 140 / 66 | door straps on the back, window glass seen from behind | faithful, a little light | 0.525 |
| Tripo h3.1 | 1.4M | 3 x 4096 | 0 / 0 | 54 / 221 / 108 | door has a second face (both sides a door), window glass from behind | closest to the reference | 0.40 |

Verdict: **Tripo h3.1**. Watertight (0 open edges, one part) where Meshy is not; textures as sharp
as or sharper than Meshy's at 4096 (after the bake to 12k), the closest to the reference image,
sensible back sides (important here: a window is seen from inside the room too; Meshy's window back
was a blank board), and a third of Meshy's price. Hunyuan is a close second (a softer door).
Rodin's geometry is clean but its colours drift. Meshy is the most expensive and the only one with
open edges. The raw Tripo files are big (1.4M triangles, 45-53 MB): the bake does the work.

Then the other pieces with Tripo ($2.10): window_shut, dormer, porch (detailed texture $0.40) and
sign, corbel, stair (standard texture $0.30). The corner post and finial references were not made
(budget): the frame's posts and the gable's king post are procedural instead.
Background removal note: a flood fill from the border leaves the grey inside closed loops (the
sign's scrolls, under the porch's brackets, between stair rails); for wooden pieces every
near-background pixel is cleared instead.
Ledger after phase 3: $11.615 of $12. No more fal calls.

## Phase 3b: normalising the pieces (tools/kit/kit_piece.py)
Each Tripo raw -> proc.py (weld, decimate to a budget, normal map baked from the 1.4M raw, de-light
.4, yaw -90: Tripo's front faces +X) -> kit_piece.py (yaw, fit to a box in game units, anchor,
textures to 1024/512, glb + work/kit/pieces/pieces.json). Budgets: door 6k (frame 5.3k + leaf 2.6k),
window 2.5k, window_shut 3k, chimney 4k, dormer 5k, porch 4k, sign 3k, corbel 1.5k, stair 4k.
- sign, corbel and stair needed their own yaw after the -90 (Tripo turns each its own way): check
  every piece's four views (glb/shots2, shots/pieces_tripo2.jpg).
- The door's leaf: Tripo fuses leaf and frame into one watertight solid. kit_piece finds the
  frame's inner opening (where the front surface is recessed: x +-.30, z .16-1.58), bisects there,
  takes the forward-facing faces in the opening as the leaf and deletes the rest (the frame is an
  open doorway now). A Solidify on the leaf spiked off the iron straps (1.3 m spikes): the leaf's
  back is instead its front mirrored about a plane 3 cm behind the median face. The hinge (-x) is
  the leaf's origin; pieces.json keeps its offset from the door's origin.

## Phase 4: assembly in Blender (tools/kit/build_house.py)
Description = the game's own: a grid of '#', '+', '.', rooms by flood fill, walls through the cell
centres, plus style, storeys, jetty, roof, pitch, bay, braces, chimney, porch, sign, dormers,
upperDoors, stair, seed (tools/kit/houses/*.json). Four houses built:
- half_timber: plaster + timber, 2 storeys, front jetty .32 on corbels, corner braces, shingle 46 deg,
  porch, chimney (concept 1)
- l_house: stone ground floor with quoins, half-timber upper with herringbone braces, L (a main roof
  and a wing roof running into it up to the main ridge), dormer, sign, outside stair to an upper door
  (concept 2)
- cottage: one storey stone, quoins, timber lintels, thatch 52 deg with rolled eaves (concept 3)
- barn: plank siding with posts every square, 2.6 storey, two doors with porches (concept 4)
Renders (tools/kit/render_house.py; the cameras of the old inn renders plus corner, fp, inside,
noroof): work/kit/renders/; sheet: shots/side_by_side.jpg (row 1 the shipped Meshy inn).

Numbers (tools/kit/measure.py; drawn = with every instance):
| house | tris drawn | tris unique | draw calls (instanced / not) | textures | tex mem RGBA | file | geometry |
|---|---|---|---|---|---|---|---|
| half_timber | 49.3k | 22.3k | 14 / 26 | 33 | 152 MB | 5.2 MB | 0.90 MB |
| l_house | 88.6k | 34.1k | 17 / 37 | 42 | 212 MB | 7.4 MB | 1.45 MB |
| cottage | 22.2k | 16.2k | 13 / 15 | 30 | 148 MB | 5.6 MB | 0.63 MB |
| barn | 53.6k | 20.7k | 13 / 23 | 30 | 148 MB | 5.3 MB | 0.81 MB |
| Meshy inn (shipped) | 40.0k | 40.0k | 1 | 3 x 2048 | 64 MB | 2.9 MB (AVIF+meshopt) | 2.1 MB |
The structure itself is tiny: 1.2-4.7k triangles a house (walls, frame, floors, roofs). Hero pieces
are 85-95% of the triangles (windows: 10-20 per house x 2.5k). The kit's textures are shared by
every house of a village (8 sets x 3 maps at 1024 + 9 pieces x 3 maps), so per house the marginal
cost is the geometry (0.6-1.5 MB uncompressed, before meshopt); the Meshy model pays 64 MB of
texture per building type.

What the side-by-side shows: from far the Meshy inn is busier (porch, steps, clutter, warm tiles);
the kit houses read clean and coherent. At door distance and up close the kit wins clearly: crisp
tiling materials at their real size, straight beams, the hero door/window/sign at 1024 on a small
piece. Inside: the kit's rooms are real rooms (plaster, beams, joists, floor boards, the same door
and windows from the inside); the Meshy shell's inside is its own back faces.

## Phase 5: Babylon (tools/kit/viewer.html, tools/kit/shots.mjs)
WebGPU, the GLBs as exported, headless test Chrome on :8001 (stopped). Sheet: shots/babylon_sheet.jpg
(far, door, inside, roof off, roof + upper storey off, roof at .22).
- Looks as in Blender (dimmer light). Instances: the glTF loader made InstancedMesh for the shared
  piece meshes (12-20 per house).
- Draw groups (unique mesh x material, the house plus ground and a figure): 15-19; the engine's
  counter 29-37 with the shadow pass. Frame 1.6-3.3 ms on the RTX 2060 at 960x720.
- Cutaway with no shell swap: roof meshes (`*_roof_*`, chimney and dormer included) fade with
  visibility; the storey above is clipped by a plane at storeyH - .2 (per mesh in
  onBeforeRender), which also removes the floor above so the room below opens. The loader pins
  transparencyMode OPAQUE on glTF materials: visibility < 1 only darkens until it is set to null.

## Where the design broke or surprised
1. Hero pieces carry the triangle count (windows above all). Needs a piece LOD (a ~300-triangle
   window beyond ~15 m) or windows baked into a merged far version.
2. Image-to-3D gives no reliable frame: Tripo turned pieces 90 deg each its own way, and a window
   with open shutters has its frame at an unknown fraction of its width. Every piece needed fit,
   anchor and yaw by hand once (kit_piece opts). Worth asking for frame and leaf as separate images.
3. The door leaf cannot come out of one door model cleanly (fused solid); the bisect + mirrored back
   works but a separately generated leaf would be better.
4. A chimney through the roof floats in the upper room (no attic floor): it wants a stack down to
   a hearth piece inside, or a gable-wall chimney from the ground (stretching the piece 2.5x is ugly).
5. Thatch from flat slabs reads as a board even with the Patina texture and a rolled eave: it wants
   real geometry (a rounded, uneven body), perhaps a generated thatch-edge piece.
6. Texture memory per GLB looks large (150-210 MB RGBA-equivalent) because every GLB embeds the
   kit; in the game the kit is loaded once: ~24 maps (kit) + ~27 (pieces) at 1024, about 280 MB
   uncompressed for any number of houses, against 64 MB per Meshy building type. Small pieces
   should go to 512, and a GPU format (KTX2/Basis) would cut it 4-6x.
7. Draw calls per house 13-17 (Meshy 1). Fine for one house; a village must merge by material
   across houses (or chunks) and thin-instance pieces village-wide: then ~10 materials + 9 piece
   types whatever the house count.
8. The barn's shingle roof looks glossy in Babylon (the roughness map through glTF's packed
   metallicRoughness): check the roughness channel before wiring.
9. Fieldstone at 2.2 m a repeat made boulders next to a 1.7 m figure: 1.5 m is right.

## Round 2 (2026-11-27, after the coordinator's review: plainer than the concepts, roofs weakest)
No fal spending (ledger still $11.615). Sheet: shots/side_by_side_2.jpg (columns: concept, far,
far with the LOD file, door, corner, first person, inside; row 1 the old Meshy inn); Babylon:
shots/babylon_sheet_2.jpg.
1. Roofs with body (build_house.py `courses`, `thatch_body`, `roof`): shingle and clay tile laid in
   courses (rows 20/24 cm, each tipped 3-6 deg steeper than the roof and overlapping the one below,
   split into seeded lengths with their own lift and shade, its texture row aligned per course) on
   a board underlay (boards seen inside); a fascia board along each eave, bargeboards 30 cm on the
   verges; ridge: two boards in an inverted V (shingle), round ridge tiles (tile), a thick roll with
   crossed spars (thatch); the ridge sags 1.5-6 cm mid-span per building seed (zero at the gables,
   so they still meet). Clay tile (CC0 clay_roof_tiles graded warm) is the new `"roof": "tile"`
   (l_house). Thatch: a grid body 46 cm thick, rounding down at the eave and both verges, lumpy
   (noise), flat underside; roll and spars on the ridge. Roof triangles: 3.0-5.7k per house.
2. Fieldstone at 1.5 m a repeat (from 2.2): stones 25-40 cm against the 1.7 m figure (door and
   corner views); quoins 32/20 cm alternating, unchanged.
3. Chimney: a full stack. Timber houses: a fireplace (jambs, sooty back, hearth stone, timber
   mantel) and breast inside the gable wall on the ground floor, the stack up through the upper
   floor and the roof; stone houses: the breast outside the gable wall with quoins and a weathering
   course, the stack up past the ridge, a fireplace inside on the same wall. The Tripo chimney piece
   is only the top (scale 1, its foot inside the stack). No window where the breast stands
   (`CHIM` in openings()). No floating stack indoors.
4. LODs: tools/kit/lod_piece.py (collapse, textures 256): window 2500 -> 250, window_shut 3000 -> 150,
   door 5284 -> 300, leaf 2636 -> 120, chimney 4000 -> 300, dormer 5000 -> 400, porch 4000 -> 1000,
   sign 3000 -> 200, corbel 1500 -> 80, stair 4000 -> 1400 (porch and stair at 300/400 shredded).
   `build_house.py --far` uses them, a plain textured slab roof instead of courses, coarse thatch:
   | house | near tris | far tris | near geometry | far geometry |
   |---|---|---|---|---|
   | half_timber | 45.1k | 6.2k | 1.29 MB | 0.36 MB |
   | l_house | 88.8k | 13.5k | 1.98 MB | 0.68 MB |
   | cottage | 23.1k | 3.6k | 0.96 MB | 0.28 MB |
   | barn | 51.7k | 5.9k | 1.17 MB | 0.28 MB |
   At the far camera (34 m, house ~250 px of 560) near vs far differ by 7-16/255 mean over the
   house, mostly the roof's shading (courses vs slab); pieces are indistinguishable. Switch: about
   20 game units (26 m) camera distance at 1080p; the roof courses could switch later (~35 units).
   Draw calls stay 14-17 (the far file has the same materials).
5. Glossy roof: Patina's roughness maps averaged .3; make_textures.py now raises them to .78 mean
   (keeping the variation): the barn's roof is matte in Babylon. The L-house's white floor was the
   old `inside` camera standing outside the L (in the notch) and seeing lit ground; the camera now
   stands at the house's centre line, and the floor shows boards.
6. Life (seeded, `life` in the json overrides): a porch on the main door (50%), a plank bench by the
   door (60%), window boxes with leaves and flowers under some windows of plaster houses, a lean-to
   on posts against the gable away from the chimney (barn: a workbench under it; cottage: a log
   pile), the jetty's corbels as before.
Still plainer than the concepts in two ways: the concepts' roofs are steeper and darker with more
contrast between courses, and their walls have more varied infill colour (ochre panels in concept
2). Next would be per-panel tint jitter and darker roof grading, both cheap.
