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
  hungry, and why: no food reachable, no gold and nobody shared (and whom
  it asked), or what kept it busy since it got hungry and when);
- **sleeping** at night in a bed at home, else a free bed nearby; with
  no bed it can reach (all taken, walled in) it lies down on the floor at
  home, which counts as sleep;
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

## How the game runs (`mode`)

A living world runs in real time, but the characters share one model, and a
slow model makes the player wait for turns and replies. `"mode"` chooses how
time and the model are shared (`app/modes.js`):

- **`"living"`** (the default): real time, as above. The player's
  conversation always goes first: it jumps the queue of model calls the
  village has waiting (one already running finishes first), the reply streams
  into a bubble as it is written, and the player can walk on meanwhile (the
  arrow keys walk while the chat box is empty). Only characters within
  `"modeRadius"` squares of the player (default 12; `0`: everyone) use the
  model; those farther away run on rails without it (their day goes on in
  code, what is said to them waits in their history) until they come near.
- **`"adventure"`**: the world runs on rails, all in code, while the player
  explores: no model at all. Engaging a character (talking to it, giving it
  something, opening its menu, or being spoken to by it: code still has
  characters greet and approach the player) opens an **encounter**: that
  character and whoever it was talking with nearby use the model at their
  autonomy level, and others who speak to them join. Meanwhile the world
  around goes at a quarter speed (`"encounterWorld": "slow"`, the default),
  stands still (`"pause"`) or runs on (`"run"`). The encounter ends when the
  player walks away (farther than earshot + 2 squares from all of them) or the
  talk has been idle for 90 s; each keeps a memory of the talk and goes back to
  rails, and what it learnt of the player (what they want, what they promised,
  trust) stays in its mind for the next time.
- **`"turns"`**: nothing moves until the player ends a turn (the **End turn**
  button at the top, Space or N). In a turn the player walks up to
  `"turnMoves"` squares (default 6) and may talk, give and use; the one spoken
  to answers on its turn. Then each character within `"modeRadius"` takes
  exactly one turn, nearest first, with a "thinking…" marker over it (its
  autonomy decides how: on rails its job's next step in code, free an open
  turn), walking and animations play, and the clock jumps `"turnMinutes"`
  (default 10 game minutes). Works in the tabletop view too (click a square to
  walk there). While the player decides, the first character's model call may
  start early, but only when nothing the player can still do this turn can
  reach it (too far to walk to, see or hear), and its answer is used only if
  its prompt is still the same at its turn.

