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

Status and traps: the maintainer skill's brains.md ("Breeze TTS 2 in the
browser").

## Speed (RTX 2060, 2026-10-31, an 8 s line)

| | backbone | depth decoder | vocoder | realtime |
|---|---|---|---|---|
| native Vulkan | 8.4 ms/frame | 28.7 | 4.9 | about 1.8x |
| native WebGPU, bundled ggml | 13.9 | 71.0 | 15.8 | about 0.73x |
| native WebGPU, ggml v0.28.0 | 13 | 63-66 | 7-15 | about 0.8x |
| Chrome, either ggml | | | | 0.61-0.62x, first sound 2.8-3 s |

GPU-bound (ggml's WebGPU profile: 8.7 s of GPU time for an 11 s run). The
depth decoder reruns its layers 15 times per frame, and the Q2_K
matrix-vector kernel (`mul_mat_vec_q2_K_f32_sg_reduce`) is 41% of GPU time,
quantizing its input to Q8 another 9%; turning that dot4 path off is slower
(92 ms/frame). ggml's Vulkan kernels do the same work about 2.3x faster. The
browser build gets no subgroup-matrix kernels (ggml leaves them out under
Emscripten), which is why native gained a little from the newer ggml and
Chrome did not. Profiling: build natively with `-DGGML_WEBGPU_GPU_PROFILE=ON`.
