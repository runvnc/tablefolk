# Scenario format

A scenario is one JSON object: the world (board, things, characters, the
player), what the characters may do, and an optional goal. This chapter lists
every field. The map itself can be made four ways: see
[board.md](board.md), [grid.md](grid.md), [map-lines.md](map-lines.md) and
[generated.md](generated.md).

The code that reads it is `normalizeScenario` in `app/scenario.js`: anything
not listed there is dropped (agents and objects keep all their own fields).

## Whole example

```jsonc
{
  "v": 1,
  "title": "The Stubborn Shopkeeper",
  "subtitle": "",                  // banner text when there is no goal
  "intro": "Mog runs the only shop on the island.",   // card shown on load
  "seed": 7,                       // layout randomness: same JSON + seed = same map
  "base": "plain",                 // plain (default) | island | clearing | dungeon
  "size": [23, 17],                // board cells [cols, rows], odd, 5-63
  "lighting": "bright",            // bright | night | dim (night at half ambient)
  "dark": false,                   // fog of war + carried torches
  "walls": "tabletop",             // tabletop | stone | modern | block
  "wallHeight": 2,                 // wall height multiplier (default 1; use 2 with doors)
  "roofs": true,                   // thatched roofs on walled rooms (default: auto)
  "floor": "stone",                // paint the whole floor
  "campfire": true,                // island/clearing: false drops theirs; plain/dungeon: true adds one
  "pathfinding": true,             // false: walks go straight and stop at walls (maze puzzles)
  "earshot": 6,                    // cells within which characters hear and see each other
  "safety": false,                 // true: crisis-line banner if a message mentions self-harm
  "player": { "name": "Traveller", "gold": 20, "items": [], "at": [0, 3] },
  "allowed": ["say", "sell", "inventory", "emote"],   // every character's default commands
  "agents": [{ "id": "mog", "personality": "..." }],
  "grid": [], "legend": {},        // ASCII board (grid.md)
  "objects": [{ "type": "barrel", "x": 2, "z": 1 }],  // exact positions (things.md)
  "paint": [{ "x": 0, "z": 0, "mat": "water" }],      // exact floor tiles
  "map": ["place counter against north_wall"],       // layout lines (map-lines.md)
  "generate": null,                // procedural dungeon or village (generated.md)
  "locked": [],                    // locked doors (things.md)
  "packs": [], "packages": [], "skills": [], "workflows": {},
  "lore": [], "needs": true, "mind": true, "food": [],
  "live": false, "pace": "calm", "director": 5, "events": [],
  "goal": { "text": "Get the magic sword.", "win": { "player_has": "magic sword" } }
}
```

## Top-level fields

| field | meaning | chapter |
|---|---|---|
| `v` | format version, always `1` | |
| `title`, `subtitle`, `intro` | banner title, banner text for open scenarios, the intro card | |
| `seed` | layout randomness (map lines, generated maps) | |
| `base`, `size`, `floor`, `paint`, `campfire` | the board | [board.md](board.md) |
| `lighting` | `bright`, `night`, `dim` | [board.md](board.md) |
| `dark` | fog of war; default true for generated dungeons | [board.md](board.md) |
| `walls`, `wallHeight` | wall style and height | [board.md](board.md) |
| `roofs` | `true` / `false` overrides the automatic thatched roofs | [board.md](board.md) |
| `pathfinding`, `earshot`, `safety` | walking, hearing, crisis banner | [board.md](board.md), [characters.md](characters.md) |
| `grid`, `legend` | ASCII map | [grid.md](grid.md) |
| `objects` | things at exact positions | [things.md](things.md) |
| `map` | layout lines | [map-lines.md](map-lines.md) |
| `generate` | procedural dungeon or village | [generated.md](generated.md) |
| `locked` | locked doors and their keys | [things.md](things.md) |
| `player` | the player (below) | |
| `allowed` | default commands for every character | [characters.md](characters.md) |
| `agents` | the characters (below) | [characters.md](characters.md) |
| `packs` | extra asset packs (object types) | [things.md](things.md) |
| `packages`, `skills`, `workflows` | shareable content | [packages.md](packages.md), [skills-and-roles.md](skills-and-roles.md), [workflows.md](workflows.md) |
| `lore`, `needs`, `mind`, `food` | world facts, hunger on/off, the mind on/off, extra food | [characters.md](characters.md) |
| `live`, `pace`, `director`, `events` | a world that lives on its own | [living.md](living.md) |
| `goal` | win and lose conditions | [goals.md](goals.md) |

## The player

```jsonc
"player": {
  "name": "Traveller", "gold": 20,
  "items": ["rope", { "name": "healing potion", "qty": 2 }],
  "at": [0, 3], "facing": "n",     // or Y / @ in a grid, "in" on generated maps
  "model": "rogue",                // any body below (default rogue)
  "avatar": false,                 // no walking avatar: chat only
  "hp": 20, "wield": "iron sword", // combat.md
  "skills": ["magic"], "skillParams": {}
}
```

