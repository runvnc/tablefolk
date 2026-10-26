# Brains: models, prompts, memory, speech

How a character's turn is made, and the engines behind it. Design rationale
and history: [minds.md](minds.md) and [vision-speech.md](vision-speech.md).

## Engines

`app/llm_js/agent-brain.js` holds `SUPPORTED_MODELS`. The ones in use:

- **LiteRT-LM** (`@litert-lm/core`, Gemma 4 E2B ~2 GB / E4B ~3 GB web
  builds): `model-loader-litert.js` + `gpt-runner-litert.js` talk to
  `litert-worker.js`, a **classic** worker that owns the WASM engine, its own
  WebGPU device, the OPFS model cache and all conversations.
  - The worker is shared between tabs and stays loaded two minutes after the
    last page goes (a Web Lock tracks live pages; the back/forward cache kept
    frozen pages as clients, so a lock, not a client count).
  - The engine has a **single KV cache**: only one conversation is live at a
    time; the worker rebuilds the others from their history.
  - Context is 8192 tokens: history is kept to a budget, and an overflow
    ("Input token ids are too long") retries with none. Without that, every
    turn after the first overflow failed.
  - The game's temperature and top-p are passed to the engine.
- **Gemma 4 E2B with sight** (`gemma4-e2b-vision`): the full multimodal
  `gemma-4-E2B-it.litertlm` (2.6 GB; the web builds are text-only) on
  `@litert-lm/core@0.19.0-nightly.20261023` with `visionBackend: GPU`
  (0.14-0.18 can't take images in the main engine). About 4 s a picture,
  3.3 GB of graphics memory with the game. It still downloads from Hugging
  Face (mirroring it on R2 is an open launch item); for tests a local copy
  can be named with `localStorage['tablefolk_model_url:gemma4-e2b-vision']`.
- **Other LiteRT-LM bundles** (same worker, `MODEL_CONFIG` in `litert-worker.js`
  and `SUPPORTED_MODELS` in `agent-brain.js`):
  - **Ternary Bonsai 1.7B / 8B** (Prism ML, Qwen3 based, INT2;
    `litert-community/Ternary-Bonsai-*`, entries `bonsai-*-litert`, **hidden**):
    the bundles are Android-style (`tf_lite_prefill_decode`): the 0.14 web
    engine refuses to stream them, the nightly (`lib` in `MODEL_CONFIG`) loads
    them, but a system message breaks their Qwen template (the engine hands
    the template a list of parts) and, without one, the RTX 2060 answered
    "!!!!!" (tested 2026-10-25). Left in for a newer engine.
  - **Bonsai 1-bit 1.7B on Transformers.js** (`bonsai-1.7b-onnx`, visible,
    experimental): `onnx-community/Bonsai-1.7B-ONNX` dtype `q1` on WebGPU
    (about 300 MB), the webml-community demo's way: a text-generation
    pipeline (`pipeline: true` in `model-loader-tjs-v2.js`; the hand-made
    `model.generate` call failed in GroupQueryAttention). Tested in the app
    on the RTX 2060: answers in character. The larger Bonsai (2 4B, 9B, 27B)
    run through an endpoint (llama.cpp, or OpenRouter `prism-ml/ternary-bonsai-2-27b`).
  - **Nemotron 3.5 Bolt E4B** (NVIDIA, Gemma 4 E4B post-trained; HF
    `nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-BF16`, GGUF `...-4GB`): the Gemma
    architecture, so `litert-torch export_hf` should convert it
    (`tools/convert-litertlm.sh`, needs about 40 GB of RAM: not done on the
    maintainer's 15 GB laptop). The picker entry `nemotron-bolt-e4b-litert`
    is `hidden` until the converted file is on R2; then un-hide it and hide
    the Gemma E4B. Until then it runs through an endpoint (llama.cpp or
    Ollama on the GGUF; the Brain options have presets).
- **Endpoint** (`openai-client.js`): any OpenAI-compatible server; by
  default this server's `/api/llm/v1` proxy (keys stay on the server). With
  Brain options > vision, each turn's newest message carries the character's
  view as an `image_url`. `window.tablefolkLLM` exposes the active brain as
  an OpenAI-style client.
- Hidden engines kept for experiments: Transformers.js (`*tjs*`), wllama
  (MiniCPM5), WebLLM (`model-loader.js`, `gpt-runner.js`, `grammar.js`).

### Model downloads

Models come from the `geebr-models` R2 bucket under four hostnames
(`MODEL_MIRRORS` in `litert-worker.js`): Chrome gives each host one HTTP/2
connection, which caps near 40 MB/s; four hosts reach line speed without the
user's `enable-parallel-downloading` flag. Ranges are fetched in parallel
across hosts and written with an OPFS sync access handle (`createWritable`
capped at 34 MB/s) to a `.part` file, renamed when complete; a stall
watchdog resumes. Keep all four hostnames attached to the bucket.

## A character's turn

`world-integration.js` `runAgentTurn(g)` (one decision at a time, behind a
lock) builds the prompt and parses the answer:

1. **Stable prefix** (`buildAgentPrompt` in `app/app.js`): who it is (style
   only if set), personality, backstory, the role's duty ("Your job:"), the
   commands it may use (`buildCommandExamples`), the "You could, right here"
   menu.
2. **What it perceives** (`app/senses.js`): its place and the places it can
   walk to, "Around you" by direction with steps, nearest first, filtered by
   `tablefolkDark.sightFor(g)`; at most 3 of a kind, 16 things.
3. **The "Stay yourself" line** (one random trait sentence of the
   personality, `inCharacter`), then the **state card** last: mind lines
   (`tablefolkMind.cardLines`), role and skill cards. Order matters: the
   feelings eval fell from 3/3 to 0/2 with the stay line at the end. Card
   lines starting with `!` (an offer to accept now) go at the very end.
4. **History**: the last 12 messages (`HISTORY_KEEP`); new input split into
   "WHAT JUST HAPPENED:" (events) and "NEW SPEECH ADDRESSED TO YOU:".
5. **Parsing the reply**: plain text without a command is spoken; commands
   embedded in prose are extracted and only quoted words spoken;
   `say(Name, "...")` loses the name; at most 2 lines spoken per turn; speech
   is cut at a sentence near 260 characters.
6. **Guards**: a voiced repeat of one of its last 8 lines is dropped (not
   spoken or logged; the character is told); the echo guard drops lines that
   copy what anyone said lately or the history's "grub says" wording; the
   talk budget (`cfg.talkRun`, `cfg.quietTurns`) allows two unprompted
   talking turns then quiet ones (say and whisper removed from its commands);
   `look` is off for three turns after one; the dead say nothing.

Who gets a turn: in the turn round after each player action (`play.js`),
fighters act first and block the player; talkers think in the background,
only while they can see the player (`canSeeEachOther`: walls and doors block
unless someone stands by the door) and only when `tablefolkMind.wantsTurn`
says so. In a living world `live.js` schedules them by real time
(scenario skill, `living.md`).

## Minds

`app/mind.js` (its header comment is the reference) keeps `cfg.mind`
(mood and why, hunger, tiredness, memories, goal and goal turns, threat,
what it heard, opinions of others via `opinion()`): events (`attacked`, `saw_attack`,
`saw_defeat`, `given`, `sold`, `gave`, `heard`) move moods; each turn moods
decay and needs grow (hunger and tiredness were halved on 2026-10-25: a meal
lasted three minutes in a living world). Food is matched by `FOOD` plus
pack tags and the scenario's `food`. `wantsTurn(g)`: pending chat or a
workflow, an urgent want, a goal or want every 2 rounds, else every
`state.idleTurnEvery` (5) rounds.

Recall (`tablefolkMind.prepare(g)` before a turn): every memory, `knows`
fact and lore line is scored against what was just said (plus goal and
quest) by keyword overlap plus EmbeddingGemma 2 similarity
(`app/embed.js`, `embed-worker.js`: `onnx-community/embeddinggemma-2-ONNX`,
q4 on WebGPU through Transformers.js 4.3.1, 256-d; int8 on WASM as fallback
because q4 needs an operator WASM lacks). Raw cosines bunch at 0.6-0.8, so
each is scored as standard deviations above the others.

## Trade, roles, skills

`app/trade.js` keeps the selling rules for every seller (wares and prices on
the card, offers read from the buyer's words by `amountIn`/`itemIn`, the
lowest price, buyer consent with a buy / no-thanks card for the player, a
seller walking over when the buyer is beyond 3 squares). Roles
(`roles/*/role.json`, `app/roles.js`) and skills (`skills/*/skill.json`,
`app/skills.js`) are data packages; code modules load only from this site,
with `?trustSkills=1`, or after the player allows that package.

## Speech

- Output: `app/tts/pocket-tts-manager.js` with swappable engines:
  Pocket-TTS small (18M, `pocket18-worker.js`, English, lower latency) and
  the 100M model (`inference-worker.js`, five languages). Stereo pan and
  distance gain place voices. On by default (`tablefolkTtsEnabled !== '0'`).
  `silence(agent)` stops a defeated character mid-line.
- Input: `app/speech-input.js`, chosen in Brain options (`tablefolk.speech`):
  automatic (the server's `/api/transcribe`, Gemma `gemma4-e2b-mm` on
  `litert-lm serve`, else the browser's SpeechRecognition); **in the
  browser** with Underdog Bark 3.0 (`app/asr/`: `worker.js` runs
  `ai-ecoverse/Underdog-Bark-3.0-ONNX`, a Parakeet-TDT 0.6B fine-tune, CC-BY-4.0,
  on onnxruntime-web: the fp16 encoder on WebGPU where the card has
  `shader-f16`, else int8 on WASM; `mel.js` is the log-mel frontend, checked
  against the model card's fixture to 1e-4; files in the Cache API
  `tablefolk-asr-1`, a one-time download asked first; the int4 build is
  broken); or the browser's own recognition. Files are served from R2
  `underdog-bark-3.0/` (then Hugging Face); `?asr=<url>` tries a folder first.
- Voice states: a cloned voice costs 1.5-1.8 s the first time it speaks (the 39 MB encoder, then a pass through the flow LM that makes the state preset voices ship in `voices.bin`). The small engine's worker posts the state (`voice_state`) and the manager keeps it in IndexedDB `tablefolk-pocket-tts-states` (key `<engine>:v1:pack:<id>:<file>` or `user:<id>`); next visit `load_voice_state` skips both (about 100 ms to the first sound, measured). First visits: `tools/build-voice-states.mjs` precomputes the 20 library states (52 MB, voices.bin's PTVB1 records) into `work/voice-states/voices-state-18m.{bin,json}`; both are on R2 under `pocket-tts/`, and `fetchPrecomputed` in the manager range-fetches one voice (about 100 ms to the first sound even with an empty browser cache; `?states=<url>` tries another folder). After changing a library voice, rebuild, re-upload and bump `v1` in `stateKey`.
- Mood voices: a library voice with `moods` in `voices.json` (tools/elevenlabs-moods.py: calm, joy, anger, fear, sadness samples of 4-5 s from Eleven v4 with tags) speaks in the clone of the sample for the character's strongest feeling (`moodVoice` in the manager: mind.js joy/fear/anger/sadness at .45 or more, else the main sample; ids `pack:<id>@<mood>`, states precomputed in `voices-state-18m-v3`). Tested on the hero with Gemini 4 Argon: fear came out whispered, sadness slow and breathy, joy brighter; the anger sample cloned strained and squeaky (naturalness 3): redo it with cold anger, not shouting. Only the five acted voices have moods. Identity drift (the same character sounding like a different person per sample) was measured with Gemini 4 Argon, given all the clips at once ("same speaker, ignoring emotion?"): at ElevenLabs stability .3 and no seed the dwarf scored 5/10 and the wizard 7/10; one `seed` per voice plus stability .5, similarity .95, speaker boost and dialect/age cues in each line ("thin elderly voice", "nae") brought every voice's originals to 9-10 and the Pocket-TTS clones to 10. The main samples use the same settings. Ids/states: `voices-state-18m-v4`.
- Voices: Pocket-TTS clones samples; the designed library
  (`assets/voices/`, `tools/fal-voices.py`, `tools/voices.json`) is
  `pack:<id>` (`ensurePack` in `pocket-tts-manager.js`).
