# Workflows: keeping small models on track

`app/workflows.js` (its header comment is the full reference). A workflow
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
| `set` | `{"set": {"tries": "{{tries}}+1"}}` |

Any step can have `id`, `goto`, `end`, and `max` + `exit` (leave after N
passes). Templates: `{{var}}`, `{{me}}`, `{{player}}`, `{{input}}`.

Tested with Gemma 4 E4B: greets, counters a low offer, sells at 42
(`scenarios/haggle-workflow.json`). For plain selling, the `trade` skill or a
seller role is usually enough ([characters.md](characters.md)).