**Switching mid-scenario.** A section has its own `"mode"` (a building's
inside in turns, the village in adventure); a trigger's, menu choice's or
workflow step's `"do"` takes `"mode": "turns"`; a director event can carry
one (`{"text": "Bandits burst in!", "mode": "turns"}`). `"modeWhen"` switches
by the situation and back: `{"fight": "turns", "talk": "adventure",
"indoors": "turns"}` (a fight: a foe within 5 squares the player can see,
for 6 s after the last; talk: an encounter is open; indoors: under a
building's roof); a fight wins over talk, talk over indoors. The player can
choose a mode for every world in Settings ("How the game runs"), and `?mode=`
in the page's link beats everything (tests). Settings' "Running now" says which
mode runs and why. The world builder sets the world's mode on the Story tab
("how the game runs", beside the autonomy choice); the AI that builds worlds
sets it only when the request asks.

```json
{ "mode": "adventure", "modeWhen": { "fight": "turns" }, "encounterWorld": "slow",
  "triggers": [ { "on": "flag", "flag": "trial_begins", "do": { "mode": "turns" } } ] }
```

## How much characters decide (`autonomy`)

The day above is **on rails**: code runs it and the model talks. That suits
small brains (Gemma 4 E2B). With a stronger brain characters can decide for
themselves. `"autonomy"` on a character or the scenario (`rails`,
`assisted`, `guided`, `free`, or an object: below), else the player's choice
in Settings ("How much do characters decide for themselves?"), else **Auto**:
a short capability check the first time a brain runs on this device (ten
small tasks and its speed, about 20-60 s, kept in the browser) picks the
level; a slow machine gets a lower one. Settings' "Running now" says which
level runs and why. The world builder sets the scenario's level on the Story
tab (the same five choices, Auto by default) and a character's own in its
box on the Characters tab ("decides for itself"); the AI that builds worlds
sets it only when the request asks.

**A world that asks for more than the brain can carry.** A scenario's (or a
character's) level is a request, not an order:

- On a brain that Auto puts **on rails** (a small brain such as Gemma 4 E2B,
  or any brain on a slow machine), or when the player chose **On rails** in
  Settings, a request that would let the model choose its activities is not
  followed: everyone stays on rails, and Running now says "this world asks
  for free, but this brain runs on rails (...): kept on rails". A world made
  for free still plays on the smallest brain; it plays as a rails world.
- On a stronger brain the request runs. On Auto, the decisions this brain
  keeps in code (talk, danger, needs or temper: the ones its check failed,
  or assisted's danger and needs) stay in code unless the request names
  them: `"free"` on a brain that checked out as "guided (danger in code)"
  runs as "free (danger in code)"; `{"preset": "free", "danger": "model"}`
  hands danger to the model anyway.
- A level the player chose in Settings (other than On rails) is the player
  accepting the cost: the world's request runs as written, with nothing kept
  in code.
- `?autonomy=<level>` in the page's link (tests and measuring) beats
  everything: the world's level, the characters' own and Settings.

- **On rails**: as above.
- **Assisted**: the character chooses what to do, plans its day and starts
  its own conversations (as guided), but the game keeps it fed, in bed at
  night and safe in a raid (as on rails: indoors unless its job fights or
  defends). For brains that plan well but handle emergencies and their own
  needs badly.
- **Guided**: each time an activity ends, the character picks what to do
  next from what the world offers right now: its work (each step with what
  it needs and makes: "bake bread (needs 2 wheat: you have 0, the stores
  have some; makes 2 bread)"), eating, bed, people near and what it feels
  about them (talk, have it out, give food to someone hungry), someone out
  of materials it could help, the evening at the tavern, what it is quietly
  after (`agenda`), its goal, package commands that fit, a place it has not
  been today, or "something else (say what)". In the morning it writes a
  plan for the day (up to five of those) and follows it, asking itself
  again every few steps; when a step fails it re-plans, knowing why. Code
  carries each activity out and tells it how it went next time ("How your
  last activities went: bake bread: failed (out of wheat)").
- **Free**: the character's own turns are the main loop. It sees its whole
  situation and the activities as commands, `do(bake bread, why)` (one
  command runs the whole thing: walking, fetching, making), keeps notes with
  `plan("...")` (goals, next steps, who owes it what, what it hides), talks
  to whom it likes, gives, sells, quarrels, or walks off to another place.
  Turns are shared out by the brain's speed, so a world of eight stays
  responsive; in between, code keeps it at its usual work.

Above rails characters speak on their own initiative: no topics chosen by the
game, no remarks or evening openers, and templated lines only for deals code
carries out (a sale and thanks, food asked for and shared, materials
brought); the floor rule still holds (one conversation at a time nearby).
Raids are a choice with the consequences stated (fight with what it holds,
fetch a weapon, call the guard, run home, hide, shout a warning, talk bandits
out of it); the game's own answer runs until it has chosen. Some things stay
in code at every level: walking and the steps of a task, honest results,
one fight between characters at a time and never to the death, and safety
nets (starving for two game hours it eats; two hours past its bedtime it
goes to bed; an activity that failed three times running is left for an
hour; a job's command rule runs when its condition has held half an hour and
the character has not run it).

Under the presets is a profile: six decisions, each made by `code` or the
`model`: `activity` (what to do next), `plan` (the day's plan), `talk`
(starting conversations), `danger` (raids and monsters: shelter, fight,
flee), `needs` (when to eat and sleep) and `temper` (what it does when
provoked). Rails is all code; assisted has danger and needs in code;
guided and free are all model (free with open turns). `"autonomy"` may be
an object that changes some of them: `{"preset": "guided", "danger":
"code"}` (domains it does not name come from the preset; with no
`"preset"`, from the player's setting or the brain's). On Auto the
capability check marks each decision it failed for code, so a brain may come
out as "guided (danger and needs in code)"; Settings and Running now say so.
A need a character keeps failing to meet (two failed tries to eat, or to get
to bed) is handled by the game for three game hours, then handed back.
Brains below the check's comfortable band see a short menu (needs, their
plan and work first, then a few others).

### Worlds made for free

Free is hardest where it is usually measured: eight villagers sharing one
slow brain, a 12-minute day, work, meals and raids all at once. A world
that suits it is small and about people:

- **2 to 4 characters**, so each gets a turn often (turns are shared out by
  the brain's speed);
- **one shared situation** that gives them a reason to talk, trade or
  disagree (a will, one seat on a ferry, a missing map), not parallel work;
- **few activities**, each one `do(...)`: a simple job each (`cook`,
  `innkeeper`, `scholar`, `healer`, `merchant`), food in a chest by the pot
  and beds in the same room, so needs are quick to meet;
- **no raids or monsters** (or `"danger": "code"`);
- **a longer day** (`"dayMinutes": 24`), so slow turns still add up to one;
- **strong, distinct personalities** with a private `agenda` and a
  `secret`, so the freedom has something to show;
- `"autonomy": "free"`; for machines with 12 GB of graphics memory or less,
  `{"preset": "free", "needs": "code"}` (the game feeds them and puts them
  to bed; their own turns do the rest).

`scenarios/free-two-by-the-hearth.json` (two siblings, one cottage, a will
that makes them agree; the one for smaller machines),
`free-flooded-ferry.json` (three, one crossing at dawn) and
`free-snowbound-inn.json` (four, a stolen map) are built this way. On a
brain the game would run on rails they play on rails (above).

What it costs: guided asks the model about once per activity (a few seconds
on a capable machine); free asks for whole turns. Measured: maintainer skill,
brains.md, "Autonomy".

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
`greet`, `greet_guard` (what a guard, militia or other fighting job says
instead of `greet`: a watch, not a shop), `out`, `raid`, `raid_fighter`, `allclear`, `bed`, `patrol`,
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

- An event is a string, or `{"text", "spawn", "note", "gold", "mode"}`; `"mode"`
  switches the game mode as it happens ("How the game runs"). `{who}` is the
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
