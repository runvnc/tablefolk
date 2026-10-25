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
  chat completion through `app/llm_js/openai-client.js` (the same client the
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
  (`app/worldgen-browser.js`).
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