Without `at` the player starts at the south of the board.

## Characters (`agents`)

```jsonc
{
  "id": "mog",                     // 1-24 chars [A-Za-z0-9_-]; used in map lines, goals, commands
  "personality": "Mog, a grumpy shopkeeper. The magic sword costs 50 gold, never below 40.",
  "style": "grumpy old shopkeeper",   // what it is, for its prompt
  "model": "villager",             // body (below); default critter
  "allowed": ["say", "sell"],      // its own commands (replaces the top-level list)
  "inventory": { "gold": 0, "items": [{ "name": "magic sword", "qty": 1 }] },
  "at": [0, -3], "facing": "s",    // or a grid digit, a map line, or "in" (generated maps)
  "in": "tavern",                  // generated maps: put it in that place
  "quest": "",                     // a private aim
  "role": "shopkeeper",            // a job (skills-and-roles.md)
  "prices": { "magic sword": [50, 40], "healing potion": 8 },  // asking, or [asking, lowest]
  "skills": ["magic"], "skillParams": { "magic": { "spells": ["spark"], "mana": 12 } },
  "workflow": "haggle", "workflows": ["haggle"],   // workflows.md
  "backstory": "Lost a leg to a troll.",           // always in its prompt
  "knows": ["The old well is dry."],               // facts it brings up when relevant
  "temperament": "brave",          // brave | timid | calm (how it takes being hurt); else guessed
  "hostile": false,                // true: fights the player (combat.md)
  "hp": 10, "wield": "club",       // combat.md
  "ttsVoiceId": "builtin:jean",    // alba azelma cosette eponine fantine javert jean marius
  "thinking": false, "showThoughts": true,
  "chaos": 10,                     // 0-100 randomness (temperature)
  "fireballTemptation": 0          // 0-100, only with spell.fireball allowed
}
```

The personality is the character's whole brief, and the models are small
(Gemma 4 E2B in the browser): plain sentences, hard facts stated outright
(prices, secrets, what it will and won't do), and commands named when the
character should use them ("Use give() to hand something over."). For worlds
that live on their own, write a name sentence and then several short
sentences of what it does ([living.md](living.md)).

Characters with no position go near the middle. Grid digits `1`-`9` are the
agents in order, so reordering `agents` moves them.

## Bodies (`model`)

For agents and the player. The list lives in `FIGURES` in `app/app.js` (and
the generator's `MODELS` in `server/generate.js`); each body's 2D tile is in
`assets/tiles/characters/`.

- **People**: `adventurer adventurer_woman hooded king farmer villager witch
  wizard`; the realistic `woodsman huntress peasant peasant_woman`
  (Quaternius Universal rig, built by `tools/build-figures.sh`); the older
  chibi KayKit `woman rogue knight mage ranger barbarian`; the clay
  `critter` (the default).
- **Monsters**: `skeleton skeleton_warrior zombie goblin kobold orc troll
  skeleton_farmer rat spider wolf bat ghost slime demon giant dragon`.
  `orc goblin skeleton skeleton_warrior troll skeleton_farmer` are the
  grittier Meshy models (`assets/models/characters/meshy/`); the old cartoon
  ones are `orc_classic goblin_classic skeleton_classic
  skeleton_warrior_classic`. `wolf` is a big grey rat for now (the wolf
  file's skinning is broken in Babylon).
- Mindless monsters (skeletons, zombie, rat, spider, wolf, bat, slime,
  ghost, giant, demon, dragon) are hostile by default and never talk.
- Voices default to one that fits the body's gender
  (`defaultVoiceFor` in `app/app.js`; descriptions on the admin page).

## Open-ended example

```json
{
  "v": 1, "title": "The Last Ferry", "seed": 4, "base": "clearing", "lighting": "night",
  "intro": "The last ferry left an hour ago. Two strangers wait at the dock with you.",
  "subtitle": "Find out who they are.",
  "player": { "name": "Traveller", "gold": 5, "items": [] },
  "allowed": ["say", "walk", "emote", "give"],
  "agents": [
    { "id": "ines", "model": "peasant_woman", "style": "tired ferry clerk", "ttsVoiceId": "builtin:fantine",
      "personality": "Ines, the ferry clerk. You missed your own ferry home and are annoyed about it, but you are kind to travellers. You know Bram is lying about being a fisherman." },
    { "id": "bram", "model": "rogue", "style": "nervous man in a wet coat", "ttsVoiceId": "builtin:javert",
      "personality": "Bram. You say you are a fisherman, but you are a smuggler hiding a small chest. You change the subject when asked about the chest." }
  ],
  "map": [
    "paint water x10 row against north_wall",
    "place lamp x2 row beside water",
    "place ines near lamp",
    "place chest at east",
    "place bram beside chest",
    "place crate x3 cluster at west"
  ],
  "goal": null
}
```

More examples: `scenarios/*.json` in the repository (listed in
[links-and-testing.md](links-and-testing.md)) and the 🎯 Scenario pane's
example picker (`EXAMPLES` in `app/scenario.js`).
