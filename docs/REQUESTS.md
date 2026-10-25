# Requests and ideas (backlog)

The user's requests, recorded as given, with status. Newest batch first.
Nothing here is cancelled by a later batch; a later batch only changes priority.

## Batch of 2026-10-25: interiors, attractive characters, voices, models

Recorded from one long message. Status 2026-10-25: recorded only, not started;
the plan comes after the user logs into wrangler (Cloudflare).
Ask first (see CLAUDE.md): paid fal.ai calls, model downloads, R2 uploads.

### A. World builder

1. **Keep the exterior model.** Dragging a building such as the stable onto the
   builder map loses its interesting 3D model in the 3D world. Add an option
   on the world builder screen to keep that model in the 3D world.
2. **Interiors as subworlds.** Entering the kept building (needs a designated
   door space) moves the player instantly into a "subworld" showing only the
   interior. The exterior keeps the interesting architecture; the inside is a
   detailed normal map. These are links that become part of the scenario, and
   can also lead to dungeons and the like.
3. **Drag without confirming.** Tiles and objects on the builder map are
   simply dragged; no confirm dialog.
4. **Delete without confirming, plus Undo.** Delete removes at once; add an
   Undo feature.

### B. Characters

5. **Attractive human models.** The main human models are not attractive:
   barely finished or unfinished blocky geometry. They should be a bit sexy
   in a PG-13 way, like a Japanese RPG fighting character (a split dress or
   similar). Options named: generate images and 3D models from images with
   Meshy on fal.ai, and/or interactively edit the existing models.
6. **Voices described by text.** Find the best voice generator where a voice
   is described in text and then generated, on fal.ai if possible
   (`FAL_API_KEY` in `.env`; `OPENROUTER_API_KEY` is also there). Give the
   characters appropriate voices.

### C. Speech in, models

7. **Audio transcription options.** Review what the project offers today.
8. **Underdog-Bark-3.0-ONNX** (`ai-ecoverse/Underdog-Bark-3.0-ONNX`) as an
   option for talking to the AI characters with a microphone, in the browser.
9. **Nemotron-3.5-Bolt-E4B-4GB**
   (https://research.nvidia.com/labs/nemotron/Nemotron-3.5-Bolt-E4B-4GB) as
   an option for the browser and server LLM, taking the place of the normal E4B.
10. **Prism ML Bonsai** as a browser and server option, if possible. It cannot
    be run on the user's laptop, so it cannot be tested here (say so in the docs).
11. **Store Nemotron and the other models on the user's Cloudflare** (R2 bucket
    `geebr-models`; the user logs into wrangler first).

## Batch of 2026-10-23, evening: characters that behave (high priority)

Recorded from one long message; the plan is in `docs/MINDS.md` (now `.claude/skills/tablefolk-dev/reference/minds.md`).
Status 2026-10-23: built (mind.js, roles.js, director, headless evals); open: EmbeddingGemma retrieval (needs approval for a ~200 MB download), roles starting workflows on cue, schedules, relationships.

1. JRPG-style, dialog-driven adventure, with the LLM characters. The models are
   tiny, so don't rely on their conversation history to know what matters or
   what to do.
2. No hand-coded logic per character, but don't rely on the LLM where it isn't
   needed: harness features around it.
3. How do workflows fit in? Goal: appropriate behavior from the agents.
4. Test scenarios without the visible browser (headless, or text-only), so the
   user can keep working; art off or graphics very low when not needed.
5. Ideas from the user: goal() on by default; a remember() command for
   important state changes; external triggers that prompt characters now and
   then (without programming each one); a setstate() command; EmbeddingGemma
   (2) retrieval for backstories and remembered events outside the history.
6. Characters should be interesting, make sense, do their basic jobs (such as
   selling) most of the time, with the tiny models.
7. What makes them interesting: emotional states, awareness of their health,
   survival needs like hunger, more active pursuit of goals.

## Batch of 2026-10-23 (high priority)

1. **TTS voice on by default** (done 2026-10-23) unless the player has turned it off (remember the
   off choice).
