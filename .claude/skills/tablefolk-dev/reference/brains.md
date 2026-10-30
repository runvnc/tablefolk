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
    on the RTX 2060: answers in character. **Hidden** since 2026-10-30:
    Bonsai 2 27B took its place in the picker.
- **Bonsai 2 27B** (`bonsai2-27b`, engine `bonsai2`, `bonsai2-engine.js`):
  `prism-ml/Ternary-Bonsai-2-27B-gguf`, the 5.95 GB `PTQ1_0` file, on the
  webml-community WebGPU kernel engine. That engine exists only inside its
  demo page (Space `webml-community/ternary-bonsai-2-webgpu-kernels`), so the
  page is fetched at a pinned revision, its second module script cut at the
  `export{... as TernaryBonsai2 ...}` statement and imported from a blob URL
  (xen0bit/smolbox does the same at build time); nothing of it is in the
  repo. API: `TernaryBonsai2.load(null, { file, maxLength, chatTemplateArgs:
  { enable_thinking: false }, onProgress })`, then `for await (const c of
  model.generate(messages, { maxNewTokens }))` (`c.delta`); turns are
  queued (one cache). Weights stream from Hugging Face into IndexedDB; a
  localStorage flag marks a finished load. Not run on the maintainer's 6 GB
  card; untested in the app with real weights.
