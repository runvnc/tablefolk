# The documentation site

A [VitePress](https://vitepress.dev) site (Vite-based, runs under Bun or
Node) built from the same Markdown files the agent skills use, so there is
one copy of every chapter:

| page | source |
|---|---|
| `/guide/` | `plugins/tablefolk-scenario/skills/tablefolk-scenario/SKILL.md` (from line 5, after the skill's front matter) |
| `/guide/reference/<chapter>` | `plugins/tablefolk-scenario/skills/tablefolk-scenario/reference/<chapter>.md` |
| `/dev/` | `.claude/skills/tablefolk-dev/SKILL.md` |
| `/dev/reference/<chapter>` | `.claude/skills/tablefolk-dev/reference/<chapter>.md` |
| `/changelog` | `CHANGELOG.md` |
| `/LAUNCH-PLAN`, `/REQUESTS` | the files in this folder |

The chapter pages are dynamic routes (`guide/reference/[chapter].paths.mjs`
reads the folder); the overview pages and the changelog use `<!--@include-->`.
The sidebar follows each `SKILL.md`'s chapter table
(`.vitepress/config.mjs`). Restart the dev server after adding a chapter.

```bash
cd docs
bun install          # or npm install
bun run dev          # http://localhost:5173
bun run build        # static site in docs/.vitepress/dist
```

Writing chapters so they work in both places: link other chapters with
relative links (`[board.md](board.md)`), and name repository files in code
spans (`app/scenario.js`), not links.

Not built or deployed yet.
