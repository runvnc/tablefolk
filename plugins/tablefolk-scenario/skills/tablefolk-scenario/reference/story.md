# Story state: flags, facts, inventory checks

`app/story.js` (the game's host for `@tablefolk/script`, `libs/script`). A world keeps **flags**, small named values (found the cat,
paid the toll, favours done) that menus, workflows and the characters share.
They are saved with the world.

```json
"flags": { "cat_found": false, "favours": 0 },
"facts": {
  "cat_found": "{{player}} found Mrs. Pell's lost cat and brought her home: everyone on Willow Lane thinks well of {{player}}.",
  "favours": { "text": "{{player}} has done Brakka a favour.", "for": ["brakka"] }
}
```

- `flags`: the starting values.
- `facts`: what the characters know **while a flag holds** (anything but
  `false`, `0`, `""`, `"no"`). The fact is put first in each character's "You
  know:" line, for everyone or only the ids in `"for"`. That is how a
  neighbour with a model "looks upon you favourably" once you helped someone
  else.

## Setting flags

| from | how |
|---|---|
| a menu choice | `"set": { "cat_found": true, "favours": "+1" }` ([characters.md](characters.md)) |
| a workflow | `{ "set": { "world.cat_found": true } }` ([workflows.md](workflows.md)) |
| the console | `tablefolkStory.set('cat_found', true)` |

`"+1"` and `"-2"` add to a number.

## Conditions

Used by a choice's `if`, a character's list of menus, and a workflow's `if`:

| condition | true when |
|---|---|
| `world.cat_found` | the flag holds (`not world.cat_found`: it doesn't) |
| `world.favours >= 2` | compares: `==` `!=` `>=` `<=` `>` `<` `contains` |
| `player has lost cat` | the player carries it (`player lacks lost cat`) |
| `player.gold >= 10` | the player's gold |
| `me has rusty key`, `me.gold > 5` | the character the menu or workflow belongs to |
| `bert has lost cat` | any character, by id |
| `... and ...`, `... or ...` | both / either (`and` binds first); brackets group: `(a or b) and c` |
| `player has "bread and butter"` | quote a name that contains and/or |

Items match whole words: `player has cat` finds "lost cat", but `player has
key` does not find "keyring". A condition that doesn't parse is reported when
the world loads (and the world builder sends it back to its model to fix).
Goals take conditions too: `"win": { "if": "world.cat_found and player has silver locket" }`.

## Triggers

Things that happen by themselves when the story moves:

```json
"triggers": [
  { "on": "flag", "flag": "cat_found", "to": true, "as": "bert", "once": true, "do": { "reply": "Heard Whiskers is home." } },
  { "on": "given", "who": "pell", "item": "lost cat", "do": { "set": { "cat_found": true } } },
  { "on": "start", "as": "hobb", "do": { "start": "open_shop" } }
]
```

| `on` | when |
|---|---|
| `flag` | a flag changed (`"to"`: only to that value) |
| `given` | the player handed a character an item (`"who"`, `"item"` narrow it) |
| `start` | the world began |

`"as"` is the character the actions run as, `"if"` a condition, `"once"`
at most once per world. `"do"` takes the same actions as a menu choice
(characters.md), `start` included. A trigger set off while another runs is
skipped, so triggers can't loop.

## Moving things

| what | how |
|---|---|
| the player hands an item over | a choice's `"take": "lost cat"` or a workflow's `{"take": "lost cat"}` |
| the character gives one | `act: "give(silver locket)"` or a `command` step |
| the character sells one | `act: "sell(\"bread\", 3)"` (picking the choice is the player's agreement) |

Goals can then check the result (`"win": {"player_has": "blackberry pie"}`,
[goals.md](goals.md)).

`scenarios/willow-lane.json` uses all of this with no language model;
`tools/browser-test/willow-lane-test.mjs` plays it through (23 checks).
