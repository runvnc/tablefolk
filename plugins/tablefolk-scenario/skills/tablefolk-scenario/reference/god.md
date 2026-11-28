# The God game (`packages/god`)

A game made only of content on the God / Dungeon Keeper foundations
([api.md](api.md#powers-resources-designations-demands-weather),
[living.md](living.md#marks-orders-and-demands-the-players-say)): the player
is a village's god. `scenarios/god-village.json` ("God of Ashford") plays it;
any village scenario can load it with `"packages": ["god"]`.

## How it plays

The god has no body (`"player": { "avatar": false }`): the camera starts
high over the shrine (drag to look, wheel to zoom; zoomed in on a building,
its roof fades and you see who is inside), and the player acts
through the power bar at the bottom left:

- **⏸ Pause / ▶ Go on** and **×1 / ×2 / ×4** (the clock, everyone's turns,
  their walking, their animations and physics that much faster;
  `tablefolkModes.setSpeed`).
- **🙏 Prayers**: the prayers waiting, each with who prays (their side and
  belief), what for and in what words, the hours left, and three answers: the
  power that fits (a gift of food for hunger, heal for sickness, rain for a
  drought, smite or fog against beasts, bless field for a blight), **💭 a
  dream**, or **🤐 silence**. 👁 looks at the one praying. The **village** tab
  lists everyone's belief, side, household and sickness, and the decrees.
- **📢 Decree**: words such as "I require a goat sacrifice by the full moon".
  The game shows how it read them (what, of whom, by when) and asks what
  follows if it is not done (a storm by default; plague on a refuser's
  household, blight, beasts, lightning on a refuser, a drought, or nothing).
- **The powers** (below), paid in mana.
- **Mark** and **Orders** from the core work too (marks for work, standing
  orders, plain demands).

The HUD (top left) shows **mana**, the village's **belief** (the average), and
each group's average belief (the faithful, the doubters, each household).

## Belief and mana

Every villager has a belief from 0 to 100 (an agent's `"belief"`, else 70 for
the faithful, 25 for the doubters, 50 for anyone else). At 60 or more a
villager joins **the faithful**, at 35 or less **the doubters**; in between it
keeps its side (the narrator says when someone converts). Groups named
`house_...` (or described as a household) are households: plague takes a
household, cruelty hurts one.

**Mana** comes every game hour from belief (each villager's belief / 100 x
0.25; five villagers at 60 give 0.75 an hour, 18 a game day), from offerings
(a faithful villager with food to spare leaves one when praying: bread 2,
meat 3, wheat 1...) and from met decrees (an offering's worth + 5, a
sacrifice 15, worship 3 + 2 a worshipper, work 10). Up to 150. It is meant to
run short: a player who answers every prayer has little left for omens,
decrees' rewards and the dearer powers.

| what happens | belief |
|---|---|
| a prayer answered by a fitting power | +8 to the one who prayed, +2 to those near, +1 to its side |
| a dream (whether or not it answers a prayer) | +3 (+5 for a doubter) |
| silence chosen / a prayer left to lapse (3 game hours) | -2 / -4 (none for thanks) |
| harm for no reason (smite, plague, blight, beast, drought on someone who refused nothing and missed nothing) | -15 to the victims, -8 to their household, -4 to everyone else |
| harm with a reason (they refused a decree, or one they were bound by was missed) | +2 to the faithful, +3 to the rest (fear) |
| a beast or raider struck down | +4 to those near |
| an omen | +2 to the faithful, +1 to the rest |
| a prophecy kept (the omen's words, then that power within 12 game hours) / broken | +5 / -5 to everyone |
| a decree met | +5 to those bound, +1 to everyone else |
| a blessing on one who met it within 6 game hours / none | +3 / -3 to those bound |
| a decree missed and punished | +2 to the faithful, +3 to the rest (fear) |
| a decree missed and let go (mercy) | -5 to the doubters and refusers, +1 to the faithful |
| voted against a decree at the council and refused it | -3 |

Belief moves over days, not minutes:

- **Diminishing returns**: a gain is divided by 1 + (what that villager
  gained in the last game day) / 10: a second +8 the same day gives about
  +4, a third about +3. A doubter is won over in three or four days of
  attention, not one afternoon.
- **Near the ends**: within 30 of 100 a gain shrinks in proportion (at 90 a
  third of it), and within 30 of 0 a loss does; 100 is all but out of reach.
- **Drift**: every game hour belief moves 2% of the way back to the
  villager's resting value (its starting belief), and the resting value 0.6%
  of the way toward belief: a burst of favour fades in a day or two, but
  faith kept up for days lasts.

Measured with `node tools/god-balance-sim.mjs` (five game days of God of
Ashford with a scripted player who answers about half the prayers, sends
one omen and keeps it, one decree and its reward, one cruel lightning
strike, beasts on day 4): with the old numbers someone reached 100 in every
run, the first after 2.5 game hours, and mana sat at its cap; now no one
reaches 100, the faithful end near 75-95, the doubters near 35-45, and mana
dips to about 13 (a player answering nine prayers in ten runs out now and
then).

The numbers are `RULES` in `packages/god/god-core.js`.

## Prayers

Every game quarter hour a villager may feel the need to pray: beasts about
(safety), sickness or wounds (healing), hunger (food), a drought (rain), a
blight (harvest), a decree to meet (strength), a prayer answered lately
(thanks), or, for a doubter with nothing wrong, a sign. The weightier the
need and the stronger the belief the likelier (doubters pray mostly in need);
at most four prayers wait at once, one each, and not again within 2.5 game
hours. On rails the villager walks to the shrine before its own work,
kneels and says a templated prayer: outside its door, facing it, when the
shrine is a building (so you see it from above at any zoom, roof on or off),
with a column of light over them while they pray; above rails (guided or free, a brain loaded)
the prayer is in its own words, and praying is one of the activities it may
choose. A prayer waits 3 game hours for an answer.

A power used on the one who prayed (or on the place where it stands, or
anywhere for rain) answers its prayer when it fits the need, wherever it was
cast from: the Prayers list, the bar, or a decree.

## The powers

| power | cost | target | what it does |
|---|---|---|---|
| 🌧 Rain | 6 | a square | rain there for a minute; crops within 8 squares grow (+1, withered ones revive); ends a drought |
| ☀ Drought | 10 | none | a day without rain (the weather `drought`, the flag `drought`): crops wither one by one, hunger grows |
| ⛈ Storm | 8 | a square | a storm (rain, lightning on three empty squares, thunder); ends a drought; answers rain |
| 🌫 Fog | 4 | none | thick fog; beasts and raiders lose their way and leave (`tablefolkThreats.retreat`) |
| 🌾 Bless field | 5 | a square | crops within 4.5 squares grow (+2) and the blight lifts there |
| 🐑 Bless herd | 6 | a square | the animals near thrive: a young one is born (up to 9 animals), the nearest villager gets 2 wool or milk |
| ✚ Heal | 4 | a villager | full health, sickness gone |
| 🍞 Gift of food | 3 | a villager | three loaves in their hands |
| ⚡ Smite | 8 | anyone | lightning from the sky (`tablefolkSpells.strike`): kills a beast or raider, wounds a villager (4) |
| ☣ Plague | 14 | a villager | their household falls sick: they keep to their beds (no work), grow hungry, lose health down to 3; each hour it may spread to anyone within 2.5 squares (1 in 4) unless healed; it passes after a day and a half |
| 🥀 Blight | 10 | a square | crops within 4.5 squares wither (stock 0; the flag `blight`) and the ground there takes a grey-brown stain (round each withered crop and over the area) until they are blessed or rained on |
| 🐺 Beast | 12 | none | two beasts come out of the wild (the core `raid` threat) |
| 💭 Dream | 2 | a villager | your words, privately: remembered, on its card for half a day, told to those near in the morning; what it asks (a demand, a warning, go somewhere, comfort) is read from the words, and a demand in a dream becomes a decree through the dreamer |
| ☄ Omen | 6 | none | a ring of fire in the sky over the shrine (lower, or over the middle of the view, when the shrine is out of view; its size follows the zoom, so it is seen whole at any zoom); with words it is a prophecy; a believer and a doubter say what they make of it |

## Decrees and the council

A decree's words are read by code (`parseDecree`): an **offering** ("bring 3
bread", "a tribute of 2 wheat"), a **sacrifice** of an animal ("a goat
sacrifice": a sheep when there are no goats), **worship** ("everyone shall
gather and pray at dawn") or **work** ("build a wall around the temple": the
core plan language marks it). Of whom: a group or a person named, else
everyone. By when: "by evening", "by noon", "at dawn", "tomorrow", "in 3
hours", "in 2 days", "by the full moon" (21:00 of every third day), else a
day. Words code cannot read go to a fixed choice of the four kinds: the
decision model (the Strands Decider) when it is loaded beside the brain
(This device pane: auto loads it when the graphics card has room and it is
downloaded; on downloads it, 2 GB), else the menus' matcher (keywords,
meaning, the brain).

Then the priest (an elder, priest or chief by role or look) has a **vision**
(a ring of light over them) and calls the village to the shrine. The
**council**: the villagers walk there (half a minute at most), the priest
says the demand, up to five speak (the most devout first): on rails a
templated line for their vote (by belief and side), above rails their own
words, read as agree, refuse or bargain: by code first (`stanceOf`: a yes
or a no with a condition or a delay, or a deal such as "half now", is a
bargain; "we must not" and "I will not" are refusals), and words code
cannot place by the decider when one is loaded, else the menus' matcher. The votes decide
(`vote`): **accept**, **bargain** (half as much time again) or **refuse**.
The demand is then made (the core: on everyone's card, the priest says it):
those who voted no refuse it when the village refused, and the bitterest
(belief below 25) refuse it whatever was decided; the rest carry it out.

On rails: an offering is fetched and left in the shrine (core); for a
sacrifice one member fetches the animal and leads it to the shrine, where it
is taken up in fire; for worship each member goes to pray. Above rails each
is an activity ("do as the god demanded"), and refusing is too (core).

Met: mana and belief (above), a reward owed. Missed: the anger chosen falls
free of mana (on a refuser, else the least devout member, or the fields),
and belief follows (above).

## On rails and above

Nothing needs a model: prayers, council speeches, omen readings and dream
tellings have templated lines, votes follow belief, and the obvious work is
done by code. With a brain and characters above rails (a scenario's or
group's `"autonomy"`: the doubters are `"free"` in God of Ashford), prayers,
speeches, omen readings and dream tellings are the characters' own words,
and a council vote comes from what they said. Each such line is one short
model call (`tablefolk-model-call` kind `god`). Measured with Gemma 4 E2B on
an RTX 2060 (`tools/browser-test/god-words-eval.mjs`): prayers in 0.35-3 s,
a council of four or five speeches in about 15 s of model time, and in
three councils all 12 votes read from the words matched what was said (9
read by code, 3 by the matcher; a cautious "I will, but first..." as a
bargain, a doubter's objection as no).

With Bonsai 2.5 27B on a 16 GB card (RTX 4080 SUPER, God of Ashford at
`autonomy` guided, a day of 24 real minutes, 10 game hours with a scripted
god: the field blessed, an offering decreed, an omen of rain then the rain, a
dream to the least devout, a decree to pray at dusk; 2026-11-27): 123 model
calls (9.5 a game hour, a turn 13 s), every activity chosen by the
villagers' model, 3% of turns wasted. Both councils took 33-41 s and the
votes matched the speeches: the faithful agreed with reasons of their own
("three loaves is a small price for grace"), Bram and Finn refused in
character ("Three loaves? That's more than half my pantry... I refuse"), and
all 10 speeches were read by code. The offering was carried out and met. Only
two prayers came in 10 hours, both thanks (nothing to answer). Finn told his
dream aloud the next morning. Belief went from 54 to 60.5 after the omen came
true, then settled at 59; mana stayed between 21 and 34. An LLM judge
(`judge.mjs`) gave the villagers 4.0 coherence, 4.6 personality, 4.4
purpose, 3.2 surprise. Tools: `tools/browser-test/god-player.mjs` beside
`live-eval.mjs` (the maintainer skill's brains.md, "Rented-card checks").

## For authors

- `"packages": ["god"]`, groups `faithful` and `doubters` (and `house_...`
  households), a place called `temple` or `shrine` (or the flag
  `god_shrine`), agents with `"skills": ["faith"]` (the card: belief, side,
  sickness, a dream, a recent sign) and an optional `"belief"`.
- Flags: `god_shrine`, `god_anger` (the default anger), `god_sick` (a
  villager sick at the start); the package sets `blight` and `drought`.
- `"player": { "avatar": false }` for no body; the camera then starts over
  the shrine.
- Events: `tablefolk-god` `{ what: 'power' | 'prayer' | 'dream' | 'decree', ... }`.
- `window.tablefolkGod` (tests): `rules` (the god-core state), `decree(words,
  { council, anger })`, `readDecree`, `council()`, `sick()`, `makeSick(g)`,
  `cure(g)`, `runPower(name, target)`, `shrine()`, `showPanel(tab)`.

## Not built yet: a Dungeon Keeper variant

The same foundations would carry a keeper of a lair: what it needs on top of
this package is content again: designation kinds for rooms (lair, hatchery,
treasury, training room: `designations` with `work.paint` and a `build`),
a resource for gold dug from marked rock (`dig` marks already give stone),
creatures that come when the rooms are big enough (a module's `api.spawn` on
`tablefolk-designation` done), their pay day and their mood (a resource and
a demand of the keeper's own: "pay us by nightfall"), heroes as a threat kind
from the edge (`threats` with `from`), and the hand of the keeper (a power
with `target: 'character'` that lifts and drops). A dungeon map
(`"generate": { "kind": "dungeon" }`) with the camera overhead, and the
creatures' own autonomy (a group `"autonomy": "free"` for the proud ones).
