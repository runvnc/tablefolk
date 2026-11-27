# Assets: where they are listed, how they are made

## Inventories (the files that list things)

| what | listed in |
|---|---|
| object types (models, sizes, physics, aliases, tags) | `assets/pack.json`, the core asset pack (loaded as `pack.json?v=`) |
| code-built props and scenery | `makeObject` in `app/app.js`; `app/scenery.js` |
| bodies (file, height, clips, gender) | `FIGURES`, `FIG_CLIPS`, `FEMALE_MODELS` in `app/app.js`; the generator's `MODELS` and `MINDLESS` in `server/generate.js` |
| monster hit points and natural weapons | `MONSTER_HP` in `app/scenario.js`; `NATURAL` in `app/combat.js` |
| pick-ups, body loot | `PICKUPS`, `BODY_LOOT` in `app/play.js` |
| walk-in buildings, generated furnishing, glyphs | `WALK_IN`, `ROOM_FURNISH`, `BUILDING_FURNISH`, `GEN_LEGEND` in `app/procgen.js`; `GRID_GLYPHS` in `app/scenario.js` |
| 2D tiles | `assets/tiles/tiles.json` (+ `objects/`, `characters/`, `floors/`) |
| floor and other textures | `assets/textures/`, `assets/models/tiles/`; `tile_top_{color,orm,n}.png` are the sculpted board tile baked from above (`node tools/bake-tile-top.mjs`, test Chrome and :8000 running; rerun when `grass_v7_orm.glb` changes) |
| sounds | `assets/sounds/kenney-rpg/`, `assets/sounds/kenney-impact/`; `SAMPLES` in `app/sfx.js` |
| voices | `app/tts/` (built-in Pocket-TTS voices); descriptions in `.admin/settings.json` via the admin page |
| skills, roles, packages | `skills/*/skill.json`, `roles/*/role.json`, `packages/*/tablefolk.json`; `registry/index.json` |
| scenarios | `scenarios/*.json`; `scenarios/showcase.json` for the welcome screen; `EXAMPLES` in `app/scenario.js` |
| browser models | `SUPPORTED_MODELS` in `app/llm_js/agent-brain.js`; `MODEL_MIRRORS` in `libs/brain/engines/litert-worker.js` |
| licences | `LICENSE.txt` / `License*.txt` beside each set: `assets/models/props/`, `props/village/`, `characters/quaternius/`, `characters/kaykit/`, `animations/kaykit/`, `sounds/*/`; `characters/meshy/README.md` |

Model folders: `assets/models/characters/kaykit/` (chibi people and the 8
KayKit animation packs in `animations/kaykit/`), `quaternius/` (people,
monsters, Universal-rig figures), `meshy/` (generated monsters),
`generated/` (the clay critter; the folder name is old, it is tracked);
`assets/models/props/` (KayKit and Quaternius props as glTF with shared AVIF
textures) and `props/village/`.

## Adding an object type

1. Get a CC0 (or CC-BY) model; compress it: `tools/compress-glb.sh in.glb
   out.glb` (AVIF textures, meshopt, 1024 px cap; 60-90% smaller).
2. Add an item to `assets/pack.json` (fields in the scenario skill's
   `things.md`; `fit` for models of unknown scale).
3. Render its tile: `node tools/browser-test/render-tiles.mjs
   http://localhost:8001 <type>[,<type>...]`.
4. Optionally: a grid glyph (`GRID_GLYPHS`), generated furnishing
   (`procgen.js`), a pick-up (`PICKUPS`), the Spawn menu in
   `app/index.html`.
5. Document it in the scenario skill's `things.md` (and `fast-skill.md` if the
   generator should use it); bump `pack.json?v=`.

## Adding a body

Add it to `FIGURES` (file, height `h`, clip names, `v` version), to
`FEMALE_MODELS` if it is a woman (voice casting), to `MODELS` (and `MINDLESS`
if it never talks) in `server/generate.js`, `MONSTER_HP` for a monster, the
builder's body lists (`app/builder.js`, `app/map-editor.js`), render its tile,
and list it in the scenario skill's `format.md`. Check facing by rendering an
idle model turned toward the camera.

A body that is not part of the game needs none of that: a pack's or
package's `"bodies"` (`app/bodies.js`, the scenario skill's `api.md`) gives
a GLB, its height and a clip map, and becomes a `FIGURES` entry with a `url`
while its scenario plays (`createFigure` loads it from there and
`bodies.js mapClips` names its clips). `packages/nightwatch` has one (the
dire wolf: the wolf GLB with its own height, clips and a howl emote).

## Pipelines

- **`wizard.glb` has a corrected face**: as supplied it had empty eye sockets and a nearly flat nose. `tools/fix-wizard-face.mjs` (gltf-transform, run on the original from commit b8eb3b1; usage in its header) moves the nose's wedge corners forward and adds eyes to the `Face` mesh with the one material (whites and pupils take their colour from a light and a black spot on the atlas), then re-quantizes and meshopt-compresses as the other files are. Blender can read the result only after decoding (no meshopt or AVIF), so the script stays in gltf-transform: a Blender round trip would risk the rig and clips.
- **`wizard.glb` is the Oracle** (`tools/wizard-extras.mjs`, run on the face-corrected file from commit 4214518; usage in its header): an oracle's hat on the head bone (its lower rings fitted to the head: `fitAt` measures the Face's vertices and the body's near the head, the ears, brought into the Face's space through their main joint's world matrix times its inverse bind matrix, and widens each ring per direction to clear them by 15%); the staff held upright (Idle takes Walk's right-arm pose, held still, the staff turns `STAFF_FIX` in the hand, measured in the game so it stands vertical in Idle, the hand slides down it and the shaft grows so the orb is above the hat's brim and the foot on the floor); a glowing orb on the knob; and a mouth: a `Mouth` mesh on the head (lips, upper teeth, a dark cavity) under the moustache, with a `mouth_open` morph target (the lower lip drops, the cavity stretches), plus a `mouth_open` target on the `Face` mesh that drops the beard with it. The game drives every `mouth_open` target from the voice ([rendering.md](rendering.md), Characters). Bump the wizard's `v` in `FIGURES` when the file changes, then re-render its tile (`CDP_PORT` points `render-tiles.mjs` at another test Chrome).
- **Quaternius Universal-rig figures** (woodsman, huntress, peasant,
  peasant_woman): `tools/build-figures.sh <kits dir> <gltf-transform dir>`
  with `tools/build-figure.mjs` (gltf-transform 4.5.1 retargeting:
  rotation `q_out = rO * inv(rA) * q`, pelvis translation scaled, the
  head-only triangles cut by joint weights, skins re-pointed by joint name).
  The animation library comes from `AL_Standard.fbx` through FBX2glTF
  (github.com/godotengine/FBX2glTF). Node ESM ignores `NODE_PATH`, so the
  scripts copy themselves next to the gltf-transform `node_modules`.
