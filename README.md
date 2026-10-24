# tablefolk.world v14 — Turn-Based LLM Toybox

Based on v13.2 stackfix.

## Scenarios

A scenario is a small world (map, characters, allowed commands, optional goal)
written as JSON and shared as a link: the JSON is compressed into the URL hash
(`#s=...`), so nothing is stored on a server. Built-in examples are in
`app/scenario.js` (`EXAMPLES`); the 🎯 Scenario pane in the app is the editor
(examples, JSON and map-line boxes, Play, Copy link, From current world,
Generate, Test tactics). Full format reference: [docs/SCENARIOS.md](docs/SCENARIOS.md).

**Agent skill.** `plugins/tablefolk-scenario/skills/tablefolk-scenario/` teaches a coding agent to write
scenarios and turn them into links (`scripts/scenario_link.py`). In Claude Code:

```
/plugin install tablefolk-scenario --marketplace runvnc/tablefolk
```

Then ask, e.g., "make a tablefolk.world scenario: a night market with a fortune
teller and a pickpocket, and give me the link".

## Packages

Worlds are built from things anyone can publish: asset packs (models),
skills (what characters can do), roles (their jobs) and packages
(`tablefolk.json`: any mix of those, plus workflows and code), loaded in the
browser from this site, any URL, npm or GitHub. The Library pane finds them
(the official list in `registry/index.json`, plus npm and GitHub tagged
`tablefolk`). See [docs/PACKAGES.md](docs/PACKAGES.md) and
[docs/SKILLS.md](docs/SKILLS.md).

## New in v14

- Turn-based command loop for LLM control.
- One command runs, physics resolves for a short window, then the world settles/freezes.
- Characters no longer use physics impulse walking by default; they step tile-by-tile with deterministic tween motion.
- Character colliders are animated bodies, reducing sliding/momentum drift.
- Props still use physics impulses during a turn, but velocities are zeroed at turn end.
- New UI: turn mode checkbox, turn status, manual settle button.
- Public API kept and extended:

```js
window.runCommand("walk n")
window.executeCommand({ kind: "spell", spell: "fireball" })
window.stepTurn({ kind: "push" })
window.endTurn()
window.getAgentPerception()
```

## Run

```bash
cd tablefolk
python3 -m http.server 8080
```

Open http://localhost:8080


## v14.1 fix

- Fixed turn-based walking snapping back to the original position.
- Character position is now committed to an authoritative `logicalPos` at the end of each tile step.
- The invisible Havok character collider is treated as a follower of the logical tile position instead of the source of truth.
- Public API unchanged: `window.runCommand`, `window.executeCommand`, `window.stepTurn`, `window.endTurn`, `window.getAgentPerception`.

## v14.2 fix

- Characters now rotate to face the direction they are walking.
- Facing is updated for both KayKit rigged characters and fallback procedural characters.
- Perception grid now uses simple line-of-sight occlusion.
- Walls, stone blocks, rubble/rocks, and large solid building pieces block sight.
- The wall/blocking cell itself remains visible, but tiles/objects behind it become `?` / unknown.

Run command remains:

```bash
cd tablefolk
python3 -m http.server 8080
```


## v14.3 patch
- Facing-aware perception cone added
- 1-tile awareness bubble added
- LOS still blocks vision through walls


## v14.4 patch
- Hidden/unseen cells render as blank spaces
- Perception text grid rotates with facing so the top is always forward
- Rows behind the agent stay mostly blank instead of filled with unknown markers


## v14.5 patch
- Perception panel is fixed north-up again
- Hidden cells remain blank spaces
- Facing still controls what is visible, but the text UI no longer rotates with the agent


## Server (Bun)

```bash
bun server/server.js 8000            # http://localhost:8000/app/
bun server/server.js 8000 --litert   # also start `litert-lm serve` (native Gemma on this machine)
```

Besides the static files it serves:

- `/api/llm/v1/...`: an OpenAI-compatible proxy for the characters' "endpoint"
  brain (pick "OpenAI-compatible endpoint" in the model menu). Settings:
  `LLM_BASE_URL` (a URL, `openrouter` or `local`), `LLM_API_KEY`, `LLM_MODEL`.
