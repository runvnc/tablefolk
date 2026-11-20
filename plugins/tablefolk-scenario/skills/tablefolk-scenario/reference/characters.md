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
| `sell(item, price)` | sell to the person it is talking with; `sell(item, price, name)` to someone else ([below](#trading)) |
| `inventory()` | check gold and items |
| `give_quest(text)` | give the player a quest |
| `goal(text)` | set what it is working toward |
| `remember(text)` | note something important |
| `eat(food)` | eat food it carries |
| `use(thing)` | use a thing with an obvious use ([below](#using-things)): open a chest (or say what is in an open one), sit on a seat, lie down on a bed, hammer at an anvil, chop a tree... |
| `take(item, chest)`, `put(item, chest)` | take from or store in a chest, opening it if closed (`take(5 gold, chest)`, `take(all, chest)`); when the player just asked it to bring, get or hand over that thing, it hands it to the player too |
| `close(chest)` | shut a chest |
| `feel(mood)` | show a mood (off by default: it used up turns) |
| `attack(target)`, `wield(item)` | [combat.md](combat.md) |
| `spell.push`, `spell.spark`, `spell.fireball` | the old built-in spells; prefer the `magic` skill |
| `fireball(target?)`, `lightning(target?)` (allowed as `spell.fireball`, `spell.lightning`) | a fireball (3 damage, burns things nearby) or a lightning bolt (4) at a character, the player or a thing by name; the caster takes 1 from the backlash. With no target (or itself, or one that isn't there) the spell comes back on the caster: the fireball falls on it (3), the lightning strikes it (4). A small model that forgets the target can kill itself, on purpose (the Oracle has 3 hp: one fireball). The caster raises its arms and thrusts at the target (the rig's cast clip, held for the spell; a procedural arm raise on rigs without one). Particles, lights and 3D sound (`app/spells.js`) |
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
| `tree`, `logs`, `pine_tree tall_pine oak_tree tall_tree autumn_tree dead_tree log` | chops (takes firewood) |
| `boulder`, `mossy_rock` | breaks off a stone (takes it) |
| `crystals` | breaks off a crystal (takes it) |
| `well` | drinks (heals 1) |
| `lectern`, `bookcase`, `open_book` | reads |
| `target`, `dummy` | practises |
| `apple_barrel`, `apple_crate`, `carrot_crate` | takes an apple or a carrot (food: `eat` it) |
| `barrel`, `crate`, `iron_crate` | looks inside: stores like a chest (`take`, `put`) |
| `tall_grass`, `pumpkin` (fields) | harvests wheat, a pumpkin; a bare field is sown |
| `bear_trap` | checks the snare (meat) |
| `lily_pad` | fishes (fish) |
| a package's item with a `use` or `station` | what the package says ([packages.md](packages.md)) |

Many of these run out and grow back on the clock ([things.md](things.md#stock-and-stores)).

A sitting or lying character stays so while it talks; anything else gets it
up, beside the seat. A tired character's want says `use(bed)` when a bed or
seat is near. What a chest holds is kept with it (saved with the world): put
a ring in, and the player finds it there. The player does the same with E.

## Hearing, seeing and talking

- **Earshot** (default 6 cells): a character only hears and sees what other
  characters do closer than that. Together with `whisper`, this makes
  secrets, hand-overs out of a guard's sight, and "lure him away" plans work.
- **Said to you, or overheard**: every spoken line has an addressee: someone
  in earshot it names (the start of the line first), else whoever spoke to
  the speaker in the last 20 s, else the nearest person it faces within 3
  cells, else nobody. The addressee gets it as speech said to it and answers
  soon; everyone else in earshot overhears it ("You overhear grub telling
  pip: ...", "grub says to nobody in particular: ..."), which needs no
  answer. The player's words always count as said to the one they talk to.
- **Conversations end**: after four lines between two characters without
  the player, their lines count as overheard for 120 s, each is told it has
  said its piece, and both talk with nobody but the player for 90 s.
  One conversation at a time within earshot: while two characters talk,
  the others nearby start none (the player is always answered).
- **Short lines**: a character's line under four words is not spoken
  unless it answers a yes/no question; it nods, shrugs or huffs instead.
- **Talking needs a reason**: a character nobody has spoken to (and to whom
  nothing happened) may only speak when it has news to tell someone near, a
  want that needs a person (food it has to ask or pay for), a goal naming
  someone in earshot, or a temper (below); otherwise it acts.
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
- What a command did is told back plainly: "carry FAILED: there is no bread
  in sight to carry", or "use worked: grub sits down on the stool"; a command
  that failed is not suggested again on the next turn.
- The dead say nothing.

## Menus: choices instead of (or beside) free talk

A character with a `menu` shows a JRPG-style list of choices when the player
talks to it (E). The player clicks one, presses its number, or types or says
anything: the words are matched to a choice ("2", "the second one", the
label, a keyword, words it shares, then what it means, then the characters'
model asked to pick). Menus can lead to other menus, and are shared by id in
the scenario's `menus`:

```json
"menus": {
  "smith": { "title": "Brakka the smith", "text": "What do you need, traveller?", "other": true,
    "items": [
      { "id": "buy",  "label": "Buy a sword (30 gold)", "say": "I would like to buy a sword." },
      { "id": "wolves", "label": "Ask about the wolves", "keywords": ["wolf", "wolves", "howling"] },
      { "id": "more", "label": "Something else…", "menu": "smith-more" },
      { "id": "hit",  "label": "Attack her", "do": "/attack brakka" },
      { "id": "bye",  "label": "Leave" } ] },
  "smith-more": { "title": "Brakka the smith", "text": "Anything else?",
    "items": [ { "id": "sharpen", "label": "Sharpen my dagger" }, { "id": "back", "label": "Never mind", "menu": "smith" } ] }
},
"agents": [ { "id": "brakka", "model": "woman", "at": [0, 0], "personality": "a gruff smith", "menu": "smith" } ]
```

- `say`: what the player says to the character when the choice is picked
  (the character answers as to any chat); without `say`, `do` or `menu`
  the label is said.
- `do`: a player command instead (`/attack`, `/wield`, `/cast`...).
- `menu`: open another menu after it (an id from `menus`, or a menu).
- `keywords`: words that pick this choice outright when typed or said.
- An item with the id `bye`, `leave`, `close` or `exit` and nothing else
  just closes the menu.
- `"other": true`: words that fit no choice go to the character as ordinary
  chat; without it the menu says it did not understand and stays open.
- A character's `menu` can also be a whole menu object instead of an id.
  At most 24 choices; 1-9 have keys.

### Scripted choices, conditions and world flags

A choice can also do things itself, with no model involved:

| field | what it does |
|---|---|
| `reply` | the character says this line back |
| `act` | command lines the character runs (a string or a list): `"give(silver locket)"`, `"sell(\"lost cat\", 5)"` (picking it is the player agreeing to the price), `"walk(well)"`, `"emote(dance)"` |
| `set` | world flags: `{"cat_found": true, "favours": "+1"}` ([story.md](story.md)) |
| `take` | the player hands this item to the character; the choice only shows while the player carries it |
| `give` | the character hands the player this item |
| `start` (or `workflow`) | starts one of the scenario's workflows on the character, run until it waits ([workflows.md](workflows.md)); `stop: true` ends its workflow |
| `if` | the choice only shows when this holds: `"world.cat_found"`, `"player has lost cat"`, `"player.gold >= 5"`, `"me has blackberry pie"`, `"not world.paid"`, `"... and ..."`, `"... or ..."` |

A choice with `reply`, `act`, `set`, `take` or `workflow` is scripted: the
player's `say` line is shown, but the model is not asked. They run in this
order: `take`, `set`, `say`, `reply`, `act`, `workflow`, then the next
`menu`. Texts (titles, labels, replies, act lines) take `{{player}}`,
`{{me}}`, `{{world.cat_found}}`, `{{player.gold}}`.

A character's `menu` can be a list: the first entry whose `if` holds is
used, so a neighbour can change once a flag is set:

```json
"menu": [ { "if": "world.cat_found", "menu": "hobb-friendly" }, { "menu": "hobb" } ]
```

When the meaning of the player's words fits two or three choices about
equally and there is no model to decide, the menu asks "did you mean 1 or
2?". Give choices `keywords` for what players are likely to say.

### Worlds with no language model

`"brain": "none"` at the top makes a world that runs without a model (no
download, any device): the menus, scripted choices and workflows are the
whole story. Typed and spoken words are still matched by meaning
(EmbeddingGemma, ~175 MB). Characters take no turns of their own; give every
choice a `reply` or `act`, and use workflows (`await`, `if`, `set`, `take`,
`command` steps) for anything with steps. `scenarios/willow-lane.json` is a
complete example (a lost cat, a sale, a reward, a neighbour who warms to
you, a riddle).

## Trading

`give(item)` hands over an item the character has; `sell(item, price)` sells
it for `price` gold, which the character chooses. Either way the item lands in
the player's inventory, so `player_has` sees it. `give` and `sell` need the
player within 3 cells (a seller walks over).

Between characters: `give(bread, pip)`, and `sell(bread, 2, pip)` (or
`sell(bread, 2)` to the character it is talking with). The buyer decides in
code: it buys when it has the gold and wants the thing (hungry and it is
food, it asked for it lately, or it is on its goal), else it says no in a
short line. Gold and the item move, and both remember it. When someone
hungry stands beside a character with food, its "You could, right here"
menu offers the sale (or the gift).

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
  personality) decides how it takes being attacked and insulted.
- **Tempers**: words count. Speech said to a character that insults it
  ("you stupid oaf", "shut up", "your pies taste like mud": a put-down near
  "you/your", a rude phrase, or scorn for what it is proud of), or the same
  demand a third time after a no, makes it angry at the speaker (player or
  character) and lowers trust; an apology halves the anger and a gift calms
  it. Anger at someone who keeps at it does not fade. What it does, by level:
  "X is getting on your nerves"; then "Tell them to stop or leave"; at 0.7
  it **refuses to sell, give or give quests** to them until they apologise;
  at 0.85 a brave character or a fighter (a guard, anyone with `attack`)
  **fights that one** (only them; it stops when they are down, gone a
  minute, or have apologised), a calm one orders them out and calls for help
  if they go on, a timid one backs away and calls for help. Calling for
  help brings a guard or fighter within twice the earshot over; it warns
  the troublemaker once and fights them if they insult or hit anyone again
  within a minute. With the default settings a brave character gets there
  in about four insults, a calm one in six. `"temper"` on an agent (or the
  scenario) is `"short"` (x1.6), `"normal"` or `"long"` (x0.6);
  `"tempers": false` on the scenario turns all of this off. At most one
  such fight between characters runs at a time.
- **Opinions** of each other: gifts and blows between characters.
- **Needs**: hunger and tiredness grow slowly (in a living world with real
  time: hungry after about 8 minutes, tired after about 12, at any pace;
  otherwise with its turns); `eat(food)` and
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
- **About the player**: each character keeps what you told it about
  yourself (your name, where you're from, what you love), what you asked
  for or are looking for, what you promised (and whether you kept it: a
  promise to bring gold is kept when you hand gold over, and it trusts you
  more), what you gave it and how often you hit it. Two short lines on its
  card: "About Ana: You met 12 turns ago, talked 5 times. A travelling bard
  from Eastvale. They want: find their lost cat. They promised to bring you
  5 gold (not done yet)."
  This, its beliefs and weightier memories and its trust in you are kept
  in your browser per world and character, so a character greets you as
  someone it knows when you come back ("they have been here before");
  `"remembers": false` on the scenario turns that off. Bigger brains get more
  memories on the card (3 for basic, 4 capable, 6 ambitious), and the
  ambitious keep twice as much of the conversation. Coming back after a
  while (or on a later visit) with an errand still open, the card suggests
  asking how it is going.
- **Beliefs and reflection**: the same thing happening again and again
  folds into one belief ("grub has attacked you 4 times: not to be trusted
  near you"). With a bigger brain (Gemma 4 E4B and up; `"reflect": false`
  turns it off), a character that sleeps, or every 30 of its turns, asks
  itself what it makes of what it remembers and keeps one or two lessons
  ("(you concluded) Ana talks sweet but her friends start fights").
- **Gossip**: when a character says something near another that matches
  what it remembers about someone, the listener remembers it as hearsay
  ("pip told you: Grub attacked bram"), and its opinion of a brawler drops.
  News about you travels too: hearing that you attacked someone costs you
  some of the listener's trust, and generosity earns a little.
  With someone to tell nearby, the card offers a piece of news. `"gossip":
  false` turns it off.
- **Secrets and agendas**: an agent's `"secret"` is on its card with "never
  tell it" until it trusts you a lot (after a few talks and some kindness),
  then "you trust them enough to share it if they ask". `"agenda"` is what
  it is quietly after, every turn, and with nothing pressing it now and
  then wants to take a small step toward it.
- **A plan for the day**: with Gemma 4 E4B or bigger, a character with no
  goal or quest asks itself now and then (every 40 of its turns at most)
  for three small things it means to do here, from its job, agenda, the
  things and places around it and what it remembers; they become its goals
  in turn (up to 10 turns each, or until it sets its own). `"plans": false`
  turns it off.
- **The director knows the minds**: in a living world, about one director
  event in three (when there is material) comes from the characters: a
  chance at what one is quietly after, unease about its secret, or a rumour
  another character carries (remembered as hearsay).
- **What worked before**: when a character hands you what you asked for
  (a give or a sale), it remembers the commands that got it there; the next
  similar request puts "Last time this worked: use(chest) -> take(old map,
  chest) -> give(old map)" on its card. Kept between visits too.
- **What it saw**: with a brain that sees (Gemma 4 E2B, E4B or 12B with
  sight, or an online model with vision on), what it saw when it looked
  stays in its memory. Characters with E4B-class or bigger brains also look
  on their own when someone new comes into view, or every 12 of their
  turns (`"glances": false` turns that off).
- **Danger and reflexes**: a monster close by puts a DANGER line on the
  card with concrete choices (wield the best weapon it carries, attack,
  drink a potion when hurt, run to a free square, call for help). How much
  the game does for it depends on the brain (`"expect"` on the scenario or
  an agent overrides the guess):
  - `basic` (2B-class, Gemma 4 E2B): the game fights back, draws a weapon,
    drinks a potion, runs when badly hurt, and eats when starving, without
    asking the model.
  - `capable` (Gemma 4 E4B): the model chooses from the danger choices; the
    game steps in only when it is nearly dead or starving.
  - `ambitious` (12B and up, online models): no help.
  `"reflexes": false` (scenario or agent) turns the help off. Ambitious
  brains that reason well (Bonsai 2, Gemma 4 12B, online models) think
  before acting on turns that matter (danger, an offer, your fresh
  request); `"autoThink": false` on the scenario turns that off, and an
  agent's `"thinking": true` makes it think every turn. In a fight,
  monsters wait for the character's turn. `eat()` with a
  healing potion drinks it (4 health).
- **Monsters that hunt everyone**: `"monsters": "everyone"` (or a monster's
  `"hunts": "everyone"`) sends monsters after the nearest character they
  can see, not only the player: villages under attack, survival worlds.
- `"mind": false` turns the whole mind off.

Each turn's prompt ends with "Stay yourself: ..." and one sentence of the
personality, so write several short sentences of what the character does
([living.md](living.md)).

## Jobs, homes and money

In a living world with a clock each character has a job and a day, run by
the game ([living.md](living.md#busy-by-default-jobs-and-the-day)):

```json
{ "id": "odo", "job": "baker", "home": "house 2", "workplace": "shop", "personality": "..." }
```

- `job`: a built-in job (`farmer`, `baker`, `innkeeper`, `cook`, `smith`,
  `woodcutter`, `miner`, `hunter`, `fisher`, `herder`, `merchant`, `guard`,
  `healer`, `ratcatcher`, `scholar`, `child`, `labourer`, `idler`), a
  package's, a reference (URL, `npm:`, `gh:`) or a job written inline
  ([skills-and-roles.md](skills-and-roles.md#jobs)); with none it is guessed
  from the role, style and personality.
- `home`, `workplace`: a place of a generated map or a thing's type; by
  default the place it starts in (`"in"`).
- Money: a character without `inventory.gold` starts with a little by job.
  Producers earn by selling; prices come from the agent's `prices`, the
  world's `"prices": {"bread": 3}`, the job's, then a default list.
- A personality that says the character is starving, hungry or has not
  eaten starts it hungry. Starving for a third of a day makes it weak: slow,
  no work, "weak from hunger" on its card ("harsh": true worlds: it loses
  health too).

## Hostile characters and monsters

`"hostile": true` (the default for mindless monsters) fights the player with a
built-in routine and takes no model turn; a hostile character with a real
personality also talks. A character pushed too far by insults fights only
the one who provoked it ([Tempers](#minds-feelings-needs-memory-goals)). See [combat.md](combat.md).

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

ZONOS3-Mini's own built-in voices are `builtin:cillian imogen jett morgana
rupert sakura savannah thaddeus willow wyatt` (Irish man, British woman,
energetic man, witch, British man, anime girl, American woman, announcer,
soft close woman, American man); the other engines speak them as a
Pocket-TTS voice of the same kind.

A world can carry **voices of its own** (the world builder's Voices tab:
a file or a recording, 3 to 12 seconds of one person):

```json
"voices": [{ "id": "old_captain", "name": "Old Captain", "gender": "male",
  "description": "gruff old sailor", "sample": "data:audio/ogg;base64,...",
  "text": "the words said in the sample", "zonos": "<base64>", "v": "1x2y3z" }],
"agents": [{ "id": "brann", "ttsVoiceId": "pack:old_captain", ... }]
```

`sample` is a short clip as a data URL (Ogg Opus, about 35 KB for 12 s);
ZONOS3-Mini and Pocket-TTS clone from it, Breeze TTS from it and its `text`
(without `text` Breeze designs a voice from the `description`). `zonos` is
ZONOS3-Mini's speaker embedding (192 numbers), made by the builder when
ZONOS3-Mini is downloaded in that browser, else by the game the first time
the voice speaks. A world's voice wins over a library voice of the same id;
a subworld uses its parent's voices. The builder also keeps **my voices** in
the browser (offered in every world; a world gets a copy) and lists the
voices made in the game's Voice pane.

## Very small brains: simple mode, a world's default brain, the whole system prompt

Three fields, in the JSON and on the world builder's Story and Characters tabs:

- **`defaultModel`** (scenario): the brain this world starts on, by its key:
  `qwen1.5-0.5b`, `qwen2.5-0.5b`, `gemma4-e2b-litert`, `gemma4-e4b-litert`, `gemma4-e2b-vision`,
  `bonsai2-9b`, `gemma4-12b-litert`, `bonsai2-27b`, `endpoint`. It travels in the world's link, wins over the brain
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
