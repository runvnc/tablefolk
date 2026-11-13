# Architecture

Tablefolk is a static web app (`app/`), a Bun server (`server/`) and data
(`assets/`, `scenarios/`, `skills/`, `roles/`, `packages/`, `registry/`).
Nothing is bundled: the browser loads plain scripts in a fixed order, so a
file's header comment is its reference, and most files are small enough to
read whole.

## Repository map

| path | what |
|---|---|
| `index.html`, `home.js`, `home.css` | the landing page served at `/` |
| `app/` | the app at `/app/` (below) |
| `app/llm_js/` | the bridge from the language models to the world, the older engines (ES modules) |
| `app/tts/` | the game's voice: playback, voices, Breeze on a server (the engines' workers are in `libs/voice/`) |
| `libs/` | the standalone libraries `@tablefolk/*` the game is built on: models, device, brain, decider, voice, hear, menus ([below](#libraries-libs)) |
| `server/` | the Bun server: static files, AI proxies, world builder, admin |
| `server/fast-skill.md` | the condensed scenario skill the world generator's model reads |
| `assets/` | the core asset pack (`pack.json`), models, textures, sounds, 2D tiles |
| `scenarios/` | example and showcase scenarios (`showcase.json` feeds the welcome screen) |
| `skills/`, `roles/`, `packages/` | built-in skills, roles and packages |
| `registry/index.json` | the official package list (rebuilt by `tools/registry.mjs`) |
| `plugins/tablefolk-scenario/` | the public Claude Code plugin: the scenario skill (user and author docs) |
| `.claude/skills/tablefolk-dev/` | this skill (maintainer docs) |
| `docs/` | the documentation site (VitePress) and planning notes |
| `tools/` | build, asset and test tools (`tools/browser-test/` drives Chrome) |
| `generated/` | worlds written by the world builder (git-ignored) |
| `.admin/` | admin password hash and saved settings (git-ignored, never served) |
| `incidents/`, `UX_SURVEY.md`, `work/` | old notes and scratch (`work/` ignored) |

## Libraries (libs/)

The parts that are useful outside the game are plain ES modules in `libs/`.
Each is its own npm package (`@tablefolk/<name>`); `libs/README.md` has the
use, the rules and publishing, and each folder has its own README.

| library | in it | the game's glue |
|---|---|---|
| `models` | the mirror rule (R2 only on tablefolk.world), `sources()`, `createWorker()`, `local` (settings keys, prefix `tablefolk`), `note()` | `world-integration.js`: `setMirror(true)` on localhost, `window.tablefolkMirrorAllowed` for classic scripts, notes to "This device" |
| `device` | device detection and the model choice (was `app/llm_js/hardware.js`), `gpu-memory.json` | `agent-brain.js`, `world-integration.js` import it |
| `brain` | the LiteRT worker and proxy, wllama 3, Bonsai 2, the OpenAI client, `sampling.js` (all were in `app/llm_js/`); `createBrain()` with chat/stream/pick/yesno/json and a Prompt-API session; `openrouter.js` (PKCE) | `agent-brain.js` keeps the picker, the character turn and the older engines (WebLLM, Transformers.js, wllama 2, LFM3) and imports the moved ones; the server imports `engines/openai.js` |
| `decider` | the Strands Decider (was `app/llm_js/decider.js`) | not used by the game yet |
| `voice` | the speech workers (Pocket 18M, Pocket 100M, Breeze web + its wasm, the PCM worklet; were in `app/tts/`), `createVoice()`, `chooseEngine()` | `app/tts/pocket-tts-manager.js` starts the workers from `/libs/voice/` and sends `mirror` in `load` |
| `hear` | the Bark worker and `mel.js` (were `app/asr/`), `createListener()` | `app/speech-input.js` starts `/libs/hear/bark-worker.js` |
| `paint` | text to image: `paint-worker.js` (ONNX Runtime Web; Chitra Tiny with rectified-flow Euler, tiny-sd with DPM++ 2M and the TAESD decoder; WebGPU or WASM), `createPainter`/`choosePainter` | `skills/painting/skill.js` (paint(subject): paints in the background, hangs the picture as a note through the `note` command, which the skill's `allow` unlocks; steps down tiny-sd, Chitra, the processor when the card is full) |
| `script` | conditions (a tokenizer), state, actions, the workflow runner (menu steps, choosers, pause, step-id saves), triggers, `validate`; `test.mjs` runs headless in Node | `app/story.js` (host and `tablefolkStory`/`tablefolkWorkflows`), `app/menus.js` (choices), `scenario.js` (goals `if`, load warnings), `server/worldgen-core.js` (generator checks) |
| `menus` | `match()`, `modelChooser()`, `createMenuBox()` and its look | `app/menus.js` (now a module): scenario menus by id, say/do/menu, `window.tablefolkMenu` |

Libraries are imported without `?v=` (served with `Cache-Control: no-cache`)
and never read game globals: `node tools/libs.mjs check` before committing a
change there. A moved file's old path is gone; look in `libs/`.

## How the page starts

`app/index.html` loads `app/browser-check.js` and `app/preflight.js` (each
with its own `?v=`). Preflight reads the dev flags (`?art`, `?tabletop`,
`?still`, `?webgl`...), checks WebGPU, hands its adapter to
`TablefolkBrowserCheck.publish()` (synchronous: browser and OS from the user
agent, adapter info, `shader-f16`, limits, JSPI, cross-origin isolation, into
`window.tablefolkBrowser` with `why(feature)` reasons; the Graphics pane's
"This browser" table; one toast for a WebGPU browser without JSPI after
`tablefolk-scene-ready`, once per version, key `tablefolk.browserWarned`; the
compatibility screen's hint and "Detected:" line), then loads, one after another, the CDN libraries (pako, UPNG,
html2canvas, Babylon.js, its loaders and Havok, unversioned from
cdn.babylonjs.com; local copies in `app/vendor/` first when
`app/vendor/manifest.json` lists them, written by `tools/vendor-fetch.sh`,
the CDN as fallback; `window.tablefolkVendorUrl(url)` maps a URL for later
scripts, e.g. the `studio.env` environment texture) and the app's own scripts, each with a `?v=` version:

```
note-svg recorder confirm-dialog toast sfx ui-polish tabs library packs
tts/pocket-tts-manager tts/tts-ui look perf-monitor graphics-settings
terrain-hd app scenery combat darkness roofs cutaway locks fp-hands senses
packages embed mind roles play live director speech-input workflows skills
trade procgen scenario registry tabletop welcome tile-render
llm_js/world-integration (module)
```

Classic scripts share one global scope. `app/app.js` (about 5300 lines) is
the core and defines the globals the later files use: `state` (the world:
`state.characters`, `state.playerAvatar`, `state.scene`, `state.camera`,
`state.cameraMode` `'follow'`/`'overview'`, `state.firstPerson`,
`state.places`...), `meta` (per-mesh data), `getBrainConfig` /
`setBrainConfig` (each character's brain config: personality, inventory,
mind, messages), `say`, `walk`, `makeObject`, `gridKey`, `canSeeCell`,
`isBlocked`, `hasGroundAt`, `wallH()`, `findRoute`, `playRig`... Later
files wrap themselves in an IIFE and publish a `window.tablefolkX` object.
`installWorldAPI()` in `app.js` publishes `window.tablefolk`, the API that
scenario.js, the tests and packages use.

## Files

| file | job |
|---|---|
| `app.js` | scene, board, walls, doors, objects, characters (`FIGURES`, `createFigure`), animation, cameras (follow, free, first person), commands (`COMMANDS`, `parseCommand`, `runAgentCommand`), perception (`buildVisiblePerception`), prompts (`buildAgentPrompt`, `buildCommandExamples`), say/give/sell, save and load, `window.tablefolk` |
| `look.js` | the shared "painted clay" materials and post-processing (`TABLEFOLK_LOOK`) |
| `terrain-hd.js` | floor tiles, water, lava, the shelved HD island (`TablefolkHD`) |
| `graphics-settings.js` | the Graphics pane and `?gfx=` |
| `scenery.js` | campfire, lantern, light, fence, signpost, lily pad, crystal ball, scrying pool, rune circle; the local-lights budget |
| `combat.js` | hit points, weapons, attack, defeat (`tablefolkCombat`) |
| `spells.js` | fireball, lightning, spawn: effects and 3D sound (`tablefolkSpells`) |
| `reactions.js` | the held cast gesture (wraps `playRig`: idle/talk wait until it ends), hit flinch and red flash, synthesized cries (`tablefolkReact`) |
| `darkness.js` | fog of war, sight (`sightFor`), carried torches (`tablefolkDark`) |
| `roofs.js` | thatched roofs found from the walls (`tablefolkRoofs`) |
| `cutaway.js` | per-pixel wall cut between the follow camera and the player |
| `locks.js` | locked doors and keys |
| `fp-hands.js` | first-person hands |
| `senses.js` | what characters perceive, in words ("Around you", places, `look()`) |
| `mind.js` | mood, needs, memory, goals, opinions, the state card, who gets a turn |
| `embed.js`, `embed-worker.js` | EmbeddingGemma 2 recall |
| `roles.js`, `trade.js`, `skills.js`, `packages.js`, `registry.js` | roles, selling rules, skills, packages, the Library pane's search |
| `uses.js` | using things (`tablefolkUses`): chests' contents, seats and beds (poses), work stations, the prompt's use menu, daily routines |
| `menus.js` | JRPG-style menus (`tablefolkMenu`): a character's `menu` on E, the scenario's `menus`; words from the chat box or the 🎤 matched to a choice (number, label, keyword, shared words, EmbeddingGemma when its best is 0.74+ and 0.06 ahead, then the brain picks a number greedily: 12/12 paraphrase and none-of-these cases with Gemma E2B, 2026-11-12); `pick()` lets the brain choose from any list; scripted choices (`reply`, `act` through `world.runAs`, `set`, `take`, `workflow` through `world.driveWorkflow`), `if` conditions and lists of menus (2026-11-13) |
| `story.js` | the game's host for `@tablefolk/script` (libs/script), a module: flags in `state.flags` (saved), runs in each brain config's `wf` (by step id, version 2), facts for mind.js, conditions, actions, the workflow runner (`tablefolkWorkflows`: start, turn, drive, pause, resume), triggers (`start` fired by scenario.js), `validate` (load warnings; the world generator's checks). A menu choice's sale counts as the player's agreement; a workflow's does not. Replaces `workflows.js` (2026-11-13) |
| `play.js` | the player's side: E, loot, inventory pane, giving, the turn round after each player action, fighters |
| `live.js`, `director.js` | living worlds and pacing; events |
| `speech-input.js` | the 🎤 button: hold to talk (`press` / `release`; `toggle` stays for scripts); Bark's progress goes out as `tablefolk-load` events |
| `load-status.js` | the download cards under the top bar (`tablefolkLoad.set/clear`): Breeze engines' TTS `status` and `upgrade` events, and `tablefolk-load` events (speech input) |
| `procgen.js` | dungeon and village generator, walk-in building templates (also imported by the server) |
| `scenario.js` | the scenario format (`normalizeScenario`), base maps, grid, walk-in buildings, layout engine, goal checker, links, banner, 🎯 pane, tactic tester, `freezeLayout` (`tablefolkScenario`) |
| `tabletop.js`, `tile-render.js` | `?tabletop=1` view; 2D tile rendering |
| `welcome.js` | the welcome screen |
| `tabs.js`, `ui-polish.js`, `toast.js`, `confirm-dialog.js`, `library.js`, `recorder.js`, `video-recorder.js` (the ⏺ video button: canvas + mixed voices and sfx), `perf-monitor.js`, `note-svg.js` | UI shell and helpers. `tabs.js`: rail, panes, user / dev mode. Rail buttons are plain (both modes), `dev-only` (pane only in dev mode), `rail-dev` (pane in both modes, on the rail only in dev mode: Messages, Voice, Graphics) or `user-only` (Settings). In user mode `placeForMode()` moves `#chatNameLabel` into Settings and `#viewBtns` into the Adventurer pane (the same nodes, back to the chat dock in dev mode; comment anchors keep their places), so ids stay unique. Buttons with `data-open` in the panel open a pane; `#chatHistoryBtn` in the dock opens Messages. `ui-polish.js` marks `#chatTarget.single` (hidden in user mode) and sets the box's placeholder |
| `builder.js`, `map-editor.js`, `worldgen-browser.js` | loaded by the world builder page (`server/generate.js`), not by the app |
| `llm_js/world-integration.js` | the brain loop: runs a character's turn (`world.runAgentTurn`), history, the talk budget, prose-to-command extraction, the echo guard; `window.tablefolkLLM` |
| `llm_js/agent-brain.js` | model registry (`SUPPORTED_MODELS`) and engine choice |
| `libs/brain/engines/litert.js`, `libs/brain/engines/litert-runner.js`, `libs/brain/engines/litert-worker.js` | LiteRT-LM Gemma in a shared worker; `MODEL_MIRRORS` |
| `libs/brain/engines/openai.js` | the OpenAI-compatible client (endpoint brain, also used by the server) |
| `llm_js/dev-console.js` | `llm(prompt)` and `genmap(prompt)` in DevTools |
| `llm_js/*wllama*`, `*tjs*`, `gpt-runner.js`, `model-loader.js`, `main.js`, `demo-chat.js`, `grammar.js` | older engines kept for tests (hidden models); `*.bak_*` are stale copies |
| `tts/pocket-tts-manager.js`, `tts/tts-ui.js`, `tts/*worker*.js` | speech output engines, spatial audio, the Voice pane |

## Scenario pipeline

`tablefolkScenario.playScenario(json)` → `normalizeScenario` (drops unknown
top-level fields; runs `procgen.applyToScenario` for `generate`) →
`expandBase` (island, clearing, dungeon) → `expandGrid` (grid + legend into
objects and paint) → `expandBuildings` (walk-in buildings) → packs and
packages load → the layout engine places map lines → the world is built
through the same spawn functions as the sandbox (`spawnAgent`, `makeObject`)
→ locks, skills, roles, workflows → `tablefolk-scenario-started`. A new
top-level scenario field must be added to `normalizeScenario`'s `out`, or it
is silently dropped.

## Events (on `window`)

| event | fired by | used for |
|---|---|---|
| `tablefolk-scene-ready` | app.js | start-up |
| `tablefolk-scenario-started` | scenario.js | live.js, roofs, director, welcome |
| `tablefolk-player-turn` | play.js | nearby characters act; companions follow; pacing |
| `tablefolk-player-chat` | world-integration | pacing |
| `tablefolk-agent-turn` | world-integration | turn counting, mind ticks, goals, pacing |
| `tablefolk-say` | app.js `say()` | `said` goals |
| `tablefolk-attacked`, `tablefolk-defeated` | combat.js | minds, play |
| `tablefolk-approached` | senses | approach notices |
| `tablefolk-thinking` | model-loader-litert | the model's status (thinking, loading) |
| `tablefolk-workflow` | workflows.js | workflow progress |
| `speechstart`, `speechend` | TTS | talk animation |

## Coordinates and units

One board cell is one world unit. North = -z, south = +z, east = -x, west =
+x (screen right is -x in the tabletop view). Characters have an
authoritative `logicalPos` (the tile they are on); the Havok collider
follows it. Procgen grids: row 0 north, `x = x0 - c`, `z = r - z0` with
`x0 = floor((W-1)/2)`, `z0 = floor((H-1)/2)`. Wall height is `wallH()` =
`WALL_H * state.wallHeightScale`; doors are `max(.55, min(1.45, wallH() -
.3))`; a person is 1.3 tall, eyes about 1.14.

## Save keys (localStorage)

`tablefolkState` (sandbox), `tablefolkScenarioState` (scenario mode),
`tablefolk.dev`, `tablefolk.pace`, `tablefolk_model`, `tablefolkTtsEnabled`,
`tablefolkEmbed`, `character.library.*`, and per-package code trust.
