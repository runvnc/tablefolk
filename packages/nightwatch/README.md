# The Night Watch: a game as a package

A small game made only from a package (this folder) and a scenario
(`scenarios/nightwatch.json`), with nothing changed in the game itself. It
is the example to copy: every part below is one of the extension points
in the scenario skill's `reference/api.md`.

You stand the night watch at a hill fort. The beacon on the hill must burn
till dawn: dire wolves circle while it burns and close in when it dies.
Odo the keeper feeds it from the woodpile; Brenna the captain briefs you;
if it goes wrong, `signal()` at the fire calls the militia. Hold two nights
with Odo alive.

Play it: `http://localhost:8000/nightwatch` (the short link),
or open `scenarios/nightwatch.html`.

## What is in the folder

| file | what |
|---|---|
| `tablefolk.json` | the manifest: everything that is data |
| `nightwatch.js` | the code (about 175 lines): the beacon, `signal()`, the card line, the effect, the wolves' behaviour |
| `models/beacon.glb`, `models/woodpile.glb` | the fire pit and log pile (Quaternius, CC0, copied from the game's assets) |
| `models/dire_wolf.glb` | the game's wolf (made for Tablefolk on Quaternius' CC0 skeleton and clips), used here as a body of the package's own |
| `sounds/howl.ogg` | a wolf howl (freesound 398430, CC0, from the game's voice banks) |

## Walking through `tablefolk.json`

**Two object types** (`items`). `signal_beacon` is a fire pit whose `"use"`
names code: `"use": "tend_beacon"`. `woodpile` is data only: `"stock"` (six
firewood, `"regrow": 0`, so it runs down) and `"gather"` (how taking from
it looks). Characters and the player take firewood from it with
`use(woodpile)`; jobs with a `gather` step.

**A body** (`bodies`). `dire_wolf` is a rigged GLB with its own height
(`"h": 0.95`, taller than the game's wolf), its clips mapped to the
game's names (`idle`, `walk`, `run`, `attack`, `hit`, `death`) plus one of
its own, `howl`, listed in `"emotes"` so `emote(howl)` plays it. `"kind":
"monster"` and `"mindless": true` make it fight with no model;
`"natural"` is its bite; `"hp": 8`. No code: any scenario that loads the
package can write `"model": "dire_wolf"`, and lists it in `"bodies"` so the
world builder keeps it.

**A sound** (`sounds`). `"howl": "sounds/howl.ogg"`: the wolfpack threat's
`"sound"` and the module's `api.sound('howl', ...)` find it by name.

**A skill** (`skills.watchkeeping`). Data: a prompt line, `"card":
["beacon"]` (a state-card line the module provides) and a `kindle()`
command whose effects are `take` (built in) and `kindle` (the module's).
The scenario gives it to Brenna and Odo.

**A job** (`jobs.beacon_keeper`). Night hours, sleeps by day. Its steps:
`gather` firewood `"when": "world.beacon_fuel < 5 and not me has firewood"`
(a story condition on a flag the module keeps up to date), `use` the
beacon with `"needs": {"firewood": 1}` and `"anim": "pickup"`, then pace
the square. `"commands": ["signal"]` lets its keeper use `signal()`.

**A threat kind** (`threats.wolfpack`). Three dire wolves at night from the
map's edge, `"behaviour": "raid"`, a `"sound"` and an announcement. The
module's function of the same name decides their turns.

**A workflow** (`workflows.briefing`). Brenna's briefing: a line, then an
inline menu (duty, wolves, ready) that loops back until you are ready, then
a flag (`world.briefed`) and a wave (`"anim"` in a `do`). It needs no model:
the scenario starts it with a trigger, `{"on": "start", "as": "brenna",
"do": {"start": "briefing"}}`.

**Code** (`"modules": ["nightwatch.js"]`). From this site it runs at once;
from anywhere else the player is asked first, and "data only" still gives
the things, the body, the sound, the job and the threat (the beacon then
says it needs its code).

## Walking through `nightwatch.js`

It exports one function that receives `api` and returns what it adds.

- **State and the fire.** A beacon's state is its `meta(mesh).state`
  (`lit` or `out`, what a `prop_state` goal sees) and `opts.fuel` in game
  hours. The fire pit model has no animation, so the flame is made in code:
  a Babylon particle system, a light from `api.light` (inside the game's
  light budget) flickering every frame, and a glow on the stones. It
  publishes `beacon_lit` and `beacon_fuel` as flags (`api.flag`), which the
  job's `when`, menus and goals can read.
- **The clock.** `api.on('tablefolk-clock', ...)` burns a quarter hour of
  fuel each game quarter hour and puts the fire out at zero (the narrator
  says so). `api.on('tablefolk-scenario-started', ...)` lights the beacons
  (`"lit": false` on the scenario object starts one cold).
- **`uses.tend_beacon(thing, who)`**: a log from whoever uses it feeds the
  fire (and lights it); the player with no log douses a lit one; a
  character with none gets `{ fail: "..." }`, which its next prompt reads as
  FAILED.
- **`commands.signal`** (`allowedBy: "listed"`): next to a lit beacon, once
  a night, it spawns two militia with `api.spawn` (a `guard` body, style
  "militia spearman", so the game's guard job sends them to fight) and
  returns the result line; otherwise `ctx.fail(...)`.
- **`cards.beacon`**: "The beacon burns (fire for about 4 hours)", or, when
  it is out, an urgent line (it starts with `!`, so it goes last in the
  prompt).
- **`effects.kindle`**: hours of fuel for the beacon beside the user, for
  the skill's `kindle()`.
- **`threats.wolfpack(c, ctx)`**: while a beacon burns, each wolf walks a
  circle around it (`ctx.walkTo`) and howls now and then (`api.playClip(c,
  'howl')`, `api.sound('howl', c)`); when none burns it returns `false`,
  and the kind's `raid` behaviour sends them at people.
- **`dispose()`**: when the scenario ends, the fires go out (particles and
  lights are not part of the map, so nothing else would remove them).

## The keeper, the militia and the goal

- The keeper's job lists `signal` and a **rule**: `{"run": "signal()",
  "at": "signal_beacon", "when": "world.beacon_lit and raiders > 0 and not
  world.militia_called"}`: when the wolves come and the fire burns, the game walks Odo to the beacon and signals,
  with no model call.
- `signal`'s **`offer(g)`** returns "signal the militia from the beacon"
  when it would work (a lit beacon within 8 cells, wolves about, not yet
  called tonight): the game's short picks (danger, a stuck job, an event)
  then include it, for whoever may use it (Brenna too).
- The **`militia`** job (`"fights": true`, `"defends": "signal_beacon"`):
  the spearmen signal() brings (`api.spawn(..., { job: 'militia' })`) keep
  to the beacon and take on the wolves that come within 8 cells of it.
- **`goals.beacon_burning`**: the scenario's win needs the beacon still
  lit at the second dawn.
- **`lines`**: its own raid shouts, a challenge and a call for firewood
  (the game's templated lines).

## Tested

`tools/browser-test/package-test.mjs` checks every part above with no
model, from this site and from a second origin.
