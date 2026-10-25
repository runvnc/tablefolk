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

## Open items (2026-10-25)

- Mirror the vision model (`gemma-4-E2B-it.litertlm`) on the R2 bucket:
  waiting for the user's decision.
- The calm-pace living-world test with the real model was not re-run after
  the pacing change.
- Walk-in buildings: not tested in first person; the watch tower, bell tower
  and windmill remain closed models.
- More in `docs/LAUNCH-PLAN.md` ("Left for launch").
