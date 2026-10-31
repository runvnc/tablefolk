# Changelog

What changed, newest first. Dates are commit dates. Details of each feature
are in the scenario skill's chapters (users and authors) and the maintainer
skill (internals); `git log` has every commit.

## 2026-10-30

- **Lighter light mode**: no shadow maps at all, one pixel per screen point, lighter wall stones and floor tiles, 1024 px critter textures; the critter's walking clip no longer keeps its own textures in any mode. The tavern scene: 281 MB of graphics memory at light (620 at medium), half the vertices.
- **Breeze needs 0.9 GB less graphics memory**: its text encoder runs on the CPU (a small patch on Breeze-TTS-2.cpp v0.1.5, `tools/breeze-server/build.sh`), 2.1 GB instead of 3.0, about half a second more before speech; with both Breeze and Gemma on a 6 GB card the GPU had run out and the speech came out scrambled.
- **Window view (H)**: the webcam follows your head (MediaPipe face tracking in the browser) and the free camera moves with it, like looking into the diorama through a window.
- **Recommended sampling per model** (Gemma 1.0, MiniCPM5 1.0, LFM3 0.1 ...) instead of the game's temperature; the LiteRT models had been running on hidden bundle defaults.
- **Latest libraries**: LiteRT-LM 0.19.0, Transformers.js 4.3.2 everywhere, onnxruntime-web 1.31.1, wllama 3.8.1.
- **Smaller brains on trial** (hidden): MiniCPM5-2B on LiteRT-LM and LFM3-1.7B on WebGPU kernels (runs without shader-f16); evals: Gemma E2B 35/36, LFM3 30/36, MiniCPM5 25/36.
- **Breeze TTS 2 in the browser**: Breeze-TTS-2.cpp compiled to WebAssembly with ggml's WebGPU backend (two codec ops rewritten, bit-identical), the 2.5 GB model downloaded once from R2 into the browser's storage; an opt-in Voice-pane engine. Proven end to end on the CPU; GPU speed still to be measured on a machine whose Chrome offers shader-f16.
- **Breeze TTS 2 as a speech engine**: BreezeBlue's 3B voice model, run by `breeze-server` on your own machine (`tools/breeze-server.sh` fetches it and the 2.46 GB Q4 model), cloning the library voices from their samples and transcripts; chosen by itself when it runs and the graphics card has room, otherwise an option in the Voice pane.
- **The endpoint panel lists the server's models** (`GET /models`) in a picker and as suggestions in the model box.
- **Newer chips in the device check**: RTX Spark (N1X), DGX Spark (GB10) and any Apple M-series by name (M6 and later included), with the smallest memory each ships with.
- **Bonsai 2 27B replaces Bonsai 1.7B** in the model menu: Prism ML's ternary 27B (5.9 GB) on the webml-community WebGPU kernels, for graphics cards with 10 GB or more.
- **The best model for the device**: a first visit starts with the biggest brain the graphics card holds (the card found by name in a table of 1546 cards from onepunk/llmsizer and open-gpu-db), and the menu marks it.
- **Endpoint settings in the top bar**: picking "OpenAI-compatible endpoint" opens a panel for the base URL, API key and model; it starts on "done".
- **Free camera by default**, with every wall at half height so no one hides behind one; first person keeps full walls and a click there no longer walks; the wheel zooms along the view instead of drifting to the last clicked square.
- **Characters face whom they talk to** (named, last speaker, or the player), speak softly up close and louder across a room; a **voice volume slider** sits in the top bar (the old one was overridden by the spatial gain).
- **Hand-overs show**: giver and receiver reach out and the thing (its picture, coins, a parcel) passes between their hands.
- **Calmer idles**: the Meshy people's idle clip keeps 30% of its motion (the head and hips swung about 90 degrees).
- **New villager woman and king** (Meshy): the red-haired villager's limbs were deformed; the king is now an older king in red and gold (the old one is `king_classic`).
- **Voices**: anger samples redone as cold anger (shouted lines cloned squeaky); the tavern keeper and rogue re-recorded for steadier identity (9 and 7-8 of 10); `hooded_x` is male.

