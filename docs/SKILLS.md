# Skills

Skills make Tablefolk extensible the way asset packs do for models: a
character "has the skill Magic", so it gets a `cast` command, a spell list,
mana, and a line in its prompt. Anyone can publish a skill as a folder on a
static host, an npm package or a GitHub repo, and a scenario names it.

## Why this shape

Research notes (October 2026):

- **Mod loaders for browser games** (e.g. the BestiaryArena SuperMod loader)
  are plain JavaScript run against a game API, with a hand-kept registry. They
  are flexible, but every mod is trusted code, and a shared link to a scenario
  would be a link that runs a stranger's code.
- **npm-to-ESM CDNs** (jsDelivr, esm.sh, unpkg) already work as a registry
  for the browser: `https://cdn.jsdelivr.net/npm/<pkg>@<version>/<file>`
  serves any published file with CORS, versioned and cached, with no server
  of our own. GitHub repos come for free the same way (`/gh/user/repo@tag/`).
- **Agent skill formats** (a manifest plus instructions, and optional
  scripts) fit how our characters work: what matters to a small model is a
  short prompt line and a command it can call.

So a skill is **data first**: a `skill.json` with commands, tables
(spellbooks, songs), resources, a prompt line and a list of declarative
effects. Data skills are safe to load from anywhere, so they can travel inside
scenario links. A skill can add a **JS module** for anything the effects can't
express; code loads only from the same site (the built-in `skills/` folder)
unless the page is opened with `?trustSkills=1`.

## Using skills in a scenario

```json
"skills": ["magic", "thievery", "npm:tablefolk-skill-alchemy@1", "https://example.com/skills/runes/skill.json"],
"agents": [
  { "id": "vexa", "skills": ["magic", "healing"],
    "skillParams": { "magic": { "spells": ["spark", "fireball", "heal"], "mana": 12 } } }
],
"player": { "skills": ["magic"], "skillParams": { "magic": { "spells": ["heal", "light"] } } }
```

- References: a built-in name (`skills/<name>/skill.json` on this server), any
  URL (a folder or its `skill.json`), `npm:<package>@<version>[/dir]`,
  `gh:<user>/<repo>@<tag>[/dir]`.
- Skill commands are allowed automatically for whoever has the skill; they
  show in that character's command list (with its own spells) and the skill's
  prompt line (with live resources: "Mana: 7/12").
- The player uses them from the chat box: `/cast heal me`, `/steal rook`.
- The Bun server lists the built-in skills at `/api/skills`.

