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
