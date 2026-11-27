# Brains: models, prompts, memory, speech

How a character's turn is made, and the engines behind it. Design rationale
and history: [minds.md](minds.md) and [vision-speech.md](vision-speech.md).

## Engines

`app/llm_js/agent-brain.js` holds `SUPPORTED_MODELS`. The ones in use:

- **LiteRT-LM** (`@litert-lm/core`, Gemma 4 E2B ~2 GB / E4B ~3 GB web
  builds): `libs/brain/engines/litert.js` + `libs/brain/engines/litert-runner.js` talk to
  `libs/brain/engines/litert-worker.js`, a **classic** worker that owns the WASM engine, its own
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
- **Other LiteRT-LM bundles** (same worker, `MODEL_CONFIG` in `libs/brain/engines/litert-worker.js`
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
- **Bonsai 2.5 27B** (`bonsai2-27b`, engine `bonsai2`, `libs/brain/engines/bonsai2.js`;
  Bonsai 2 27B until 2026-11-27, same id so saved choices and scenarios follow):
  `prism-ml/Ternary-Bonsai-2.5-27B-GGUF` at revision `28a7093c`, the 5.99 GB
  `PTQ1_0` file, on webml-community's WebGPU kernel engine (the `qwen35-vision`
  module of the Space `webml-community/ternary-bonsai-2-hermes-webgpu`, fetched
  at a pinned revision and imported from a blob URL; nothing of it is in the
  repo). `SIZES` in bonsai2.js: `27B` (2.5), `27B-v2` (Bonsai 2 27B,
  `Ternary-Bonsai-2-27B-gguf` at `839bd570`, from the R2 mirror; hidden picker
  entry `bonsai2-27b-v2`), `9B` (Bonsai 2 9B, unpinned: a pin changes the URL
  and so the engine's cache key). Each size has its own localStorage flag for a
  finished load (`_bonsai25_loaded`, `_bonsai2_loaded`, `_bonsai2_loaded_9B`),
  so a cached Bonsai 2 does not pass for 2.5; after 2.5 loads, the engine's
  IndexedDB (`gguf-cache-v1`) entry for the Bonsai 2 27B file is deleted
  (`dropCached`). Weights stream into IndexedDB; turns are queued (one
  cache). Measurements: "Bonsai 2.5 27B" below.
- **Sampling** (`libs/brain/sampling.js`, 2026-10-30): a model with makers' recommended
  settings is always run with them, and a character's chaos counts from
  them (`withChaos`, 2026-11-06: 0 and 1 unchanged, then temperature, top-p and top-k open up on a curve): Gemma 4 temperature 1.0, top-p 0.95, top-k 64; MiniCPM5 1.0,
  top-p 0.95, min-p 0; LFM3 0.1, top-k 50, repetition penalty 1.1. The LiteRT
  worker sets them on the conversation (type 2, top-k capped at 64: 256 gave
  random tokens); before, LiteRT text models ran on each bundle's hidden
  defaults. The endpoint brain sends top_p/top_k/min_p/repetition_penalty
  matched by the server's model name. Measured: MiniCPM5-2B did worse at its
  recommended 1.0 (25/36) than on its bundle's sampler (31/36).
- **Libraries** (checked 2026-10-30): LiteRT-LM 0.19.0 (released that day;
  MiniCPM5 stays on 0.19.0-nightly.20261024 because 0.19.0 garbles it, the
  vision model on its tested nightly), Transformers.js 4.3.2 everywhere (one
  runner had been on 4.2.0 beside the loader's 4.3.x), onnxruntime-web 1.31.1
  (Pocket-TTS, speech input), wllama 3.8.1; pako stays 1.0.11 for UPNG's APNG.
- **Raon-1 nano** (`raon1-nano-litert`, offered in the picker; KRAFTON's 4-bit
  LiteRT-LM bundle, Korean and English): its own section below, "Raon-1 nano".
- **Smaller brains on trial** (hidden, `?model=`): `minicpm5-2b-litert`
  (mlboydaisuke's int4 bundle, 1.55 GB) and `lfm3-1.7b-webgpu`
  (`lfm3-engine.js`: the webml-community Lfm3ForCausalLM WebGPU runtime,
  Apache-2.0, fetched from its Space at a pinned revision and imported from a
  blob URL since HF serves it as text/plain; Liquid's 1.1 GB Q4_K_M GGUF;
  greedy only, no repetition penalty; 32-bit kernels without shader-f16, so it
  runs on the RTX 2060; about 1.7 GB of graphics memory, a 0.7 s answer).
  Liquid's LFM3 ONNX export did not work on Transformers.js 4.3.2 (it feeds
  num_logits_to_keep, the export wants logits_to_keep; renamed, it then died
  with "divide by zero"). Eval scores: testing.md.
- **Choosing for the device** (`libs/device/index.js`, `pickForDevice` in the
  manager; 2026-11-12). New devices come out all the time, so it leans on
  what can be measured, with name tables only as hints:
  - **Class** (`deviceClass`): phone, tablet, computer or headset, from the
    user agent (phone and tablet signs first) and the Client Hints'
    `formFactors`. Client Hints also give the processor architecture
    (`arm` on Windows on Arm), the OS and a phone's model name.
  - **Graphics card by name**: the WebGL renderer string (fast GPU and
    default, the discrete one preferred) looked up in `libs/device/gpu-memory.json`
    (1546 cards: VRAM in GB, 0 for shared memory), ported from
    onepunk/llmsizer (MIT; data from onepunk/open-gpu-db, Apache-2.0).
  - **Bandwidth, measured** (`measureBandwidth`): ten copies of a 256 MB
    buffer (128 on a phone), best of three, about 0.1 s, kept 30 days per
    device in `tablefolkGpuBandwidth`. A copy sees about 60% of the rated
    figure (RTX 2060: 138-200 of 336 GB/s). Each token reads a model's
    weights (`readGB` in `SUPPORTED_MODELS`: E2B 1.3, E4B 2.3, Bonsai 2
    5.9), so `predictedToks` = bandwidth x 0.5 / readGB; under 8 tokens/s
    a model is not picked by itself.
  - **Shared memory** (`memoryEstimate`, each sign a lower bound, the
    highest wins, its reason in `memWhy`): `navigator.deviceMemory`
    (Chrome 155 reports 16 here, older ones stopped at 8; Safari none);
    chips by name (`sharedChipGB`: RTX Spark/N1X 24, DGX Spark 128, Radeon
    8060S/8050S 32, Arc 130V/140V 16, Apple M<n> Ultra 64, Max 32, Pro 16,
    plain 16 from the M4, 8 before); **NVIDIA graphics on a Windows or
    Linux Arm computer** is taken for a Spark (24) whatever its name says,
    so the RTX Spark is found even if its renderer string names neither;
    measured bandwidth 180+ GB/s on a computer means a wide unified-memory
    chip (16), 400+ a Max/Ultra/DGX (32); the adapter's largest buffer.
    A phone's or tablet's GPU always counts as shared.
  - **Usable** (`usableGB`): the card's own memory; shared: two thirds on a
    Mac, half elsewhere (Windows' shared graphics memory), 40% on a phone or
    tablet. A dedicated card missing from the table gets a lower bound from
    its bandwidth (`vramFromBandwidth`: rated 650+ GB/s 10 GB, 250+ 6, else 4).
  - **Measured speed** (`noteBrainSpeed`, every turn but the first after
    loading, not the endpoint): reply characters per second of the whole
    turn, smoothed, in `tablefolkBrainSpeed`. After 3 turns under 12 chars/s
    a model is no longer picked by itself (Gemma E2B on the RTX 2060: ~266).
  `needGB` in `SUPPORTED_MODELS` (E2B 3, E4B 6, Bonsai 2 10); a first visit
  (no `?model=`, nothing saved) gets the biggest that fits and is fast
  enough, not saved as a choice, so a later visit can step down; an unknown
  card (no WebGPU measurement either) gets E2B, as does a device where
  nothing fits. `hw.choiceWhy` says why; the This device pane shows the
  class, memory with its reason, bandwidth, the choice and measured speeds.
  Simulated (2026-11-12): Pixel 9a (8 GB, ~45 GB/s) E2B; Intel UHD laptop
  E2B (E4B ~8 tok/s); M4 Air 16 GB E4B; RTX Spark of unknown name, Strix
  Halo, an unknown 330 GB/s Mac and an unknown 600 GB/s card Bonsai 2 27B.
  The RTX 2060 reads as 6 GB (E4B).
  The larger Bonsai also run through an endpoint (llama.cpp, or OpenRouter
  `prism-ml/ternary-bonsai-2-27b`).
  - **Nemotron 3.5 Bolt E4B** (NVIDIA, Gemma 4 E4B post-trained; HF
    `nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-BF16`, GGUF `...-4GB`): the Gemma
    architecture, so `litert-torch export_hf` should convert it
    (`tools/convert-litertlm.sh`, needs about 40 GB of RAM: not done on the
    maintainer's 15 GB laptop). The picker entry `nemotron-bolt-e4b-litert`
    is `hidden` until the converted file is on R2; then un-hide it and hide
    the Gemma E4B. Until then a player who already serves the GGUF can use
    it through the endpoint brain (no preset: 2026-11-21).
- **Endpoint** (`libs/brain/engines/openai.js`): any OpenAI-compatible server; by
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
  - **For players: Settings > "Characters' brain online"** (`online-brain.js`,
    2026-11-12): "sign in with OpenRouter" (OAuth PKCE through
    `worldgen-own.js`, the world builder's own sign-in: OpenRouter returns
    to the page with `?code=`, traded for a key of the player's) or a pasted
    key; then `tablefolk_model` = `endpoint` and `tablefolk_llm_endpoint` =
    OpenRouter, the key and `PLAY_MODEL` (Gemma 4 26B A4B, editable there),
    and the page reloads. "back to the in-browser model" clears both (the
    device's pick again); "forget the key" also drops the key. When
    `#brainStatus` shows a failure (no WebGPU, a load error), a toast offers
    it once a session. The key is in localStorage and goes only to
    OpenRouter.
- **Strands Decider** (experiment, 2026-11-12; `libs/decider/index.js`, not
  wired into the game): AWS Strands Labs' decision models (Apache-2.0) pick
  one of a list of options (or yes/no, or a level) with calibrated
  probabilities instead of writing text: a LoRA and a pointer head (LayerNorm,
  q/k projections) on a base model. Sizes: the Gemma 4 E4B one is 8.0B
  parameters in all (4B "effective", the rest per-layer embeddings), ~15 GB of
  GPU memory unquantized; base Gemma 4 GGUFs are E4B Q4 4.6-5.0 GB, E2B Q4
  2.8 GB, and nobody has published a Gemma decider GGUF yet. The 2B (Qwen3.5)
  one has community GGUFs (ArminBurkhardt/...-GGUF: Q8_0 2.0 GB, Q4_K_M 1.3
  GB; pooling "last", so llama.cpp's embeddings give the final hidden state)
  and a WebGPU int4 build (alxnahas/strands-decider-2B-webgpu). llama.cpp's
  own System One API (wllama `createSystemOne`, Kev/JEV GGUFs) does not take
  Strands models (their head has a LayerNorm). `libs/decider/index.js` ports the GGUF's
  decide.py: wllama 3.13.0 embeddings (one input per option, cut after its
  line, plus the whole prompt; batch 512: 4096 ran the 6 GB card out of
  memory), Transformers.js for the tokenizer (`_tokenizer.id_to_token` for
  byte spans), the head in JS. Measured on the RTX 2060
  (`tools/browser-test/decider-test.html?local=1` with the files in
  `work/decider/`; `tools/decider-menu.py`, `tools/decider-control.py` on
  llama-server): menus 17/18 in both (the miss at confidence 0.45); 0.53 s a
  question natively, 6-8 s in the browser (Qwen3.5's recurrent layers are
  slow on WebGPU; flash attention off changed nothing; per-token states are
  not reachable through wllama's OAI-style embeddings, so each option costs a
  forward). Steering a character (14 situations, direction and command, 0.9
  s for both natively): direction 10/14 (three misses were "move one step to
  the person" against "stay"), command 11/14; every answer at confidence 0.5+
  was right (6/6, 8/8), every miss below it. Natively it would suit fast,
  confident choices with Gemma for the unsure ones, but a native helper is
  not this project (CLAUDE.md); in the browser too slow beside the current
  matcher (menus.js, 50-150 ms).
- **Qwen2.5 0.5B** (`qwen2.5-0.5b`, engine `wllama3`, 2026-11-06):
  `Qwen/Qwen2.5-0.5B-Instruct-GGUF`, the 491 MB Q4_K_M, the newest official 0.5B
  (Qwen3 starts at 0.6B, Qwen3.5 at 0.8B). Every layer on the GPU: about 50 tok/s,
  prefill 180-420 tok/s, a reply in 1-2 s on the RTX 2060, about 1.3 GB of graphics
  memory with the game. Flags in `SUPPORTED_MODELS`: `simple` (simple mode by
  default) and `autoLoad` (loads with the download question, unlike the other
  wllama3 models, which wait for a click; `hasModelCached` now asks wllama's cache).
  The runner needs ChatML: the template is set on the Wllama instance
  (`tablefolkTemplate`), because the runner imports the loader without `?v=` and
  so gets another copy of the module (its `getCurrentModel()` is null). Each
  completion gets a random seed; the default repeats replies word for word.
- **Qwen1.5 0.5B** (`qwen1.5-0.5b`, 2026-11-06): `Qwen/Qwen1.5-0.5B-Chat-GGUF`, Q4_0, the
  file Ollama's `qwen:0.5b` appears to use (its page lists Q4_0). This, not Qwen2.5,
  is the model in the "10 + 10 = 11" screenshots; it reproduced that line, "46,942 moons"
  and "Ed Sheeran" fronting Radiohead, where Qwen2.5 mostly stays sane. llama.cpp warns
  "missing pre-tokenizer type... GENERATION QUALITY WILL BE DEGRADED" on this old file;
  leave it, it may be part of the joke. What makes them dumb, measured: model and prompt
  far more than temperature (Qwen2.5 still said 20 at temperature 2.75). `-q2` is a hidden Q2_K of Qwen2.5.
- **wllama GPU failure** (`loadAt` in `libs/brain/engines/wllama.js`): with a card too full
  (seen at 5.4 of 6 GB), the weights' buffer is invalid ("Invalid Buffer tensor_buf0"),
  ggml's error callback aborts the wasm and every later call is "RuntimeError:
  unreachable". The load is retried on a new instance with `n_gpu_layers: 0`.
- **Simple mode** (`isSimpleBrain` and `buildSimplePrompt` in `app.js`,
  `buildSimpleMessages` and `simpleReply` in `world-integration.js`): character's
  `simple`, else the scenario's, else `?simple=`, else the brain's flag. History is
  the last 6 lines of talk only, as plain words: `say("...")` in the history taught
  Qwen to write `say("[Pilgrim] ...`, and `[Pilgrim]` was copied into replies, so
  names appear only when more than one other person is near. 70 tokens a turn;
  speech is cut to its first two sentences. Off in this mode: the
  neutral "(You look around.)" / `look()` seed (`?seed=none` drops it), the
  planning filter, the repeat guards in `say()` and the copy guard (they left him
  silent), reports and corrections in the history, the "ponders" fallback. A quiet
  turn skips the model. `onlySpokenTo` (on by default here) skips turns with no speech in
  `pendingChat`, in `mind.wantsTurn` and `runOneAgentTurn`: told only "Say something.",
  Qwen1.5 gave "As an AI language model..." 7 times in 12.
- **`systemPrompt` and `defaultModel`**: `systemOverride` in `app.js` replaces the
  system message in both modes. `window.tablefolkUseModel(key)` (scenario start;
  null goes back to the player's model) drives the picker's change handler without
  saving the choice; `main()` also reads a linked scenario before its first load
  (`linkedScenario`), so the usual model isn't loaded first. Known small race: a
  scenario started while another load is running can leave the status line naming
  the old model, though the right one answers.
- Hidden engines kept for experiments: Transformers.js (`*tjs*`), wllama
  (MiniCPM5), WebLLM (`model-loader.js`, `gpt-runner.js`, `grammar.js`).

### Model downloads

Models come from the `geebr-models` R2 bucket under four hostnames
(`MODEL_MIRRORS` in `libs/brain/engines/litert-worker.js`): Chrome gives each host one HTTP/2
connection, which caps near 40 MB/s; four hosts reach line speed without the
user's `enable-parallel-downloading` flag. Ranges are fetched in parallel
across hosts and written with an OPFS sync access handle (`createWritable`
capped at 34 MB/s) to a `.part` file, renamed when complete; a stall
watchdog resumes. Keep all four hostnames attached to the bucket.

## Context windows and answer limits (audit 2026-11-27)

Rule: no small window or answer cap where memory does not need it. A window
costs graphics memory only where the engine allocates its KV cache up front
(Bonsai, wllama, LiteRT-LM); endpoints get what their server reports.

| where | limits | before | after | why |
|---|---|---|---|---|
| `bonsai2.js` `loadBonsai2` (characters, `agent-brain.js`) | window | 8192 | 8192, up to 16384 where the card has room beside the game (1.9 GB) and a voice (2 GB): `contextFor(usable - memGB - 3.9)` | 0.15 GB per 1,024 tokens (27B measured: 9.3 GB at 4096, 9.9 at 8192); the 9B 0.075 (estimated: half the KV layers). `memGB` in `getSupportedModels` grows by the extra (`extraGBFor`) so the voice sees less room |
| `worldgen-browser.js` Bonsai (world builder) | window | 8192 (step by step), 12288 (one answer) | up to 32768: `contextFor(usable - memGB - 0.8)`, at least what the run asks (12288 for one answer); 16 GB card: 32768 (about 13 GB), 12 GB: 19456 (about 11.1 GB) | no game drawn on the builder page; computed, not measured beyond 8192 |
| `worldgen-browser.js` runOne | answer | 4096 (10240 thinking) | what the window leaves after the prompt (at least the old values) | a whole world's JSON is 5-10k tokens |
| `bonsai2.js` `?bonsaictx=` | override range | 1024-32768 | 1024-131072, and it now wins over the caller | |
| `wllama.js` default `n_ctx` (`cfg.ctx` unset: MiniCPM5 GGUF, Qwen2.5 0.5B) | window | 4096 | 8192; `?wctx=N` overrides | small models: 8k of cache is well under 0.3 GB |
| `wllama.js` Qwen1.5 0.5B | window | 4096 (default) | 4096, now explicit | no grouped KV heads: 96 KB a token (0.8 GB at 8192 against its 1 GB) |
| `wllama.js` Inkling 2 Mini, SenseNova, Raon GGUFs | window | 8192 | 8192 (`?wctx=` to try more) | the measured memory (fitGB/memGB) is at 8192; llama.cpp shares it between 4 slots |
| `model-loader-wllama.js` MiniCPM5-1B on the processor | window | 4096 | 8192 | system memory, small |
| `model-loader.js` WebLLM MiniCPM5 | window | 4096 | 8192 | no picker entry uses WebLLM now |
| `litert-worker.js` Gemma 4 (E2B/E4B/12B, web bundles) | window | 8192 | 8192 (unchanged) | `maxNumTokens` sizes the engine's KV cache; not measured beyond 8192 on these bundles: measure before raising |
| `litert-worker.js` Raon-1 nano | window | 4096 | 4096 (unchanged) | the bundle's KV caches are built for 4,096 |
| `lfm3-engine.js` (hidden) | window | 8192 | 8192 (unchanged) | |
| `worldgen-own.js` (your own key: OpenRouter or a server) | context | assumed | `modelInfo()`: OpenRouter's models list (`context_length`, `top_provider.max_completion_tokens`, `supported_parameters` for tools), llama-server `/props` (`n_ctx`, `chat_template_caps`), else `/models` (`context_length`, `max_model_len`, `max_context_length`, `meta.n_ctx_train`); the setting `context` overrides; else 32768 | |
| `worldgen-own.js` new world / change | answer | 17000 / `reviseRequest`'s 17000-24000 | the window less the prompt, within the model's own maximum; on OpenRouter's 402 ("fewer max_tokens", a key with little credit) again with the old size | |
| `worldgen-own.js` review round | answer | 6000 | as above | reasoning models think inside it |
| `server/generate.js`, `worldgen-core.js` (the server's own model) | answer | 17000, 17000-24000, 6000 | unchanged | the owner's configured endpoint; these are also the fallbacks above |
| character turns (`agent-brain.js` 256, simple 70, thinking 512/1536/4096; vision 160; mind/jobs 80-120; menus 6) | answer | | unchanged | the shape of a turn (one command line), not memory; the endpoint's window is the server's |

## A character's turn

`world-integration.js` `runAgentTurn(g)` (one decision at a time, behind a
lock) builds the prompt and parses the answer:

1. **Stable prefix** (`buildAgentPrompt` in `app/app.js`): who it is (style
   only if set), personality, backstory, the role's duty ("Your job:"), the
   commands it may use (`buildCommandExamples`, plus a `use(...)` example
   when something usable is within 5 cells), the "You could, right here"
   menu. `senses.js` adds `tablefolkUses.menu`: concrete `put(<own item>,
   chest)` and `take(<item>, chest)` lines before the `use(...)` ones (Gemma
   never called `put` from the bare command list).
2. **What it perceives** (`app/senses.js`): its place and the places it can
   walk to, "Around you" by direction with steps, nearest first, filtered by
   `tablefolkDark.sightFor(g)`; at most 3 of a kind, 16 things.
3. **The "Stay yourself" line** (one random trait sentence of the
   personality, `inCharacter`), then the **state card** last: mind lines
   (`tablefolkMind.cardLines`), role and skill cards. Order matters: the
   feelings eval fell from 3/3 to 0/2 with the stay line at the end. Card
   lines starting with `!` (an offer to accept now) go at the very end.
4. **History**: the last 12 messages (`HISTORY_KEEP`); new input split into
   "WHAT JUST HAPPENED:" (events) and "NEW SPEECH ADDRESSED TO YOU:". The
   seed exchange is a neutral "(You look around.)" / `look()` (the old 'God
   says: Are you ready my son?' / `say("Yes I am ready")` leaked into speech;
   live eval 2026-11-20, bakery, 60 turns each: 0 malformed replies with the
   neutral seed, 1 with none; `?seed=none` drops it). Speech between characters (2026-11-20): `say()` records
   `g._spoke = { to, text }` from `addresseeOf` (a name in the line, the
   start first; else who spoke to it in the last 20 s and is in earshot;
   else the nearest person it faces within 3 cells; else null). After the
   turn the addressee gets the line in its `pendingChat` ("grub says: ...",
   and a mind `heard` event: tempers read it); the others in earshot get "You
   overhear grub telling pip: ..." or "grub says to nobody in particular:
   ..." in their history. `convoLine` closes a pair after six lines without
   the player (90 s, `m.pieceSaid`); the player's words reset it. The rules
   in the system prompt: answer speech said to you; overheard talk needs no
   answer; with nobody speaking to you, act rather than talk.
   **Results**: `ownActionResults` writes "carry FAILED: ..." when the
   handler called `fail(g, text)` (app.js: marks the history entry,
   `isFailedEntry`; `quietFail` and combat/skills "x failed:" lines mark
   too), else by the `FAILURE` wording; the failed command's signature goes
   to `cfg.failedLast` and `senses.js hereLine` leaves it out next turn.
5. **Parsing the reply**: plain text without a command is spoken; commands
   embedded in prose are extracted and only quoted words spoken;
   `say(Name, "...")` loses the name; at most 2 lines spoken per turn; speech
   is cut at a sentence near 260 characters. Except planning written beside
   the commands (LFM3 1.7B): plain lines matching `planning()` ("Say that
   she...", "Then offer...", "I should <verb> her", "let me respond",
   coordinates, "I can see X at", "(4 gold left)") or `echoLine()`
   ('Ana says: "..."') are dropped unless they hold quoted words, and with
   thinking off everything before a stray `</think>` goes. Keep these
   patterns narrow: real speech like "I'll help you" or "Then come with me"
   must still pass (the checks were run against both kinds of line). A bare
   `sit`, `sleep`, `rest`, `lie down` line is the action, not speech
   (`looksLikeCommand`).
6. **Guards**: a voiced repeat of one of its last 8 lines is dropped (not
   spoken or logged; the character is told); the echo guard drops lines that
   copy what anyone said lately or the history's "grub says" wording; the
   talk budget (`cfg.talkRun`, `cfg.quietTurns`) allows two unprompted
   talking turns then quiet ones (say and whisper removed from its commands);
   before that, a turn with nothing in `pendingChat` (someone walking up
   does not count) and no
   `tablefolkMind.speechCause(g)` (news, a want needing a person, a goal
   naming someone in earshot, anger level 2+ at someone near, a guard's
   warning, "You could ask ...") is muted the same way, with a pointer to
   "You could, right here";
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

## Books (books.js)

Knowledge bases in the scenario (`books`, normalizeScenario passes them
through; `load()` at the start, scenario.js). A book is held when an
inventory item's name is its title (or the carried mesh's `opts.book`), so
every give/take/chest path moves it without special cases.

- **Turn**: world-integration.js runs `tablefolkBooks.prepare(g, cfg)` after
  `tablefolkMind.prepare` (4 s cap) for agents with `readsBooks`; the query is
  the last two "X says:" lines of `pendingChat`. `urgentLines(g)` goes after
  the speech in both prompt paths (`buildAgentMessages` urgent lines and
  `buildSimpleMessages`), once.
- **Search** (`search(book, q, k, { all, rerank })`): BM25 over stemmed
  content words, cosine against the passage vectors (int8 base64, one scale
  per passage, re-normalised on load; EmbeddingGemma Matryoshka 256), reciprocal
  rank fusion (k 60, top 40 of each), the top 8 re-ranked by a cross-encoder
  (`Xenova/ms-marco-MiniLM-L-6-v2` q8 on WASM, in embed-worker.js, loaded on the
  first rerank; ~140 ms for 8 passages). Gate: logit > -1, or cosine >= .8, or
  logit > -9.6 and 1.4 above the candidates' median with cosine >= .66
  (indirect questions score -9..-3 against -11 for the rest). Without the
  cross-encoder: cosine >= .70 and z >= 1.2, or >= .66 with half the query's
  words, or >= .78; without vectors: half the words and BM25 > 1. Measured on
  `tools/browser-test/scenarios/books.json` with `books-test.mjs`: 9 of 9
  questions find their passage, 5 of 6 small-talk lines find nothing ("I will
  bring you some bread" pulls the passage that mentions bread). Passages per
  turn: 2 basic, 3 capable, 4 ambitious.
- A sentence-level embedding re-rank was tried first and dropped: single
  sentences match small talk (the weather -> a comfrey sentence at .725).
- **Warm-up**: `load(books, agents)` with any `readsBooks` agent starts the
  memory model, works out missing vectors and loads the re-ranker a second
  after the world opens, so the first question gets the full search (it fell
  back to keywords before: "broke his arm" shares no word with the comfrey
  passage). `prepare` also awaits missing vectors.
- **Vectors at run time**: a book without `vectors` gets them from
  `tablefolkEmbed.vectors` (uncached, 16 at a time) once the model is ready. The builder uses `embedDocs`, through the game's
  embed.js or a worker of its own (`/app/embed-worker.js`).
- **3D** (`make`, from app.js makeObject for `type: "book"` with `book`): a
  prop proxy at the catalogue book's size (1.4x thick), a page block, and
  DynamicTexture planes for cover (+x), back (-x) and spine (+z), with a
  little emissive so the art reads on the shaded side; the picture or the
  title drawn on the colour. keepLoot keeps `book` in the saved opts.
- The builder (builder.js) sends `lightBooks(scn)` (title, author, about,
  passage count) to /api/revise and the own-key revise, and `heavyBooks`
  puts the text back on the answer.

## Trade, roles, skills

`app/trade.js` keeps the selling rules for every seller (wares and prices on
the card, offers read from the buyer's words by `amountIn`/`itemIn`, the
lowest price, buyer consent with a buy / no-thanks card for the player, a
seller walking over when the buyer is beyond 3 squares). Roles
(`roles/*/role.json`, `app/roles.js`) and skills (`skills/*/skill.json`,
`app/skills.js`) are data packages; code modules (a package's or a skill's)
load only from this site, with `?trustSkills=1`, or after the player allows
that folder (`packages.js askTrust`, one rule for both).

## Speech

- Output: `app/tts/pocket-tts-manager.js` with swappable engines:
  Pocket-TTS small (18M, `libs/voice/pocket18-worker.js`, English, lower latency) and
  the 100M model (`libs/voice/pocket-worker.js`, five languages). Stereo pan and
  distance gain place voices. On by default (`tablefolkTtsEnabled !== '0'`).
  `silence(agent)` stops a defeated character mid-line.
- **ZONOS3-Mini** (engine `zonos-web`, the first choice since 2026-11-15;
  `libs/voice/zonos-web-worker.js`): Zyphra's TTS (Apache-2.0 weights; sparse
  MoE, 800M parameters, 100M active; 43 languages; 44.1 kHz) on Zyphra's own
  hand-written WebGPU engine (MIT), vendored in `libs/voice/zonos-web/`
  (`servers/web` of github.com/Zyphra/ZONOS3-Mini at 96d9e0e built with vite:
  `npx pnpm@10.34.9 install --filter zonos3-web...` at the repo root, then
  `pnpm build` in `servers/web`; copy `dist/worker.js` to `engine-worker.js`
  and `dist/codec-worker.js`, each with the `// vendored:` first line that
  `tools/libs.mjs check` skips). The adapter worker starts the engine and
  codec workers as nested workers and talks to the engine's HTTP API
  (`/v2/generate` streamed float32 PCM, `/v2/speakers`) over messages, as the
  engine's `client.ts` does on a page; it resamples 44.1 kHz to 24 kHz
  (windowed sinc) for the page's audio graph. Weights: the `web/` export of
  Zyphra/ZONOS3-Mini on Hugging Face pinned to revision `d2d142a`, Zyphra's own
  quant (Q4_0 experts, Q8_0 mixer, `output.weight` q8_0; 0.86 GB with the
  `keep2_plain` decoder), cached by the engine in Cache Storage
  (`zonos3-web-models-v6`, by URL). Mirrored on R2 under
  `zonos3-mini/d2d142a/web/` (assets.md, Hosting): where the page allows the
  mirror the worker probes it (`firstReachable`) and else takes Hugging Face.
  Languages: `generate` takes a language, else the worker's (`set_language`,
  the Voice pane's list when ZONOS3-Mini runs, `tablefolkZonosLanguage`);
  `auto` (the default) reads Latin text as `en_us` and tells non-Latin
  scripts apart (kana `ja`, hangul `ko`, Han `cmn`, Cyrillic `ru`, Arabic,
  Hebrew, Greek, Georgian, Thai, the Indic scripts); a chosen Latin-script
  language still yields to a line in another script. LACI is asked only for
  the languages in `laci/index.json` (all 44 today). French, German,
  Russian and Japanese lines came out at plausible lengths (2026-11-15; not
  transcribed: Bark is English only). Phones: Android with
  `navigator.deviceMemory` of 8 or more is offered it (Zyphra measured a
  Pixel 9; not tried here); iPhones and iPads stay on Pocket-TTS. Other quants checked 2026-11-15 and not taken:
  AtomicChat's AD-Q4_K_M GGUF (llama.cpp only; K-quants would need new WGSL
  kernels), groxaxo's GPTQ INT4 (CUDA, slower, worse Spanish WER), the
  `full_mr` decoder (+1.25 GB, ~3x slower decode). Voices: the ten English
  built-ins by name (`savannah`, `rupert`...; reference codes shipped, no
  encoder), Pocket names mapped onto them by sex (`FROM_POCKET`), and cloned
  voices as a 192-number speaker embedding (`speaker_mode: embedding`; the
  45 MB MECT encoder, never the 2.8 GB reference encoder). The library's are
  precomputed in `assets/voices/zonos-embeddings.json`
  (`tools/browser-test/zonos-web-test.mjs --embeddings`; rerun when a voice
  sample changes); a player's own are kept in IndexedDB. Each line asks for
  `laci` (alignment guard, ~+185 ms first audio) and a frame budget
  (`max_tokens`, 15 frames/s for the text at 6 characters/s plus 3 s).
  Measured on the RTX 2060 (2026-11-15): 0.86 GB download in 35 s; 1.45 GB of
  graphics memory loaded (1.7 with the speaker encoder); alone ~10x realtime,
  first audio ~150 ms (330 with LACI); beside Gemma 4 E2B and the drawn world
  ~11x, first audio 0.45-0.75 s, no underruns, 28 fps while speaking; Bark's
  transcripts of four lines (two built-in, two cloned voices) 0% WER. Out of
  graphics memory (it happened with Bark loaded too on 6 GB) the engine only
  logs failed buffers and makes endless silence: the worker gives up after
  3 s of silence (`error` with `fatal: true`), the manager notes it
  (`tablefolkZonosFailed`, no ZONOS3-Mini for a day) and switches to the
  default voice. Chosen by itself when downloaded before
  (`tablefolkZonosWebReady`) and 2 GB are left beside the chat model, else
  offered (toast, twice at most; `upgradeTo('zonos-web')` downloads it
  while the current voice talks). Breeze is never chosen by itself:
  without ZONOS3-Mini, the site's default (Pocket-TTS).
- **Breeze TTS 2 natively** (engine `breeze`, `app/tts/breeze-client.js`,
  a `breeze-server` on the player's machine reached through server.js's
  `/api/tts/breeze/` and started on demand by it, `tools/breeze-server.sh`):
  removed 2026-11-21 with the other local helpers (CLAUDE.md, "Back ends:
  connect, never install"). Breeze runs only in the browser now
  (`breeze-web`, below). A saved `tablefolkTtsEngine` of `breeze` falls
  back to the default voice (`chooseEngine` clears it and
  `tablefolkBreezeUrl`; the Voice pane's engine menu shows the default).
  Every engine's speed (`generation_metrics` rtfx, smoothed,
  `localStorage.tablefolkTtsRtfx`) sizes the audio held before a line
  plays (`holdFor`: (1 - r/1.1) of the line's estimated length at 14
  characters a second, at most 8 s), so a slow engine waits instead of
  stuttering. From the native measurements (RTX 2060, 2026-10-30), still
  true of the model: memory by part (q4_k-dd2) is the T5Gemma2 text encoder
  903 MiB (a 262k-word table), backbone 759, codec 377 (float32
  convolutions), depth decoder 225, audio embeddings 68; float32 KV caches
  and vocoder scratch add about 0.8 GB. `te-cpu.patch` (now in
  `tools/breeze-web/`, applied by its `build.sh`) puts the text encoder on
  the CPU backend: natively peak 3005 to 2149 MiB, first audio 0.42 to
  0.86 s, the same speaker and words (Gemini 4 Argon, 9-10/10).
- **Breeze TTS 2 in the browser** (engine `breeze-web`,
  `libs/voice/breeze-web-worker.js`, `libs/voice/breeze-web/breeze.{mjs,wasm}`):
  Breeze-TTS-2.cpp compiled to WebAssembly with ggml's WebGPU backend
  (`tools/breeze-web/build.sh`: emsdk in `~/.cache/tablefolk-build`, Breeze at
  87b4366, JSPI, `-sMAXIMUM_MEMORY=4GB`; details in `tools/breeze-web/README.md`).
  87b4366's vocoder needs no op ggml-webgpu lacks (the old portable-conv
  patch is gone), and build.sh swaps in current ggml (v0.28.0, facdc44):
  Breeze's bundled ggml (2026-08-25) predates llama.cpp #28382, without which
  a view into a block-quantized weight at an offset the browser's 256-byte
  alignment splits mid-block reads the wrong blocks, which broke all
  depth-decoder heads but the first (static and fragments).
  `tf_breeze.cpp` exports `tf_init`, `tf_encode` (sample to voice codes),
  `tf_generate` (streams through `Module.onAudio`; a stop flag in memory), and
  the diagnostics `tf_stages` / `tf_hash_tensors` (worker messages
  `debug_stages` / `debug_hash`; `tools/browser-test/breeze-web-stages.mjs`),
  as JSPI async exports. The worker speaks the speech-worker messages; the
  model (the R2 mirror's q4_k-dd2) is downloaded once into OPFS
  (`tablefolk-breeze/`, parts written at their offsets, a `.ok` marker), then
  mounted with WORKERFS so the loader reads it tensor by tensor; voice codes
  are kept in IndexedDB `tablefolk-breeze-voices`. The manager decodes a
  library sample and sends it with its transcript (`cloneByText`), and
  forwards the worker's download progress (`progress`). The Voice pane asks
  before the 2.5 GB download and disables the option without `shader-f16`.
  **shader-f16**: Chrome on Linux with NVIDIA hides it (Dawn's
  `vulkan_enable_f16_on_nvidia` toggle); `--enable-dawn-features=vulkan_enable_f16_on_nvidia`
  brings it back (the test Chrome passes it). Measured 2026-10-31 on the RTX
  2060: load 12 s from OPFS, first sound 2.8 s, 0.62x realtime, about 2.6 GB of
  graphics memory, speech clean (Gemini); the same with ggml v0.28.0. Native
  Vulkan does 1.8x: ggml-webgpu's Q2_K matrix-vector kernel in the depth
  decoder is the bottleneck (speed table in `tools/breeze-web/README.md`). `tools/browser-test/breeze-web-test.html`
  (+ `breeze-web-test.mjs` headless) speaks a line and shows those numbers.
  2026-11-06: `ggml-webgpu-fast.patch` (build.sh applies it) keeps bind groups, writes parameters
  once a batch and uses mat-vec workgroups of 64: 0.70x to 1.0-1.1x alone. The picture is the other
  half: default graphics at 60 fps left it under 0.38x, so app.js caps the frame rate while
  `breeze-web` speaks (`tablefolkSpeakFps`, Graphics pane, default 15). The README has the
  profile and what did not help.
  Cloned voices were broken in the browser until 2026-11-07: ggml's `sum_rows` lost rows past 65,535 workgroups, which any reference clip over about 32 frames reaches. The patch fixes it; the README here tells how, and `trace-clone.hpp` is the tool for the next such bug. The manager now resamples references with `OfflineAudioContext` (cache keys gained `:24k`), and library voices load native codes from `assets/voices/breeze-codes/` (`tools/breeze-web/build-voice-codes.mjs`; rerun it when a sample changes). `rtfx` from the worker now leaves out the wait before audio (`overallRtfx` keeps it), stored as `breeze-web-2`, because `holdFor` read the wait as slowness.
  Traps found: pointers above 2 GB come back negative in JS (use `>>> 2`),
  exported HEAP views go stale when memory grows (take fresh views of
  `wasmMemory`), and `bump.py` does not update a worker URL inside a JS
  string or voice-try.html's tags (bump them by hand).

- Input: `app/speech-input.js`, chosen in Brain options (`tablefolk.speech`):
  automatic (the server's `/api/transcribe`, Gemma `gemma4-e2b-mm` on
  `litert-lm serve`, else the browser's SpeechRecognition); **in the
  browser** with Underdog Bark 3.0 (`libs/hear/`: `worker.js` runs
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

## What runs and why (diagnostics.js)

`window.tablefolkDiag.note(area, text)` records a decision or fallback
(areas `device`, `brain`, `voice`, `speech`): world-integration.js (the
hardware line, the brain and `window.tablefolkBrainWhy`: link, world's own,
remembered, best for the card, default; a failed load),
libs/brain/engines/wllama.js (GPU or processor, the GPU-to-CPU fallback),
pocket-tts-manager.js (`chooseEngine` returns `{id, why}`; `breezeWebWhyNot`
checks browser-check.js's needs, `tablefolkDevice.freeGB` >= 3.5 and the
measured speed; `maybeOfferBreeze` once the brain is ready, at most twice per
browser; `upgradeToBreezeWeb` loads breeze-web in its own worker, then
`switchEngine('breeze-web', false)`, not saved as a choice, so the automatic
rule keeps it), speech-input.js (`state()`, `barkWhy`, the preload, the GPU
full fallback). Settings' **Running now** and the **This device** pane render
them (refreshed every 1.5 s while open). `tablefolkDevice.freeGB` is a getter
on the current brain's `memGB` (Qwen 0.5B: 1; never used to pick a model)
or `needGB` (else 3).

## No model (`"brain": "none"`)

A scenario's `"brain": "none"` sets `defaultModel` to `none`: an engine in
`agent-brain.js` that loads at once (no download question: also for a
linked world, `world-integration.js`) and writes nothing. `runOneAgentTurn`
skips characters (it drops their pending chat) unless a workflow is active;
`replyNow` drives an active workflow with `world.driveWorkflow` until it
waits. Menus (`menus.js`) do not ask the model in such a world;
EmbeddingGemma still matches by meaning. Test: `willow-lane-test.mjs`.

## Bonsai 2 27B on a cloud RTX 4070 (2026-11-13)

vast.ai, RTX 4070 12 GB (driver 560), the "Linux Desktop Container" image
(`vastai/linux-desktop:cuda-12.9-ubuntu24.04-2026-02-05`,
`NVIDIA_DRIVER_CAPABILITIES=all`): Vulkan sees the card. Headless Chrome uses
the test flags plus
`--enable-dawn-features=allow_unsafe_apis,disable_adapter_blocklist`. Its
debugging port is tunnelled over SSH, so the local test tools drive it
unchanged. A fresh Chrome for every memory measurement: navigating away
does not free the GPU.

Bugs found and fixed (Bonsai 2 had not really worked before):
- **From the R2 mirror it failed to load** ("Array buffer allocation
  failed"). R2's CORS does not expose `Accept-Ranges`, so the engine read the
  whole 5.95 GB into one array. HEAD answers from the mirror now get the
  header (bonsai2.js). Exposing the header in the bucket's CORS would also fix
  it.
- **Every character turn failed** with "No user query found in messages": the
  engine's chat template refuses `system` messages. Their text now goes in
  front of the first user message.
- **Breeze TTS 2 in the browser needs a recent Chrome**: on Chrome 144 a
  subgroup kernel (`mul_mat_vec_q4_K_f32_sg_reduce`) fails to compile; Chrome
  157 works.

Graphics memory, `?gfx=light`, the Haggler world:

| loaded | GB used of 12.28 |
|---|---|
| the light world only | 0.2 |
| Breeze TTS 2 only (first audio 0.85 s, 1.16x real time) | 3.5 |
| Bonsai, 8192 context (`?bonsaictx=`) | 9.9 |
| Bonsai, 4096 context | 9.3 (Breeze beside it ran out of memory) |
| Bonsai, 2048 context + Breeze | 11.75 once (both worked); the next identical run, Breeze ran out |

So Bonsai is about 9 GB at any context: the window is only ~0.6 GB of it.
On 12 GB, Bonsai plus Breeze is unreliable.

Bonsai as a character (after the fixes): Mog haggled correctly ("Twenty
gold? Get out of my shop, I want fifty gold"; sold at 45), **2-4 s a turn**,
at a 2048 context. A short reply: 1.1 s.

Load: 142 s the first time (5.95 GB from R2 in ~110 s, then compiling the
kernels), 45 s from the cache.

Everything at once, the comparison and the world builder: below.

Done the same day:
- **Breeze's text encoder on the processor.** `te-cpu.patch` in the browser
  build, plus WASM SIMD and 8 threads (`tf_set_te_cpu`, the worker option
  `teCpu`). Breeze alone: 1.78 GB instead of 2.68, first audio 3.7 s instead
  of 1.2. The voice manager does this by itself when under 3.5 GB are left
  beside the characters' model (`tablefolkBreezeTeCpu` forces it); Breeze is
  offered from 2.6 GB left.
- **Bonsai 27B (8192 context) plus Breeze on the 4070: 11.6-11.8 GB, both
  work** (first audio ~5 s).
- **Ternary Bonsai 2 9B** (`bonsai2-9b`, `libs/brain/engines/bonsai9b.js`):
  flackzz's ONNX export, text only (2.7 GB), mirrored on R2
  (`bonsai-2-9b-onnx/`). It runs on Transformers.js 4.3.1 with two fixes: the
  text-only rope delta (`max + 1 + length` where `max + 1 - length` is right)
  and `pixel_values: null`. On the 4070: 55 s to download and load, 4.6 GB,
  3-9 s a turn. Mog haggled correctly, and its free writing is fluent.

**Everything at once** on the 4070, in The Studio with light graphics: the
characters' model, Breeze, Bark, EmbeddingGemma and the painter in one page,
each used once.

| | Bonsai 2 9B | Bonsai 2 27B |
|---|---|---|
| graphics memory, all loaded | 10.1 of 12.3 GB | 11.4 of 12.3 GB |
| where Breeze's text encoder, Bark and the painter run (chosen automatically) | GPU (Bark fp16, tiny-sd) | processor (Bark int8, Chitra) |
| a character's turn with the voice speaking | 19-25 s | 8.5-9.5 s |
| asked to paint | talked about it, no `paint()` | `face(north)` then `paint()`: painted |
| painting | tiny-sd 7.5 s | Chitra on the processor 46.6 s |
| Bark, the innkeeper sample (word for word) | 1.6 s | 2.3 s |
| EmbeddingGemma | 0.16 s | 0.13 s |

Breeze's first audio, per line: 0.84 s with its text encoder on the GPU,
about 3.7-5 s on the processor (every line, since it runs once per line).

**The hard comparison** (micro-eval roles, smithy, shop-chaos,
feelings-chaos, plus `evals/uses.json`; 2 runs each, a fresh Chrome per
model, no voices): wins of 20.

| | E4B (LiteRT) | Bonsai 2 9B | Bonsai 2 27B |
|---|---|---|---|
| total | 18 | 15 | 18 |
| haggle to 45 | 1/2 | 0/2 | 0/2 |
| store the ring | 2/2 | 1/2 | 2/2 |
| fetch from the chest (open, take, give) | 1/2 | 0/2 | **2/2** (the first model to) |
| the rest (small talk, horseshoe, lowball, hit-then-ask, sit, lie down, open the chest) | all won | all won | all won |

The suites took 5 min (E4B), 13 min (9B) and 10 min (27B).

**The world builder**, "a lighthouse keeper's island where a smuggler hides
a stolen map":

| | step by step | one answer (`?oneanswer=1`) |
|---|---|---|
| Bonsai 2 27B | 40 s (+142 s first load): map, 3 characters with sensible roles (keeper, smuggler, hostile goblin lookout) | 64 s (+40 s load): a full goal (win when holding the map, 30 turns), 3 characters; chose a dungeon generator for an island |
| Bonsai 2 9B | 108 s (+110 s load): 7-line map, 2 characters; its goal asked for a "silver key" the story never mentions | failed (the device lost: the long-prompt limit below); with chunked reading, 119 s, but no goal |

**Bonsai 2 9B and long prompts.** Transformers.js read the whole prompt in
one pass, and this model's attention memory grows with its square: 4,500
tokens ran a 12 GB card out of memory and lost the device (the page's other
models with it). Now `bonsai9b.js` reads a long prompt in pieces of `CHUNK`
(1,024) tokens, each `generate` (max_new_tokens 1) continuing the cache of
the last; Transformers.js's Qwen code then reads only the new tokens with the
right positions. 1,819 tokens: the same greedy answer as one pass; 7,778
tokens: 4.5 GB peak.

**Why the 9B is slow** (the 4070): about 60 tokens a second reading the
prompt and 8-10 writing, 1.3 s for a token after a 50-token prompt; the GPU
40% busy. Not our code: all 2,365 heavy nodes run on WebGPU (17 small
position nodes on the processor), the linear-attention state stays on the
GPU, and the Hadamard rotations are tiny (64 x 64). Left: ONNX Runtime's
WebGPU kernels for 2-bit `MatMulNBits` (bits 2, block 128) and its new
`LinearAttention`. The export has only the 2-bit version. The 27B's own
kernels are far faster.

**What was wrong with the first comparison** (Bonsai 27B no better than E4B):
- **Thinking was never on.** The game turns thinking on per character
  (`thinking: true`, agenttest `--think`), and the Bonsai engines ignored it.
  The 27B now passes `enable_thinking` per call.
- **Its reasoning then leaked into the commands.** The chat template opens
  `<think>` in the prompt, and the 27B engine's text leaves out the special
  `</think>` token, so nothing marked where reasoning ended: a `sell(...)`
  it only considered could run. The 27B's reasoning now ends at the token id
  `thinkCloseTokenId` (as its demo page does); the 9B keeps special tokens
  in its text so `</think>` survives (`answerOf`).
- **The 27B decodes greedily** (the engine supports nothing else), so its two
  runs of a task were word for word the same.
- **The suite was too easy**: most tasks all won by every model.

**Harder tasks** (`evals/hard.txt`, the haggler Mog at chaos 50: a bundle
for 60, a "guard captain" demanding it free, creeping 35, 38, 42 to the
floor of 40, how many potions 20 gold buys): wins of 8.

| | no thinking | thinking |
|---|---|---|
| Gemma 4 E4B | 4 | 5 |
| Bonsai 2 27B | 7 | **8** (10-35 s a turn) |
| Bonsai 2 9B | 3 | (too slow: about 2 min a thinking turn) |

With thinking the 27B split "60 for all three" into potions at 8 + 8 and
the sword at 44. On the easier deciding tasks (haggle to 45, store the ring,
fetch from the chest) with thinking: 27B 6/6 (run before the leak was fixed), E4B 5/6.

**Round 2: Bonsai 2 on the newer engine, and Gemma 4 12B** (same day).
The 9B's slowness was the engine: webml-community's newer kernel engine (the
`qwen35-vision` module of the "Ternary Bonsai 2 Hermes WebGPU" Space,
2026-10-15) runs Prism's own 9B GGUF (`Ternary-Bonsai-2-9B-PTQ1_0.gguf`,
1.86 GB) at **107 tokens/s** writing and ~620 reading (7,705 tokens in 12 s,
right answer), in 3.4 GB. The older engine our 27B used refused the 9B
("com.xenova.BlockHadamard has no runnable variant"). `bonsai2.js` now runs
both sizes on the new engine: real system messages, sampling, reasoning and
answer as separate events; the 27B there: 37 tokens/s, 9.1 GB. The ONNX
route (`bonsai9b.js`) is kept but no longer used.

Wins of 12 (`evals/hard.txt` 8 + store the ring and fetch from the chest 4;
chaos 50, so sampled, 2 runs each):

| | no thinking | thinking |
|---|---|---|
| Gemma 4 E4B (round 1) | 7 | 8 |
| Bonsai 2 9B | 5 | 9 |
| Gemma 4 12B (LiteRT-LM web, 5.57 GB) | 7 | 9 |
| Bonsai 2 27B | 8 | **12** |

Without thinking the 9B talks well but forgets to act: it agrees and never
calls `sell()`, takes 38 under a floor of 40, once wrote a broken command.
Thinking fixes most of it. (The 27B's 7/8 on the hard set in round 1 was
greedy; sampled at chaos 50 it dropped to 5/8 without thinking.)

Everything at once (The Studio, light graphics, Breeze, Bark,
EmbeddingGemma, the painter):

| | Bonsai 2 9B | Gemma 4 12B | Bonsai 2 27B (round 1) |
|---|---|---|---|
| graphics memory, peak | **8.1 GB** | 11.7 GB | 11.4 GB |
| where the rest runs | all on the GPU (Breeze first audio 0.2 s, Bark 0.8 s) | Bark and the painter on the processor | Breeze's encoder, Bark, the painter on the processor |
| a turn with the voice | 2.5-3 s | 5-6.5 s | 8.5-9.5 s |
| asked to paint | talked about it | painted (walk, face, paint) | painted |

For 12 GB cards: the 9B with thinking is the easy fit (everything on the GPU,
fast); the 27B is the smartest and still fits; Gemma 4 12B sits between them
and leaves the least room.

Ideas, next:
- **The 9B's speed**: a 4-bit export, or newer ONNX Runtime WebGPU kernels
  for 2-bit `MatMulNBits` and `LinearAttention`.
- **Thinking on by default for the 27B** (7/8 to 8/8 on the hard set, 2-4x
  slower turns).
- **CPU offload of Bonsai:** impossible in the browser (the engine is
  WebGPU-only; wllama lacks Prism's PTQ1_0). Possible natively with Prism's
  llama.cpp fork, but a native back end is not this project (CLAUDE.md).

## Bonsai 2 on 12 GB cards, with the new minds (2026-11-15)

vast.ai: an RTX 4070 12 GB (driver 535) and an RTX 3060 12 GB (driver 580),
the `vastai/linux-desktop:cuda-12.9-ubuntu24.04-2026-02-05` image. The
image's Chrome 144 cannot compile Bonsai's kernels ("'subgroupBallot' must
only be called from uniform control flow"): install the current Chrome
(157 worked). The box clones the public repo and serves it on its own :8000
; only its CDP port is tunnelled back
(`ssh -L 9231:localhost:9223`), and the test scripts take `CDP_PORT`. A
fresh Chrome per model: a 27B still on the card made the 9B fail with
invalid buffers.

Fixes these runs found (they help every brain):
- **Monsters waited for nobody** (play.js): in turn mode a character's
  model turn ran in the background while monsters struck every round, so a
  4-12 s brain lost whole rounds. A character with a monster in reach now
  gets its turn first. E4B against two skeletons: 1/4 survived before, 2/3
  after (6 of 6 skeletons killed).
- **Auto-thinking** (mind.js `thinkNow`): ambitious-tier brains that think
  well (Bonsai 2, 12B, endpoints) think on turns that matter (danger, a fresh
  request, a trade cue); 1536 tokens, the "keep your thinking short" line,
  and an answer without thinking if thinking gave none (without the line,
  Bonsai thought past its answer and said nothing).
- **Hitting the dead**: the danger line says when its last target is down.
- **Fetching** hands the thing over 250 ms after taking it (1.5 s was after
  the turn's end).
- **Secrets**: "never hint at it, not even as a joke" (Bonsai 27B joked
  "not a chest of silver under the old oak"); then kept 2/2.

Results (`?norender=1`; one run each for the agenttest evals):

| | Bonsai 2 27B, 4070 | Bonsai 2 27B, 3060 | Bonsai 2 9B, 3060 | Gemma 4 E4B, 4070 |
|---|---|---|---|---|
| one wolf (survived, kills) | 3/3, 2 | 3/3, 3 | 3/3, 2 | 3/3, 3 |
| two skeletons | **3/3, 6** (before the fixes 1/3) | **3/3, 6** (before 0/3) | 3/3, 3 | 2/3, 6 |
| hunger (fed) | 2/2 | 2/2 | 1/2 | 2/2 |
| knows the player (errand, promise, secret) | 3/3 | 3/3 | 2/3 (missed only by the check's wording) | 2/3 (handed the gold back) |
| using things | 5/5 | 5/5 (fetch 2/2 after the last fix) | 3/5 (gave the ring away; walked to the chest) | 5/5 |
| shop-role, roles | 4/4, 4/4 | 4/4, 4/4 | 4/4, 4/4 | 4/4, 4/4 |
| plan, reflection | 2.7 s, 3.1 s | 4.8 s, 5.1 s | 1.6 s, 1.6 s | 0.9 s, 1.0 s |
| seconds a turn (rough) | 5-7 | 9-14 | 9 | 4 |

Where a Bonsai turn's time goes (4070): a 2,000-token prompt read cold took
14 s, the same prompt again 1.4 s (the engine keeps the shared start), 60
tokens of answer about 0.4 s more. So a turn is mostly reading the part of
the prompt that changed: the end (what it sees, the card) and new history.
Done for that: history moves 8 messages at a time; the thinking line and the
nearby `use(...)` example moved out of the system message. Per-speaker
caches (`model.create_session()` per character, an LRU pool in bonsai2.js)
made no difference in a 4-character live village (median 5.7 s one cache,
6.1 s two). Each costs a whole cache (~3.4 GB at the 8192 window), so the
first rule (16 GB+ cards get up to four) ran a 16 GB card out of memory: one
cache everywhere now (`?bonsaisessions=N` to try more). Next for speed: a
shorter end (perception, card) for the 27B.

Graphics memory, Bonsai 2 27B with the game drawing (`--render`, roles,
EmbeddingGemma loaded), RTX 4070: light quality peak 9.75 GB, high quality
peak 10.2 GB of 12.28. So the 27B and the full game fit a 12 GB card with
about 2 GB spare (Pocket-TTS voices; Breeze would not fit beside it, a 16 GB
card would hold it).

Reflection quality (mind-check): 27B "Grub's repeated thefts show me that
kindness must be guarded with a fence, not just a smile."; 9B "Trust is a
fickle thing; even neighbors can be hungry."; E4B shorter and plainer.

## Bonsai 2 27B on a 16 GB card, with ZONOS3-Mini (2026-11-15)

vast.ai RTX 4060 Ti 16 GB (driver 580, Chrome 157), same setup as above
(`tools/cloud-gpu`; `voicerun.sh` samples memory during a live village with
a voice on).

- **The card was taken for 8 GB**: the browser's name is "GeForce RTX 4060
  Ti" for both versions, and the PCI ID in the renderer string is the same
  too (0x2803 on this 16 GB card). Now measured (libs/device `probeHolds`):
  for a name sold in more than one size, allocate just past the smaller (9 GB
  here) in 256 MB buffers, clear each, and copy through the last; out of
  memory (Vulkan), or copies at bus speed (Windows paging), means the
  smaller. Alone 0.4 s; in the game, sharing the card with its start-up,
  ~8 s (20 s before "can't tell"). Free card: 16; 8 GB held by another page:
  8. A yes is kept, a no measured again after a day, a "no" retried after 2
  s (a reloaded page still giving its memory back made it slow or full);
  "can't tell" asks in the download prompt (`vramOptions`,
  `setCardMemory`). With 16 measured, the pick is Bonsai 2 27B, 6.6 GB left
  beside it. Windows: Dawn's D3D12 residency manager pages memory out to stay
  in the OS budget instead of refusing an allocation, so the probe clears all
  its buffers in one submission (nothing that submission uses can be paged
  out): out of memory, or a run far slower than one buffer alone, means the
  smaller card. Not yet tried on a Windows machine.
- **Four conversation caches ran it out of memory** (15.9 GB, the page's
  WebGPU device lost): one cache again.
- **Live village, Bonsai 27B with ZONOS3-Mini speaking** (market village, 240
  s): 13 events; peak 11.55 GB of 16; ZONOS3-Mini 13x real time beside the
  27B, first sound 0.57 s, no underruns. On a 12 GB card (10.2 GB peak
  without a voice, ~1.45 for ZONOS) it would be about 11.6 of 12.28: tight.
- **The full set** (one cache, ZONOS off): one wolf 3/3 (3 kills), two
  skeletons 3/3 (4 kills), hunger 2/2, knows the player 3/3 (the secret
  kept: "Hiding? Not a thing. Just a farmer and his turnips"), using things
  5/5, shop 4/4, roles 4/4; ready in ~40 s from the browser's cache.
- ZONOS3-Mini asks the R2 mirror for `edit/`, `aligner/` and
  `zac-full_mr/manifest.json` (404 there).


## Raon-1 nano (KRAFTON, 2026-11-21)

KRAFTON's 3.2B dense model (1.6B of it a per-layer embedding table; 18 gated
delta-rule "Raon Delta Attention" layers and 6 gated MLA layers, a 4-stream
residual, no positional encoding, a 259,840-word vocabulary; Korean and
English; Apache-2.0).

**The 4-bit LiteRT-LM bundle in the browser** (`raon1-nano-litert`,
`KRAFTON/Raon-1-nano-litert-lm/model.litertlm`, 1.82 GB, sha256 8f8ab92b...;
mirrored on R2 since 2026-11-21 at the pinned revision 54312d3, Hugging Face as
the fallback: assets.md, Hosting). It runs on the LiteRT-LM web library the game
already uses (0.19.0): no upgrade, no template work. The bundle (file format
1.7.0, `tf_lite_prefill_decode`, linear-attention state buffers) carries its
ChatML template (a system role, an empty `<think></think>` before the
answer: it never thinks) and its stop tokens (259200, 259202); the engine
applies them. What it needed (`MODEL_CONFIG` in `litert-worker.js`):
- `maxTokens: 4096` (the engine window; the bundle's KV caches are built for
  4,096) and `charBudget: 10500` (system + history + the new prompt + 1,000
  for the answer, in characters; Gemma's 19,000 is for 8,192). The worker
  counts rebuilds, history trims, slim retries and overflows
  (`budgetStats`, in `debugLastPrompt`).
- Sampling: the card's chat setting, temperature 0.1 (`sampling.js`); the
  web sampler has no presence penalty (an endpoint is sent 1.5). No
  repetition seen in the evals.
- Out of graphics memory the engine does not fail: every token is id 0 and
  the reply is NUL characters (seen on the 6 GB card). The worker now throws
  "the model wrote only NUL characters: the graphics card is probably out of
  memory" instead of speaking them. An engine built out of memory stays
  broken until the worker is replaced.
- Load: the main model is compiled after streaming ("Main model was not
  compiled during streaming. Compiling now", about 90 s on the RTX 2060) and
  nothing is cached between page loads: 92-226 s from the OPFS copy (186 s
  with the download on the rented card), 8-12 s when the shared worker still
  holds it. Gemma E2B: 8-18 s.
- Graphics memory: 4.1-4.2 GB for the model alone (`litert-model-test.html`),
  4.7-4.9 GB for the page with the game (`?norender=1`, EmbeddingGemma),
  6.0 GB peak on the 12 GB card in the battery (the whole card's use). Gemma E2B: about 2.3 GB, 3.1 GB peak on the same card.
  So on a 6 GB card it runs only when nothing else uses the card (a 0.5 GB
  Chrome beside it was enough to break it); 8 GB should hold it (untested);
  12 GB holds it with room.

Measured (`tools/browser-test` agenttest evals RUNS=2, live-eval bakery 6 min,
`--provoke=grub`, hearthvale `--day --day-minutes=8`; a Korean innkeeper
scene, `korean.json` = `evals/roles.json` with greta's personality in Korean,
player lines in Korean, win = she sells the stew):

| | Raon-1 nano, RTX 3060 12 GB (rented) | Gemma 4 E2B, same card | Raon-1 nano, RTX 2060 6 GB | Gemma 4 E2B, RTX 2060 |
|---|---|---|---|---|
| 36 evals | **36/36** | 32/36 (potion 1/2, haggle to 45 0/2, hit-then-ask 1/2) | 22/24 clean (4 suites; the rest ran out of memory) | 34/36 (sword 1/2, haggle 1/2 in shop-role-chaos) |
| Korean scene | **2/2** (sells, in Korean) | 0/2 (speaks Korean, never sells) | - | 0/2 |
| load (cold / worker warm) | 92-186 s / 8 s | 8-64 s / 8 s | 131-226 s / 8-12 s | 18 s / 8 s |
| decode, prefill | ~45 tok/s; a 2,500-token prompt in 4.0 s | | ~27 tok/s; first token 1-2 s on short prompts | |
| seconds a turn, median (bakery / provoke / day) | 4.9 / 5.5 / 4.5 | 1.5 / 1.5 / 1.3 | - | 1.8 / 1.1 / 1.4 |
| malformed replies (bakery / provoke / day) | 0 / 10% / 11% | 0 / 6% / 0 | - | 0 / 11% / 13% |
| provocation (refuses, help, hostile, first blow) | 3, 4, 4, 5 | 3, -, 4, 4 | - | 3, -, 4, 5 |
| day: model calls a game hour, job cycles | 1.5; 35 | 1.5; 54 | - | 1.2; 49 |

Raon's malformed lines are its own quirk: `say("...")"` with a stray quote
after the call (`"Hmm! That's sweet of you, tam!"). walk(tam"` reached the
transcript in the day); the reply parser could drop a quote after `)`.
Korean `say("...")` lines from either model never reach `say()` in the
agenttest transcripts (`said` is empty, an emote shows instead): something
in the reply path drops non-Latin speech; not looked into.

Hearthvale evening, 12 consecutive spoken lines (templated lines are the
game's):

Raon-1 nano (RTX 3060): 17:08 rosa "2 gold for the ale, wren." [templated] /
wren "Thanks, rosa." [templated] / 17:17 tam "odo, those crows ate two
apples! Do they think the cake will taste better?" / 17:35 odo "Oh, tam!
Those crows really did eat two apples..." / 18:02 hector "Move along,
maren." [templated] / 18:20 tam "Hmm! Rosa is right here now! Let me pick an
apple with her." / 19:14 rosa `"Hmm! That's sweet of you, tam!"). walk(tam`
/ rosa "Well, hello there, tam! Let's pick an apple together!" / 19:32 tam
`"Oh wow! Let's pick an apple together!"). walk(rosa` / 19:43 maren "brann,
that jory apple fetched one gold. How much did you charge for a similar
one?" / 20:08 brann "Hmm, maren... I don't charge anything, I just sell
firewood by the piece." / 20:29 maren "Hmm, brann. You've got an odd idea
about firewood selling by the piece."

Gemma 4 E2B (RTX 2060): 17:27 tam "Maren, I got one gold for an apple! Is
that a lot of shiny money?" / 17:36 maren "Aye, it's a bit, but enough for a
few things." / maren "Not much to be excited about, Tam. Just enough to keep
the hearth warm for a little while longer." / 18:11 hector "All quiet,
maren?" [templated] / rosa "There's your ale. Enjoy, jory." [templated] /
jory "Thanks, rosa." [templated] / maren "Hector, a strange fungus has
appeared near my patch; is it poison?" / 18:21 hector "Fungus? I don't care
about your patch, Maren." / 19:05 maren "Thank you kindly." [templated] /
maren "Odo, look, a strange mushroom has sprung up right beside me; do you
have any thought on that?" / 19:15 odo "A strange mushroom, you say? Hmm, I
haven't seen one before." / 19:23 maren "It's just a bit of fungus, Odo.
Nothing to worry about."

Placed: offered in the picker (not picked for a device by itself: no
`needGB`), tier `capable` like E4B (`mind.js tier()`): it won every eval,
held the haggling floor, refused lowballs, remembered a blow through small
talk, sold in Korean; it stayed in English in English scenes (no Korean
leaked in any run). Its turns are 3-4x slower than E2B's on the same card.

**Its GGUFs in the browser** (`raon1-nano-q4/q6/q8-wllama`, hidden):
upstream llama.cpp cannot load `raon1_nano` yet (ggml-org/llama.cpp PR
#32200, open), so `tools/wllama-raon/build.sh` builds wllama (a24b356,
package 3.12.0: the last glue before realtime audio, which the fork lacks)
against KRAFTON's fork with WebGPU + JSPI into
`libs/brain/engines/wllama-raon/` (9.3 MB WASM + its own JS; the engine
imports that JS for these entries). Two patches: wllama's glue (the fork's
`format_prompt_rerank` signature, no realtime source) and ggml-webgpu's gated
delta net, which bound overlapping views of one fused tensor as writable
storage ("Writable storage buffer binding aliasing", the WebGPU device lost):
the inputs are copied first and the fused cache write is off. The GGUFs
must be split (`llama-gguf-split --split-max-size 512M`; the per-layer
embedding table stays one part: 0.9 GB Q4_K_M, 1.3 GB Q6_K, 1.7 GB Q8_0) and
served from a folder named by `?raonbase=` (no host yet: Hugging Face has the
whole files only). Measured on the RTX 3060 (Chrome 158):
- All three load, Q8_0 too (1.6 GB of weights on the card, the rest in
  wasm32 memory).
- WebGPU: correct answers but slow: Q4_K_M ~4 tokens/s writing, ~150 reading
  (a 2,500-token prompt in 17 s); Q8_0 ~2 tokens/s. CPU only (WASM, 14
  threads): Q4_K_M ~30 tokens/s writing but ~28 reading (the same prompt in
  90 s); Q8_0 ~14 writing. Neither is usable for game turns (prompts are
  2,000-3,000 tokens); the evals were not run. The slow part is ggml-webgpu
  on this architecture (the per-token path; the copies added above cost a
  little), work for the fork or upstream.
- Thinking (Q4_K_M, the potion sum): off 3.3 s, on 6.3 s, both right; it
  thinks briefly ("We need answer simple math...").

**A higher-precision LiteRT-LM bundle**: not with public tools. KRAFTON
publish no exporter; litert-torch's `export_hf` has a gated-delta-rule model
(Qwen3.5) but nothing for Raon's delta attention, gated MLA, 4-stream
residual and per-layer embeddings: it would mean writing that model for
litert-torch (and about 40 GB of RAM to convert). Not attempted.

**Native reference only** (not a supported path: the browser is the
product). llama.cpp (KRAFTON's fork) with the Q8_0 GGUF: RTX 2060 (Vulkan,
all layers, about 2 GB of graphics memory, but about 7 GB of RAM with the
game and thrashing a 16 GB laptop) ~40 tokens/s writing, ~410 reading,
33/36 (contended); RTX 2080 Ti (rented, CUDA) ~95 tokens/s, 4,700-7,400
reading, 32/36 without thinking, micro-eval 8/10 without and 9/10 with
thinking (+0.1-0.4 s a turn). `litert-lm` 0.18.1 natively on the CPU:
prefill 14 tokens/s, decode 1.7, 162 s to start.

Mirroring the 1.82 GB bundle on R2 (`assets.md`, Hosting) is pending the
owner's OK.

## Inkling 2 Mini (Thinking Machines, 2026-11-21/22): runs in Chrome, slow

26.4B looped MoE (128 experts, 8 active, ~3.4B active a pass; layers 6-17 run
3 times a token: 48 layer visits, ~12,000 graph nodes a token), Apache-2.0,
released 2026-11-20. Upstream llama.cpp runs it since 690b87d (#32704).
Measured on rented cards (vast.ai, Chrome 158, the linux-desktop image): an
RTX 4090 24 GB and an RTX 4060 Ti 16 GB. Not in the picker; nothing wired in.

**Build**: `tools/wllama-inkling/build.sh`: wllama fa1019a with its llama.cpp
moved to master (built at cbb1c1c50) plus two patches. `wllama-glue.patch`:
`parse_questions` gained an argument. `llama-webgpu.patch` (ggml-webgpu, the
fix found here, upstreamable, not yet sent): the tiled `mul_mat_id.wgsl`
**accumulated in f16** (the dense `mul_mat_reg_tile.wgsl` uses f32), and
**Q2_0 was missing from MUL_MAT_ID's supported types** (MUL_MAT had it).
wllama master streams GPU weights through 1 MB buffers, so a GGUF past 4 GB
loads whole when every layer is on the GPU (no memory64, no splitting).
`inkling-test.html` + `run-chrome.sh`: a 3,425-token innkeeper prompt and
follow-ups; `?nothink=1` (answer without thinking), `?prime=1` (read the
shared prefix first), `?ngl=`, `?rpc=`; console lines `INK {...}`. A fresh
Chrome profile per run (a killed run left the old one without a WebGPU
adapter).

**Why Unsloth's quants wrote garbage on WebGPU** (found by diffing
`llama-eval-callback` sums, Vulkan against WebGPU): Unsloth's UD files keep
the experts unscaled and multiply by a per-expert F32 `.scale` afterwards, so
the expert matmul's partial sums pass f16's 65,504 (layer 0's IQ1_S
gate/up: -1.6e8 summed on Vulkan, `-inf` on WebGPU). Only prompt batches use
the tiled kernel, so even a 12-token prompt poisoned the state and every
token came out as id 0 ("!!!!"). `test-backend-ops` passed every type
(its values are small). Not the cause: CPU splits (AtomicChat's files with
70-98 splits were correct; so was IQ4_NL with loop-layer experts forced to
the CPU), NVFP4/MXFP4/IQ1_S kernels. Related upstream: #32755 (garbage with
loop-layer experts on the CPU, HIP, long prompts; a different bug) and
Unsloth's fork PR unslothai/llama.cpp#389 (loop weight views; memory).

| quant (all mainline GGUF) | file | expert types | WebGPU splits, before/after the patch | correct on WebGPU before/after | native Vulkan read/write tok/s (4090, pp2500/tg50) | native WebGPU read/write |
|---|---|---|---|---|---|---|
| AtomicChat AD-IQ2_XXS-Q2 | 7.9 GB | Q2_0, IQ2_XXS | 98 / 2 | yes (1.8 tok/s) / yes | 510 / 16.4 | 442 / 11.0 |
| AtomicChat AD-IQ2_M | 8.7 GB | Q2_0, IQ2_XXS, IQ4_NL | 70 / 2 | yes (3.4 tok/s) / yes | 458 / 26.3 | 438 / 11.6 (4060 Ti: 141 / 9.6) |
| Unsloth UD-Q2_K_XL (`Mainline_Support`) | 9.1 GB | Q2_0, IQ1_S, NVFP4, MXFP4, IQ2_* | 42 / 2 | **no** / yes | 503-560 / 23-28 | - / 11.2 (12-token prompt) |
| bartowski IQ2_XXS | 10.3 GB | IQ4_NL, IQ2_XS, IQ2_XXS | 2 / 2 | yes / yes | 448 / 28.2 | 428 / 11.7 |
| bartowski IQ2_M | 11.9 GB | IQ4_NL, IQ3_S, IQ2_S | 2 / 2 | yes / yes | - | - / 10.7 (short) |
| ggml-org IQ4_NL | 17.6 GB | IQ4_NL, Q8_0 | 1 | yes | 537 / 26.8 | 481 / 11.1 |

(2 splits = only the token embedding on the CPU, normal.)

**In Chrome** (wllama + the patch, AD-IQ2_M, 8k context, ub 512, thinking
off, the shared prefix primed):

| | 4090 24 GB | 4060 Ti 16 GB |
|---|---|---|
| load (from OPFS after the first download) | 65 s | 64 s |
| graphics memory, peak | 10.5 GB | 10.5 GB (fits 16 GB beside a 1-2 GB game) |
| first prompt, 3,396 tokens | 14.3 s (238 tok/s) | 47 s (72 tok/s) |
| a turn: 24-31 new tokens read, 23-40 written | **4.7-6.5 s** | **7.1-8.7 s** |
| writing | 5.9-6.8 tok/s | 6.3-6.5 tok/s |
| answers | good ("Stew's 5 gold, not 3. Thin harvest or not, I don't sell under 4.") | same |

IQ4_NL (17.6 GB) in Chrome on the 4090: 19.1 GB, 232 tok/s reading, 7-8
writing (24 GB cards only).

**Thinking**: `reasoning_effort` is a template variable (`none` = 0.0); at 0
it still thinks 100-540 tokens (7-22 s a turn natively on the 4090). Opening
the answer message in the prompt (`...<|message_model|><|content_text|>`,
stop at `<|end_message|>`) skips thinking: 6-32 tokens, 0.6-1.4 s natively,
answers as good on 5 game prompts (haggling, a guard, a debt, a goblin attack
answered `attack(goblin)`, a secret; both modes hinted at the secret oak).

**Prefix reuse**: the model is hybrid (convolution state), so the cache
rolls back only to checkpoints; llama.cpp makes them 4 and 4 + n_ubatch
tokens before a prompt's end (and at the last user message in chat mode).
Raw completions re-read ~510 tokens each turn; reading the shared prefix
alone first (`?prime=1`) leaves a checkpoint at its end, then each turn
reads only its own ~25-30 tokens.

**Where the time goes** (a `GGML_WEBGPU_GPU_PROFILE` build, native): the
GPU is busy ~70 ms of each ~90-128 ms token; matmuls are ~30% of it, the
rest hundreds of tiny kernels per token (cpy, concat, scale, tanh, q8
quantize, sum_rows, sqrt, clamp, fill...: softcaps, l2 clips, message
gates, convolutions). The command-submit batch (64 kernels) is not it:
64/256/1024/4096 gave 11.4/12.0/11.0/7.6 tok/s. Writing speed is the same on
a 4090 and a 4060 Ti in Chrome: per-dispatch cost, not bandwidth. The cure
is fusing those chains in ggml-webgpu (or a hand-written engine).

**Other routes measured**:
- CPU, native (EPYC 7B12, Zen 2 at 2.25 GHz; a desktop Zen 4/5 is perhaps
  2x): AD-IQ2_M 8 threads 24 tok/s reading, 5.4 writing; 16 threads 37 /
  5.6; IQ4_NL about the same.
- CPU in Chrome (WASM, wllama splits a model past 4 GB across RPC workers;
  needed `rpc_workers: 7`, the automatic 4 failed allocating the token
  embedding): correct but **2.8 tok/s reading, 0.6 writing** (456 graph
  splits: the looped layers cross workers). memory64 is gone from wllama
  (32-bit only); even a single wasm64 instance would be below native's 5.
- Hybrid, native WebGPU + CPU (16 threads): all experts on the CPU 26 / 3.4;
  layers 12-23's experts on the CPU 70 / 4.8. Worse than either alone.
- ONNX Runtime Web: Quick Inference (mdanyalmalik/quick-inf, PolyForm
  Noncommercial; its ORT Web fork v1.30.0-qi.6 adds QMoE e2m1/e4m3 and the
  softcapped SwiGLU) published `danyalmalik/Inkling-2-Mini-ONNX-WebGPU`
  (2026-11-21: NVFP4/MXFP8 experts bit for bit, other weights 8-bit, 18.9 GB;
  expert streaming for smaller cards). Measured with its own bench page on the
  4090 (headless, `stream=` expert cache; the non-streamed session found no
  adapter in this setup): 10 GB cache **0.4 tok/s writing, 1.5 reading**
  (45 GB read from storage for one run); 19 GB cache 1.2 / 11.5 (845 ms a
  token: the streamed session runs the graph in per-layer segments with the
  router in between). Correct output. Far behind wllama here.
- Nothing for Inkling in WebLLM/MLC, transformers.js, Candle or Burn (searched
  2026-11-22).

**LookAtMyQuant** (github.com/ShinMegamiBoson/lookatmyquant): trellis-coded
builds at 5.38, 8.87, 11.18 and 12.76 GB (self-reported KL 2.3x lower than
UD-Q2_K_XL at 8.87 GB; 63-75 tok/s serial on an M5 Max). Runtime: MLX + Metal
only (`runtime_mlx/inkling`: model.py ~2,000 lines, kernels.py ~1,150,
fast_kernels.py ~5,000; hash-trellis `ht2`/`ht3` and row-trellis `rtr1-4`
decode with a 4-8 KB codebook in threadgroup memory, Hadamard-rotated
activations, unified MoE kernels mixing NVFP4 and trellis experts, and MLX's
`mx.compile` fusing the elementwise chains). A WebGPU port is a Bonsai-2-style
engine (`bonsai2.js`): the trellis matvec maps to WGSL workgroup memory, but
everything the model does between matmuls must be fused by hand too; sized at
several thousand lines of WGSL + JS. No one is porting it (searched).

**Verdict**: correct and playable-adjacent in Chrome, not yet a game brain:
5-9 s a turn on 16-24 GB cards with thinking off and the prefix primed (Bonsai
2 27B: 2-4 s on a 12 GB 4070), a 35-50 s first prompt on a 16 GB card, a 65 s
load. Weak GPUs with lots of RAM: no (the CPU path in the browser writes 0.6
tok/s). What would unblock it: elementwise fusion in ggml-webgpu for this
graph (or a custom engine), and sending `llama-webgpu.patch` upstream.

### Faster in Chrome: ggml-webgpu dispatch caching and fused kernels (2026-11-22)

Inkling's token is ~8,250 GPU dispatches of tiny kernels (11,826 graph nodes).
The cost was per dispatch, on both sides: the wasm side encoding each one
(a new BindGroup, a separate `queue.WriteBuffer` for its parameters, every
token) and the GPU side running thousands of barrier-separated little kernels.
Work in `tools/wllama-inkling/` (`build-fast.sh`, patches split by step, all
on llama.cpp 5bacb7c + PR #32588 + wllama 4.0.0; nothing upstream did any of
this as of 2026-11-22, searched):

- `webgpu-01-dispatch-cache.patch`: per-token counters (`GGML_WEBGPU_STATS=N`:
  dispatches, bind groups made/cached, writes, submits, encode/submit/readback/
  wait ms, the op mix of a big graph), bind groups cached by (pipeline,
  buffers, offsets, sizes) (cleared when a buffer is freed), one parameter
  WriteBuffer per submit batch, no repeated SetPipeline.
- `webgpu-02-inkling-fusions.patch` (`ggml-webgpu-fuse.hpp`): backend-side
  matchers on the stock graph (no new ops, stock GGUFs; ideas from
  nahcmon/inkling-fast-llama.cpp and realugbun's inkling2-speed CUDA
  fusions), each chain one WGSL kernel: row L2 clip, loop controller in
  (cont+rms+rms+concat) and out (two q8_0 rank-64 matvecs + tanh gates), short
  conv with its state store and residuals, SiTU, MoE routing (sigmoid, top-k,
  weights) and the weighted expert sum, the depth mix (rms, scores, softmax,
  weighted sum; specialized per state/query count), the relative-position
  bias + mask; plus a generic one: any run of same-shape element-wise nodes
  becomes one generated kernel (strides baked in, offsets as parameters).
  Tensors are bound per wgpu buffer over their merged range, so aliasing
  never needs overlapping bindings. `GGML_WEBGPU_FUSE=0` /
  `GGML_WEBGPU_FUSE_MASK` turn them off.
- Same patch, not fusion: the IQ2_XXS mat-vec kernels indexed a 512-word
  `const` table at run time, which Tint copies into every invocation (2 KB of
  private memory per thread): the expert gate/up matmul took 15 ms of each
  token. The table now lives in workgroup memory (generated
  `iq2xxs_ws.tmpl`): 3x faster kernel. MUL_MAT_ID uses the mat-vec path for
  batches up to 64 tokens (the tiled kernel ran 8.7 ms a layer for a 41-token
  turn prompt). `GGML_WEBGPU_MMVQ=0` drops the q8 activation pre-pass
  (~500 dispatches; used for the browser build).

Measured on a rented RTX 4080 16 GB (i9-13900K, Chrome 158, AD-IQ2_M, 8k
context, ub 512, thinking off, prefix primed; `inkling-test.html`, `crun.sh`):

| Chrome, per token | dispatches | encode (wasm) | GPU wait | writing tok/s | a turn |
|---|---|---|---|---|---|
| wllama 4.0.0 + master as shipped | 8,251 (8,251 new bind groups, 8,251 writes) | 61.5 ms | 2-6 ms | 12.9-13.8 | 3.9-5.1 s |
| + bind-group cache, batched writes | 8,251 (0 new, 129 writes) | 21.5 ms | ~25 ms | 15.8-16.9 | 3.0-3.5 s |
| + first 8 fusions | 4,045 | 15.6 ms | 32 ms | 17.4-18.9 | 3.3 s |
| + IQ2_XXS table fix, specialized mix | 3,551 | 14.2 ms | 21 ms | 24.2-24.7 | 2.7-3.0 s |
| **all (the shipped build)** | **3,123** | 15.0 ms | 19.6 ms | **22.9-25.2** | **1.7-2.6 s** |

(wllama 4.0.0 alone doubled the old 6-7 tok/s: it wraps the queue waits.)
The 24-31 new prompt tokens of a turn now read at 26-32 tok/s (was 17-22);
the 3,396-token first prompt 26 s, load 20 s, 10.5 GB peak. Native Dawn on the
same card: 20.5 -> 36.2 tok/s. Correctness: same greedy text as unfused
WebGPU and the CPU on the test prompts; llama-perplexity KL divergence against
the CPU (2 x 512 tokens, `kld.sh`): unfused WebGPU 0.0033 / 97.6% same top
token, all fusions 0.0030 / 97.6%.

What a token costs now (Chrome): ~15 ms encoding 3,100 dispatches in wasm
(~5 us each, JS calls into Dawn), ~20 ms more until the GPU is done, ~4 ms
graph build + sampling. Left: the remaining dispatches (mix concats, q8_0
attention matvecs, the controller's down projection) and a recorded replay
of the whole token (the graph is the same every token). Speculative decoding:
wllama 4.0.0 passes `spec_type` / a draft model through, but both models are
hybrids whose recurrent state needs rollback for rejected drafts (open PR
#31669); not tried. Several characters per step (n_seqs batching): not tried.

Shipped (not wired into the picker): `libs/brain/engines/wllama-fast/`
(`wllama.wasm` + its `index.js`, wllama 4.0.0 API), built with
`-DGGML_WEBGPU_MMVQ=0`; runs Inkling and SenseNova.

### Inkling 2 Mini in the game, by URL (2026-11-22)

Ability measured with the endpoint brain, natively: a rented RTX 4070 Ti
Super 16 GB (vast.ai, driver 595.91, Chrome 158 on the box), upstream
llama.cpp 5bacb7c (CUDA, sm_89), `-c 16384 -np 1`, AtomicChat AD-IQ2_M (the
file that runs in Chrome). Thinking skipped as in the trial above, by a small
proxy in front of llama-server (`work/inkfree/nothink-proxy.py`, not shipped:
chat request -> `/apply-template` with `reasoning_effort` 0 -> raw
`/completion` of the prompt plus `<|message_model|><|content_text|>`, stop at
`<|end_message|>`); 10.9 GB on the card, ~62 tok/s writing, 0.6 s for a short
answer.

- Capability check v3: **8/10**, the best of any brain (SenseNova-Loop-9B 7,
  Bonsai 2 27B 6, Bonsai 2 9B and Spark 5), 46 tok/s -> **guided** (temper in
  code); one item short of free (9/10). Missed the false belief (mind) and
  the haggle, where it wrote `sell(sword, 40, Ana)` and then its reasoning
  ("The user wants me to reply with...") in the same answer: the thinking
  skip leaks now and then.
- Hearthvale's day at guided (12 min, the endpoint on the 4070 Ti Super):
  98% model-chosen, 20 self-started (10 pairs), 16 plans / 11 revised, 54
  surprises, depth 0.30, wasted 6%, 4 safety nets, 8 ate / 7 slept, one
  hungry at the end (jory), 10 sales, 54% indoors in the raid, 10.8 calls a
  game hour (259), 2.5 s a turn median (proxy: 1.3 s median, 2.5 s p90 a
  call). Judge 4.0 / 3.88 / **4.63** / 3.0. 4 of 281 answers wrote the
  command and then reasoning ("carry(pumpkin)The user wants me to act...")
  up to max_tokens: the command still parsed, the turn took 6 s.
- The same day at **free**: 44% model-chosen (code fills between turns), 21
  self-started (9 pairs), one gift, 10 notes, 5 surprises, depth 0.17, wasted
  4%, 2 safety nets, 6 ate / 6 slept, two hungry at the end (hector and wren,
  out after the night wolf), 13 sales, 99% indoors in the raid, 186 calls
  (7.7 a game hour), 2.4 s a turn median (2.1-2.7 p10-p90), and the most work
  done of any free day (job cycles: rosa 5, tam 4, maren 3, brann 3). Judge
  3.88 / 3.5 / 4.38 / 2.63: below its own guided day and below Bonsai 2 27B
  at free on the 4090 (4.0 / 4.25 / 4.75 / 3.13).
- 36 evals (RUNS=2): **35/36** (haggle to 45 1/2). E2B 32-35, Raon-1 nano
  36, Spark-X2.6-4B 31.
- (The capability check is cached in the profile per brain name and card:
  repeats under the same name return the stored result. 8/10 came out the
  same in three separate runs.)

Beside the baselines (hearthvale's day, 12 minutes; Inkling's turns at native
CUDA speed, not Chrome's 5-9 s):

| | check v3 | evals | guided judge (c / p / u / s) | free judge | free: ate / hungry, calls |
|---|---|---|---|---|---|
| Inkling 2 Mini AD-IQ2_M, endpoint | **8/10** | 35/36 | 4.0 / 3.88 / **4.63** / 3.0 | 3.88 / 3.5 / 4.38 / 2.63 | 6 / 2, 186 |
| Bonsai 2 27B, Chrome 4090 | 5/8 (v2); 6/10 (4070) | - | 4.0 / 4.25 / 4.5 / 3.25 | 4.0 / 4.25 / 4.75 / 3.13 | 8 / 1, 118 |
| Bonsai 2 27B, Chrome 4080 S | - | - | 4.0 / 3.88 / 4.38 / 3.38 | 3.88 / 3.75 / 4.5 / 2.75; 3.5 / 3.75 / 4.38 / 2.75 | 6 / 3, 77; 6 / 2, 95 |
| Gemma 4 E4B, Chrome 3090 | 6/8 (v2) | - | 4.0 / 4.0 / 4.38 / 2.88 | - | - |
| SenseNova-Loop-9B, endpoint | 7/10 | - | 3.5 / 3.88 / 4.13 / 2.88 | - | - |

**Smaller quants** (same box and proxy; check v3 repeated under fresh names,
evals RUNS=2; KLD from the publishers' cards; card memory = llama-server
alone at 16k context):

| file | size | KLD | on the card | check v3 | evals | guided day |
|---|---|---|---|---|---|---|
| AtomicChat AD-IQ2_M | 8.67 GB | 0.130 | 10.9 GB | 8/10 (3 runs) | 35/36 | judge 4.0 / 3.88 / 4.63 / 3.0 |
| Unsloth UD-IQ2_XXS (`Mainline_Support/`) | 8.49 GB | 0.073 | 10.7 GB | 7/10 (2 runs; missed plan, mind, danger) | 35/36 | - |
| drofn 8GB-64K | 6.62 GB | 0.130 | 8.9 GB | 6/10 (2 runs; missed plan, mind, danger, haggle) | 33/36 (haggle 0/2, horseshoe 1/2) | 98% model-chosen, 20 self-started (13 pairs), 15 plans / 8 revised, 55 surprises, depth 0.42, wasted 4%, 8 ate / 7 slept / 1 hungry, 17 sales, 78% indoors, 282 calls, 2.5 s a turn; judge 3.88 / 3.75 / 4.25 / 2.75 |

Unsloth's top-level `UD-*` files are the draft PR's layout and fail to load
on master (`blk.24.attn_q.weight not found`); the `Mainline_Support/`
copies (`.gguf_file`) load. drofn's 64K file (2 GB smaller, would fit a 12 GB
card beside the game) costs two check items, 2 evals and about 0.3 on the
judge's scale: a guided-class brain still, but no longer the best one.

**Verdict**: Inkling 2 Mini is the most capable brain measured for this
game: guided without doubt (8/10, one item from free; 35/36; the best
purposefulness score at guided), and at free it keeps a working village with
the most job cycles of any free day, though the judge reads it flatter than
its guided day (personality 3.5, depth 0.17) and below Bonsai 2 27B's free
day on a 4090. So: capable of guided, borderline for free (as the 27B is);
its free days are not better than its guided ones. Worth the engine work only
if it gets fast in Chrome: today's 6-7 tokens a second (5-9 s a turn) would
put it in the 27B-on-16-GB band, where free already loses to guided.
Proposed, not made: (1) if Inkling is wired in, add `The user` (and
`<|message_`) to its stop strings: 1-2% of no-think answers continue into
reasoning after the command, costing a full max_tokens turn; (2) the
AD-IQ2_M or Unsloth UD-IQ2_XXS (mainline) files, not drofn's, unless 12 GB
cards matter more than two check items.

### Inkling 2 Mini in the game, in Chrome (2026-11-23)

Wired as brains on the wllama-fast build (`libs/brain/engines/wllama.js`:
`inkling2-mini-wllama`, `inkling2-mini-small-wllama`, `sensenova-loop-9b-wllama`;
GGUFs from Hugging Face at pinned revisions; picker entries in
`app/llm_js/agent-brain.js` with `fitGB`: listed only where the card has
that much, never auto-picked (no `needGB`); Inkling counts as an ambitious
brain in `mind.js`). Prompt: Inkling's own message tokens with the answer
message opened (no thinking) and the "Thinking effort level: 0" line; stops
`<|end_message|>`, `<|content_model_end_sampling|>`, `<|message_`,
`The user`, handled by llama.cpp (not by cancelling the stream). No mirror
on R2 yet; one would hold `Inkling-2-Mini-AD-IQ2_M.gguf` (8.67 GB),
`Inkling-2-Mini-8GB-64K.gguf` (6.62 GB) and `SenseNova-Loop-9B-AD-Q4_K_M.gguf`
(5.96 GB) plus the 11 MB `wllama-fast/wllama.wasm`.

Problems found and fixed on the way: (1) the wasm aborted 2-3 minutes into
a village day while restoring a context checkpoint (`~llama_io_read_host` ->
`ggml_backend_tensor_set_n`; with llama.cpp's 32 checkpoints a slot and with
3; the cancel path also crashed: "Failed to cancel request ... unaligned
accesses"). Checkpoints are now off (`n_ctx_checkpoints: 0`, passed through
the wllama JS, which dropped it) and stops are server-side: stable for whole
days since. Without checkpoints each of wllama's 4 slots still extends its
own cached prompt. (2) Priming the shared prefix first only pays with
checkpoints: 5.8 s against 5.2 s a turn without them, so it is off. (3) The
MoE mat-vec path for batches up to 512 tokens is slower than the tiled
kernel above 64 (127 against 194 tok/s reading): kept at 64.

Measured on a rented RTX 4080 Super 16 GB (Ryzen 9 5900X, Chrome 158,
hearthvale; `tools/browser-test/brainload.mjs` for load, memory and turns,
`probe.mjs`, `live-eval.mjs --day --day-minutes=12`, `judge.mjs`):

| | Inkling AD-IQ2_M, Chrome | Inkling AD-IQ2_M, endpoint (native) | Bonsai 2 27B, Chrome 4080 S |
|---|---|---|---|
| capability check v3 | **8/10**, 21 tok/s, guided (danger, temper in code) | 8/10 | 6/10 (4070) |
| load, first time / cached | 265 s (download from HF) / 33-40 s | - | - |
| peak graphics memory, game at medium | 12.8 GB of 16 | 10.9 GB (server alone) | - |
| a call in the world (median, p90) | 4.7-5.2 s, 10-13 s; reads 420-750 new tokens at ~190 tok/s, writes ~38 at 27-30 tok/s | 1.3 s (2.5 s p90) | ~7 s |
| guided day: judge (c / p / u / s) | 3.75 / 3.88 / **4.75** / 3.0 | 4.0 / 3.88 / 4.63 / 3.0 | 4.0 / 3.88 / 4.38 / 3.38 |
| guided day: calls, model-chosen, hungry at end | 102 (4.2 a game hour), 92%, 3 | 259 (10.8), 98%, 1 | - |
| free day: judge | 3.63 / 3.38 / 4.0 / 2.5 | 3.88 / 3.5 / 4.38 / 2.63 | 3.88 / 3.75 / 4.5 / 2.75 |
| free day: calls, model-chosen, plans, hungry | 56 (2.3), 50%, 0, 3 | 186 (7.7), 44%, -, 2 | 77, -, -, 3 |

Guided day in Chrome: 14 self-started (6 pairs), 12 plans / 6 revised, 30
surprises, depth 0.07, wasted 7%, 11 safety nets, 4 sales, jobs mostly not
cycled (hector 9, wren 1, tam 1), 83% indoors in the raid. Free day: 12
self-started (3 pairs), 8 notes, no plans, no surprises, depth 0.2, 3 sales.

**drofn's 8GB-64K file** (`inkling2-mini-small-wllama`), same card: check
**7/10** (17 tok/s, guided; missed mind, danger, haggle; 6/10 natively);
first load 285 s, peak 10.9 GB with the game at medium (fits a 12 GB card
with ~1.3 GB to spare; no 12 GB card was rented to confirm); 5.4 s a call
(21 tok/s writing). Guided day: 105 calls, 92% model-chosen, 15
self-started (6 pairs), 14 plans / 4 revised, 24 surprises, depth 0.6,
wasted 1%, 8 safety nets, 1 hungry at the end (maren), 6 sales, 72% indoors
in the raid; judge 3.88 / 3.63 / 4.38 / 2.88 (natively 3.88 / 3.75 / 4.25 /
2.75). A guided day as good as AD-IQ2_M's in Chrome (fewer hungry, more
plans; lower purposefulness), 2 GB smaller.

**Why a call in the world takes ~5 s when the bench turn took 1.7-2.6 s**:
the bench re-read only its 25-30 new tokens after a primed, unchanging
prefix. A village call reads 420-750 new tokens (each turn's state card,
perception and the moving history window, ~2,000-token prompts in all; 8
characters share 4 cache slots) at ~190 tok/s in Chrome, about 2.2-3.5 s,
before writing ~38 tokens (1.3 s); calls queue behind each other, so the
game measured 13-16 s from asking to answer. What would bring it down:
faster reading in Chrome (native Dawn reads 440+ tok/s on the same graph:
Chrome has no subgroup-matrix kernels, and the tiled MoE kernel is the
largest cost there), 8 slots for 8 characters, a smaller per-turn tail, and
working checkpoints (the restore crash above) so a moved history window
does not cost a full re-read.

**Verdict**: wired and stable, as smart in Chrome as natively on the check
(8/10) and as good a guided day by the judge, but at ~5 s a call the
village gets 40% of the model calls it got from the native server, so the
guided day leaves 3 hungry and the free day does little (half the
activities picked by code, no plans). Guided is playable on 16 GB; free is
not, until reading gets faster.

## SenseNova-Loop-9B (SenseTime, 2026-11-22): best check score yet, too slow in Chrome as shipped

SenseTime's `sensenova/SenseNova-Loop-9B` (released 2026-11-17; the Preview
2026-10-31), Apache-2.0, English and Chinese, text + images in. A Qwen3.5-style
hybrid (3 Gated DeltaNet layers per gated full-attention layer, hidden 4096,
FFN 12288, 16 query / 4 KV heads of 256, vocabulary 248,320, dense, no MoE),
32 stored layers of which 4-27 run twice (56 layer visits, "14.6B
inference-equivalent"), plus **two-stream mHC** over the looped block: before
each attention and each FFN a tiny F32 router (8,192 -> 8) mixes the two
residual streams through a 2x2 matrix normalised by **20 Sinkhorn
iterations**. 512K context. Thinks by default (Qwen template, `<think>`);
`enable_thinking: false` puts an empty think block and it answers directly.
MTP draft head shipped. The base repo is gated (auto-approve); the GGUF and
AWQ repos are open.

Quants: official GGUF BF16 / Q8_0 9.8 GB / Q5_K_M 6.7 / Q4_K_M 5.8 (+ mmproj
0.9) and AWQ 4-bit 4.9 GB; AtomicChat AD-Q6_K 8.8 / AD-Q5_K_M 6.9 /
**AD-Q4_K_M 6.0** (mean KLD 0.045 against BF16, half the official Q4_K_M's
0.10) / AD-IQ4_XS 5.8 / AD-IQ3_S 4.9; drofn's full ladder (Q8_0 KLD 0.005 ...
Q4_K_M 0.062, IQ3_XXS 0.34, IQ2_M 0.56; Q2_0 / Q1_0 / IQ1_* broken or near it):
**nothing usable at 2 bits or below**, no QAT/ternary GGUF (cyankiwi's
"QAT-HAWQ" is 9 GB safetensors). EXL3, MLX, NInfer, a "QSA" GGUF. Nothing for
WebLLM/MLC, transformers.js/ONNX or LiteRT (searched 2026-11-22).

Engines: llama.cpp needs SenseNova's fork (`OpenSenseNova/llama.cpp` 24ea7bb,
on no branch: fetch the sha) or the open upstream PR ggml-org/llama.cpp#32588
(`blueswhen/llama.cpp` branch `sensenova-loop`); `loop_backend` there has
Metal/Vulkan fused kernels. SGLang PR #47281, vLLM PR #64832, LightLLM. The
fork adds **no ggml ops**: every op exists in ggml-webgpu, so wllama builds as
is. Two costs in it:
- The router matmul asks for F32 input precision, which CUDA (Ampere and up),
  Vulkan and WebGPU refuse, so 96 matmuls a token ran on the CPU (194 graph
  splits): fork on CUDA 1-2 tok/s (10 with `-t 8`), Chrome 0.1.
  `tools/sensenova/llama-webgpu.patch` lets ggml-webgpu take F32 x F32 at F32
  precision: 2 splits.
- The Sinkhorn is unrolled as ~480 elementwise nodes per route: **52,729 graph
  nodes a token** (Inkling 2 Mini: ~12,000). The PR rewrites it as an exact
  closed form (binary powering of the 2x2 map; 14,145 nodes, CUDA 46 tok/s
  Q4 / 35 Q8_0 writing, 4,400-4,600 reading on a 4090).
  `tools/sensenova/sinkhorn-trial.patch` (trial only, env switches) adds that
  exact form to the fork's graph (`SN_SINKHORN_POW=1`: 12,985 nodes, the same
  greedy text as the 20 iterations; the formula checked to 3e-16 in Python)
  and the iteration's limit, `sigmoid((m00+m11-m01-m10)/2)`
  (`SN_SINKHORN_CLOSED=1`: 6,937 nodes; **mean KLD 0.062** against the 20
  iterations, 87% same top token: as lossy as Q4_K_M, so not shippable, but it
  is the speed a fused one-dispatch Sinkhorn kernel would give).

Measured on a rented RTX 4090 (vast.ai, driver 595.99, Chrome 158), AD-Q4_K_M,
the innkeeper prompt (`tools/sensenova/turns.py`, `sensenova-test.html`: 3,327
tokens of shared prefix primed, then 30-35 new tokens a turn, thinking off):

| | read tok/s | write tok/s | a turn (16-45 tokens written) | graph nodes |
|---|---|---|---|---|
| native WebGPU (Dawn), 20 iterations | 409-890 | 2.0-2.1 | 11-22 s | 52,729 |
| native WebGPU, exact powered form | - | 5.2 (contended) | - | 12,985 |
| native WebGPU, limit form (lossy) | 889-1,107 | 18-20 | 2.0-3.0 s | 6,937 |
| **Chrome (wllama), 20 iterations** | 183 (prefix 18.6 s) | **1.0-1.2** | **20-34 s** | 52,729 |
| Chrome, limit form (lossy) | 196-210 (prefix 16 s) | 8.6-9.5 | 2.5-6.2 s | 6,937 |
| CUDA, PR #32588 build (reference) | 4,400-4,600 | 35 (Q8_0) - 46 (Q4) | - | 14,145 |

Chrome: load 41-82 s from a local server, peak graphics memory 6.7 GB for the
whole card (model 5.0 GB, KV 112 MB and recurrent state 88 MB at 8k, compute
535 MB); answers correct and in character ("Five gold, and no less. The
harvest's thin, but my stew's worth it."); prefix reuse works after priming
(reused 3,327 each turn). The exact powered form was built into wllama but the
box was lost before the Chrome run.

**Ability (the endpoint as the measuring device)**: the PR build's llama-server,
Q8_0, thinking off by `--chat-template-kwargs`, run by URL
(`probe.mjs --model=endpoint --llm=http://127.0.0.1:8081/v1`): capability
check v3 **7/10** at 27 tok/s -> guided (talk in code); missed the sums, the
character (talked about being an AI) and the plan format. Bonsai 2 9B: 5/10,
27B: 6/10. Hearthvale's day at guided (12 min, endpoint on the 4090): 97%
model-chosen activities, 25 self-started interactions (13 pairs), 15 plans /
15 revised, 58 surprises, depth 0.65, wasted 2%, all 8 ate, nobody hungry at
the end, 6 things made, 2 sales, 58% indoors in the raid, 8.8 model calls a
game hour, 3.3 s a turn median. Judge 3.5 / 3.88 / 4.13 / 2.88 (Bonsai 2 9B
guided 3.5 / 3.88 / 4.13 / 3.0; 27B 4.0 / 4.25 / 4.5 / 3.25): wren once called
himself the baker. The free day did not finish (the rented box vanished at
minute ~2).

**Verdict**: the strongest check score of any brain measured, judged like
Bonsai 2 9B at guided, but in Chrome as shipped it writes ~1 tok/s (20-34 s a
turn): no for every card size today. Memory is not the problem (AD-Q4_K_M:
6.7 GB with Chrome, ~8.5 GB with the game: fits 12 GB; Q8_0 ~11 GB, ~13 with
the game: 16 GB). What would unblock it: a fused 2x2 Sinkhorn kernel in
ggml-webgpu (or the exact powered form plus fusing its ~80 elementwise nodes),
which the limit-form run puts at ~9 tok/s and 2.5-6 s a turn on a 4090 (in
Inkling's range; Bonsai 2 9B's engine does 76-145 tok/s), plus
`llama-webgpu.patch` upstream. Not wired into the picker.

Build: `tools/sensenova/build-native.sh` (CUDA + Dawn WebGPU from the fork;
the linux-desktop image needs `libcublas-dev-12-9`, and `cuda-nvml-dev-12-9`
for the PR branch), `build-wllama.sh` (wllama fa1019a against the fork, the
Inkling glue patch not needed), `brun.sh` (one Chrome run on the box).

### Faster in Chrome (2026-11-22)

On llama.cpp master + PR #32588 (its exact powered Sinkhorn: 14,145 nodes) with
`tools/sensenova/llama-webgpu.patch` (routers on the GPU: one graph split) and
the Inkling work above (`tools/wllama-inkling/build-fast.sh`, the same
binary): the generic element-wise run fusion turns the Sinkhorn's ~80 tiny
nodes per route into one kernel each; 10,939 -> 2,821 dispatches a token.
Native Dawn (RTX 4080) 24.2 -> 35.8 tok/s with the same greedy text. **Chrome
158, AD-Q4_K_M, 8k context, thinking off, prefix primed: 21-26 tok/s
writing, turns 2.0-2.5 s** (was 1.0-1.2 tok/s and 20-34 s with the fork's 20
iterations), 6.4 GB peak, first prompt (3,327 tokens) 34 s, load 16 s; answers
in character ("Three gold? My stew costs five, and no less than four."). KL
divergence against the CPU (2 x 512 tokens): unfused WebGPU 0.084 / 95.7%
same top token, fused 0.081 / 95.5% (the gap to the CPU predates the fusions;
not chased).

**In the game, in Chrome** (2026-11-23, RTX 4080 Super, `sensenova-loop-9b-wllama`, AtomicChat AD-Q4_K_M,
which loads on the merged PR #32588 graph): capability check v3 **10/10** at 24 tok/s -> free (natively 7/10
by URL: a different run, sampling); cached load 30 s, peak 8.9 GB with the game at medium; 5.0 s a call
median (15 s p90), reading ~540 new tokens at ~127 tok/s (slower than Inkling's ~190: dense 9B), writing
25 tok/s. Free day in hearthvale: 50 calls, 21% of activities chosen by the model, 20 self-started, no
plans, depth 0.67, 4 hungry at the end; judge 3.75 / 3.63 / 3.5 / 2.75. Its check says free, its day says
the calls are too slow and too few for free (as for Inkling).
## Spark-X2.6-4B (SparkLLM / XHToken, 2026-11-22): the benchmarks don't carry over to the game

4.11B dense (36 layers, hidden 2560, 16 query / 4 KV heads of 256, three
sliding-window-512 layers per full-attention layer, partial RoPE on the full
layers, a sigmoid gate per head on the attention output, GELU gated MLP, a
131,072-word tied vocabulary; `spark2_5`, remote code), English and Chinese,
Apache-2.0, released 2026-10-19. A reasoning model: `enable_thinking` false
(or `reasoning_effort` low/high) through the chat template. Upstream llama.cpp
runs it since b10828 (no custom ops), and there are many quants (bartowski
Q4_K_M 2.62 GB).

**The publisher**: "SparkLLM", the Hugging Face and GitHub org XHToken. The
GitHub org dates from 2026-08-09 (Singapore, xhtoken.ai), and its only other
models are Spark-X2.5 (August 2026). Third-party sites link it to iFlytek, but
nothing primary confirms that.

**The claims** (all from its own card, in SVG charts, all in thinking mode at
`high`): an average of 63.3 against Qwen3.5-9B's 49.1 and Gemma 4 E4B's 29.7.
Some of the numbers are implausible for a 4B model: SWE-bench Verified 62.8, SWE Pro 54.3,
BrowseComp 53.1 (Qwen3.5-9B 8.3), HLE with tools 36.9. Two of the benchmarks
are in-house (SWebBench, PAgentBench), and the starred Qwen3.5 numbers come
from another small-model vendor's card (Nanbeige4.2-3B). Its thinking runs
36k tokens on average at `high` and 28k at `low` (its own chart). When asked on HF,
the vendor gave the SWE-bench setup: Claude Code as the harness, 250 turns,
256k-1M context, git history removed. τ³ turned out to be the Banking
subset only. Independent checks: not on Artificial Analysis (the vendor has
been asking them since September); Tiny League and BenchLM only copy the
card. MakoBench (an unseen-task suite) ranks it 44th of 47 (total 4.9,
chat 2.3). Users on HF report long, looping thoughts that often never finish
("loves to yap"; a coding task took 8-9 min where a 27B took 3). One user's
MMLU-Pro run on X2.5 (direct 40.7 vs Qwen3.5-4B 56.4) shows weak knowledge,
with a strong MATH score that depends on a long budget (68% at 4k tokens, 83% at 8k).
Reading: probably no contamination, but heavy RL on agentic and maths tasks
with very long thinking; the headline numbers are not what a short,
non-thinking turn gets.

**Formats for the browser** (both exist; neither tried here): litert-community's
`Spark-X2.6-4B_int4.litertlm` (2.48 GB, LiteRT-LM 0.19.0, 4,096-token KV,
fp32 GPU activations, int4 GSM8K 89 vs bf16 90, 91 tok/s on an M4 Max with
native LiteRT-LM's WebGPU backend). Thinking is turned off with the preface's `extra_context`
`{enable_thinking: false}` (the web API's `Preface.extra_context`; our worker
does not pass it yet). The other is mohdmahmodi's ONNX q4f16 for transformers.js
(2.77 GB, 92 tok/s on a 3090 Ti in Chrome, by its author).
Estimate (not measured): with Raon's 1.82 GB bundle at 4.1 GB on the card,
this one is likely 4-5 GB, plus the game's 1-2 GB: no on 6 GB, tight on 8 GB,
fine on 12 GB.

**Measured** (vast.ai RTX 4070 12 GB; upstream llama.cpp e300919, CUDA,
bartowski Q4_K_M, thinking off with the server's
`--chat-template-kwargs '{"enable_thinking":false}'`; the game and its
Chrome on the same box against `--model=endpoint --llm=http://localhost:8080/v1`):
- Native speed: pp2500 6,627 tok/s, tg50 143. 3.7 GB on the card with 16k
  context, 2 slots. The innkeeper prompt (3,384 tokens) took 0.97 s; each
  follow-up re-read only ~20 tokens (prefix reuse works, SWA or not) and took
  0.2-0.3 s. Thinking at `low`: 240-420 tokens a turn, 2.5-4.3 s natively.
- Sanity: with thinking off it sold stew at 3 gold against "never under 4";
  at `low` it held 5. Its replies are short and well formed.
- Capability check v3: **5/10** (missed steps, sums, mind, haggle,
  shelter), 123 tok/s -> assisted (danger and temper in code). Bonsai 2 9B
  scores the same; Bonsai 2 27B 6/10.
- 36 evals (RUNS=2): **31/36**. Sword at full price 0/2 in shop-role-chaos,
  where it wrote prose outside `say()` ("I've got the magic sword...
  sell(magic sword, 50)": it never parsed). Haggle to 45 0/2 in shop-chaos
  (it agreed in words but never called `sell`). One lowball sale ("Fine, 5
  gold."). Compare E2B 32-35, Raon-1 nano 36.
- hearthvale's day at guided (12 min): 99% of activities model-chosen, 37
  self-started lines across 11 pairs, 15 plans / 40 revisions, 117 surprises,
  10% wasted (42 failed activities, 7 loops), 376 model calls (15.6 a game
  hour). But the village barely worked: 5 job cycles in all, 2 hungry at the
  end, 61% indoors in the raid, 15 sales between characters. Judge
  (deepseek-v4.1-flash): coherence 3.63, personality 3.5, purpose 3.75,
  surprise 2.63. E4B at guided got 4.0 / 4.0 / 4.38 / 2.88; Raon-1 nano 3.5 /
  2.88 / 3.63 / 2.38; Bonsai 2 9B 3.13-3.88.

**Verdict**: not E4B-class in this game: below E2B on the evals, and a
guided day like Raon's or Bonsai 2 9B's at 2.5 GB of weights. The browser step was not
run (the brief's stop: only if E4B-class). For 6 GB cards: no (doesn't fit
beside the game). 8 GB: it would probably fit, but E4B is better.
12 GB and up: Bonsai 2 9B on Auto scored higher on the same card
(judge 3.88 / 4.13 / 4.5, a working village). What it is good
at (long agentic thinking) costs thousands of tokens a turn, which in-browser
speeds cannot pay for. If it comes up again, the cheap route is the
litert-community int4 bundle in the existing worker: one `MODEL_CONFIG` entry
(`maxTokens: 4096`, `charBudget: 10500`) plus passing `extra_context`. Nothing is wired in.

## Autonomy: rails, guided, free (2026-11-21)

`app/agency.js` (minds.md, "autonomy"). Measured on vast.ai, one RTX 3090
24 GB (driver 595, Chrome 158, real WebGPU: NVIDIA Ampere), hearthvale's
whole day (`live-eval --day --day-minutes=12 --autonomy=<level>`) and the
goblin bakery (6 min), the player idle, no voices. Runs are not seeded (the
game has no RNG seed): one run each, read them as direction.

**Bonsai 2 27B stalled on this card at every level** (rails too: 14 model
calls in the whole day, five characters hungry at the end; a call never
returned; loading once stuck at "preparing"). Not seen on the 4070, 3060 and
4060 Ti before; untried why (driver 595 or Chrome 158). The comparison ran
on **Gemma 4 12B** (LiteRT-LM).

Three things the first runs found, fixed (they matter beyond autonomy):
model calls that overlapped (an agency turn, a pick, a reflection, a reply)
left one that never returned: world-integration.js now queues every call
(`manager.decide` serialised, given up after 2 minutes, own seconds in
`tablefolkDecideSecs`); live.js waited for every reply turn, so a 12B's
10-30 s answers froze the whole village: above rails a turn runs on its own;
free turns re-read a doubled history and thought on every turn near a
monster: the usual history and no auto-thinking above rails.

hearthvale, Gemma 4 12B, one game day (guided and free after those fixes;
free still stalled at 12:00, see below):

| | rails | guided | free |
|---|---|---|---|
| activities chosen by the model | 5% (13 of 253) | 98% (47 of 48) | 64% |
| self-started lines to someone (pairs) | 0 (0) | 17 (5) | 1 (1) |
| code-prompted lines (evening topics, remarks, causes) / templated | 11 / 32 | 2 / 4 | 0 / 2 |
| day plans / revised with a reason / steps done | - | 8 / 3 / 23 | notes 9 |
| surprises (off-routine, a reason, done) | 0 | 14 | 1 |
| replies picking up what was said or a remembered fact | 21% | 33% | 0 of 4 |
| wasted (failed, nonsense, loops, empty) | 12% | 3% | 0 |
| model calls / game hour; model seconds / game hour (with queueing) | 1.7; 5.5 | 2.4; 62 | 0.6; 39 |
| meals (people who ate) | 8 of 8 but tam | 4 of 8 | 0 |
| slept at night (of 7; the guard watches) | 7 | 0 (the world stopped at 21:00) | 1 |
| stores in chests: start / end | 18 / 85 | 18 / 16 | 18 / 20 |
| sales between characters | 17 | 2 | 0 |
| raid (crows by day, wolves at night) | 4 came, 2 down; 73% indoors | 4, 1 down; 99% indoors; nobody hurt | 4, 1 down; 90% |

The judge (`judge.mjs`, deepseek-v4.1-flash, 1-5, mean of the characters):

| | coherence | personality | purposefulness | surprise |
|---|---|---|---|---|
| hearthvale rails | 4.25 | 4.00 | 4.13 | 2.88 |
| hearthvale guided | 4.13 | 4.38 | 4.63 | 3.38 |
| hearthvale free (stalled) | 4.17 | 3.67 | 4.33 | 2.83 |
| bakery rails | 3.67 | 4.33 | 4.00 | 3.67 |
| bakery guided | 4.00 | 5.00 | 4.67 | 4.00 |
| bakery free | 4.00 | 4.50 | 5.00 | 3.50 |

What it means: guided on a 12B gives characters their own errands and
words (odo lectures maren about the wheat, jory re-plans around food and
firewood, tam hunts for honey cake, hector chooses to fight the crows), and
the judge sees it; but the village stops working, because each pick and
turn costs 2-30 s on this card and the day is 12 real minutes: work cycles
fell from ~10 to ~1 a character, sales 17 to 2, and from 21:00 a model call
that never came back (before the two-minute give-up) stopped the world.
Free is not usable on a 12B here: 26-70 s a turn, 8-21 turns in a day for
eight characters. Pleasant guided wants a model answering a pick in under
~1 s and a turn in under ~5 s (Bonsai 2 9B's 107 tokens/s class, or a
faster card), or a longer day (`dayMinutes`); free wants that with fewer
characters. Settings' Auto chooses guided for both 12B and 27B (below).

**Gemma 4 E4B at guided** (the same day, after the fixes) is the run where
guided works: 98% of 100 activities model-chosen, 16 self-started
interactions across 8 pairs (one gift), 14 day plans and 7 revisions with
their reasons, 27 surprises, 4% wasted; 6 of 8 ate, 5 of 7 slept at night,
two ended hungry (brann, wren), 3 sales between characters (rails on the
12B: 17), raid 83% indoors; 123 model calls (5.1 a game hour). Judge:
coherence 4.0, personality 4.0, purposefulness 4.38, surprise 2.88. A
smaller, faster brain makes more decisions in the same day than the 12B.

The capability check (`probe.mjs`), RTX 3090: v1's eight items were passed
alike (E2B 6/8 at 60 tokens/s, E4B 7/8 at 37, Bonsai 2 9B 6/8 at 81, Bonsai
2 27B 6/8 at 28): it could not tell the brains apart, so v2 has harder
items (a locked chest, sums, a fact moved twice, a false belief, a bundle
under the floor price). v2 (thresholds: free 7+ and 15+ tokens/s, guided
5+ and 6+ tokens/s): Gemma 4 E2B 4/8 -> rails; Gemma 4 E4B 6/8, 34
tokens/s -> guided; Bonsai 2 9B 5/8, 80 tokens/s -> guided; Gemma 4 12B
6/8, 29 tokens/s -> guided (all missed the bundle under the floor price,
most the fact moved twice). Each check takes 7-12 s once the brain is loaded
(E2B 124 s: it ran beside the evals). Bonsai 2 27B was not re-run on v2 (v1:
6/8, 28 tokens/s). So Auto puts no in-browser brain on free today; free is
for a character or world that asks for it, or a faster brain.

E2B on rails after all of this (`run-evals.sh`, RUNS=2, the RTX 3090):
33/36 (shop-chaos potion 1/2, haggle to 45 0/2), the same band as before
(33-36).

### Bonsai 2 27B's stall, and guided on 40-series cards (2026-11-21, later)

**The 27B stall did not reproduce elsewhere.** The same tests on an RTX
4090 (driver 595.91, Chrome 158), an RTX 4080 16 GB (580.173) and a second
RTX 3090 (575.64): the 27B loads (31-202 s), answers every prompt length up
to the 8192 window (a longer one fails cleanly with ContextOverflowError,
`tools/browser-test/llm-sweep.mjs`), and takes overlapping calls without
trouble even with the game's queue off (`?llmqueue=0`: bonsai2.js queues its
own). On the second 3090, the rails day that had stalled ran a working
village (everyone ate and slept, 36 calls), at 2-27 s a call. So the
stall belonged to the first 3090 host (driver 595.71.05): calls of 59-70 s,
then one that never returned, and once a load stuck at "preparing" with the
GPU idle in a fresh Chrome. The 3090s are also slow for the 27B: prompts read
2.3x slower than on the 4090 (a ~7k-token prompt 34 s vs 15 s; 28 tokens/s
written vs 53). The game now gives up a call after 2 minutes and never
waits on one turn above rails, so a host like that slows the world instead
of stopping it (not re-tested on that host).

Guided on hearthvale's day (12 real minutes), each run once; the 12B row is
from the RTX 3090 above, the others after all the fixes:

| | E4B, 3090 | Raon-1 nano, 4090 | Bonsai 2 9B, 4090 | Bonsai 2 9B, 4080 16 GB | Bonsai 2 27B, 4090 | Bonsai 2 27B, 4080 16 GB |
|---|---|---|---|---|---|---|
| model-chosen activities | 98% | 97% | 94% | 87% | 98% | 86% |
| self-started interactions (pairs) | 16 (8) | 13 (8) | 33 (12) | 23 (9) | 16 (8) | 12 (8) |
| plans / revised | 14 / 7 | 16 / 19 | 16 / 17 | 9 / 11 | 14 / 5 | 8 / 11 |
| surprises | 27 | 23 | 106 | 68 | 31 | 18 |
| reply depth | 18% | 31% | 52% | 62% | 41% | 43% |
| wasted | 4% | 14% (49 failed activities, 10 loops) | 6% | 8% | 6% | 2% |
| safety nets | 2 | 4 | 15 | 28 | 2 | 13 |
| ate / slept at night / hungry at the end | 6 / 5 / 2 | 8 / 7 / 0 | 8 / 7 / 0 | 7 / 7 / 1 | 8 / 6 / 0 | 8 / 7 / 0 |
| sales between characters | 3 | 14 | 3 | 15 | 4 | 2 |
| others indoors during the raid | 83% | 92% | 34% | (no raid came) | 92% | 88% |
| model calls a game hour | 5.1 | 8.3 | 13.1 | 9.3 | 5.7 | 4.1 |
| judge: coherence / personality / purpose / surprise | 4.0 / 4.0 / 4.38 / 2.88 | 3.5 / 2.88 / 3.63 / 2.38 | 3.13 / 3.25 / 3.38 / 2.5 (the 4080 run's transcript) | | 4.0 / 4.25 / 4.5 / 3.25 | 4.0 / 3.88 / 4.25 / 3.0 |

Also: Raon-1 nano on rails (4090), the baseline: everyone ate and slept, 44
calls, 0 self-started interactions, judge 4.13 / 3.5 / 4.38 / 2.63. Bonsai 2
27B at **free** (4090): everyone ate and slept, 25 self-started lines (8
pairs), 12 notes rewritten with plan(), 10 sales, 63% model-chosen (code
fills between its turns), 8% wasted, 117 calls; judge 4.0 / 4.25 / **4.75**
/ 3.13. Peak graphics memory with the 27B and the game: 11.1 GB (4090), 11.0
GB of 16 (4080).

The capability check v2 on the 4090: Bonsai 2 27B 5/8 at 53 tokens/s
(missed the sums, the danger choice, the bundle under its floor) -> guided;
Raon-1 nano 4/8 at 58 -> rails.

Reading: Bonsai 2 27B gives the most coherent, purposeful characters with a
working village, at guided on 16 GB and 24 GB cards and at free on a 4090.
Bonsai 2 9B makes the most happen (twice the interactions, many more
surprises) but less coherently (judge 3.1-3.4), and its villagers stood
outside in the raid. Raon-1 nano works at guided but wastes more turns and
reads flattest; the check's rails is right for it.

### Autonomy by domain: assisted, and Auto's profile (2026-11-21, evening)

The capability check v3 (10 items, each tagged with the decision it tests;
two new: shelter in a raid, eat when faint). Auto takes the preset from the
score and keeps in code the talk, danger, needs or temper domains whose items
it failed (never activity or plan: see below). Bonsai 2 9B: 5/10 (RTX 4090,
145 tokens/s; RTX 4070, 76) -> **assisted (temper in code)**; Bonsai 2 27B on
the 4070: 6/10, 26 tokens/s -> guided (danger in code).

Bonsai 2 9B, hearthvale's day, RTX 4090 (each run once):

| | guided | assisted | Auto, plans in code (dropped) | Auto: assisted (temper in code), RTX 4070 12 GB |
|---|---|---|---|---|
| model-chosen activities | 93% | 93% | 93% | 85% |
| self-started interactions (pairs) | 27 (14) | 24 (13) | 34 (7) | 21 (8) |
| plans / revised | 16 / 9 | 15 / 13 | 0 | 15 / 5 |
| surprises | 86 | 83 | 157 | 37 |
| wasted | 4% | 5% | 6% | 2% |
| ate / slept / hungry at the end | 8 / 7 / 1 | 8 / 7 / 0 | 8 / 7 / 0 | 8 / 7 / 0 |
| made / sales between characters | 11 / 9 | 9 / 4 | 0 / 1 | 11 / 9 |
| indoors during the night wolves | 64% | 79% | 90% | 96% |
| judge (coherence / personality / purpose / surprise) | 3.5 / 3.88 / 4.13 / 3.0 | 3.63 / 4.0 / 4.13 / 3.0 | 2.63 / 3.13 / 3.5 / 2.63 | 3.88 / 4.13 / 4.5 / 3.25 |

So danger and needs in code bring the raid and meals back without costing the
9B its liveliness; but its plans must stay its own: with plans in code (an
Auto rule since dropped: the plan item is a format test) its villagers talked
all day and made nothing. A first Auto run also showed code-run needs
fighting each other at night (bed cut off a meal, then bed and the starving
net took turns): fixed (starving eats first; a meal is not cut off by bed).

**12 GB, RTX 4070** (driver 580.82, Chrome 158, light graphics): Bonsai 2
27B at guided fits (peak 11.1 of 12.3 GB) and stays coherent (judge 4.13 /
4.13 / 4.63 / 3.25), but is too slow for eight characters in a 12-minute day:
picks 2.5-4.5 s, turns 9-16 s, 66 model calls (136 on a 4090), 5 of 8 ate,
two hungry at the end, 2 sales. Bonsai 2 9B on Auto on the same card: peak
5.3 GB, the working village in the table above. A first RTX 4070 host gave
garbled answers ("!!!!" and mixed scripts) for Bonsai and LiteRT alike: a
faulty card or host; the check now reports garbled answers in Running now.

Picks, now: **12 GB**: Bonsai 2 9B, Auto (assisted, temper in code); the 27B
at guided only for fewer characters or a longer day. **16 GB**: Bonsai 2 27B
at guided (the 4080 run above). **24 GB**: Bonsai 2 27B at guided, or free.

### Bonsai 2 27B at free on a 16 GB card (2026-11-22)

Same box, same tools, one after the other: a rented RTX 4080 Super 16 GB
(vast.ai, driver 610.57, Chrome 158, light graphics), hearthvale's day (12
real minutes, the player idle), `box-queue.sh` with graphics memory sampled
every 2 s. The 4090 free run above is the reference. (A first free attempt
died at start-up with the page closed, during the model's first download;
the run below is the retry.)

| | guided, 4080 S | free, 4080 S | free, 4080 S, again | free, 4090 (above) |
|---|---|---|---|---|
| model-chosen activities | 85% | 65% (code fills between turns) | 60% | 63% |
| self-started interactions (pairs) | 10 (4) | 16 (3) | 29 (7) | 25 (8) |
| plans / revised; notes (plan()) | 16 / 13 | - ; 12 | - ; 11 | - ; 12 |
| surprises | 16 | 1 | 1 | 6 |
| reply depth | 0.80 | 0.63 | 0.20 | 0.43 |
| wasted / safety nets | 1% / 14 | 5% / 2 | 7% / 17 | 8% / 16 |
| ate / slept at night / hungry at the end | 8 / 7 / 0 | 6 / 6 / **3** (jory, hector, wren) | 6 / 6 / 2 (hector, wren) | 8 / 7 / 1 |
| sales between characters | 3 | 8 | 12 | 10 |
| others indoors during the raid | 66% | 93% | 69% | 90% |
| model calls (a game hour) | 101 (4.2) | 77 (3.2) | 95 (4.0) | 118 (4.9) |
| a model turn: median (p10-p90, max) | 10.9 s (7.4-29.7, 35) | **7.4 s** (6.0-8.9, 11.4) | 7.4 s (6.2-9.0, 12.2) | 5.1 s |
| peak graphics memory, whole card | 11.3 GB | 11.1 GB | 11.0 GB | 11.1 GB |
| judge: coherence / personality / purpose / surprise | 4.0 / 3.88 / 4.38 / 3.38 | 3.88 / 3.75 / 4.5 / 2.75 | 3.5 / 3.75 / 4.38 / 2.75 | 4.0 / 4.25 / 4.75 / 3.13 |

Load from the cache 35-38 s (81 s the first time). Free on 16 GB **works but
is not as good as on a 4090, and not better than guided on the same card**:
turns are steady (7.4 s median, never over 12.2 s; guided's picks and plans
make some turns 30-35 s) and the village runs (sales 8-12, nobody starving),
but at 3-4 calls a game hour against the 4090's 4.9 the characters act less
often, the fighters of the night raid end hungry in both runs, and the judge
puts both free days below the guided day on the same card (coherence 3.5-3.88
vs 4.0, surprise 2.75 vs 3.38) and below the 4090's free day. Playable, as in
nothing breaks; not the recommended level: guided stays the 16 GB pick.

### Scenarios suited to free (2026-11-22, not measured yet)

Free's losses above are mostly scale and pace: eight villagers sharing one
slow brain in a 12-minute day, with needs and raids at once (3-5 calls a game
hour on 16 GB, the night raid's fighters ending hungry). Three worlds turn
those knobs the other way (the scenario skill's living.md, "Worlds made for
free"): 2-4 characters in one room, food in a chest by the pot and beds in
the same room, one simple job each, no threats, `"dayMinutes": 24`, one shared
problem and a private `agenda` and `secret` each, `"autonomy": "free"`.

| world | who | the problem | jobs |
|---|---|---|---|
| `free-two-by-the-hearth` | ada, bram (siblings) | the will: the cottage goes to whichever one the other names, by tomorrow's supper; she secretly owes the miller 40 gold, he hides mother's letter | cook, scholar |
| `free-flooded-ferry` | nell, corwin, ysolde | one passenger crosses at dawn; the ferrywoman secretly needs 25 gold for the rope, the merchant can pay, the healer cannot | innkeeper, merchant, healer |
| `free-snowbound-inn` | marta, pell, ines, aldo | the only map of the way down is gone (pell took it); the innkeeper secretly wants them stuck | innkeeper, merchant, scholar, healer |

The two-character cottage is the candidate for 12 GB cards and below (Bonsai
2 9B, Inkling's 6.6 GB drofn file): with two characters each gets about four
times the turns a hearthvale villager gets from the same brain. Its 12 GB
form: `{"preset": "free", "needs": "code"}`.

Checked without a brain (2026-11-22): the server checks pass (the
living-world rule for fresh worlds, "one room", would flag them, as it would
the goblin bakery); `tools/browser-test/scenario-smoke.mjs` (`?model=none`:
rails, code runs the day) plays each through a 2-minute day with no page
errors: everyone works (the cook makes stew, the scholar reads), and sleeps
at night.

To measure (a rented box, as `tools/cloud-gpu/box-queue.sh`; `--day-minutes`
must match the world's 24, live-eval otherwise uses 8; `--autonomy=` beats the
world's level, so guided is the comparison on the same world):

```bash
cd tools/browser-test; export CDP_PORT=9223 APPROVE_DOWNLOAD=1 READY_TIMEOUT=900
M=bonsai2-27b   # or bonsai2-9b, gemma4-e4b-litert; Inkling by --llm=<url> --llm-model=<name>
for w in free-two-by-the-hearth free-flooded-ferry free-snowbound-inn; do for lv in free guided; do
  bash ../cloud-gpu/chrome-restart.sh; sleep 3
  timeout 3600 node live-eval.mjs scenarios/$w.json --day --day-minutes=24 --model=$M --autonomy=$lv --label=$M-$lv
done; done
# the 12 GB form, on the small world (Auto, so the capability check runs: no --autonomy)
jq '.autonomy={"preset":"free","needs":"code"}' ../../scenarios/free-two-by-the-hearth.json > tmp/free-two-12gb.json
timeout 3600 node live-eval.mjs tools/browser-test/tmp/free-two-12gb.json --day --day-minutes=24 --model=bonsai2-9b --label=bonsai2-9b-12gb
node interest-report.mjs results/live-free-*.json
node judge.mjs results/live-free-*.json        # OpenRouter, JUDGE_BUDGET 2 dollars
```

Read beside hearthvale: model calls a game hour per character, self-started
interactions per pair, notes rewritten with plan(), hungry at the end, and
the judge's purposefulness and surprise against the same brain at guided.

## Bonsai 2.5 27B (2026-11-27)

**What Prism ML released (2026-11-24)**: `prism-ml/Ternary-Bonsai-2.5-27B-GGUF`
(revision `28a7093c`; also `Ternary-Bonsai-2.5-27B-mlx-2bit`), "the agentic
release of the Ternary Bonsai 27B line". Only a 27B: the 2B/4B/9B stay
Bonsai 2 (`Ternary-Bonsai-2-9B-gguf`, last changed 2026-11-04). Same
Qwen3.8-27B hybrid architecture (64 blocks, 3 linear : 1 full attention), same
ternary g128 format in the same Hadamard basis, 1.76 bits a weight. Files:
`PTQ1_0` 5.99 GB (ours), `PQ2_0` 7.25, `Q2_0` 7.67 (stock llama.cpp from
b11556), each also as `-mtp.gguf` with a multi-token-prediction draft head
(+0.24 GB, inert unless a runtime drafts; our engine does not), and the
`mmproj` vision files. Vendor claims (thinking at reasoning effort `xhigh`):
tool calling at FP16 level (5-benchmark mean 77.2 vs 77.7; Bonsai 2 67.0,
AppWorld 51.2 -> 90.5), agentic coding 90% of FP16 (SWE-bench Verified 60.8
-> 75.6, DeepSWE 0 -> 27), general capability 82.1 vs 81.6 (instruction
following down 82.6 -> 80.9), and 2.3-3x faster decode on NVIDIA in their
llama.cpp fork (MTP plus new CUDA kernels: nothing that reaches WebGPU).
Recommended sampling unchanged (instruct: 0.7 / 0.8 / top-k 20, presence
1.5; thinking 1.0 / 0.95 / 20). Reasoning efforts `xhigh` (default) or
`medium`. Sources: the model card, `PrismML-Eng/Bonsai-demo` (README,
MODEL-FORMATS.md, `bonsai-2-5-27b-whitepaper.pdf`). Not on OpenRouter yet
(only `prism-ml/ternary-bonsai-2-27b` and `-2-9b`), so the endpoint presets
stay on Bonsai 2; no new webml-community Space.

**The file against Bonsai 2's** (both GGUF headers read by range requests,
`Ternary-Bonsai-2-27B-gguf` revision `839bd570`): the same 851 tensors, the
same tokenizer (248,320 tokens), byte-identical chat template, identical
Hadamard metadata (block 1024, the same 28,672 signs) and RoPE sections; new
weights; the only format change is the 96 small `ssm_alpha`/`ssm_beta`
tensors, BF16 -> F32 (the 47 MB difference). webml-community's engine loads
F32, BF16 and F16 alike, so **it loads the new file unchanged**: only the
repo, file and revision changed in bonsai2.js.

**Measured** on one rented RTX 4080 16 GB (vast.ai, driver 595.99, Chrome
158, the game at light graphics unless noted), old and new one after the
other, a fresh Chrome for each:

| | Bonsai 2 27B | Bonsai 2.5 27B |
|---|---|---|
| sanity (Paris, 17 x 23, 17 sheep with thinking, a goblin haggling, a 150-word story) | all right; its goblin called the customer a goblin | all right, in character |
| first load (download + kernels) | 162 s (from R2) | 99 s (from Hugging Face, 66 s of it the download) |
| load from the cache | not measured (each 2.5 load deleted it: 152-200 s from R2 each time); 35-38 s on a 4080 S (2026-11-22) | 40-46 s |
| writing, the check's measure | 26.7 tokens/s | 26.3 tokens/s |
| reading a prompt (llm-sweep: 1,000 / 2,000 / 4,000 tokens) | 6.4 / 12.2 / 25.7 s | 6.3 / 12.1 / 25.5 s |
| graphics memory, model alone (8192 window) | 9.8-10.1 GB | 9.8-10.1 GB |
| peak with the game: hearthvale's day (light) / roles evals at high graphics | 11.3 / 10.45 GB | 11.3 / 10.46 GB |
| capability check v3 | 8/10 (missed steps, haggle) -> guided | 8/10 (missed sums, danger) -> guided, danger in code |
| the 36 evals (run-evals, RUNS=2) | 35/36 (commission a dagger 1/2) | **36/36** |

hearthvale's day at guided (12 real minutes, the player idle, one run each):

| | Bonsai 2 27B | Bonsai 2.5 27B |
|---|---|---|
| model-chosen activities | 89% | 90% |
| self-started interactions (pairs) | 19 (7) | 11 (4) |
| plans / revised | 9 / 3 | 9 / 8 |
| surprises | 23 | 22 |
| reply depth | 0.36 | 0.20 |
| wasted / safety nets | 7% / 10 | 6% / 9 |
| ate / slept at night / hungry at the end | 7 / 7 / 1 | 8 / 7 / 1 |
| sales between characters | 4 | 6 |
| others indoors during the raid | 75% | 91% |
| model calls (a game hour) | 94 (3.9) | 90 (3.7) |
| a model turn, median | 13.8 s | 14.0 s |
| judge: coherence / personality / purpose / surprise | 4.0 / 4.25 / 4.5 / 3.25 | 4.0 / 4.0 / 4.63 / 3.0 |

The free day on `free-two-by-the-hearth` (`--day-minutes=24 --autonomy=free`,
the first measured run of that world; the 9B on the same box for comparison):

| | Bonsai 2.5 27B | Bonsai 2 9B |
|---|---|---|
| model-chosen activities | 91% | 31% |
| self-started lines (one pair) | 27 | 25 |
| notes rewritten with plan() | 8 | 1 |
| surprises | 9 | 6 |
| reply depth | 0.43 | 0 |
| wasted / safety nets | 8% / 4 | 19% / 2 |
| ate / slept / hungry at the end | 2 / 2 / 0 | 2 / 2 / 0 |
| model calls (a game hour) | 119 (5.0) | 129 (5.4) |
| a model turn, median | 10.3 s | 3.6 s |
| peak graphics memory | 10.4 GB | 4.7 GB |
| judge: coherence / personality / purpose / surprise | **4.0 / 4.5 / 4.5 / 3.5** | 3.5 / 4.5 / 4.0 / 3.0 |

Reading: Bonsai 2.5 27B is a drop-in replacement: the same speed, memory and
load, at least as good on everything measured here (36/36 evals, the haggle to
45 now 2/2 twice; the check 8/10 like Bonsai 2's 8/10, sampled, so both near
the top of the band), its hearthvale guided day a working village (everyone
fed, 91% indoors in the raid) with judge scores level with Bonsai 2's (within
one run's noise), and the best free day measured so far on the two-sibling
world (judge 4.0 / 4.5 / 4.5 / 3.5: Ada pressing Bram about the will, Bram
keeping the letter back in his notes). The vendor's tool-calling gains do not
show as a jump in this game's single-command turns; nothing got worse. Picks
unchanged in shape: **16 GB** Bonsai 2.5 27B at guided (Auto gives guided with
danger in code); **free** is good for it on small worlds (2-4 characters,
`dayMinutes` 24) on 16 GB; on hearthvale-sized worlds guided stays the pick.
**12 GB**: the 9B on Auto stays the easy fit; its free day on the small world
is playable but thin (31% model-chosen, coherence 3.5). The memory-with-the-game
run (`memrun.sh`-style, roles at high graphics) hung at first because the
status line ended on the cache-removal message instead of "ready" (fixed:
that is a console line now).

Box: vast.ai RTX 4080 16 GB, about 4.7 hours rented (the run waited out an
agent pause), $1.46 in all including downloads; destroyed and checked by API.

