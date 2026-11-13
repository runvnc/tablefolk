# Workflows: keeping small models on track

`@tablefolk/script` (`libs/script`, its README and `run.js` header are the full reference), run in the game by `app/story.js`. A workflow
breaks a task into steps; the character's model only answers one narrow
question at a time, and the steps decide what happens next. They suit
anything transactional with steps and rules (haggling, a quest hand-in, a
riddle gate); free conversation stays with the model.

Put them in `"workflows"` and either start one on an agent (`"workflow":
"haggle"`, it runs from the start) or allow the `workflow` command so the
character can start one itself (`workflow(haggle, 30)`; `"workflows":
["haggle"]` on an agent limits which). Packages can bring workflows too
([packages.md](packages.md)); a scenario's own win on a name clash.

```json
"workflows": {
  "haggle": {
    "description": "sell the magic sword for a fair price",
    "steps": [
      { "id": "wait", "await": "speech", "save": "said" },
      { "prompt": "The customer said: \"{{said}}\". How many gold coins did they offer? Answer 0 if none.", "parse": "number", "save": "bid" },
      { "if": "bid >= 40", "then": "deal", "else": "counter" },
      { "id": "counter", "prompt": "Refuse {{bid}} gold in one short grumpy sentence and ask for 50.", "parse": "line", "save": "reply" },
      { "command": "say(\"{{reply}}\")", "goto": "wait", "max": 4, "exit": "giveup" },
      { "id": "deal", "command": "sell(\"magic sword\", {{bid}})", "end": true },
      { "id": "giveup", "command": "say(\"Bah. Come back with real money.\")", "end": true }
    ]
  }
}
```

## Steps

| step | fields |
|---|---|
| `prompt` | a question for the model; `parse`: `text`, `line`, `number`, `yesno`, `word`; `save` |
| `choose` | `{"choose": "Fight or flee?", "options": {"fight": "s1", "flee": "s2"}}` |
| `if` | `==` `!=` `>=` `<=` `>` `<` `contains`, with `then` / `else` |
| `command` | any command line; takes the character's turn |
| `await` | `"speech"` (the next words or event addressed to it) or `"turns"` with `"turns": N` |
| `set` | `{"set": {"tries": "{{tries}}+1"}}`; `"world.<flag>"` sets a world flag: `{"set": {"world.riddle_solved": true}}` |
| `take` | `{"take": "lost cat"}`: the player hands it over; `"else": "step"` when they don't carry it; `save` gets yes/no |
| `menu` | `{"menu": "hobb-cakes", "save": "cake", "options": {"plum": "s1"}, "then": "s2", "other": "odd", "closed": "bye"}`: the player picks from a menu (`menus`); the choice's id is saved and branches by `options` (else `then`, else the next step); words that fit no choice are saved and go to `other` (else the menu asks again); closing it goes to `closed` (else the workflow ends) |
| `do` | `{"do": {"reply": "...", "act": ["give(pie)"], "set": {...}}}`: a menu choice's actions (characters.md) |

`choose` takes `"by"`: who answers, in order, `["decider", "model",
"default"]` (the default order; the Decider only when one is loaded, and only
when it is sure enough, `"min"`: 0.5). `"by": "default"` answers at once
with `"default"`.

`if` takes the run's own variables and every world condition
([story.md](story.md)): `"world.cat_found"`, `"player has lost cat"`,
`"player.gold >= 10"`, `"me has rusty key"`, `"not ..."`, `"... and ..."`.

Any step can have `id`, `goto`, `end`, and `max` + `exit` (leave after N
passes). Templates: `{{var}}`, `{{me}}`, `{{player}}`, `{{input}}`,
`{{world.<flag>}}`, `{{player.gold}}`, `{{player.items}}`.

## Starting and running

- On an agent: `"workflow": "haggle"` (runs from the start).
- The `workflow` command: the character starts one itself.
- A menu choice: `"start": "riddle"` (or `"workflow"`) ([characters.md](characters.md)).
- A trigger ([story.md](story.md)).

A saved world keeps each run at its step's `id`: give steps ids, and edits
that add or move steps leave saved runs where they were. A menu opened on a
character in the middle of a workflow pauses it; the menu's words are not
heard by it, and it goes on when the menu closes. One workflow per
character: starting another replaces it.

A workflow started from a menu, or spoken to while it waits for speech,
goes on until it waits again (an `await`, or its end). Otherwise each
`command` step takes one of the character's turns.

## Without a model

In a world with `"brain": "none"` (characters.md), a workflow made of
`await`, `if`, `set`, `take` and `command` steps runs as it is: the player's
typed or spoken words are what `await` hears. `prompt` steps need the model,
and `choose` takes its `"default"` without one. A riddle gate with no model:

```json
"riddle": { "steps": [
  { "if": "world.riddle_solved", "then": "again" },
  { "command": "say(\"What has a spout, a lid and a whistle?\")" },
  { "id": "wait", "await": "speech", "save": "answer" },
  { "if": "answer contains kettle", "then": "right" },
  { "command": "say(\"No. Think again.\")", "goto": "wait", "max": 3, "exit": "giveup" },
  { "id": "right", "set": { "world.riddle_solved": true } },
  { "command": "say(\"A kettle! Clever, {{player}}.\")", "end": true },
  { "id": "giveup", "command": "say(\"A kettle! Ha.\")", "end": true },
  { "id": "again", "command": "say(\"You've solved my riddle already.\")", "end": true } ] }
```

Tested (2026-11-13: `node libs/script/test.mjs` without a browser, and `tools/browser-test/willow-lane-test.mjs` in the game): a wrong
answer, the right one setting the flag, and the flag checked on the next
run.

Tested with Gemma 4 E4B: greets, counters a low offer, sells at 42
(`scenarios/haggle-workflow.json`). For plain selling, the `trade` skill or a
seller role is usually enough ([characters.md](characters.md)).
