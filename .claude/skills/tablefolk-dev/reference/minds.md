# Minds: characters that behave, on tiny models

How Tablefolk gets sensible, interesting characters out of a 2B model
(Gemma 4 E2B) without hand-coding each one. Written October 2026; the plan
below is being built in this order.

## The idea in one line

**The game keeps the state; the model only picks the next line.** Old RPGs
had interesting characters with no AI at all, because the game knew each
character's mood, job and story flags. Tablefolk keeps that bookkeeping in
code, generic for every character, and hands the model a short, fresh
**state card** each turn. The model does what it is good at: talking in
character and choosing between a few sensible actions.

A small model can't be trusted to remember that the player hit it eight
turns ago, that it is hungry, or that it sells the sword for 50 gold. So
nothing important lives only in the conversation history.

## Breaking the request down

| Wish | Where it goes |
|---|---|
| Don't rely on history for what matters | the **state card** (below), and a shorter history |
| No hand-written logic per character | **roles** (job templates) and generic **needs, moods, triggers**, all data |
| Don't use the LLM where code is enough | the harness keeps memories, mood and needs, fires triggers; **workflows** run the fiddly transactions |
| Workflows, how do they fit? | the rails for multi-step jobs a 2B model fumbles (haggle, sell, quest hand-in); roles start them on cue |
| goal() on by default | yes, for every talking character |
| remember() | yes: the model notes facts; the game also records important events by itself |
| External triggers | the **director**: generic events become short nudges (attacked, gift, hungry, stuck on a goal, someone walks up) |
| setstate() | `feel(mood)`: the model can say how it feels; numbers stay in code |
| EmbeddingGemma retrieval | memories and backstory are picked by relevance each turn; keyword scoring first, embeddings as an optional upgrade (a download, needs approval) |
| Emotions, health, hunger, active goals | **mood** and **needs** in the state card; a **want** from them when the character has no goal |
| Test without the visible browser | **headless Chrome** with the real GPU (verified: NVIDIA, WebGPU), `?norender=1`, a scenario test runner |

## The parts

### 1. State card (every turn, rebuilt from game state)

A few short lines in the prompt, right after what the character sees:

```
You feel: wary, a bit angry (Hero hit you).
Body: hurt (6/10), hungry.
You want: get something to eat (bread is on the table, 3 steps north).
Your job: shopkeeper. You sell: magic sword 50 gold (never under 40), healing potion 8 gold.
Current goal: sell the sword today (5 turns on it).
You remember: Hero tried to pay 10 gold for the sword. | Bram owes you 3 gold.
```

Only lines that say something appear (no "Body: fine").

### 2. Memory

- **Automatic events**, recorded by the game, not the model: gifts, sales,
  attacks, deaths seen, being robbed, quests given. Each has a weight.
