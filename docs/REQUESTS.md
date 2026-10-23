# Requests and ideas (backlog)

The user's requests, recorded as given, with status. Newest batch first.
Nothing here is cancelled by a later batch; a later batch only changes priority.

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

## Earlier, still open

- **Better monsters:** fal.ai (`FAL_API_KEY` in `.env`) generate + Meshy rig
  (humanoids, ~$0.60-1 per test, ask before spending), SkinTokens for
  non-humanoids (https://huggingface.co/spaces/VAST-AI/SkinTokens).
- Keep searching for better 3D models (monsters, characters, props).
