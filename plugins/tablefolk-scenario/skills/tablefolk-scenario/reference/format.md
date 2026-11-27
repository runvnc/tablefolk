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
  "showIntro": false,                  // no intro card: straight into the world (the link can override: ?intro=1)
  "speech": false,                // no character speaks aloud in this world (one character: "ttsEnabled": false on it)
  "memory": false,                // no meaning-based recall: the memory model (EmbeddingGemma) is not loaded
  "view": "first",                 // the camera at the start: follow (the default: behind you, wheel zooms toward the pointer, Escape undoes it) | overview (free camera) | first (first person); ?view= overrides
  "seed": 7,                       // layout randomness: same JSON + seed = same map
  "base": "plain",                 // plain (default) | island | clearing | dungeon
  "size": [23, 17],                // board cells [cols, rows], odd, 5-63
  "lighting": "bright",            // bright (morning) | dim (dusk) | night (moonlit)
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
  "menus": {}, "flags": {}, "facts": {},   // characters.md (menus), story.md
  "brain": "none",                         // optional: no language model (characters.md)
  "lore": [], "needs": true, "mind": true, "food": [],
  "tempers": true, "temper": "normal",   // insults anger characters (false: off); short | normal | long for everyone (characters.md)
  "gossip": true, "reflect": true, "reflexes": true, "expect": null, "autonomy": null, "monsters": null, "remembers": true, "plans": true, "glances": true, "autoThink": true,   // characters.md
  "live": false, "pace": "calm", "director": 5, "events": [],
  "mode": "living", "modeWhen": null, "modeRadius": 12, "encounterWorld": "slow", "turnMoves": 6, "turnMinutes": 10,   // how the game runs: living | adventure | turns (living.md)
  "time": "08:00", "dayMinutes": 12, "clock": true,   // the time of day (living.md)
  "talk": false,                   // true: a talk-only scene (the world builder adds no jobs, threats or living-world rules)
  "threats": [], "harsh": false, "prices": {},          // raids on the clock; starving hurts; the world's prices (living.md, characters.md)
  "goal": { "text": "Get the magic sword.", "win": { "player_has": "magic sword" } }
}
```

## Top-level fields

| field | meaning | chapter |
|---|---|---|
| `v` | format version, always `1` | |
| `title`, `subtitle`, `intro` | banner title, banner text for open scenarios, the intro card; `title` and `subtitle` are also on the loading screen while the world is built (the intro card follows once it is shown) | |
| `seed` | layout randomness (map lines, generated maps) | |
| `base`, `size`, `floor`, `paint`, `campfire` | the board | [board.md](board.md) |
| `lighting` | `bright` (10:00), `dim` (19:00), `night` (23:00, moonlit) | [board.md](board.md) |
| `dark` | fog of war; default true for generated dungeons | [board.md](board.md) |
| `reveal` | what is hidden until found: `"rooms"` (each room until seen into), `"cells"` (square by square; outdoors a mist), `false`; default `"cells"` in dark worlds, `"rooms"` in generated lit dungeons, else none | [board.md](board.md) |
| `surroundings` | trees beyond the board's edge: `forest` (thick woods), `fields` (open ground, scattered trees) or `none`; default: forest for a generated forest, fields for every other outdoor board | [board.md](board.md) |
| `kit` | `false`: houses are the building models and code-built roofs instead of the building kit (houses assembled from the walls) | [board.md](board.md#houses-and-roofs) |
| `shells` | with `"kit": false`: `false` keeps code-built roofs instead of the building models over walled rooms | [board.md](board.md) |
| `outside` | what lies past the board: `land` (hills), `rock` (dungeons), `street` (a lone building), `sea` (islands), `none`; default by the kind of world | [board.md](board.md) |
| `walls`, `wallHeight` | wall style and height | [board.md](board.md) |
| `roofs` | `true` / `false` overrides the automatic houses and roofs | [board.md](board.md) |
| `pathfinding`, `earshot`, `safety` | walking, hearing, crisis banner | [board.md](board.md), [characters.md](characters.md) |
| `grid`, `legend` | ASCII map | [grid.md](grid.md) |
| `objects` | things at exact positions | [things.md](things.md) |
| `map` | layout lines | [map-lines.md](map-lines.md) |
| `generate` | procedural dungeon or village | [generated.md](generated.md) |
| `locked` | locked doors and their keys | [things.md](things.md) |
| `subworlds`, `links` | a world in sections: other maps (a building's inside, dungeon levels, the forest next door, another scenario, a generated place) and the squares, places or edges that lead to them | [things.md](things.md#sections-worlds-bigger-than-one-map-subworlds-links) |
| `player` | the player (below) | |
| `allowed` | default commands for every character | [characters.md](characters.md) |
| `agents` | the characters (below) | [characters.md](characters.md) |
| `packs` | extra asset packs (object types) | [things.md](things.md) |
| `packages`, `skills`, `workflows` | shareable content | [packages.md](packages.md), [skills-and-roles.md](skills-and-roles.md), [workflows.md](workflows.md) |
| `bodies` | the ids of the bodies its packs and packages bring (`["dire_wolf"]`), so the world builder and `scenario_link.py` keep them as `"model"` | [api.md](api.md#bodies) |
| `lore`, `needs`, `mind`, `food` | world facts, hunger on/off, the mind on/off, extra food | [characters.md](characters.md) |
| `tempers`, `temper` | insults anger characters, who may refuse, call for help or fight (`false`: off); how quickly | [characters.md](characters.md) |
| `live`, `pace`, `director`, `events` | a world that lives on its own | [living.md](living.md) |
| `mode`, `modeWhen`, `modeRadius`, `encounterWorld`, `turnMoves`, `turnMinutes` | how the game runs: `living` (real time, the default), `adventure` (the world on rails; whoever the player talks to uses the model), `turns` (nothing moves until the player ends a turn); switches by situation; a section may have its own | [living.md](living.md#how-the-game-runs-mode) |
| `time`, `dayMinutes`, `clock` | the time of day: start, real minutes a day (0: frozen), `false`: no clock | [living.md](living.md) |
| `threats` | raids, rats, bandits (and package kinds) on the clock | [living.md](living.md), [combat.md](combat.md) |
| `groups` | named groups of characters (`{"faithful": {"name": "the faithful", "members": ["wren"], "autonomy": "guided", "demands": [...]}}`; an agent's `"group"` joins one); a group's `autonomy` is between the character's own and the world's | [living.md](living.md#marks-orders-and-demands-the-players-say) |
| `designations` | squares marked for work at the start: plans by relation (`{"verb": "wall", "around": "garden", "gate": {"toward": "road"}}`) or `{"kind", "cells": [{"x", "z"}]}`; `priority`, `who` | [living.md](living.md#marks-orders-and-demands-the-players-say) |
| `orders` | standing orders: words (`"if more than two wolves come, wake bram"`) or rules (`{"when": "raiders > 2", "do": {"wake": "bram"}}`) | [living.md](living.md#marks-orders-and-demands-the-players-say) |
| `demands`, `demandDelay` | demands at the start (`{"text", "of", "via", "in", "met", "onMet", "onMissed"}`), made `demandDelay` ms after it (3000) | [living.md](living.md#marks-orders-and-demands-the-players-say), [api.md](api.md#demands-demands) |
| `resources`, `weather` | resources' starts (`{"favour": {"start": 5}}`, or a resource of the world's own); the weather at the start (`"fog"`, `{"kind": "rain", "intensity": 0.6}`) | [api.md](api.md#powers-resources-designations-demands-weather) |
| `talk` | `true`: a talk-only scene; the world builder leaves it one place with no jobs or threats | [world-builder.md](world-builder.md) |
| `harsh`, `prices` | starving drains health; the world's prices (`{"bread": 3}`) | [characters.md](characters.md) |
| `monsters` | `"player"`: monsters go only for the player; `"everyone"`; unset: everyone in a living world, the player otherwise | [combat.md](combat.md) |
| `goal` | win and lose conditions | [goals.md](goals.md) |

## The player

```jsonc
"player": {
  "name": "Traveller", "gold": 20,
  "items": ["rope", { "name": "healing potion", "qty": 2 }],
  "at": [0, 3], "facing": "n",     // or Y / @ in a grid, "in" on generated maps
  "model": "swordswoman",          // any body below (default swordswoman)
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
  "job": "baker", "home": "house 2", "workplace": "shop",   // what it does all day in a living world, where it sleeps and works (living.md)
  "prices": { "magic sword": [50, 40], "healing potion": 8 },  // asking, or [asking, lowest]
  "skills": ["magic"], "skillParams": { "magic": { "spells": ["spark"], "mana": 12 } },
  "workflow": "haggle", "workflows": ["haggle"],   // workflows.md
  "backstory": "Lost a leg to a troll.",           // always in its prompt
  "knows": ["The old well is dry."],               // facts it brings up when relevant
  "secret": "Took the mayor's lamp.",               // kept from the player unless it trusts them a lot (characters.md)
  "agenda": "become the next mayor",               // what it is quietly after, on its card each turn
  "expect": "capable",             // basic | capable | ambitious: how much the game helps it (characters.md); else by brain
  "group": "faithful",             // one or a list: the groups it belongs to (living.md, "Marks, orders and demands")
  "autonomy": "free",              // rails | assisted | guided | free, or {"preset": "guided", "danger": "code"} (activity, plan, talk, danger, needs, temper: code | model): living.md; else its group's, the world's, the player's, the brain's
  "reflexes": false,               // no game-made moves for it in danger or hunger
  "hunts": "everyone",             // a monster that goes after characters too, not only the player
  "temperament": "brave",          // brave | timid | calm (how it takes being hurt or insulted); else guessed
  "temper": "short",               // short | normal | long: how fast insults anger it (characters.md, Tempers)
  "hostile": false,                // true: fights the player (combat.md)
  "hp": 10, "wield": "club",       // combat.md
  "ttsVoiceId": "builtin:jean",    // alba azelma cosette eponine fantine javert jean marius
  "thinking": false, "showThoughts": true,   // off by default; on, the character reasons before acting: slower turns, better deals and plans (Bonsai 2 gains most)
  "simple": true, "systemPrompt": "You are {name}. ...",   // very small brains; also for a whole scenario, with "defaultModel" (characters.md)
  "chaos": 10,                     // 0-100, counted from the model's recommended settings: 0 and 1 are those settings, 100 is very high (0.7 reaches 2.75)
  "scale": 1.2,                    // bigger or smaller than the model's usual height (0.5-2)
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

- **People**: the main ones are JRPG-style Meshy models made from concept
  art (`swordswoman sorceress huntress villager_woman swordsman wanderer`);
  the older names point at them (`adventurer_woman` is the swordswoman, `witch`
  the sorceress, `peasant_woman` and `villager` the village woman,
  `adventurer` the swordsman, `woodsman` the wanderer) and the earlier
  Quaternius bodies stay as `adventurer_classic`, `adventurer_woman_classic`,
  `woodsman_classic`, `huntress_classic`, `peasant_woman_classic`,
  `villager_classic`, `witch_classic`. Also `hooded king farmer wizard peasant`
  (Quaternius Universal rig, built by `tools/build-figures.sh`). The old chibi
  KayKit names point at the newer bodies (2026-11-20): `knight` is the guard,
  `mage` the wizard, `rogue` the wanderer, `ranger` the huntress,
  `barbarian` the swordsman, `woman` the village woman; the chibi ones stay as
  `knight_classic mage_classic rogue_classic ranger_classic barbarian_classic
  woman_classic`. The clay `critter` is the default for a character with no
  `model` (and the blank sandbox world's first character).
- **Monsters**: `skeleton skeleton_warrior zombie goblin kobold orc troll
  skeleton_farmer rat spider wolf bat ghost slime demon giant dragon`.
  `orc goblin skeleton skeleton_warrior troll skeleton_farmer` are the
  grittier Meshy models (`assets/models/characters/meshy/`); the old cartoon
  ones are `orc_classic goblin_classic skeleton_classic
  skeleton_warrior_classic`. More monsters (Quaternius, CC0): `wyrmling`
  (a young red dragon), `imp`, `mushroom_warrior`, `bunny` (a rabbit with a
  sword), `snake`, `wasp` (a giant one), `frog` (a giant one). Made for the
  game like the Meshy people: `minotaur`, `lizardman`, `werewolf`, `mummy`.
  Made for the game in 2026-11 (rigged Meshy models): `zombie`, `kobold` (a
  little red dragon-dog), `demon`, `giant` (a hill giant), `imp` (their old
  models stay as `zombie_classic kobold_classic demon_classic giant_classic
  imp_classic`), and `ogre`, `gnoll` (hyena-headed), `lich` (a crowned undead
  sorcerer), `vampire`, `cultist` (red-robed, masked), `bandit`, `gargoyle`, `dark_knight`;
  and `bear` (a grizzly). Gargoyles and dark knights are mindless.
  `red_dragon`: a great red dragon (about three and a half squares tall, seven and a half long, low
  and prowling, blocking every square under it) that talks: its
  jaw opens and closes with its voice (a deep voice suits it, e.g.
  `"ttsVoiceId": "pack:villain_m"`); it walks, attacks and dies like the
  other beasts, and breathes fire (`breathe_fire(target)`, [combat.md](combat.md)). The old `dragon` (a small flying cartoon one) is mindless. Ogres, liches, vampires, cultists and bandits have minds (they
  can talk, threaten, bargain); give one `"hostile": true` to make it fight.
- **More people** (made for the game, 2026-11-13; they sit, sleep and work
  like the others): `dwarf` (a red-bearded miner), `elf` (a silver-haired
  ranger), `priest`, `guard` (a town guard in a tabard), `merchant`.
- Mindless monsters (skeletons, zombie, rat, spider, wolf, bear, gnoll, bat,
  slime, ghost, giant, demon, dragon and the Quaternius and Meshy ones above,
  not the ogre, lich, vampire, cultist or bandit) are hostile by default and
  never talk.
- **Animals** (Quaternius, CC0): `cow bull horse white_horse donkey deer stag
  fox dog husky alpaca pig sheep`, and `wolf` (hostile by default). They are
  never hostile unless `"hostile": true`, take no brain turns (they wander,
  graze and look about; spoken to, they moo, bark or bleat in the log), and
  need only an `id`, a `model` and where they are. `"talks": true` gives one a
  mind like a person's (a talking cat in a fable, a wise old stag).
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