- **Meshy monsters** (orc, goblin, skeleton, skeleton_warrior, troll,
  skeleton_farmer): `tools/fal-monster.py <name> "<prompt>"` (fal.ai: Meshy v6
  text-to-3D in A-pose, then `fal-ai/meshy/rigging/multi-animation` with
  clips Idle 0, Walk 30, Attack 4, HitReact 178, Death 8; about $1.6 each,
  key `FAL_API_KEY` in `.env`), then `tools/finish-monster.sh <name>`
  (`tools/merge-clips.mjs` merges the clips, renamed to the game's names, then
  compresses) into `assets/models/characters/meshy/` (not `generated/`
  under the repo root, which is ignored). Meshy refuses gore words (a
  content-policy 422) and would not make a fleshy zombie. Paid: ask before
  running.
- **People** (swordswoman, sorceress, huntress, villager_woman, swordsman,
  wanderer, king): `tools/fal-character.py image|model|rig <name>`: a FLUX concept
  image (look at it first: cheap), Meshy v6 image-to-3D with PBR in A-pose,
  Meshy rigging with the same five clips, then `tools/finish-monster.sh <name>
  work/people`. About $2 each. Prompts that worked: JRPG costume words
  (split skirt, fitted bodice, thigh boots), "PG-13", a modest neckline.
  The older body names are aliases of the new files in `FIGURES`.
  Finish with `CALM=0.3 tools/finish-monster.sh <name> work/people` (the
  idle keeps 30% of its motion; `merge-clips.mjs`). The rigger deforms arms
  that touch the body or a long skirt: ask for "arms held out at 30 degrees
  from the body so the hands do not touch the skirt, legs apart" and a
  knee-length skirt with leggings (villager_woman, 2026-10-30). Long robes
  and cloaks stretch when walking: ask for a short cape, "no long robe".
