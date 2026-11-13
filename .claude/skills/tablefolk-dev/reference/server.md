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
- `reviseScenario` (`POST /api/revise`): big fixed layouts keep their
  objects on the server (`mergeKept`); the model answers with
  `add_objects`, `remove_objects`, `add_paint`.
- `POST /api/finish`: the same checks for the in-browser step-by-step run
  (`app/worldgen-browser.js`: Gemma 4 E4B/E2B on LiteRT-LM or Bonsai 2 27B,
  as the menu picks, downloaded on first use) and for the visitor's own
  model; with `kept` it merges a big map's revision first (`mergeKept`).
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
- Every result is saved in `generated/` (`recent` feeds the admin page).

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