- **`remember(text)`**: the model writes down a fact ("the player is called
  Ana", "the key is in the well").
- **Backstory and lore**: the scenario's `lore` (world facts) and an agent's
  `backstory` / `knows` (lists of short facts).
- Each turn, the three or four most relevant are put on the card: scored by
  word overlap with what was just said and what it sees, plus weight and
  recency. EmbeddingGemma can replace the scoring later (same interface).
- The conversation history can then be kept short (the last dozen messages),
  which also makes turns faster.

### 3. Mood

Five numbers that drift back to the character's temperament: **joy, fear,
anger, sadness, trust** (trust toward the player). Events move them
(attacked: fear or anger by temperament; gift: joy and trust; a friend
defeated: sadness, fear). Shown as two or three words with the reason.
`feel(word)` lets the model set the mood it chose to show.

### 4. Needs

**Hunger** and **tiredness** rise with turns; eating something (bread,
apple, potion, a meal) or resting brings them down. Health comes from combat.
Off for monsters and the undead, and a scenario can turn needs off. When a
need is pressing and there is no goal, it becomes the **want**.

### 5. Roles (jobs as data)

`"role": "shopkeeper"` on an agent adds, with no code from the author:
the commands the job needs, a duty line, the wares and prices on the state
card (from the inventory and an optional `prices` map), and cues: a customer
asking about buying puts the sale rules right on the card. Built in:
`shopkeeper`, `innkeeper`, `guard`, `quest_giver`, `companion`, `villager`.
A role can name a workflow to start on its cue.

### 6. Director (triggers)

Generic rules turn events into a short line in the character's next prompt,
and give it a turn when it is idle: walked up to (exists), attacked, given
something, saw someone defeated, became hungry or tired, no progress on its
goal for several turns ("What's your next step toward: X?"). No per-character
programming: the same rules for everyone, worded by role and mood.

### 7. Where workflows fit

Workflows (`libs/script` run.js, through `app/story.js`) are the rails: a 2B model answers one narrow
question at a time and code decides what happens next. They suit anything
transactional with steps and rules (haggling, a quest hand-in, a riddle
gate). Roles start them on cue, so an author gets reliable selling by
writing `"role": "shopkeeper"`, and free conversation stays with the model.

## Testing without the visible browser

- `HEADLESS=1 ./launch-chrome.sh` runs the test Chrome headless with the real
  GPU (Vulkan flags), same profile, so the cached model is reused. Nothing
  appears on screen.
- `node agenttest.mjs <scenario.json> <tactics.txt> [runs]` plays a scenario
  file with scripted (or model-played) player turns through the real chat
  path and model, and prints transcripts and win counts. Pages open with
  `?norender=1` (no 3D rendering, so the model has the GPU).
- Eval scenarios live in `tools/browser-test/evals/`: a shopkeeper who should
  sell, a guard who should hold, characters who should react to being hurt
  or given things.

## Built (October 2026)

- `app/mind.js`: mood, needs, memory, the state card, `remember()`,
  `eat()` (and `feel()` for scenarios that allow it: on by default it used
  up turns that should have been speech), goal() for every character, goal
  turns ("6 turns on it: what is the next step?"), and the director
  (`wantsTurn`: after each player action, nearby characters take a model
  turn only when spoken to, when something happened to them, when a want is
  pressing, every other round on a goal, else every fifth round;
  `state.idleTurnEvery` changes that).
- `app/roles.js` (now `roles/*/role.json` and `app/trade.js`): the six roles, wares and prices on the card, offers read
  from the player's words, a lowest price in `sell()`, and sales that need
  the buyer's agreement (for every seller, role or not): otherwise
  `sell()` makes an offer, and the player gets a buy / no thanks card.
- Roles are packages now (`roles/<name>/role.json`, loadable by URL, npm or
  GitHub like skills; scenario skill, `skills-and-roles.md`), and selling is the `trade` skill
  (`skills/trade/skill.json`, rules in `app/trade.js`): any character with
  it shows its wares and reads offers, not only a shopkeeper. Food comes
  from asset packs too (items tagged `food`, with `nourish`) and a
  scenario's `food` list.
- Prompts: events ("Ana attacks you") are told under WHAT JUST HAPPENED,
  apart from speech; history trimmed to the last 12 messages; "Your last few
  turns" shortened; no more default "Style: helpful character" for scenario
  characters; `backstory` and the role's duty in the stable prompt prefix.
- Tests: headless Chrome, `agenttest.mjs`, `evals/`.
- Smart memory (`app/embed.js`, `app/embed-worker.js`): EmbeddingGemma 2
  (`onnx-community/embeddinggemma-2-ONNX`, text model q4, 174 MB once,
  Transformers.js 4.3.1, WebGPU else WASM, vectors cut to 256). Before each
  turn `tablefolkMind.prepare(g)` scores every memory, `knows` fact and lore
  line against what was just said (+ goal, quest); raw cosines bunch at
  0.6-0.8, so each is scored as standard deviations above the others (z),
  added to the keyword score. Measured: "Is there any trouble around here?"
  -> "Three sheep went missing" z 2.2; "where could I find the key?" -> "the
  key is in the well" z 2.5. A character's own `knows` are always on the
  card; a short lore list (3 or fewer) whole, best first. Off in the
  Graphics pane ("smart memory"); keyword-only until it has loaded.
- Not yet: roles starting workflows on cue, schedules. (Opinions between
  characters were added on 2026-10-24.)

## Built (2026-11-15): the player file, beliefs, gossip, survival

All in `app/mind.js` unless named.

- **Player file** (`pfOf`, `learnFromPlayer`, `playerLines`): plain regexes
  over the player's words (`heard` events): name ("my name is", "call me",
  "I'm <Capital>"), wants ("I'm looking for", "I need", "can you ...?"),
  promises ("I'll bring/pay/...", "I promise"), self-facts ("I'm a/from",
  "I love/live/have"); `theirs()` turns first person into third. Gifts and
  hits come from `given`/`attacked`. A gift that matches a promise's words
  (or gold for "pay") marks it kept: a memory, trust +.15.
