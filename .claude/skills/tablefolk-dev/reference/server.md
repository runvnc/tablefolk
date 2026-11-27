# Server internals

The operator's view (running it, settings, routes, the admin page, limits)
is the scenario skill's `server.md`; this is how it works inside.

| file | job |
|---|---|
| `server/server.js` | `Bun.serve`: static files (403 for `.env`, `.git`, `.admin`; `no-cache` for HTML, `preflight.js`, `assets/`; COOP/COEP headers), the AI proxies, routing. Its header lists the routes. |
| `server/config.js` | settings from the environment and `.env`; `endpoint()` resolves `openrouter` / `openai` / `local` / a URL into base URL, key, model and provider; `DEFAULT_MODELS` |
| `server/settings.js` | `.admin/settings.json` (wins over the environment): endpoints, provider keys, world builder models and guest rights, the visitors' brain, TTS engine, voices; `publicSettings` |
| `server/admin.js` | the admin page (HTML in `PAGE`), password (`Bun.password` hash, cookie sessions), owner detection, `overLimit` rate limits, saved worlds, tile uploads |
| `server/generate.js` | the world builder: page HTML, `generateScenario`, `reviseScenario`, `handleFinish`, `checkScenario`, the in-browser run's options |
| `server/fast-skill.md` | the generator's system prompt (a condensed scenario skill) |

## The world generator

- **Worlds in sections** (2026-11-20; `sections=2..5&shape=levels|region|auto`
  on `/api/generate`, the builder's "World" choice): `generateWorldScenario`
  in `generate.js`. One call for the plan (`app/worldgen-plan.js`
  `planPrompt`: title, intro, pressure, goal, the sections with key, kind,
  about, who and links; read by `readPlan`, which makes keys and ids unique,
  keeps forward links only and links every unreached section from the one
  before it or the hub), then one call per section (`sectionPrompt`: the
  plan as context, map method A with the section's kind, exactly the
  planned ids, no world fields after the first; `shapeSection`; one repair
  round through `checkScenario` with `fresh`, so the living-world rules run
  per section), a failed section built from the plan by procgen
  (`fallbackSection`), then `assemble` (the first section on top with the
  plan's title, intro and goal, the rest as flat `subworlds`, links: an edge
  between two open-rimmed kinds (village, forest, farm: the first free of
  east, west, north, south), else stairs down, a cave mouth or a door `in`
  the place farthest from the start) and `checkWorld` (unknown targets, `in`
  places that do not exist (moved), `at` squares off the reachable floor,
  edges with no reachable rim, arrival rims (an edge into a map with no
  walkable opposite rim becomes a cave mouth), sections no way reaches,
  locked links whose key lies only beyond them, what the goal names and
  whether it is reachable). Sections after the first lose `goal`, and
  `threats` when nobody with a job lives there. Progress events carry
  `label` and `section`/`sections`; `done` adds `report` and `plan`. The
  stream's `cancel()` (the page's Stop) stops it between calls. The
  browser's step-by-step run (`worldgen-browser.js runSections`) asks for a
  plain-line plan (`SECTION: name | kind | about | who: Name/body/job`) and
  per section only the characters (the map is `buildMap`'s procgen), checks
  each through `/api/finish` and assembles and checks with the same module.
- `runModel({label, mode, ep, emit, user, maxTokens, merge})` streams one
  chat completion through `libs/brain/engines/openai.js` (the same client the
  browser uses), reporting thoughts and token counts as server-sent events.
  Replies may be 17000 tokens (reasoning models think at length), changes
  17000-24000; requests time out after 10 minutes. The stream's timeout timer
  is cleared in a `finally`, or it kept Bun alive.
- The system prompt is `fast-skill.md` plus the voice descriptions
  (`voicesText`). One pass, then one repair round if `checkScenario` finds
  problems.
- `checkScenario` fixes what it can and lists the rest: unknown bodies become
  `critter` (`MODELS` is a whitelist: add new bodies there too), mindless
  monsters get a stock personality, voice ids are normalised to `builtin:`,
  unknown commands are reported, `wallHeight` is forced to at least 2 (an
  LLM chose 1 and the player's head went through the lintel), one map method
  only, `generate` is run through `procgen.js` to check places and locked
  doors, goals are checked against what exists. Villains are made hostile by
  the `ENEMY` / `HOSTILE_INTENT` patterns (personality text gave false
  positives, so only intent words count).
- **Living worlds by code** (`server/worldgen-living.js` `livingWorld`,
  called at the end of `checkScenario(s, packVoices, { prompt, fresh,
  notes })` when there are no other problems): a new world (`fresh`: the
  generate path, `/api/finish` with a prompt) that is not talk-only
  (`TALK_ONLY` on the request, or `"talk": true`; a talk scene with a
  `generate` or `map` is collapsed by `oneRoom` into one `grid` room sized
  to the cast, the known small things along its walls, others by legend
  letters) gets `live`, `time`,
  `dayMinutes`; a minimum size; for each talking character a job (the
  jobs' match regexes, `server/jobs-table.js`, generated from
  `jobs/*/job.json` by `node tools/jobs-table.mjs`: run it after editing a
  job), a workplace and a home on the map, its station (anvil, cauldron,
  target, trees, rocks, fields: `KIND_TYPES`/`ADD_TYPE`) and a store beside
  its work, a bed per resident, a food source, a pressure (the archetype's
  mild default threat when none: `DEFAULT_THREAT`), a goal the engine checks
  (`survived_days` + `agents_alive` by default), `allowed` for fighters and
  sellers, and a reachability pass from the player's start (`reach`:
  unreachable homes or workplaces are problems for the model; unreachable
  beds, stores and stations, ones sharing a square, and ones with no free
  side reachable (`reach().side`, four neighbours) are moved to a free cell
  of their place). Each
  repair is a line in `notes`, returned as `repairs` (and saved with the
  generation). Without `generate` a living world is a problem for the model
  (one room); an edit (`fresh` false) only touches a world that is already
  living and generated. procgen.js `safeCell` places objects with `"in"`
  where they block no doorway and leave the room connected, and where the
  new thing and every bed, station and store already in the room
  (`USE_GLYPHS`) keep a free side reachable from the way in, looking one
  thing ahead (a corner that leaves the next thing nowhere is passed over);
  a small room that cannot stay in one piece keeps at least the sides.
  Objects at an `x`/`z` take their squares first; one that lands on the
  map's own furniture or another placed thing moves to a free cell of its
  place (a warning).
- `reviseScenario` (`POST /api/revise`): big fixed layouts keep their
  objects on the server (`mergeKept`); the model answers with edit
  commands (`remove_objects`/`move_objects`/`add_objects`, `paint_area`/
  `add_paint`/`remove_paint`, `update_agents`/`remove_agents`; listed above
  `mergeKept` in `worldgen-core.js`). `mergeKept(s, null)` applies the same
  commands to a small map's answer, so every revision goes through it.
- `POST /api/finish`: the same checks for the in-browser step-by-step run
  (`app/worldgen-browser.js`: Gemma 4 E4B/E2B on LiteRT-LM or Bonsai 2 27B,
  as the menu picks, downloaded on first use) and for the visitor's own
  model; it applies a revision's edit commands first (`mergeKept`, with `kept`
  for a big map).
