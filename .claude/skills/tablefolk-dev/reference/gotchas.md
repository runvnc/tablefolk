# Gotchas and lessons learned

Things that cost time once. Grouped by area; the fix is noted where it lives
in the code.

## Code and data flow

- **A new top-level scenario field is silently dropped** unless it is added
  to `normalizeScenario`'s `out` in `app/scenario.js` (`roofs` was missed
  this way until 2026-10-25). Agent and object fields pass through whole.
- **Classic scripts share globals**: a `const` in one file is visible to the
  next. A name used before its `const` line is a TDZ error (`allowedNow` once
  broke a turn; renamed). `terrain-hd.js` has two IIFEs: the second needed
  its own `ASSETS`, or every model silently fell back to procedural shapes.
- **Old code in the browser** almost always means a missing `?v=` bump, or a
  server not restarted after `server/generate.js` versions changed.
- **Inventories may be plain strings** (`"items": ["scroll"]`); code that
  reads `item.name` must accept both (`setPlayer`, the world start once
  crashed on it).
- `generated/` in `.gitignore` matches **any** folder of that name: new
  files under `assets/models/characters/generated/` are ignored (the critter
  files there were added before the rule). New models go elsewhere
  (`meshy/`).
- `follow` passed coordinates as a string and never worked; `give_quest`
  only targeted NPCs; `allowedFor` missed role and skill commands
  (`commandsFor` is the full set). When a command "does nothing", check its
  argument types first.
- Map editor kinds: `'objects'` vs `'object'` once made things from the
  Things tab into characters.
- Notes have one paper shape at three sizes; every other object keeps one
  size (the maintainer rejected shrinking carried things).

## Small models (Gemma 4 E2B)

- They ignore negative instructions ("don't start with 'It sounds like'"):
  phrase them positively.
- They can't count columns in an ASCII map: perception is in words with
  directions and steps (`app/senses.js`).
- Prompt order matters: urgent lines ("Sell it now") go last; the "Stay
  yourself" line goes above the feelings and memories. Re-run the evals after
  any prompt change.
- They answer in prose: plain text is spoken, embedded commands are pulled
  out, `say(Name, "...")` is fixed.
- They repeat and echo: repeat and echo guards, a talk budget, at most two
  lines a turn.
- Unknown emotes made characters dance: unknown ones now read as a frown.
- `feel()` on by default used up turns that should have been speech.
- A lowball sale with no player consent: sales need the buyer's agreement.
- An LLM generator chose `wallHeight` 1 (sunken doors): `checkScenario`
  forces 2.

## Rendering

- Shared geometry with thin-instance colours: `makeGeometryUnique()` or a
  black frame.
- More than 8 lights on a material: the nearest-4 local lights rule.
- Stale bounding boxes after baking made things hover: `refreshBoundingInfo`.
- A cloned `DynamicTexture` never became ready (roofs didn't draw): share one.
- Figures faced backwards (`importedRoot.rotation` reset); Meshy models need
  no turn (an added `ry: Math.PI` made them attack facing away). Check facing
  by rendering an idle model toward the camera.
- The Quaternius wolf's skinning is broken in Babylon (stretched legs): a big
  grey rat stands in.
- Bloom washes out emissive or white things (notes, the torch flame).
- A freeze at start-up was GPU frame time, not the main thread: measure with
  `jank.mjs`.

## Browser and network

- Chrome puts all requests to one host on one HTTP/2 connection: shard
  downloads across hostnames. Range requests are CORS-safelisted.
- OPFS `createWritable` caps writes near 34 MB/s; the sync access handle in a
  worker doesn't.
- The model cache (OPFS, Cache Storage) is per origin: a model downloaded on
  :8000 is not there on :8001.
- The back/forward cache keeps frozen pages alive as worker clients: use a
  Web Lock to know which pages are live.
- The LiteRT worker outliving its page held GPU memory: it is terminated on
  unload and the engine disposed.
- WebGPU in headless Chrome needs the Vulkan flags, and its canvas is black
  in page screenshots.
- A CDN blip on cdn.babylonjs.com shows "This browser cannot run Tablefolk
  yet": reload.

## Shell and machine (the maintainer's setup)

- `pkill -f` / `pgrep -f` match their own shell's command line and can kill
  the shell running them (exit 144). Kill a server by the PID from `ss
  -ltnp` (or `ps -eo pid,args | awk`).
- The Bash tool's shell may be fish or zsh: wrap loops and `$(...)` in `bash
  -c '...'`, and beware backticks inside double quotes.
- `google-chrome` is not on PATH from the tool shell; use
  `google-chrome-stable`.
- Hyprland 0.56 uses Lua dispatch: `hyprctl dispatch
  'hl.dsp.window.float({action="on", window="class:^(tablefolk-test)$"})'`,
  then `resize(...)` and `move(...)`.
- `git push` needs the SSH agent loaded (`ssh-add`; GitHub accepts the
  ed25519 key). Commits need `-c user.name=... -c user.email=...` (no global
  identity on this machine).
- Don't `rm -rf tools/browser-test/tmp`: it holds the tracked `gltf.html`.