- `/api/local/v1/...`: the same, to `litert-lm serve` on this machine.
- `/world/<prompt>`: writes a scenario from the prompt and opens it, e.g.
  `http://localhost:8000/world/a+small+dungeon+with+a+sorceress+and+goblins`.
  A built-in agent runs a condensed scenario skill (`server/fast-skill.md`) in
  one pass (plus one repair round if the checks fail), with any of the three
  map methods: `?mode=generate` (procedural dungeon/village, characters put in
  rooms by role), `?mode=grid` (ASCII map), `?mode=map` (layout lines), or
  the default `auto`. `?endpoint=local` uses `litert-lm serve` (Gemma 4 E4B),
  `?model=` any other model; `?art=1` / `?brain=endpoint` are passed on to the
  app. The page is the world builder (prompt form, live progress); start the
  server with `--world-loading` (or `WORLD_VIEW=loading`) to show players a
  plain loading screen with a progress bar instead (`?view=builder|loading`
  picks per link). Settings: `GEN_BASE_URL` (`openrouter`, `openai` for
  api.openai.com, `local` or a URL), `GEN_API_KEY`, `GEN_MODEL` (default
  `deepseek/deepseek-v4.1-flash-1017` on OpenRouter, `gpt-6-luna` on OpenAI);
  `OPENAI_API_KEY` is the OpenAI key, and the admin page can set the provider
  and both keys. Timings seen: 6-14 s with gpt-6-luna,
  ~22 s with local E4B on an RTX 2060. Every result is saved in `generated/`.
  `/api/generate?prompt=...` returns the JSON (`&stream=1` for progress events).
  The page shows the model's thoughts and a token count while it works.
  **Step by step in the browser** (`?how=browser`, the form's second menu):
  the local Gemma this browser last loaded (LiteRT, it must already be
  downloaded) writes it in small steps, `app/worldgen-browser.js`: a plan
  (text), the map (a little JSON; code builds it with procgen.js, or layout
  lines outdoors), a review of the map that was built (its rooms and contents
  and the map as text; it may add things), the characters, then the server's
  checks (`POST /api/finish`, the same as for a generated scenario) with up to
  two fix rounds. 20-45 s with E2B on an RTX 2060.
  `tools/browser-test/worldgen-test.html?prompt=...` runs it on its own.

**Admin page** (`/admin`): the first start asks for an admin password in
the terminal (without a terminal it makes one up and writes it to
`.admin/initial-password.txt`); only a hash is kept, in `.admin/password.json`.
Delete that file (or start with `--reset-admin`) to set a new one. The page
has an overview (status, links to the world for players, the world in dev
mode `/app/?dev=1`, the world builder), both LLM endpoints with a test button,
the world builder's models (cloud models offered, what guests may use) and
what `/world/` shows players, the players' speech engine (Pocket-TTS small, 18M
parameters, about 40 MB, English: the default; or the 100M one, about 120 MB,
five languages; each player can pick another in the app's voice pane), voice genders and descriptions (used to cast voices
and by the generator; also `/api/voices`), recent generations and the saved
worlds in `generated/` (play, play in dev mode, edit in the builder, delete),
and a password change. Its settings live in `.admin/settings.json` and win
over the environment. The `.admin` folder is never served and is git-ignored.

**Where the builder's model runs**: the prompt form offers *in this browser*
(Gemma on the visitor's GPU, step by step), *on this server* (the local model
server, `litert-lm serve`) and *cloud* (the generator endpoint, OpenRouter by
default), each with its models (`GET /api/worldgen/options`). An admin can use
all of them and type any model; guests get what the admin page allows (which
places, which cloud models), and the server refuses the rest.

