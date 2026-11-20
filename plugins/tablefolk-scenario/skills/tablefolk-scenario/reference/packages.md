# Packages

Tablefolk is a platform: worlds are built from things anyone can publish.
There are four kinds, all named the same way and loaded straight into the
browser from wherever they are hosted. A whole small game can be one
package plus a scenario: `packages/nightwatch/` is one, and
[api.md](api.md) is the reference for everything it uses.

| Kind | File | What it brings |
|---|---|---|
| **asset pack** | `pack.json` | object types: models, sizes, tags ([things.md](things.md#asset-packs-packs)); bodies and sounds |
| **skill** | `skill.json` | what a character can do: commands, resources, prompt lines ([skills-and-roles.md](skills-and-roles.md)) |
| **role** | `role.json` | a character's job: duty, commands, skills, behaviours ([skills-and-roles.md](skills-and-roles.md#roles)) |
| **package** | `tablefolk.json` | any mix of the above, plus bodies, sounds, jobs, threats, uses, workflows and code, in one download |

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
"bodies": ["dire_wolf"],
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
  "requires": ["npm:tablefolk-ores@1", "../ores/"],
  "items": {
    "smith_anvil": { "file": "models/anvil.glb", "w": 0.9, "h": 0.55, "d": 0.48,
      "loop": "Glow",
      "use": { "text": "{{player}} strikes the anvil. Clang!", "sound": "hit" } },
    "bellows": { "file": "models/bellows.glb", "use": "pump_bellows" }
  },
  "skills": { "smithing": { "commands": { ... }, "recipes": { ... } } },
  "roles": { "blacksmith": { "duty": "...", "skills": ["smithing", "trade"] } },
  "workflows": { "commission": { ... } },
  "jobs": { "picker": { "match": "...", "hours": [7, 17], "steps": [ ... ] } },
  "threats": { "crows": { "who": "bat", "name": "crow", "behaviour": "pilfer", ... } },
  "uses": { "loom": { "types": ["loom"], "anim": "saw", "time": 4, "verb": "weaves at the {t}", "gives": "cloth", "what": "weave" } },
  "bodies": { "dire_wolf": { "model": "models/dire_wolf.glb", "h": 0.95, "clips": { "idle": "Idle", "walk": "Walk" }, "emotes": ["howl"] } },
  "sounds": { "howl": "sounds/howl.ogg" },
  "modules": ["smithy.js"]
}
```

- `requires`: other packages, loaded first (a relative path, `"../ores/"`,
  is a package beside this one).
- `items`: asset-pack items (same fields as `pack.json`), plus:
  - `loop`: an animation clip of the model to play from the start (`true`:
    the first). Clips travel inside the glTF/GLB file.
  - `use`: what E does when the player is next to it. Data form: `text`
    (`{{player}}`), `sound` (a package's `sounds`, or doorOpen, doorClose,
    chestOpen, coins, pickup, hit, miss, step), `anim` (a clip of the thing
    to play; `loopAnim: true` keeps it going), `who` (a clip for whoever
    uses it: `pickup`, or a body's own), `give` (items), `gold`, `once`,
    `state`. Or a name: a module's `uses.<name>`. Clip names may leave out
    the armature prefix (`Rat_Idle` for `RatArmature|Rat_Idle`).
  - `stock`: `{"item": "apple", "count": 6, "regrow": 2, "spent": "..."}`:
    what it holds and gives until spent and how fast one comes back (game
    hours a unit, 0 never). Characters gather from it with `use()` and jobs
    with `gather` ([things.md](things.md#stock-and-stores): the built-in trees,
    barrels, fields and snares are the same table). A scenario object's own
    `"stock": n` sets the count.
  - `gather`: `{"gives": "apple", "time": 3, "anim": "pickup", "verb":
    "picks an apple from"}`: how gathering from it looks.
  - `station`: a kind of use (`anvil`, `cauldron`, `chop`, or a kind from
    `uses`): characters use it like that thing.
  - `use` data (`text`, `anim`, `give`, `gold`, `state`) works for
    characters too: `use(well_of_wishes)` gives the character what it gives
    the player. Give it a `"what"` ("make a wish") to have it offered in the
    characters' prompt ("You could, right here: use(well_of_wishes)"); without
    one it works when named but is not suggested (a suggested `use(anvil)`
    beat a smith's own `forge(dagger)` skill).
- `jobs`: job manifests keyed by id, or a list of `job.json` paths
  ([skills-and-roles.md](skills-and-roles.md#jobs)).
- `threats`: threat kinds keyed by name, in data: `who` (a body or a
  list), `name`, `count`, `when` (`night`, `day`, `any`, `[from, to]`),
  `every` (days), `from` (`edge` or a place id), `behaviour` (`raid`:
  attacks people; `pilfer`: goes for food in the stores, `targets` names
  the items; `rob`: snatches gold and runs), `retreat` (`"dawn half"`),
  `announce` (the narrator's line, `{name}`), `scares` (others hide),
  `hp`. A scenario's `"threats"` names a kind and overrides fields
  ([living.md](living.md#threats-threats)).
- `uses`: kinds characters can use, by name: `types`, `anim`, `time`,
  `verb` (`{t}` the thing, `{a}` the item), `gives`, `stock`, `what` (the
  prompt's word for it).
- `skills`, `roles`: inline manifests keyed by id, or a list of paths
  (`["skills/smithing/skill.json"]`) or references.
- `workflows`: routines ([workflows.md](workflows.md)), usable by every scenario that
  loads the package (a scenario's own win on a name clash).
- `bodies`: characters' bodies, data only: a rigged GLB, its height, its
  clips mapped to the game's names, custom emotes, kind, attack, hp
  ([api.md](api.md#bodies)). A scenario's agents, player and threats use
  them as `"model"`; list their ids in the scenario's `"bodies"` so the
  world builder and `scenario_link.py`, which cannot fetch packages, keep
  them.
- `sounds`: `{"howl": "sounds/howl.ogg"}` (a list is picked from at
  random): `use.sound`, job steps, threats and code play them by name.
- `modules`: code (below).

The example `packages/smithy/` has one of each; `packages/orchard/` is a
data-only package for living worlds: an `apple_tree` with stock that grows
back, a `picker` job and a `crows` threat (used by `scenarios/hearthvale.json`);
`packages/nightwatch/` is a small game (`scenarios/nightwatch.json`; its
`README.md` walks through it).

A scenario's packages last only while it plays: when another scenario
starts, what they brought (items, bodies, sounds, jobs, uses, threat kinds,
workflows, commands, code additions) is forgotten, a module's `dispose()`
runs, and that scenario's own packages load fresh.

## Code

A module is an ES module whose default export receives the game's API and
returns what it adds. [api.md](api.md) is the full reference (every key,
the `api` object, the events); in short:

```js
export default function (api) {   // api.md: things, people, give/take, runAs, spawn, flag, clock,
                                  // playClip, sound, badge, narrator, on, every, light, combat...
  return {
    commands:   { signal: { run(g, args, ctx) { return 'it worked'; }, help: 'signal() - call the militia', allowedBy: 'listed' } },
    behaviours: { hammer: { on: 'tablefolk-player-turn', run(g) { /* ... */ } } },
    cards:      { forge_heat(g, data) { return 'The forge is hot.'; } },
    effects:    { temper(g, value, target, how) { /* ... */ } },
    uses:       { pump_bellows(thing, who, api) { /* ... */ return true; } },
    threats:    { crows(c, ctx) { /* a raider's turn: ctx.spec, ctx.retreat(why), ctx.walkTo(x, z), ctx.despawn() */ return true; } },
    steps:      { refuel(g, step, ctx) { return { done: true, ms: 3000 }; } },
    dispose() { /* the scenario ended */ },
  };
}
```

- `commands`: commands of its own, for characters and the player
  (`/signal`): `"allowedBy": "default"` gives them to every character with
  a mind, `"listed"` only to those whose `allowed`, role or job names them.
  The result reads "worked" or "FAILED" in the actor's next prompt like any
  built-in command.

- `behaviours`: routines run by code on a game event; roles and skills list
  them by name (`"behaviours": ["hammer"]`).
- `cards`: state-card lines; skills name them (`"card": ["forge_heat"]`).
- `effects`: usable in any skill's `effects` list.
- `uses`: what E does on an item whose `use` is that name (for a character
  using it, `who` is that character; return a string to say what it did,
  `{ fail: "why" }` when it could not).
- `threats`: a threat kind's own behaviour, run on each of its raiders'
  turns (return false to fall back to the kind's `behaviour`).

- `steps`: job step kinds; `dispose()`: clean up what is not part of the
  map (lights, particles) when the scenario ends.

A skill can still bring its own `module` ([skills-and-roles.md](skills-and-roles.md)), and both follow
the same rule (below): the same question, the same remembered answer.

**Trust.** Data is safe to load from anywhere, so scenario links can carry
packages. Code is not: a module runs only when it comes from this site, when
the page is opened with `?trustSkills=1`, or when the player said yes to
that package. The first time a package with code loads, the player is asked
("Run code from a package?" with *allow code* or *data only*), and the
answer is remembered for that package's folder in this browser (a skill's
the same way, "Run code from a skill?"). The Library pane lists what is
allowed, with a button to revoke each. The Scenario pane's tactic tests
never ask and never run outside code. With *data only*, everything except
the code still loads, and the game says so plainly (a note naming what
will not work: using the beacon, its commands); using a thing whose `use`
needs that code says so too. *data only* is not remembered: the question
comes again next time.

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
2. **npm**: packages with the keyword `tablefolk` and one of
   `tablefolk-package`, `tablefolk-skill`, `tablefolk-role` or
   `tablefolk-pack` for the kind (without one they are not listed, nor are
   the game's own `@tablefolk/*` libraries). Searched live from the
   browser; listed as `npm:<name>@<version>` (an asset pack as its
   jsDelivr `pack.json` URL, which `"packs"` takes).
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
