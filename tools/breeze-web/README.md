# Breeze TTS 2 in the browser

HoppouAI/Breeze-TTS-2.cpp (ggml) compiled to WebAssembly with ggml's WebGPU
backend, so the same `breeze-tts-2-q4_k-dd2.gguf` mirrored on R2
(`breeze-tts-2/`) runs in the player's browser with no server.

Found (2026-10-30): nobody had done this (no ONNX, WebGPU or WASM build of
Breeze TTS 2 on Hugging Face or GitHub). Breeze's bundled ggml (2026-08-25)
has ggml-webgpu with Emscripten support (JSPI, Chrome 137+, Dawn's
emdawnwebgpu port).

## What the build needs (2026-10-31)

- **Breeze at 87b4366 (v0.1.6 work) or later.** Its vocoder writes the
  transposed convolution as a matmul and has no `ROLL`, the two ops
  ggml-webgpu lacks, so the old `portable-conv.patch` (for 2904b9a) is gone.
- **Current ggml** (v0.28.0, facdc44, 2026-10-28) in place of the one Breeze
  bundles (2026-08-25); `build.sh` checks it out inside `third_party/ggml`.
  Breeze builds against it unchanged. The bundled one has a WebGPU bug that
  llama.cpp #28382 fixed on 2026-09-12: a view into a block-quantized weight
  at an offset the browser's 256-byte binding alignment splits mid-block reads
  the wrong blocks. Breeze's depth decoder takes each codebook's head as such
  a view (Q2_K, 689,136 bytes apart), so only the first of the 15 depth codes
  came out right and the speech was static and fragments. Dawn on NVIDIA
  natively asks for a smaller alignment, which hid it there. (Backporting
  #28382 alone also worked; #29471 from the same period hung generation
  under JSPI.)
- `tf_breeze.cpp` is the interface the worker (`app/tts/breeze-web-worker.js`)
  calls. Two diagnostics, run by the worker on `debug_stages` / `debug_hash`
  messages: `tf_stages` (`debug-stages.hpp`: every stage on fixed inputs, as
  stats; the same header builds natively to compare) and `tf_hash_tensors`
  (every weight's hash as read back from the GPU).

`build.sh` builds it (emsdk in `~/.cache/tablefolk-build/emsdk`) into
`app/tts/breeze-web/`.

## Testing it

`tools/browser-test/breeze-web-test.html` (served by the Tablefolk server)
loads the worker alone, speaks a line and shows the backend, load time,
first audio and speed, and plays the result.

WebGPU needs `shader-f16`. Chrome turns it off on Linux with NVIDIA (Dawn's
`vulkan_enable_f16_on_nvidia` toggle is off by default). Start Chrome with
`--enable-dawn-features=vulkan_enable_f16_on_nvidia` and it is offered. The
test Chrome (`tools/browser-test/launch-chrome.sh`) does that. Windows (D3D12)
and Macs offer it already.

Native comparison: build Breeze with `-DGGML_WEBGPU=ON` against Google's
prebuilt Dawn (`v20260317.182325` matches this ggml; clang, since the Dawn
headers need C++20 under GCC) and run `breeze-cli` with the same line.

## Cloned voices: the `sum_rows` bug (2026-11-07)

Cloned voices came out with wrong words, shifting speakers and lines of 0 to 39 s, while designed
voices were fine. ggml's `sum_rows.wgsl` wrote `dst[offset + wid.x]`, but past WebGPU's 65,535 workgroups
a dimension ggml splits the dispatch over two, so rows overwrote each other and later ones were
never written. The audio embedding sums one row per codebook embedding, 2048 x frames, so any
reference clip over about 32 frames went wrong (values over 200x too big) and fed the whole prompt.
Fixed in `ggml-webgpu-fast.patch`. The bug came with llama.cpp ba6439a6 (2D dispatch, 2026-10-09); llama.cpp master has it fixed since 553d2c2e (2026-11-05), so a later ggml can drop that hunk. `cumsum.wgsl` still has the same line there (Breeze does not use it; not patched).

How it was found: `trace-clone.hpp` runs the same prompt and fixed frames through native and browser builds
and records every operation of every graph (`breeze-trace.patch` is its hook in `Graph::compute`);
`compare-trace.py a.tsv b.tsv` names the first operation that disagrees. Native side: `trace_main.cpp`, linked
against `build-vk`. Browser side: worker message `debug_trace`. An 8-frame stage test could not see this.

Library voices skip the browser's encoder: `build-voice-codes.mjs` encodes them natively into `assets/voices/breeze-codes/` (little-endian int16, 16 a frame; rerun it when a sample changes), and `pocket-tts-manager.js` sends them to the worker as `voice_codes`. Other voices still encode in the browser.

Not explained: the voice encoder's codes still match native only about 50-58% (99% in the first codebook, under 30%
in the last). Clones rate close to native anyway, and using native's codes didn't help before this fix;
not retested since.

Status and traps: the maintainer skill's brains.md ("Breeze TTS 2 in the
browser").

## Speed (RTX 2060, 2026-10-31, an 8 s line)

| | backbone | depth decoder | vocoder | realtime |
|---|---|---|---|---|
| native Vulkan | 8.4 ms/frame | 28.7 | 4.9 | about 1.8x |
| native WebGPU, bundled ggml | 13.9 | 71.0 | 15.8 | about 0.73x |
| native WebGPU, ggml v0.28.0 | 13 | 63-66 | 7-15 | about 0.8x |
| Chrome, either ggml | | | | 0.61-0.62x, first sound 2.8-3 s |

Those are the numbers before `ggml-webgpu-fast.patch`. **In Chrome it was not GPU-bound**,
whatever the native profile suggested. Profiled 2026-11-06 by wrapping every WebGPU call in the
worker: a frame (80 ms of audio) makes 6,183 dispatches, and each made its own bind group and
parameter write. About 115 ms a frame: 44 waiting on the GPU, 37 in WebGPU calls, the rest
in the browser and wasm (wasm itself about 10).

| RTX 2060, Chrome, nothing else on the card | speed | after first sound |
|---|---|---|
| stock | 0.70x | |
| bind groups kept, one parameter write a batch | 0.88x | same audio, sample for sample |
| + mat-vec workgroups of 64 (was 256) | 1.0-1.1x | |
| in the game, default graphics, uncapped frame rate | under 0.38x | |
| in the game, default graphics, 15 fps while Breeze speaks | 0.77x | about 1.0x, no underruns |

Tried, no real change: `disable_robustness` (none), `skip_validation` (about 5%), `disable_workgroup_init`
(none), submit batches of 16 to 256 (1024 is worse), `q4_k` (0.85x) and `q8_0-dd4` (0.83x) instead of
`q4_k-dd2` (0.88x). Workgroups of 128 give 1.0x, 32 give 1.0x. Round trips are not the problem (0.2 ms).

Workgroups of 64 make generation differ from run to run (256 is identical each time) and move
`bb.step` and later depth codes by up to 1.3%, about as far as native Vulkan is from WebGPU at 256. Not
explained. `tf_matvec_check` (worker message `debug_matvec`: the kernels against ggml's CPU code on the
model's own tensors, in place) finds no fault: 64 of 64 cases agree over repeats, same errors as 256.

Not tried: subgroup matrices. The Emscripten port here is Dawn v20260423, and Dawn added them for
Emscripten on 2026-08-11, but ggml still leaves them out under Emscripten. The first sound with a
cloned voice (about 3 s, about 1 s for a designed one) is the next thing to shorten.
Profiling: build natively with `-DGGML_WEBGPU_GPU_PROFILE=ON`.