**World builder workspace**: when a world is ready the builder stays on the
page with the **map editor** (`app/map-editor.js`): the board drawn from 2D
tiles on a canvas (no 3D, so it is instant even for big maps). Drag monsters,
people and things from the palette onto the map (or pick one and click),
drag them around, select one to change it on the right (name, body,
hostile or talking, hit points, weapon, gold, items, brief; a chest's gold and
items, a note's text), draw walls (W, drag; on a wall it removes), make doors
and lock them with a named key (D), paint floors (G), erase (X), undo and
redo (Ctrl+Z / Ctrl+Shift+Z); wheel to zoom, drag the floor to pan, F to fit.
The first edit turns any layout (generated rooms, a drawn grid) into fixed
positions (`size`, `objects` with walls and doors, `paint`, everyone's `at`,
`locked` by position); a world laid out by "map" lines is laid out once by
the tabletop page in a hidden frame first. Below the map: **ask the AI for
changes** (`POST /api/revise` with the same model choice, **undo**), and the
story, player, characters, layout and raw JSON as forms. **Play**, **play in
dev mode**, **print / tabletop** (`/app/?tabletop=1`: PNG, print at one inch
per square, a screen laid flat, move things there too), **copy link**,
**download**. `?go` opens the world straight away; `/world/?edit=<file>`
(admin) edits a saved world.

**Tiles** (`assets/tiles/`): a picture of every object, body and floor, seen
from the south about 58 degrees up (floors straight down), on a transparent
background, 128 pixels per square, rendered from the 3D models by the app
itself: `/app/?tabletop=1&tiles=1[&only=a,b]` (`app/tile-render.js`), saved by
`tools/browser-test/render-tiles.mjs`. `tiles.json` lists each one with its size
and anchor (where the middle of its square, on the floor, falls in the
image). Anything without a tile (a new pack item, a new body) is rendered on
the spot by the map editor in a hidden frame, kept in that browser, and for a
logged-in admin saved on the server (`POST /api/admin/tiles`).

Settings come from the environment or `.env` (`OPENROUTER_API_KEY=` is used for
OpenRouter). The server listens on 127.0.0.1 only unless `HOST` is set, since
the proxy spends your key. Native local models: `uv tool install litert-lm`,
then `litert-lm import --from-huggingface-repo litert-community/gemma-4-E4B-it-litert-lm gemma-4-E4B-it-gpu.litertlm gemma4-e4b`.

## Living worlds (October 2026)

- **Welcome**: the app opens on a choice of worlds (`scenarios/showcase.json`)
  and a way to build your own; the "worlds" button brings it back.
- **Let them live** (P): everyone acts on their own while you watch or join in;
  a world can start that way (`"live": true`). The **director** makes small
  things happen now and then (a note under the door, a rat, a knock), plus the
  world's own events and timed turning points. See docs/SCENARIOS.md 2h.
- **Sight**: with the "Gemma 4 E2B with sight" brain (the full multimodal
  model, 2.6 GB, on the LiteRT-LM nightly's vision encoder; a 6 GB graphics
  card), `look` sends a picture from the character's own eyes, described in
  its own voice and shown to the player. The endpoint brain does the same
  when its model takes images (Brain options > vision).
- Characters give each other things and gold, walk to each other, pick up and
  read notes, dig through walls and build them; a menu of what they could do
  right here in every prompt.
- Plan, brainstorm and progress: docs/LAUNCH-PLAN.md.

## v14.6 (current)

- Speaking animation now driven by TTS events: `speechstart`/`speechend` from Pocket-TTS set `g.speaking`, play the `talk` rig animation for the real audio duration, and oscillate the head bone Y-scale (~14Hz) as a mouth flapping effect.
- `say()` calls `tablefolkTTS.speak()` when TTS is loaded; falls back to a 900ms talk pose otherwise.
- Speech bubbles now use a fixed 42px screen-space offset above the projected head (was fixed world-space 1.7 units that drifted with ortho zoom). APNG recorder unaffected.
- All 8 KayKit animation packs are loaded (General, MovementBasic, MovementAdvanced, CombatRanged, CombatMelee, Tools, Simulation, Special).
- New `emote(name)` command: dance, laugh, sit, wave, clap, cheer, sleep, bow. Mapped to real KayKit clips (Cheering, Sit_Floor_*, Lie_*, Waving, Interact, Push_Ups, Sit_Ups, Use_Item).
- LLM agents see `emote(name)` in their command examples and can use it like any other command.
- Dead root-level duplicates removed (`app.js`, `style.css`, `recorder.js` at repo root; live copies under `app/`).