- **Beliefs**: `addMemory` counts repeats (`n`); at 3, `consolidate` rewrites
  a memory matching `PATTERNS` into a belief and keeps counting (`src` is the
  original text, `pi` the pattern index: no functions in saved state).
- **Model reflection** (`reflectWithModel`): tier capable or ambitious,
  `state.reflect`; on sleep (tiredness falls by .3 in a tick) or every 30
  turns, one `tablefolkLLM` call (agentId `<id>~reflect`, 80 tokens) over the
  last 12 memories; up to two lines kept as `thought` memories, shown as
  "(you concluded) ...". Untested with the model at the time of writing.
- **Memory kinds**: event, note, heard (gossip), belief, thought, saw (the
  sight model's answer, world-integration.js `lookFor`).
- **Gossip** (`onSpoke` on `tablefolk-say` voiced lines, `gossipLine`): words
  of the spoken line overlapping a "juicy" memory by 2+ content words pass
  it to everyone in earshot as "X told you: ..." (`asTold` swaps you/your for
  the teller's name); the card offers news when someone is within 4 cells.
- **Secrets, agendas**: agent `secret`, `agenda` (scenario.js) on the card;
  the secret may be shared at trust >= .85 and 3+ talks.
- **Tiers** (`tier(g)`): agent `expect`, else scenario `expect`, else by the
  brain key: endpoint, 9B, 12B, 26B, 27B, 31B ambitious; E4B capable; the rest
  basic.
- **Danger** (`foes`, `dangerLines`): hostile characters (play.js
  `isHostile`) within 6 cells in sight; a DANGER line and "Choose one now"
  with only the commands the character may use (`commandsFor`). `fleeSpot`
  finds a free cell 3-5 steps away from the foe.
- **Reflexes** (`reflex`, called first in world-integration.js
  `runAgentTurn`; the command goes through `stepAgentTurn` with source
  `reflex`, and the `tablefolk-agent-turn` event carries `reflex: true`).
  With a foe within 4 cells, in this order:
  - finish off a foe in reach that one blow would fell
  - a potion below 70% health when the next round is dangerous (health at
    most 1.6x the expected damage for basic, 1.3x for capable) or below
    45% / 35%
  - run only when the next round would kill and there is no potion (not
    brave)
  - draw the best weapon (basic: as the foe comes near; capable: once it
    is in reach and still unarmed)
  - basic: attack a foe in reach
  - capable: attack a foe in reach when its last action was not a blow,
    potion or wield and it is not about to fall (so it alternates with the
    model)
  - basic: timid characters keep away

  With no foe: eat (or take food from a barrel or a known chest) at hunger
  .8 basic / .92 capable. Ambitious: none. The expected damage comes from
  `incoming()`: foes within 3.2 cells, weapon damage or 2.5.
- **Monsters hunting everyone** (play.js `preyFor`): `state.monsters` or the
  agent's `hunts` = "everyone"; the nearest visible non-hostile, non-animal
  character or the player within 8 cells. live.js `monsterTurn` uses it too.
- **Plans** (`planDay`, `advancePlan`): capable/ambitious, `state.plans`,
  no goal and no quest, from its 2nd turn and then at most every 40 turns:
  one call (agentId `<id>~plan`, 70 tokens) with job, agenda, things within
  10 cells, places, 3 memories; up to 3 lines; the first becomes `goal`, the
  rest `m.plan`, each advanced after 10 turns unless the character set its
  own goal. `planning`/`reflecting` locks keep side calls one at a time.
- **Glances** (`maybeGlance`, each tick): `tablefolkVision.available()`,
  capable/ambitious, `state.glances`; someone new within 6 cells in sight
  (or the player), or 12 turns since the last: `lookFor(g)` (its answer goes
  to pendingChat and memory, kind `saw`). One at a time; not while a plan or
  reflection call runs.
- **Recipes** (`noteLine`, `learnRecipe`, `recipeLine`): command calls from
  each turn's line (walk, take, put, use, give, sell, open, wield, eat, close)
  are kept (last 8); a player request (bring/fetch/get/give/hand/pass/sell/
  buy/need/want) marks the turn and its words; a `gave` or `sold` to the
  player saves the commands since then (up to 5) under those words (up to 6
  recipes, persisted). A later request sharing 2+ words shows the recipe.
  Unit-checked only (no model eval yet).
- **Fetching** (uses.js `take`): when the player's last words to it ask to
  bring/fetch/get/give/hand/pass something matching what it took, `give()`
  to the player 1.5 s later.
- **Between visits** (`memKey`, `restore`, `persist`): localStorage
  `tablefolk-mind:<hash of title and agent ids>:<id>`, every 20 s and on
  pagehide: the player file (visits +1 on restore), up to 12 memories of
  weight 2+ or kind belief/thought/note, opinions, trust (faded 30% toward
  neutral). Not for test runs; scenario `"remembers": false` off.
- **world-integration.js `freshen`**: a turn reads cfg before the model runs
  and saved it back twice afterwards, undoing what happened meanwhile (hp
  lost to a blow, wield() from its own commands, food eaten, events told).
  Now hp, wielding, inventory, defeated, goal, mind, wf, quest are re-read and
  pendingChat merged before each save.
- **Measured 2026-11-15** (RTX 2060 6 GB, `?norender=1`, small samples:
  read them as direction, not proof):
  - survival against one wolf (`evals/survival-one.json`: an axe, no
    potion; survived of runs, wolves killed), final rules:
    - E4B capable: 4/4 (1 kill; in two runs the wolf never closed in).
      Before the strike-back reflex: 0/3, 0 kills (it ran from the faster
      wolf).
    - E2B basic: 2/4, 2 kills. Without reflexes: 1/3, 0 kills.
  - survival against two skeletons (`evals/survival.json`: plus bread and a
    potion), about 4 damage a round against 10 health, so hard by design:
    - E4B capable: 1/3 to 1/4 across rule versions, 1-5 kills.
    - E4B with no help: 1/3, 1 kill.
    - E2B basic: 2/3 (early rules).

    What decided runs: drinking the potion in time, not running at 8/10
    (an early rule that did: 0/3), not eating bread mid-fight (it doesn't
    heal; the card says so now), and finishing a monster at 1-2 health
    instead of running.
  - Invalid runs, discarded: Breeze running beside E4B (empty answers), and
    E2B after E4B in one test Chrome (50 s empty turns).
  - hunger (`evals/hunger.json`, an apple barrel, no food carried, hunger
    0.85): E4B 3/3 walked over, took an apple and ate it by itself (about 12
    rounds); E2B 3/3, by reflexes alone.
  - knowing the player (`evals/know-you`, E4B): name and errand recalled
    after 5 turns 3/3; the promise acknowledged after the gold 1/1 ("You
    certainly did!"); the secret kept from a stranger 3/3. Without the
    fresh-request cue E4B answered "I'm looking for my lost cat" with
    turnip talk; with it, "I'm sorry to hear you're looking for your cat".
  - knowing the player on Gemma 4 E2B (with the cue): name and errand 1/1
    ("Finding a lost cat sounds like a tricky thing"), promise 1/1, secret
    kept 1/1.
  - regressions on E4B after all of this: feelings 2/2, using things 5/5,
    shop-role 4/4 (haggle to 45 included), roles 4/4.
  - fetching from a chest (`evals/uses` fetch, E4B): 2/2.
  - side calls (mind-check.mjs, E4B): reflection 2.7 s, plan 1.0 s; gossip
    reached the listener.
- **Eval**: `tools/browser-test/survival-test.mjs` (evals/survival.json: a
  woodcutter with an axe, bread and a potion, two skeletons, hunger .75; the
  player waits each round).

## Built (2026-11-20): living worlds that talk less and anger properly

The 2026-11-19 survey of living worlds (E2B stand-in) found characters
answering every overheard line, a seed exchange leaking ("I'm ready, God"),
failed commands reported as "worked", no trade between characters, and
insults moving nothing. Changes (scenario skill: characters.md, living.md,
combat.md; brains.md for the prompt side):

- **Addressed vs overheard** (app.js `addresseeOf`, world-integration.js):
  see brains.md, History. `speechCause(g)` mutes unprompted turns.
- **Tempers** (`insultIn`, `provoked`, `insult`, `ladder`, `angryAt[key]`
  with `v`, `level`, `last`, `orderedOut`, `hostile`, `backAway`;
  `temperLines` on the card; `refuses(g, who)` in app.js sell/give/
  give_quest; `callForHelp` and `m.watch` for guards, `watchers()` on a new
  insult or attack; `standDown` every 2 s). Per-target hostility is
  `cfg.hostileTo` (play.js `hostileTarget`, `preyFor`; live.js fights on its
  own fast timer; `foes()` counts it, so the victim's reflexes answer).
  `state.ladderFight`: one character-vs-character fight at a time. The
  insult patterns are plain lexicons with "you/your" proximity: "that stupid
  door" is not an insult, "you stupid oaf" is; mockery is "your" + a word of
  its personality + a scornful word.
- **Needs on real time** in live mode (an interval: .55 in 8 min, .7 in 12),
  per turn otherwise; live.js counts hungry or tired as urgent.
- **live.js**: a turn that leaves `pendingChat` unchanged clears it
  (monsters, animals and skipped turns kept a character "pending" and
  starved the rest: `tools/browser-test/live-pending-test.mjs`); a reflex
  turn moves what was waiting into history; spoken to and in no danger, the
  hunger reflex waits.

## Built (2026-11-20): busy by default (clock, stock, jobs, threats)

The owner's complaint after the talking fixes: characters only chatted;
nothing got done. The principle now: characters are busy in code and the
model is for words and real choices; an idle live turn never asks "what do
you do now?".

- `app/clock.js`: `state.clock` {min, day}, runs while live is on (scenario
  `time`, `dayMinutes`, `clock`; `?dayMinutes=` for tests), saved with the
  world (app.js worldStateData / restoreWorldState), HUD `#worldClock`,
  `tablefolk-clock` every game quarter hour, `tablefolk.setTimeOfDay(h)`:
  blends the four setLighting lights' intensities (and the key light's
  position) between snapshots of the bright / night / dim presets taken
  once per scenario, and darkens clear and fog colours; adds no lights.
  The lighting rework takes this hook over.
- `app/uses.js`: `CORE_STOCK` (type -> {item, count, regrow, spent}),
  `stockOf(o)` (pack item `stock` wins; opts.stock / opts.crop from the
  scenario object, kept by app.js keepLoot), regrowth on `tablefolk-clock`,
  `looksSpent` (crystals shrink, others fade), `g._make` orders (jobs.js)
  turn use(station) into make, fields (`tend`), stores (barrel, crate,
  iron_crate) for put/take, `register(kind, def)`, a pack item's
  `station`/`use` for characters (`packUse` -> packages.js useThing with
  who = the character, which then returns the text).
- `app/jobs.js`: job manifests (`jobs/<id>/job.json`, packages, inline),
  inference (match regexes over role, style, personality; STATION
  fallback; idler), per-character state `g._job` (home, work, step, cycles,
  `did` tallies counted from the unvoiced action lines, news), the step
  runner (`goDo`: walk to a reachable free cell beside the thing with a
  quiet routed walk, then `world.runAs` the command; failures twice ->
  blocked an hour; unreachable things remembered), the day (`tick`), the
  decision points (`pick`: a numbered pick through tablefolkLLM, agentId
  `pick`, max 4 tokens, greedy; its own system line, not menus.js's
  "match what a player said"), remarks (agentId `remark`), `eventPick`,
  the card line and `speechCause` (social, ask). Every model call fires
  `tablefolk-model-call` {agentId, kind}; world-integration.js names
  runOneAgentTurn's (`g._callKind` from jobs, else reply / event / open /
  cause).
- `app/threats.js`: kinds (core raid / rats / bandits and package kinds in
  one table), spawning at the edge on the clock (`spawnAgent`, hostile,
  `g._threat`), behaviours (raid: play.js fighterTurn, everyone is prey in
  a living world; pilfer; rob; package module functions), retreat (dawn,
  half down; despawn within 30 s), all-clear news, memories and opinions.
- `app/live.js`: `jobs.handles(c)` -> `jobs.tick(c)` on its own timer
  (schedule with ms, no quiet gap), events only -> `jobs.eventPick`;
  `tablefolkLive.ticks`, `quiet()`; raiders' turns through threats.turn.
- `app/mind.js`: starting hunger .7 from the description, `weak(g)`
  (starving 8 game hours), harsh drain, the card's job lines, speechCause
  from jobs, calm temper x0.85, non-lethal quarrels (`endQuarrel`: a third
  of health, yielding words, running off 15 s), monsters and raiders
  fought to the end (standDown no longer drops them after 3 s).
- `app/packages.js`: `jobs`, `threats`, `uses` sections, a module's
  `threats`, item `stock`/`gather`/`station` (packs.js cleanItem),
  `reset()` before each scenario's packages (scenario.js).

Measured: testing.md, "A whole day".

## Built (2026-11-20, later): quieter rooms, one topic, fallbacks

- **Conversations** (world-integration.js `convoLine`, `activeConvos`,
  `busyNear`, `lastLine`, `window.tablefolkTalk`): a pair closes after 4
  lines (`CONVO_LINES`) for 120 s and both are talked out with anyone but
  the player for 90 s; a new pair cannot start while another pair talks or
  someone else spoke (not to it) in the last 30 s within earshot (`FLOOR_MS`;
  every voiced character line, remarks and greetings too, through
  `tablefolk-say`); such a line counts as overheard, and the turn is muted
  (`crowded`) unless the player spoke to it. jobs.js asks `mayStart` before
  an evening talk, a remark or an event's "say something" (offered only
  to the one the event happened to, not to everyone near).
- **Short lines**: a say/whisper under four words that does not answer a
  yes/no question (`yesNoQuestion` over the pending lines) becomes an emote
  (huff, shush, shrug, wave, frown, scowl, nod). Not in simple mode.
- **Topics** (jobs.js `NEWS` entries `{id, kind, about}`, `topicFor`,
  `TOPIC_USED`): kinds made, sold, bought, short, raid, quarrel, insult
  (mind.js `insult`), event (director.js `happen`); own news first, then the
  village's, then "Ask x about" x's own; each once per pair. Director
  rumours skip a hearer named in them, and those near who are named.
- **Social turns** (`g._callKind === 'social'`): commands limited to
  `SOCIAL_CMDS`; `use` only on a seat. `drink` is parsed as `eat` with
  `drink: true`; mind.js `isDrink` (DRINK words, scenario food
  `"drink": true`, pack tag `drink`) says "drinks"; drinks nourish .25 and
  are not a meal for jobs.js `foodIn`.
- **Fallbacks** (jobs.js `fallback`, `idleActivity`, `altSets`, `sourcesOf`):
  a step's `need` runs the job's `fallback` list (buy from a carrier, ask a
  maker once an hour, gather from a thing whose stock item matches); none:
  the step is blocked an hour and the others go on; nothing at all:
  `decide` keeps busy with the declared idle activity (seated, it mostly
  stays put) and picks with the model at most once an hour. Recipes take
  alternatives (`needs`/`fetch` as a list of sets). The old "keep busy at
  the station" option (the stir loop) is gone.
- **Steps** `tidy`, `lookout`, `pace`; job `"order": "random"` (idler).
- **Hiding at bedtime**: `threatened(g, s, j, asleep)` puts a non-fighter
  hiding at home to bed in its sleep hours (a raid at 22:00 kept two of a
  generated village's people standing all night).
- **Patrol**: a fighter's patrol counts a cycle per place reached
  (`s.patrols`), emotes a look round and greets someone within 4 cells by
  name (each once a game hour; app.js `say`, voiced, not addressed).
- **Log** (app.js `log`): "facing w" lines only with `TABLEFOLK_DEV`; the
  same action line within the last five becomes one with "(xN)".
  live-eval's transcript does the same for consecutive lines.

## Order of work

1. Headless runner and evals, and a baseline score.
2. Memory, mood, needs, the state card, `remember()`, `feel()`, goal() on,
   shorter history.
3. Roles and the director.
4. Run the evals again and compare; tune.
5. Later: EmbeddingGemma retrieval (after approval for the download),
   schedules (day and night), relationships between characters.
