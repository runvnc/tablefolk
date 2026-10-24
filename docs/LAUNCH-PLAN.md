# Launch plan: characters that do interesting things

Written overnight on 2026-10-24, for a launch about a week out. The concept: set
up a scenario, then the characters do dumb and/or interesting things that are
entertaining, funny or fascinating, with each other and with the world. This
page is the brainstorm, what was built, what was tested, and what is left.
The newest notes are at the bottom (Progress log).

## What a 2B/4B model can actually carry

Gemma 4 E2B (and E4B, a little better) in the browser, one short turn each:

- It is good at **reacting**: to something said to it, something that just
  happened next to it, a feeling the game tells it it has. It is bad at
  long plans, counting squares, and remembering what happened 8 turns ago.
- So the game has to **hand it a reason to act** every turn (an event, a
  need, a feeling, a goal), and **a short menu of concrete things it can do
  right here** (the object in front of it, the person next to it). Then
  even a 2B model makes a choice that reads as character.
- Comedy comes from **commitment** (a character who is very sure about the
  wrong thing), **escalation** (one thing leads to another), and **other
  characters reacting** (an audience). Small models are great at confident
  nonsense; the game should give that nonsense consequences.

## Brainstorm

Already in the game: say/whisper, walk, face, look, touch, push/pull,
carry/drop/throw, dig (breaks a wall or makes a hole), build (wall, crate,
door), repair, spells (push, spark, fireball: burns wood), eat, give/sell,
attack/wield, note (write a note), remember/feel/goal, emotes; feelings,
needs (hunger, tiredness) and memory (mind.js); fog of war, torches, locked
doors; hostile monsters that fight on their own.

Ideas, by how much they would add for how much work with a small model:

**Big, cheap**

1. **Let them live** (watch mode for players). Today characters act only
   after the player moves, and the free-running loop is a dev button. A play
   button (and Space/P) that keeps the round going, everyone in turn, with the
   player as a spectator who can still step in, talk or throw a goblin a coin.
   This is the core of a toybox: set it up, press play, laugh.
2. **The director** (events that stir the pot). Every few rounds something
   happens: a rat scurries in, a lamp goes out, a stranger knocks, a chest
   rattles, rain leaks, someone's lunch goes missing, a rumour reaches a
   character ("someone says Grix cheats at cards"). Told as `[event]` lines
   to the characters who would notice. Small models react well to events;
   this replaces planning with reacting. Scenarios can list their own
   events; there are generic ones for dungeons, villages, taverns.
3. **Look with real sight**. `look` takes a picture from the character's own
   eyes and a vision model describes it, in the character's voice; the
   description goes into what it knows. In the browser: full Gemma 4 E2B
   (the multimodal file, not the text-only web build) with the LiteRT-LM
   nightly's vision encoder (tested: 4 s for a description). Or the endpoint
   brain's model (Gemma 4 26B takes images). Funny on its own: characters
   misread the scene with total confidence.
4. **"Here you could..."**: one prompt line of concrete things it can do on
   this square: `dig(wall north)`, `eat(mushroom)`, `carry(barrel)`,
   `build(wall)`, the chest it could open, the person it could talk to. A
   menu turns "I should do something" into a specific funny action.
5. **Gossip and opinions**: what a character sees others do (and what it is
   told) moves how it feels about them (mind.js already has trust for the
   player; extend to everyone). Whispered rumours spread. Characters who
   like each other help; who dislike each other argue, steal, block doors.

**Medium**

6. **Construction and destruction with consequences**: building walls that
   really block paths (barricading a door when scared, a goblin who walls in
   the shopkeeper), digging through walls (a tunnel to the treasure), fire
   that spreads over wood (a fireball in the tavern). The game already has
   these as commands; make them visible, persistent and told to everyone.
7. **Objects with a use**: beds (sleep), food (eat), notes (read and write:
   characters leave each other notes), chests (open, hide things in),
   levers, wells, campfires (cook). Each a short line in the menu.
8. **Scenario showcases** that are built to be funny with a small model:
   goblin construction crew, a bakery feud, a haunted tavern where the
   ghost wants to be taken seriously, a dragon who is bad at negotiating, a
   necromancer's job interview.
9. **Highlights**: the game keeps the best lines (what was said, with who
   and when) for a "what happened" card at the end; shareable.

**Later**

10. Day and night, schedules (routines exist: workflows.js).
11. Characters who make things (build a table, cook a pie) from items.
12. A character who keeps a diary the player can read.

## Order of work

1. Let them live (watch mode).
2. Look with sight (browser vision model + endpoint).
3. "Here you could" affordance line; check that dig/build/carry/throw work
   and show in every wall style.
4. The director: generic and scenario events.
5. Opinions between characters, gossip.
6. Showcase scenarios; test each with E2B in the real browser, read the
   transcripts, fix what is boring or broken; repeat.
7. Launch QA: cold start, first five minutes, errors in the console, the
   world builder, admin, phones, docs.

## Progress log

(newest last)
