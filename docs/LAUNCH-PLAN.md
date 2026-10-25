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

**2026-10-24 morning (overnight session)**

- **Let them live** (`app/live.js`): P or the ▶ button next to the view
  buttons; everyone with a mind takes turns on their own, the ones the
  player can see every round, the rest every third; mindless monsters come
  for the player or wander. A scenario can start that way (`"live": true`).
- **The director** (`app/director.js`): every few turns (at most once in
  20 s) something happens next to a character the player can see, told to
  it and to those near, shown as a narrator's line, sometimes made real (a
  note, coins, a mushroom, a crate). Scenario events first (`"events"`),
  then generic ones for dungeons, indoors, outdoors. `"director": false|N`.
- **Sight** (`look` with a vision model): the character's own view (the
  player's fog and wall cutaway lifted for that frame, its own body hidden)
  goes to the model, which says what it sees in the character's voice; told
  to it next turn, and shown to the player as a picture card.
  - In the browser: **Gemma 4 E2B with sight**, the full multimodal
    `gemma-4-E2B-it.litertlm` (2.6 GB; the web builds are text-only, says the
    model card), run by `@litert-lm/core@0.19.0-nightly.20261023` with
    `visionBackend: GPU` (0.14-0.18 cannot take images in the main engine).
    Tested in the game: ~4 s per picture, accurate and in character.
    About 3.3 GB of graphics memory with the game: fine on a 6 GB card, too
    much for 4 GB (the test Chrome ran out once with leftover workers).
  - Or the endpoint brain's model (Gemma 4 26B takes images), when Brain
    options > vision is on.
  - The model downloads from Hugging Face (slow); **to do: mirror it on the
    R2 bucket** next to the web builds (`MODEL_MIRRORS`), I did not upload
    anything. A local copy can be named for tests with
    `localStorage['tablefolk_model_url:gemma4-e2b-vision']`.
- **Fixed on the way**:
  - The worker's conversations overflowed the 8192-token context after a
    few turns ("Input token ids are too long"), and every turn after failed
    at once (which also made the director fire 20 events in a row): history
    now kept to a budget, and a retry with none.
  - The game's temperature never reached the engine; the vision model's own
    defaults garbled lines, so it now gets the game's (top-p). The web
    models keep their defaults (what the evals were run with).
  - Echo guard: lines that copy what anyone said lately (or its own
    catchphrase again), or quote the history's "grub says ..." wording.
  - `look` is not on offer for three turns after one.
  - "You could, right here: carry(note) (2 steps west), dig(north),
    eat(bun), give(bun) to pip, build(wall)": a short menu in each prompt.
  - `carry(note)` walks over and picks it up (it ignored its argument);
    `dig(north)`; walking to a thing stops beside it; `build` never on top
    of something; unknown emotes read "(grub frowns)".
  - 404s for prop textures were a stale cache in the test profile only.
- **Showcase**: `scenarios/goblin-bakery.json` (live, director events). In a
  4-minute run with E2B: Grub accuses Thistle, Thistle finds and reads the
  recipe note, Pip digs holes and throws things, the oven smokes; no errors.
- Tools: `tools/browser-test/live-watch.mjs` (watch a scenario live and
  keep the transcript), `tools/browser-test/render-tiles.mjs`,
  `tools/bump.py` (cache-busting versions for changed files and importers).

**2026-10-24, later**

- Welcome screen with five showcase worlds (all tested live with E2B, 0
  errors; an 8-minute bakery run stayed coherent). The download question now
  waits behind the welcome screen and intro card.
- Characters: give things and gold to each other, walk(name), carry and
  hand over what they hold, diagonal walks, plain action results, a
  stay-in-character line, timed turning points, the same goal again ignored.
- Generated worlds (cloud and in-browser) now come out living, with events.
- Server for a public launch: visitors' use of the server AI is gated by the
  admin page and rate-limited; requests through a proxy/tunnel are visitors.

**Left for launch**
- Mirror `gemma-4-E2B-it.litertlm` (vision model) on the R2 bucket (needs you).
- Check phone layout (screenshots taken but not yet reviewed).
- Wolf tile renders wrong; turned objects not shown turned in the editor.
- Done: / serves the landing page (index.html); the app stays at /app/.

**2026-10-25**

- Phone layout fixed (top bar, banner, chat dock); no toast for every
  character line (only those that name the player).
- Map editor: things from the Things tab were placed as characters (fixed);
  turned objects drawn turned; clicking the map takes focus out of fields;
  `tools/browser-test/editor-test.mjs` checks every tool (18 checks, pass).
- Wolf: its file's skinning is broken in Babylon; a big grey rat stands in.
- Landing page (index.html): new pitch and the showcase worlds.
- Evals after all the prompt changes: shop-role 2/2, roles 4/4, smithy and
  companion pass, feelings 'hit' 3/3 (it fell to 0/2 when the new
  stay-in-character line sat below the feelings; moved above them).
- Pacing (`app/live.js`): calm / lively / busy by the live button; each
  character has its own next-turn time, a spoken line holds the next back,
  those with nothing to react to mostly idle without the model, and the
  player's own activity sets the tempo. The director spaces events by the pace.
- Roofs (`app/roofs.js`): walled rooms in a world with an outside (villages,
  Stonebrook) get thatched gable roofs, found from the walls themselves (doors
  and one-square open doorways close a room). The roof over the player's room
  fades away, one between the camera and the player or under the pointer goes
  see-through, R lifts them all. None in one-building worlds (the bakery), dark
  worlds or dungeons; `"roofs": true|false` overrides.
