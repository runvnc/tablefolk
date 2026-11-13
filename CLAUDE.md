# Tablefolk: notes for Claude

**Read the maintainer skill first**: `.claude/skills/tablefolk-dev/SKILL.md`
(rules, and a table of chapters to read only as needed). The scenario format
and everything users see: `plugins/tablefolk-scenario/skills/tablefolk-scenario/`.
`python3 tools/docs.py <words>` prints the doc sections about a topic.

## Working with this user

- **Commit and push after every set of edits** (untested is fine; the user
  wants everything saved incrementally). Commit with
  `git -c user.name="Jason Livesay" -c user.email="runvnc@gmail.com" commit`
  (no global identity here). If a push fails on the key, ask the user to run
  `ssh-add`.
- **Bump versions** after every app edit: `python3 tools/bump.py <files>`.
  After changes to `server/generate.js` or the world builder's scripts the
  server must be restarted; the user restarts their own.
- **Ports**: the server on 8000 is the user's (`bun server/server.js 8000`):
  never kill it. Test on 8001 (`bun server/server.js 8001`) and stop it
  afterwards by its PID from `ss -ltnp` (`pkill -f` kills its own shell).
  The browser model is cached only for the :8000 origin; when 8000 is free, a
  temporary test server there is fine, stopped afterwards.
- **Browser tests**: headless (`HEADLESS=1 tools/browser-test/launch-chrome.sh`),
  `?art=1` for visuals, never approve a model download, and always
  `node tools/browser-test/close.mjs` at the end: the user needs the GPU
  (RTX 2060, 6 GB).
- **Secrets**: `.env` holds `OPENROUTER_API_KEY`, `FAL_API_KEY` and any
  other provider keys. Never print them.
- **Ask first** before paid fal.ai calls, heavy local GPU work, model
  downloads, and any upload to the R2 bucket (`geebr-models`).
- **Public repo**: only redistributable assets (no Quaternius QAL / Bestiary).
- Objects keep one size (the user rejected shrinking carried things); notes
  are the only exception.
- The machine: CachyOS with Hyprland (Caelestia), fish shell (wrap loops in
  `bash -c`), screenshots in `~/.cache/caelestia/screenshots/`. Repo at
  `/mnt/files/geebr.world`; start sessions there so this file loads.
- The user notes that Claude finishes features far faster than it estimates:
  estimate in minutes, and say what usually takes longer (visual test-fix loops,
  waiting on the model).
- Record the user's request batches in `docs/REQUESTS.md` when asked; log
  changes in `CHANGELOG.md`, never in the README.

## Public site (2026-11-09)

- tablefolk.world is a Cloudflare Worker with static files (`cloud/`):
  `bun cloud/build.mjs --deploy` after changes (only git-tracked files ship:
  commit new files first). It runs no AI: visitors use in-browser models or
  their own key/server. Details: the maintainer skill's `server.md`, "The
  public site on Cloudflare".
- The world builder's portable code is `server/worldgen-core.js` (shared by
  the Bun server and the Worker); "your own key" is `app/worldgen-own.js`;
  `--byo-model` / `BYO_MODEL=1` closes the server's AI to visitors.
- Players see what runs and why in Settings ("Running now") and the "This
  device" pane (`app/diagnostics.js`, `tablefolkDiag.note`).
- This laptop's USB Ethernet adapter drops its link every few minutes
  (2026-11-09): long downloads in tests can fail with ERR_NETWORK_CHANGED.

## Libraries (2026-11-13)

- `libs/` holds the standalone `@tablefolk/*` packages the game is built
  on (device, brain, decider, voice, hear, menus, models): `libs/README.md`.
  No game globals and no `?v=` there; run `node tools/libs.mjs check` after
  editing them. Publishing (`node tools/libs.mjs publish`) needs `npm login`
  and the `tablefolk` npm org; ask before publishing.
- The R2 mirror is used only on tablefolk.world (and the game on localhost).

## Open items (2026-11-01)

- The picker's Hugging Face models and Pocket-TTS are mirrored on R2
  (done 2026-11-12; assets.md, Hosting). Hidden models still load from HF.
- Walk-in buildings: checked in first person 2026-10-31 (roof kept as the
  ceiling); the watch tower, bell tower and windmill remain closed models.
- Local helpers: `docs/LOCAL-HELPERS-PLAN.md` (Breeze PR
  HoppouAI/Breeze-TTS-2.cpp#17 open; Windows scripts untested; R2 mirror
  of LFM3 waits for the user).
- Light dynamic props (chairs, stools, crates) can be flung across the map
  when a walker's path goes through their cell (an ANIMATED collider pushing
  them; seen 2026-11-01 in `uses-test.mjs`). Chests, anvils and cauldrons are
  static now; the rest wants paths that go around them, or a gentler push.
- Using things (`app/uses.js`, 2026-11-01): Gemma E2B 10/15 on
  `evals/uses.json`; fetching from a chest (open, take, give in two turns)
  0/3. A visual day/night cycle is not built: routines follow the
  scenario's static `night` lighting.
- Speech input (2026-11-01): Underdog Bark in the browser is the default; the 🎤 button names the recogniser. Breeze starts on demand (server.js startBreeze); window view is an off-axis projection now (rendering.md)
  (`vision-speech.md` has the measurements and the ranked options). Not
  tried yet: Chrome's on-device recognition (installing its language pack
  wants the user's OK) and LFM3-Audio-2B on llama.cpp (a download).
- More in `docs/LAUNCH-PLAN.md` ("Left for launch").
