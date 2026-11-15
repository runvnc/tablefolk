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

Self-hosting (2026-11-14, vast.ai RTX 4090 at $0.375/h): Pixal3D (Tencent
ARC, MIT, on TRELLIS.2) needs ~18 min of building (TRELLIS.2's setup.sh
extensions, natten), its requirements fail to resolve (MoGe's trimesh pin;
installed by hand), its background remover RMBG-2.0 is gated and
non-commercial (patched out; cut-outs made with rembg's ISNet), and its
full 1536 mode runs out of memory on 24 GB (low-VRAM mode, 1024). Then
95-170 s a model, of which diffusion is ~15 s and mesh finalising (remesh,
UV, bake; mostly CPU) ~100 s, so a 5090 would gain little. Its animals came
out speckled and walked worse than Hunyuan3D's: not used. fal is the way.

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
`bonsai-2-27b/Ternary-Bonsai-2-27B-PTQ1_0.gguf` (Bonsai 2 27B). Pocket-TTS's models
too, under `pocket-tts/web/` (KevinAHM/pocket-tts-web: `onnx/<language>/`
for the five languages, `sentencepiece.js`, its README and licences) and
`pocket-tts/18m/` (maxime/pocket-tts-18m-onnx, `english_18m_refl_2026-10/`);
both CC-BY-4.0. The 18M worker keeps the Hugging Face URLs as its cache keys. A copy already
cached from Hugging Face stays in use (wllama and the Bonsai engine cache by URL).
**Copying a public file from Hugging Face into R2 without the maintainer's
line** (2026-11-12, 8.9 GB in about a minute): deploy a throwaway Worker bound
to the bucket that, per 64 MiB part, fetches the range from Hugging Face and
`uploadPart`s it (through a `FixedLengthStream`) into an R2 multipart upload,
then `complete`s it; drive it from a script with a token header (and a
User-Agent: Cloudflare answers Python's default with 403, error 1010), check the
SHA-256 against Hugging Face's `x-linked-etag`, and `wrangler delete` the Worker.
ZONOS3-Mini is under `zonos3-mini/d2d142a/web/` (2026-11-15; the Hugging Face
revision's first seven characters): the part of Zyphra/ZONOS3-Mini's `web/`
that `libs/voice/zonos-web-worker.js` uses (backbone, `zac`, `spk`,
`companions`, `laci`, the voices' json, codes and embeddings; 121 files,
0.9 GB, none over 102 MB), downloaded, checked against Hugging Face's
SHA-256 and put one by one with `wrangler r2 object put` (four at a time).
A new export goes under a new revision prefix.
Breeze TTS 2 is under `breeze-tts-2/`: HoppouAI's `breeze-tts-2-q4_k-dd2.gguf`
in 37 parts with a `parts.json` (size, part size, part names, SHA-256), the
breeze-server v0.1.3 Linux and Windows builds, `LICENSE-model.txt`
(BreezeBlue's research and non-commercial licence: redistribution only for
that, with the licence and a NOTICE), `NOTICE.txt` (its required wording and
"Derived from Breeze TTS 2...") and the runtime's Apache licence;
`tools/breeze-server.sh` reads that layout.
The maintainer's line was about 1 MB/s each way on 2026-10-25: a 1.2 GB file
takes half an hour. Everything else is served from the repo. `?assets=<url>`
or `window.TABLEFOLK_ASSETS` points the app at another asset host.