- **Your own key** (`app/worldgen-own.js`, where `own`): `POST
  /api/worldgen/messages` returns the exact messages, token budget and (for a
  revision) `kept` that `runModel` would use (`systemPrompt`,
  `generateUser`, `reviseRequest`); the page streams the visitor's OpenRouter
  key or OpenAI-compatible URL itself, sends the JSON to `/api/finish`, and
  repairs once with its problems. The key never reaches the server.
  OpenRouter sign-in is OAuth PKCE from the page (`openrouter.ai/auth` with
  an S256 challenge, back with `?code=`, `POST /api/v1/auth/keys` with the
  verifier); "also for the characters" writes the game's endpoint brain
  settings (`tablefolk_llm_endpoint`, `tablefolk_model` = `endpoint`) with
  Gemma 4 26B. Tested against a mock server (repair round, revision, a
  CORS refusal's message) and with intercepted OpenRouter requests.
- **Agent mode** (`app/worldgen-agent.js`, `server/worldgen-tools.js`,
  2026-11-27): the page runs the model; the tools run on the server (`POST
  /api/worldgen/agent {prompt} | {request, system?}` gives the system message,
  `TOOLS` and the user turn; `POST /api/worldgen/tool {scenario, name, args,
  prompt, fresh}` gives `runTool`'s `{scenario, result, log, changed, done}`;
  the Bun server (`handleWorldgenAgent` in `generate.js`) and the Worker
  alike). `runTool` is pure (a copy in, a copy out); `validate` is
  `checkScenario` and `finish` is `finishScenario` (with the request for a new
  world, so the living-world repairs run), so an agent's world passes the
  same checks as a one-answer world. The system message is fast-skill.md
  (`systemPrompt`) behind a short "how to work" with its one-JSON-answer
  line replaced (`agentSystem`). The loop (`loop()`): each step one model
  call; each call's result goes back as a `tool` message (errors included);
  `undo` is the page's own history; at most 60 steps and 2M tokens a request
  (`?agentTokens=`); at 60% of the window the oldest turns are replaced by
  the step log (`compact`); stop, the step cap or a model that stops calling
  tools ends in a `finish` attempt. Backends: `openaiBackend` (OpenAI
  `tools`/`tool_calls`, streamed; `collect()` in `libs/brain/engines/openai.js`
  gathers the call deltas; OpenRouter `usage: {include: true}` for the cost;
  a model that writes calls as text is parsed too) and `localBackend` (in
  the browser, `worldgen-browser.js agentBackend`: Bonsai 2 / 2.5 through
  `generateBonsai2` with the Qwen 3.5 template's tool text and
  `<tool_call><function=...><parameter=...>` calls, results as user
  `<tool_response>` blocks (`renderMessages`); SenseNova the same through
  the wllama runner's messages; Inkling as a raw prompt in its own template
  (`inklingPrompt`: `tool_declare`, `<|message_model|>NAME<|content_invoke_tool_json|>{"name","args"}`,
  `<|message_tool|>NAME`; the runner's `rawPrompt`/`stops`), a thinking block
  kept and the answer asked for again). `parseToolCalls` reads XML calls,
  JSON in `<tool_call>`, Inkling's blocks and bare `{"name","arguments"}`,
  forgiving cut-off ends and trailing commas. Windows: Bonsai as large as
  the card allows (at least 16384), wllama-fast 32768 (`loadModel(key, cb,
  {ctx})`). Follow-ups: `builder.js reviseAI` sends Ask to
  `tfOwnModel.revise(..., {agent: true})` or `tfWorldAgent.change` (revise
  `{where: 'own', agent: true}` / `{where: 'agent'}` from the page's onDone);
  the world may have been edited by hand, so the session's scenario is
  replaced by the builder's. The form's toggle (`agentShow` in the page
  script): `canAgent(model, info)`, remembered per model in
  `tablefolk.worldgen.agent`. Tests: `node tools/worldgen-tools-test.mjs`
  (the tools, the parsers with recorded call texts, the renderers,
  compaction); `tools/browser-test/agent-world-test.mjs` (a real model via
  OpenRouter: build, one follow-up, both saved for `scenario-smoke.mjs`).
- Every result is saved in `generated/` (`recent` feeds the admin page).
- **Sections in the builder** (`app/builder.js`, `app/map-editor.js`): the
  section being edited is `secPath` (subworlds keys down from the top);
  `sectionBar()` switches, adds (`newSection`: at the top level, a
  `generate` spec or an empty floor), renames and deletes (and strips links
  to it). The map editor keeps the map's `links` in its layout (`L.links`,
  written back), draws them (`drawLinks`), and its link tool (L) calls
  `opts.sections()` (keys visible from this section: its subworlds and its
  parents') and `opts.onNewSection(spec)`. `reviseAI` and the critique send
  the section shown without its `subworlds`, prefixed by `worldContext()`
  (the critique gets it as its first history line, since `critiqueRequest`
  has no slot for it), and put the answer back with its subworlds. The form
  passes `sections`/`shape` to `/api/generate` and to
  `tfWorldgen.run(words, cb, { sections, shape })`; ■ Stop closes the
  EventSource or calls `tfWorldgen.stop()`.
- **The builder's agent** ("look it over and improve", `app/builder.js`
  improve()): `POST /api/critique {scenario, mapText, image, round, rounds,
  history}` runs one review on the server's model (`critiqueRequest` /
  `parseCritique` in `worldgen-core.js`) with the map's snapshot as an
  `image_url` part, and asks again with the text only when the model refuses
  images; `/api/worldgen/messages {critique: true, ...}` hands the same
  prompt to the visitor's own model (`worldgen-own.js` critique(), which adds
  the picture). The answer `{verdict, problems, ideas, request}` goes through
  the normal revision. The snapshot and the text map come from the map
  editor (`snapshot()`, `describe()`). The page strips every `data:image`
  string before a model sees the scenario (`lightImages`) and puts them
  back in the answer. Tested 2026-11-15 on the goblin bakery with Gemma 4 26B
  and DeepSeek V4.1 Flash (2 rounds, about 1 minute): good reviews; Gemma's
  revisions dropped the floor and a chest, hence the per-round diff
  (`diffWorlds`) fed back to the next review.