## 2026-10-25

- **Voice states are one file each** on R2 (`pocket-tts/states-v6/<voice>[@<mood>].bin`): no index, no bundles; the build tool takes voice ids, so a changed voice means re-uploading 6-7 small files. The old bundles are deleted from the bucket.

- **All 22 library voices acted**, with mood samples; new monster voices (`undead_m`, `dragon_m`) used by default for skeletons, zombies and ghosts, and dragons, giants, trolls, orcs and demons; a `seductive` mood for characters written that way. States in `voices-state-18m-v5-*.bin` on R2 (about 325 MB, a voice starts in about 90 ms).

- **Steadier voice identity**: mood and main samples of a voice share one seed and steadier ElevenLabs settings; Gemini 4 Argon rates "same speaker" 9-10 of 10 across a voice's samples and its clones (the dwarf was 5). States rebuilt (`-v4`).

- **Mood voices** (a test): the five acted voices have a sample per mood; a character speaks in the clone for its strongest feeling (fear whispers, sadness is slow and breathy). The admin page has a button per mood. Anger needs a redo.

- **Acted voice samples**: five voices (breathless young woman, old crone, old wizard, dwarf, sorceress) redesigned with ElevenLabs Voice Design and recorded by Eleven v4 doing three emotions each (Gemini 4 Argon rates them 9-10 for expressiveness, against 5-6 before); samples may run to 16 s; precomputed states rebuilt (`-v2` on R2).

- **Admin "Try it"**: each designed voice has a button that speaks a line you type with the game's own engine (the clone, from the cached or precomputed state), through a hidden frame (`app/voice-try.html`); the page's player still plays the original sample.

