# Vision and speech for Tablefolk characters

Design notes from October 2026: what was measured, what was built, and what
to try next. **Update (2026-10-24):** characters can now see in the browser
too: the "Gemma 4 E2B with sight" brain runs the full multimodal
`gemma-4-E2B-it.litertlm` on the LiteRT-LM nightly with a GPU vision backend,
and `look` sends the character's own view ([brains.md](brains.md)). Section 1
below describes the state before that.

## 1. Gemma 4's own image and audio input

Gemma 4 E2B/E4B are multimodal, but **the web build that runs in the browser
is text-only.** The model card says so ("Currently the model is text-only"),
and `gemma-4-E*-it-web.litertlm` has no vision or audio encoder. The
`@litert-lm/core` JS API (0.18) already has `image`/`audio` message parts and
`visionModalityEnabled`/`audioModalityEnabled` session flags, so in-browser
multimodal input should arrive as soon as Google ships a web model with the
encoders. Then `litert-worker.js` only has to pass content parts through (and
bump from 0.14.0).

Native builds have the encoders: `gemma-4-E2B-it.litertlm` (2.6 GB) reports
`Input Modalities: Text Vision Audio` (vision and audio on CPU). The `-gpu`
builds are text only. `litert-lm serve` accepts OpenAI `image_url` and
`input_audio` parts. Measured on an RTX 2060 desktop:

| task | model | time |
|---|---|---|
| describe a 1280x800 screenshot | gemma4-e2b-mm (vision on CPU) | 15 s (first call; includes loading) |
| transcribe 22 s of speech | gemma4-e2b-mm (audio on CPU) | 4.4 s warm, 13.6 s when swapping models |
| text turn | gemma4-e4b,gpu | ~30 tokens/s |

So on a weak laptop the practical split is a **server on a stronger machine**
(or the same one) running `litert-lm serve`, with the browser only rendering.

### Built

- **Speech input** (`app/speech-input.js`): the 🎤 button in the chat box
  records, converts to 16 kHz mono WAV in the page and posts it to the
  server's `/api/transcribe`, which asks Gemma 4 (`gemma4-e2b-mm`, set with
  `LITERT_SPEECH_MODEL`) for an exact transcript; the text is sent like typed
  chat. Without the server or model it falls back to the browser's
  `SpeechRecognition` (Chrome/Edge; that one sends audio to Google).
- **Vision** (Brain options, "vision"): each turn, the character's own view
  (the main camera posed at its eyes for one frame, a 448x320 JPEG) goes with
  its newest message as an `image_url` part. Works with any endpoint brain
  whose model takes images: `litert-lm serve` with `gemma4-e2b-mm`, or Gemma 4
  26B / GPT through OpenRouter (tested: "I see stone walls, a narrow path, and
  a dark sky"). Off by default: it costs a vision encode per turn.

Setup for the local route:

```bash
uv tool install litert-lm
litert-lm import --from-huggingface-repo litert-community/gemma-4-E2B-it-litert-lm gemma-4-E2B-it.litertlm gemma4-e2b-mm
bun server/server.js 8000 --litert      # starts litert-lm serve too
```

## 2. Why the ASCII map didn't help E2B

The perception used to be a north-up ASCII map of the board plus a list of
objects with absolute coordinates. To answer "where is the chest?" a 2B model
has to count characters along a row and down a column, then convert to x/z
with east = -x. Small models can't do that reliably; they echo coordinates
from the list instead, or walk the wrong way. The map is still useful for
bigger models and for debugging, so it stays (toggle "ASCII map").

### Built: senses written the way small models read (`app/senses.js`)

- **Around you**: everything within 7 steps grouped by compass direction,
  with the direction relative to where the character faces, nearest first,
  steps and the cell to walk to:

  ```
  You are in: the throne room.
  Places (walk(name) goes there): kitchen 7 steps east, storage 9 steps west, ...
  Around you (you face south):
  - north (behind): lantern 2 steps at (2,-7)
  - west (ahead-right): bookshelf 5 steps at (7,-3)
  - walls right next to you: east
  ```

  It is effectively a 360° view in words, which is what the "360 ASCII map"
  idea is after, without the counting.
- **Names instead of coordinates**: `walk(bram)`, `walk(chest)`,
  `walk(tavern)` (places on generated maps resolve to their nearest free cell).
- **look()**: a real command now. Its result describes the room, the people
  (what they are, health, what they hold) and the things in sight, read back
  on the next turn. Small models can call it when unsure instead of parsing
  the map.
- **Approach notices**: when someone walks up to a character it gets
  "[event] Traveller comes up to you (next to you, west)", and if the player
  did the approaching and the brains are idle, it answers right away (at most
  once a minute per character). Combat does the same for attacks and
  bystanders.

## 3. Ideas not built yet

- **Egocentric mini-map**: a 7x7 grid rotated so the character faces up
  ("ahead" is always the top row), with 1-letter symbols and a legend of only
  what is in it. Cheaper than an image, and no compass maths for the model.
  Worth an A/B run with the tactic tester against the word list above.
- **Vision only on change**: send a new view only after the character moved
  or something entered its view; otherwise reuse the cached description.
- **Describe-once captions**: run vision once per room (or when a room
  changes) on the server and store a caption ("a candle-lit library, shelves
  on three walls"), then give text-only models the caption. Gives E2B the
  benefit of vision for nearly no per-turn cost.
- **Speech output** already exists (Pocket TTS). Pairing it with speech input
  makes a fully spoken conversation; push-to-talk on a key (hold T) would be
  the natural next step.
- **Audio straight to the character**: skip transcription and give a
  multimodal character brain the audio itself, so it hears tone. Needs the
  character on `litert-lm serve` with `gemma4-e2b-mm` and `input_audio` in the
  chat path; easy to add to the endpoint brain once wanted.