- **Pictures** (`app/builder-paint.js`, `window.tfPaint`): `@tablefolk/paint`
  forced to tiny-sd (Chitra, then the processor, on a graphics-memory
  error), JPEGs sized by kind (`SIZE`), prompts get a style suffix and a
  negative prompt against text. The game draws `picture` objects in
  `app.js` makePicture (a plane with a DynamicTexture on a PBR backing box;
  `noteCell` so getObjects saves the square); `scenario.js` backToWalls
  hangs a picture without `wall` on a wall beside it; `procgen.js` puts
  pictures with `in` on a free square against a wall. Test:
  `tools/browser-test/agent-builder-test.mjs` (snapshot, text, paint bar).

**Keep `fast-skill.md` in step with the scenario skill**: a new field,
object or command the generator should use goes in both (the skill in full,
`fast-skill.md` in a line).

The builder page's HTML is built in `generate.js` with fixed `?v=` versions
of `procgen.js`, `map-editor.js`, `builder.js` and `worldgen-browser.js`
(`tools/bump.py` updates them), and the server imports `app/procgen.js` at
start: restart the server after changing any of them.

## Owners, visitors, limits

A request is the owner's only when it comes straight from this machine with
no forwarding headers; anything through a reverse proxy or tunnel is a
visitor, identified by its real address (`requestIps`). Visitors get the
admin page's guest rights and `overLimit(req, name, n, ms)` per address
(numbers in the scenario skill's `server.md`).

- **Visitors bring their own model** (`config.byoModel`: the admin page's
  World builder section, `BYO_MODEL=1` or `--byo-model`; the admin page's
  saved choice wins over the environment): `settings.js` `guestMay.build(id)`
  and `guestMay.brain(which)` refuse visitors the builder's `server` and
  `cloud` and the characters' proxy (`/api/llm`, `/api/local`) whatever the
  guest checkboxes say (they stay saved, so turning it off brings them
  back). Visitors then build in their browser or with their own key, and
  play with an in-browser brain or their own endpoint. For a public server
  that should not spend the owner's credit.

- **Short links** (`scenarioShortLink` in `server/server.js`, before static files): `/<word>` matching `scenarios/<word>.json` or `scenarios/the-<word>.json`, when no file or folder has that name, redirects (302) to the app with that world. `scenario.js` (`fileLink`) shares the short form.

## The public site on Cloudflare (tablefolk.world)

`cloud/`: a Cloudflare Worker (`tablefolk`) with static assets, deployed
with the maintainer's `wrangler` login. Nothing there holds a key or runs a
model: it is the "visitors bring their own model" server.

```bash
bun cloud/build.mjs            # stage cloud/public/ + write cloud/data.js (both git-ignored)
cd cloud && wrangler deploy    # or: bun cloud/build.mjs --deploy
```

- `build.mjs` copies git-tracked files only (no `.env`, `.admin`, ignored
  files) from the public folders (`app`, `assets`, `scenarios`, `llm_js`,
  `pocket_tts_min`, `packages`, `skills`, `roles`, `plugins`, the landing
  page); a tracked link to a folder (`app/assets -> ../assets`) is copied
  again under its own path, so `/app/assets/...` is a file too (served by
  Cloudflare, not the Worker). `_headers` gives every file the server's
  cross-origin isolation (COOP/COEP) and CORS. `data.js` snapshots what the
  Worker needs from the server: `fast-skill.md`, the voices (admin page
  settings), the world names, the skills and roles. Rebuild before every
  deploy, or the site serves the last build.
- Files are served first; the Worker (`worker.js`) gets only what no file
  matches: `/world/` (`worldPage` from `server/worldgen-core.js`, the code
  the Bun server uses), `/api/worldgen/options` (browser and own key),
  `/api/worldgen/messages`, `/api/finish` (checks, saves nothing),
  `/api/voices|status|skills|roles` from `data.js`, the short links, and
  refusals for the server's AI (`/api/generate` as a "failed" stream event,
  `/api/revise`, `/api/llm`, `/api/local`), speech and `/admin`.
- `server/worldgen-core.js` is the builder's portable part (checks, prompts,
  the page): no file system or settings, so the Worker can bundle it
  (`nodejs_compat` for `node:zlib`). Change the builder there.
- Addresses: `tablefolk.runvnc.workers.dev`, and the custom domains
  `tablefolk.world` and `www.tablefolk.world` (redirects to the bare name),
  once the domain's nameservers point at Cloudflare (set at Namecheap,
  2026-11-09).
- Every page goes out with `Referrer-Policy: no-referrer`: Hugging Face
  answers a request whose Referer is a `*.workers.dev` page with a 404 and no
  CORS header, so every model "failed to fetch" there (2026-11-09; from
  tablefolk.world it worked).
- Free plan limits: 100k Worker requests a day (only the dynamic routes
  count; files are free), 20,000 files and 25 MiB each (1573 files, 149 MB
  at first deploy).