- **Voice states are cached**: a cloned voice (the designed library and the Voice pane's own) is processed once per browser; later visits start it in about 100 ms instead of 1.5-1.8 s. The 20 library voices' states are also precomputed on R2, so even a first visit starts in about 100 ms.

- **New people**: six JRPG-style Meshy characters (swordswoman, sorceress with
  a split dress, huntress, village woman, swordsman, wanderer) from concept
  art; `adventurer`, `adventurer_woman`, `witch`, `huntress`, `peasant_woman`,
  `villager` and `woodsman` now use them (the old bodies are `*_classic`).
- **Designed voices**: 20 voices described in text (fal.ai Qwen3-TTS Voice
  Design), cloned by Pocket-TTS; characters get one by gender, the generator
  casts from them (`pack:<id>`).
- **Speech input in the browser**: Underdog Bark 3.0 (Parakeet-TDT, ONNX) on
  onnxruntime-web, chosen in Brain options (`app/asr/`).
- **Models**: Bonsai 1-bit 1.7B (Transformers.js, WebGPU, tested) in the picker
  (the LiteRT-LM Bonsai bundles don't run in the web engine yet: hidden);
  Nemotron 3.5 Bolt E4B registered (hidden until converted and mirrored:
  `tools/convert-litertlm.sh`); endpoint presets for Nemotron (Ollama,
  llama.cpp) and Bonsai.

- **Subworlds and kept models**: `"keep": true` on a walk-in building leaves
  its 3D model standing and makes the inside a separate map, entered by
  stepping on the glowing square in front of the door (and left the same
  way). General `links` and `subworlds` fields (a cellar, a dungeon) use the
  same swap; the left map is kept as a snapshot. The world builder has a
  "keep building models" option (default on) and a per-building box.

- **Walk-in buildings**: `house`, `fantasy_house` and `stable` become walled
  rooms (5x5, 6x5, 7x5) with a door, a floor and standard furniture; things
  placed inside replace the furniture; the world builder draws their walls
  and a ghost of the furniture; `"enter": false` keeps the closed model.
- **Thatched roofs** on the walled rooms of worlds with an outside: courses
  of thatch with a normal map, rolled eaves and ridge, timber-trimmed gables,
  chimneys on some. The roof over the player's room fades; the follow camera
  sees through one in its way; the free camera never peeks. `"roofs"`
  (true/false) now works (it was dropped by `normalizeScenario`).
- **Pacing** of living worlds on real time: each character its own next
  turn (calm 20-36 s), a quiet gap after every spoken line, characters with
  nothing to react to mostly idle without the model, faster for 30 s after
  the player acts and slower after 3 minutes without; director events spaced
  by the pace; a calm / lively / busy select by the live button; `"pace"` in
  a scenario.
- **Notes**: one paper-shaped sheet at three sizes: on the floor, pinned
  upright on a wall (`"wall": "north"`, or written facing a wall, sized to the
  wall), and paper-sized in a hand (no more notes on heads); readable
  writing; no glow.
- Hunger and tiredness grow half as fast; "eats the bread".
- Showcase worlds and the alchemist and Stonebrook examples use
  person-height walls (`wallHeight` 2).
- `/` serves the landing page instead of redirecting to `/app/`.
- Documentation reorganised: the scenario skill split into chapters (also
  the user guide), a maintainer skill (`.claude/skills/tablefolk-dev/`), this
  changelog, `tools/docs.py`, and a VitePress site in `docs/` built from the
  same files.

## 2026-10-24

- **Let them live** (P): everyone acts on their own while the player watches
  or joins in; `"live": true`. **The director**: now and then something
  happens next to a character (a note, coins, a rat, the scenario's own
  `events`, timed turning points).
- **Sight in the browser**: the "Gemma 4 E2B with sight" brain (the full
  multimodal model on the LiteRT-LM nightly) makes `look` send the
  character's own view.
- Characters: a menu of what they could do right here, `carry(name)` walks
  over and picks it up, `dig(north)`, diagonal walks, `walk(name)`, giving
  things and gold to each other (and failing when they don't have it),
  opinions of each other from gifts and blows.
- **Welcome screen** with showcase worlds (goblin bakery, necromancer's job
  interview, goblin builders, dragon tax audit, haunted tavern); the
  download question waits behind it and the intro card.
- **World builder**: a map editor drawn from 2D tiles (drag monsters, people
  and things in, move them, draw walls and doors, lock doors, paint floors,
  undo); tiles rendered from the 3D models (`app/tile-render.js`); separate
  choice of where the model runs (browser, server, cloud) and which model;
  guest rights on the admin page; the generator writes living worlds.
- **Admin page** redesigned (sections, overview, saved toasts).
- **Server for a public launch**: visitors' use of the server AI gated by
  the admin page and rate-limited per address; requests through a proxy or
  tunnel count as visitors.
- Wall cutaway done per pixel in the wall materials; camera buttons beside
  first person; follow camera starts further out.
- No frozen picture while the model sets up (render held, GPU back-pressure);
  `jank.mjs`.
- Generator replies up to 17000 tokens for reasoning models.
- Fixes: plain-string inventories crashed a world; the map editor made
  things into characters; players no longer get a toast for every line;
  the wolf is a big grey rat (broken skinning); landing page pitch.

## 2026-10-23

- **Minds for tiny models**: the game keeps feelings, needs, memories and
  goal turns and puts a short state card in each prompt (`remember()`,
  `eat()`, `goal()` on by default); who takes a model turn and when.
- **Roles** as packages (`roles/*/role.json`), selling as the `trade` skill
  (prices, lowest price, the buyer's agreement); **packages**
  (`tablefolk.json`) with items, skills, roles, workflows and code; the
  **registry** (`registry/index.json`, npm and GitHub search, Library pane).
- **Smart memory**: EmbeddingGemma 2 in the browser, blended with keyword
  recall.
- **Dark dungeons**: fog of war, sight that needs light and line of sight,
  carried torches; characters see only what they could see (line of sight
  all round, 13 squares).
- Combat: one blow a round, loot bodies, talking enemies, locked doors and
  keys; attack animations; weapons follow the hand on more bodies.
- **Meshy monsters** (orc, goblin, skeleton, skeleton warrior, troll,
  skeleton farmer) via fal.ai; `tools/fal-monster.py`,
  `tools/finish-monster.sh`.
- First person: hands, punches, held weapon and torch; swing and hit sounds.
- Small Pocket-TTS engine (18M) with swappable speech engines; TTS on by
  default; the dead say nothing; a talk budget; talk like a real person.
- Shared LLM worker, kept two minutes after the last page; step-by-step world
  building with Gemma in the browser; Diablo-style follow camera with wall
  cutaway.
- Generator and character endpoints: OpenRouter, OpenAI, local or a URL,
  with saved keys; default generator `deepseek/deepseek-v4.1-flash-1017`.
- Give things to characters by dragging from the Adventurer pane; quick map
  tooltips; tabletop zoom and pan.
- Headless tests with the scene drawing (`?gfx=`, `?fps=`,
  `agenttest.mjs --render`); evals; `docs/MINDS.md`, `docs/REQUESTS.md`.

## 2026-10-18

- **Bun server**, an OpenAI-compatible LLM client and the endpoint brain.
- **Procedural dungeons and villages** (`generate`) with characters placed
  by role; doors and double-height walls in generated maps.
- **`/world/<prompt>`**: the scenario generator agent; its loading view.
- Combat (hit points, wield, attack, defeat); senses and speech input; a
  vision option for endpoint brains; JSON workflows; skills from packages,
  npm or GitHub; per-character allowed commands.
- Quaternius characters and monsters; village props; dungeon dressing
  (Fantasy Props MegaKit); realistic Universal-rig figures.
- Play: open chests, pick things up, gold on walk-over, inventory pane, NPC
  turns after yours; door and combat sounds (Kenney, CC0); user / dev mode;
  Messages pane, defeat card.
- **Admin page**; world builder editor with a top-down map; voice
  descriptions.
- **Tabletop view** (`?tabletop=1`): top-down, names, grid, PNG and print,
  move things; ask the AI for changes (`/api/revise`).
- Doors (person-height leaf, wall over the top); flatter stone walls; lava
  lights and flows; water flows one way; `lighting: "dim"`; `wallHeight`.
- LLM characters think and talk without freezing the player; repeated lines
  dropped; friendly characters take turns only while they can see the
  player.

## 2026-10-17

- **Tablefolk** (renamed from geebr.world): living maps with local AI
  characters; history reset.
- Scenarios as `#s=` links; ASCII grid scenarios with lossless export; demo
  scenarios; `scenario_link.py --html`; the scenario agent skill and plugin.
- The board world: sized per scenario in the sea, no built-in island; island
  pieces as objects.
- Chat: pick who you talk to; leaner prompts; earshot, overhearing and
  `whisper()`; plain-text replies are spoken.
- Fast model downloads from four R2 hostnames; GPU memory freed on reload.
- First-person and overview movement fixes.
- Sculpted grass tiles for every cell, real floors (planks, tile, carpet,
  lava, rippling water), natural stone walls, the Stonebrook test village.

## Before October 2026 (v14)

- **v14.6**: speaking animation driven by TTS events (`speechstart` /
  `speechend`, the `talk` clip, a mouth-flap on the head bone); `say()` uses
  Pocket-TTS; speech bubbles at a fixed 42 px above the head; all 8 KayKit
  animation packs; `emote(name)` (dance, laugh, sit, wave, clap, cheer,
  sleep, bow); duplicate root-level files removed.
- **v14.5**: perception panel fixed north-up; hidden cells stay blank.
- **v14.4**: hidden cells render as blank spaces; the perception grid rotated
  with facing (undone in 14.5).
- **v14.3**: facing-aware perception cone; a one-tile awareness bubble; line
  of sight through walls blocked.
- **v14.2**: characters face where they walk; line-of-sight occlusion in the
  perception grid (walls, stone, rubble and buildings block sight).
- **v14.1**: turn-based walking no longer snaps back; an authoritative
  `logicalPos` per character, the Havok collider follows it.
- **v14**: a turn-based command loop for LLM control (one command runs,
  physics settles, the world freezes); tile-by-tile tweened walking instead
  of physics impulses; the public API `window.runCommand`,
  `executeCommand`, `stepTurn`, `endTurn`, `getAgentPerception`.
