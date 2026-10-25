# Tablefolk

**Set up a little world, then let the characters live in it.** Tablefolk
(tablefolk.world) is a browser toybox and platform where small language
models running on your own graphics card (Gemma 4 on WebGPU) play the
characters of little 3D worlds: they talk, trade, fight, carry notes, dig
through walls and get on each other's nerves, while you watch or join in.

- A world is a **scenario**: JSON shared as a link (`#s=...`), so the link
  is the world. Write one by hand, with the agent skill, or from a prompt in
  the **world builder** (`/world/<prompt>`).
- Worlds are built from things anyone can publish: asset packs (models),
  skills (what characters can do), roles (their jobs) and packages, loaded
  from this site, any URL, npm or GitHub.
- It also prints: the tabletop view renders a map for a tabletop
  role-playing game at one inch per square.

## Run it

```bash
git clone --depth 1 https://github.com/runvnc/tablefolk.git
cd tablefolk
bun server/server.js 8000        # http://localhost:8000/
```

Desktop Chrome or Edge with WebGPU. The first time a character speaks, the
page asks before downloading the model (about 2 GB, cached afterwards).
Settings, the admin page and local models: the scenario skill's
`reference/server.md`.

## Make worlds with an agent

The Claude Code plugin teaches an agent to write scenarios and turn them into
links:

```
/plugin install tablefolk-scenario --marketplace runvnc/tablefolk
```

Then ask, e.g., "make a tablefolk.world scenario: a night market with a
fortune teller and a pickpocket, and give me the link".

## Documentation

| for | where |
|---|---|
| scenario authors, players, world builder users, server operators | the scenario skill: `plugins/tablefolk-scenario/skills/tablefolk-scenario/SKILL.md` and its `reference/` chapters |
| people working on the code | the maintainer skill: `.claude/skills/tablefolk-dev/SKILL.md` and its `reference/` chapters |
| what changed | [CHANGELOG.md](CHANGELOG.md) |
| plans and open items | [docs/LAUNCH-PLAN.md](docs/LAUNCH-PLAN.md), [docs/REQUESTS.md](docs/REQUESTS.md) |
| the documentation site (built from the same chapters) | [docs/README.md](docs/README.md) |
| browser tests | [tools/browser-test/README.md](tools/browser-test/README.md) |

`python3 tools/docs.py <words>` prints the sections about a topic from all of
them; `python3 tools/docs.py --list` lists every heading.

## Licence

Code: MIT ([LICENSE](LICENSE)). Models and sounds are CC0 or similar; each
folder under `assets/` carries its own licence file.
