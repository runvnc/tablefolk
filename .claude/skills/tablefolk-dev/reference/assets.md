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
| floor and other textures | `assets/textures/`, `assets/models/tiles/` |
| sounds | `assets/sounds/kenney-rpg/`, `assets/sounds/kenney-impact/`; `SAMPLES` in `app/sfx.js` |
| voices | `app/tts/` (built-in Pocket-TTS voices); descriptions in `.admin/settings.json` via the admin page |
| skills, roles, packages | `skills/*/skill.json`, `roles/*/role.json`, `packages/*/tablefolk.json`; `registry/index.json` |
| scenarios | `scenarios/*.json`; `scenarios/showcase.json` for the welcome screen; `EXAMPLES` in `app/scenario.js` |
| browser models | `SUPPORTED_MODELS` in `app/llm_js/agent-brain.js`; `MODEL_MIRRORS` in `app/llm_js/litert-worker.js` |
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
   http://localhost:8001 only=<type>`.
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

## Hosting

The large browser models live in the `geebr-models` R2 bucket
(Cloudflare, `wrangler`), served under four hostnames
(`geebr-models[-2|-3|-4].mindroot.io`). Uploads cost the owner money and
bandwidth: ask first. `wrangler r2 object put geebr-models/<key> --file <f>
--remote` works (a first attempt can fail on the connection: repeat it) but
refuses files over 300 MiB, and a single PUT over a slow line times out (about
200 s): split big files into 64 MiB parts `<name>.p000 ...` plus a
`<name>.parts.json` (`{ size, partSize, parts }`) and upload those; the speech
model's worker (`app/asr/worker.js`) reads that layout, four parts at a time
from the four hostnames. The speech model is under `underdog-bark-3.0/`
(fp16 and int8 variants); Bonsai (Transformers.js) loads from Hugging Face.
The maintainer's line was about 1 MB/s each way on 2026-10-25: a 1.2 GB file
takes half an hour. Everything else is served from the repo. `?assets=<url>`
or `window.TABLEFOLK_ASSETS` points the app at another asset host.
