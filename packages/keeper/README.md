# Keeper: a Dungeon Keeper game, as a package

A whole game made of content on the God / Dungeon Keeper foundations: the
player is a dungeon's keeper with no body. Imps dig the rock you mark (gold
from the veins) and claim the rooms you mark; a finished room big enough
draws a creature through the portal; the creatures eat, sleep, train, study,
craft and guard by code, want their wages every pay day (a demand made of the
keeper) and argue at a council when they are not paid; heroes come in from
the gate to smash the heart. `scenarios/keeper-lair.json` ("The Keeper's
Lair") plays it. The full description (rooms, creatures, powers, numbers) is
the scenario skill's `reference/keeper.md`.

| file | what |
|---|---|
| `tablefolk.json` | the manifest: the `keeper_creature` skill (its card), the `keeper_imp` and `keeper_creature` jobs, the `heroes` threat kind, raid lines, the module |
| `keeper-core.js` | the rules with no game in them: creature kinds and what draws them, happiness and loyalty, wages and pay day, training levels, research, the workshop's traps, the council's vote, the heart (`node tools/keeper-rules-test.mjs`) |
| `keeper.js` | the module: rock drawn as blocks with gold veins, the heart and the portal; the designation kinds (dig, seven rooms, trap); imps and creatures on rails (job hooks) and above rails (activities); pay day, the council; arrivals; the heroes' turn and the prison; five powers; the Creatures panel; time controls; the overhead camera |

What it uses from the game: `designations` (with the kind fields `ground`,
`accept`, `ready`), `powers`, `resources`, `cards`, `threats`, `jobs`,
`skills` and `lines` (the module contract and the manifest); `api.bar`,
`api.resource`, `api.demand` (`of: "player"`), `api.spawn`, `api.combat`,
`api.light`; `tablefolkDesignate.workFor`, `tablefolkJobs.addUrgent` (and its
`remove...` on dispose), `tablefolkAgency.addOptions`, `tablefolkThreats`,
`tablefolkGroups.join`, `tablefolkSpells.strike`, `tablefolkModes.setSpeed`,
`tablefolkLive`; the brain (`tablefolkLLM`) only above rails.

Tests: `node tools/keeper-rules-test.mjs` (the rules) and
`node tools/browser-test/keeper-test.mjs` (the game with no model: digging,
every room, the creatures they draw, needs and work, a pay day paid and one
missed with its council, a hero raid, every power).
