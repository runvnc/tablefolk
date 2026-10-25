---
name: tablefolk-dev
description: Maintaining and improving the Tablefolk codebase (tablefolk.world) - its Babylon.js app, LLM character brains, Bun server, world builder, assets, tests and docs. Use when changing or debugging code in this repository, adding objects, bodies, commands or scenario fields, running the browser tests, or updating the documentation.
---

# Working on Tablefolk

Tablefolk is a browser platform where small local language models (Gemma 4
on WebGPU) run the characters of little 3D worlds. Worlds are scenarios:
JSON shared as links. This skill is the maintainer's manual; the scenario
format and everything users see are in the scenario skill
(`plugins/tablefolk-scenario/skills/tablefolk-scenario/`, chapters in its
`reference/`), which is also the user guide.

## Rules that apply to every change

1. **Bump versions**: `python3 tools/bump.py <changed app files>` after every
   edit to a file under `app/`, and restart the server when the world
   builder's files (`builder.js`, `map-editor.js`, `worldgen-browser.js`,
   `procgen.js`) changed ([conventions.md](reference/conventions.md)).
2. **Document in the same commit**: user-visible behaviour in the scenario
   skill's chapter (and `server/fast-skill.md` if the generator should use
   it), internals here, a line in `CHANGELOG.md`, the file's header comment.
3. **Test in a real browser**: `tools/browser-test/` with `?art=1` for
   visuals; never approve a model download; close the test Chrome when done
   ([testing.md](reference/testing.md)).
4. **Public repo**: no secrets (keys live in `.env`), only redistributable
   assets.
5. New scenario fields go through `normalizeScenario` in `app/scenario.js`.

## Start here

```bash
bun server/server.js 8000            # http://localhost:8000/app/  (?dev=1 for dev mode, ?art=1 without the model)
python3 tools/docs.py --list         # every chapter's headings, both skills
python3 tools/docs.py walk-in        # print the sections about a topic
```

## Chapters (`reference/`)

| chapter | read it for |
|---|---|
| [architecture.md](reference/architecture.md) | repository map, how the page starts (script order, globals, `window.tablefolk`), every app file's job, the scenario pipeline, events, coordinates, save keys |
| [conventions.md](reference/conventions.md) | cache busting, commits, naming (Tablefolk, no "geebr"), licences, where each kind of documentation goes, the docs site |
| [testing.md](reference/testing.md) | the browser test kit, headless Chrome, evals and baselines, test traps |
| [rendering.md](reference/rendering.md) | Babylon.js notes: board, instances and the light budget, walls, cutaway, darkness, roofs, characters, notes, cameras, tabletop, tiles |
| [brains.md](reference/brains.md) | engines (LiteRT worker, sight model, endpoint), model downloads, how a turn's prompt is built and its reply parsed, minds, recall, trade, speech |
| [server.md](reference/server.md) | server files, the world generator and its checks, `fast-skill.md`, owners and visitors |
| [assets.md](reference/assets.md) | which file lists which assets, adding an object or a body, model pipelines (figures, Meshy via fal.ai), hosting |
| [gotchas.md](reference/gotchas.md) | lessons learned: data flow, small models, rendering, browser, the maintainer's shell |
| [minds.md](reference/minds.md) | design notes: characters that behave on tiny models (state card, memory, roles, director) |
| [vision-speech.md](reference/vision-speech.md) | design notes: Gemma's image and audio input, senses in words, ideas not built |

Other places:

- `CHANGELOG.md`: what changed, by date.
- `docs/LAUNCH-PLAN.md`: the launch plan, brainstorm and progress log
  (open items at the end); `docs/REQUESTS.md`: request batches and status.
- `tools/browser-test/README.md`: the test tools in full.
- `docs/README.md`: the documentation site.
