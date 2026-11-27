# God: a village's god, as a package

A whole game made of content on the God / Dungeon Keeper foundations: the
player is a god with no body, the village's belief makes its mana, and the
village answers to it: prayers, decrees, a council, conversion between the
faithful and the doubters. `scenarios/god-village.json` ("God of Ashford")
plays it. The full description (powers, rules, numbers) is the scenario
skill's `reference/god.md`.

| file | what |
|---|---|
| `tablefolk.json` | the manifest: the `faith` skill (its card), the `mana` and `belief` resources, the `drought` weather kind, the module |
| `god-core.js` | the rules with no game in them: belief and sides, mana, prayers, omens and prophecies, demands met and missed, the council's vote, decrees and deadlines from words (`node tools/god-rules-test.mjs`) |
| `god.js` | the module: 14 powers, the Prayers list and the village tab, the Decree tool with the vision and the council, the decree templates (offering, sacrifice, worship, work), prayers and sickness on rails (job hooks) and above rails (activities), the card, time controls, the overhead camera |

What it uses from the game: `powers`, `resources`, `weather`, `demands`,
`cards` and `skills` (the module contract); `api.bar`, `api.resource`,
`api.weather`, `api.demand`; `tablefolkGroups` (join/leave on conversion),
`tablefolkDemands` (create, refuse), `tablefolkJobs.addUrgent/addWork` (and
their `remove...` on dispose), `tablefolkAgency.addOptions`,
`tablefolkThreats.now/retreat`, `tablefolkSpells.strike`,
`tablefolkModes.setSpeed`, `tablefolkLive`, `tablefolkMenu.match`, the brain
(`tablefolkLLM`) only above rails.

Tests: `node tools/god-rules-test.mjs` (the rules) and
`node tools/browser-test/god-test.mjs --only=god` (the game with no model:
every power, prayers, a decree met after a council and one missed).
