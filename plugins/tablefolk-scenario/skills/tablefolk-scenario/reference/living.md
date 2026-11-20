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
- with the clock running, characters are busy with their jobs and their
  day (below); without it, a character with nothing to react to (nothing
  said or happened to it, nothing urgent) mostly idles without the model: a
  step, a turn, nothing, or a **routine** with the things around it: at
  night, a bed within 10 cells is slept in (up again by day); by day, a
  character whose role, look or personality names a trade works at its
  station within 9 cells (smith: `anvil`, carpenter: `workbench`, cook,
  innkeeper or alchemist: `cauldron`, woodcutter: a `tree` or `logs`, miner
  or mason: `boulder`, scholar, priest or mage: `lectern` / `bookcase`, guard
  or soldier: `dummy` / `target`), others now and then sit on a bench
  nearby. Put the station near the character
  ([characters.md](characters.md#using-things));
- someone spoken to, or told of an event, goes after a short pause; a line
  one character says to another counts as spoken to (see
  [characters.md](characters.md#hearing-seeing-and-talking): the others
  only overhear it; after four lines the two have said their piece for
  120 s and talk with nobody but the player for 90 s, back at their
  work; while two characters talk, others within earshot of them start no
  conversation of their own (the player is always answered);
- a line under four words ("Hush.", "It is.") is not spoken unless it
  answers a yes/no question: the character nods, shrugs or huffs instead;
- a character with nothing said to it talks only for a reason (news, a want
  that needs someone, a goal naming someone near, a temper); otherwise it
  does things;
- a fighter with prey in sight goes every 1.5-2.5 s, whatever the pace;
- hunger and tiredness grow with real time while the world lives (hungry
  after about 8 minutes, tired after about 12), and a hungry or tired
  character counts as having something to do;
- for 30 s after the player acts or talks things move faster; after 3 minutes
  without, slower.

`"pace"`: `calm` (default: turns 20-36 s apart, 13 s quiet after a line, an
event about every two minutes), `lively` (7-14 s, 4 s, 45-80 s), `busy`
(1-3 s, no gap, 20-30 s). The player's own choice in the select by the live
button wins and is remembered in the browser; `?pace=lively` in the page
address sets it for that page only (tests). Mindless monsters come for the
player and the characters (when near and in sight) or wander.

## The clock (`time`, `dayMinutes`, `clock`)

A living world has a time of day: `"time": "08:00"` is the start (default
08:00, or 21:00 when `lighting` is `night`), `"dayMinutes": 12` the real
minutes a game day takes (default 12; `0` freezes it), `"clock": false` no
clock at all (then everything below is off and the world behaves as it did
before: night is only the lighting). The clock runs while the world lives
and stops when it is paused; it is saved with the world and shown at the
top of the screen ("07:45 · day 2"). The light follows it: day, dusk
(18-20), night, dawn (5-7). Dark worlds (dungeons, caves, `"dark": true`)
keep their lighting; only the clock runs.

## Busy by default: jobs and the day

With the clock running, every character with a mind has a job and a day,
and the game runs them in code; the model is used for words and for real
choices. A character's job is its `"job"` (a built-in job, a package's, or
a reference: [skills-and-roles.md](skills-and-roles.md#jobs)); with none,
one is guessed from its role, look and personality (a "baker" bakes, a
"guard" patrols; else it is a villager who strolls about). `"home"` and
`"workplace"` name a place of a generated map (`"house 2"`, `"smithy"`) or a
thing's type; by default the place it starts in.

The day, by the clock:

- **work** in the job's hours: its steps, one after another (gather from a
  tree or a field, fetch materials from a store, make bread at the oven, put
  it in its store, sell it to someone hungry, patrol...), each done with the
  ordinary commands, so results, sounds and memories are as if it chose
  them. A step that fails twice is skipped for an hour. Out of an input it
  falls back on its job's `fallback`: buys it, else gathers it itself (the
  smith to the ore rock or a tree, the baker to the field), else does
  **chores**, whatever the village lacks most: fetching another worker's
  missing input and giving it to them, hauling goods to a store that lacks
  them, gathering a staple the stores are short of (firewood, food, a job's
  input), standing watch at dusk, tidying; work never just stops (a
  `labourer` does chores all day); a guard stops at each place on its
  round, looks about and greets people by name (once an hour each;
  at night it challenges the player);
- **eating** when hungry: its own food, its store, the village store,
  buying from a seller or from someone's store, foraging anything that
  yields food and that it can reach (a fruit tree, a field, a snare: a
  hunter eats what it catches), or, with no gold, asking someone who
  carries food to share it (they give it, or say no, by code). Raw grain
  and flour are not a meal unless it is starving. When none of it works the
  reason is kept (live-eval's day report names everyone who ends the day
  hungry, and why);
- **the evening** (17-21) at the tavern, or the square: the time for talk.
  A character with someone beside it opens a talk with one line, chosen by
  the game and written by one short model call: first one concrete thing
  from the day's log, told and followed by a question about it ("Wren, I
  baked four loaves today. Did you get one?"), or a question about wren's
  own news: made, sold, bought, who ran out of what, a raid
  and who fought, who insulted whom, what the player did, a director
  event), each topic once per pair; when the day's topics are used up, an
  open prompt grounded in its sheet and the world, a different one each
  time for a pair: a question about the other's work, what it wants (its
  agenda, goal or what its work lacks), its opinion of a named neighbour
  (from what it remembers of them, or their trade and day), its plan for
  tomorrow (from its job and the stores: "we need more wood"), a memory or
  rumour, what it makes of the player, a question about the other's family.
  A question must come out as a question (it ends with "?"; one retry, else
  nothing is said). The other answers it, and the two talk a few lines;
  partners who have talked least that evening go first; in a gathering of
  four or more, talk goes quicker (a finished talk frees the room for the
  next pair after 5 s, answers come sooner), while a small room keeps the
  day's pace. News about someone is
  never told to them as news; a rumour is never overheard by the one it
  is about;
- **night**: home to its bed, up at dawn (a guard on night watch sleeps by
  day instead);
- **threats**: fighters (guards, hunters) go to raiders; the others run
  home and stay in until the all-clear.

The model is asked only to answer when spoken to (the task waits, then goes
on), to speak when there is a cause (news, a want that needs someone, a
temper, the evening, asking for materials it lacks), to pick one of a few
options at a decision point (out of materials, several ways to eat,
something happened, a stranger at the workplace; "something else" gives it
a free turn), for a free turn now and then when it has an `agenda`, `quest`
or goal, and for a one-line remark while it works (at most once per three
game hours, only with someone to hear it). An idle turn never asks the model
"what do you do now?". Its card says what it is doing: "You are a baker.
Right now: baking bread. Today: made 4 bread; sold 2 bread." Over a busy
character the activity shows when it starts ("chopping wood"); the
Character pane says it too.

Things run out and come back (stock: [things.md](things.md#stock-and-stores)),
food is eaten, gold changes hands (everyone starts with a little by job
unless the scenario gives some). Hunger keeps growing with real time; a
character whose description says it is starving or has not eaten starts
hungry. Starving (`.8`) for a third of a day it is **weak**: it walks
slowly and cannot work. It does not die of it unless the world is
`"harsh": true` (then it loses health).

## What the player does

The village notices the player. Helping drive off a raid, buying from
someone, giving someone food or a gift, attacking or insulting someone,
taking things from someone's chest or barrel, and walking into someone's
house at night are the day's news: the evening's talk turns to them, and
those involved remember. Whoever lives in a house the player enters
uninvited at night (21-05) wakes, objects ("Oi! What are you doing in my
house?") and is angrier with the player (a step on its temper,
[characters.md](characters.md)); an owner who sees the player empty its
chest objects the same way.

## Spoken life: templated lines

Most of what a busy village says needs no model. At natural moments the
game has a character say one short line from a pool, voiced and shown like
any other: a sale ("Two gold for the ale, tam.") and the buyer's thanks; a
greeting when the player walks up to someone at work (within 2 cells, once
a game day each); a call when its work runs out of something ("We're out of
flour!"); raid shouts ("Wolves! Get inside!", a fighter's "To me!"); the
all-clear; goodnight on the way to bed; a guard's word in passing by day
and its challenge at night ("Halt! ...Ah, Traveller. Stay close to the
light."); asking for food when starving and sharing it; an intruder told
off.

Rules: never the same line twice in a row; at most one line per character
per 20 real seconds (raid shouts, the all-clear and intruders: 6); only when
someone with a mind, or the player, is within earshot; nothing while asleep.
The line goes into the speaker's own history as its words (so the model's
later lines stay consistent) and into the history of those who hear it, but
asks nobody for an answer and holds no conversational floor.

The pools are data: `jobs/common/lines.json` (kinds `sale`, `thanks`,
`greet`, `out`, `raid`, `raid_fighter`, `allclear`, `bed`, `patrol`,
`challenge`, `ask_food`, `share_food`, `refuse_food`, `help`, `intruder`,
`thief`, `wake`), each a list or lists by voice (`any`, `plain`, `gruff`, `cheerful`,
`timid`: from the character's temperament and personality), with slots
`{name}` (who it is said to), `{item}`, `{price}`, `{raiders}`, `{place}`,
`{me}`, `{greeting}` (Morning, Good day, Evening, Good night by the clock); a line whose slot has no value is skipped. A job adds its own
(`"lines": {"greet": ["Fresh bread soon, {name}."]}`, used first) and a
package its `"lines"` ([packages.md](packages.md#tablefolkjson)).

## Threats (`threats`)

```json
"threats": [
  { "kind": "raid", "who": "wolf", "count": 2, "when": "night", "every": 1, "from": "edge" },
  { "kind": "rats", "count": 3 },
  { "kind": "bandits", "when": "day", "every": 2 }
]
```

On the clock, the threat comes from the map's edge (`"side": "east"`: that
edge only, say the side the forest lies on; or `"from"`: a place id, a
lair): `raid` attacks people, `rats` go for the food in the stores and
eat it, `bandits` snatch gold and run. `when`: `night` (22:00), `day`
(10:00), `any`, or `[from, to]` hours; `every`: days between visits. They
leave at dawn (or 17:00 by day) or when half of them are down. A package can
define more kinds, with a behaviour of their own in code and a `"sound"`
played as they come ([api.md](api.md#threats)). Afterwards everyone knows
what happened ("2 wolfs came in the night; hector and wren drove them
off") and thinks better of those who fought, the player included.

In a living world monsters go for the characters as well as the player
(`"monsters": "player"` keeps the old way: only the player). See also
[combat.md](combat.md).

In a world of sections each section has its own `threats`, and only the
section the player is in lives: the others stand still and catch up in code
when the player comes back (stock, meals, where everyone is at that hour;
[things.md](things.md#sections-worlds-bigger-than-one-map-subworlds-links)).

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
first the living worlds with work and a pressure (`hearthvale`,
`frontier-outpost`, `harrow-keep`, `kettlemoor-hunt`, `deepdelve-camp`),
then the one-room ones (`goblin-bakery`, `necromancer-interview`,
`goblin-builders`, `dragon-tax-audit`, `haunted-tavern`). Entries are
`{ "file", "title", "pitch", "who": [body names for the card], "tags" }`.

`tools/browser-test/live-watch.mjs <scenario> [seconds]` plays one live with
the real model and keeps the transcript. `scenarios/hearthvale.json` is a
village with jobs, stock, a clock and wolves at night.
