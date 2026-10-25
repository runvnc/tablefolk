# Conventions: versions, commits, naming, licences, docs

## Cache busting (`?v=`) — every change

Browsers keep running old code unless the version strings change. Every app
script is loaded with `?v=<date><letters>` (`20261025a`, `...z`, `...za`):
from `app/preflight.js`, from `import ... ?v=` lines in `app/llm_js/`, and,
for the world builder's page, from `server/generate.js`.
`app/preflight.js` itself is loaded from `app/index.html` with its own `?v=`.

After editing, run from the repo root:

```bash
python3 tools/bump.py app/roofs.js app/scenario.js       # the files you changed
```

It bumps each file wherever it is referenced (preflight.js, index.html,
module imports, `server/generate.js`, `app/worldgen-browser.js`, the worker
URL), then every importer up the chain, so all importers share one module
instance; versions never go backwards. Also bump assets that are loaded with
a version (`assets/pack.json?v=`, `style.css?v=` in `index.html`).

`server/generate.js` builds the world builder's page at server start (and
imports `app/procgen.js`), so after bumping `builder.js`, `map-editor.js`,
`worldgen-browser.js` or `procgen.js`, **the server must be restarted** for
the page to load the new versions. The server sends `Cache-Control:
no-cache` for HTML, `preflight.js` and `assets/`.

## Commits

- Commit and push after every set of edits (untested is fine: the history
  is the safety net). Messages describe what changed for a player or author,
  in plain words, often as a list of changes in one line; the subject can be
  long.
- Docs change in the same commit as the feature (below).
- Never commit `.env`, `.admin/`, `generated/`, `work/`,
  `tools/browser-test/results/` (all git-ignored).

## Naming

The project was renamed from geebr.world to **Tablefolk** (domain
tablefolk.world). Identifiers use `tablefolk` without "world"
(`window.tablefolk`, `tablefolkScenario`, `tablefolk-agent-turn`).
Characters are "characters" (default ids `folk1`...), never "geebrs"; the old
clay body is the `critter`. Only the model hosting keeps the old name: the
R2 bucket `geebr-models` and `geebr-models[-2|-3|-4].mindroot.io` (and the
maintainer's checkout folder).

## Licences

The repository is public: commit only assets you may redistribute (CC0, or
CC-BY with credit), each folder with its `LICENSE.txt`. Quaternius's newer
QAL licence (the Bestiary) forbids redistribution: not in the repo. Meshy
models made through fal.ai belong to the project
(`assets/models/characters/meshy/README.md`).

## Where documentation goes

| what changed | document it in |
|---|---|
| anything a scenario author, player, world builder user or server operator sees | the scenario skill chapter for it: `plugins/tablefolk-scenario/skills/tablefolk-scenario/reference/*.md` (the docs site includes these) |
| something the world generator's model should use | also `server/fast-skill.md` (a condensed prompt; keep it short and in step with the skill) |
| internals, how to maintain or test | this skill: `.claude/skills/tablefolk-dev/reference/*.md` |
| a file's own API | its header comment (the convention in every app file) |
| what changed, for the record | `CHANGELOG.md` (newest first, by date) |
| plans, brainstorms, open launch items | `docs/LAUNCH-PLAN.md` |
| a batch of user requests and their status | `docs/REQUESTS.md` |
| browser test tools | `tools/browser-test/README.md` |

The README stays an overview with links; no version history in it.

## Docs site

`docs/` is a VitePress site that renders the skills' chapters as pages
(dynamic routes in `docs/guide/` and `docs/dev/` read the chapter files, so
nothing is copied). See `docs/README.md`. Inside chapters, link other
chapters with plain relative links (`[board.md](board.md)`), and name repo
files in code spans (`app/scenario.js`), not links, so the same text works
in the skill folder and on the site.
