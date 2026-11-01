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
  records; by default Underdog Bark 3.0 turns it into text in the page
  (below, "Speech input: measured"). Other choices in the Voice pane: the
  server's `/api/transcribe` (the page converts to 16 kHz mono WAV, the server
  asks Gemma 4 `gemma4-e2b-mm`, set with `LITERT_SPEECH_MODEL`, for an exact
  transcript), or the browser's `SpeechRecognition` (Chrome/Edge; sends the
  audio to Google or Microsoft).
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

### Speech input: measured (2026-11-01)

`tools/browser-test/asr-test.mjs`, RTX 2060 (6 GB), 12-thread CPU, headless
Chrome 155. "Laptop" is the same clip at 300-3400 Hz, quieter, with pink
noise at about 20 dB SNR and a second of noise either side.

| engine | LibriSpeech test-clean (20 clips, 11 speakers) clean / laptop | voice library (147 acted clips) | time per clip (3-14 s) | memory |
|---|---|---|---|---|
| Bark 3.0 fp16, WebGPU | 1.3% / 1.8% | 3.4% / 3.5% | 0.4 s | about 1.2 GB of graphics memory; 1.3 GB download |
| Bark 3.0 int8, WASM (12 threads) | 1.3% / 1.8% | not run | 1.2-1.4 s | about 1 GB of RAM, no graphics memory; 0.9 GB download |
| Bark 3.0 q4f16, WebGPU | 12.1% / 14.6% | not run | 0.3 s | about 0.95 GB; 0.52 GB download. Usually exact, but one 13 s clip came out as 9 wrong words: tests only |
| Chrome 155 on-device (`processLocally`, fed by `start(track)`) | 3.6% / 2.0% | not run | the latest words at once on stop | Google's pack: about 300 MB on disk (`SODA*` in the profile), no graphics memory |
| LFM3-Omni-2B on llama.cpp (Q4_K_M, Q8 projector on the CPU) | 1.6% / 1.8% | not run | 0.7 s | about 2.5 GB of graphics memory with the model (it is the brain too); 1.6 GB download |
| Gemma 4 E2B audio (`litert-lm serve`, audio on the CPU) | 4.0% / 5.2% | 4.0% / 5.0% (main 22) | 3.6-4.8 s | 2.4 GB model on the server |

Numbers are scored as words ("36" = "thirty six"). With the card full
(Breeze 2.3 GB and LFM3-Omni 2.5 GB beside the game: 5.7 of 6 GB), Bark fp16
failed 22 of 40 clips with WebGPU buffer errors (the longer clips); since then
the first such error moves it to the processor for the session and reads the
clip again there (rerun under the same load: 40 of 40, 1.3 s a clip).
Chrome only finalises a phrase after a pause and drops unfinished text on
`stop()`: `speech-input.js` keeps the latest hypothesis (final or not) and
sends that. Chrome's recognition ignores a fake microphone file
(`--use-file-for-fake-audio-capture`): tests pass it a Web Audio track.
LFM3-Omni's audio projector on Vulkan took 5-8 s a clip (prompt processing at
12-24 tokens/s); with `--no-mmproj-offload` (on the CPU) 0.3-0.9 s.

Bark's errors on the acted clips are mostly right: it leaves out laughs
("Ha ha!") and writes dialect in standard spelling; its real misses were heavy
Scots ("cannae" heard as "can he"). Gemma sometimes rewrote the meaning ("I
was not always this unkind" became "I was not unkind"). The whole microphone
path (fake mic from a WAV, Bark, the chat box) answered 2.8 s after the second
click, the model load from the browser's cache included.

**Which build on which machine** (`barkPlan` in `speech-input.js`): fp16 on
the graphics card when the adapter has shader-f16 and `tablefolkDevice.freeGB`
(usable graphics memory from `hardware.js` minus the chat model's `needGB`;
less 3 GB when Breeze speaks) is 1.5 GB or more; otherwise int8 on the
processor. Without a device estimate (art mode, no brain yet) it assumes
room. An endpoint or cloud brain leaves the card free, so fp16. The browser
can't read free graphics memory directly: the table lookup is the estimate.
A machine with little RAM (`navigator.deviceMemory` under 4) or few cores
would be better off with Chrome's own on-device recognition (below); not
built.

### Speech input: other options, ranked (2026-11-01)

1. **Underdog Bark 3.0** (built, the default): Parakeet-TDT 0.6B v3
   fine-tuned for English (Conway Research, CC-BY-4.0, ONNX in
   `ai-ecoverse/Underdog-Bark-3.0-ONNX`, October 2026). Best measured, fast
   on either device, private. English only.
2. **Chrome's on-device recognition** (built into the "browser" choice:
   `processLocally` when `available()` says so; `install()` on the 🎤 click
   took 9 s for en-US). 3.6% / 2.0%, no graphics memory, nothing from us to
   download: the right fallback for weak machines. Chrome/Edge only.
3. **Parakeet-TDT 0.6B v3** itself (25 European languages, same architecture
   and frontend, so `app/asr/` could load an ONNX export of it with little
   change): for players who don't speak English.
4. **LFM3-Omni-2B / LFM3-Audio-2B** (Liquid AI, late October 2026; LFM Open
   License): audio in, text or speech out, 18 languages, streaming
   "LiveASR". Built as the helper choice (`tools/llama-server.sh --omni`;
   the page finds it by `GET /props` `modalities.audio`): 1.6% on
   LibriSpeech at 0.7 s, nearly as good as Bark, and the same model can be the
   characters' brain (micro-eval 7/10 against LFM3-1.7B's 9/10: it doesn't
   haggle). Not in the browser.
5. **Moonshine** (Useful Sensors, tiny models down to 27 MB, transformers.js
   on WebGPU or WASM): for phones and very weak machines; less accurate.
6. **Gemma 4 E2B/E4B audio input**: measured worse and ten times slower than
   Bark for transcription, and the web builds still have no audio encoder.
   Its value is hearing tone (audio straight to a character), not
   transcription.
7. **The browser's cloud recognition**: last resort; sends the audio away.

Not usable in the browser yet: Qwen3-ASR 0.6B/1.7B (no ONNX/web export
found), IBM Granite Speech 5.0 470M TurboCTC (Apache 2.0, CTC, August 2026:
an ONNX export would be simple and fast; English), NVIDIA Nemotron 3.5 ASR
Streaming 0.6B (streaming, multilingual, OpenMDW; GGUF and Core ML ports
exist). Nemotron 3.5 Transcribe (October 2026) leads the Open ASR board but
is a 30B MoE: server only.

Ideas: push-to-talk on a held key (T); streaming partial text while speaking
(Bark is not streaming; Nemotron streaming or LFM3 LiveASR would be); a voice
activity detector to stop recording by itself.

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
