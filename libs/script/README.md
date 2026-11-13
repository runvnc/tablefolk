# @tablefolk/script

Scripted stories for games and chat apps: world **flags** and the **facts**
characters know while they hold, one **condition** language, **actions**, a
step **runner** for workflows, **triggers**, and a **validator**. It has no
DOM and no game in it: your app supplies a small host (who carries what, run
a character's command, what was said to it, optionally a language model). It
runs in the browser and in Node.

Tablefolk uses it for menus, workflows and model-free worlds, through
`app/story.js` in the repository.

## Conditions and templates

```
world.cat_found                     a flag holds (not false, 0, "", "no", "none", "off")
world.favours >= 2                  == != >= <= > <  contains
player has lost cat                 someone carries it (player lacks ...)
player has "bread and butter"       quote names that contain and/or
player.gold >= 10, me.gold, bert.items contains key
answer contains kettle              a workflow run's own variables
not world.paid, (a or b) and c      not / and / or, brackets ("and" binds first)
```

- **Item names match whole words:** "cat" finds "lost cat", but "key" doesn't
  find "keyring".
- **Templates:** `{{player}}`, `{{me}}`, `{{world.flag}}`, `{{player.gold}}`,
  and run variables.
- **Errors:** `parse()` throws `ExprError` with a position.

## Actions

A menu choice, a workflow's `do` step and a trigger's `do` are one list of
effects, run in this order:

| effect | example |
|---|---|
| `take` | `"take": "lost cat"` |
| `set` | `"set": {"cat_found": true, "favours": "+1"}` |
| `say` | the player's line |
| `reply` | the character's line |
| `act` | command lines: `"act": ["give(silver locket)"]` |
| `give` | `"give": "pie"` |
| `start` | a workflow: `"start": "riddle"` (also `workflow`) |
| `stop` | `"stop": true` |

`world.x` is always a flag. A bare name is a flag in a menu or a trigger, and
a run variable inside a workflow.

## Workflows (the runner)

Step types:

| step | what it does |
|---|---|
| `await` | waits for `"speech"`, or for `"turns"` |
| `set` | sets run variables or flags |
| `take` | the player hands an item over, with `"else"` when they don't carry it |
| `if` / `then` / `else` | branches on a condition |
| `choose` | `"by": ["decider", "model", "default"]`, the order of who answers |
| `prompt` | a question for the model |
| `command` | a command line; takes the character's turn |
| `menu` | the player picks; `"options"` maps a choice id to a step, words that fit no choice go to `"other"` (or the menu asks again), closing goes to `"closed"` |
| `do` | actions (above) |

Any step can also have `goto`, `end`, and `max` + `exit`.

A saved run keeps the step's **id** and a version, so it survives edits to
the scenario. Runs pause and resume (a menu opened mid-workflow).
`advance(id, { until: 'turn' })` stops after a command that took the
character's turn; `until: 'wait'` runs on until the flow waits.

## Triggers

```json
"triggers": [ { "on": "flag", "flag": "cat_found", "to": true, "as": "bert", "once": true, "do": { "reply": "Whiskers is home!" } },
              { "on": "given", "who": "pell", "item": "lost cat", "do": { "set": { "cat_found": true } } },
              { "on": "start", "as": "hobb", "do": { "start": "open_shop" } } ]
```

- **Optional fields:** `if` and `once`.
- **No chains:** a trigger set off while another runs is skipped, so they
  can't loop.

## Validate

`validate(scenario)` returns `[{ level, where, message }]`. It finds:
- conditions that don't parse;
- `goto`/`then`/`other` targets that don't exist, and steps nothing reaches;
- menus and workflows that are named but missing;
- flags that are read but never set;
- in a world with no model: a `choose` without a default, and a menu step
  without `other`.

Tablefolk's world generator sends the errors back to its model to fix.

## Use

```js
import { createState, createRunner, createTriggers, perform, visibleMenu, pickMenu, check, validate, memoryHost } from '@tablefolk/script';

const host = memoryHost({ player: { gold: 10, items: [] }, chars: { bert: { inventory: { items: ['lost cat'] } } } });
const flags = {}, state = createState({ flags: () => flags, facts: () => scenario.facts }); host._state = state;
const runs = {}, store = { get: id => runs[id] || null, set: (id, r) => { if (r) runs[id] = r; else delete runs[id]; } };
const runner = createRunner({ flows: () => scenario.workflows, state, host, store });
const triggers = createTriggers({ list: () => scenario.triggers, state, host, runner });

await perform(menuItem, { host, state, me: 'pell', runner, triggers });   // a menu choice
runner.start('hobb', 'riddle'); await runner.advance('hobb', { until: 'wait' });
host.heard.hobb = ['a kettle']; await runner.advance('hobb', { until: 'wait' });
```

A host for your own app implements:

| method | what it does |
|---|---|
| `scope(me, vars)` | gives conditions access to `inventory(who)`, `playerName()` and `flag(name)` |
| `transfer(from, to, item)` | moves an item from one holder to another |
| `run(actorId, line)` | runs a command line as a character; returns `{ tookTurn }` |
| `hear(actorId)` | what was said to the character since it last listened |
| `ask(actorId, question, parse, options)` | asks the model; null when there is none |

Optional: `decide`, `menu(actorId, ref)`, `playerSays`, `log`, `ended`.

Tests: `node test.mjs` (35 checks, including a full playthrough of
Tablefolk's Willow Lane with no model).

Part of [Tablefolk](https://github.com/runvnc/tablefolk) (`libs/`). MIT.
