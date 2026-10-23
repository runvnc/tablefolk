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

Workflows (`app/workflows.js`) are the rails: a 2B model answers one narrow
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

## Order of work

1. Headless runner and evals, and a baseline score.
2. Memory, mood, needs, the state card, `remember()`, `feel()`, goal() on,
   shorter history.
3. Roles and the director.
4. Run the evals again and compare; tune.
5. Later: EmbeddingGemma retrieval (after approval for the download),
   schedules (day and night), relationships between characters.
