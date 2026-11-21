# Character AI: state of the art and Tablefolk's roadmap

Written 2026-11-15. What the field does for game characters on small models,
what Tablefolk has, and what is next. Internals: the maintainer skill's
`minds.md`; for authors: the scenario skill's `characters.md`.

## The field, November 2026

- The recipe that works on small models is still **code keeps the state, the
  model only acts and talks**. The work goes into the scaffolding, not the
  model.
- **Shipped games** mostly run characters in the cloud. inZOI's "Smart Zoi"
  (NVIDIA ACE, a ~0.5B model on the player's GPU) is the main on-device
  example. Reviewers keep naming long-term memory as the hard part.
- **A player study** (arXiv 2604.04157, 130 players, April 2026): LLM
  characters raised cognitive load in open-ended tasks and did not improve
  the overall experience. Characters should be legible and purposeful, not
  just chatty.
- **Baselines everyone cites**:
  - Generative Agents (2023): a memory stream, reflection and daily plans.
  - Project Sid (2024): 1,000 agents in Minecraft; parallel modules feeding
    one bottlenecked decision.
  - Voyager (2023) and Programmatic Skill Networks (arXiv 2601.03509,
    January 2026): libraries of learned, reusable, refactored skills.
- **2026 memory research**:
  - provenance-typed memory: saw, heard or inferred (2605.25869, Eywa
    2605.30771)
  - belief memory under partial observability (2605.05583)
  - consolidation (TRUSTMEM 2606.25161)
  - "Long-Lived Characters, Local Inference" (2609.18935): incremental
    upkeep of a local model's cache instead of re-reading a character's life
    every turn
- **Small personas**: fine-tune a small model once and swap memory modules
  per character (2511.10277).

## Built in Tablefolk

| idea | where |
|---|---|
| State card instead of long history | mind.js `cardLines` |
| Mood, needs, opinions, goals, director | mind.js |
| Meaning-based recall (EmbeddingGemma 2) | embed.js, mind.js `prepare` |
| A file on the player: name, wants, promises kept, gifts, blows | mind.js `pfOf`, `playerLines` (2026-11-15) |
| Remembered between visits (this browser) | mind.js `persist`, `restore` |
| Memory kinds: event, note, heard, belief, thought, saw | mind.js |
| Beliefs from repeated events; model reflection on sleep | mind.js `consolidate`, `reflectWithModel` |
| Gossip spreading as hearsay; secrets; agendas | mind.js `onSpoke`, `secretLines` |
| Survival: danger choices, a damage estimate, reflexes by brain tier | mind.js `dangerLines`, `reflex`, `tier` |
| Monsters that hunt everyone | play.js `preyFor` |
| Sight that becomes memory (E2B, E4B, 12B with sight); glances on their own | world-integration.js `lookFor`, mind.js `maybeGlance` |
| A plan for the day (three goals) | mind.js `planDay` |
| Recipes: what worked before | mind.js `recipeLine` |
| Answer a fresh request first | mind.js `urgentLines` |

### Brain tiers (`expect`)

- **basic** (2B-class): the game reacts for the character in danger and
  hunger, and the card is shorter.
- **capable** (Gemma 4 E4B): concrete choices; the game steps in only at
  the brink.
- **ambitious** (9B and up, online models): no reflexes, more memories,
  twice the history.

Survival eval (`tools/browser-test/survival-test.mjs`): one woodcutter
(10 health, an axe, bread, a potion) against two skeletons (6 health each),
hunger 0.75, the player only waiting; a one-wolf variant and a hunger eval
too. Results (2026-11-15) are in minds.md, "Measured". Gemma 4 E4B and 12B
with sight are in the picker but not yet run on a card big enough for them.

## Next, by payoff

1. **A Tablefolk fine-tune of E4B**: a big model plays thousands of turns,
   and a LoRA learns the command format, the card and staying in character.
   This is the largest raw gain. It is a training job, so ask first.
2. **Learned skills, further**: recipes (2026-11-15) are shown as text;
   next, run a recipe as one command, and learn from more than hand-overs.
3. **Plans tied to the day/night clock** (plans exist now, but not by time
   of day).
4. **Best-of-N with a chooser**: 2-3 candidate actions, picked by the
   Decider (6-8 s in the browser; native helpers are not this project) or by a
   scoring pass.
5. **A stable prompt prefix** to cut LiteRT rebuilds: measure the cache reuse
   first.
6. **A director that knows the minds**: started 2026-11-15 (agendas,
   secrets, rumours as events); next, events that move a story forward.
