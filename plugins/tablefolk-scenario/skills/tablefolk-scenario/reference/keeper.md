# The Keeper game (`packages/keeper`)

A Dungeon Keeper game made only of content on the God / Dungeon Keeper
foundations ([api.md](api.md#powers-resources-designations-demands-weather),
[living.md](living.md#marks-orders-and-demands-the-players-say)), the dungeon
twin of the God game ([god.md](god.md)). `scenarios/keeper-lair.json` ("The
Keeper's Lair") plays it.

## How it plays

The keeper has no body (`"player": { "avatar": false }`): the camera starts
high over the dungeon heart (drag to look, wheel to zoom), and the player acts
through the power bar at the bottom left:

- **⏸ Pause / ▶ Go on** and **×1 / ×2 / ×4** (time, as in the God game).
- **👹 Creatures**: everyone in your service (kind, level, wage, a happiness
  bar, on strike or leaving, what it is doing; 👁 looks at it), the imps, and a
  line for the dungeon: the rooms and their sizes, gold and how much the heart
  and treasury hold, the wages a pay day, the next pay day (or what is owed),
  research, traps ready, the heart's health.
- **▦ Mark**: the core Mark tool with the package's kinds: **dig** (drag over
  rock: the glittering squares are gold veins) and the seven rooms (drag over
  open floor), and **trap**.
- **💰 Pay wages** (while a pay day is open), **👇 Drop** (while the hand
  holds someone), **🏳 Call off** (while a call to arms stands).
- **The powers** (below), paid in gold.

The HUD shows **Gold** and the **Heart** (its health; at 0 the dungeon falls:
the flag `keeper_fallen`).

## The rock and digging

Every wall of the map is rock, drawn as solid blocks (the walls the game keeps
for paths and sight are inside them). The grid letter `g` (with `"legend":
{ "g": "wall" }`) is a **gold vein**, drawn glittering; the grid's outer ring
is the edge of the world, drawn darker, and cannot be marked. Mark **dig** over
rock (the Mark tool leaves out what is not rock and the edge); the imps take
the squares nearest first, but only ones with an open side to stand on (the
kind's `ready`), so a deep tunnel is dug from the mouth in. Rock takes three
blows, a vein four; a vein gives the imp 30 gold, which it carries to the
nearest treasury square, else to the heart. The heart holds 100 gold, every
treasury square 40 more; gold that does not fit is lost (a toast says so).

## Rooms

Mark a room over open floor (dug squares, the cavern; not rock, another room,
the heart, the portal or the gate). The imps claim it square by square (its
floor laid); when the last square is done the room is a place (`lair`,
`hatchery 2`...), lit, and furnished on every other square so the paths stay
open:

| room | furniture | what it does | draws (squares) |
|---|---|---|---|
| lair | beds (two squares long) down every other column | a bed for each creature; no free bed, no newcomers | goblins (9) |
| hatchery | sacks, apple barrels | a meal for every 2 squares, one back an hour for every 3 squares | (needed by all) |
| treasury | gold piles as it fills | 40 gold a square | kobolds (9) |
| training room | dummies | training: a session every game hour at a dummy, 1 gold and 1 xp; levels 2-5 at 4, 10, 18, 30 xp (+3 health, +25% wage each) | orc warriors (9) |
| library | bookcases, lecterns | research: a session every 45 game minutes, 2 points per level; 20 unlocks ⚡ Lightning | warlocks (9) |
| workshop | anvils, workbenches | crafting: a session every game hour, 1 point per level; a trap every 6 | a troll (9) |
| prison | cages, chains | a hero struck down is dragged here (one per square) and rises as a skeleton in your service two game hours later | spiders (6) |

## Creatures

They come through the **portal** (a turning purple ring) when a room big
enough for their kind is finished, a bed is free in a lair and there is a
hatchery: at once after the room is done, then at most one a game hour, the
specialists first (orc, warlock, troll, kobold, spider, then goblins). Each
kind's limit is one per its room's size (9 squares: one, 18: two) up to 3
goblins, 2 orcs, 2 warlocks, 1 troll, 2 kobolds, 2 spiders.

| kind | body | wage | health | work |
|---|---|---|---|---|
| goblin | goblin | 4 | 10 | trains |
| orc warrior | orc | 8 | 14 | trains |
| warlock | cultist | 10 | 9 | studies in the library |
| troll | troll | 7 | 18 | crafts in the workshop |
| kobold | kobold | 6 | 8 | guards the treasury |
| spider | spider | 3 | 8 | keeps the prison |
| skeleton | skeleton | 2 | 10 | trains |

On rails (code, no model) a creature's day is: the council or a call to arms
first; then heroes (it is a fighter: the core sends it at them); on strike, it
sulks in the lair; hungry (0.55), it eats in the hatchery; tired (0.7), it
sleeps in a lair bed until rested; else its work. Imps are always on rails:
gold in hand to the treasury, then marked work (digging, claiming, traps),
else back to the heart. Above rails (a brain loaded; the scenario's
`creatures` group is `"guided"`) only the urgent needs (hunger 0.85,
tiredness 0.9) are taken by code; their work, eating, sleeping, complaining
and going on strike are activities they choose among the others.

## Happiness, loyalty, wages

Every creature has happiness (0-100, starts 70) and loyalty (starts 50).

| what happens | happiness | loyalty |
|---|---|---|
| wages paid / paid within half an hour of the demand | +12 / +15 | +5 |
| a pay day missed | -25 | -15 |
| slapped / picked up by the hand | -6 / -2 | |
| healed / ate / slept / a work session | +3 / +2 / +2 / +2 | |
| a level gained | +6 | +5 |
| an hour hungry with an empty hatchery / tired with no bed | -4 / -4 | |
| a comrade killed / a hero struck down near it | -5 / +3 | |

Below 45 it complains now and then (a templated line by its grievance: wages,
food, a bed, slaps; above rails its own words); below 30 it may go on strike;
below 18 it may leave each hour (a chance of (1 - loyalty/100) x 0.5), and
leaves through the portal. **Pay day** comes every 8 game hours from the
start: the highest-level creature says the demand aloud ("Pay day! We want our
wages: 37 gold by 18:00."), a core demand of the player (`"of": "player"`,
met by the flag `keeper_paid_<n>`), with two game hours to pay. **💰 Pay
wages** pays it from the treasury (each creature gets its wage in its purse).
Missed: everyone -25 happiness and -15 loyalty, the bitterest leave at once,
and the **council** gathers at the heart: up to five speak (the unhappiest
first), each for waiting, a strike or leaving (on rails by its mood; above
rails its own words, read by `stanceOf`). The most votes win (a tie goes to
the milder): wait (those who said leave may still go, one at most), strike
(everyone stops work for two game hours, or until paid), or leave (those who
said so go).

## Heroes

The `heroes` threat kind (a knight with a sword, an adventurer with a dagger and a mage with
bare hands, 6 health each) comes from the place `hero_gate` at 21:00 every night
(`"threats": [{ "kind": "heroes" }]`; `tablefolkThreats.now('heroes')` at
once). A hero goes for the creatures and imps within 6.5 squares (the core's
raid), else for the heart, striking it for 4. They retreat when half are down.
A spike trap does 5 to the first hero on it. A hero struck down goes to the
prison if there is room, else the imps take 15 gold from it.

## The powers

| power | cost | target | what it does |
|---|---|---|---|
| ✋ Hand | free | a creature or imp | lifts it out of the world (up to 8 held, -2 happiness); 👇 Drop puts them down around a square |
| 👋 Slap | free | anyone | 1 damage; a creature or imp works about twice as fast for a game hour, a creature -6 happiness (and may say so) |
| ✚ Heal | 10 | a creature or imp | full health, +3 happiness |
| 🚩 Call to arms | 5 | a square | every creature goes to the flag and fights what comes near, for two game hours or until 🏳 Call off |
| ⚡ Lightning | 20 | anyone | researched first (20 points): lightning from the sky, 5 damage |

Possession is not built.

## For authors

- `"packages": ["keeper"]`, a grid of rock (`#`) with open floor (`:` `^`),
  gold veins `g` with `"legend": { "g": "wall" }`, `"places"` named `heart`,
  `portal` and `hero_gate` (an exact layout keeps its places), imps as agents
  (`"model": "imp", "hostile": false, "job": "keeper_imp"`), a group
  `creatures` (its `"autonomy"` is theirs) and `"threats": [{ "kind": "heroes" }]`.
- `"flags": { "keeper_rooms": [{ "kind": "lair", "x0": -13, "x1": -9, "z0": -7, "z1": -2 }] }`:
  rooms finished at the start.
- `"resources": { "gold": { "start": 80 } }`; `"wallHeight": 1.5` for low rock.
- Events: `tablefolk-keeper` `{ what: 'dug' | 'room' | 'arrived' | 'left' | 'payday' | 'paid' | 'missed' | 'council' | 'research' | 'dropped' | 'fallen', ... }`.
- `window.tablefolkKeeper` (tests): `rules` (the keeper-core state), `isRock`,
  `veins()`, `makeRoom(kind, cells)`, `payday()`, `payWages()`, `missedPay()`,
  `holdCouncil()`, `lastCouncil()`, `arrive(kind)`, `attract()`, `drop(x, z)`,
  `held()`, `rally()`, `callOff()`, `hatch()`, `capacity()`, `traps()`,
  `prisoners()`, `prisonTick()`, `showPanel()`, `quarter()`.
- The numbers are `RULES` and `KINDS` in `packages/keeper/keeper-core.js`.
