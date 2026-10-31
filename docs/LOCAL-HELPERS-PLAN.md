# Plan: local helpers other people can use

Status 2026-10-31. Tablefolk itself runs in the browser. The pieces below run
beside it on the player's own computer (never on our host's GPU), and today
most of them only work on the maintainer's Linux machine because they live in
`~/.cache` or need a local build. This plan makes them installable by anyone.

## What exists and where it lives

| Piece | What it is | Where it is now | Works for others today? |
|---|---|---|---|
| Breeze TTS 2 server | HoppouAI's `breeze-server` (Breeze-TTS-2.cpp), Vulkan | v0.1.3 release binary on R2 (`breeze-tts-2/`); **patched v0.1.5 build only in `~/.cache/tablefolk-breeze/build/`** | Linux x64 only, via `tools/breeze-server.sh`, and without the memory patch |
| Breeze memory patch | `tools/breeze-server/te-cpu.patch`: text encoder on the CPU, 3.0 to 2.1 GB of graphics memory | in the repo; built by `tools/breeze-server/build.sh` | only if they can build C++ with Vulkan |
| Breeze model | `breeze-tts-2-q4_k-dd2.gguf` (2.46 GB), 37 parts, licence and NOTICE | R2 `breeze-tts-2/` | yes (downloaded by the script) |
| Breeze in the browser | `app/tts/breeze-web/` (WebAssembly + ggml WebGPU) | in the repo | only browsers with WebGPU `shader-f16` (not Chrome on Linux with NVIDIA); GPU speed unmeasured |
| llama.cpp server | `llama-server` b12015, Vulkan, for the endpoint brain | official release, downloaded by hand into `~/.cache/tablefolk-llm/` | no script |
| LFM3-1.7B (server) | `LFM3-1.7B-Q4_K_M.gguf` (1.1 GB) | Hugging Face, downloaded by hand | no script |
| LFM3-1.7B (browser) | `lfm3-1.7b-webgpu`, webml-community runtime from its HF Space (pinned) + the GGUF from HF | code in the repo, hidden model | yes for testers (`?model=lfm3-1.7b-webgpu`); depends on an HF Space staying up |
| Test-browser log guard | keeps headless Chrome's log from filling `/tmp` | `~/.cache/tablefolk-chromelog-guard.sh` | maintainer only |

## Goal

One step per platform for a player:

1. Open Tablefolk.
2. Optionally run one "Tablefolk helpers" download (Windows, macOS, Linux)
   that starts Breeze, and llama.cpp if the player wants a server-side brain.
3. The page finds the helpers by itself and picks what fits the graphics card.

## Work items

### 1. Breeze server for everyone (about 4-6 hours, mostly CI and testing)

- **Upstream the memory patch first.** Open a PR to HoppouAI/Breeze-TTS-2.cpp
  with `te-cpu.patch` as an option (`--te-cpu` / `BREEZE_TE_CPU`). If it is
  merged, we use their official Windows and Linux releases and stop building
  our own. If not, keep building ours (next item).