- **KayKit clips on the Meshy rigs** (2026-11-01): `tools/retarget-people.sh
  ~/.cache/tablefolk-gltf` runs `tools/retarget-kaykit.mjs` on every model in
  `meshy/` (in place; rerunning replaces the clips it added) and recompresses
  (`resample`, then `meshopt --level high`: 42 clips add 80-260 KB a model).
  Each mapped bone takes the KayKit bone's world rotation change, applied
  after aiming the Meshy bone the way the KayKit one points at rest; the arms
  are calibrated so KayKit's `Idle_A` maps onto the Meshy A-pose (from rest
  the chibi's arms came out spread). Hips move by the leg joints' midpoint,
  scaled by leg length. Grounding (`lift`): standing clips put the lowest foot
  on the floor; the chair clips seat the feet on the floor (the chibi's chair
  is level with an adult's hips); lying puts the pelvis 0.13 m up; the way
  down and back up keeps a foot on the floor. `Sit_Chair_*`, `Sit_Floor_*` and
  `Lie_*` are anchored: seated or lying, the hips are over the origin (KayKit
  sits back onto a chair behind it), so the game stands a character on the
  seat or bed. Clip list: `CLIPS` in the script. `DEBUG=1` prints seat and
  foot heights. Previews without the game: import a copy without textures
  (Blender reads neither meshopt nor AVIF) into headless Blender and render
  each clip with the workbench engine (the maintainer has Blender 5.2). The
  goblin and troll fold up when seated (hunched rest spines); the people
  and the king look right.
- **Voices, acted** (2026-10-26): `tools/elevenlabs-voices.py` (needs `ELEVENLABS_API_KEY`; the maintainer's is in `~/.config/fish/config.fish`) designs a voice with ElevenLabs Voice Design from `tools/voices-eleven.json`, lets Gemini 4 Argon pick the preview nearest the wanted gender and age, saves it in the account (one voice slot each) and records a three-emotion script with `eleven_v4` audio tags into `assets/voices/<id>.mp3` (about 11-15 s). Done for all 22 voices (and `tools/elevenlabs-moods.py` for the mood samples; `--only=seductive` adds one mood). fal's own `eleven-v4` endpoint takes premade voices only (22 names and the default library IDs), no design. After changing samples: `node tools/build-voice-states.mjs`, upload only the changed `work/voice-states/v6/*.bin` files to `pocket-tts/states-v6/` (the client asks for them with `?v=<the voice's v>`, so a re-recorded voice gets past the CDN and browser caches), bump `v6` in `stateKey` (and the folder name) only if the format changes.
- **Voices** (first set): `tools/fal-voices.py` (Qwen3-TTS Voice Design on fal.ai, a few
  cents a clip) writes `assets/voices/<id>.mp3` and `voices.json` from
  `tools/voices.json`.
- Non-humanoids (dragon, spider): SkinTokens (VAST-AI-Research, MIT) rigs
  anything but has no animations; AssetFurnace (Bingeljell/image-to-3dlab)
  wraps it with 21 humanoid moves. Not used yet.
- itch.io downloads go through Chrome (`tools/browser-test/itchdl.mjs`).
- **Tiles**: `tools/browser-test/render-tiles.mjs` ([testing.md](testing.md)).
- **Registry**: `node tools/registry.mjs` rebuilds the built-in entries;
  `--check` validates community ones.

### Sounds and voices (2026-11-14)

`assets/sounds/voices/` holds the recorded cries and calls: banks listed in
`banks.json` (hurt_m, hurt_f, die_m; mon_hurt, mon_die, mon_attack,
big_roar, big_die, undead_hurt, undead_die, small_hurt, bug, flesh; cow,
bull, pig, horse, donkey, alpaca, sheep, deer, howl, bark, fox, frog, hiss,
buzz), all CC0 (sources clip by clip in its LICENSE.txt). They were picked
with `tools/sound-judge.py`: Gemini 4 Argon on OpenRouter listens to a batch
of candidates (each cut to 6 s) and answers, per clip, what it hears, quality
and fit out of 10, the role it suits and the start and end of the best
instance; the chosen windows were cut with ffmpeg (silence trimmed, faded,
peak-normalised to -1 dB, Ogg Vorbis q3), then the finished cuts judged
again (four too-short grunts were recut). Freesound previews are reachable
without a key (`cdn.freesound.org/previews/<id/1000>/<id>_<user>-hq.mp3`; the
search page filtered to `license:"Creative Commons 0"` lists them).
`sfx.js` loads the banks after the first gesture; `reactions.js bankFor`
maps a body to a bank and a playback rate.

### A detailed mesh for a rigged animal (2026-11-14)

The Quaternius animals were ~2,000 triangles. Now detailed: wolf, cow, deer
(Meshy v6), horse, dog, bull, white horse, donkey, pig, stag, husky
(Hunyuan3D 3.1 Pro). Still low-poly: fox (crumples walking whatever the
weights), sheep (its farm-pack rig fits sideways: bind and rest pose differ
in Blender), alpaca. Steps:

1. `tools/fal-animal.py image <name> "<description>"`: a FLUX side-profile
   concept (~$0.08). Side views fit best (a three-quarter husky smeared).
2. A 3D model of it on fal: `tools/fal-3d.py hunyuan31 work/animals/<name>`
   (Hunyuan3D 3.1 Pro with PBR, $0.525, ~3 min; the best of the four tried),
   `tools/fal-3d.py trellis2 ...` (TRELLIS.2 at 1024, $0.30, 21 s, a step
   down) or `tools/fal-animal.py model <name>` (Meshy v6, $0.80, ~6.5 min).
3. `blender -b -P tools/blender/reskin-animal.py -- old.glb new.glb out.glb
   --bones`: decimates past 60k faces, turns the new mesh to the old body's
   length and head, scales it per axis onto the old box, weights every vertex
   by distance to the nearest three bones (`--bones`; copying the old
   surface's weights, the default, smeared tails and hind legs of the horse
   and dog where their shape differs; `--auto`, Blender's bone heat, failed
   on these meshes). Then `tools/compress-glb.sh out.glb
   assets/models/characters/animals/<name>.glb`, bump the body's `v` in
   FIGURES, render its tile, look at it walking (`tools/browser-test/
   scenarios/animals.json` stands every animal in a row).

The old rigs must be uncompressed (Blender here has no meshopt decoder): the
re-exported ones of 2026-11-13 and the Poly Pizza originals were used.

A mouth for a creature that talks (2026-11-15, plane cut 2026-11-19):
`blender -b -P tools/blender/add-jaw.py -- fitted.glb out.glb [--angle .5]
[--line .42] [--hinge .35] [--bone Head]` adds a `mouth_open` shape key
(app.js drives any `mouth_open` morph from the voice, updateMouth): the head
is the vertices the Head bone moves most (and the rig's ear bones), the snout
runs along the neck-to-head direction to its farthest vertex. The mouth is a
plane, level sideways, sloped like the jaw's underside and `--line` of the
snout's height at its front third; the snout's faces ahead of the hinge are
cut along it (`bmesh.ops.bisect_plane`) and parted along the new edge back to
the same corners on both sides, so the lips are a straight, symmetric line
whatever the triangles (cutting along existing edges, as first done, left a
jagged lip with a spike of big triangles on one side and see-through holes).
The lips keep the unparted skin's normals (custom normals: no crease when
closed). Dark double-sided faces line the mouth (palate and floor fill the
lip line, and a strip runs from each lip in to a line set toward the middle,
which opens half as far), on the body mesh with its weights, so they follow
the skin and stay inside; the lower jaw turns down about a sideways axis at
the hinge.

Used for `red_dragon`: a prowling concept, Hunyuan3D, on the wolf rig with
`--bones --keep-width --tail` (reskin: `--keep-width` keeps the new body's
own width for its length; the rig's IK and pole control bones never take
weights; `--tail` moves the rig's tail chain onto the new body's tail and
weights the tail along it, below). Rebuilt 2026-11-19: `h` 3.65 (was 5) keeps
its length in squares, now that its height is its own.

**The old body's box counts only its skinned meshes** (2026-11-19). Blender's
glTF import adds an `Icosphere` (radius 1, at the origin: the bones' display
shape); reskin counted it in the old body's bounding box, so every body fitted
before then sits too low against its rig (the box reached a unit below the
feet) and, if narrower than the sphere, too wide. For the red dragon this put
the tail far under the wolf's tail bones (its weights went to the hind legs:
it kinked and tore walking) and turned the head guess round (hence the old
`--flip`). The other reskinned animals were not rebuilt.

`--tail` (with `--bones`, 2026-11-19): the tail is the part of the mesh
nearer along the surface to its far end than the plane of the chain's first
bone (Dijkstra over the edges, seam-split vertices joined); its length is
measured along the surface from the ring where it meets the body, so a curled
tip still counts as the end. The chain's bones (names containing `tail`) move
onto its centre line at the old chain's proportions (edit mode; only their
heads move, so the clips' rotations keep their meaning), each tail vertex
takes the two chain bones either side of it (the first shares with its
parent), and no other vertex takes any chain bone.

Big bodies block every square under them (app.js bigBodyAt, g.footHalf: half
length and width of the model and its centre offset, set at spawn for
figures longer or wider than ~1.6 squares, turned with the body). Checked by
playerStep, fpWalk, findRoute (not the body the route starts from) and
occupantAt.

Self-hosting (2026-11-14, vast.ai RTX 4090 at $0.375/h): Pixal3D (Tencent
ARC, MIT, on TRELLIS.2) needs ~18 min of building (TRELLIS.2's setup.sh
extensions, natten), its requirements fail to resolve (MoGe's trimesh pin;
installed by hand), its background remover RMBG-2.0 is gated and
non-commercial (patched out; cut-outs made with rembg's ISNet), and its
full 1536 mode runs out of memory on 24 GB (low-VRAM mode, 1024). Then
95-170 s a model, of which diffusion is ~15 s and mesh finalising (remesh,
UV, bake; mostly CPU) ~100 s, so a 5090 would gain little. Its animals came
out speckled and walked worse than Hunyuan3D's: not used. fal is the way.

### Environment models from the concept scenes (2026-11-20)

`assets/models/props/env/` (manifest.json lists each model's footprint,
height, front, triangles and the pack.json type it replaces; LICENSE.txt):
buildings and props in the style of the approved concept scenes (weathered,
muted, painterly semi-realistic, matte). The pipeline: generation scripts
in `work/env/scripts/` (git-ignored, with the raw files and the ledger
`work/env/ledger.jsonl`); processing in **`tools/env-assets/`** (in git):
`finish.sh <name>...` rebuilds a model from `work/env/raw/<name>.glb` with
its options from **`options.json`** (every model's `tris`, `w`/`d` or
`fit: height`/`h`, `yaw`, `cream`, `core`, `stretch_y`...: add a model's
options there, never only on a command line), `proc.py`, `dec.py` (plain
decimation for other generated models), `analyze.py`, `check.py` (the gate),
`decomp.mjs`, `render2.py`.

1. **Scene crop -> FLUX Kontext isolate** (`fal-ai/flux-pro/kontext`, $0.04):
   edit a crop of a concept scene: "show only this one object, complete,
   isolated on plain light grey, three-quarter view from slightly above, flat
   overcast lighting, keep the exact style, materials and weathering; no cast
   shadow, no ground, no grass at the base". For something the scene lacks,
   pass a crop as the style reference and describe the other object; give the
   footprint's proportions. Text-to-image inputs came out generic or
   cartoonish. Look at every input; Kontext also removes a fault well when
   asked to edit its own output ("remove the paving under the building").
2. **Back view** (buildings only): nano-banana-pro edit (`fal-ai/nano-banana-pro/edit`,
   $0.15) of the front image, "seen from the diagonally opposite corner". It
   sometimes returns the front again, mirrored: say what must NOT be visible
   (the porch, the sign).
3. **Meshy 7.1** (`meshy/v7.1/multi-image-to-3d` with front + back for
   buildings, `meshy/v7.1/image-to-3d` for props; $0.80, 5-15 min; PBR, 2048 px
   base colour, metal-roughness and normal maps, ~80k triangles). The front
   image's view comes out facing glTF +Z (the game's front at ry 0) for most
   models; check the four-view sheet and turn it (`yaw`). Hunyuan3D drifted
   cartoonish/blue; trees fail in image-to-3D.
4. **Process** (`proc.py`, headless Blender): join, **weld by position**
   (`remove_doubles`, 1e-5 m), drop tiny loose parts and flat ones at the
   base (ground discs), turn, scale to the footprint in metres (door about
   2 m), origin at the centre of the footprint on the ground, decimate
   (buildings 30k triangles, props 6-15k), normals, and warm near-white
   plaster toward the scenes' cream (`cream`).
   **Weld before anything.** A generated GLB (Meshy, Hunyuan, Trellis) stores
   every vertex split along UV seams and hard edges: the raw inn is one welded
   surface with 391 open edges but imports as 29,580 fragments. Without the
   weld the loose-part filter deletes real fragments as "tiny" or "flat at the
   base", and the Decimate modifier collapses each fragment on its own and
   tears every seam open. The first run (2026-11-20) shipped that way: fine
   from afar, holes and cracks up close (the inn: 46k open edges in 1,600
   pieces). Never filter loose parts, or decimate, unwelded geometry; with the
   weld a ground disc fused to the model is no longer a loose part (use `cut`).
5. **Tiers**: `tools/compress-glb.sh --max 2048 in out/<name>.glb` and the
   default (1024) for `<name>.1k.glb`; AVIF + meshopt (measured 2026-11-21:
   meshopt's quantisation opens no seams; the decompressed final has the same
   open edges as Blender's output).
6. **Check** from the final file: `decomp.mjs` (copied to
   `~/.cache/tablefolk-gltf/env-decomp.mjs`, where the gltf-transform modules
   are; like `tools/decompress-glb.mjs`, and re-encodes AVIF as PNG so Blender
   can texture it), then `render2.py`: four views and a shot with the
   swordswoman (`work/env/renders/<name>_sheet.jpg`).
7. **Gate**: `python3 tools/env-assets/check.py [name...]` (or `--pair raw.glb
   final.glb` for any model) welds raw and decompressed final and counts open
   edges and connected parts; it fails a model whose open edges exceed 2 x
   raw + 500 or whose parts jump past raw + max(5, raw). Run it before
   committing any processed model.

Rebuild of 2026-11-22: every env model passes (welded open edges within 15%
of the raw's, one part; the decompressed finals match Blender's output edge
for edge). Sizes kept within 1-2%, except: `fantasy_house` keeps its front
steps (`w` 5.44 binds, so the walls keep the first run's scale; footprint
5.44 x 5.18); `bed` is 33k triangles, not 10k (welded, its cloth folds are
non-manifold and the collapse stops there; splitting those edges let it
through but wrecked the frame); `hay` 1.64 m high (decimation pushed strands
16 cm below the ground: proc.py now clamps at 0). The other generated
models torn the same way are the Hunyuan3D animals reskinned with
`reskin-animal.py` (it decimated past 60k faces unwelded; welds now). All
nine are rebuilt: the bear from its raw (50k open edges to 4), and on
2026-11-22 bull, dog, donkey, horse, husky, pig, stag and white_horse (26-47k
open edges each, 200-3,800 pieces) from raws fetched again from fal: their
`hunyuan31.glb` files had been deleted, but a finished queue request's result
stays fetchable (GET `<request url>` from the `hunyuan31.log`, header
`Authorization: Key $FAL_API_KEY`, gives `model_glb.url`; free, no new run).
Rebuilt with `reskin-animal.py old.glb hunyuan31.glb out.glb --bones`, they
pass `check.py --pair` (0-2 open edges, one piece) and keep every bone, rest
pose and clip of the shipped files exactly. Their boxes now match the rig's
body: the first runs had counted the importer's bone-display Icosphere (fixed
2026-11-19), which stretched each mesh a metre below the feet and, for the
narrow ones, to 1.9 m wide; at the same `h` they are now truer to their
skeletons, a little longer and narrower than before.
Checked 2026-11-22 (bind-pose skinned boxes, joint world x inverse bind x
position, old file vs new; lineup `work/closeup/shots/animals_lineup.png`):
the old meshes were squashed, not the new ones stretched: their height
carried about a metre (in the rig's units) of the Icosphere below the feet
(horse 5.81 vs 4.82, dog 4.10 vs 3.10) and the narrow ones a 1.90 width, so
scaled to the same `h` they came out short-bodied and leggy (horse length /
height .98, dog .96; now 1.18 and 1.28, as the animals are). Kept: the
heights (`h` unchanged), so they are 18-33% longer (horse 1.56 -> 1.88 m,
stag 1.44 -> 1.79, bull 1.97 -> 2.37, dog .58 -> .77, pig 1.14 -> 1.39).
Blocking: a body whose half length passes .8 blocks every square under it
(`footHalf`); horse, white_horse and stag (.94, .94, .90) now would, so their
FIGURES entries carry `big: false` and stay one-square bodies as before; the
bull blocked before (.98) and still does (1.19).
Meshy characters, Quaternius, KayKit, village/farm/nature packs and the
`gen/` props are not torn (the packs' many parts are authored pieces).

Second pass, 2026-11-22 (close up: soft textures, faceted beams, baked
lighting, the bed). Measured first: the shipped textures are the raws' own
2048 maps (no more detail exists), AVIF q75 keeps ~91% of the base colour's
fine detail (Laplacian energy; q85 95% for +0.5 MB a model: not worth it),
and the buildings get 85-140 texels a metre (props 275-1650), so up close
they are soft at 2048 and mush at the 1k files that medium and light load.
Changes, in proc.py (every model, all pass check.py):
- **Normal bake** (`bake`, default on): the welded, cleaned, scaled model
  before decimation is kept as a high-poly copy (its winding made consistent
  first: Meshy's raws are inconsistent in patches, which baked as normals
  pointing into the surface) and Cycles bakes its shading (surface plus its
  normal map) into a new tangent-space normal map for the decimated mesh
  (cage .004 x size, ray .01 x size; ~5 s on the CPU); TANGENT exported so
  Babylon shades with the same MikkTSpace frame. Removes the diagonal
  shading wedges on posts and walls (`work/closeup/shots/cur/bs_crops3.jpg`).
- **40k triangles for buildings** (was 30k): a flat wall bent by the
  collapse showed as a wedge even with baked normals.
- **De-light** (`delight`, default .6; `delight.py`): per colour cluster
  (k-means, 6) the low-frequency luminance is evened toward the cluster's
  median (normalized convolution within the cluster, so timber never darkens
  the plaster beside it in the atlas), gain clamped .6-1.6. Baked highlights
  and dark blotches on plaster and stone are toned down; at night the
  baked-in light no longer shows (`bs_delight.jpg`).
- **The bed** (`presimplify`, `rebake`): its cloth has 2,761 three-face
  edges, where Blender's collapse stops (33k) and which it had turned into a
  trough without legs or pillow; seam-keeping meshoptimizer stops at 58k
  (49k UV islands), `split_nm` tore the frame. Now finish.sh simplifies the
  raw with meshoptimizer 1.x in permissive mode (`simplify.mjs`, in
  `~/.cache/tablefolk-meshopt`) to ~9k, and proc.py gives it new UVs (Smart
  UV Project) and bakes base colour, roughness and normal from the raw
  (`hp_src`): 8,882 triangles, 3.6 -> 1.8 MB, legs and pillow back
  (`bed_rb_cmp.jpg`).
- Faces doubled by the weld are deleted (`dedup`; none found in these raws).
Sizes: 64 -> 71 MB for all 50 files (tangents, the bigger buildings); the
same three textures a model, so texture memory is unchanged.
The blacksmith's roof "slivers": the thin ragged tile ends along its eaves
are in the raw itself (raw and decimated look alike from below,
`bs_eaves.jpg`); the pipeline neither adds nor removes them.
Medium quality now loads the buildings' 2048 files (rendering.md, Light
quality): their 1k copies were the main softness.
In the game (roofs.js): the building models' material plugin also lays a
fine tiling grain over them up close (see rendering.md, Roofs); env model
URLs carry `ENV_MODELS_V` (app.js `loadModelInstance`): bump it when the
files are rebuilt.

Faults to watch for: soft cast shadows and ground or grass discs under the
object (ask for none, reject inputs that keep them), hollow things filled in
(a well's shaft), plaster whiter than the scenes, spiky roof-ridge noise,
interiors left empty (the forge front came out as an empty shed), pictures
read as the wrong count of parts (windmill sails). About $1.0 a building and
$0.85 a prop including inputs.

**Wiring (2026-11-20)**: pack.json points house, fantasy_house, stone_house,
tall_house, inn, blacksmith, barn, stable, barracks, mill_house, well,
market_stand, cart, hay, anvil, bed, bench, bookcase, cauldron, chest, table
and torch at these files, at real scale (w/d/h from the manifest, `fit`
footprint, or height for the torch), and adds `bar_counter`. The old entry of
each stays reachable as `<type>_classic` (tag `classic`, no aliases).
`"tier": "1k"` makes light quality load `<name>.1k.glb` (packs.js keeps it,
app.js `makeCatalogItem` swaps the file); medium/high load the 2048 files.
Not wired: `fence_section` (one 2 m length with two posts: fences placed a
cell apart would double up; the old fence stays), `signpost` (code-built in
app.js, glyph I), and barrel/crate (code-built; the earlier gen/barrel.glb and
crate.glb are still unused). The chest model has no lid animation (packages
that play a chest's clip get none). procgen.js reserves room for the real
sizes (closed buildings: inn and barracks 9 x 9 squares, smithy and
stone/tall/timber houses 7 x 7) and puts walk-in door pads 3 squares out.

### Open image-to-3D against Meshy 7.1, measured (2026-11-22)

Tried on the inn and the blacksmith against the shipped (welded, rebuilt)
Meshy 7.1 models. Meshy's raws and every candidate went through one frozen
copy of the shipping pipeline (`work/img3d-trial/pipe/`: proc.py of the
afternoon of 2026-11-22 with the model's options.json opts: 40k triangles,
normal map baked from the full model, de-lit base colour; then the 2048
tier, decompressed, check.py `--pair`), and were rendered at fixed cameras
(far, back, door at 4.5 m, close on the front-left eave). Scripts in
`tools/env-assets/trial/` (fal client with a ledger and spending cap, lock
wrapper, processing, renders, sheets); scratch, the call table (`calls.md`)
and the sheets (`shots/inn_side_by_side.jpg`,
`shots/blacksmith_side_by_side.jpg`; with Pixal3D and Step1X-3D:
`shots/*_side_by_side_2.jpg`) in `work/img3d-trial/` (not in git).
$1.99 of fal in all (19 calls), plus $2.03 of vast.ai (below).

- **On fal (2026-11-22)**: TRELLIS.2 (`fal-ai/trellis-2`, MIT: $0.25 /
  0.30 / 0.35 at 512 / 1024 / 1536), its retexture endpoint
  (`fal-ai/trellis-2/retexture`, $0.20 at 512, $0.24 at 1024), TRELLIS v1
  single and multi-image ($0.02), Hunyuan3D **2.0** (`fal-ai/hunyuan3d/v2`
  and `/multi-view`: $0.16 untextured, $0.48 textured; Tencent community
  licence, which excludes the EU, UK and South Korea), SAM 3D Objects
  ($0.02, Meta's SAM licence). **Not on fal**: Pixal3D and Step1X-3D (never
  listed), Hunyuan3D 2.1 (`fal-ai/hunyuan3d-v21` is deprecated). Nothing
  newer and open is listed; the newer 3D endpoints (Hunyuan 3.x, Tripo,
  Rodin, Hi3D, Meshy) are closed.
- **Input preparation matters**: cut the concept out with BiRefNet
  (`fal-ai/birefnet/v2`, a fraction of a cent; removes the grey ground and
  the soft cast shadow) and crop it square with a 10% margin. TRELLIS v1 on
  the raw concept made black roof planes; on the cut-out it did not.
- **TRELLIS v1**: blobby, wavy beams, every back side dark. Its GLB leaves
  `metallicFactor` unset, which glTF reads as 1 (black metal): set it to 0
  (`trial/matfix.py`) before judging any TRELLIS v1 model. Front + back with
  multidiffusion invented a second gable; eight views rendered from the Meshy
  mesh gave Meshy's layout, softer. Not usable.
- **TRELLIS.2 at 1536** (cut-out front, 25 steps per stage, 2048 texture,
  seeds 1 and 2): the best open shape. Windows, panelled door, beams and
  roof lines are as crisp as Meshy's or crisper, and it modelled the forge's
  interior with its fire. Against it: the texture atlas is hundreds of
  slivers, so the inn's roof comes out in dark and orange blotches (in both
  seeds, also undecimated: not our decimation) and the 1k tier will bleed
  at the seams; timber comes out slate grey instead of brown wood; the
  blacksmith's roof has torn single-sheet shingles; a grey apron is fused at
  the inn's base; seed 2 copied the inn's front onto its back. Open edges
  after welding: inn 2.0-3.2k raw / 1.5-2.4k final, blacksmith 43-45k raw /
  25k final (Meshy: 421 and 144). Finals 2.6-3.0 MB against Meshy's 2.8 and
  2.1 MB. They are mostly single-sheet boards and shingles
  drawn double-sided (the material keeps `doubleSided` through our
  pipeline), but check.py passes them only because its limit is relative to
  the raw. Orientation: the inn's front faces +Z as Meshy's does, the
  blacksmith's needs yaw 180 (TRELLIS v1 differs again: check every model).
- **TRELLIS.2 retexture of the Meshy shape** (the shipped 30k mesh without
  UVs, the cut-out front image, 1024, 25 steps): an even, clean texture on
  Meshy's geometry (the same open edges as Meshy), darker timber and less
  cream plaster than Meshy's own; about equal, not better.
- **SAM 3D Objects** (inn only, one seed, $0.02): the surprise. Watertight
  (0 open edges, one piece), 31k triangles, 1024 texture, a 660 KB final:
  clean straight roof lines, dormers and porch, and it reads well at game
  scale. Up close the texture is soft, the gable's beams are painted flat
  rather than modelled, the plaster is brown, the sign is gone, and the back
  is a copy of the front. Below Meshy, but cheap enough to try properly (the
  blacksmith and two more seeds would cost $0.06; out of budget here).
- **Hunyuan3D 2.0** (untextured, octree 512, 50 steps; 3.0M triangles,
  pre-decimated to 300k by `trial/predec.py` so proc.py fits the lock): a
  melted, puffy shape with soft beams and window openings. Worst of the
  shapes; a textured run ($0.48) was not worth the budget. Its licence
  excludes the EU, UK and South Korea anyway.

**Self-hosted on vast.ai, same day: Pixal3D and Step1X-3D.** One RTX 6000
Ada 48 GB (pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel; Step1X-3D needs
~27 GB, Pixal3D's 1536 mode more than 24 GB). Install and run scripts in
`tools/env-assets/trial/remote/` (setup-pixal3d.sh, setup-step1x.sh,
pixal_run.py, pixal_single.py, s1x_run.py; logs in
`work/img3d-trial/vastlogs/`). Lessons from the setup:
- **Pick a host by its network and per-GB prices, not only $/h.** The first
  box (a 48 GB 4090 in Japan) had broken IPv6 (fix:
  `precedence ::ffff:0:0/96 100` in /etc/gai.conf), GitHub refusals and Hugging
  Face at 0-5 MB/s, and was given up after 18 min. The second pulled ~75 GB
  of weights at 60+ MB/s (aria2c, 8 connections a file: `remote/dl/`), but billed downloads per GB: **the trial cost $2.03 of
  vast credit against a $1.00 budget** (GPU $0.85, storage $0.16,
  downloads $1.01). Filter on `inet_down_cost` and `storage_cost`, and
  fetch only the checkpoints a run uses.
- Pixal3D: TRELLIS.2's setup.sh steps without flash-attn
  (`ATTN_BACKEND=sdpa`), NATTEN 0.21 built for sm_89, `einops` added; its
  configs name the gated, non-commercial `briaai/RMBG-2.0` as background
  remover: point `pipeline*.json` at `ZhengPeng7/BiRefNet` (our inputs carry
  alpha anyway). Full-VRAM mode at 1536 ran out of memory in CuMesh's GLB
  extraction even alone on 48 GB: use `--low_vram` (models offloaded), ~3.5
  min a run at 12 steps. Its weights: 46 GB (single and multi-view sets).
- Step1X-3D (own env, torch 2.5.1): its requirements' git+ lines need
  `--no-build-isolation`; `mosaicml-streaming` is imported at load;
  setuptools < 70 (`pkg_resources`). SDXL base is fetched at runtime: its
  fp16 files under the plain names in a local folder, patched into
  `step1x_3d_texture_synthesis_pipeline.py`.
- Running both at once on 48 GB ran out of memory: one at a time.

- **Pixal3D multi-view** (its distinctive route): views need camera-to-world
  poses and are used uncropped, so each concept's pose was estimated by
  fitting the Meshy mesh's silhouette over a grid of azimuth, elevation and
  FOV (`trial/pose_fit.py`, `pose_score.py`: IoU 0.95 / 0.92 for the inn's
  front / back, 0.90 / 0.90 for the blacksmith's; front az 45, back az
  210-220, el 5-10) and the concept reframed to match. Set mvA = the two
  real concepts; set mvB = the two concepts plus two renders of the Meshy
  mesh (az 135 and 315) at exact poses. Frame 0 is not Pixal3D's canonical
  front, so the result comes back in that camera's frame (`pixal_run.py`
  turns it back; still needed yaw -90 for the inn, 180 for the blacksmith).
  1536 cascade, 12 steps (25 steps ran out of memory alongside Step1X-3D),
  seeds 1-2. **The best open result**: mvA inn seed 1 from the front is close
  to the concept and to Meshy (crisp porch, door, dormers; an even warm roof
  without TRELLIS.2's blotches; cream plaster; brown timber), and the
  blacksmith's seed 1 has a modelled forge with its fire pit. But it is
  unreliable: where the two concepts disagree (the chimney's place) it builds
  both (two chimneys and a doubled gable on the inn's back); inn seed 2 came
  out warped and dark, blacksmith seed 2 leans; adding the Meshy renders
  (mvB) fixed the inn's back but wrecked the blacksmith (a pagoda-like roof:
  Meshy moved its chimney relative to the concept). Up close its texture is
  softer than Meshy's and the eaves wave. Open edges 600-1,600 (inn) and
  900-1,300 (blacksmith), 1-6 pieces; finals 2.7-3.9 MB.
- **Pixal3D single image** (inn, cut-out front, MoGe camera, 1536, 12
  steps): a clean, crisp front close to Meshy's, but a dark back (the unseen
  side), slightly tilted, smeared tiles up close; 193 open edges, one piece.
- **Step1X-3D** (geometry 1300m: 50 steps, octree 512, up to 400k faces,
  seeds 1-3; then its texture model, which cuts the mesh to 50k faces and
  paints from SDXL multi-views): watertight, 0 open edges, ~1 MB finals. It
  modelled the forge and fire, but its shapes are soft and lumpy (melted
  shingles, lumpy dormers), the inn 25% taller than the concept, porches
  copied onto the back, and the texture changes between sides (front walls
  dark blue-grey, back beige). Below Meshy on every seed.
- **Step1X-3D texture on Meshy's shapes**: the inn's is a fair, even
  orange-and-cream, about equal to Meshy's own; the blacksmith's has a
  smeared forge interior and a roof that is light grey in front and slate
  at the back. Not better than Meshy's texture.

**Verdict: keep Meshy 7.1.** None of the open options beat it on both shape
and texture across seeds: TRELLIS.2's shape is competitive but its texture
is not; Pixal3D multi-view comes closest (its best seeds rival Meshy from the
front), but it is unreliable from seed to seed, builds both versions where
the two concept views disagree, is softer up close, and needs a rented
48 GB GPU and ~46 GB of weights; Step1X-3D, SAM 3D and Hunyuan3D 2.0 are
below; retexturing Meshy's shape with TRELLIS.2 or Step1X-3D does not improve
its texture. Worth trying later: Pixal3D with consistent posed views (two
concept views made to agree, or several views of one generated turnaround),
and TRELLIS.2 or Pixal3D for an object whose shape Meshy gets wrong (the
forge interior). Not tested: Hunyuan3D 2.1 (not on fal), Pixal3D at 25
steps, single-image Pixal3D on the blacksmith or with more seeds, a third
TRELLIS.2 seed and its other settings (`remesh_project`, shape guidance),
the Step1X-3D label model (symmetry and sharp-edge controls; 8.8 GB more),
textured Hunyuan3D.

### Modular building kit (2026-11-27)

In the game since 2026-11-27 (`app/buildings.js`; rendering.md "Buildings: the kit"): the default for walk-in
and closed buildings; the Meshy building models (`props/env`) are only loaded with `?kit=0` / `"kit": false`
(still in the repo). Game files: `tools/kit/export_game.py` writes `assets/textures/kit/` (the graded sets as
WebP, 1024 and `_512`; shingle darkened and given more contrast there) and `assets/models/kit/` (the pieces
through `tools/compress-glb.sh`: door, leaf and window at 1024 with `_512` copies for light quality, the rest
512, the `_lod` files 256; `pieces.json`). Licences: `LICENSE.txt` in both (Tripo and Patina outputs through
fal.ai are paid generations owned by the project, like the Meshy models; plaster and clay tile are Poly Haven
CC0). Texture memory, all of it once for any number of houses: 9 sets x 3 maps + 20 piece files. Checked in the
game with `tools/kit/game-shots.mjs` (shots and numbers; `work/kit/game/`).

Buildings assembled by code from the description the world already has (the
wall/door grid, rooms by flood fill) instead of one image-to-3D model per house: the whole-house
models spread their triangles and one texture over the building, and the shell-to-room swap looked
wrong. Scripts in `tools/kit/` (headers say how to run each); scratch, raw files and the running
notes in `work/kit/` (`NOTES.md` is in git: every number and decision; sheets in `work/kit/shots/`).
- **Three layers.** Structure (procedural, exact): wall panels .18 thick through the wall cells'
  centres, both faces finished, cut for doors and windows; stone plinth; floors, joists; gable roofs
  per room rectangle with overhang, eave thickness and pitch; an L gets a main roof and a wing roof
  running into it to the main ridge; gable walls. Frame (procedural): sill and top plates, corner,
  bay and jamb posts, rails round openings, seeded braces (corner, chevron, cross, herringbone), a
  jetty's joist ends and corbels, king post and collar in the gables, bargeboards; quoins and timber
  lintels on stone. Hero pieces (image-to-3D): door frame + hinged leaf, two windows, chimney,
  dormer, porch, sign, corbel, outside stair, each fitted to a box in game units.
- `build_house.py` (Blender) builds a house from `tools/kit/houses/<name>.json` (the game's grid
  letters plus style, storeys, jetty, roof, pitch, bay, braces, chimney, porch, sign, dormers,
  upperDoors, stair, seed). Output: one object per material for the structure, one per material
  for the roof (`<name>_roof_<mat>`, chimney and dormer with them, so the roof fades alone), pieces
  as linked duplicates (glTF instances), the leaf on its hinge. Vertex colours carry dirt at the
  base and the per-building tint, so every house shares the same materials.
- **Materials**: `fal-ai/patina/material` (~$0.07 a 1K set; normal maps OpenGL like the env set):
  fieldstone, quoin, thatch, wood shingle, floor boards, plank siding, a timber strip; Patina's
  plaster was flat yellow, so plaster is the CC0 `plaster_aged`. `make_textures.py` grades them to one
  palette (`work/kit/tex/`).
- **Hero pieces, compared** (door, window, chimney; one call each; every raw through proc.py at
  12k with the bake): Tripo h3.1 ($0.40 with HD texture) won: watertight, the sharpest textures with
  Meshy's, the closest to the reference, sensible back sides (a window is seen from inside too).
  Hunyuan3D v3 ($0.525) a close second; Rodin 2.5 ($0.40) clean geometry, wrong colours; Meshy 7.1
  ($1.20 textured) open edges and a blank board behind its window. Table: `work/kit/NOTES.md`,
  sheets `work/kit/shots/cmp_*.jpg`. `kit_piece.py` fits each piece (yaw, box, anchor, texture size)
  and cuts the door's leaf out of the fused door (bisect at the frame's opening, the front sheet with
  a mirrored back, origin on the hinge).
- **Four houses** (half-timber with a jetty, an L with a stone ground floor and an outside stair, a
  thatched stone cottage, a plank barn): 1.2-4.7k structure triangles, 22-89k with the pieces
  (windows are most of it), 13-17 draw calls (instanced), 0.6-1.5 MB of geometry; the kit's
  textures are shared. Side by side with the shipped Meshy inn at its render cameras:
  `work/kit/shots/side_by_side.jpg`. In Babylon (WebGPU, `tools/kit/viewer.html`, `shots.mjs`):
  `work/kit/shots/babylon_sheet.jpg`; the roof fades by visibility (set `transparencyMode` null:
  the glTF loader pins OPAQUE) and the storey above is clipped by a plane, with no shell swap.
- **Round 2** (no fal): roofs in courses (shingle; clay tile, `"roof": "tile"`) with fascia,
  verge bargeboards, a profiled ridge and a seeded sag; thatch as a rounded, lumpy body with a
  ridge roll and spars; a full chimney (hearth and breast inside on timber houses, outside the
  gable on stone ones, the Tripo piece only as the top); seeded porch, bench, window boxes,
  lean-to with a workbench or log pile; fieldstone 1.5 m a repeat; Patina roughness raised (it
  made roofs glossy). LODs: `lod_piece.py` (window 250, door 300 ... porch 1000, stair 1400
  triangles) and `build_house.py --far` (slab roofs): near 23-89k, far 3.6-13.5k triangles a
  house; switch at about 20 units. Sheet with the concepts and the old inn:
  `work/kit/shots/side_by_side_2.jpg`.
- In the game: merged across houses (one mesh per material for the world), per-panel infill tint and darker
  shingle done. Open: KTX2 textures (no encoder installed), impostors or a merged far village.
  $11.62 of fal in all (ledger `work/kit/ledger.jsonl`).

### Procedural trees, plants and the environment texture set (2026-11-20)

- `assets/models/props/env-nature/` (manifest.json: type, files `<type>.gltf`
  and `<type>.med.gltf`, real height and canopy radius, the pack.json type it
  replaces; variants oak_tree_b/_c, pine_tree_b/_c): trees and plants made in
  Blender from Sapling Tree Gen skeletons with leaf-cluster cards. Foliage is
  alpha-tested (MASK), double-sided, with normals bent toward the crowns and
  occlusion baked into COLOR_0 (keep the file normals). `cover/`: grass
  tufts (4), flowers (3), pebbles (5) as crossed cards with up normals, one
  node per kind (terrain.js scatters them). Scripts in `tools/blender/`
  (headers say how to run them): `env-fetch.py` (CC0 bark and leaf
  sources), `make-leaf-atlases.py`, `make-trees.py`, `pack-trees.py`,
  `render-trees.py` (contact sheets), `render-patch.py` (a 20 m test patch),
  `make-cover-atlas.py`, `make-cover.py`.
- Wiring: pack.json oak_tree, tree, tall_tree, autumn_tree, dead_tree,
  pine_tree, tall_pine, flower_bush, red_bush, fern use the full file at
  medium/high and `.med` at light (`"tier": "med"`), oak and pine with
  `"variants"` chosen per square (the same square keeps the same tree). On
  the board the trees stand at 55-70% of their real 8-15 m (`h`), so a small
  board isn't one canopy; beyond the edge (surroundings.js) they are full
  size. The old models are `<type>_classic`.
- `assets/textures/env/` (manifest.json: `tileMeters`, the real size one
  repeat covers, and the mean colour; LICENSE.txt): 22 CC0 PBR materials
  (Poly Haven, ambientCG) as WebP colour/normal/rough/ao at 2048 and `_1k`,
  colour-corrected to sit together under one warm sun, rebuilt by
  `tools/blender/make-textures.py`. Normal maps are OpenGL (+Y): on code-built
  Babylon materials `invertNormalMapX = true, invertNormalMapY = false`
  (walls.js, roofs.js, terrain.js's rock); the terrain shader builds its own
  frame (T = +x, B = cross(N, T)). Used by terrain.js (ground layers), walls.js,
  roofs.js. The 1k files everywhere below high quality.

## Hosting

**Only tablefolk.world uses the mirror** (and the game on localhost):
`@tablefolk/models` `mirrorAllowed()` decides, so other sites using the
libraries download from Hugging Face. Every mirrored file needs a Hugging
Face source beside it (`sources({ mirror, hf })`, a worker's `fallbackUrl`).
Files only on R2 (Nemotron's conversion) always come from R2.

The large browser models live in the `geebr-models` R2 bucket
(Cloudflare, `wrangler`), served under four hostnames
(`geebr-models[-2|-3|-4].mindroot.io`). Uploads cost the owner money and
bandwidth: ask first. `wrangler r2 object put geebr-models/<key> --file <f>
--remote` works (a first attempt can fail on the connection: repeat it) but
refuses files over 300 MiB, and a single PUT over a slow line times out (about
200 s): split big files into 64 MiB parts `<name>.p000 ...` plus a
`<name>.parts.json` (`{ size, partSize, parts }`) and upload those; the speech
model's worker (`libs/hear/bark-worker.js`) reads that layout, four parts at a time
from the four hostnames. The speech model is under `underdog-bark-3.0/`
(fp16 and int8 variants); Bonsai (Transformers.js) loads from Hugging Face.
Mirrored from Hugging Face with the same bytes (SHA-256 checked), each loader
trying R2 first and Hugging Face as the fallback: `qwen1_5-0_5b-chat-q4_0.gguf`
(the Oracle's Qwen1.5), `gemma-4-E2B-it.litertlm` (Gemma E2B with sight) and
`bonsai-2-27b/Ternary-Bonsai-2-27B-PTQ1_0.gguf` (Bonsai 2 27B: since 2026-11-27 only the hidden `bonsai2-27b-v2` uses it; Bonsai 2.5 27B is mirrored since 2026-11-27 at `bonsai/hf/prism-ml/Ternary-Bonsai-2.5-27B-GGUF/resolve/28a7093cc25bc151cc2b284c5570f12ce343fdcf/Ternary-Bonsai-2.5-27B-PTQ1_0.gguf` (Hugging Face layout, copied with `tools/r2-copy/bonsai25.json`, SHA-256 checked; the old object can go once nobody needs the hidden entry); Bonsai 2 9B is mirrored since 2026-11-27 at `bonsai/hf/prism-ml/Ternary-Bonsai-2-9B-gguf/resolve/82265ccc78ddaac4700286a35e9badcc32376dd9/Ternary-Bonsai-2-9B-PTQ1_0.gguf` (`tools/r2-copy/bonsai9b.json`)), the wllama-fast brains' GGUFs (2026-11-27, `tools/r2-copy/wllama-fast.json`, SHA-256 checked, 12.6 GB copied in 438 s plus the first file's run; `wllama.js` entries name them with `mirror:`) under `wllama/hf/<repo>/resolve/<rev>/<file>`: `AtomicChat/Inkling-2-Mini-GGUF` @ `4f0c56af` `Inkling-2-Mini-AD-IQ2_M.gguf` (8.67 GB), `drofn/Inkling-2-Mini-8GB-GGUF` @ `1101a9e5` `Inkling-2-Mini-8GB-64K.gguf` (6.62 GB) and `AtomicChat/SenseNova-Loop-9B-GGUF` @ `6c661668` `SenseNova-Loop-9B-AD-Q4_K_M.gguf` (5.96 GB); one file each, no splits. (The Worker's `/verify` ran out of CPU on the 8.67 GB file, error 1102: its SHA-256 was checked on a rented box from a download of the mirror copy instead.), and Raon-1
nano's 4-bit LiteRT-LM bundle (2026-11-21, `tools/r2-copy/`, 1.82 GB in 78 s,
sha256 8f8ab92b...) at
`litert/hf/KRAFTON/Raon-1-nano-litert-lm/resolve/54312d339f6ed417257a166055fcb130a6dbf80e/model.litertlm`
(Hugging Face's layout at the pinned revision; `litert-worker.js` falls back to
that revision on Hugging Face; the OPFS copy is keyed by the model's name, so
one cached from Hugging Face stays in use). Pocket-TTS's models
too, under `pocket-tts/web/` (KevinAHM/pocket-tts-web: `onnx/<language>/`
for the five languages, `sentencepiece.js`, its README and licences) and
`pocket-tts/18m/` (maxime/pocket-tts-18m-onnx, `english_18m_refl_2026-10/`);
both CC-BY-4.0. The 18M worker keeps the Hugging Face URLs as its cache keys. A copy already
cached from Hugging Face stays in use (wllama and the Bonsai engine cache by URL).
**Copying a public file from Hugging Face into R2 without the maintainer's
line** (2026-11-12, 8.9 GB in about a minute; the tool is `tools/r2-copy/`): deploy a throwaway Worker bound
to the bucket that, per 64 MiB part, fetches the range from Hugging Face and
`uploadPart`s it (through a `FixedLengthStream`) into an R2 multipart upload,
then `complete`s it; drive it from a script with a token header (and a
User-Agent: Cloudflare answers Python's default with 403, error 1010), check the
SHA-256 against Hugging Face's `x-linked-etag`, and `wrangler delete` the Worker.
The painting models (2026-11-15, copied by `tools/r2-copy/`, 1.65 GB in
137 s) are under `paint/hf/<repo>/resolve/<rev>/<path>` (Hugging Face's
layout): tiny-sd (`danyalmalik/tiny-sd-ONNX-WebGPU`, with its LICENSE.md, the
CreativeML Open RAIL-M that must travel with it), TAESD's decoder
(`julienkay/taesd`), Chitra Tiny (`mrfakename/Chitra-Tiny-ONNX`) and the CLIP
tokenizer (`Xenova/clip-vit-base-patch32`, tokenizer files only);
`libs/paint/paint-worker.js` pins each to that revision (`REV`), tries the
mirror first and keeps the pinned Hugging Face URL as the cache key; the
tokenizers go through Transformers.js's `env.fetch` (its file probe asks for
`main`, so every request is rewritten to the pinned revision).
ZONOS3-Mini is under `zonos3-mini/d2d142a/web/` (2026-11-15; the Hugging Face
revision's first seven characters): the part of Zyphra/ZONOS3-Mini's `web/`
that `libs/voice/zonos-web-worker.js` uses (backbone, `zac`, `spk`,
`companions`, `laci`, the voices' json, codes and embeddings; 121 files,
0.9 GB, none over 102 MB), downloaded, checked against Hugging Face's
SHA-256 and put one by one with `wrangler r2 object put` (four at a time).
A new export goes under a new revision prefix.
Breeze TTS 2 is under `breeze-tts-2/`: HoppouAI's `breeze-tts-2-q4_k-dd2.gguf`
in 37 parts with a `parts.json` (size, part size, part names, SHA-256), the
breeze-server v0.1.3 Linux and Windows builds (unused since the local
helpers went, 2026-11-21), `LICENSE-model.txt`
(BreezeBlue's research and non-commercial licence: redistribution only for
that, with the licence and a NOTICE), `NOTICE.txt` (its required wording and
"Derived from Breeze TTS 2...") and the runtime's Apache licence;
`libs/voice/breeze-web-worker.js` reads the parts.
The maintainer's line was about 1 MB/s each way on 2026-10-25: a 1.2 GB file
takes half an hour. Everything else is served from the repo. `?assets=<url>`
or `window.TABLEFOLK_ASSETS` points the app at another asset host.
