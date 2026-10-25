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
| `app/llm_js/` | language-model engines and the bridge to the world (ES modules) |
| `app/tts/` | speech: Pocket-TTS engines in workers |
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

## How the page starts

`app/index.html` loads `app/preflight.js` (with its own `?v=`). Preflight
reads the dev flags (`?art`, `?tabletop`, `?still`, `?webgl`...), checks
WebGPU, then loads, one after another, the CDN libraries (pako, UPNG,
html2canvas, Babylon.js, its loaders and Havok, unversioned from
cdn.babylonjs.com) and the app's own scripts, each with a `?v=` version:

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
| `scenery.js` | campfire, lantern, light, fence, signpost, lily pad; the local-lights budget |
| `combat.js` | hit points, weapons, attack, defeat (`tablefolkCombat`) |
| `darkness.js` | fog of war, sight (`sightFor`), carried torches (`tablefolkDark`) |
| `roofs.js` | thatched roofs found from the walls (`tablefolkRoofs`) |
| `cutaway.js` | per-pixel wall cut between the follow camera and the player |
| `locks.js` | locked doors and keys |
| `fp-hands.js` | first-person hands |
| `senses.js` | what characters perceive, in words ("Around you", places, `look()`) |
| `mind.js` | mood, needs, memory, goals, opinions, the state card, who gets a turn |
| `embed.js`, `embed-worker.js` | EmbeddingGemma 2 recall |
| `roles.js`, `trade.js`, `skills.js`, `packages.js`, `workflows.js`, `registry.js` | roles, selling rules, skills, packages, workflows, the Library pane's search |
| `play.js` | the player's side: E, loot, inventory pane, giving, the turn round after each player action, fighters |
| `live.js`, `director.js` | living worlds and pacing; events |
| `speech-input.js` | the 🎤 button |
| `procgen.js` | dungeon and village generator, walk-in building templates (also imported by the server) |
| `scenario.js` | the scenario format (`normalizeScenario`), base maps, grid, walk-in buildings, layout engine, goal checker, links, banner, 🎯 pane, tactic tester, `freezeLayout` (`tablefolkScenario`) |
| `tabletop.js`, `tile-render.js` | `?tabletop=1` view; 2D tile rendering |
| `welcome.js` | the welcome screen |
| `tabs.js`, `ui-polish.js`, `toast.js`, `confirm-dialog.js`, `library.js`, `recorder.js`, `perf-monitor.js`, `note-svg.js` | UI shell and helpers |
| `builder.js`, `map-editor.js`, `worldgen-browser.js` | loaded by the world builder page (`server/generate.js`), not by the app |
| `llm_js/world-integration.js` | the brain loop: runs a character's turn (`world.runAgentTurn`), history, the talk budget, prose-to-command extraction, the echo guard; `window.tablefolkLLM` |
| `llm_js/agent-brain.js` | model registry (`SUPPORTED_MODELS`) and engine choice |
| `llm_js/model-loader-litert.js`, `gpt-runner-litert.js`, `litert-worker.js` | LiteRT-LM Gemma in a shared worker; `MODEL_MIRRORS` |
| `llm_js/openai-client.js` | the OpenAI-compatible client (endpoint brain, also used by the server) |
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