- **Our own builds (fallback):** a GitHub Actions workflow in this repo that
  checks out Breeze at a pinned tag, applies the patch and builds
  `breeze-server` for:
  - Linux x64 (Vulkan), as now;
  - Windows x64 (Vulkan, MSVC: v0.1.5 builds with MSVC);
  - macOS arm64: **new**. Breeze has no macOS build. ggml has a Metal backend,
    and Breeze picks "the GPU device" generically, so `-DGGML_METAL=ON`
    should work; needs a test on a Mac (and code signing or the "open
    anyway" step for an unsigned binary).
- Upload each build to R2 under `breeze-tts-2/server/<version>/<platform>/`
  with the Apache-2.0 licence, like the model. Ask first (R2 costs).
- **Model choice:** we mirror `q4_k-dd2` (2.46 GB, the smallest). HoppouAI
  calls `q4_k` (2.54 GB) "the smallest safe choice": the dd2 depth decoder
  dulls the high end on long passages. Decide whether to mirror `q4_k` too
  and make it the default.
- **Rebuild the in-browser Breeze on v0.1.5:** v0.1.4 replaced the
  transposed convolution with a matmul upstream, so half of
  `tools/breeze-web/portable-conv.patch` may no longer be needed.

### 2. Launch scripts per platform (about 2 hours)

- `tools/breeze-server.sh` (Linux) exists. Add `breeze-server.ps1` (Windows)
  and a macOS `.command` doing the same: download binary and model from R2
  with the parts and SHA-256 check, start on 127.0.0.1:8137 with `--cors`,
  the patch on.
- Same for llama.cpp: `tools/llama-server.sh` / `.ps1` / `.command`, from
  ggml-org's official release (they publish Windows, macOS and Linux builds)
  and the LFM3 GGUF, started with `-ngl 99 -c 8192 --jinja` on port 8080.
- Better than scripts for most players: **one small "Tablefolk helpers"
  app** that starts both, shows a tray icon and stops them on quit. Options:
  a single Go or Rust binary that downloads and supervises the two servers
  (about a day), or a script per platform (above) first and the app later.

### 3. The page finds the helpers (about 2-3 hours)

- Today the page reaches Breeze through the Tablefolk server
  (`/api/tts/breeze`), which only works when the player runs the Tablefolk
  server themselves. On tablefolk.world the page must talk to
  `http://127.0.0.1:8137` and `:8080` directly: both servers already send
  CORS headers, but Chrome asks the player for **local network access** the
  first time. Make that a deliberate "Use the helpers on this computer"
  button (one prompt, remembered), never a silent probe on page load.
- Then auto-pick: Breeze when it answers and the card has room
  (`freeGB`, already in the code), the LFM3 endpoint brain when llama.cpp
  answers and the card is small.

### 4. LFM3 as a real option (about 3-4 hours)

- **Fix its narration leak first:** it speaks its own planning aloud ("Say
  that she's hungry... Let me take care of her!") and sometimes acts wrongly.
  Try prompt changes for small models, or a short think-then-answer with
  the thoughts hidden. Re-run the evals (32/36 now, Gemma E2B 35/36).
- Mirror the LFM3 GGUF on R2 (licence LFM Open License 1.0: redistribution
  allowed with attribution and the licence; free for organisations under
  $10M revenue).
- The browser runtime is fetched from a Hugging Face Space at a pinned
  revision. It is Apache-2.0, so we may copy it into the repo or onto R2 so
  it cannot disappear (read the whole file before publishing it).
- Add an endpoint preset "LFM3 1.7B: llama.cpp on this computer".

### 5. Breeze in the browser on more machines (half a day to a day)

- Measure it on a machine whose Chrome has `shader-f16` (Windows with a
  recent GPU, or a Mac).
- Patch ggml's WebGPU shaders to run without `shader-f16` (compute in f32,
  read f16 scales with `unpack2x16float`), so Chrome on Linux with NVIDIA
  works too.
- Its memory: about 2.5 GB of model on the GPU. The text encoder could run
  in WebAssembly on the CPU here too (single-threaded, slower than native).

### 6. Test tooling (30 minutes)

- Move the log guard into `tools/browser-test/launch-chrome.sh`: write the
  headless Chrome's output to `~/.cache/tablefolk-test-chrome.log` (never
  `/tmp`, a RAM disk on the maintainer's machine) and cap its size.

## Licences to carry along

| Thing | Licence | What it needs |
|---|---|---|
| Breeze-TTS-2.cpp, `breeze-server` | Apache-2.0 | licence file beside binaries |
| Breeze TTS 2 weights | BreezeBlue Research and Non-Commercial | licence + NOTICE beside the model; **commercial use (incl. offering it in a paid product) needs RESONIA's permission** |
| llama.cpp | MIT | licence file |
| LFM3 weights | LFM Open License 1.0 | attribution + licence; free under $10M revenue |
| webml-community LFM3 runtime | Apache-2.0 | licence + NOTICE if we copy it |
| MediaPipe face detector | Apache-2.0 | already noted |

## Decisions for the maintainer

1. Upstream PR for the Breeze patch, or our own builds, or both?
2. Default Breeze model: keep `q4_k-dd2` or switch to `q4_k`?
3. Scripts per platform first, or go straight to a helpers app?
4. Is the macOS build worth it now (needs a Mac to test)?
5. How Breeze's non-commercial licence fits with logged-in or paid features
   later: probably keep it an opt-in helper the player installs, never
   something tablefolk.world serves.

## Rough order

1. Test-tool log guard (item 6), 30 min.
2. LFM3 narration fix and evals (item 4), 3-4 h.
3. Upstream PR + CI builds for Linux/Windows (item 1), 4-6 h.
4. Launch scripts (item 2), 2 h.
5. Page finds the helpers (item 3), 2-3 h.
6. macOS build and in-browser Breeze work (items 1, 5) as machines allow.
