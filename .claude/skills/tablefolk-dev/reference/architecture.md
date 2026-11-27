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
| `app/tts/` | the game's voice: playback, voices (the engines' workers are in `libs/voice/`); `app/world-file.js`: a world as a file (a PNG card with the world in a `tfWd` chunk and in the pixels' low bits, a .zip, .json), opened by dropping it on the game or the builder; `voice-sample.js`: a world's own voices (scenario `voices`: an Ogg Opus sample written with WebCodecs, the ZONOS3-Mini embedding) and "my voices" (IndexedDB `tablefolk-my-voices`), shared by the builder and the game, which speaks them as `pack:<id>` (`TABLEFOLK_SCENARIO_VOICES`, checked before the library by `tablefolkPackVoice`) |
| `libs/` | the standalone libraries `@tablefolk/*` the game is built on: models, device, brain, decider, voice, hear, menus, paint, script ([below](#libraries-libs)) |
| `server/` | the Bun server: static files, AI proxies, world builder, admin |
| `server/fast-skill.md` | the condensed scenario skill the world generator's model reads |
| `assets/` | the core asset pack (`pack.json`), models, textures, sounds, 2D tiles |
| `scenarios/` | example and showcase scenarios (`showcase.json` feeds the welcome screen) |
| `skills/`, `roles/`, `jobs/`, `packages/` | built-in skills, roles, jobs and packages |
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
| `voice` | the speech workers (Pocket 18M, Pocket 100M, ZONOS3-Mini (its vendored WebGPU engine in `zonos-web/`), Breeze web + its wasm, the PCM worklet; were in `app/tts/`), `createVoice()`, `chooseEngine()` | `app/tts/pocket-tts-manager.js` starts the workers from `/libs/voice/` and sends `mirror` in `load` |
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
(abridged; app/preflight.js has the full list)
note-svg recorder confirm-dialog toast sfx ui-polish tabs library packs
tts/pocket-tts-manager tts/tts-ui look sky perf-monitor graphics-settings
terrain-hd app bodies scenery combat spells reactions terrain surroundings walls darkness roofs cutaway locks fp-hands senses
packages embed books mind uses roles play animals live director clock jobs threats speech-input
menus (module) story (module) skills trade procgen scenario registry tabletop welcome tile-render
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

### The loading cover and the start-up order (loading.js, 2026-11-22)

`#loadCover` (index.html, styled in style.css) is up from the first frame;
`app/loading.js` (loaded right after Babylon.js) lifts it once the world is
completely built, so no intermediate stage is ever on screen. "World ready"
is one event, `tablefolk-world-ready` ({ms, timedOut, pending, stages}), and
`tablefolkLoading.whenRevealed()`. What it waits for, as named stages
(`tablefolkLoading.begin(name)` returns `done`; `.log` has their times):

| stage | begun by | ends |
|---|---|---|
| `scene` | loading.js | `tablefolk-scene-ready` |
| `opening` | loading.js, when the URL has `?scenario=` / `#s=` | `TABLEFOLK_LINK_OPENED` (scenario.js) |
| `world` | scenario.js `playScenarioNow` (also puts the cover up, with the world's `title` and `subtitle`) | the build returns |
| `bodies`, `props` | every `BABYLON.SceneLoader` `ImportMeshAsync` / `LoadAssetContainerAsync` / `AppendAsync` (wrapped; bodies when the path is a character's) | the file is loaded |
| `trees` | surroundings.js `start` | the trees stand |
| `ground` | terrain.js, on `tablefolk-scenario-started` | the rebuild with the texture arrays, and the ground cover |
| `walls` | walls.js, on `tablefolk-scenario-started` | the 650 ms rebuild |
| `roofs` | roofs.js, on `tablefolk-scenario-started` | the last roof or shell (one a frame) |
| `buildings` | buildings.js, a world's first kit build | the hero pieces loaded and placed |
| `travel` | scenario.js `curtain(true)` (a section) | `curtain(false)` |

With nothing pending for 300 ms it settles: the finishing steps
(`tablefolkLoading.finish(name, fn)`, each at most 10 s: app.js `freeze`,
`freezeStaticScenery`; spells.js `spells`, the spells' shader prewarm; both
ran on timers after the reveal before 2026-11-22 and could hitch the first
seconds in view; without a cover they still do), `scene.whenReadyAsync()`
(every material and texture ready; at most 8 s) and four frames drawn under
the cover (shaders compiled), then it fades out (with `?brainhold=1`,
the first time, it wakes the characters first, below). 45 s after it went up it lifts anyway and notes
in the "This device" pane what was still pending. While it
is up the render loop draws at most 15 frames a second and
`tablefolkDressGate` never waits for the model. A link's world is not
preceded by the saved one any more (app.js skips `loadWorldState` and the
stand-in character when the URL names a scenario). `?cover=0` turns the cover
off; `?tiles=1` pages never show it.

Sections use the same cover in its short form (`.short`: the destination's
name only); the model is not touched (`playScenarioNow` with `sub`).

Start-up order (2026-11-22, the owner's rule: strictly one thing at a time;
no AI engine does anything before the graphics are loaded and settled). The
queue is `tablefolkLoading.turn(job)` / `release(job)` (`skip(job)` when it
is not coming, `expect(job)` to be waited for before asking): a job starts
after the first reveal and `steady()` (a second of frames with no gap over
100 ms, at most 8 s), and after every earlier job in ORDER that is expected
or has asked has finished (at most 10 minutes):

1. Before the reveal: the page, Babylon, the scene, the world's build (all
   stages above). The brain's decision: `pickForDevice` (cached device
   facts; a first visit picks from the card's name, its GPU measurements
   deferred to `probe`) and whether the model is in the browser's cache (an
   OPFS lookup from the page: the file's entry and size, nothing read, no
   worker). A model that needs a download asks at once, over the cover
   (`html.cover-up #hud:has(...consent)`): UI only; an approved download
   still waits for its turn.
2. `probe` (agent-brain.js): a first visit's @tablefolk/device measurements
   (bandwidth, memory probe; `deferMeasuring` / `runDeferred`), cached for
   the next visit. Usually nothing.
3. `brain` (world-integration.js; expected from its decision): download,
   the weights onto the card, warm-up, over the world with the non-blocking
   notice ("Waking the characters…", real progress: the download, then the
   weights streamed in, then the set-up). The picture is not held
   (rendering.md, "The model's set-up and the picture"; `?renderhold=1`
   holds it as before). `?brainhold=1` instead keeps the cover up for a
   cached model (`holdCover`, cap 30 s; comparisons only).
   The characters and the clock wait: live.js starts a `"live"` world 1.5 s
   after `whenRevealed()` and once `TABLEFOLK_BRAIN_WAKING` is false
   ('tablefolk-brain-settled': ready, failed, declined or not coming; at
   most 10 minutes), so the day starts at the scenario's `time` with the
   characters awake. The clock, routines (jobs.js), needs (mind.js),
   greetings (chatter.js) and threats all follow `tablefolkLive.on`. A
   section's short cover and `?cover=0` start it as before.
   `startup-time.mjs` reports `unseen` (the clock at the reveal against the
   scenario's `time`, who moved).
4. `embed` (embed.js: EmbeddingGemma for recall; it started 1.5 s after the
   page opened, during the build, before 2026-11-22).
5. `voice` (tts-ui.js auto-load, `tablefolkTTS.prepare`).
6. `speech` (speech-input.js: Underdog Bark's preload, which also waits for
   the brain's status as before).
7. Later, on their own triggers: the capability check (agency.js, once a
   brain is ready: it uses the brain while 4-6 load), the better-voice
   offer, sight (a character's first look).

`startup-time.mjs --audit` lists every worker, shared worker, GPU device,
model-host fetch, OPFS and Cache Storage opening with its time and caller,
and whether it came before the settle.

## Files

| file | job |
|---|---|
| `bodies.js` | bodies from packs and packages (`"bodies"`: a GLB, height, clip map, emotes, kind, natural attack, hp) as `FIGURES` entries with a `url`, forgotten with their package; `mapClips` for `createFigure`; named clips on characters (`playClip`, `emote`), `tablefolkBodies` |
| `app.js` | scene, board, walls, doors, objects, characters (`FIGURES`, `createFigure`), animation, cameras (follow, free, first person), commands (`COMMANDS`, `parseCommand`, `runAgentCommand`), perception (`buildVisiblePerception`), prompts (`buildAgentPrompt`, `buildCommandExamples`), say/give/sell, save and load, `window.tablefolk` |
| `look.js` | the shared matte materials and post-processing (`TABLEFOLK_LOOK`) |
| `sky.js` | the sun/moon, sky fill, shadow map, time of day, sky dome, clouds, fog (`tablefolkSky`, `tablefolkLook.setTimeOfDay`) |
| `terrain.js` | the blended ground, ground cover, what lies beyond the board (`tablefolkTerrain`) |
| `buildings.js` | the building kit: houses assembled from the grid (walls, frame, roofs, hero pieces from `assets/models/kit`), walk-in and closed; roof fade per pixel, storey clip, piece LOD (`tablefolkBuildings`; rendering.md "Buildings: the kit") |
| `walls.js` | stone, dungeon and timber-framed walls, door frames, windows (`tablefolkWalls`) |
| `surroundings.js` | trees on the land beyond the board (`tablefolkSurroundings`) |
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
| `roles.js`, `trade.js`, `skills.js`, `packages.js`, `registry.js` | roles, selling rules, skills (and package modules' commands: `addCommand`, `allowedBy`), packages (loading, the module `api`, one code-trust rule for packages and skills: `askTrust`, reset per scenario), the Library pane's search. The supported surface for package authors is the scenario skill's `api.md`; `node tools/check-api-doc.mjs` checks it against the code |
| `uses.js` | using things (`tablefolkUses`): chests' contents, seats and beds (poses), work stations, the prompt's use menu, daily routines |
| `menus.js` | JRPG-style menus (`tablefolkMenu`): a character's `menu` on E, the scenario's `menus`; words from the chat box or the 🎤 matched to a choice (number, label, keyword, shared words, EmbeddingGemma when its best is 0.74+ and 0.06 ahead, then the brain picks a number greedily: 12/12 paraphrase and none-of-these cases with Gemma E2B, 2026-11-12); `pick()` lets the brain choose from any list; scripted choices (`reply`, `act` through `world.runAs`, `set`, `take`, `workflow` through `world.driveWorkflow`), `if` conditions and lists of menus (2026-11-13) |
| `story.js` | the game's host for `@tablefolk/script` (libs/script), a module: flags in `state.flags` (saved), runs in each brain config's `wf` (by step id, version 2), facts for mind.js, conditions, actions, the workflow runner (`tablefolkWorkflows`: start, turn, drive, pause, resume), triggers (`start` fired by scenario.js), `validate` (load warnings; the world generator's checks). A menu choice's sale counts as the player's agreement; a workflow's does not. It replaced the old `workflows.js` (2026-11-13) |
| `clock.js`, `jobs.js`, `threats.js` | the time of day (`tablefolkClock`, `tablefolk.setTimeOfDay`), jobs and the day run in code (`tablefolkJobs`; `jobs/<id>/job.json`), raids on the clock (`tablefolkThreats`) (minds.md, "busy by default") |
| `play.js` | the player's side: E, loot, inventory pane, giving, the turn round after each player action, fighters |
| `live.js`, `director.js` | living worlds and pacing (`turnOf(c)`: one character's turn, used by the live loop and turn mode's rounds); events |
| `modes-core.js`, `modes.js` | the game modes (living, adventure, turns: brains.md, "Game modes"): the rules in `modes-core.js` (no game globals; `tools/browser-test/modes-test.mjs`), wired in `modes.js` (`tablefolkModes`: the mode and why, who may use the model, the adventure encounter, the world's speed, the turn round, the End turn bar, Settings' "How the game runs") |
| `speech-input.js` | the 🎤 button: hold to talk (`press` / `release`; `toggle` stays for scripts); Bark's progress goes out as `tablefolk-load` events |
| `loading.js` | the loading cover (`#loadCover`) and "world ready": staged builders report into it, it lifts when the world is built; the ordered start-up queue for the brain, voice and speech engines (above, "The loading cover") |
| `load-status.js` | the download cards under the top bar (`tablefolkLoad.set/clear`): Breeze engines' TTS `status` and `upgrade` events, and `tablefolk-load` events (speech input) |
| `procgen.js` | dungeon and village generator, walk-in building templates (also imported by the server) |
| `sections.js` | a world in sections, its look and upkeep: the link markers (stairs, cave, gate, trapdoor, edge band and arrow, labels), `catchUp` (a section coming back after game time passed: stock, meals, needs, where workers stand), the 🗺 map card (`tablefolkSections`); the sections themselves are in scenario.js |
| `scenario.js` | the scenario format (`normalizeScenario`), base maps, grid, walk-in buildings, layout engine, goal checker, sections (links, `travel`, `go`, saved states, `here()`, the journey save and resume), banner, 🎯 pane, tactic tester, `freezeLayout` (`tablefolkScenario`) |
| `tabletop.js`, `tile-render.js` | `?tabletop=1` view; 2D tile rendering |
| `welcome.js` | the welcome screen |
| `tabs.js`, `ui-polish.js`, `toast.js`, `confirm-dialog.js`, `library.js`, `recorder.js`, `video-recorder.js` (the ⏺ video button: canvas + mixed voices and sfx), `perf-monitor.js`, `note-svg.js` | UI shell and helpers. `tabs.js`: rail, panes, user / dev mode. Rail buttons are plain (both modes), `dev-only` (pane only in dev mode), `rail-dev` (pane in both modes, on the rail only in dev mode: Messages, Voice, Graphics) or `user-only` (Settings). In user mode `placeForMode()` moves `#chatNameLabel` into Settings and `#viewBtns` into the Adventurer pane (the same nodes, back to the chat dock in dev mode; comment anchors keep their places), so ids stay unique. Buttons with `data-open` in the panel open a pane; `#chatHistoryBtn` in the dock opens Messages. `ui-polish.js` marks `#chatTarget.single` (hidden in user mode) and sets the box's placeholder |
| `builder.js`, `map-editor.js`, `worldgen-browser.js`, `builder-paint.js` | loaded by the world builder page (`server/worldgen-core.js` worldPage), not by the app; builder-paint.js paints pictures with `@tablefolk/paint` |
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
| `tablefolk-world-ready` | loading.js ({ms, timedOut, pending, stages}) | the loading cover lifted: the world is built and shown; the start-up queue goes on |
| `tablefolk-clock` | clock.js, every game quarter hour ({min, day, hour}) | regrowth (uses.js), threats, jobs' daily tallies, package modules |
| `tablefolk-model-call` | jobs.js, world-integration.js ({agentId, kind}) | live-eval --day counts the model calls by kind |
| `tablefolk-scenario-started` | scenario.js ({title, live, sub, section}) | live.js, roofs, director, welcome, package modules (`sub`: a section build; `live` is the world's) |
| `tablefolk-section` | scenario.js `go` ({from, to, title, kind, via, followers}) | the map card; package modules |
| `tablefolk-player-turn` | play.js | nearby characters act; companions follow; pacing |
| `tablefolk-player-chat` | world-integration | pacing |
| `tablefolk-agent-turn` | world-integration | turn counting, mind ticks, goals, pacing |
| `tablefolk-say` | app.js `say()` | `said` goals |
| `tablefolk-attacked`, `tablefolk-defeated` | combat.js | minds, play |
| `tablefolk-approached` | senses | approach notices |
| `tablefolk-thinking` | model-loader-litert | the model's status (thinking, loading) |
| `tablefolk-workflow` | story.js | a workflow ended ({agentId, name, ended, vars}) |
| `tablefolk-flag` | story.js | a world flag changed ({name, value, was}) |
| `tablefolk-menu` | menus.js | a menu choice ({menu, item, agentId, how, text}) |
| `tablefolk-load` | speech-input.js | download progress ({key, label, state, ...}) for load-status.js |
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
`tablefolkEmbed`, `character.library.*`, `tablefolkTrustedCode` (the
folders whose package or skill code the player allowed; packages.js), and
`tablefolkJourney` (a world in sections: the code of the world, the section
the player is in and its state, every visited section's saved state, the
stack of ways back, fetched and generated definitions, unlocked links,
flags, clock and player; written on travel, every 15 s, and before the page
goes; read by `openLink`, which resumes when the code matches unless
`?fresh=1`).

## Sections (scenario.js, sections.js)

- Ids: `''` the top map, a path of subworlds keys (`workings/galleries`),
  `~x<hash>` another scenario (fetched), `<parent>/~g<hash>` a generate spec.
  `sectionDef(id)` is the raw definition (subworld, `journey.defs` for the
  fetched and generated), `expandedDef(id)` the same after `expandBase`,
  `expandGrid`, `expandBuildings` (kept buildings add subworlds and links).
  A key is looked up in the section, then its parents (`targetId`).
- `travel(link)`: locks, fetch ("Travelling..." card), the stack of ways
  back (going to a section already on it truncates it), then `go(id, how)`:
  takes the followers, snapshots the section left (`worldStateData` minus
  `player`, `flags`, `clock`; brain configs of its own characters only;
  `reveal`: darkness.js `save()`; `at`: the game minute), builds the target
  with `playScenarioNow(def, { sub: true, section, restore? })` (a saved
  state goes through the old restore path: the map without agents and
  objects, then `restoreWorldState`), puts the player down (`arrival`:
  `back` frame, `arrive`, the opposite rim for an edge, else the target's
  link back, else `player.at`), makes the way back if none
  (`journey.auto`), restores weapons, the fallen, the explored squares,
  runs `tablefolkSections.catchUp` when 30+ game minutes passed, brings the
  followers, resets the light for the hour, fires `tablefolk-section`.
- A section build never touches `active` (the world: goal, code, turns);
  the checker runs on; story flags are merged (`{...section defaults,
  ...world}`); jobs.js, threats.js and menus.js read `tablefolkScenario.here()`
  (the section's scenario with the carried characters and the world's
  prices, food and menus); `tablefolk-scenario-started` carries the world's
  `live`, so live.js restarts.
- Edges: app.js `playerStep` is wrapped (`hookEdges`): a step off the board
  where an edge link lies travels only when `armed` (the way-out prompt has
  shown for `EDGE_ARM` 500 ms); otherwise it shows the prompt and nudges it.
  In first person `watchPads` sees the held forward key at the rim (3 ticks
  and armed). `watchPads` (150 ms) finds the nearest exit (`nearestExit`: an
  edge within 2.05 squares, a link square within 1.6) and drives
  `tablefolkSections.prompt({text, how, edge, onGo})`; a capture-phase E
  listener travels through `exitNear` before play.js's E (use). sections.js
  draws the prompt (`#exitPrompt`, a button: a tap goes), the threshold band
  along the rim (`link_edge_strip`, brighter while its edge's prompt shows),
  the labels (distance 8 m or within ~7 degrees of the view's centre, faded
  by `visibility`; doors get one through `doorLabel`) and the title card
  (`#sectionTitleCard`) on `tablefolk-section`. `state.edgeLinks` (edge, road square) is read by
  terrain.js (a dirt road past the rim) and surroundings.js (no trees on it).
- Links with `in` get a square of the place (`placeLinks`: free, not beside
  a door, by a wall first, kept in `journey.linkAt`).
- Resume: the top map is built as an empty shell from a minimal state (it
  loads packages, jobs, the clock, the goal), then `go` builds the saved
  section with no snapshot of the shell.
- The goal context adds the other sections' saved characters and props at
  an offset of 100000 per section (never near anything here), and a
  `getBrainConfig` that reads saved configs.

## Voice fallback, placed sound effects, activity bubbles (2026-11-22)

- Voices (app/tts/pocket-tts-manager.js): `engineFailed(id, msg)` on a worker
  crash (`onerror`), a worker `error` that is fatal or comes before `loaded`,
  three failed lines in a row, or 30 s with no audio after a line was asked
  for (`watchdog`). It marks the engine in sessionStorage
  `tablefolkVoiceFailed` (`{id: {reason, at}}`), notes `voice` in diagnostics
  with the reason (`failWhy`: out of memory, device lost, download, no WebGPU),
  sets `why` (Running now), toasts once per engine and switches to
  `lighterThan(id)` (`LIGHTER`: zonos-web/breeze-web/pocket-100m to pocket-18m,
  pocket-18m to `browser`, the browser's speechSynthesis: `speakBrowser`, no
  worker, no spatial gain or lip sync). `chooseEngine` skips failed engines and
  checks a heavy engine chosen on an earlier visit against the budget; one
  picked this session in the Voice pane (`setEngine`: `pickedNow`, clears its
  failure) is always tried. Budget: `zonosWhyNot` / `breezeWebWhyNot` take
  `tablefolkDevice.freeGB` minus `tablefolkGfxGB() - 0.5` (graphics-settings.js:
  the scene's textures, render targets and screen buffers measured every 5 s,
  at least .45 / .8 / 1.6 GB at light / medium / high; the 0.5 is what a brain's
  `needGB` already allows for drawing).
- Sound effects (app/sfx.js): `play(name, pos)` with a position goes through
  its own gain and a `PannerNode` (equalpower, inverse, `refDistance` 1.5),
  the listener set at each sound from the view (at the player's ears, facing
  the camera's forward; z mirrored like spells.js); silent past `MAX_DIST`
  (20 m), fading over the last 6 m. Without a position: a UI sound, straight
  to the master gain. `LEVEL` per effect (doors .07-.08: the Kenney samples are
  full scale), `measure(name)` renders one offline for peak/RMS, `volume`
  (Settings `#sfxVolume`, localStorage `tablefolk.sfx.volume`) scales the
  master; `requested` records each sound's distance.
- Activity bubbles (app.js before `say`): an unvoiced line of a character other
  than the player goes through `activityBubble(g, text, kind)`: 'show',
  'replace' (the shown activity bubble takes the new text) or 'skip' (the line
  still goes to the log, the Messages pane and `g._lines`). `kind`: 'routine'
  (uses.js `act`, sitting, lying, getting up, jobs.js waking), 'event'
  (threats.js thefts), else plain activity. `NOTEWORTHY` (fights, thefts,
  raids) and lines naming the player always show; `focusedOn` (selected, spoke
  to or was spoken to by the player in the last 20 s); `nearOnScreen` (within
  `ACT_NEAR` 6 m and projected inside the viewport); `ACT_GAP` 5 s per
  character. `emitBadge` follows the same rule for other characters (1.5 s
  apart). Setting: localStorage `tablefolkActivityBubbles` ('nearby', 'all',
  'off'; Settings `#activityBubbles`). Bubbles get the class `activity`.