Built in: `magic` (cast: spark, fireball, heal, light, push, frost; mana),
`healing` (bandage; bandages), `thievery` (steal), `bard` (sing; code module),
`trade` (selling: wares and prices on the state card, offers read from the
customer's words, a lowest price, sales only when the buyer agrees).
Example: `scenarios/skills-demo.json`.

## Writing a skill

```json
{
  "id": "magic", "name": "Magic", "version": "1.0.0",
  "description": "Cast spells from a spellbook, paid for with mana.",
  "params": { "spells": ["spark", "heal", "light"] },
  "state": { "mana": 10, "maxMana": 10 },
  "regen": { "mana": 1 },
  "prompt": "You know magic. Your spells: {{spells}}. Mana: {{mana}}/{{maxMana}}.",
  "commands": {
    "cast": { "usage": "cast(spell, target)", "example": "cast(spark, gob1)",
              "help": "cast one of your spells", "variants": "spellbook", "param": "spells" }
  },
  "spellbook": {
    "fireball": { "cost": { "mana": 5 }, "range": 5, "target": "other", "cooldown": 2,
                  "effects": [{ "vfx": "fireball" }, { "damage": 4 }, { "burn": 2 }],
                  "text": "{{me}} hurls a fireball at {{target}}" }
  }
}
```

- `allow`: the game's own commands the skill unlocks (`"allow": ["sell",
  "inventory"]` for trade).
- `card`: state-card lines, by name, rebuilt every turn (a line starting
  with `!` is urgent: it goes at the very end of the prompt, after the words
  it answers, e.g. trade's "Ana offers 45 gold: enough, sell it now"): providers from the
  game (`wares`, `offer` from `app/trade.js`) or the skill's module
  (`cards: { name(g, data) { return 'a line' } }`).
- `behaviours`: code-run routines by name (see Roles below), e.g. `follow`.
- `params`: per-character settings (a scenario overrides them with
  `skillParams`; a number param with the same name as a state value sets it,
  and its max).
- `state` + `regen`: resources, refilled each of the character's turns.
- `commands`: `usage`, `example`, `help` for the prompt. With `variants`, the
  first argument picks an entry of that table (and `param` limits it to the
  character's own list); otherwise the command itself is the entry.
- Entry: `limit` (don't make more of what its `give` effect makes while
  the character already has that many: a smith forged a second dagger it
  didn't need), `cost` (resources), `needs` (items; a seller's materials
  stay off its wares list unless priced), `range` (cells), `target`
  (`other`, `self`, `any`, `none`; `default` when none is named), `cooldown`
  (own turns), `effects`, `text` (`{{me}}`, `{{target}}`).
- Effects: `vfx` (spark, fireball, glow, ring), `damage`, `heal`, `burn` (fire
  on things around the target), `light` ({intensity, range, seconds}),
  `push`, `steal` ({chance}), `give` / `take` (an item for the user), `say`.
- The result line goes back to the character as its action's result, and
  people affected hear about it (damage, theft attempts).

### Code modules

```json
"module": "skill.js"
```

```js
export default function (api) {   // api: state, narrate, findTarget, combat, say, log, getBrainConfig, setBrainConfig, effects
  return {
    commands: { sing(g, [song], { narrate, data, manifest }) { /* ... */ return true; } },
    effects:  { freeze(g, value, target, how) { /* ... */ } },
  };
}
```

A command handler replaces the declarative run for that command; an effect
can be used in any entry's `effects`. See `skills/bard/`.

## Roles

A role is a job template: a `role.json` package named the same ways
(`roles/<name>/role.json` on this site, a URL, `npm:`, `gh:`). It gives a
character a duty line ("Your job: ..."), commands, skills and code-run
behaviours, so an author writes `"role": "shopkeeper"` and nothing else.
The server lists the built-in ones at `/api/roles`.

```json
{
  "id": "shopkeeper", "name": "Shopkeeper", "version": "1.0.0",
  "description": "Runs a shop: sells its wares at its prices.",
  "duty": "You run a shop. Greet customers, say what you sell ...",
  "commands": ["say", "inventory"],
  "skills": ["trade"],
  "skillParams": { "trade": { "prices": { "bread": 2 } } },
  "temperament": "gruff",
  "behaviours": []
}
```

- `duty`: `{player}` becomes the player's name.
- `skills` / `skillParams`: skills it brings, with defaults; the agent's own
  `skills` are added and its `skillParams` win.
- `temperament`: used when the agent names none (mind.js).
- `behaviours`: routines run by code with no model call. Built in: `follow`
  (keeps up with the player after each move; the `companion` role). A skill
  module adds more with `behaviours: { name: { on: 'tablefolk-player-turn',
  run(g) {} } }`.

Built in: `shopkeeper` and `innkeeper` (trade), `guard`, `quest_giver`,
`companion` (follow), `villager`.

Roles, skills and asset packs are the three kinds of shareable package:
what a character's job is, what it can do, and what things look like.

## Publishing

- **Static folder**: any host with CORS; reference it by URL.
- **npm**: a package with `skill.json` at its root (`"files": ["skill.json",
  "skill.js"]`), published normally; reference `npm:<name>@<version>`.
  Suggested name prefix: `tablefolk-skill-`.
- **GitHub**: tag a release; reference `gh:user/repo@tag/path`.

Skills and roles can also travel inside a package (`tablefolk.json`)
with models, workflows and code: docs/PACKAGES.md, which also covers how
they are found (the official list, npm, GitHub) and the trust rules for code.

## Ideas next

- Skills that start their package's workflows on cue (a "merchant" skill
  with a haggle routine).
- Passive skills: modifiers instead of commands (armour that reduces damage,
  "keen eyes" that widens the senses' radius).
- Learning: a `teach(skill)` command so characters pass skills on, with
  `skillParams` as the curriculum.
