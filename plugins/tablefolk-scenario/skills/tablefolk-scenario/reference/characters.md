# Characters: commands, senses, minds

Each character (an entry in `agents`) is run by a small language model (Gemma
4 E2B in the browser by default) that answers each turn with command lines.
The game keeps everything a small model can't (feelings, hunger, memories,
prices, what it can see) and puts it in front of the model each turn.

## Commands (`allowed`)

The top-level `allowed` is every character's default; an agent's own
`"allowed"` replaces it for that character (a guard who can only `say` and
`face`, a mage with `spell.spark`, a merchant with `sell`). Allow only what
the scene needs: fewer choices make small models behave. `say` is almost
always wanted; add `walk` for movement, `give` / `sell` / `inventory` for
trading, `emote` for flavour.

| command | what it does |
|---|---|
| `say(text)` | speak (plain text without a command is spoken too) |
| `whisper(text)` | speech only the player hears |
| `walk(dest)` | to `"x,z"`, a direction (`north`, `southwest`...), a person, a thing or a place (`walk(bram)`, `walk(chest)`, `walk(tavern)`); stops beside things and people |
| `face(n)` | turn without moving (n/s/e/w) |
| `look()` | describe everyone and everything in sight (with a seeing brain: a picture from its own eyes, below) |
| `touch(target)`, `push()`, `pull()` | handle things |
| `carry(thing)`, `drop()`, `throw()` | pick up (walks over when it is a few steps away; a note is read), put down, throw |
| `dig(direction)` | through a wall, else a hole in the floor |
| `build(thing[, at])` | `build(wall)`, `build(crate, "3,5")`; never on top of something |
| `repair()`, `panic()` | |
| `emote(name)` | dance, laugh, sit, wave, clap, cheer, sleep, bow (unknown ones read as "(grub frowns)") |
| `note(text)` | write a note others can pick up and read; facing a wall, it is pinned there |
| `give(item[, name])` | hand an item to the player, or to another character: `give(bread, pip)`, `give(10 gold, pip)`; giving what it doesn't have fails |
| `sell(item, price)` | sell to the person it is talking with ([below](#trading)) |
| `inventory()` | check gold and items |
| `give_quest(text)` | give the player a quest |
| `goal(text)` | set what it is working toward |
| `remember(text)` | note something important |
| `eat(food)` | eat food it carries |
| `use(thing)` | use a thing with an obvious use ([below](#using-things)): open a chest (or say what is in an open one), sit on a seat, lie down on a bed, hammer at an anvil, chop a tree... |
| `take(item, chest)`, `put(item, chest)` | take from or store in a chest, opening it if closed (`take(5 gold, chest)`, `take(all, chest)`) |
| `close(chest)` | shut a chest |
| `feel(mood)` | show a mood (off by default: it used up turns) |
| `attack(target)`, `wield(item)` | [combat.md](combat.md) |
| `spell.push`, `spell.spark`, `spell.fireball` | the old built-in spells; prefer the `magic` skill |
| `fireball(target?)`, `lightning(target?)` (allowed as `spell.fireball`, `spell.lightning`) | a fireball (3 damage, burns things nearby) or a lightning bolt (4) at a character, the player or a thing by name; the caster takes 1 from the backlash. With no target (or itself, or one that isn't there) the spell comes back on the caster: the fireball falls on it (3), the lightning strikes it (4). A small model that forgets the target can kill itself, on purpose (the Oracle has 9 hp: three fireballs). The caster raises its arms and thrusts at the target (the rig's cast clip, held for the spell; a procedural arm raise on rigs without one). Particles, lights and 3D sound (`app/spells.js`) |
| `spawn(thing[, how many])` (allowed as `spawn`) | conjure 1-6 objects in front of the caster (`spawn(apple, 3)`, `spawn(3 apples)`); something that isn't in the game becomes a random small object |
| `workflow(name, input)` | start a routine ([workflows.md](workflows.md)) |

A character's command that fails (an unknown command, a wrong argument, one it isn't allowed) is dropped silently: it is neither spoken nor shown (dev mode logs it to the console); the player's own typed commands still say what went wrong.

`goal`, `remember`, `eat`, `use`, `take` and `put` are on for everyone with a mind; a role's and a
skill's commands are added for whoever has them. The list is `COMMANDS` in
`app/app.js`; what the model is shown is `buildCommandExamples`. Each prompt
also has a short menu of what it could do right where it stands ("You could,
right here: carry(note) (2 steps west), dig(north), eat(bun), give(bun,
pip), use(anvil) (1 step east: hammer)").

Mention commands by name in the personality when the character should use
them ("If insulted twice, attack(player).", "Only give it with give(silk
bundle) to someone who says the password.").

## Using things

`use(thing)` does what the thing is for; the character walks over first when
it is a few steps away (to a free cell beside it), and the prompt names
`use()` only when such a thing is within a few steps. A thing can be named by its type or its map label (`use(h1 chest)`); `sit`, `sleep` or `emote(sit)` beside a seat or bed, or walking onto one, uses it too.

| thing | `use()` |
|---|---|
| `chest`, `iron_chest` | opens it and tells what is inside (an open one stays open: `close(chest)` shuts it); `take(item, chest)` and `put(item, chest)` (gold too) open it if needed |
| `bed`, `double_bed` | lies down on it and rests (tiredness gone) |
| `bench`, `stool`, `wooden_chair`, `armchair`, `sofa`, `office_chair`, `throne` | sits on it (tiredness down a little) |
| `anvil`, `workbench`, `cauldron` | hammers, saws, stirs |
| `tree`, `logs` | chops (takes firewood) |
| `boulder` | breaks off a stone (takes it) |
| `well` | drinks (heals 1) |
| `lectern`, `bookcase` | reads |
| `target`, `dummy` | practises |
| `apple_barrel`, `apple_crate`, `carrot_crate` | takes an apple or a carrot (food: `eat` it) |

A sitting or lying character stays so while it talks; anything else gets it
up, beside the seat. A tired character's want says `use(bed)` when a bed or
seat is near. What a chest holds is kept with it (saved with the world): put
a ring in, and the player finds it there. The player does the same with E.

## Hearing, seeing and talking

- **Earshot** (default 6 cells): a character only hears and sees what other
  characters do closer than that. When the player talks to one character,
  the others in earshot overhear it (as context, "(to bram)", without having
  to answer). Together with `whisper`, this makes secrets, hand-overs out of a
  guard's sight, and "lure him away" plans work.
- The player picks who they talk to (the selected character, the "to:"
  picker, or an `@name` prefix); that one answers.
- **What a character sees** (its prompt): from where it stands, all round
  (not only the way it faces), up to 13 squares; line of sight always (so
  nobody sees into or out of a building through its walls), and in a `dark`
  world only lit squares (or right next to it). The object list leaves out
  walls and keeps at most three of each kind (four doors), sixteen in all,
  nearest first. It is written as "Around you" by direction with steps
  (`app/senses.js`), not as a map to count.
- **Sight**: with a brain that can see (the "Gemma 4 E2B with sight" model
  in the browser, or an endpoint model that takes images with Brain options
  > vision), `look` sends a picture from the character's own eyes, described
  in its own voice and shown to the player. `look` is not on offer for three
  turns after one.
- Characters talk like people: one or two short sentences; over-long speech
  is cut at a sentence; a repeat of one of its last 8 lines is not spoken,
  and a line that echoes what someone just said is dropped (the character is
  told). Two unprompted talking turns, then quiet ones unless spoken to.
- The dead say nothing.

## Trading

`give(item)` hands over an item the character has; `sell(item, price)` sells
it for `price` gold, which the character chooses. Either way the item lands in
the player's inventory, so `player_has` sees it. `give` and `sell` need the
player within 3 cells (a seller walks over).

The game keeps the rules (`app/trade.js`): a seller's `"prices"` (asking, or
`[asking, lowest]`) are shown to it each turn ("You sell: magic sword 50 gold
(never under 40)"), offers are read out of the customer's words ("Ana offers
45 gold: that is enough. Sell it now"), a sale below the lowest price is
refused, and a sale needs the buyer's agreement: otherwise `sell()` makes an
offer and the player gets a buy / no thanks card. The `trade` skill and the
`shopkeeper` / `innkeeper` roles bring this with no extra writing
([skills-and-roles.md](skills-and-roles.md)). Without prices, state the floor
price in the personality.

## Minds: feelings, needs, memory, goals

`app/mind.js` keeps, the same way for every character, what a 2B model
can't, and each turn the prompt gets a few short lines:

```
You feel: angry (Ana attacked you), nervous.
Body: hungry.
You want: eat something: eat(turnip).
Current goal: sell the sword (7 turns on it: what is the next step?)
You remember: Ana attacked you. | Ana gave you 10 gold.
You like: barnaby (gave you ale). You dislike: grub (attacked you).
```

- **Mood**: joy, fear, anger, sadness and trust toward the player; events
  (attacks, gifts, sales, seeing a fight) move them and they drift back.
  `temperament` (`brave`, `timid`, `calm`; else guessed from the
  personality) decides how it takes being attacked.
- **Opinions** of each other: gifts and blows between characters.
- **Needs**: hunger and tiredness grow slowly; `eat(food)` and
  `emote(sleep)` reset them. Off for skeletons, zombies, ghosts and slimes,
  and with `"needs": false`. Food is anything bread-, apple-, stew-like
  (`FOOD` in `app/mind.js`), pack items tagged `food` (with `nourish`), and
  the scenario's `"food"` list.
- **Memory**: game-recorded events, `remember()` notes, and facts:
  `"lore"` (world facts any character may know), an agent's `"backstory"`
  (always in its prompt) and `"knows"` (brought up when relevant). Recall
  blends keyword overlap with meaning ("smart memory": EmbeddingGemma 2 in
  the browser, `app/embed.js`, about 175 MB once; off in the Graphics pane).
- **Goals**: `goal()` sets one; after six turns on it the prompt asks for the
  next step.
- **Turns**: after each player action, nearby characters take a model turn
  only when spoken to, when something happened to them, when a want is
  pressing, every other round on a goal, else every fifth round.
- `"mind": false` turns the whole mind off.

Each turn's prompt ends with "Stay yourself: ..." and one sentence of the
personality, so write several short sentences of what the character does
([living.md](living.md)).

## Hostile characters and monsters

`"hostile": true` (the default for mindless monsters) fights the player with a
built-in routine and takes no model turn; a hostile character with a real
personality also talks. See [combat.md](combat.md).

## Voices

Characters speak aloud (Pocket-TTS in the browser, on by default; the player
can turn it off or pick another engine in the Voice pane). `"ttsVoiceId"`:
`builtin:alba azelma cosette eponine fantine javert jean marius`; the default
fits the body. Voices are placed in space (stereo pan, quieter with
distance). The Voice pane can also clone a voice from a sample.

A library of 20 designed voices (`assets/voices/`, made from text
descriptions with fal.ai's Qwen3-TTS Voice Design by `tools/fal-voices.py`;
Pocket-TTS clones each sample the first time it speaks) is named
`pack:<id>`: `hero_young_f innkeeper_f sorceress_f noble_f crone_f shy_f
huntress_f thief_f knight_m dwarf_m tavern_m wizard_m squire_m rogue_m captain_m
farmer_m scholar_m villain_m king_m hooded_x`. A character without a
`ttsVoiceId` gets one of its gender from the library (the same one every
time); the world generator casts from it by description.

## Very small brains: simple mode, a world's default brain, the whole system prompt

Three fields, in the JSON and on the world builder's Story and Characters tabs:

- **`defaultModel`** (scenario): the brain this world starts on, by its key:
  `qwen1.5-0.5b`, `qwen2.5-0.5b`, `gemma4-e2b-litert`, `gemma4-e4b-litert`, `gemma4-e2b-vision`,
  `bonsai2-27b`, `endpoint`. It travels in the world's link, wins over the brain
  the player last picked (without replacing it: a world with no default goes back
  to that one), and asks before any download. A `?model=<key>` on the link wins
  over everything, and the player can still change brain in the top bar.
- **`simple`** (scenario or character; `true`, `false`, unset for automatic): for
  a model too small to follow the usual prompt. The prompt is only who it is, one
  line asking for the words it says out loud, and what was just said. Whatever it
  writes is spoken: `say(...)`, names in front and stray tags are taken off, and
  only the first line counts. No map, state card or command list, and no guards
  against repeating itself (a repeat beats silence). The only commands are `walk`,
  `give`, `sell` and `attack`, when allowed. Automatic means on for brains that ask
  for it (Qwen 0.5B). `?simple=1` or `0` on a link sets it for characters and
  worlds that leave it unset.
- **`onlySpokenTo`** (scenario or character; `true`, `false`, unset for automatic): it takes
  a turn only when someone speaks to it, so no idle turns and no reacting to events.
  Automatic means on in simple mode: with nothing said, a tiny model has nothing to go on
  (Qwen 0.5B says "As an AI language model..."). The `director` (random events in a living
  world, on the builder's Story tab too) is a separate switch.
- **`systemPrompt`** (scenario, or a character's own, which wins): replaces the
  whole system message, in any mode. `{name}`, `{style}`, `{personality}`,
  `{backstory}` and `{commands}` are filled in. What happened, what it perceives
  and what was said still come in the turn's messages (in simple mode that is only
  the talk).

`scenarios/the-oracle.json` uses all three.
