# Worlds that live on their own

The original idea: set up a little world, then the characters do dumb,
funny or fascinating things with each other and the world while the player
watches or joins in. Small models are good at reacting and bad at planning,
so these fields give them things to react to.

```json
"live": true,
"pace": "calm",
"director": 5,
"events": [
  "A rat runs across {who}'s foot.",
  { "text": "Someone slips a note under the door.", "spawn": "note", "note": "Meet me at midnight." },
  { "text": "{who} finds a coin purse.", "spawn": "coin_pile", "gold": 5 },
  { "text": "The candle is out: Morvax must choose now.", "round": 8, "to": "morvax" }
]
```

## Let them live (`live`, `pace`)

`"live": true` starts the world living: everyone with a mind takes turns on
their own (`app/live.js`). P, or the "let them live" button by the view
buttons, pauses and resumes; without it, characters act only after the player
does.

Pacing runs on real time:

- each character has its own next-turn time; out of the player's sight,
  twice as long;
- a spoken line holds the next one back a quiet gap;
- a character with nothing to react to (nothing said or happened to it,
  nothing urgent) mostly idles without the model: a step, a turn, or
  nothing;
- someone spoken to, or told of an event, goes after a short pause;
- for 30 s after the player acts or talks things move faster; after 3 minutes
  without, slower.

`"pace"`: `calm` (default: turns 20-36 s apart, 13 s quiet after a line, an
event about every two minutes), `lively` (7-14 s, 4 s, 45-80 s), `busy`
(1-3 s, no gap, 20-30 s). The player's own choice in the select by the live
button wins and is remembered in the browser. Mindless monsters come for the
player (when near and in sight) or wander.

## The director (`director`, `events`)

`app/director.js`: now and then something happens next to a character the
player can see, spaced by the pace. It is told to that character and those
near as an `[event]`, shown to the player as a narrator's line, and sometimes
made real.

- An event is a string, or `{"text", "spawn", "note", "gold"}`. `{who}` is the
  character it happens to (told to that one as "you"). `spawn` makes the thing
  real beside it (`note` with `"note"` text, `coin_pile` with `gold`,
  `mushroom`, `crate`, any object type).
- `{"text": "...", "round": 8, "to": "morvax"}` happens once, when the live
  rounds reach 8: the story's turning point.
- Generic events (dungeon, indoors, outdoors) fill in after the scenario's
  own.
- The director ticks after each turn of a living world: an event comes at
  most every N turns (`"director": 4`; default 5) and at most once per the
  pace's event gap. `"director": false` turns it off.

## Writing characters for a living world

Write each `personality` as a name sentence and then several short sentences
of what it does:

> "Rattles, a skeleton applying for a job. You keep asking about the dental
> plan, holidays and whether haunting counts as overtime. You rattle when
> nervous. You think the necromancer's tower is drafty."

Each turn ends with "Stay yourself: ..." and one of those sentences, picked at
random, which keeps small models from drifting into each other's voice. Give
characters conflicts with each other, things to do with objects (a note to
find, bread to give, a wall to dig), and a goal. The world generator writes
worlds this way.

What characters can do with each other and the world (besides talking):
`give(bread, pip)`, `give(10 gold, pip)`, `walk(pip)`, `carry(note)`,
`throw()`, `drop()`, `dig(north)`, `build(wall)`, `note(text)`, `eat(item)`,
`look`. See [characters.md](characters.md).

## Showcase worlds

The welcome screen (`app/welcome.js`) lists `scenarios/showcase.json`:
`goblin-bakery`, `necromancer-interview`, `goblin-builders`,
`dragon-tax-audit`, `haunted-tavern`, each tested live with E2B. Entries are
`{ "file", "title", "pitch", "who": [body names for the card], "tags" }`.

`tools/browser-test/live-watch.mjs <scenario> [seconds]` plays one live with
the real model and keeps the transcript.
