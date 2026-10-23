# Packages

Tablefolk is a platform: worlds are built from things anyone can publish.
There are four kinds, all named the same way and loaded straight into the
browser from wherever they are hosted:

| Kind | File | What it brings |
|---|---|---|
| **asset pack** | `pack.json` | object types: models, sizes, tags (docs/SCENARIOS.md 4c) |
| **skill** | `skill.json` | what a character can do: commands, resources, prompt lines (docs/SKILLS.md) |
| **role** | `role.json` | a character's job: duty, commands, skills, behaviours (docs/SKILLS.md "Roles") |
| **package** | `tablefolk.json` | any mix of the above, plus workflows and code, in one download |

## Naming one

| Reference | Where it comes from |
|---|---|
| `smithy` | built in: `packages/smithy/tablefolk.json` on this site (`skills/<name>/`, `roles/<name>/`) |
| `https://example.com/smithy/` | any URL with CORS (a folder gets the file name added) |
| `npm:tablefolk-smithy@1.2.0` | npm, through jsDelivr |
| `gh:user/repo@v1.0/smithy` | a GitHub repo at a tag or branch, through jsDelivr |

A scenario lists what it uses:

```json
"packages": ["smithy", "npm:tablefolk-smithy@1"],
"skills": ["magic"],
"packs": ["https://example.com/my-pack/pack.json"],
"agents": [{ "id": "bram", "role": "blacksmith" }]
```

## tablefolk.json

Every section is optional; paths are relative to the file.

```json
{
  "id": "smithy", "name": "Smithy", "version": "1.0.0",
  "description": "A blacksmith role, a smithing skill, an anvil to strike.",
  "author": "you", "license": "CC0-1.0",
  "requires": ["npm:tablefolk-ores@1"],
  "items": {
    "smith_anvil": { "file": "models/anvil.glb", "w": 0.9, "h": 0.55, "d": 0.48,
      "loop": "Glow",
      "use": { "text": "{{player}} strikes the anvil. Clang!", "sound": "hit" } },
    "bellows": { "file": "models/bellows.glb", "use": "pump_bellows" }
  },
  "skills": { "smithing": { "commands": { ... }, "recipes": { ... } } },
  "roles": { "blacksmith": { "duty": "...", "skills": ["smithing", "trade"] } },
  "workflows": { "commission": { ... } },
  "modules": ["smithy.js"]
}
```

- `requires`: other packages, loaded first.
- `items`: asset-pack items (same fields as `pack.json`), plus:
  - `loop`: an animation clip of the model to play from the start (`true`:
    the first). Clips travel inside the glTF/GLB file.
  - `use`: what E does when the player is next to it. Data form: `text`
    (`{{player}}`), `sound` (doorOpen, doorClose, chestOpen, coins, pickup,
    hit, miss, step), `anim` (a clip to play; `loopAnim: true` keeps it
    going), `give` (items), `gold`, `once`, `state`. Or a name: a module's
    `uses.<name>`.
- `skills`, `roles`: inline manifests keyed by id, or a list of paths
  (`["skills/smithing/skill.json"]`) or references.
- `workflows`: routines (docs/SCENARIOS.md), usable by every scenario that
  loads the package (a scenario's own win on a name clash).
- `modules`: code (below).

The example `packages/smithy/` has one of each.

## Code

A module is an ES module whose default export receives the game's API and
returns what it adds:

```js
export default function (api) {   // api: state, meta, narrate, findTarget, combat, say, log,
                                  // getBrainConfig, setBrainConfig, effects, playClip, toast, addMemory
  return {
    behaviours: { hammer: { on: 'tablefolk-player-turn', run(g) { /* ... */ } } },
    cards:      { forge_heat(g, data) { return 'The forge is hot.'; } },
    effects:    { temper(g, value, target, how) { /* ... */ } },
    uses:       { pump_bellows(thing, who, api) { /* ... */ return true; } },
  };
}
```

- `behaviours`: routines run by code on a game event; roles and skills list
  them by name (`"behaviours": ["hammer"]`).
- `cards`: state-card lines; skills name them (`"card": ["forge_heat"]`).
- `effects`: usable in any skill's `effects` list.
- `uses`: what E does on an item whose `use` is that name.

A skill can still bring its own `module` (docs/SKILLS.md), and both follow
the same rule.

**Trust.** Data is safe to load from anywhere, so scenario links can carry
packages. Code is not: a module runs only when it comes from this site, when
the page is opened with `?trustSkills=1`, or when the player said yes to
that package. The first time a package with code loads, the player is asked
("Run code from a package?" with *allow code* or *data only*), and the
answer is remembered for that package's folder in this browser. The Library
pane lists what is allowed, with a button to revoke each. Tests never ask
and never run outside code. With *data only*, everything except the code
still loads.

## Finding packages

The Library pane (dev mode) lists them, from three places:

1. **The official list**: `registry/index.json` in this repository. The
   built-in entries are rebuilt by `node tools/registry.mjs`. To list
   yours, add an entry to `community` in a pull request:

   ```json
   { "kind": "package", "ref": "npm:tablefolk-smithy@1.0.0", "name": "Smithy",
     "description": "A blacksmith role, a smithing skill, an anvil to strike.",
     "author": "you", "homepage": "https://github.com/you/tablefolk-smithy" }
   ```

   `node tools/registry.mjs --check` fetches every community entry and
   checks its manifest (run it when reviewing a PR).
2. **npm**: packages with the keyword `tablefolk`, plus `tablefolk-package`,
   `tablefolk-skill`, `tablefolk-role` or `tablefolk-pack` for the kind
   (package when none). Searched live from the browser; listed as
   `npm:<name>@<version>`.
3. **GitHub**: repos with the topic `tablefolk` (and a kind topic as above)
   with the manifest at the repo root; listed as `gh:<owner>/<repo>@<branch>`.
   Only when "GitHub too" is ticked, since GitHub allows 10 searches a
   minute without a login. Results are cached for ten minutes.

Community entries from npm and GitHub are not reviewed; the official list is.

## Publishing

- **npm**: `package.json` with `"keywords": ["tablefolk", "tablefolk-package"]`
  and `"files": ["tablefolk.json", "models", "*.js"]`; `npm publish`.
  Suggested names: `tablefolk-<name>`.
- **GitHub**: put `tablefolk.json` at the root (or a folder, referenced
  with `/folder`), add the topics `tablefolk` and `tablefolk-package`, and
  tag a release.
- **Any static host** with CORS: reference the URL.

Models in a package should be your own or under a licence that allows
redistribution (CC0 or CC-BY with credit in the description).