2. **Attack animations:** (checked 2026-10-23: punch and sword clips already play on every body and a wielded sword shows in the hand; weapons now follow the hand on more rigs) one for bare hands (punch) and one for a sword. Can the
   avatar carry a sword? (Show a sword in hand when the character has one.)
3. **Dead characters stay silent:** (done 2026-10-23) once a character dies it can no longer
   `say()` anything (currently it still talks).
4. **Give things to NPCs:** (done 2026-10-23) the player needs a way to give items (like gold) to
   characters. Dragging out of the inventory onto a character is the preferred UX.
5. **Less rambling and repeating:** (done 2026-10-23: talk budget) characters still ramble and repeat. Ideas
   from the user: no more talking after two `say` commands, or not until a few
   turns later.
6. **World generator backends:** (done 2026-10-23) two options in the backend, OpenAI (direct) or
   OpenRouter, each with a place for its API key.
   - Default generator model: OpenRouter `deepseek/deepseek-v4.1-flash-1017`
     instead of `openai/gpt-6-luna`. (The user first said "use OpenAI directly
     by default", then later in the same message "default to OpenRouter
     deepseek/deepseek-v4.1-flash-1017"; the later one is taken as the default,
     with OpenAI selectable.)
7. **Dark dungeons with fog of war:** (done 2026-10-23, app/darkness.js) dungeons default to quite dark, so the
   overview camera can't see what's there. Reveal by line of sight, room by
   room, for the room the player's character is in, as long as that room has a
   light source.
8. **Torches:** (done 2026-10-23) a character can carry one; in some (unlit) rooms what's visible
   is limited to the torch's radius.
9. **Tabletop map zoom and pan:** (done 2026-10-23) mouse wheel zoom and panning, with convenient
   mouse UX.
10. **Quick map tooltips** (done 2026-10-23) for objects and characters.

## Platform batch (2026-10-23)

1. **Headless tests with the scene drawing:** (done) `?gfx=light|medium|high`,
   `?fps=N`; `agenttest.mjs --render` (light, 10 fps, 640x360) saves an
   image of the scene per turn (read from the canvas: headless page
   screenshots leave WebGPU black). About 2.1 GB of GPU memory with the model.
2. **Roles as packages, selling as a skill:** (done) `roles/<name>/role.json`,
   the `trade` skill (`app/trade.js`), skills gain `allow`, `card`,
   `behaviours`; food from pack tags. Evals unchanged (role shop 8/8 at
   chaos, plain shop, feelings).
3. **One package format:** (done) `tablefolk.json` with items, skills,
   roles, workflows, modules and requires (`app/packages.js`); item `use`
   and `loop`; per-package trust for code; example `packages/smithy`
   (blacksmith eval 4/4; the smith sometimes forges a second dagger it
   doesn't need, and forges without saying anything).
4. **Finding packages:** (done) `registry/index.json` (PRs), npm keyword
   and GitHub topic `tablefolk`, Library pane; `docs/PACKAGES.md` (now the scenario skill's `reference/packages.md`).
   Not yet: the Library pane is dev-only; no in-game browser for players.

## Refinement hour (2026-10-23, from 16:25)

Goal from the user: something people are genuinely impressed by, not
frustrated by; most things fine on E2B. Test thoroughly; keep improving the
3D models (fal.ai budget: about $10).

- Smart memory with EmbeddingGemma 2 in the browser (approved download).
- Fixes found by evals (see commit log): silent actions, sales across the
  room, trade cues at the end, give_quest to the player, nested commands,
  third-person talk about the player, unknown emotes dancing, materials
  for sale, recipe limits, lore always available.
- Monsters from Meshy via fal.ai: orc (done), goblin, skeleton warrior,
  zombie, troll (in progress).

## Earlier, still open

- **Better monsters:** fal.ai (`FAL_API_KEY` in `.env`) generate + Meshy rig
  (humanoids, ~$0.60-1 per test, ask before spending), SkinTokens for
  non-humanoids (https://huggingface.co/spaces/VAST-AI/SkinTokens).
- Keep searching for better 3D models (monsters, characters, props).
