# Goals

`goal` is optional: without one the scenario is **open** (it never ends; the
banner shows `subtitle` and the turn count). With one, the game state decides
the outcome, never the model.

```json
"goal": {
  "text": "Get the magic sword. You only have 20 gold.",
  "win":  { "player_has": "magic sword" },
  "lose": { "turns_over": 12 },
  "winText": "Mog grumbles and hands it over.",
  "loseText": "Mog closes the shop for the day.",
  "score": "player_gold"
}
```

`win`, `lose` and the conditions inside them are plain JSON predicates (a link
can't run code). `"maxTurns": 12` is short for a `turns_over` lose.

| predicate | example |
|---|---|
| `player_has` | `"magic sword"` or `["magic sword", 2]` |
| `player_gold` | `[">=", 10]` |
| `agent_has` | `["mog", "magic sword"]` |
| `agent_gold` | `["mog", ">=", 30]` |
| `agent_near` | `["mog", "campfire", 1.5]` (target: agent, `player`, object type, scenery or `[x, z]`) |
| `object_near` | `["barrel", "house", 2]`; `["barrel", "campfire", 2, 2]` = at least 2 barrels |
| `object_count` | `["barrel", "<", 3]` |
| `prop_state` | `["crate", "burned"]` (any crate) |
| `said` | `["mog", "deal"]` (spoken words, case-insensitive substring; `"any"` for anyone) |
| `turns_over` | `12` (a turn is one character reply, however many commands it runs) |
| `agent_defeated` | `"grub"` |
| `agent_hp` / `player_hp` | `["grub", "<=", 3]` / `["<", 5]` |
| `player_defeated` | `true` |
| combinators | `{"all": [...]}`, `{"any": [...]}`, `{"not": {...}}` |

- Item names match loosely, the same way as `sell()` ("potion" matches
  "healing potion").
- Goals are checked continuously while a scenario runs; the first of win or
  lose to become true ends it.
- `score`: `player_gold`, `turns`, `turns_left` or `agent_gold:<id>`, shown
  on the end screen and in the share text.
- A `player_has` goal needs a way to get the item: `give`, `sell`, a chest, a
  pick-up, or loot.
- The checker is `checkGoal` (and the predicate switch above it) in `app/scenario.js`.