- **Choosing for the device** (`hardware.js`, `pickForDevice` in the
  manager): the WebGL renderer string (fast GPU and default, the discrete one
  preferred) is parsed and looked up in `gpu-memory.json` (1546 cards: VRAM
  in GB, 0 for shared memory), ported from onepunk/llmsizer (MIT; data from
  onepunk/open-gpu-db, Apache-2.0). The table ends at the M5 and has no RTX
  Spark, so shared-memory chips are also known by name (`sharedChipGB`, the
  smallest memory each ships with; deviceMemory stops at 8): RTX Spark / N1X
  24 GB, DGX Spark (GB10) 128, Apple M<n> Ultra 64, Max 32, Pro 16, plain 16
  from the M4 (8 before), so an M6 or M7 needs no entry. The renderer string
  of an RTX Spark is assumed to contain "RTX Spark" or "N1X" (not seen yet).
  Safari says only "Apple GPU" (E2B). A shared GPU may use two thirds.
  `needGB` in `SUPPORTED_MODELS` (E2B 3, E4B 6, Bonsai 2 10); a first visit
  (no `?model=`, nothing saved) gets the biggest that fits, not saved as a
  choice; an unknown card gets E2B. The RTX 2060 reads as 6 GB (E4B).
  The larger Bonsai also run through an endpoint (llama.cpp, or OpenRouter
  `prism-ml/ternary-bonsai-2-27b`).
  - **Nemotron 3.5 Bolt E4B** (NVIDIA, Gemma 4 E4B post-trained; HF
    `nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-BF16`, GGUF `...-4GB`): the Gemma
    architecture, so `litert-torch export_hf` should convert it
    (`tools/convert-litertlm.sh`, needs about 40 GB of RAM: not done on the
    maintainer's 15 GB laptop). The picker entry `nemotron-bolt-e4b-litert`
    is `hidden` until the converted file is on R2; then un-hide it and hide
    the Gemma E4B. Until then it runs through an endpoint (llama.cpp or
    Ollama on the GGUF; the Brain options have presets).
- **Endpoint** (`openai-client.js`): any OpenAI-compatible server; by
  default this server's `/api/llm/v1` proxy (keys stay on the server).
  Picking it in the top bar opens `#endpointPop` with the Brain options'
  endpoint fields moved into it (`⚙ endpoint` reopens it); it loads on
  "done", not on the pick (a pick used to start turns through the proxy at
  once). `listModels()` asks `<baseURL>/models` (with the key) when the
  panel opens and when the address or key changes, and fills
  `#llmModelPick` and the model field's datalist; this server's proxy passes
  `/models` through (OpenRouter: about 400). With
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
- **Breeze TTS 2** (engine `breeze`, `app/tts/breeze-client.js`): BreezeBlue's
  3B model (English and Mandarin; weights research/non-commercial only) has
  no browser build (2026-10-30: no ONNX, WebGPU or Transformers.js port;
  the Qwen3-TTS browser ports don't clone), so it runs in `breeze-server`
  (HoppouAI/Breeze-TTS-2.cpp, Vulkan, Apache-2.0) on the player's machine:
  `tools/breeze-server.sh [port] [--download-only]` downloads the v0.1.3
  binary and the 2.46 GB `q4_k-dd2` GGUF into `~/.cache/tablefolk-breeze`
  (from the R2 mirror `breeze-tts-2/`, about 2 minutes; else Hugging Face and
  GitHub) and starts it on 8137 with `--cors` (about 3 GB of graphics
  memory). The page reaches it
  through `/api/tts/breeze/` (server.js `breezeProxy`, `BREEZE_URL`; owner
  only, or visitors when the admin opens the local model to them), so Chrome
  never asks for local network access; the Voice pane's "Breeze server"
  field can name the server itself instead. The client stands in for a
  speech worker (same messages; `TablefolkBreezeWorker`), streams the
  server's 24 kHz s16le PCM into the PCM worklet (a `reset` first, or the
  worklet keeps the last line's end and the next never finishes), retries
  `409 busy`, and aborts on stop. Library voices are saved on the server once
  as `tf_<id>_<mood|main>_<v>` from the sample (decoded to a 24 kHz WAV) and
  its transcript (`text` / `mood_text` in `voices.json`, written by
  `elevenlabs-moods.py` without the [tags]); built-in and recorded voices
  get a designed voice from their description. Chosen by itself only when
  nothing is picked in this browser, the server answers and `freeGB`
  (usable graphics memory minus the chat model's `needGB`) is 4 or more: the
  RTX 2060 with E2B has 3, so it keeps Pocket-TTS. Tested against a mock
  server (registration, streaming, three lines in a row, stop); not yet
  against the real model.
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
- Voice states: a cloned voice costs 1.5-1.8 s the first time it speaks (the 39 MB encoder, then a pass through the flow LM that makes the state preset voices ship in `voices.bin`). The small engine's worker posts the state (`voice_state`) and the manager keeps it in IndexedDB `tablefolk-pocket-tts-states` (key `<engine>:v1:pack:<id>:<file>` or `user:<id>`); next visit `load_voice_state` skips both (about 100 ms to the first sound, measured). First visits: `tools/build-voice-states.mjs [voice id ...]` precomputes library states (voices.bin's PTVB1 records) into `work/voice-states/v6/<voice>[@<mood>].bin`, uploaded to R2 under `pocket-tts/states-v6/` (`ls work/voice-states/v6/*.bin | xargs -P 8 ...` with `wrangler r2 object put`); `fetchPrecomputed` in the manager fetches one file (about 100 ms to the first sound even with an empty browser cache; `?states=<url>` tries another folder). After changing a library voice, rebuild, re-upload and bump `v1` in `stateKey`.
- Mood voices: a library voice with `moods` in `voices.json` (tools/elevenlabs-moods.py: calm, joy, anger, fear, sadness samples of 4-5 s from Eleven v4 with tags) speaks in the clone of the sample for the character's strongest feeling (`moodVoice` in the manager: mind.js joy/fear/anger/sadness at .45 or more, else the main sample; ids `pack:<id>@<mood>`, states precomputed in `voices-state-18m-v3`). Tested on the hero with Gemini 4 Argon: fear came out whispered, sadness slow and breathy, joy brighter; the anger sample cloned strained and squeaky (naturalness 3): redo it with cold anger, not shouting. All 22 library voices are acted and have moods (calm, joy, anger, fear, sadness; seductive too for the ones that are not elderly, childlike or monsters; `moodVoice` picks seductive for a character whose personality or style says so (seductive, flirty, sultry, alluring, siren...) or whose brain config has `"ttsMood": "seductive"`, when no strong feeling wins). Monsters: `undead_m` (skeleton, zombie, ghost bodies) and `dragon_m` (dragon, giant, troll, orc, demon bodies) are the default voices for those bodies (`VOICE_HINT`). ElevenLabs refuses to design voices from prompts about a minor ("teenage girl" was a 403): the shy and squire voices are described as young-sounding adults. Identity drift (the same character sounding like a different person per sample) was measured with Gemini 4 Argon, given all the clips at once ("same speaker, ignoring emotion?"): at ElevenLabs stability .3 and no seed the dwarf scored 5/10 and the wizard 7/10; one `seed` per voice plus stability .5, similarity .95, speaker boost and dialect/age cues in each line ("thin elderly voice", "nae") brought every voice's originals to 9-10 and the Pocket-TTS clones to 10. The main samples use the same settings. Ids/states: `pocket-tts/states-v6/<voice>[@<mood>].bin` on R2, one small file per state (147 files, about 2-3 MB each; no index).
- Voices: Pocket-TTS clones samples; the designed library
  (`assets/voices/`, `tools/fal-voices.py`, `tools/voices.json`) is
  `pack:<id>` (`ensurePack` in `pocket-tts-manager.js`).
