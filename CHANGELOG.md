# Changelog

What changed, newest first. Dates are commit dates. Details of each feature
are in the scenario skill's chapters (users and authors) and the maintainer
skill (internals); `git log` has every commit.

## 2026-10-25

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
